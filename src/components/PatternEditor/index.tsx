import { View, Text, Canvas, Image } from '@tarojs/components'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import ColorPickerSheet from '@/components/ColorPickerSheet'
import EditorViewport, {
  SCALE_MAX,
  SCALE_MIN,
  type CellHighlight,
  type EditorGestureMode,
  type EditorGuideLines,
  type EditorLayerMode,
  type ViewportTransform,
} from '@/components/PatternEditor/EditorViewport'
import { analyzeContentCrop } from '@/services/backgroundMatting'
import { matchRgbToColorId } from '@/services/colorMatcher'
import { loadCanvasImageWithRetry, loadCanvasNode } from '@/services/imageProcessor'
import {
  getEditHdCellPx,
  paintPatternCell,
  paintPatternGrid,
} from '@/services/patternRenderer'
import { getColorById } from '@/services/palette'
import { finalizePattern, isEmptyCell } from '@/services/patternStats'
import { computeCenteredContentRect, computeContentGridSize } from '@/services/imageProcessor'
import { canvasToTempFile } from '@/utils/canvas'
import { PATTERN_EMPTY_CELL } from '@/utils/constants'
import {
  applyPatternBatchReplace,
  applyPatternEdit,
  cellIndexToCoord,
  coordFromTouchNearest,
  coordToCellIndex,
  getPatternColorIds,
  revertPatternEdit,
  type PatternUndoEntry,
} from '@/utils/patternEdit'
import { getBeadSwatchStyle, isTransparentBeadId } from '@/utils/transparentBead'
import type { EditorDisplaySettings } from '@/utils/editorDisplaySettings'
import type { PatternConfig, PatternResult, PatternSourceCrop } from '@/types'
import arrowRightIcon from '@/assets/icons/pattern-edit-arrow-right.svg'
import brushIcon from '@/assets/icons/pattern-edit-brush.png'
import colorPickerIcon from '@/assets/icons/pattern-edit-color-picker.png'
import compareLayerActiveIcon from '@/assets/icons/pattern-edit-layer-compare-active.svg'
import compareLayerIcon from '@/assets/icons/pattern-edit-layer-compare.svg'
import gestureIcon from '@/assets/icons/pattern-edit-gesture.png'
import eraserIcon from '@/assets/icons/pattern-edit-eraser.png'
import originalLayerActiveIcon from '@/assets/icons/pattern-edit-layer-original-active.svg'
import originalLayerIcon from '@/assets/icons/pattern-edit-layer-original.svg'
import patternLayerActiveIcon from '@/assets/icons/pattern-edit-layer-pattern-active.svg'
import patternLayerIcon from '@/assets/icons/pattern-edit-layer-pattern.svg'
import redoIcon from '@/assets/icons/pattern-edit-redo.svg'
import undoIcon from '@/assets/icons/pattern-edit-undo.svg'
import './index.scss'

const CANVAS_ID = 'pattern-editor-canvas'
const CROP_CANVAS_ID = 'pattern-editor-crop-canvas'
const VIEWPORT_AREA_ID = 'pattern-editor-viewport-area'
const SETTINGS_BAR_ID = 'pattern-editor-display-settings-bar'
const PALETTE_BAR_ID = 'pattern-editor-palette-bar'
const VIEW_PADDING = 16
const TOP_VIEWPORT_RESERVE_FALLBACK = 64
const TOP_VIEWPORT_GAP = 6
const BOTTOM_VIEWPORT_RESERVE = 236
const MAX_UNDO = 40
/** 取色点按判定：与视口平移阈值一致，超过即视为拖动画布 */
const TAP_MOVE_TOLERANCE = 6
/** 双击同色替换的判定间隔 */
const DOUBLE_TAP_MS = 340
/** 画笔滑出画布多少格以内仍贴边着色，避免边缘行列涂不上 */
const STROKE_EDGE_SLACK_CELLS = 2
/** 超过这个规模的笔画，遇到第二根手指按下时保留而不回滚 */
const MULTI_TOUCH_KEEP_MIN_CELLS = 4
const MULTI_TOUCH_KEEP_MIN_MS = 150
/** 抬笔后空闲多久再导出整图底图，避免每笔都整图刷新闪烁 */
const PREVIEW_REFRESH_IDLE_MS = 900
/** 全图导出超过该时间才出现轻量提示，避免短笔画闪一下 */
const PREVIEW_REFRESH_LOADING_MS = 500
/** 新图纸 Image onLoad 后，小程序真正上屏可能晚一拍；稍等再撤掉跟手涂色层 */
const PREVIEW_OVERLAY_CLEAR_DELAY_MS = 180
/** 原图取色缓冲区最长边，越接近原分辨率取色越准 */
const SOURCE_SAMPLE_MAX_EDGE = 1600
/** 取色窗口半径（缓冲区像素），用于避开描边抗锯齿过渡色 */
const SOURCE_SAMPLE_RADIUS = 1
const QUICK_PALETTE_LIMIT = 9
const FALLBACK_QUICK_COLORS = ['H1', 'H6', 'H8', 'H9', 'H13', 'H14', 'H17', 'H18', 'H19']

type EditorTool = 'eyedropper' | 'brush' | 'eraser' | 'pan'
type PatternBufferKey = 'a' | 'b'

interface PatternImageBuffer {
  key: PatternBufferKey
  src: string
}

interface ScreenTouch {
  clientX: number
  clientY: number
}

interface AreaRect {
  left: number
  top: number
  ready: boolean
}

interface PatternEditorProps {
  pattern: PatternResult
  config: PatternConfig
  sourceImagePath?: string
  sourceCrop?: PatternSourceCrop | null
  displaySettings: EditorDisplaySettings
  onDisplaySettingsChange: (settings: EditorDisplaySettings) => void
  onPatternChange: (pattern: PatternResult, options?: { immediate?: boolean }) => void
  onSourceCropResolved?: (crop: PatternSourceCrop) => void
}

function ensureAlignedSourceCrop(
  crop: PatternSourceCrop,
  pattern: PatternResult,
  config: PatternConfig,
): PatternSourceCrop {
  if (
    pattern.width !== pattern.height
    || pattern.width <= 0
    || crop.width <= 0
    || crop.height <= 0
  ) {
    return crop
  }

  const squareSide = pattern.width
  const contentSize = computeContentGridSize(
    crop.width,
    crop.height,
    squareSide,
    config.styleMode,
  )
  const contentRect = computeCenteredContentRect(
    contentSize.width,
    contentSize.height,
    squareSide,
  )
  if (
    crop.squareSide === squareSide
    && crop.contentRect
    && crop.contentRect.x === contentRect.x
    && crop.contentRect.y === contentRect.y
    && crop.contentRect.width === contentRect.width
    && crop.contentRect.height === contentRect.height
  ) {
    return crop
  }

  return {
    ...crop,
    squareSide,
    contentRect,
  }
}

type CanvasNode = {
  getContext: (type: '2d') => CanvasRenderingContext2D | null
  width: number
  height: number
}

const LAYER_OPTIONS: Array<{ key: EditorLayerMode; label: string }> = [
  { key: 'pattern', label: '图纸' },
  { key: 'compare', label: '对照' },
  { key: 'source', label: '原图' },
]

const LAYER_TOOL_OPTIONS: Array<{
  key: EditorLayerMode
  label: string
  icon: string
  activeIcon: string
}> = [
  { key: 'pattern', label: '图纸', icon: patternLayerIcon, activeIcon: patternLayerActiveIcon },
  { key: 'compare', label: '对照', icon: compareLayerIcon, activeIcon: compareLayerActiveIcon },
  { key: 'source', label: '原图', icon: originalLayerIcon, activeIcon: originalLayerActiveIcon },
]

function pickDefaultBrushColor(pattern: PatternResult): string {
  const ids = getPatternColorIds(pattern).filter((id) => !isEmptyCell(id))
  return ids[0] || 'H2'
}

function resolvePaintPreviewColor(colorId: string): string {
  if (isEmptyCell(colorId)) return '#f3f4f6'
  if (isTransparentBeadId(colorId)) return 'rgba(198, 222, 238, 0.88)'
  return getColorById(colorId)?.hex ?? '#cccccc'
}

function clampIndex(value: number, length: number): number {
  return Math.min(length - 1, Math.max(0, value))
}

