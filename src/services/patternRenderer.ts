import { getColorById } from '@/services/palette'
import { isEmptyCell } from '@/services/patternStats'
import { drawGlobalWatermarks } from '@/services/patternWatermark'
import { MINI_PROGRAM_NAME } from '@/utils/constants'
import {
  drawTransparentBeadFill,
  getTransparentLabelColor,
  isTransparentBeadId,
} from '@/utils/transparentBead'
import type { PatternResult, RenderOptions } from '@/types'

type CanvasNode = {
  getContext: (type: '2d') => CanvasRenderingContext2D | null
  width: number
  height: number
}

const GRID_LINE_COLOR = '#d0d0d0'
const MAJOR_GRID_LINE_COLOR = '#f59e42'
const EMPTY_CELL_FILL = '#f3f4f6'
const AXIS_TEXT_COLOR = '#666666'
const HEADER_TEXT_COLOR = '#333333'
const LEGEND_TEXT_COLOR = '#444444'

const HEADER_TITLE_COLOR = '#1a1a1a'
const HEADER_META_COLOR = '#1a1a1a'
const HEADER_SEPARATOR_COLOR = '#c8c8c8'
const META_SEPARATOR = '|'

function getMetaSegmentGap(cellPx: number): number {
  return Math.max(18, Math.round(cellPx * 0.75))
}

function buildSheetMetaSegments(
  creatorNickname: string | undefined,
  gridWidth: number,
  gridHeight: number,
  totalBeads: number,
  colorCount: number,
): string[] {
  const author = creatorNickname?.trim() || '拼豆玩家'
  return [
    `作者: ${author}`,
    `规格: ${gridWidth}×${gridHeight}`,
    `总用豆数: ${totalBeads}`,
    `总色卡数: ${colorCount}`,
  ]
}

function measureMetaLineWidth(
  ctx: CanvasRenderingContext2D,
  segments: string[],
  fontSize: number,
  segmentGap: number,
): number {
  ctx.font = `700 ${fontSize}px sans-serif`
  const separatorWidth = ctx.measureText(META_SEPARATOR).width
  let width = 0
  segments.forEach((segment, index) => {
    if (index > 0) width += segmentGap + separatorWidth + segmentGap
    width += ctx.measureText(segment).width
  })
  return width
}

function resolveMetaFontSize(
  ctx: CanvasRenderingContext2D,
  segments: string[],
  maxWidth: number,
  baseFontSize: number,
  segmentGap: number,
): number {
  let fontSize = baseFontSize
  while (fontSize >= 9 && measureMetaLineWidth(ctx, segments, fontSize, segmentGap) > maxWidth) {
    fontSize -= 1
  }
  return fontSize
}

function drawSheetMetaLine(
  ctx: CanvasRenderingContext2D,
  segments: string[],
  x: number,
  y: number,
  fontSize: number,
  segmentGap: number,
): void {
  let cursorX = x
  ctx.font = `700 ${fontSize}px sans-serif`
  const separatorWidth = ctx.measureText(META_SEPARATOR).width

  segments.forEach((segment, index) => {
    if (index > 0) {
      cursorX += segmentGap
      ctx.fillStyle = HEADER_SEPARATOR_COLOR
      ctx.fillText(META_SEPARATOR, cursorX, y)
      cursorX += separatorWidth + segmentGap
    }
    ctx.fillStyle = HEADER_META_COLOR
    ctx.fillText(segment, cursorX, y)
    cursorX += ctx.measureText(segment).width
  })
}

function getSheetPadding(cellPx: number): number {
  return Math.max(32, Math.round(cellPx * 1.4))
}

function getSheetHeaderMetrics(cellPx: number) {
  const titleFontSize = Math.max(20, Math.round(cellPx * 0.8))
  const metaFontSize = Math.max(12, Math.round(cellPx * 0.5))
  const titleLineHeight = Math.round(titleFontSize * 1.3)
  const metaLineHeight = Math.round(metaFontSize * 1.45)
  const headerLineGap = Math.max(10, Math.round(cellPx * 0.38))
  const headerBottomGap = Math.max(16, Math.round(cellPx * 0.65))
  return {
    titleFontSize,
    metaFontSize,
    titleLineHeight,
    metaLineHeight,
    headerLineGap,
    headerBottomGap,
    headerHeight: titleLineHeight + headerLineGap + metaLineHeight + headerBottomGap,
  }
}

function getLabelColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#1a1a1a' : '#ffffff'
}

function drawGridCellFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellPx: number,
  colorId: string,
): void {
  if (isEmptyCell(colorId)) {
    ctx.fillStyle = EMPTY_CELL_FILL
    ctx.fillRect(Math.round(x), Math.round(y), cellPx, cellPx)
    return
  }
  if (isTransparentBeadId(colorId)) {
    drawTransparentBeadFill(ctx, x, y, cellPx)
    return
  }
  ctx.fillStyle = getColorById(colorId)?.hex ?? '#cccccc'
  ctx.fillRect(Math.round(x), Math.round(y), cellPx, cellPx)
}

function drawGridLines(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  cols: number,
  rows: number,
  cellPx: number,
): void {
  const ox = Math.round(originX)
  const oy = Math.round(originY)
  const w = cols * cellPx
  const h = rows * cellPx

  ctx.save()
  ctx.strokeStyle = GRID_LINE_COLOR
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i <= cols; i += 1) {
    const x = ox + i * cellPx + 0.5
    ctx.moveTo(x, oy)
    ctx.lineTo(x, oy + h)
  }
  for (let j = 0; j <= rows; j += 1) {
    const y = oy + j * cellPx + 0.5
    ctx.moveTo(ox, y)
    ctx.lineTo(ox + w, y)
  }
  ctx.stroke()
  ctx.restore()
}

function drawMajorGridLines(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  cols: number,
  rows: number,
  cellPx: number,
  every: number,
): void {
  if (every <= 0) return

  const ox = Math.round(originX)
  const oy = Math.round(originY)
  const w = cols * cellPx
  const h = rows * cellPx
  const lineWidth = Math.max(1.5, cellPx * 0.1)

  ctx.save()
  ctx.strokeStyle = MAJOR_GRID_LINE_COLOR
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  for (let i = 0; i <= cols; i += every) {
    const x = ox + i * cellPx
    ctx.moveTo(x, oy)
    ctx.lineTo(x, oy + h)
  }
  for (let j = 0; j <= rows; j += every) {
    const y = oy + j * cellPx
    ctx.moveTo(ox, y)
    ctx.lineTo(ox + w, y)
  }
  ctx.stroke()
  ctx.restore()
}

function drawGridCellOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellPx: number,
  colorId: string,
  showColorCode: boolean,
  minCellPxForLabel: number,
): void {
  if (isEmptyCell(colorId) || !showColorCode || cellPx < minCellPxForLabel) return

  const color = getColorById(colorId)
  if (!color) return

  const fontSize = Math.max(8, Math.floor(cellPx * 0.38))
  ctx.fillStyle = isTransparentBeadId(colorId)
    ? (color.textColor || getTransparentLabelColor())
    : getLabelColor(color.hex)
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(color.id, x + cellPx / 2, y + cellPx / 2)
}

function drawGridCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellPx: number,
  colorId: string,
  showColorCode: boolean,
  minCellPxForLabel: number,
): void {
  drawGridCellFill(ctx, x, y, cellPx, colorId)
  drawGridCellOverlay(ctx, x, y, cellPx, colorId, showColorCode, minCellPxForLabel)
}

export function renderPatternToCanvas(
  canvas: CanvasNode,
  pattern: PatternResult,
  options: RenderOptions,
): void {
  const { width, height } = pattern
  const { cellPx, showGrid, showColorCode, minCellPxForLabel = 16 } = options
  const canvasWidth = width * cellPx
  const canvasHeight = height * cellPx

  canvas.width = canvasWidth
  canvas.height = canvasHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法获取 Canvas 上下文')

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  paintPatternGrid(ctx, pattern, {
    cellPx,
    showGrid,
    showColorCode,
    minCellPxForLabel,
  })
}

export interface PatternGridPaintOptions {
  cellPx: number
  showGrid: boolean
  showColorCode: boolean
  minCellPxForLabel?: number
}

export function paintPatternGrid(
  ctx: CanvasRenderingContext2D,
  pattern: PatternResult,
  options: PatternGridPaintOptions,
): void {
  const { width, height, grid } = pattern
  const { cellPx, showGrid, showColorCode, minCellPxForLabel = 16 } = options

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      drawGridCell(
        ctx,
        x * cellPx,
        y * cellPx,
        cellPx,
        grid[y * width + x],
        showColorCode,
        minCellPxForLabel,
      )
    }
  }

  if (showGrid) {
    drawGridLines(ctx, 0, 0, width, height, cellPx)
  }
}

