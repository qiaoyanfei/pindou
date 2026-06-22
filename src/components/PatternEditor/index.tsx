import { View, Text, Canvas, Image, MovableArea, MovableView } from '@tarojs/components'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import ColorPickerSheet from '@/components/ColorPickerSheet'
import {
  getEditHdCellPx,
  paintCellSelectionOutline,
  paintPatternGrid,
} from '@/services/patternRenderer'
import { canvasToTempFile } from '@/utils/canvas'
import {
  applyPatternCellEdit,
  coordFromTouchNearest,
  coordToCellIndex,
  revertPatternCellEdit,
  type GridCoord,
  type PatternCellEdit,
} from '@/utils/patternEdit'
import type { PatternConfig, PatternResult } from '@/types'
import './index.scss'

const CANVAS_ID = 'pattern-editor-canvas'
const IMAGE_WRAP_ID = 'pattern-editor-image-wrap'
const TOOLBAR_HEIGHT = 72
const VIEW_PADDING = 16
const MAX_UNDO = 40
const DOUBLE_TAP_MS = 450
const TAP_MOVE_TOLERANCE = 16
const DOUBLE_TAP_SCREEN_TOLERANCE = 40

interface ScreenTouch {
  clientX: number
  clientY: number
}

interface PatternEditorProps {
  pattern: PatternResult
  config: PatternConfig
  onPatternChange: (pattern: PatternResult) => void
}

type CanvasNode = {
  getContext: (type: '2d') => CanvasRenderingContext2D | null
  width: number
  height: number
}