function buildQuickPalette(pattern: PatternResult, activeColorId: string): string[] {
  const seen = new Set<string>()
  const ids = [
    ...getPatternColorIds(pattern),
    ...FALLBACK_QUICK_COLORS,
  ].filter((id) => id && id !== activeColorId && !isEmptyCell(id))

  const unique: string[] = []
  ids.forEach((id) => {
    if (seen.has(id)) return
    seen.add(id)
    unique.push(id)
  })
  return unique.slice(0, QUICK_PALETTE_LIMIT)
}

/** 取样窗口内的众数色：命中抗锯齿过渡像素时仍能取到描边本色 */
function dominantRgbInWindow(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
): [number, number, number] | null {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>()
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const px = centerX + dx
      const py = centerY + dy
      if (px < 0 || py < 0 || px >= width || py >= height) continue
      const pi = (py * width + px) * 4
      if ((data[pi + 3] ?? 0) < 8) continue
      const r = data[pi]
      const g = data[pi + 1]
      const b = data[pi + 2]
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
      const bucket = buckets.get(key)
      if (bucket) {
        bucket.count += 1
        bucket.r += r
        bucket.g += g
        bucket.b += b
      } else {
        buckets.set(key, { count: 1, r, g, b })
      }
    }
  }
  let best: { count: number; r: number; g: number; b: number } | null = null
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket
  }
  if (!best) return null
  return [
    Math.round(best.r / best.count),
    Math.round(best.g / best.count),
    Math.round(best.b / best.count),
  ]
}

/** 快速滑动时补齐中间格子，避免漏涂 */
function forEachCellOnSegment(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  visit: (col: number, row: number) => void,
) {
  const dx = toCol - fromCol
  const dy = toRow - fromRow
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1)
  let prevKey = ''
  for (let i = 0; i <= steps; i += 1) {
    const col = Math.round(fromCol + (dx * i) / steps)
    const row = Math.round(fromRow + (dy * i) / steps)
    const key = `${col},${row}`
    if (key === prevKey) continue
    prevKey = key
    visit(col, row)
  }
}