export function paintPatternCell(
  ctx: CanvasRenderingContext2D,
  pattern: PatternResult,
  col: number,
  row: number,
  options: PatternGridPaintOptions,
): void {
  const { width, grid } = pattern
  const { cellPx, showColorCode, minCellPxForLabel = 16 } = options
  if (col < 0 || row < 0 || col >= pattern.width || row >= pattern.height) return
  drawGridCell(
    ctx,
    col * cellPx,
    row * cellPx,
    cellPx,
    grid[row * width + col],
    showColorCode,
    minCellPxForLabel,
  )
}

export function paintCellSelectionOutline(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  cellPx: number,
): void {
  ctx.save()
  ctx.strokeStyle = '#7c3aed'
  ctx.lineWidth = Math.max(2, Math.round(cellPx * 0.12))
  const inset = ctx.lineWidth / 2
  ctx.strokeRect(
    col * cellPx + inset,
    row * cellPx + inset,
    cellPx - ctx.lineWidth,
    cellPx - ctx.lineWidth,
  )
  ctx.restore()
}

export interface SheetLayoutMetrics {
  padding: number
  headerHeight: number
  axisWidth: number
  axisHeight: number
  gridWidth: number
  gridHeight: number
  legendItemWidth: number
  legendItemHeight: number
  legendGap: number
  legendRows: number
  legendHeight: number
  width: number
  height: number
}

export function getSheetLayoutMetrics(
  pattern: PatternResult,
  cellPx: number,
  options: Pick<RenderOptions, 'showSheetHeader'> = {},
): SheetLayoutMetrics {
  const showSheetHeader = options.showSheetHeader !== false
  const padding = getSheetPadding(cellPx)
  const headerMetrics = getSheetHeaderMetrics(cellPx)
  const headerHeight = showSheetHeader ? headerMetrics.headerHeight : 0
  const axisWidth = Math.max(22, Math.round(cellPx * 0.9))
  const axisHeight = Math.max(18, Math.round(cellPx * 0.75))
  const gridWidth = pattern.width * cellPx
  const gridHeight = pattern.height * cellPx
  const legendItemWidth = Math.max(56, Math.round(cellPx * 3.2))
  const legendItemHeight = Math.max(22, Math.round(cellPx * 1.1))
  const legendGap = Math.max(6, Math.round(cellPx * 0.35))
  const contentWidth = axisWidth + gridWidth
  const colorCount = Object.keys(pattern.stats).length
  const itemsPerRow = Math.max(1, Math.floor(contentWidth / legendItemWidth))
  const legendRows = Math.ceil(colorCount / itemsPerRow)
  const legendTopGap = Math.max(16, Math.round(cellPx * 0.55))
  const legendHeight =
    legendRows > 0
      ? legendTopGap + legendRows * legendItemHeight + (legendRows - 1) * legendGap
      : 0

  return {
    padding,
    headerHeight,
    axisWidth,
    axisHeight,
    gridWidth,
    gridHeight,
    legendItemWidth,
    legendItemHeight,
    legendGap,
    legendRows,
    legendHeight,
    width: padding * 2 + contentWidth,
    height: padding * 2 + headerHeight + axisHeight + gridHeight + legendHeight,
  }
}

