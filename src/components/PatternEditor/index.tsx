import { View, Text, Canvas, Image } from '@tarojs/components'
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
  cellIndexToCoord,
  coordFromTouchNearest,
  coordToCellIndex,
  getIndicesWithColor,
  getUniqueColorIdsFromIndices,
  revertPatternEdit,
  type GridCoord,
  type PatternUndoEntry,
} from '@/utils/patternEdit'
import type { PatternConfig, PatternResult } from '@/types'
import selectGridIcon from '@/assets/icons/editor-select-grid.png'
import selectGridIconDisabled from '@/assets/icons/editor-select-grid-disabled.png'
import tapClickHandImg from '@/assets/icons/editor-tap-click-hand.png'
import gestureGuideImg from '@/assets/icons/editor-gesture-guide.png'
import editIcon from '@/assets/icons/editor-edit.png'
import editIconDisabled from '@/assets/icons/Vector.svg'
import undoIcon from '@/assets/icons/editor-undo.png'
import undoIconActive from '@/assets/icons/editor-undo-active.png'
import './index.scss'

const CANVAS_ID = 'pattern-editor-canvas'
const VIEWPORT_AREA_ID = 'pattern-editor-viewport-area'
const VIEW_PADDING = 24
const BOTTOM_VIEWPORT_RESERVE = 192
const MAX_UNDO = 40
const TAP_MOVE_TOLERANCE = 16
const PRELOAD_COMMIT_FALLBACK_MS = 150
const GESTURE_GUIDE_WIDTH = 228
const GESTURE_GUIDE_HEIGHT = Math.round(GESTURE_GUIDE_WIDTH * 181 / 313)

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

interface SelectionSnapshot {
  indices: number[]
  anchor: GridCoord | null
  isPicking: boolean
}

type EditorUndoEntry =
  | { type: 'pattern'; edit: PatternUndoEntry }
  | { type: 'selection'; prev: SelectionSnapshot; next: SelectionSnapshot }

interface ToolIconStackProps {
  enabledSrc: string
  disabledSrc: string
  showEnabled: boolean
}

function ToolIconStack({ enabledSrc, disabledSrc, showEnabled }: ToolIconStackProps) {
  return (
    <View className='pattern-editor__tool-icon-wrap pattern-editor__tool-icon-wrap--stacked'>
      <Image
        className={`pattern-editor__tool-icon pattern-editor__tool-icon--layer${showEnabled ? ' is-hidden' : ''}`}
        src={disabledSrc}
        mode='aspectFit'
      />
      <Image
        className={`pattern-editor__tool-icon pattern-editor__tool-icon--layer${showEnabled ? '' : ' is-hidden'}`}
        src={enabledSrc}
        mode='aspectFit'
      />
    </View>
  )
}