export default function PatternEditor({
  pattern,
  config,
  onPatternChange,
}: PatternEditorProps) {
  const sys = Taro.getWindowInfo()
  const viewportWidth = sys.windowWidth
  const viewportHeight = sys.windowHeight

  const scrollHeight = useMemo(() => {
    const menu = Taro.getMenuButtonBoundingClientRect()
    const navHeight = menu.top + menu.height + 8
    return viewportHeight - navHeight - TOOLBAR_HEIGHT
  }, [viewportHeight])

  const cellPx = useMemo(
    () => getEditHdCellPx(pattern, config.exportCellPx),
    [pattern.width, pattern.height, config.exportCellPx],
  )

  const canvasWidth = pattern.width * cellPx
  const canvasHeight = pattern.height * cellPx

  const paintOptions = useMemo(
    () => ({
      cellPx,
      showGrid: config.showGrid,
      showColorCode: config.showColorCode && cellPx >= 10,
      minCellPxForLabel: 10,
    }),
    [cellPx, config.showGrid, config.showColorCode],
  )

  const canvasRef = useRef<CanvasNode | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const patternRef = useRef(pattern)
  const selectionRef = useRef<GridCoord | null>(null)
  const undoStackRef = useRef<PatternCellEdit[]>([])
  const tapGestureRef = useRef({
    lastTapTime: 0,
    lastClientX: 0,
    lastClientY: 0,
    touchStartClientX: 0,
    touchStartClientY: 0,
  })
  const refreshTokenRef = useRef(0)
  const lastTapEventRef = useRef(0)
  const imageSizeRef = useRef({ width: 0, height: 0 })
  const imageSrcRef = useRef('')
  const preloadPendingRef = useRef<{ src: string; width: number; height: number } | null>(null)
  /** 首次挂载时的默认视口 */
  const viewportInitRef = useRef<{ scale: number; x: number; y: number } | null>(null)
  /** 当前视口（手势实时写入 ref，改色后重渲染时恢复） */
  const viewportLiveRef = useRef({ scale: 1, x: 0, y: 0 })

  const [imageSrc, setImageSrc] = useState('')
  const [preloadSrc, setPreloadSrc] = useState('')
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [selectedColorId, setSelectedColorId] = useState('')
  const [pickerVisible, setPickerVisible] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [canUndo, setCanUndo] = useState(false)

  patternRef.current = pattern
  imageSizeRef.current = imageSize

  const initialScale = useMemo(() => {
    if (!imageSize.width) return 1
    const horizontalFit = (viewportWidth - VIEW_PADDING) / imageSize.width
    const verticalFit = (scrollHeight - VIEW_PADDING) / imageSize.height
    return Math.max(0.2, Math.min(horizontalFit, verticalFit))
  }, [viewportWidth, scrollHeight, imageSize])

  const initialPosition = useMemo(() => {
    if (!imageSize.width) return { x: 0, y: 0 }
    const scaledW = imageSize.width * initialScale
    const scaledH = imageSize.height * initialScale
    return {
      x: Math.max(0, Math.round((viewportWidth - scaledW) / 2)),
      y: Math.max(0, Math.round((scrollHeight - scaledH) / 2)),
    }
  }, [imageSize, initialScale, viewportWidth, scrollHeight])

  const fullRedraw = useCallback((node: CanvasNode, nextPattern: PatternResult, selection: GridCoord | null) => {
    node.width = canvasWidth
    node.height = canvasHeight
    const ctx = node.getContext('2d')
    if (!ctx) return null

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    paintPatternGrid(ctx, nextPattern, paintOptions)
    if (selection) {
      paintCellSelectionOutline(ctx, selection.col, selection.row, cellPx)
    }
    return ctx
  }, [canvasWidth, canvasHeight, cellPx, paintOptions])

  const applyImageSize = useCallback((width: number, height: number) => {
    const prev = imageSizeRef.current
    if (prev.width === width && prev.height === height) return
    const next = { width, height }
    imageSizeRef.current = next
    setImageSize(next)
  }, [])

  const commitDisplayImage = useCallback((src: string, width: number, height: number) => {
    imageSrcRef.current = src
    setImageSrc(src)
    applyImageSize(width, height)
  }, [applyImageSize])

  const handlePreloadLoad = useCallback(() => {
    const pending = preloadPendingRef.current
    if (!pending) return
    preloadPendingRef.current = null
    commitDisplayImage(pending.src, pending.width, pending.height)
    setPreloadSrc('')
  }, [commitDisplayImage])

  const refreshDisplay = useCallback(async (silent = false) => {
    const token = refreshTokenRef.current + 1
    refreshTokenRef.current = token
    preloadPendingRef.current = null
    setPreloadSrc('')
    try {
      const tempFilePath = await canvasToTempFile(CANVAS_ID)
      if (token !== refreshTokenRef.current) return
      const info = await Taro.getImageInfo({ src: tempFilePath })
      if (token !== refreshTokenRef.current) return

      if (!imageSrcRef.current) {
        commitDisplayImage(tempFilePath, info.width, info.height)
        return
      }

      if (tempFilePath === imageSrcRef.current) return

      preloadPendingRef.current = {
        src: tempFilePath,
        width: info.width,
        height: info.height,
      }
      setPreloadSrc(tempFilePath)
      setTimeout(() => {
        if (token !== refreshTokenRef.current) return
        const pending = preloadPendingRef.current
        if (!pending || pending.src !== tempFilePath) return
        preloadPendingRef.current = null
        commitDisplayImage(pending.src, pending.width, pending.height)
        setPreloadSrc('')
      }, 120)
    } catch {
      if (token === refreshTokenRef.current && !silent) {
        Taro.showToast({ title: '图纸渲染失败', icon: 'none' })
      }
    } finally {
      if (token === refreshTokenRef.current) {
        setInitialLoading(false)
      }
    }
  }, [commitDisplayImage])

  const initCanvas = useCallback(async (retry = 0) => {
    Taro.createSelectorQuery()
      .select(`#${CANVAS_ID}`)
      .fields({ node: true, size: true })
      .exec(async (res) => {
        const node = res?.[0]?.node as CanvasNode | undefined
        if (!node) {
          if (retry < 12) {
            setTimeout(() => initCanvas(retry + 1), 150)
            return
          }
          Taro.showToast({ title: '画布加载失败', icon: 'none' })
          setInitialLoading(false)
          return
        }

        canvasRef.current = node
        const ctx = fullRedraw(node, patternRef.current, selectionRef.current)
        if (!ctx) {
          if (retry < 12) {
            setTimeout(() => initCanvas(retry + 1), 150)
            return
          }
          Taro.showToast({ title: '画布加载失败', icon: 'none' })
          setInitialLoading(false)
          return
        }
        ctxRef.current = ctx
        await refreshDisplay()
      })
  }, [fullRedraw, refreshDisplay])

  const redrawAndRefresh = useCallback(async () => {
    const node = canvasRef.current
    if (!node) return
    const ctx = fullRedraw(node, patternRef.current, selectionRef.current)
    if (!ctx) return
    ctxRef.current = ctx
    await refreshDisplay(true)
  }, [fullRedraw, refreshDisplay])

  useEffect(() => {
    undoStackRef.current = []
    setCanUndo(false)
    selectionRef.current = null
    setSelectedColorId('')
    setPickerVisible(false)
    setImageSrc('')
    setPreloadSrc('')
    preloadPendingRef.current = null
    imageSrcRef.current = ''
    setImageSize({ width: 0, height: 0 })
    imageSizeRef.current = { width: 0, height: 0 }
    viewportInitRef.current = null
    viewportLiveRef.current = { scale: 1, x: 0, y: 0 }
    setInitialLoading(true)
    const timer = setTimeout(() => initCanvas(), 80)
    return () => clearTimeout(timer)
  }, [pattern.width, pattern.height, cellPx, config.showGrid, config.showColorCode, initCanvas])

  const resolveLogicalPoint = useCallback((touch: ScreenTouch): Promise<{ x: number; y: number } | null> => {
    return new Promise((resolve) => {
      Taro.createSelectorQuery()
        .select(`#${IMAGE_WRAP_ID}`)
        .boundingClientRect((rect) => {
          const box = rect as { left: number; top: number; width: number; height: number } | null
          const size = imageSizeRef.current
          if (!box?.width || !box.height || !size.width || !size.height) {
            resolve(null)
            return
          }

          const localX = touch.clientX - box.left
          const localY = touch.clientY - box.top
          if (localX < 0 || localY < 0 || localX > box.width || localY > box.height) {
            resolve(null)
            return
          }

          resolve({
            x: localX * size.width / box.width,
            y: localY * size.height / box.height,
          })
        })
        .exec()
    })
  }, [])

  const openCellEditorAt = useCallback((x: number, y: number) => {
    const size = imageSizeRef.current
    const touchCellPx = size.width > 0
      ? size.width / patternRef.current.width
      : cellPx
    const coord = coordFromTouchNearest(x, y, touchCellPx, patternRef.current)
    if (!coord) return
    const index = coordToCellIndex(patternRef.current, coord.col, coord.row)
    selectionRef.current = coord
    setSelectedColorId(patternRef.current.grid[index] ?? '')
    setPickerVisible(true)
  }, [cellPx])

  const handleScreenTap = useCallback((touch: ScreenTouch) => {
    if (
      typeof touch.clientX !== 'number'
      || typeof touch.clientY !== 'number'
      || Number.isNaN(touch.clientX)
      || Number.isNaN(touch.clientY)
    ) {
      return
    }

    const now = Date.now()
    if (now - lastTapEventRef.current < 80) return
    lastTapEventRef.current = now

    const gesture = tapGestureRef.current
    const isDoubleTap =
      now - gesture.lastTapTime < DOUBLE_TAP_MS
      && Math.hypot(
        touch.clientX - gesture.lastClientX,
        touch.clientY - gesture.lastClientY,
      ) < DOUBLE_TAP_SCREEN_TOLERANCE

    if (isDoubleTap) {
      tapGestureRef.current.lastTapTime = 0
      void resolveLogicalPoint(touch).then((point) => {
        if (point) openCellEditorAt(point.x, point.y)
      })
      return
    }

    tapGestureRef.current.lastTapTime = now
    tapGestureRef.current.lastClientX = touch.clientX
    tapGestureRef.current.lastClientY = touch.clientY
  }, [openCellEditorAt, resolveLogicalPoint])

  const readScreenTouch = (touch: {
    clientX?: number
    clientY?: number
    x?: number
    y?: number
  }): ScreenTouch | null => {
    const clientX = touch.clientX ?? touch.x
    const clientY = touch.clientY ?? touch.y
    if (typeof clientX !== 'number' || typeof clientY !== 'number') return null
    return { clientX, clientY }
  }

  const handleWrapTouchStart = (event: {
    touches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
  }) => {
    const touch = readScreenTouch(event.touches?.[0] ?? {})
    if (!touch) return
    tapGestureRef.current.touchStartClientX = touch.clientX
    tapGestureRef.current.touchStartClientY = touch.clientY
  }

  const handleWrapTouchEnd = (event: {
    changedTouches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
    touches?: Array<unknown>
  }) => {
    if ((event.touches?.length ?? 0) > 0) return
    if (event.changedTouches?.length !== 1) return
    const touch = readScreenTouch(event.changedTouches[0])
    if (!touch) return

    const moved = Math.hypot(
      touch.clientX - tapGestureRef.current.touchStartClientX,
      touch.clientY - tapGestureRef.current.touchStartClientY,
    )
    if (moved > TAP_MOVE_TOLERANCE) return
    handleScreenTap(touch)
  }

  if (imageSize.width && !viewportInitRef.current) {
    const init = {
      scale: initialScale,
      x: initialPosition.x,
      y: initialPosition.y,
    }
    viewportInitRef.current = init
    viewportLiveRef.current = init
  }

  const viewportInit = viewportInitRef.current
  const showViewport = Boolean(imageSrc && !initialLoading && viewportInit)
  const viewportLive = viewportLiveRef.current

  const handleViewChange = (event: { detail: { x: number; y: number } }) => {
    viewportLiveRef.current.x = event.detail.x
    viewportLiveRef.current.y = event.detail.y
  }

  const handleViewScale = (event: { detail: { scale: number } }) => {
    viewportLiveRef.current.scale = event.detail.scale
  }

  const pushUndo = (edit: PatternCellEdit) => {
    undoStackRef.current.push(edit)
    if (undoStackRef.current.length > MAX_UNDO) {
      undoStackRef.current.shift()
    }
    setCanUndo(true)
  }

  const handleUndo = async () => {
    if (!canUndo) return
    const edit = undoStackRef.current.pop()
    if (!edit) {
      setCanUndo(false)
      return
    }

    const nextPattern = revertPatternCellEdit(patternRef.current, edit)
    patternRef.current = nextPattern
    onPatternChange(nextPattern)
    setCanUndo(undoStackRef.current.length > 0)
    await redrawAndRefresh()
  }

  const handleColorSelect = async (colorId: string) => {
    const cell = selectionRef.current
    if (!cell) return
    const index = coordToCellIndex(patternRef.current, cell.col, cell.row)
    const prevColorId = patternRef.current.grid[index]
    if (prevColorId === colorId) {
      setPickerVisible(false)
      return
    }

    const edit: PatternCellEdit = { index, prevColorId, nextColorId: colorId }
    const nextPattern = applyPatternCellEdit(patternRef.current, edit)
    patternRef.current = nextPattern
    pushUndo(edit)
    onPatternChange(nextPattern)
    await redrawAndRefresh()
    setPickerVisible(false)
  }

  return (
    <View className='pattern-editor pattern-editor--fullscreen'>
      <View className='pattern-editor__toolbar'>
        <Text
          className={`pattern-editor__action${canUndo ? '' : ' pattern-editor__action--disabled'}`}
          onClick={() => { void handleUndo() }}
        >
          撤销
        </Text>
        <Text className='pattern-editor__hint'>双击改色 · 可放大拖动</Text>
        <Text className='pattern-editor__meta'>
          {pattern.width}×{pattern.height}
        </Text>
      </View>

      <View
        className='pattern-editor__viewport'
        style={{ width: `${viewportWidth}px`, height: `${scrollHeight}px` }}
      >
        {initialLoading && (
          <View className='pattern-editor__loading'>
            <Text>加载高清图...</Text>
          </View>
        )}

        {showViewport && (
          <MovableArea
            className='pattern-editor__area'
            style={{ width: `${viewportWidth}px`, height: `${scrollHeight}px` }}
          >
            <MovableView
              key={`${pattern.width}x${pattern.height}-${cellPx}`}
              className='pattern-editor__content'
              direction='all'
              inertia
              scale
              scaleMin={0.2}
              scaleMax={4}
              scaleValue={viewportLive.scale}
              x={viewportLive.x}
              y={viewportLive.y}
              style={{
                width: `${imageSize.width}px`,
                height: `${imageSize.height}px`,
              }}
              onChange={handleViewChange}
              onScale={handleViewScale}
            >
              <View
                id={IMAGE_WRAP_ID}
                className='pattern-editor__image-wrap'
                style={{
                  width: `${imageSize.width}px`,
                  height: `${imageSize.height}px`,
                }}
                onTouchStart={handleWrapTouchStart}
                onTouchEnd={handleWrapTouchEnd}
              >
                {preloadSrc ? (
                  <Image
                    className='pattern-editor__image pattern-editor__image--preload'
                    src={preloadSrc}
                    style={{
                      width: `${imageSize.width}px`,
                      height: `${imageSize.height}px`,
                    }}
                    showMenuByLongpress={false}
                    onLoad={handlePreloadLoad}
                  />
                ) : null}
                <Image
                  className='pattern-editor__image'
                  src={imageSrc}
                  style={{
                    width: `${imageSize.width}px`,
                    height: `${imageSize.height}px`,
                  }}
                  showMenuByLongpress={false}
                />
              </View>
            </MovableView>
          </MovableArea>
        )}
      </View>

      <View className='pattern-editor__canvas-host'>
        <Canvas
          type='2d'
          id={CANVAS_ID}
          canvasId={CANVAS_ID}
          className='pattern-editor__canvas'
          style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
        />
      </View>

      {pickerVisible && (
        <ColorPickerSheet
          visible={pickerVisible}
          pattern={pattern}
          currentColorId={selectedColorId}
          onSelect={(colorId) => { void handleColorSelect(colorId) }}
          onClose={() => setPickerVisible(false)}
        />
      )}
    </View>
  )
}