export function renderPatternSheetToCanvas(
  canvas: CanvasNode,
  pattern: PatternResult,
  options: RenderOptions,
): void {
  const { width, height, grid, stats, totalBeads } = pattern
  const {
    cellPx,
    showGrid,
    showColorCode,
    minCellPxForLabel = 10,
    creatorNickname,
    appName = MINI_PROGRAM_NAME,
    showSheetHeader = true,
    showWatermark = true,
    majorGridEvery = 5,
    showMirrorLabel = false,
  } = options
  const layout = getSheetLayoutMetrics(pattern, cellPx, { showSheetHeader })

  canvas.width = layout.width
  canvas.height = layout.height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法获取 Canvas 上下文')

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, layout.width, layout.height)

  const gridOriginX = layout.padding + layout.axisWidth
  const gridOriginY = layout.padding + layout.headerHeight + layout.axisHeight

  if (showSheetHeader) {
    const headerMetrics = getSheetHeaderMetrics(cellPx)
    const headerTextWidth = layout.width - layout.padding * 2
    const metaSegments = buildSheetMetaSegments(
      creatorNickname,
      width,
      height,
      totalBeads,
      Object.keys(stats).length,
    )
    const metaSegmentGap = getMetaSegmentGap(cellPx)
    const metaY =
      layout.padding
      + headerMetrics.titleLineHeight
      + headerMetrics.headerLineGap
      + headerMetrics.metaLineHeight / 2

    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'

    ctx.fillStyle = HEADER_TITLE_COLOR
    ctx.font = `700 ${headerMetrics.titleFontSize}px sans-serif`
    ctx.fillText(
      appName,
      layout.padding,
      layout.padding + headerMetrics.titleLineHeight / 2,
    )

    const metaFontSize = resolveMetaFontSize(
      ctx,
      metaSegments,
      headerTextWidth,
      headerMetrics.metaFontSize,
      metaSegmentGap,
    )
    drawSheetMetaLine(ctx, metaSegments, layout.padding, metaY, metaFontSize, metaSegmentGap)

    if (showMirrorLabel) {
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = HEADER_TITLE_COLOR
      ctx.font = `700 ${headerMetrics.titleFontSize}px sans-serif`
      ctx.fillText(
        '镜像',
        layout.width - layout.padding,
        layout.padding + headerMetrics.titleLineHeight / 2,
      )
    }
  }

  const axisFontSize = Math.max(9, Math.round(cellPx * 0.45))
  ctx.fillStyle = AXIS_TEXT_COLOR
  ctx.font = `${axisFontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (let x = 0; x < width; x += 1) {
    ctx.fillText(
      String(x + 1),
      gridOriginX + x * cellPx + cellPx / 2,
      layout.padding + layout.headerHeight + layout.axisHeight / 2,
    )
  }

  ctx.textAlign = 'right'
  for (let y = 0; y < height; y += 1) {
    ctx.fillText(
      String(y + 1),
      gridOriginX - 6,
      gridOriginY + y * cellPx + cellPx / 2,
    )
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      drawGridCellFill(
        ctx,
        gridOriginX + x * cellPx,
        gridOriginY + y * cellPx,
        cellPx,
        grid[y * width + x],
      )
    }
  }

  if (showGrid) {
    drawGridLines(ctx, gridOriginX, gridOriginY, width, height, cellPx)
    drawMajorGridLines(ctx, gridOriginX, gridOriginY, width, height, cellPx, majorGridEvery)
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      drawGridCellOverlay(
        ctx,
        gridOriginX + x * cellPx,
        gridOriginY + y * cellPx,
        cellPx,
        grid[y * width + x],
        showColorCode,
        minCellPxForLabel,
      )
    }
  }

  const legendTop = gridOriginY + layout.gridHeight + Math.max(16, Math.round(cellPx * 0.55))
  const entries = Object.entries(stats).sort((a, b) => b[1] - a[1])
  const itemsPerRow = Math.max(1, Math.floor((layout.axisWidth + layout.gridWidth) / layout.legendItemWidth))
  const swatchSize = Math.max(14, Math.round(cellPx * 0.7))
  const legendFontSize = Math.max(9, Math.round(cellPx * 0.42))

  entries.forEach(([id, count], index) => {
    const row = Math.floor(index / itemsPerRow)
    const col = index % itemsPerRow
    const itemX = layout.padding + col * layout.legendItemWidth
    const itemY = legendTop + row * (layout.legendItemHeight + layout.legendGap)
    const color = getColorById(id)
    const swatchX = Math.round(itemX)
    const swatchY = Math.round(itemY + (layout.legendItemHeight - swatchSize) / 2)
    if (isTransparentBeadId(id)) {
      drawTransparentBeadFill(ctx, swatchX, swatchY, swatchSize)
    } else {
      ctx.fillStyle = color?.hex ?? '#cccccc'
      ctx.fillRect(swatchX, swatchY, swatchSize, swatchSize)
    }
    ctx.strokeStyle = GRID_LINE_COLOR
    ctx.lineWidth = 1
    ctx.strokeRect(
      Math.round(itemX) + 0.5,
      Math.round(itemY + (layout.legendItemHeight - swatchSize) / 2) + 0.5,
      swatchSize - 1,
      swatchSize - 1,
    )

    ctx.fillStyle = LEGEND_TEXT_COLOR
    ctx.font = `${legendFontSize}px sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${id} (${count})`, itemX + swatchSize + 6, itemY + layout.legendItemHeight / 2)
  })

  if (showWatermark) {
    drawGlobalWatermarks(ctx, layout.width, layout.height, cellPx, appName)
  }
}

export function buildStatsTsv(stats: Record<string, number>): string {
  const rows = Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => `${id}\t${count}`)

  return ['色号\t数量', ...rows].join('\n')
}

/** 微信小程序 Canvas 2d 单边像素上限 */
export const WEAPP_CANVAS_MAX_DIMENSION_PX = 4096

export function getSafeExportCellPx(
  pattern: PatternResult,
  exportCellPx: number,
  options: Pick<RenderOptions, 'showSheetHeader'> = {},
  maxDimension = WEAPP_CANVAS_MAX_DIMENSION_PX,
): number {
  let cellPx = Math.max(1, Math.floor(exportCellPx))
  while (cellPx > 1) {
    const { width, height } = getExportSheetPixelSize(pattern, cellPx, options)
    if (width <= maxDimension && height <= maxDimension) {
      return cellPx
    }
    cellPx -= 1
  }
  return 1
}

/** 导出时在 Canvas 上限内取当前规格可用的最大 cellPx（不受 config.exportCellPx 约束） */
export function getMaxExportCellPx(
  pattern: PatternResult,
  options: Pick<RenderOptions, 'showSheetHeader'> = {},
  maxDimension = WEAPP_CANVAS_MAX_DIMENSION_PX,
): number {
  let lo = 1
  let hi = maxDimension
  let best = 1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const { width, height } = getExportSheetPixelSize(pattern, mid, options)
    if (width <= maxDimension && height <= maxDimension) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

export function getEditCellPx(
  pattern: PatternResult,
  exportCellPx: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = 32,
): number {
  const hdCap = getSafeExportCellPx(pattern, exportCellPx, { showSheetHeader: false })
  const fitPx = Math.min(
    Math.floor((viewportWidth - padding) / pattern.width),
    Math.floor((viewportHeight - padding) / pattern.height),
  )
  let cellPx = Math.max(1, Math.min(hdCap, fitPx))
  while (
    cellPx > 1
    && (pattern.width * cellPx > viewportWidth - padding
      || pattern.height * cellPx > viewportHeight - padding)
  ) {
    cellPx -= 1
  }
  return cellPx
}

/** 编辑画布可放大到的最高清每格像素（exportCellPx 且受 Canvas 上限约束） */
export function getEditHdCellPx(pattern: PatternResult, exportCellPx: number): number {
  return Math.max(1, getSafeExportCellPx(pattern, exportCellPx, { showSheetHeader: false }))
}

export function getCoverCellPx(pattern: PatternResult, maxLongEdgePx = 640): number {
  const longEdge = Math.max(pattern.width, pattern.height)
  return Math.max(4, Math.min(12, Math.floor(maxLongEdgePx / longEdge)))
}

export function getPreviewCellPx(
  pattern: PatternResult,
  maxCanvasPx = 600,
): number {
  const longEdge = Math.max(pattern.width, pattern.height)
  return Math.max(6, Math.min(12, Math.floor(maxCanvasPx / longEdge)))
}

export function getPreviewCellPxForArea(
  pattern: PatternResult,
  maxWidth: number,
  maxHeight: number,
  padding = 32,
): number {
  const availableW = maxWidth - padding * 2
  const availableH = maxHeight - padding * 2
  const cellPx = Math.min(
    Math.floor(availableW / pattern.width),
    Math.floor(availableH / pattern.height),
    14,
  )
  return Math.max(4, cellPx)
}

export function getPatternPixelSize(
  pattern: PatternResult,
  cellPx: number,
): { width: number; height: number } {
  return {
    width: pattern.width * cellPx,
    height: pattern.height * cellPx,
  }
}

export function getExportSheetPixelSize(
  pattern: PatternResult,
  cellPx: number,
  options: Pick<RenderOptions, 'showSheetHeader'> = {},
): { width: number; height: number } {
  const layout = getSheetLayoutMetrics(pattern, cellPx, options)
  return { width: layout.width, height: layout.height }
}