export default function PatternEditor({
  pattern,
  config,
  onPatternChange,
}: PatternEditorProps) {
  const sys = Taro.getWindowInfo()
  const viewportWidth = sys.windowWidth
  const safeAreaBottomInset = Math.max(
    0,
    sys.screenHeight - (sys.safeArea?.bottom ?? sys.screenHeight),
  )

  const [canvasAreaHeight, setCanvasAreaHeight] = useState(0)

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
  const isPickingCellsRef = useRef(true)
  const pickerVisibleRef = useRef(false)
  const undoStackRef = useRef<EditorUndoEntry[]>([])
  const tapGestureRef = useRef({
    touchStartClientX: 0,
    touchStartClientY: 0,
    blockPan: false,
    guidesBlockingTap: false,
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
  const [isPickingCells, setIsPickingCells] = useState(true)
  const [selectionCount, setSelectionCount] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)
  const [canUndo, setCanUndo] = useState(false)
  const [guidesVisible, setGuidesVisible] = useState(true)
  const guidesVisibleRef = useRef(true)

  patternRef.current = pattern
  imageSizeRef.current = imageSize
  isPickingCellsRef.current = isPickingCells
  pickerVisibleRef.current = pickerVisible
  guidesVisibleRef.current = guidesVisible

  const dismissGuides = useCallback(() => {
    if (!guidesVisibleRef.current) return
    guidesVisibleRef.current = false
    setGuidesVisible(false)
  }, [])

  const measureViewportFrame = useCallback(() => {
    Taro.createSelectorQuery()
      .select('#pattern-editor-viewport-frame')
      .boundingClientRect((rect) => {
        const box = rect as { height: number } | null
        if (box?.height) {
          const nextFrameHeight = Math.round(box.height)
          setCanvasAreaHeight(Math.max(
            80,
            nextFrameHeight - BOTTOM_VIEWPORT_RESERVE - safeAreaBottomInset,
          ))
        }
      })
      .select('#pattern-editor-viewport-area')
      .boundingClientRect((rect) => {
        const area = rect as { height: number } | null
        if (area?.height) {
          setCanvasAreaHeight(Math.round(area.height))
        }
      })
      .exec()
  }, [safeAreaBottomInset])

  const syncSelectionCount = useCallback(() => {
    setSelectionCount(selectedIndicesRef.current.size)
  }, [])

  const buildHighlights = useCallback(() => (
    [...selectedIndicesRef.current].map((index) => ({
      index,
      ...cellIndexToCoord(patternRef.current, index),
    }))
  ), [])

  const syncSelectionHighlights = useCallback(() => {
    const shouldShow = isPickingCellsRef.current || pickerVisibleRef.current
    if (!shouldShow || selectedIndicesRef.current.size === 0) {
      setPickingHighlights([])
      return
    }
    setPickingHighlights(buildHighlights())
  }, [buildHighlights])

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
    selectionRef.current = null
    syncSelectionCount()
    syncSelectionHighlights()
  }, [syncSelectionHighlights, syncSelectionCount])

  const captureSelectionSnapshot = useCallback((): SelectionSnapshot => ({
    indices: [...selectedIndicesRef.current],
    anchor: selectionRef.current ? { ...selectionRef.current } : null,
    isPicking: isPickingCellsRef.current,
  }), [])

  const areSelectionSnapshotsEqual = (a: SelectionSnapshot, b: SelectionSnapshot): boolean => {
    if (a.isPicking !== b.isPicking) return false
    if ((a.anchor?.col ?? -1) !== (b.anchor?.col ?? -1)) return false
    if ((a.anchor?.row ?? -1) !== (b.anchor?.row ?? -1)) return false
    if (a.indices.length !== b.indices.length) return false
    const aSet = new Set(a.indices)
    return b.indices.every((index) => aSet.has(index))
  }

  const pushSelectionUndo = useCallback((prev: SelectionSnapshot, next: SelectionSnapshot) => {
    if (areSelectionSnapshotsEqual(prev, next)) return
    undoStackRef.current.push({ type: 'selection', prev, next })
    if (undoStackRef.current.length > MAX_UNDO) {
      undoStackRef.current.shift()
    }
    setCanUndo(true)
  }, [])

  const restoreSelectionSnapshot = useCallback((snapshot: SelectionSnapshot) => {
    selectedIndicesRef.current = new Set(snapshot.indices)
    selectionRef.current = snapshot.anchor ? { ...snapshot.anchor } : null
    isPickingCellsRef.current = snapshot.isPicking
    setIsPickingCells(snapshot.isPicking)
    syncSelectionCount()
    if ((snapshot.isPicking || pickerVisibleRef.current) && snapshot.indices.length > 0) {
      setPickingHighlights(buildHighlights())
    } else {
      setPickingHighlights([])
    }
  }, [buildHighlights, syncSelectionCount])

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

  const canvasAreaHeightForLayout = useMemo(
    () => Math.max(80, canvasAreaHeight),
    [canvasAreaHeight],
  )

  const initialScale = useMemo(() => {
    if (!imageSize.width || canvasAreaHeightForLayout < 80) return 1
    const horizontalFit = (viewportWidth - VIEW_PADDING * 2) / imageSize.width
    const verticalFit = (canvasAreaHeightForLayout - VIEW_PADDING * 2) / imageSize.height
    return Math.max(0.2, Math.min(horizontalFit, verticalFit))
  }, [viewportWidth, canvasAreaHeightForLayout, imageSize])

  const initialPosition = useMemo(() => {
    if (!imageSize.width || canvasAreaHeightForLayout < 80) return { x: 0, y: 0 }
    const scaledW = imageSize.width * initialScale
    const scaledH = imageSize.height * initialScale
    return {
      x: Math.max(0, Math.round((viewportWidth - scaledW) / 2)),
      y: Math.max(0, Math.round((canvasAreaHeightForLayout - scaledH) / 2)),
    }
  }, [imageSize, initialScale, viewportWidth, canvasAreaHeightForLayout])

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
    isPickingCellsRef.current = true
    setIsPickingCells(true)
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
    setCanvasAreaHeight(0)
    setPickingHighlights([])
    setInitialLoading(true)
    guidesVisibleRef.current = true
    setGuidesVisible(true)
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
    const prevSelection = captureSelectionSnapshot()
    const index = coordToCellIndex(patternRef.current, coord.col, coord.row)
    const selected = selectedIndicesRef.current
    if (selected.has(index)) {
      selected.delete(index)
    } else {
      selected.add(index)
    }
    if (selected.size > 0) {
      const firstIndex = selected.values().next().value as number
      selectionRef.current = cellIndexToCoord(patternRef.current, firstIndex)
    } else {
      selectionRef.current = null
    }
    syncSelectionCount()
    pushSelectionUndo(prevSelection, captureSelectionSnapshot())
    if (isPickingCellsRef.current) {
      syncSelectionHighlights()
      return
    }
    void refreshSelectionOverlay()
  }, [
    captureSelectionSnapshot,
    cellPx,
    pushSelectionUndo,
    refreshSelectionOverlay,
    syncSelectionHighlights,
    syncSelectionCount,
  ])

  const ensureSelectionAnchor = useCallback(() => {
    if (selectionRef.current || selectedIndicesRef.current.size === 0) return
    const firstIndex = selectedIndicesRef.current.values().next().value as number
    selectionRef.current = cellIndexToCoord(patternRef.current, firstIndex)
  }, [])

  const openSelectedCellEditor = () => {
    if (selectedIndicesRef.current.size === 0) return
    ensureSelectionAnchor()
    const firstIndex = selectedIndicesRef.current.values().next().value as number
    setSelectedColorId(patternRef.current.grid[firstIndex] ?? '')
    isPickingCellsRef.current = false
    setIsPickingCells(false)
    setPickerVisible(true)
    setPickingHighlights(buildHighlights())
  }

  const handleClosePicker = () => {
    setPickerVisible(false)
    isPickingCellsRef.current = true
    setIsPickingCells(true)
    syncSelectionHighlights()
  }

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

    if (!isPickingCellsRef.current || pickerVisibleRef.current) return

    void resolveLogicalPoint(touch).then((point) => {
      if (point) toggleSelectionAt(point.x, point.y)
    })
  }, [resolveLogicalPoint, toggleSelectionAt])

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
    tapGestureRef.current.guidesBlockingTap = guidesVisibleRef.current
      && isPickingCellsRef.current
      && !pickerVisibleRef.current
    dismissGuides()
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
    if (tapGestureRef.current.guidesBlockingTap) {
      tapGestureRef.current.guidesBlockingTap = false
      return
    }
    handleScreenTap(touch)
  }

  const initialViewport = useMemo((): ViewportTransform | null => {
    if (!imageSize.width || canvasAreaHeightForLayout < 80) return null
    return {
      scale: initialScale,
      x: initialPosition.x,
      y: initialPosition.y,
    }
  }, [canvasAreaHeightForLayout, imageSize.width, imageSize.height, initialScale, initialPosition.x, initialPosition.y])

  useLayoutEffect(() => {
    if (!initialViewport) return

    viewportInitRef.current = initialViewport
    viewportLiveRef.current = initialViewport
    commitViewportState(initialViewport)

    if (!viewportReady) {
      setViewportReady(true)
      return
    }

    if (!viewportLockedRef.current) {
      commitViewportState(initialViewport)
    }
  }, [commitViewportState, initialViewport, viewportReady])

  const showViewport = Boolean(imageSrc && !initialLoading && initialViewport)
  const showEditorViewport = showViewport && viewportReady
  const showPickGuides = showEditorViewport && isPickingCells && !pickerVisible && guidesVisible

  const selectedColorIds = useMemo(
    () => getUniqueColorIdsFromIndices(pattern, selectedIndicesRef.current),
    [pattern, selectionCount, pickerVisible],
  )

  useLayoutEffect(() => {
    measureViewportFrame()
  }, [measureViewportFrame, pickerVisible, initialLoading, imageSrc, showEditorViewport])

  const handleViewportChange = useCallback((next: ViewportTransform) => {
    viewportLockedRef.current = true
    commitViewportState(next)
  }, [commitViewportState])

  const highlightCellPx = imageSize.width > 0
    ? imageSize.width / pattern.width
    : cellPx

  const pushUndo = (edit: PatternUndoEntry) => {
    undoStackRef.current.push({ type: 'pattern', edit })
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
    isPickingCellsRef.current = true
    setIsPickingCells(true)
    clearSelection()
    await redrawAndRefresh(true)
  }

  const handleSelectAllSameColor = (colorId: string) => {
    const prevSelection = captureSelectionSnapshot()
    const indices = getIndicesWithColor(patternRef.current, colorId)
    selectedIndicesRef.current = new Set(indices)
    if (indices.length > 0) {
      selectionRef.current = cellIndexToCoord(patternRef.current, indices[0])
    }
    setSelectedColorId(colorId)
    syncSelectionCount()
    pushSelectionUndo(prevSelection, captureSelectionSnapshot())
    void refreshSelectionOverlay()
  }

  const handleClearSelection = () => {
    const prevSelection = captureSelectionSnapshot()
    clearSelection()
    pushSelectionUndo(prevSelection, captureSelectionSnapshot())
    if (isPickingCellsRef.current) return
    void refreshSelectionOverlay()
  }

  const handleUndo = async () => {
    if (!canUndo) return
    const entry = undoStackRef.current.pop()
    if (!entry) {
      setCanUndo(false)
      return
    }

    if (entry.type === 'selection') {
      restoreSelectionSnapshot(entry.prev)
      if (!entry.prev.isPicking) {
        void refreshSelectionOverlay(true)
      }
      setCanUndo(undoStackRef.current.length > 0)
      return
    }

    const nextPattern = revertPatternEdit(patternRef.current, entry.edit)
    patternRef.current = nextPattern
    onPatternChange(nextPattern)
    setCanUndo(undoStackRef.current.length > 0)
    await redrawAndRefresh(true)
  }

  const startPickMode = () => {
    isPickingCellsRef.current = true
    setPickerVisible(false)
    setIsPickingCells(true)
    syncSelectionHighlights()
  }

  const handleUndoAction = () => {
    if (canUndo) {
      void handleUndo()
    }
  }

  const handleConfirmColor = async (colorId: string) => {
    const indices = [...selectedIndicesRef.current]
    if (indices.length === 0) {
      Taro.showToast({ title: '请先选择格子', icon: 'none' })
      return
    }

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
  }

  const handleConfirmErase = async () => {
    const indices = [...selectedIndicesRef.current]
    if (indices.length === 0) {
      Taro.showToast({ title: '请先选择格子', icon: 'none' })
      return
    }

    const { pattern: nextPattern, edit } = applyPatternCellsReplace(
      patternRef.current,
      indices,
      PATTERN_EMPTY_CELL,
    )
    if (!edit) {
      setPickerVisible(false)
      return
    }
    await applyEditAndRefresh(nextPattern, edit)
  }

  return (
    <View
      className='pattern-editor pattern-editor--fullscreen'
      onTouchStart={dismissGuides}
    >
      <View
        id='pattern-editor-viewport-frame'
        className='pattern-editor__viewport'
      >
        {initialLoading && (
          <View className='pattern-editor__loading'>
            <Text>加载高清图...</Text>
          </View>
        )}

        {showPickGuides ? (
          <View className='pattern-editor__click-guide'>
            <View className='pattern-editor__click-guide-hand-wrap'>
              <Image
                className='pattern-editor__click-guide-hand'
                src={tapClickHandImg}
                mode='aspectFit'
              />
              <View className='pattern-editor__click-guide-pill'>
                <Text>点击选格</Text>
              </View>
            </View>
          </View>
        ) : null}

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

      <View className='pattern-editor__bottom-bar'>
        <View
          className={`pattern-editor__tool pattern-editor__tool--select${isPickingCells ? ' is-disabled' : ' is-enabled'}`}
          onClick={startPickMode}
        >
          {showPickGuides ? (
            <View
              className='pattern-editor__gesture-guide'
              style={{
                width: `${GESTURE_GUIDE_WIDTH}px`,
                height: `${GESTURE_GUIDE_HEIGHT}px`,
              }}
            >
              <Image
                className='pattern-editor__gesture-guide-img'
                src={gestureGuideImg}
                mode='aspectFit'
              />
            </View>
          ) : null}
          <ToolIconStack
            enabledSrc={selectGridIcon}
            disabledSrc={selectGridIconDisabled}
            showEnabled={!isPickingCells}
          />
          <Text className='pattern-editor__tool-label'>选框</Text>
        </View>
        <View
          className={`pattern-editor__tool${selectionCount > 0 ? ' is-enabled' : ' is-disabled'}`}
          onClick={() => {
            if (selectionCount > 0) openSelectedCellEditor()
          }}
        >
          <ToolIconStack
            enabledSrc={editIcon}
            disabledSrc={editIconDisabled}
            showEnabled={selectionCount > 0}
          />
          <Text className='pattern-editor__tool-label'>编辑</Text>
        </View>
        <View
          className={`pattern-editor__tool pattern-editor__tool--undo${canUndo ? ' is-enabled' : ' is-disabled'}`}
          onClick={handleUndoAction}
        >
          <ToolIconStack
            enabledSrc={undoIconActive}
            disabledSrc={undoIcon}
            showEnabled={canUndo}
          />
          <Text className='pattern-editor__tool-label'>撤销</Text>
        </View>
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
          selectedColorIds={selectedColorIds}
          selectedCount={selectionCount}
          onConfirmColor={(colorId) => { void handleConfirmColor(colorId) }}
          onConfirmErase={() => { void handleConfirmErase() }}
          onSelectAllSameColor={handleSelectAllSameColor}
          onClearSelection={handleClearSelection}
          onClose={handleClosePicker}
        />
      )}
    </View>
  )
}
