import { View, Text, Canvas } from '@tarojs/components'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import ColorPickerSheet from '@/components/ColorPickerSheet'
import EditorViewport, { type CellHighlight, type ViewportTransform } from '@/components/PatternEditor/EditorViewport'
import {
  getEditHdCellPx,
  paintCellSelectionOutline,
  paintPatternGrid,
} from '@/services/patternRenderer'
import { canvasToTempFile } from '@/utils/canvas'
import { PATTERN_EMPTY_CELL } from '@/utils/constants'
import {
  applyPatternCellsReplace,
  applyPatternCellEdit,
  cellIndexToCoord,
  coordFromTouchNearest,
  coordToCellIndex,
  getIndicesWithColor,
  revertPatternEdit,
  type GridCoord,
  type PatternUndoEntry,
} from '@/utils/patternEdit'
import type { PatternConfig, PatternResult } from '@/types'
import './index.scss'

const CANVAS_ID = 'pattern-editor-canvas'
const VIEWPORT_AREA_ID = 'pattern-editor-viewport-area'
const VIEW_PADDING = 16
const MAX_UNDO = 40
const DOUBLE_TAP_MS = 450
const TAP_MOVE_TOLERANCE = 16
const DOUBLE_TAP_SCREEN_TOLERANCE = 40
const PRELOAD_COMMIT_FALLBACK_MS = 150