export default function PatternEditor({
  pattern,
  config,
  sourceImagePath = '',
  sourceCrop = null,
  displaySettings,
  onDisplaySettingsChange,
  onPatternChange,
  onSourceCropResolved,
}: PatternEditorProps) {
  const sys = Taro.getWindowInfo()
  const platform = Taro.getSystemInfoSync().platform
  const viewportWidth = sys.windowWidth
  const safeAreaBottomInset = Math.max(
    0,
    sys.screenHeight - (sys.safeArea?.bottom ?? sys.screenHeight),
  )

  const [canvasAreaHeight, setCanvasAreaHeight] = useState(0)
  const [topViewportReserve, setTopViewportReserve] = useState(TOP_VIEWPORT_RESERVE_FALLBACK)
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
  const [guideLines, setGuideLines] = useState<EditorGuideLines>(() => ({
    vertical: Math.round(pattern.width / 2),
    horizontal: Math.round(pattern.height / 2),
  }))

  const canvasRef = useRef<CanvasNode | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const patternRef = useRef(pattern)
  const undoStackRef = useRef<PatternUndoEntry[]>([])
  const redoStackRef = useRef<PatternUndoEntry[]>([])
  const refreshTokenRef = useRef(0)
  const imageSizeRef = useRef({ width: 0, height: 0 })
  const imageSrcRef = useRef('')
  const lastGoodImageSrcRef = useRef('')
  const patternBuffersRef = useRef<Record<PatternBufferKey, string>>({ a: '', b: '' })
  const activePatternBufferKeyRef = useRef<PatternBufferKey>('a')
  const preloadPendingRef = useRef<{
    src: string
    width: number
    height: number
    key: PatternBufferKey
  } | null>(null)
  const displayCommitWaiterRef = useRef<((committed: boolean) => void) | null>(null)
  const viewportInitRef = useRef<ViewportTransform | null>(null)
  const viewportLiveRef = useRef<ViewportTransform>({ scale: 1, x: 0, y: 0 })
  const viewportLockedRef = useRef(false)
  /** 已应用的 fit 基准，涂色换底图时保持不变以免重置缩放 */
  const viewportFitKeyRef = useRef('')
  const areaRectRef = useRef<AreaRect>({ left: 0, top: 0, ready: false })
  const pendingHighlightsRef = useRef<CellHighlight[]>([])
  const highlightRafRef = useRef<number | null>(null)
  const paintOverlayMapRef = useRef<Map<number, CellHighlight>>(new Map())
  const previewRefreshSeqRef = useRef(0)
  const previewRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initCanvasRef = useRef<(retry?: number) => void>(() => undefined)
  /** 多指手势期间禁止绘制，直到所有手指抬起 */
  const multiTouchRef = useRef(false)
  /** 画笔长按拖动画布期间禁止着色 */
  const drawPanActiveRef = useRef(false)
  const pendingTapRef = useRef<ScreenTouch | null>(null)
  /** 双击同色替换：记录上一次轻点的格子与落点时的色号 */
  const lastTapRef = useRef<{
    time: number
    col: number
    row: number
    sourceColorId: string
    clientX: number
    clientY: number
  } | null>(null)
  const sourcePixelsRef = useRef<{
    key: string
    data: Uint8ClampedArray
    width: number
    height: number
  } | null>(null)
  const toolRef = useRef<EditorTool>('pan')
  const brushColorRef = useRef(pickDefaultBrushColor(pattern))
  const strokeRef = useRef<{
    active: boolean
    colorId: string
    touched: Set<number>
    changes: Array<{ index: number; prevColorId: string }>
    lastCol: number
    lastRow: number
    startedAt: number
  } | null>(null)

  const [imageSrc, setImageSrc] = useState('')
  const [patternBuffers, setPatternBuffers] = useState<PatternImageBuffer[]>([])
  const [activePatternBufferKey, setActivePatternBufferKey] = useState<PatternBufferKey>('a')
  const [pendingPatternBufferKey, setPendingPatternBufferKey] = useState<PatternBufferKey | null>(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [viewport, setViewport] = useState<ViewportTransform>({ scale: 1, x: 0, y: 0 })
  const [viewportReady, setViewportReady] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [tool, setTool] = useState<EditorTool>('pan')
  const [brushColorId, setBrushColorId] = useState(() => pickDefaultBrushColor(pattern))
  const [layerMode, setLayerMode] = useState<EditorLayerMode>('pattern')
  const [pickerVisible, setPickerVisible] = useState(false)
  const [paintOverlays, setPaintOverlays] = useState<CellHighlight[]>([])
  const [previewRefreshing, setPreviewRefreshing] = useState(false)
  const [majorGridSuspended, setMajorGridSuspended] = useState(false)
  const [resolvedSourceCrop, setResolvedSourceCrop] = useState<PatternSourceCrop | null>(
    sourceCrop || null,
  )

  if (!strokeRef.current?.active) {
    patternRef.current = pattern
  }
  imageSizeRef.current = imageSize
  toolRef.current = tool
  brushColorRef.current = brushColorId

  const hasSourceImage = Boolean(sourceImagePath)
  const activeSourceCrop = resolvedSourceCrop || sourceCrop || null
  const drawToolsDisabled = layerMode === 'source'
  const gestureMode: EditorGestureMode = (
    !drawToolsDisabled && (tool === 'brush' || tool === 'eraser')
  ) && !pickerVisible
    ? 'draw'
    : 'pan'

  useEffect(() => {
    if (!sourceCrop) {
      setResolvedSourceCrop(null)
      return
    }
    const nextCrop = ensureAlignedSourceCrop(sourceCrop, patternRef.current, config)
    setResolvedSourceCrop(nextCrop)
    if (nextCrop !== sourceCrop) {
      onSourceCropResolved?.(nextCrop)
    }
  }, [config, onSourceCropResolved, sourceCrop, sourceImagePath])

  // 切到原图时，画笔/橡皮自动退回浏览
  useEffect(() => {
    if (layerMode !== 'source') return
    if (toolRef.current !== 'brush' && toolRef.current !== 'eraser') return
    setTool('pan')
    toolRef.current = 'pan'
  }, [layerMode])

  useEffect(() => {
    if (!sourceImagePath || activeSourceCrop) return
    let cancelled = false

    const resolveCrop = async (retry = 0) => {
      try {
        const canvas = await loadCanvasNode(CROP_CANVAS_ID)
        const analysis = await analyzeContentCrop(canvas, sourceImagePath)
        if (cancelled) return
        const nextCrop = ensureAlignedSourceCrop({
          ...analysis.crop,
          sourceWidth: analysis.sourceWidth,
          sourceHeight: analysis.sourceHeight,
        }, patternRef.current, config)
        setResolvedSourceCrop(nextCrop)
        onSourceCropResolved?.(nextCrop)
      } catch {
        if (!cancelled && retry < 8) {
          setTimeout(() => {
            void resolveCrop(retry + 1)
          }, 160)
        }
      }
    }

    const timer = setTimeout(() => {
      void resolveCrop()
    }, 80)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [config, sourceImagePath, activeSourceCrop, onSourceCropResolved])

  const measureViewportFrame = useCallback(() => {
    Taro.createSelectorQuery()
      .select('#pattern-editor-viewport-frame')
      .boundingClientRect()
      .select(`#${SETTINGS_BAR_ID}`)
      .boundingClientRect()
      .select(`#${PALETTE_BAR_ID}`)
      .boundingClientRect()
      .exec((res) => {
        const frame = res?.[0] as { top: number; height: number } | null
        const settingsBar = res?.[1] as { bottom: number } | null
        const palette = res?.[2] as { top: number } | null
        if (!frame?.height) return

        const measuredTopReserve = settingsBar?.bottom
          ? Math.max(0, Math.round(settingsBar.bottom - frame.top + TOP_VIEWPORT_GAP))
          : TOP_VIEWPORT_RESERVE_FALLBACK
        setTopViewportReserve((prev) => (
          prev === measuredTopReserve ? prev : measuredTopReserve
        ))

        const measuredAreaHeight = palette
          ? Math.round(palette.top - frame.top - measuredTopReserve)
          : 0
        const fallbackAreaHeight = Math.round(
          frame.height - measuredTopReserve - BOTTOM_VIEWPORT_RESERVE - safeAreaBottomInset,
        )
        setCanvasAreaHeight(Math.max(
          80,
          measuredAreaHeight > 0 ? measuredAreaHeight : fallbackAreaHeight,
        ))
      })
  }, [safeAreaBottomInset])

  const commitViewportState = useCallback((next?: ViewportTransform) => {
    const merged = next ?? { ...viewportLiveRef.current }
    viewportLiveRef.current = merged
    setViewport(merged)
  }, [])

  const fullRedraw = useCallback((node: CanvasNode, nextPattern: PatternResult) => {
    node.width = canvasWidth
    node.height = canvasHeight
    const ctx = node.getContext('2d')
    if (!ctx) return null
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    paintPatternGrid(ctx, nextPattern, paintOptions)
    return ctx
  }, [canvasWidth, canvasHeight, paintOptions])

  const canvasAreaHeightForLayout = useMemo(
    () => canvasAreaHeight,
    [canvasAreaHeight],
  )

  const initialScale = useMemo(() => {
    if (!imageSize.width || !imageSize.height || canvasAreaHeightForLayout < 80) {
      return 1
    }
    const availableWidth = Math.max(1, viewportWidth - VIEW_PADDING * 2)
    const availableHeight = Math.max(1, canvasAreaHeightForLayout - VIEW_PADDING * 2)
    const fit = Math.min(
      availableWidth / imageSize.width,
      availableHeight / imageSize.height,
    )
    // 首次进入：正好完整显示整张图纸（可略小于旧的 0.2 下限）
    return Math.max(SCALE_MIN, Math.min(SCALE_MAX, fit))
  }, [viewportWidth, canvasAreaHeightForLayout, imageSize])

  const initialPosition = useMemo(() => {
    if (!imageSize.width || !imageSize.height || canvasAreaHeightForLayout < 80) {
      return { x: 0, y: 0 }
    }
    const scaledW = imageSize.width * initialScale
    const scaledH = imageSize.height * initialScale
    const spareHeight = Math.max(0, canvasAreaHeightForLayout - scaledH)
    return {
      x: Math.round((viewportWidth - scaledW) / 2),
      y: Math.round(topViewportReserve + spareHeight / 2),
    }
  }, [imageSize, initialScale, viewportWidth, canvasAreaHeightForLayout, topViewportReserve])

  const applyImageSize = useCallback((width: number, height: number) => {
    const prev = imageSizeRef.current
    if (prev.width === width && prev.height === height) return
    const next = { width, height }
    imageSizeRef.current = next
    setImageSize(next)
  }, [])

  const syncPatternBuffers = useCallback(() => {
    const nextBuffers: PatternImageBuffer[] = []
    const aSrc = patternBuffersRef.current.a
    const bSrc = patternBuffersRef.current.b
    if (aSrc) nextBuffers.push({ key: 'a', src: aSrc })
    if (bSrc) nextBuffers.push({ key: 'b', src: bSrc })
    setPatternBuffers(nextBuffers)
  }, [])

  const commitDisplayImage = useCallback((
    src: string,
    width: number,
    height: number,
    key: PatternBufferKey = activePatternBufferKeyRef.current,
  ) => {
    if (!src) return
    patternBuffersRef.current[key] = src
    activePatternBufferKeyRef.current = key
    syncPatternBuffers()
    setActivePatternBufferKey(key)
    setPendingPatternBufferKey(null)
    imageSrcRef.current = src
    lastGoodImageSrcRef.current = src
    setImageSrc(src)
    applyImageSize(width, height)
  }, [applyImageSize, syncPatternBuffers])

  const resolveDisplayCommitWaiter = useCallback((committed: boolean) => {
    const resolve = displayCommitWaiterRef.current
    displayCommitWaiterRef.current = null
    resolve?.(committed)
  }, [])

  const cancelPreload = useCallback(() => {
    const pending = preloadPendingRef.current
    if (pending) {
      patternBuffersRef.current[pending.key] = ''
      syncPatternBuffers()
    }
    preloadPendingRef.current = null
    setPendingPatternBufferKey(null)
    resolveDisplayCommitWaiter(false)
  }, [resolveDisplayCommitWaiter, syncPatternBuffers])

  const handlePatternBufferLoad = useCallback((key: string) => {
    const pending = preloadPendingRef.current
    if (!pending || pending.key !== key) return
    preloadPendingRef.current = null
    commitDisplayImage(pending.src, pending.width, pending.height, pending.key)
    resolveDisplayCommitWaiter(true)
  }, [commitDisplayImage, resolveDisplayCommitWaiter])

  const handlePatternBufferError = useCallback((key: string) => {
    const pending = preloadPendingRef.current
    if (!pending || pending.key !== key) return
    patternBuffersRef.current[pending.key] = ''
    syncPatternBuffers()
    preloadPendingRef.current = null
    setPendingPatternBufferKey(null)
    resolveDisplayCommitWaiter(false)
  }, [resolveDisplayCommitWaiter, syncPatternBuffers])

  const queueDisplayImage = useCallback((
    src: string,
    width: number,
    height: number,
    token: number,
  ): Promise<boolean> => new Promise((resolve) => {
    if (!imageSrcRef.current || src === imageSrcRef.current) {
      const key = activePatternBufferKeyRef.current
      commitDisplayImage(src, width, height, key)
      resolve(true)
      return
    }
    const key: PatternBufferKey = activePatternBufferKeyRef.current === 'a' ? 'b' : 'a'
    displayCommitWaiterRef.current = resolve
    preloadPendingRef.current = { src, width, height, key }
    patternBuffersRef.current[key] = src
    syncPatternBuffers()
    setPendingPatternBufferKey(key)
    setTimeout(() => {
      if (token !== refreshTokenRef.current) {
        resolveDisplayCommitWaiter(false)
        return
      }
      const pending = preloadPendingRef.current
      if (!pending || pending.src !== src || pending.key !== key) {
        resolveDisplayCommitWaiter(false)
        return
      }
      patternBuffersRef.current[key] = ''
      syncPatternBuffers()
      preloadPendingRef.current = null
      setPendingPatternBufferKey(null)
      resolveDisplayCommitWaiter(false)
    }, 5000)
  }), [commitDisplayImage, resolveDisplayCommitWaiter, syncPatternBuffers])

  const refreshDisplay = useCallback(async (silent = false): Promise<boolean> => {
    const token = refreshTokenRef.current + 1
    refreshTokenRef.current = token
    cancelPreload()
    try {
      const tempFilePath = await canvasToTempFile(CANVAS_ID)
      if (token !== refreshTokenRef.current) return false
      // 显示尺寸固定为逻辑画布大小，避免 getImageInfo 偶发尺寸差导致缩放闪跳
      const committed = await queueDisplayImage(tempFilePath, canvasWidth, canvasHeight, token)
      return committed && token === refreshTokenRef.current
    } catch {
      if (token === refreshTokenRef.current && !silent) {
        Taro.showToast({ title: '图纸渲染失败', icon: 'none' })
      }
      return false
    } finally {
      if (token === refreshTokenRef.current) {
        setInitialLoading(false)
      }
    }
  }, [cancelPreload, canvasHeight, canvasWidth, queueDisplayImage])

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
        const ctx = fullRedraw(node, patternRef.current)
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
  initCanvasRef.current = initCanvas

  const redrawAndRefresh = useCallback(async () => {
    const node = canvasRef.current
    if (!node) return
    const ctx = fullRedraw(node, patternRef.current)
    if (!ctx) return
    ctxRef.current = ctx
    await refreshDisplay(true)
  }, [fullRedraw, refreshDisplay])

  useEffect(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    setCanUndo(false)
    setCanRedo(false)
    setBrushColorId(pickDefaultBrushColor(patternRef.current))
    brushColorRef.current = pickDefaultBrushColor(patternRef.current)
    setTool('pan')
    toolRef.current = 'pan'
    setPickerVisible(false)
    paintOverlayMapRef.current.clear()
    setPaintOverlays([])
    pendingHighlightsRef.current = []
    multiTouchRef.current = false
    drawPanActiveRef.current = false
    pendingTapRef.current = null
    lastTapRef.current = null
    sourcePixelsRef.current = null
    if (highlightRafRef.current != null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(highlightRafRef.current)
      }
      highlightRafRef.current = null
    }
    setPreviewRefreshing(false)
    previewRefreshSeqRef.current += 1
    if (previewRefreshTimerRef.current) {
      clearTimeout(previewRefreshTimerRef.current)
      previewRefreshTimerRef.current = null
    }
    strokeRef.current = null
    setImageSrc('')
    patternBuffersRef.current = { a: '', b: '' }
    activePatternBufferKeyRef.current = 'a'
    setPatternBuffers([])
    setActivePatternBufferKey('a')
    setPendingPatternBufferKey(null)
    preloadPendingRef.current = null
    imageSrcRef.current = ''
    lastGoodImageSrcRef.current = ''
    setImageSize({ width: 0, height: 0 })
    imageSizeRef.current = { width: 0, height: 0 }
    viewportInitRef.current = null
    viewportLiveRef.current = { scale: 1, x: 0, y: 0 }
    viewportLockedRef.current = false
    viewportFitKeyRef.current = ''
    setViewport({ scale: 1, x: 0, y: 0 })
    setViewportReady(false)
    setGuideLines({
      vertical: Math.round(pattern.width / 2),
      horizontal: Math.round(pattern.height / 2),
    })
    setCanvasAreaHeight(0)
    setInitialLoading(true)
    const timer = setTimeout(() => initCanvasRef.current(), 80)
    return () => {
      clearTimeout(timer)
      if (previewRefreshTimerRef.current) {
        clearTimeout(previewRefreshTimerRef.current)
        previewRefreshTimerRef.current = null
      }
    }
  }, [pattern.width, pattern.height, cellPx, config.showGrid, config.showColorCode])

  const updateAreaRect = useCallback(() => {
    Taro.createSelectorQuery()
      .select(`#${VIEWPORT_AREA_ID}`)
      .boundingClientRect((rect) => {
        const area = rect as { left: number; top: number } | null
        if (!area) return
        areaRectRef.current = {
          left: area.left,
          top: area.top,
          ready: true,
        }
      })
      .exec()
  }, [])

  /** slackPx > 0 时允许滑出画布一小段并贴边取格，用于笔画不断在边缘 */
  const toLogicalPoint = useCallback((
    touch: ScreenTouch,
    slackPx = 0,
  ): { x: number; y: number } | null => {
    const area = areaRectRef.current
    const size = imageSizeRef.current
    const vp = viewportLiveRef.current
    if (!area.ready || !size.width || !size.height) return null
    const x = (touch.clientX - area.left - vp.x) / vp.scale
    const y = (touch.clientY - area.top - vp.y) / vp.scale
    if (
      x < -slackPx
      || y < -slackPx
      || x > size.width + slackPx
      || y > size.height + slackPx
    ) return null
    if (slackPx <= 0) return { x, y }
    return {
      x: Math.min(Math.max(x, 0), size.width - 0.001),
      y: Math.min(Math.max(y, 0), size.height - 0.001),
    }
  }, [])

  const resolveLogicalPoint = useCallback((touch: ScreenTouch): Promise<{ x: number; y: number } | null> => (
    new Promise((resolve) => {
      Taro.createSelectorQuery()
        .select(`#${VIEWPORT_AREA_ID}`)
        .boundingClientRect((rect) => {
          const area = rect as { left: number; top: number } | null
          if (area) {
            areaRectRef.current = {
              left: area.left,
              top: area.top,
              ready: true,
            }
          }
          resolve(toLogicalPoint(touch))
        })
        .exec()
    })
  ), [toLogicalPoint])

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

  const cancelHighlightFlush = useCallback(() => {
    if (highlightRafRef.current == null) return
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(highlightRafRef.current)
    }
    highlightRafRef.current = null
  }, [])

  const flushPendingHighlights = useCallback(() => {
    highlightRafRef.current = null
    const batch = pendingHighlightsRef.current
    if (batch.length === 0) return
    pendingHighlightsRef.current = []
    batch.forEach((item) => {
      paintOverlayMapRef.current.set(item.index, item)
    })
    setPaintOverlays(Array.from(paintOverlayMapRef.current.values()))
  }, [])

  const queueHighlight = useCallback((highlight: CellHighlight) => {
    pendingHighlightsRef.current.push(highlight)
    if (highlightRafRef.current != null) return
    const schedule = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16) as unknown as number
    highlightRafRef.current = schedule(() => {
      flushPendingHighlights()
    })
  }, [flushPendingHighlights])

  const clearPaintOverlays = useCallback(() => {
    paintOverlayMapRef.current.clear()
    pendingHighlightsRef.current = []
    cancelHighlightFlush()
    setPaintOverlays([])
  }, [cancelHighlightFlush])

  const paintDirtyCells = useCallback((
    nextPattern: PatternResult,
    indices: Iterable<number>,
  ) => {
    const ctx = ctxRef.current
    if (!ctx) return
    for (const index of indices) {
      const { col, row } = cellIndexToCoord(nextPattern, index)
      paintPatternCell(ctx, nextPattern, col, row, paintOptions)
    }
  }, [paintOptions])

  /** 离屏 canvas 已局部更新；整图导出做空闲合并，避免每笔换底图闪烁 */
  const runPreviewRefresh = useCallback(async (options?: {
    loadingDelayMs?: number
  }) => {
    const seq = previewRefreshSeqRef.current + 1
    previewRefreshSeqRef.current = seq
    let refreshedSuccessfully = false
    let loadingTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (previewRefreshSeqRef.current === seq) {
        setPreviewRefreshing(true)
      }
    }, options?.loadingDelayMs ?? PREVIEW_REFRESH_LOADING_MS)
    try {
      const refreshed = await refreshDisplay(true)
      refreshedSuccessfully = refreshed
      if (previewRefreshSeqRef.current !== seq) return
      // 笔画进行中保留 overlay，避免导出完成时清掉正在涂的预览
      if (refreshed && !strokeRef.current?.active) {
        setTimeout(() => {
          if (previewRefreshSeqRef.current === seq && !strokeRef.current?.active) {
            clearPaintOverlays()
            setMajorGridSuspended(false)
          }
        }, PREVIEW_OVERLAY_CLEAR_DELAY_MS)
      }
    } finally {
      if (loadingTimer) {
        clearTimeout(loadingTimer)
        loadingTimer = null
      }
      if (previewRefreshSeqRef.current === seq) {
        setPreviewRefreshing(false)
        if (!refreshedSuccessfully && !strokeRef.current?.active) {
          setMajorGridSuspended(false)
        }
      }
    }
  }, [clearPaintOverlays, refreshDisplay])

  const schedulePreviewRefresh = useCallback((options?: {
    immediate?: boolean
    delayMs?: number
    showLoadingOnSchedule?: boolean
  }) => {
    const showLoading = options?.showLoadingOnSchedule ?? false
    if (previewRefreshTimerRef.current) {
      clearTimeout(previewRefreshTimerRef.current)
      previewRefreshTimerRef.current = null
    }
    if (showLoading) {
      setPreviewRefreshing(true)
    }
    if (options?.immediate) {
      void runPreviewRefresh({
        loadingDelayMs: showLoading ? 0 : undefined,
      })
      return
    }
    previewRefreshTimerRef.current = setTimeout(() => {
      previewRefreshTimerRef.current = null
      void runPreviewRefresh({
        loadingDelayMs: showLoading ? 0 : undefined,
      })
    }, options?.delayMs ?? PREVIEW_REFRESH_IDLE_MS)
  }, [runPreviewRefresh])

  const beginStroke = useCallback((colorId: string, col: number, row: number) => {
    // 开笔拷一份 grid，笔画内可变写，避免每格 slice + finalize
    const current = patternRef.current
    patternRef.current = {
      ...current,
      grid: current.grid.slice(),
    }
    strokeRef.current = {
      active: true,
      colorId,
      touched: new Set(),
      changes: [],
      lastCol: col,
      lastRow: row,
      startedAt: Date.now(),
    }
    setMajorGridSuspended(true)
  }, [])

  const paintCell = useCallback((col: number, row: number, colorId: string) => {
    const stroke = strokeRef.current
    if (!stroke) return
    const pattern = patternRef.current
    if (col < 0 || row < 0 || col >= pattern.width || row >= pattern.height) {
      return
    }
    const index = coordToCellIndex(pattern, col, row)
    if (stroke.touched.has(index)) return
    stroke.touched.add(index)

    const prevColorId = pattern.grid[index] ?? ''
    if (prevColorId === colorId) return

    pattern.grid[index] = colorId
    stroke.changes.push({ index, prevColorId })
    // 滑动中只靠 overlay 跟手，不写 HD canvas、不算 stats
    queueHighlight({
      index,
      col,
      row,
      color: resolvePaintPreviewColor(colorId),
    })
  }, [queueHighlight])

  const paintAtLogicalPoint = useCallback((x: number, y: number, colorId: string) => {
    const stroke = strokeRef.current
    if (!stroke) return
    const size = imageSizeRef.current
    const touchCellPx = size.width > 0
      ? size.width / patternRef.current.width
      : cellPx
    const coord = coordFromTouchNearest(x, y, touchCellPx, patternRef.current)
    if (!coord) return

    forEachCellOnSegment(
      stroke.lastCol,
      stroke.lastRow,
      coord.col,
      coord.row,
      (col, row) => paintCell(col, row, colorId),
    )
    stroke.lastCol = coord.col
    stroke.lastRow = coord.row
  }, [cellPx, paintCell])

  const endStroke = useCallback(() => {
    const stroke = strokeRef.current
    strokeRef.current = null
    cancelHighlightFlush()
    flushPendingHighlights()

    if (!stroke || stroke.changes.length === 0) {
      setMajorGridSuspended(false)
      return
    }

    const current = patternRef.current
    const finalized = finalizePattern(current.width, current.height, current.grid)
    patternRef.current = finalized

    undoStackRef.current.push({
      kind: 'batch',
      changes: stroke.changes,
      nextColorId: stroke.colorId,
    })
    if (undoStackRef.current.length > MAX_UNDO) {
      undoStackRef.current.shift()
    }
    redoStackRef.current = []
    setCanUndo(true)
    setCanRedo(false)
    // 立即落盘：边缘手势打断后页面可能马上退出，防抖写入会来不及
    onPatternChange(finalized, { immediate: true })

    // 离屏脏格 + overlay 跟手；双缓冲确保换图稳定，iOS/Android 走同一刷新节奏。
    paintDirtyCells(finalized, stroke.changes.map((item) => item.index))
    schedulePreviewRefresh()
  }, [
    cancelHighlightFlush,
    flushPendingHighlights,
    onPatternChange,
    paintDirtyCells,
    schedulePreviewRefresh,
  ])

  /** 撤销本笔：多指手势误触时把已画的格子还原 */
  const cancelStroke = useCallback(() => {
    const stroke = strokeRef.current
    strokeRef.current = null
    cancelHighlightFlush()
    pendingHighlightsRef.current = []

    if (stroke && stroke.changes.length > 0) {
      const reverted = revertPatternEdit(patternRef.current, {
        kind: 'batch',
        changes: stroke.changes,
        nextColorId: stroke.colorId,
      })
      patternRef.current = reverted
      paintDirtyCells(reverted, stroke.changes.map((item) => item.index))
    }
    clearPaintOverlays()
    setMajorGridSuspended(false)
  }, [cancelHighlightFlush, clearPaintOverlays, paintDirtyCells])

  /** 原图裁剪区按接近原分辨率缓存一份像素，取色时按点击位置直接查 */
  const loadSourcePixels = useCallback(async () => {
    const crop = activeSourceCrop
    if (!sourceImagePath || !crop) return null
    const fit = Math.min(1, SOURCE_SAMPLE_MAX_EDGE / Math.max(crop.width, crop.height))
    const bufferWidth = Math.max(1, Math.round(crop.width * fit))
    const bufferHeight = Math.max(1, Math.round(crop.height * fit))
    const key = [
      sourceImagePath,
      crop.x, crop.y, crop.width, crop.height,
      bufferWidth, bufferHeight,
    ].join(':')
    if (sourcePixelsRef.current?.key === key) return sourcePixelsRef.current

    const canvas = await loadCanvasNode(CROP_CANVAS_ID)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    canvas.width = bufferWidth
    canvas.height = bufferHeight
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    // 关闭插值：描边等纯色不会被邻近像素平均成灰
    ctx.imageSmoothingEnabled = false
    const image = await loadCanvasImageWithRetry(canvas, sourceImagePath)
    ctx.clearRect(0, 0, bufferWidth, bufferHeight)
    ctx.drawImage(
      image as unknown as CanvasImageSource,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      bufferWidth,
      bufferHeight,
    )
    const { data } = ctx.getImageData(0, 0, bufferWidth, bufferHeight)
    sourcePixelsRef.current = { key, data, width: bufferWidth, height: bufferHeight }
    return sourcePixelsRef.current
  }, [activeSourceCrop, sourceImagePath])

  const applyPickedColor = useCallback((colorId: string, options?: { stayOnEyedropper?: boolean }) => {
    setBrushColorId(colorId)
    brushColorRef.current = colorId
    if (options?.stayOnEyedropper) {
      setTool('eyedropper')
      toolRef.current = 'eyedropper'
    } else {
      setTool('brush')
      toolRef.current = 'brush'
    }
    Taro.showToast({ title: `已取色 ${colorId}`, icon: 'none', duration: 800 })
  }, [])

  /** u/v 为整张图纸归一化坐标；有正方形留白时先映射到内容区再采原图 */
  const pickColorFromSourcePoint = useCallback(async (u: number, v: number): Promise<string | null> => {
    if (!hasSourceImage) return null
    try {
      const crop = activeSourceCrop
      let localU = u
      let localV = v
      if (crop?.contentRect && (crop.squareSide ?? 0) > 0) {
        const side = crop.squareSide!
        const { x, y, width, height } = crop.contentRect
        const col = u * side
        const row = v * side
        if (col < x || col >= x + width || row < y || row >= y + height) {
          return null
        }
        localU = (col - x) / width
        localV = (row - y) / height
      }

      const pixels = await loadSourcePixels()
      if (!pixels) return null
      const px = clampIndex(Math.floor(localU * pixels.width), pixels.width)
      const py = clampIndex(Math.floor(localV * pixels.height), pixels.height)
      const rgb = dominantRgbInWindow(
        pixels.data,
        pixels.width,
        pixels.height,
        px,
        py,
        SOURCE_SAMPLE_RADIUS,
      )
      return rgb ? matchRgbToColorId(rgb) : null
    } catch {
      return null
    }
  }, [activeSourceCrop, hasSourceImage, loadSourcePixels])

  const pickColorAtPoint = useCallback(async (x: number, y: number) => {
    const size = imageSizeRef.current
    const touchCellPx = size.width > 0
      ? size.width / patternRef.current.width
      : cellPx
    const coord = coordFromTouchNearest(x, y, touchCellPx, patternRef.current)
    if (!coord) return

    const u = size.width > 0 ? x / size.width : 0
    const v = size.height > 0 ? y / size.height : 0

    // 原图：按点击位置采原始像素匹配色号
    if (layerMode === 'source' && hasSourceImage) {
      const matched = await pickColorFromSourcePoint(u, v)
      if (matched) {
        applyPickedColor(matched, { stayOnEyedropper: true })
        return
      }
      Taro.showToast({ title: '该位置无法取色', icon: 'none' })
      return
    }

    const index = coordToCellIndex(patternRef.current, coord.col, coord.row)
    const colorId = patternRef.current.grid[index] ?? ''

    // 对照：图纸有色号用图纸；空白格取下层原图像素
    if (isEmptyCell(colorId)) {
      if (layerMode === 'compare' && hasSourceImage) {
        const matched = await pickColorFromSourcePoint(u, v)
        if (matched) {
          applyPickedColor(matched)
          return
        }
      }
      Taro.showToast({ title: '空白格，请换一格取色', icon: 'none' })
      return
    }
    applyPickedColor(colorId)
  }, [
    applyPickedColor,
    cellPx,
    hasSourceImage,
    layerMode,
    pickColorFromSourcePoint,
  ])

  const startPaintAtPoint = useCallback((point: { x: number; y: number }) => {
    const colorId = toolRef.current === 'eraser' ? PATTERN_EMPTY_CELL : brushColorRef.current
    if (toolRef.current === 'brush' && !colorId) {
      Taro.showToast({ title: '请先取色或选色', icon: 'none' })
      return
    }
    const size = imageSizeRef.current
    const touchCellPx = size.width > 0
      ? size.width / patternRef.current.width
      : cellPx
    const coord = coordFromTouchNearest(point.x, point.y, touchCellPx, patternRef.current)
    if (!coord) return
    beginStroke(colorId, coord.col, coord.row)
    paintCell(coord.col, coord.row, colorId)
  }, [beginStroke, cellPx, paintCell])

  /** 把图纸上所有 sourceColorId 批量换成当前画笔色 */
  const replaceSameColorWithBrush = useCallback((sourceColorId: string) => {
    const nextColorId = brushColorRef.current
    if (!nextColorId) {
      Taro.showToast({ title: '请先取色或选色', icon: 'none' })
      return
    }
    const sameColor = isEmptyCell(sourceColorId)
      ? isEmptyCell(nextColorId)
      : sourceColorId === nextColorId
    if (sameColor) {
      Taro.showToast({ title: '已是画笔颜色', icon: 'none' })
      return
    }

    if (strokeRef.current?.active) {
      cancelStroke()
    }

    const { pattern: nextPattern, edit } = applyPatternBatchReplace(
      patternRef.current,
      sourceColorId,
      nextColorId,
    )
    if (!edit || edit.changes.length === 0) {
      Taro.showToast({ title: '没有可替换的格子', icon: 'none' })
      return
    }

    patternRef.current = nextPattern
    undoStackRef.current.push(edit)
    if (undoStackRef.current.length > MAX_UNDO) {
      undoStackRef.current.shift()
    }
    redoStackRef.current = []
    setCanUndo(true)
    setCanRedo(false)
    onPatternChange(nextPattern, { immediate: true })

    const preview = resolvePaintPreviewColor(nextColorId)
    edit.changes.forEach(({ index }) => {
      const { col, row } = cellIndexToCoord(nextPattern, index)
      queueHighlight({ index, col, row, color: preview })
    })
    flushPendingHighlights()
    paintDirtyCells(nextPattern, edit.changes.map((item) => item.index))
    schedulePreviewRefresh()

    const fromLabel = isEmptyCell(sourceColorId) ? '空白' : sourceColorId
    Taro.showToast({
      title: `已将 ${fromLabel} 替换为 ${nextColorId}（${edit.changes.length}格）`,
      icon: 'none',
      duration: 1200,
    })
  }, [
    cancelStroke,
    flushPendingHighlights,
    onPatternChange,
    paintDirtyCells,
    queueHighlight,
    schedulePreviewRefresh,
  ])

  const resolveTouchCell = useCallback((touch: ScreenTouch) => {
    const point = toLogicalPoint(touch)
    if (!point) return null
    const size = imageSizeRef.current
    const touchCellPx = size.width > 0
      ? size.width / patternRef.current.width
      : cellPx
    const coord = coordFromTouchNearest(point.x, point.y, touchCellPx, patternRef.current)
    if (!coord) return null
    const index = coordToCellIndex(patternRef.current, coord.col, coord.row)
    const sourceColorId = patternRef.current.grid[index] ?? ''
    return { ...coord, sourceColorId }
  }, [cellPx, toLogicalPoint])

  /**
   * 双击同一格：批量把该格原色号全部换成画笔色。
   * 返回 true 表示已消费本次触摸。
   */
  const consumeDoubleTap = useCallback((touch: ScreenTouch): boolean => {
    if (layerMode === 'source') return false
    if (toolRef.current === 'eyedropper') return false

    const cell = resolveTouchCell(touch)
    if (!cell) return false

    const now = Date.now()
    const last = lastTapRef.current
    const isDouble = Boolean(
      last
      && last.col === cell.col
      && last.row === cell.row
      && now - last.time <= DOUBLE_TAP_MS,
    )

    if (isDouble && last) {
      lastTapRef.current = null
      replaceSameColorWithBrush(last.sourceColorId)
      return true
    }

    lastTapRef.current = {
      time: now,
      col: cell.col,
      row: cell.row,
      sourceColorId: cell.sourceColorId,
      clientX: touch.clientX,
      clientY: touch.clientY,
    }
    return false
  }, [layerMode, replaceSameColorWithBrush, resolveTouchCell])

  /** 第二根手指落下判定为缩放/拖动；刚落笔的误触回滚，已成形的笔画照常提交 */
  const blockForMultiTouch = () => {
    multiTouchRef.current = true
    pendingTapRef.current = null
    lastTapRef.current = null
    const stroke = strokeRef.current
    if (!stroke?.active) return
    const worthKeeping = stroke.changes.length >= MULTI_TOUCH_KEEP_MIN_CELLS
      && Date.now() - stroke.startedAt >= MULTI_TOUCH_KEEP_MIN_MS
    if (worthKeeping) {
      void endStroke()
    } else {
      cancelStroke()
    }
  }

  const handleLongPressPanChange = useCallback((active: boolean) => {
    drawPanActiveRef.current = active
    if (!active) return
    lastTapRef.current = null
    // 长按成立前可能已落下一格，撤销误触后再拖动画布
    if (strokeRef.current?.active) {
      cancelStroke()
    }
  }, [cancelStroke])

  const handleWrapTouchStart = (event: {
    touches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
  }) => {
    if (pickerVisible) return
    const touches = event.touches ?? []
    if (touches.length > 1) {
      blockForMultiTouch()
      return
    }
    if (multiTouchRef.current) return
    if (drawPanActiveRef.current) return

    const currentTool = toolRef.current
    const touch = readScreenTouch(touches[0])
    if (!touch) return

    updateAreaRect()

    // 浏览 / 画笔 / 橡皮：双击同色批量替换为画笔色
    if (
      currentTool === 'pan'
      || currentTool === 'brush'
      || currentTool === 'eraser'
    ) {
      if (consumeDoubleTap(touch)) return
    }

    if (
      currentTool !== 'brush'
      && currentTool !== 'eraser'
      && currentTool !== 'eyedropper'
    ) return
    // 原图层禁止着色/擦除
    if (layerMode === 'source' && (currentTool === 'brush' || currentTool === 'eraser')) return

    if (currentTool === 'eyedropper') {
      // 取色等抬手再判定，避免拖动画布时误取
      pendingTapRef.current = touch
      return
    }

    const synced = toLogicalPoint(touch)
    if (synced) {
      startPaintAtPoint(synced)
      return
    }
    void resolveLogicalPoint(touch).then((point) => {
      if (!point || multiTouchRef.current || drawPanActiveRef.current || strokeRef.current?.active) {
        return
      }
      startPaintAtPoint(point)
    })
  }

  const handleWrapTouchMove = (event: {
    touches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
    changedTouches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
    stopPropagation?: () => void
  }) => {
    if (pickerVisible) return
    if (drawPanActiveRef.current) return
    const touches = event.touches ?? []
    if (touches.length > 1) {
      blockForMultiTouch()
      return
    }
    if (multiTouchRef.current) return

    const touch = readScreenTouch(touches[0] ?? event.changedTouches?.[0] ?? {})
    if (!touch) return

    const pendingTap = pendingTapRef.current
    if (pendingTap) {
      const moved = Math.hypot(
        touch.clientX - pendingTap.clientX,
        touch.clientY - pendingTap.clientY,
      )
      if (moved > TAP_MOVE_TOLERANCE) pendingTapRef.current = null
      return
    }

    // 滑动涂了多格后，不再作为双击候选
    if (strokeRef.current?.active && strokeRef.current.touched.size > 1) {
      lastTapRef.current = null
    } else if (lastTapRef.current && toolRef.current === 'pan') {
      // 浏览模式拖动画布时取消双击候选
      const last = lastTapRef.current
      const moved = Math.hypot(
        touch.clientX - last.clientX,
        touch.clientY - last.clientY,
      )
      if (moved > TAP_MOVE_TOLERANCE) lastTapRef.current = null
    }

    if (toolRef.current !== 'brush' && toolRef.current !== 'eraser') return
    if (layerMode === 'source') return
    if (!strokeRef.current?.active) return
    event.stopPropagation?.()

    const size = imageSizeRef.current
    const strokeCellPx = size.width > 0
      ? size.width / patternRef.current.width
      : cellPx
    const point = toLogicalPoint(touch, strokeCellPx * STROKE_EDGE_SLACK_CELLS)
    if (!point) return
    paintAtLogicalPoint(point.x, point.y, strokeRef.current.colorId)
  }

  const handleWrapTouchEnd = (event: {
    touches?: Array<unknown>
  }) => {
    const remaining = event.touches?.length ?? 0
    if (remaining > 0) {
      // 多指手势中途松开一根，仍不作绘制处理
      blockForMultiTouch()
      return
    }

    const wasMultiTouch = multiTouchRef.current
    multiTouchRef.current = false
    const wasDrawPan = drawPanActiveRef.current
    drawPanActiveRef.current = false
    const pendingTap = pendingTapRef.current
    pendingTapRef.current = null

    if (wasMultiTouch) {
      lastTapRef.current = null
      if (strokeRef.current?.active) cancelStroke()
      return
    }

    // 长按拖结束：笔画应已在进入拖时取消
    if (wasDrawPan) {
      lastTapRef.current = null
      if (strokeRef.current?.active) cancelStroke()
      return
    }

    if (pendingTap && toolRef.current === 'eyedropper') {
      lastTapRef.current = null
      const point = toLogicalPoint(pendingTap)
      if (point) void pickColorAtPoint(point.x, point.y)
      return
    }

    if (strokeRef.current?.active) {
      if (strokeRef.current.touched.size > 1) {
        lastTapRef.current = null
      }
      void endStroke()
    }
  }

  /**
   * 系统手势打断（iOS 边缘右滑返回、来电等）只发 touchcancel 不发 touchend。
   * 不处理的话笔画会一直挂在 strokeRef 上：已画的格子丢失，之后的笔画也全部失效。
   */
  const handleWrapTouchCancel = () => {
    multiTouchRef.current = false
    drawPanActiveRef.current = false
    pendingTapRef.current = null
    lastTapRef.current = null
    if (strokeRef.current?.active) void endStroke()
  }

  const initialViewport = useMemo((): ViewportTransform | null => {
    // 等视口真实高度量到后再 fit，避免用占位高度算出过大/过小缩放
    if (!imageSize.width || !imageSize.height || canvasAreaHeight < 80) return null
    return {
      scale: initialScale,
      x: initialPosition.x,
      y: initialPosition.y,
    }
  }, [canvasAreaHeight, imageSize.width, imageSize.height, initialScale, initialPosition.x, initialPosition.y])

  useLayoutEffect(() => {
    if (!initialViewport) return
    const fitKey = `${canvasWidth}x${canvasHeight}:${canvasAreaHeight}`
    viewportInitRef.current = initialViewport

    if (!viewportReady) {
      viewportLiveRef.current = initialViewport
      commitViewportState(initialViewport)
      viewportFitKeyRef.current = fitKey
      setViewportReady(true)
      return
    }

    // 用户已拖过/缩放过：保持当前视口
    if (viewportLockedRef.current) return
    // 涂色换底图时 imageSrc 会变，但逻辑画布尺寸不变 —— 不要重 fit
    if (viewportFitKeyRef.current === fitKey) return

    viewportFitKeyRef.current = fitKey
    viewportLiveRef.current = initialViewport
    commitViewportState(initialViewport)
  }, [
    canvasAreaHeight,
    canvasHeight,
    canvasWidth,
    commitViewportState,
    initialViewport,
    viewportReady,
  ])

  const showViewport = Boolean(imageSrc && !initialLoading && initialViewport)
  const showEditorViewport = showViewport && viewportReady

  useLayoutEffect(() => {
    // 打开色板 / 换底图 src 都不要重测，否则会改高度并误触发重 fit
    measureViewportFrame()
  }, [measureViewportFrame, initialLoading, showEditorViewport])

  useEffect(() => {
    if (!showEditorViewport) return
    updateAreaRect()
  }, [showEditorViewport, updateAreaRect, viewport.scale, viewport.x, viewport.y])

  const handleViewportChange = useCallback((next: ViewportTransform) => {
    viewportLockedRef.current = true
    commitViewportState(next)
  }, [commitViewportState])

  const highlightCellPx = imageSize.width > 0
    ? imageSize.width / pattern.width
    : cellPx

  const handleUndo = async () => {
    if (!canUndo) return
    const entry = undoStackRef.current.pop()
    if (!entry) {
      setCanUndo(false)
      return
    }
    const nextPattern = revertPatternEdit(patternRef.current, entry)
    patternRef.current = nextPattern
    redoStackRef.current.push(entry)
    if (redoStackRef.current.length > MAX_UNDO) {
      redoStackRef.current.shift()
    }
    onPatternChange(nextPattern, { immediate: true })
    setCanUndo(undoStackRef.current.length > 0)
    setCanRedo(true)
    clearPaintOverlays()
    // 取消待合并的抬笔导出，直接全量刷新底图
    if (previewRefreshTimerRef.current) {
      clearTimeout(previewRefreshTimerRef.current)
      previewRefreshTimerRef.current = null
    }
    previewRefreshSeqRef.current += 1
    await redrawAndRefresh()
  }

  const handleRedo = async () => {
    if (!canRedo) return
    const entry = redoStackRef.current.pop()
    if (!entry) {
      setCanRedo(false)
      return
    }
    const nextPattern = applyPatternEdit(patternRef.current, entry)
    patternRef.current = nextPattern
    undoStackRef.current.push(entry)
    if (undoStackRef.current.length > MAX_UNDO) {
      undoStackRef.current.shift()
    }
    onPatternChange(nextPattern, { immediate: true })
    setCanUndo(true)
    setCanRedo(redoStackRef.current.length > 0)
    clearPaintOverlays()
    if (previewRefreshTimerRef.current) {
      clearTimeout(previewRefreshTimerRef.current)
      previewRefreshTimerRef.current = null
    }
    previewRefreshSeqRef.current += 1
    await redrawAndRefresh()
  }

  const selectTool = (next: EditorTool) => {
    if ((next === 'brush' || next === 'eraser') && layerMode === 'source') {
      Taro.showToast({ title: '原图层不可着色，请先切换图层', icon: 'none' })
      return
    }
    // 再次点击当前工具可退回浏览模式
    if (toolRef.current === next) {
      setTool('pan')
      toolRef.current = 'pan'
      return
    }
    setTool(next)
    toolRef.current = next
  }

  const selectLayerMode = (next: EditorLayerMode) => {
    if (next !== 'pattern' && !hasSourceImage) {
      Taro.showToast({ title: '当前没有原图可对照', icon: 'none' })
      return
    }
    setLayerMode(next)
    const label = LAYER_OPTIONS.find((item) => item.key === next)?.label || next
    Taro.showToast({ title: `图层：${label}`, icon: 'none', duration: 700 })
  }

  const openBrushPalette = () => {
    setPickerVisible(true)
  }

  const updateDisplaySetting = (key: keyof EditorDisplaySettings, value: boolean) => {
    onDisplaySettingsChange({
      ...displaySettings,
      [key]: value,
    })
  }

  const handleConfirmBrushColor = (colorId: string) => {
    setBrushColorId(colorId)
    brushColorRef.current = colorId
    // 原图层不可着色，仅换色不切画笔
    if (!drawToolsDisabled) {
      setTool('brush')
      toolRef.current = 'brush'
    }
    setPickerVisible(false)
  }

  const brushSwatchStyle = getBeadSwatchStyle(brushColorId, getColorById(brushColorId)?.hex)
  const brushToolEnabled = !drawToolsDisabled
  const eraserToolEnabled = !drawToolsDisabled
  const quickPalette = buildQuickPalette(pattern, brushColorId)
  const railCenterStyle = canvasAreaHeightForLayout > 0
    ? { top: `${Math.round(topViewportReserve + canvasAreaHeightForLayout / 2)}px` }
    : undefined

  return (
    <View className='pattern-editor pattern-editor--fullscreen'>
      <View
        id='pattern-editor-viewport-frame'
        className='pattern-editor__viewport'
      >
        {initialLoading && (
          <View className='pattern-editor__loading'>
            <Text>加载高清图...</Text>
          </View>
        )}
        {!initialLoading && previewRefreshing ? (
          <View className='pattern-editor__preview-refresh'>
            <Text>更新预览…</Text>
          </View>
        ) : null}

        <View id={SETTINGS_BAR_ID} className='pattern-editor__display-settings-bar'>
          <View
            className={`pattern-editor__display-setting${displaySettings.showGuideLines ? ' is-active' : ''}`}
            onClick={() => updateDisplaySetting('showGuideLines', !displaySettings.showGuideLines)}
          >
            <View className='pattern-editor__display-setting-dot' />
            <Text className='pattern-editor__display-setting-label'>辅助线</Text>
          </View>
          <View
            className={`pattern-editor__display-setting${displaySettings.showMajorGridLines ? ' is-active' : ''}`}
            onClick={() => updateDisplaySetting('showMajorGridLines', !displaySettings.showMajorGridLines)}
          >
            <View className='pattern-editor__display-setting-dot' />
            <Text className='pattern-editor__display-setting-label'>五格线</Text>
          </View>
        </View>

        {showEditorViewport && (
          <EditorViewport
            patternBuffers={patternBuffers}
            activePatternBufferKey={activePatternBufferKey}
            pendingPatternBufferKey={pendingPatternBufferKey}
            sourceImageSrc={hasSourceImage ? sourceImagePath : ''}
            sourceCrop={activeSourceCrop}
            layerMode={hasSourceImage ? layerMode : 'pattern'}
            gestureMode={gestureMode}
            imageWidth={imageSize.width}
            imageHeight={imageSize.height}
            gridCols={pattern.width}
            gridRows={pattern.height}
            viewport={viewport}
            interactive={!pickerVisible}
            highlights={paintOverlays}
            highlightCellPx={highlightCellPx}
            guideLines={guideLines}
            showGuideLines={displaySettings.showGuideLines}
            showMajorGridLines={displaySettings.showMajorGridLines && !majorGridSuspended}
            onGuideLinesChange={setGuideLines}
            onViewportChange={handleViewportChange}
            onLongPressPanChange={handleLongPressPanChange}
            onTouchStart={handleWrapTouchStart}
            onTouchMove={handleWrapTouchMove}
            onTouchEnd={handleWrapTouchEnd}
            onTouchCancel={handleWrapTouchCancel}
            onPatternBufferLoad={handlePatternBufferLoad}
            onPatternBufferError={handlePatternBufferError}
          />
        )}

        <View className='pattern-editor__history-rail' style={railCenterStyle}>
          <View
            className={`pattern-editor__rail-button${canUndo ? ' is-enabled' : ' is-disabled'}`}
            onClick={() => {
              if (canUndo) void handleUndo()
            }}
          >
            <Image className='pattern-editor__rail-icon' src={undoIcon} mode='aspectFit' />
            <Text className='pattern-editor__rail-label'>撤销</Text>
          </View>
          <View className='pattern-editor__rail-divider' />
          <View
            className={`pattern-editor__rail-button${canRedo ? ' is-enabled' : ' is-disabled'}`}
            onClick={() => {
              if (canRedo) void handleRedo()
            }}
          >
            <Image className='pattern-editor__rail-icon' src={redoIcon} mode='aspectFit' />
            <Text className='pattern-editor__rail-label'>重做</Text>
          </View>
        </View>

        <View className='pattern-editor__layer-rail' style={railCenterStyle}>
          {LAYER_TOOL_OPTIONS.map((item, index) => {
            const enabled = item.key === 'pattern' || hasSourceImage
            const active = layerMode === item.key
            return (
              <View key={item.key} className='pattern-editor__layer-rail-item-wrap'>
                {index > 0 ? <View className='pattern-editor__rail-divider' /> : null}
                <View
                  className={`pattern-editor__layer-button${active ? ' is-active' : ''}${enabled ? ' is-enabled' : ' is-disabled'}`}
                  onClick={() => {
                    if (enabled) selectLayerMode(item.key)
                  }}
                >
                  <Image
                    className='pattern-editor__layer-icon'
                    src={active ? item.activeIcon : item.icon}
                    mode='aspectFit'
                  />
                  <Text className='pattern-editor__layer-label'>{item.label}</Text>
                </View>
              </View>
            )
          })}
        </View>
      </View>

      <View id={PALETTE_BAR_ID} className='pattern-editor__palette-bar'>
        <Text className='pattern-editor__palette-title'>当前颜色</Text>
        <View className='pattern-editor__current-picker' onClick={openBrushPalette}>
          <View className='pattern-editor__current-color'>
            <View className='pattern-editor__current-swatch' style={brushSwatchStyle} />
          </View>
          <View className='pattern-editor__color-code'>
            <Text className='pattern-editor__color-code-text'>{brushColorId || '色号'}</Text>
            <View className='pattern-editor__color-code-caret' />
          </View>
        </View>
        <View className='pattern-editor__palette-divider' />
        <View className='pattern-editor__quick-colors'>
          {quickPalette.map((colorId) => (
            <View
              key={colorId}
              className={`pattern-editor__quick-color${brushColorId === colorId ? ' is-active' : ''}`}
              style={getBeadSwatchStyle(colorId, getColorById(colorId)?.hex)}
              onClick={() => handleConfirmBrushColor(colorId)}
            />
          ))}
        </View>
        <View className='pattern-editor__more-colors' onClick={openBrushPalette}>
          <Text className='pattern-editor__more-colors-text'>更多色号</Text>
          <Image className='pattern-editor__more-colors-icon' src={arrowRightIcon} mode='aspectFit' />
        </View>
      </View>

      <View className='pattern-editor__bottom-bar'>
        <View
          className={`pattern-editor__tool${tool === 'eyedropper' ? ' is-enabled is-active' : ' is-enabled'}`}
          onClick={() => selectTool('eyedropper')}
        >
          <Image className='pattern-editor__tool-icon' src={colorPickerIcon} mode='aspectFit' />
          <Text className='pattern-editor__tool-label'>取色</Text>
        </View>

        <View
          className={`pattern-editor__tool${brushToolEnabled ? (tool === 'brush' ? ' is-enabled is-active' : ' is-enabled') : ' is-disabled'}`}
          onClick={() => {
            if (brushToolEnabled) selectTool('brush')
          }}
        >
          <Image className='pattern-editor__tool-icon' src={brushIcon} mode='aspectFit' />
          <Text className='pattern-editor__tool-label'>画笔</Text>
        </View>

        <View
          className={`pattern-editor__tool${eraserToolEnabled ? (tool === 'eraser' ? ' is-enabled is-active' : ' is-enabled') : ' is-disabled'}`}
          onClick={() => {
            if (eraserToolEnabled) selectTool('eraser')
          }}
        >
          <Image className='pattern-editor__tool-icon' src={eraserIcon} mode='aspectFit' />
          <Text className='pattern-editor__tool-label'>擦除</Text>
        </View>

        <View
          className={`pattern-editor__tool${tool === 'pan' ? ' is-enabled is-active' : ' is-enabled'}`}
          onClick={() => selectTool('pan')}
        >
          <Image className='pattern-editor__tool-icon' src={gestureIcon} mode='aspectFit' />
          <Text className='pattern-editor__tool-label'>手势</Text>
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
        <Canvas
          type='2d'
          id={CROP_CANVAS_ID}
          canvasId={CROP_CANVAS_ID}
          className='pattern-editor__canvas'
          style={{ width: '2px', height: '2px' }}
        />
      </View>

      {pickerVisible && (
        <ColorPickerSheet
          visible={pickerVisible}
          pattern={pattern}
          currentColorId={brushColorId}
          selectedColorIds={[brushColorId]}
          selectedCount={1}
          variant='brush'
          onConfirmColor={handleConfirmBrushColor}
          onConfirmErase={() => setPickerVisible(false)}
          onSelectAllSameColor={() => undefined}
          onClearSelection={() => undefined}
          onClose={() => setPickerVisible(false)}
        />
      )}
    </View>
  )
}
