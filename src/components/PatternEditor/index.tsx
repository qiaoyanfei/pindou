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
  coordFromTouch,
  coordToCellIndex,
  revertPatternCellEdit,
  type GridCoord,
  type PatternCellEdit,
} from '@/utils/patternEdit'
import type { PatternConfig, PatternResult } from '@/types'
import './index.scss'

const CANVAS_ID = 'pattern-editor-canvas'
const TOOLBAR_HEIGHT = 72
const VIEW_PADDING = 16
const MAX_UNDO = 40
const DOUBLE_TAP_MS = 320
const TAP_MOVE_TOLERANCE = 14
const TAP_MAX_DURATION_MS = 280

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
    startX: 0,
    startY: 0,
    startTime: 0,
    lastTapTime: 0,
    lastTapX: 0,
    lastTapY: 0,
  })
  const refreshTokenRef = useRef(0)

  const [imageSrc, setImageSrc] = useState('')
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [selectedColorId, setSelectedColorId] = useState('')
  const [pickerVisible, setPickerVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [canUndo, setCanUndo] = useState(false)

  patternRef.current = pattern

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

  const refreshDisplay = useCallback(async () => {
    const token = refreshTokenRef.current + 1
    refreshTokenRef.current = token
    try {
      const tempFilePath = await canvasToTempFile(CANVAS_ID)
      if (token !== refreshTokenRef.current) return
      const info = await Taro.getImageInfo({ src: tempFilePath })
      if (token !== refreshTokenRef.current) return
      setImageSrc(tempFilePath)
      setImageSize({ width: info.width, height: info.height })
    } catch {
      if (token === refreshTokenRef.current) {
        Taro.showToast({ title: '图纸渲染失败', icon: 'none' })
      }
    } finally {
      if (token === refreshTokenRef.current) {
        setLoading(false)
      }
    }
  }, [])

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
          setLoading(false)
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
          setLoading(false)
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
    setLoading(true)
    await refreshDisplay()
  }, [fullRedraw, refreshDisplay])

  useEffect(() => {
    undoStackRef.current = []
    setCanUndo(false)
    selectionRef.current = null
    setSelectedColorId('')
    setPickerVisible(false)
    setImageSrc('')
    setImageSize({ width: 0, height: 0 })
    setLoading(true)
    const timer = setTimeout(() => initCanvas(), 80)
    return () => clearTimeout(timer)
  }, [pattern.width, pattern.height, cellPx, config.showGrid, config.showColorCode, initCanvas])

  const openCellEditorAt = (x: number, y: number) => {
    const coord = coordFromTouch(x, y, cellPx, patternRef.current)
    if (!coord) return
    const index = coordToCellIndex(patternRef.current, coord.col, coord.row)
    selectionRef.current = coord
    setSelectedColorId(patternRef.current.grid[index] ?? '')
    setPickerVisible(true)
  }

  const handleImageTouchStart = (event: { detail: { x: number; y: number } }) => {
    tapGestureRef.current.startX = event.detail.x
    tapGestureRef.current.startY = event.detail.y
    tapGestureRef.current.startTime = Date.now()
  }

  const handleImageTouchEnd = (event: { detail: { x: number; y: number } }) => {
    const gesture = tapGestureRef.current
    const duration = Date.now() - gesture.startTime
    if (duration > TAP_MAX_DURATION_MS) return

    const { x, y } = event.detail
    const moved = Math.hypot(x - gesture.startX, y - gesture.startY)
    if (moved > TAP_MOVE_TOLERANCE) return

    const now = Date.now()
    const isDoubleTap =
      now - gesture.lastTapTime < DOUBLE_TAP_MS
      && Math.hypot(x - gesture.lastTapX, y - gesture.lastTapY) < TAP_MOVE_TOLERANCE

    if (isDoubleTap) {
      tapGestureRef.current.lastTapTime = 0
      openCellEditorAt(x, y)
      return
    }

    tapGestureRef.current.lastTapTime = now
    tapGestureRef.current.lastTapX = x
    tapGestureRef.current.lastTapY = y
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
    setPickerVisible(false)
    await redrawAndRefresh()
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
        <Text className='pattern-editor__hint'>双击改色 · 双指缩放拖动</Text>
        <Text className='pattern-editor__meta'>
          {pattern.width}×{pattern.height}
        </Text>
      </View>

      <View
        className='pattern-editor__viewport'
        style={{ width: `${viewportWidth}px`, height: `${scrollHeight}px` }}
      >
        {loading && (
          <View className='pattern-editor__loading'>
            <Text>加载高清图...</Text>
          </View>
        )}

        {!loading && imageSrc && (
          <MovableArea
            className='pattern-editor__area'
            style={{ width: `${viewportWidth}px`, height: `${scrollHeight}px` }}
          >
            <MovableView
              key={`${pattern.width}x${pattern.height}-${imageSrc}`}
              className='pattern-editor__content'
              direction='all'
              inertia
              scale
              scaleMin={0.2}
              scaleMax={4}
              scaleValue={initialScale}
              x={initialPosition.x}
              y={initialPosition.y}
              style={{
                width: `${imageSize.width}px`,
                height: `${imageSize.height}px`,
              }}
            >
              <Image
                className='pattern-editor__image'
                src={imageSrc}
                style={{
                  width: `${imageSize.width}px`,
                  height: `${imageSize.height}px`,
                }}
                showMenuByLongpress={false}
                onTouchStart={handleImageTouchStart}
                onTouchEnd={handleImageTouchEnd}
              />
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