function formatEditColorLabel(colorId: string): string {
  return colorId === PATTERN_EMPTY_CELL ? '空白格' : colorId
}

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

  const [frameHeight, setFrameHeight] = useState(0)

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
  const selectedIndicesRef = useRef<Set<number>>(new Set())
  const isPickingCellsRef = useRef(false)
  const pickerVisibleRef = useRef(false)
  const undoStackRef = useRef<PatternUndoEntry[]>([])
  const tapGestureRef = useRef({
    lastTapTime: 0,
    lastClientX: 0,
    lastClientY: 0,
    touchStartClientX: 0,
    touchStartClientY: 0,
    blockPan: false,
  })
  const refreshTokenRef = useRef(0)
  const lastTapEventRef = useRef(0)
  const imageSizeRef = useRef({ width: 0, height: 0 })
  const imageSrcRef = useRef('')
  const lastGoodImageSrcRef = useRef('')
  const preloadPendingRef = useRef<{
    src: string
    width: number
    height: number
    preserveViewport: boolean
  } | null>(null)
  const displayCommitWaiterRef = useRef<(() => void) | null>(null)
  const viewportInitRef = useRef<{ scale: number; x: number; y: number } | null>(null)
  const viewportLiveRef = useRef<ViewportTransform>({ scale: 1, x: 0, y: 0 })
  const viewportLockedRef = useRef(false)

  const [imageSrc, setImageSrc] = useState('')
  const [preloadSrc, setPreloadSrc] = useState('')
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [viewport, setViewport] = useState<ViewportTransform>({ scale: 1, x: 0, y: 0 })
  const [viewportReady, setViewportReady] = useState(false)
  const [pickingHighlights, setPickingHighlights] = useState<CellHighlight[]>([])
  const [selectedColorId, setSelectedColorId] = useState('')
  const [pickerVisible, setPickerVisible] = useState(false)
  const [isPickingCells, setIsPickingCells] = useState(false)
  const [selectionCount, setSelectionCount] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)
  const [canUndo, setCanUndo] = useState(false)

  patternRef.current = pattern
  imageSizeRef.current = imageSize
  isPickingCellsRef.current = isPickingCells
  pickerVisibleRef.current = pickerVisible

  const measureViewportFrame = useCallback(() => {
    Taro.createSelectorQuery()
      .select('#pattern-editor-viewport-frame')
      .boundingClientRect((rect) => {
        const box = rect as { height: number } | null
        if (box?.height) {
          setFrameHeight(Math.round(box.height))
        }
      })
      .exec()
  }, [])

  const syncSelectionCount = useCallback(() => {
    setSelectionCount(selectedIndicesRef.current.size)
  }, [])

  const syncSelectionHighlights = useCallback(() => {
    const shouldShow = isPickingCellsRef.current || pickerVisibleRef.current
    if (!shouldShow || selectedIndicesRef.current.size === 0) {
      setPickingHighlights([])
      return
    }
    setPickingHighlights(
      [...selectedIndicesRef.current].map((index) => ({
        index,
        ...cellIndexToCoord(patternRef.current, index),
      })),
    )
  }, [])

  useEffect(() => {
    syncSelectionHighlights()
  }, [pickerVisible, isPickingCells, selectionCount, syncSelectionHighlights])

  const commitViewportState = useCallback((next?: ViewportTransform) => {
    const merged = next ?? { ...viewportLiveRef.current }
    viewportLiveRef.current = merged
    setViewport(merged)
  }, [])

  const clearSelection = useCallback(() => {
    selectedIndicesRef.current.clear()
    syncSelectionCount()
    syncSelectionHighlights()
  }, [syncSelectionHighlights, syncSelectionCount])

  const fullRedraw = useCallback((
    node: CanvasNode,
    nextPattern: PatternResult,
    highlightIndices: Set<number> | null,
  ) => {
    node.width = canvasWidth
    node.height = canvasHeight
    const ctx = node.getContext('2d')
    if (!ctx) return null

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    paintPatternGrid(ctx, nextPattern, paintOptions)
    if (highlightIndices?.size) {
      for (const index of highlightIndices) {
        const { col, row } = cellIndexToCoord(nextPattern, index)
        paintCellSelectionOutline(ctx, col, row, cellPx)
      }
    }
    return ctx
  }, [canvasWidth, canvasHeight, cellPx, paintOptions])

  const initialScale = useMemo(() => {
    if (!imageSize.width || !frameHeight) return 1
    const horizontalFit = (viewportWidth - VIEW_PADDING) / imageSize.width
    const verticalFit = (frameHeight - VIEW_PADDING) / imageSize.height
    return Math.max(0.2, Math.min(horizontalFit, verticalFit))
  }, [viewportWidth, frameHeight, imageSize])

  const initialPosition = useMemo(() => {
    if (!imageSize.width || !frameHeight) return { x: 0, y: 0 }
    const scaledW = imageSize.width * initialScale
    const scaledH = imageSize.height * initialScale
    return {
      x: Math.max(0, Math.round((viewportWidth - scaledW) / 2)),
      y: Math.max(0, Math.round((frameHeight - scaledH) / 2)),
    }
  }, [imageSize, initialScale, viewportWidth, frameHeight])

  const applyImageSize = useCallback((width: number, height: number) => {
    const prev = imageSizeRef.current
    if (prev.width === width && prev.height === height) return
    const next = { width, height }
    imageSizeRef.current = next
    setImageSize(next)
  }, [])

  const commitDisplayImage = useCallback((src: string, width: number, height: number) => {
    if (!src) return
    imageSrcRef.current = src
    lastGoodImageSrcRef.current = src
    setImageSrc(src)
    applyImageSize(width, height)
  }, [applyImageSize])

  const resolveDisplayCommitWaiter = useCallback(() => {
    const resolve = displayCommitWaiterRef.current
    displayCommitWaiterRef.current = null
    resolve?.()
  }, [])

  const finalizeImageCommit = useCallback(async (
    src: string,
    width: number,
    height: number,
  ) => {
    commitDisplayImage(src, width, height)
  }, [commitDisplayImage])

  const cancelPreload = useCallback(() => {
    preloadPendingRef.current = null
    setPreloadSrc('')
    resolveDisplayCommitWaiter()
  }, [resolveDisplayCommitWaiter])

  const handlePreloadLoad = useCallback(() => {
    const pending = preloadPendingRef.current
    if (!pending) return
    preloadPendingRef.current = null
    void finalizeImageCommit(
      pending.src,
      pending.width,
      pending.height,
    ).then(() => {
      setPreloadSrc('')
      resolveDisplayCommitWaiter()
    })
  }, [finalizeImageCommit, resolveDisplayCommitWaiter])

  const handlePreloadError = useCallback(() => {
    preloadPendingRef.current = null
    setPreloadSrc('')
    resolveDisplayCommitWaiter()
  }, [resolveDisplayCommitWaiter])

  const handleDisplayImageError = useCallback(() => {
    const fallback = lastGoodImageSrcRef.current
    if (!fallback || fallback === imageSrcRef.current) return
    imageSrcRef.current = fallback
    setImageSrc(fallback)
  }, [])

  const queueDisplayImage = useCallback((
    src: string,
    width: number,
    height: number,
    token: number,
    preserveViewport = false,
  ): Promise<void> => {
    return new Promise((resolve) => {
      if (!imageSrcRef.current) {
        commitDisplayImage(src, width, height)
        resolve()
        return
      }

      if (src === imageSrcRef.current) {
        resolve()
        return
      }

      displayCommitWaiterRef.current = resolve
      preloadPendingRef.current = { src, width, height, preserveViewport }
      setPreloadSrc(src)

      setTimeout(() => {
        if (token !== refreshTokenRef.current) {
          resolveDisplayCommitWaiter()
          return
        }
        const pending = preloadPendingRef.current
        if (!pending || pending.src !== src) {
          resolveDisplayCommitWaiter()
          return
        }
        preloadPendingRef.current = null
        void finalizeImageCommit(
          pending.src,
          pending.width,
          pending.height,
        ).then(() => {
          setPreloadSrc('')
          resolveDisplayCommitWaiter()
        })
      }, PRELOAD_COMMIT_FALLBACK_MS)
    })
  }, [commitDisplayImage, finalizeImageCommit, resolveDisplayCommitWaiter])

  const refreshDisplay = useCallback(async (silent = false, preserveViewport = false) => {
    const token = refreshTokenRef.current + 1
    refreshTokenRef.current = token
    cancelPreload()
    try {
      const tempFilePath = await canvasToTempFile(CANVAS_ID)
      if (token !== refreshTokenRef.current) return
      const info = await Taro.getImageInfo({ src: tempFilePath })
      if (token !== refreshTokenRef.current) return
      await queueDisplayImage(tempFilePath, info.width, info.height, token, preserveViewport)
    } catch {
      if (token === refreshTokenRef.current && !silent) {
        Taro.showToast({ title: '图纸渲染失败', icon: 'none' })
      }
    } finally {
      if (token === refreshTokenRef.current) {
        setInitialLoading(false)
      }
    }
  }, [cancelPreload, queueDisplayImage])

  const refreshSelectionOverlay = useCallback(async (preserveViewport = false) => {
    const node = canvasRef.current
    if (!node) return
    const highlights = selectedIndicesRef.current.size > 0
      ? selectedIndicesRef.current
      : null
    const ctx = fullRedraw(node, patternRef.current, highlights)
    if (!ctx) return
    ctxRef.current = ctx
    await refreshDisplay(true, preserveViewport)
  }, [fullRedraw, refreshDisplay])

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
        const ctx = fullRedraw(node, patternRef.current, null)
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

  const redrawAndRefresh = useCallback(async (preserveViewport = false) => {
    const node = canvasRef.current
    if (!node) return
    const ctx = fullRedraw(node, patternRef.current, null)
    if (!ctx) return
    ctxRef.current = ctx
    await refreshDisplay(true, preserveViewport)
  }, [fullRedraw, refreshDisplay])

  useEffect(() => {
    undoStackRef.current = []
    setCanUndo(false)
    selectionRef.current = null
    clearSelection()
    setIsPickingCells(false)
    setSelectedColorId('')
    setPickerVisible(false)
    setImageSrc('')
    setPreloadSrc('')
    preloadPendingRef.current = null
    imageSrcRef.current = ''
    lastGoodImageSrcRef.current = ''
    setImageSize({ width: 0, height: 0 })
    imageSizeRef.current = { width: 0, height: 0 }
    viewportInitRef.current = null
    viewportLiveRef.current = { scale: 1, x: 0, y: 0 }
    viewportLockedRef.current = false
    setViewport({ scale: 1, x: 0, y: 0 })
    setViewportReady(false)
    setFrameHeight(0)
    setPickingHighlights([])
    setInitialLoading(true)
    const timer = setTimeout(() => initCanvas(), 80)
    return () => clearTimeout(timer)
  }, [pattern.width, pattern.height, cellPx, config.showGrid, config.showColorCode, initCanvas, clearSelection])

  const resolveLogicalPoint = useCallback((touch: ScreenTouch): Promise<{ x: number; y: number } | null> => {
    return new Promise((resolve) => {
      Taro.createSelectorQuery()
        .select(`#${VIEWPORT_AREA_ID}`)
        .boundingClientRect((rect) => {
          const area = rect as { left: number; top: number } | null
          const size = imageSizeRef.current
          const vp = viewportLiveRef.current
          if (!area || !size.width || !size.height) {
            resolve(null)
            return
          }

          const localX = touch.clientX - area.left
          const localY = touch.clientY - area.top
          const x = (localX - vp.x) / vp.scale
          const y = (localY - vp.y) / vp.scale
          if (x < 0 || y < 0 || x > size.width || y > size.height) {
            resolve(null)
            return
          }

          resolve({ x, y })
        })
        .exec()
    })
  }, [])

  const toggleSelectionAt = useCallback((x: number, y: number) => {
    const size = imageSizeRef.current
    const touchCellPx = size.width > 0
      ? size.width / patternRef.current.width
      : cellPx
    const coord = coordFromTouchNearest(x, y, touchCellPx, patternRef.current)
    if (!coord) return
    const index = coordToCellIndex(patternRef.current, coord.col, coord.row)
    const selected = selectedIndicesRef.current
    if (selected.has(index)) {
      selected.delete(index)
    } else {
      selected.add(index)
    }
    syncSelectionCount()
    if (isPickingCellsRef.current) {
      syncSelectionHighlights()
      return
    }
    void refreshSelectionOverlay()
  }, [cellPx, refreshSelectionOverlay, syncSelectionHighlights, syncSelectionCount])

  const openPickerFlow = useCallback(() => {
    setPickerVisible(true)
  }, [])

  const ensureSelectionAnchor = useCallback(() => {
    if (selectionRef.current || selectedIndicesRef.current.size === 0) return
    const firstIndex = selectedIndicesRef.current.values().next().value as number
    selectionRef.current = cellIndexToCoord(patternRef.current, firstIndex)
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
    selectedIndicesRef.current = new Set([index])
    syncSelectionCount()
    setSelectedColorId(patternRef.current.grid[index] ?? '')
    setIsPickingCells(false)
    void openPickerFlow()
  }, [cellPx, openPickerFlow, syncSelectionCount])

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

    if (isPickingCellsRef.current) {
      void resolveLogicalPoint(touch).then((point) => {
        if (point) toggleSelectionAt(point.x, point.y)
      })
      return
    }

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
  }, [openCellEditorAt, resolveLogicalPoint, toggleSelectionAt])

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
    const touchCount = event.touches?.length ?? 0
    tapGestureRef.current.blockPan = touchCount === 1
    const touch = readScreenTouch(event.touches?.[0] ?? {})
    if (!touch) return
    tapGestureRef.current.touchStartClientX = touch.clientX
    tapGestureRef.current.touchStartClientY = touch.clientY
  }

  const handleWrapTouchMove = (event: {
    touches?: Array<unknown>
    stopPropagation?: () => void
  }) => {
    const touchCount = event.touches?.length ?? 0
    if (tapGestureRef.current.blockPan && touchCount <= 1) {
      event.stopPropagation?.()
    }
  }

  const handleWrapTouchEnd = (event: {
    changedTouches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
    touches?: Array<unknown>
  }) => {
    tapGestureRef.current.blockPan = false
    if ((event.touches?.length ?? 0) > 0) return
    if (event.changedTouches?.length !== 1) return
    const touch = readScreenTouch(event.changedTouches[0])
    if (!touch) return

    const moved = Math.hypot(
      touch.clientX - tapGestureRef.current.touchStartClientX,
      touch.clientY - tapGestureRef.current.touchStartClientY,
    )
    if (moved > TAP_MOVE_TOLERANCE) {
      return
    }
    handleScreenTap(touch)
  }

  const initialViewport = useMemo((): ViewportTransform | null => {
    if (!imageSize.width || !frameHeight) return null
    return {
      scale: initialScale,
      x: initialPosition.x,
      y: initialPosition.y,
    }
  }, [frameHeight, imageSize.width, imageSize.height, initialScale, initialPosition.x, initialPosition.y])

  useLayoutEffect(() => {
    if (!initialViewport || viewportReady) return
    viewportInitRef.current = initialViewport
    viewportLiveRef.current = initialViewport
    commitViewportState(initialViewport)
    setViewportReady(true)
  }, [commitViewportState, initialViewport, viewportReady])

  const showViewport = Boolean(imageSrc && !initialLoading && initialViewport)
  const showEditorViewport = showViewport && viewportReady

  useLayoutEffect(() => {
    measureViewportFrame()
  }, [measureViewportFrame, pickerVisible, initialLoading, imageSrc])

  useLayoutEffect(() => {
    if (showViewport && initialViewport && !viewportLockedRef.current) {
      viewportLockedRef.current = true
    }
  }, [initialViewport, showViewport])

  const handleViewportChange = useCallback((next: ViewportTransform) => {
    commitViewportState(next)
  }, [commitViewportState])

  const highlightCellPx = imageSize.width > 0
    ? imageSize.width / pattern.width
    : cellPx

  const pushUndo = (edit: PatternUndoEntry) => {
    undoStackRef.current.push(edit)
    if (undoStackRef.current.length > MAX_UNDO) {
      undoStackRef.current.shift()
    }
    setCanUndo(true)
  }

  const applyEditAndRefresh = async (
    nextPattern: PatternResult,
    edit: PatternUndoEntry,
  ) => {
    patternRef.current = nextPattern
    pushUndo(edit)
    onPatternChange(nextPattern)
    setPickerVisible(false)
    setIsPickingCells(false)
    clearSelection()
    await redrawAndRefresh(true)
  }

  const handleContinuePick = () => {
    if (selectedIndicesRef.current.size === 0 && selectionRef.current) {
      const index = coordToCellIndex(
        patternRef.current,
        selectionRef.current.col,
        selectionRef.current.row,
      )
      selectedIndicesRef.current.add(index)
      syncSelectionCount()
    }
    setPickerVisible(false)
    setIsPickingCells(true)
  }

  const handleSelectAllSameColor = () => {
    const indices = getIndicesWithColor(patternRef.current, selectedColorId)
    selectedIndicesRef.current = new Set(indices)
    syncSelectionCount()
    void refreshSelectionOverlay()
  }

  const handleClearSelection = () => {
    clearSelection()
    if (isPickingCellsRef.current) return
    void refreshSelectionOverlay()
  }

  const handleFinishPick = () => {
    if (selectedIndicesRef.current.size === 0) {
      Taro.showToast({ title: '请先选择格子', icon: 'none' })
      return
    }
    ensureSelectionAnchor()
    setIsPickingCells(false)
    setPickingHighlights([])
    setPickerVisible(true)
  }

  const handleClosePicker = () => {
    setPickerVisible(false)
    if (!isPickingCellsRef.current) {
      setIsPickingCells(false)
      clearSelection()
      void refreshSelectionOverlay(true)
      return
    }
  }

  const handleUndo = async () => {
    if (!canUndo) return
    const edit = undoStackRef.current.pop()
    if (!edit) {
      setCanUndo(false)
      return
    }

    const nextPattern = revertPatternEdit(patternRef.current, edit)
    patternRef.current = nextPattern
    onPatternChange(nextPattern)
    setCanUndo(undoStackRef.current.length > 0)
    await redrawAndRefresh(true)
  }

  const handleToolbarLeft = () => {
    if (isPickingCells) {
      handleClearSelection()
      return
    }
    if (canUndo) {
      void handleUndo()
    }
  }

  const handleToolbarRight = () => {
    if (isPickingCells) {
      handleFinishPick()
    }
  }

  const handleColorSelect = async (colorId: string, mode: 'single' | 'batch' = 'single') => {
    const cell = selectionRef.current
    if (!cell) return
    const index = coordToCellIndex(patternRef.current, cell.col, cell.row)
    const sourceColorId = patternRef.current.grid[index]

    if (mode === 'batch') {
      const indices = [...selectedIndicesRef.current]
      if (indices.length === 0) {
        Taro.showToast({ title: '请先选择格子', icon: 'none' })
        return
      }

      const confirmed = await new Promise<boolean>((resolve) => {
        Taro.showModal({
          title: '批量替换',
          content: `将已选 ${indices.length} 格替换为「${formatEditColorLabel(colorId)}」？`,
          confirmText: '替换',
          success: (res) => resolve(Boolean(res.confirm)),
          fail: () => resolve(false),
        })
      })
      if (!confirmed) return

      const { pattern: nextPattern, edit } = applyPatternCellsReplace(
        patternRef.current,
        indices,
        colorId,
      )
      if (!edit) {
        setPickerVisible(false)
        return
      }
      await applyEditAndRefresh(nextPattern, edit)
      return
    }

    if (sourceColorId === colorId) {
      setPickerVisible(false)
      return
    }

    const edit = {
      kind: 'single' as const,
      index,
      prevColorId: sourceColorId,
      nextColorId: colorId,
    }
    const nextPattern = applyPatternCellEdit(patternRef.current, edit)
    await applyEditAndRefresh(nextPattern, edit)
  }

  return (
    <View className='pattern-editor pattern-editor--fullscreen'>
      <View className='pattern-editor__toolbar'>
        <View className='pattern-editor__toolbar-slot' onClick={handleToolbarLeft}>
          <Text
            className={`pattern-editor__action${
              !isPickingCells && !canUndo ? ' pattern-editor__action--disabled' : ''
            }`}
          >
            {isPickingCells ? '清空' : '撤销'}
          </Text>
        </View>
        <Text className='pattern-editor__hint'>
          {isPickingCells
            ? `已选 ${selectionCount} 格 · 点击增删`
            : '双击改色 · 可批量替换'}
        </Text>
        <View
          className='pattern-editor__toolbar-slot pattern-editor__toolbar-slot--right'
          onClick={handleToolbarRight}
        >
          {isPickingCells ? (
            <Text className='pattern-editor__action'>选色</Text>
          ) : (
            <Text className='pattern-editor__meta'>
              {pattern.width}×{pattern.height}
            </Text>
          )}
        </View>
      </View>

      <View
        id='pattern-editor-viewport-frame'
        className='pattern-editor__viewport'
      >
        {initialLoading && (
          <View className='pattern-editor__loading'>
            <Text>加载高清图...</Text>
          </View>
        )}

        {showEditorViewport && (
          <EditorViewport
            imageSrc={imageSrc}
            preloadSrc={preloadSrc}
            imageWidth={imageSize.width}
            imageHeight={imageSize.height}
            viewport={viewport}
            interactive={!pickerVisible}
            highlights={pickingHighlights}
            highlightCellPx={highlightCellPx}
            onViewportChange={handleViewportChange}
            onTouchStart={handleWrapTouchStart}
            onTouchMove={handleWrapTouchMove}
            onTouchEnd={handleWrapTouchEnd}
            onPreloadLoad={handlePreloadLoad}
            onPreloadError={handlePreloadError}
            onDisplayError={handleDisplayImageError}
          />
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
          selectedCount={selectionCount}
          initialPickMode={selectionCount > 1 ? 'batch' : 'single'}
          onSelect={(colorId, mode) => { void handleColorSelect(colorId, mode) }}
          onContinuePick={handleContinuePick}
          onSelectAllSameColor={handleSelectAllSameColor}
          onClearSelection={handleClearSelection}
          onClose={handleClosePicker}
        />
      )}
    </View>
  )
}
