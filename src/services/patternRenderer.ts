import { getColorById } from '@/services/palette'
import { isEmptyCell } from '@/services/patternStats'
import { drawGlobalWatermarks } from '@/services/patternWatermark'
import { MINI_PROGRAM_NAME } from '@/utils/constants'
import type { PatternResult, RenderOptions } from '@/types'

type CanvasNode = {
  getContext: (type: '2d') => CanvasRenderingContext2D | null
  width: number
  height: number
}

const GRID_LINE_COLOR = '#d0d0d0'
const EMPTY_CELL_FILL = '#f3f4f6'
const AXIS_TEXT_COLOR = '#666666'
const HEADER_TEXT_COLOR = '#333333'
const LEGEND_TEXT_COLOR = '#444444'

function buildSheetHeaderText(
  appName: string,
  creatorNickname: string | undefined,
  gridWidth: number,
  gridHeight: number,
  totalBeads: number,
  colorCount: number,
): string {
  const author = creatorNickname?.trim() ?? ''
  return `由「${appName}」小程序生成｜作者：${author}｜规格：${gridWidth}×${gridHeight}｜总用豆数：${totalBeads}｜总色卡数：${colorCount}`
}

function resolveHeaderFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  baseFontSize: number,
): number {
  let fontSize = baseFontSize
  while (fontSize >= 9) {
    ctx.font = `600 ${fontSize}px sans-serif`
    if (ctx.measureText(text).width <= maxWidth) return fontSize
    fontSize -= 1
  }
  return 9
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
  } else {
    ctx.fillStyle = getColorById(colorId)?.hex ?? '#cccccc'
  }
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
  ctx.fillStyle = getLabelColor(color.hex)
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
  const { width, height, grid } = pattern
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
): SheetLayoutMetrics {
  const padding = Math.max(8, Math.round(cellPx * 0.6))
  const headerHeight = Math.max(28, Math.round(cellPx * 1.4))
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
  const legendHeight =
    legendRows > 0
      ? legendRows * legendItemHeight + (legendRows - 1) * legendGap + padding
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
  } = options
  const layout = getSheetLayoutMetrics(pattern, cellPx)

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

  const headerText = buildSheetHeaderText(
    appName,
    creatorNickname,
    width,
    height,
    totalBeads,
    Object.keys(stats).length,
  )
  const headerFontSize = resolveHeaderFontSize(
    ctx,
    headerText,
    layout.width - layout.padding * 2,
    Math.max(11, Math.round(cellPx * 0.52)),
  )
  ctx.fillStyle = HEADER_TEXT_COLOR
  ctx.font = `600 ${headerFontSize}px sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(headerText, layout.padding, layout.padding + layout.headerHeight / 2)

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

  const legendTop = gridOriginY + layout.gridHeight + layout.padding / 2
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
    const hex = color?.hex ?? '#cccccc'

    ctx.fillStyle = hex
    ctx.fillRect(
      Math.round(itemX),
      Math.round(itemY + (layout.legendItemHeight - swatchSize) / 2),
      swatchSize,
      swatchSize,
    )
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

  drawGlobalWatermarks(ctx, layout.width, layout.height, cellPx, appName)
}

export function buildStatsTsv(stats: Record<string, number>): string {
  const rows = Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => `${id}\t${count}`)

  return ['色号\t数量', ...rows].join('\n')
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
): { width: number; height: number } {
  const layout = getSheetLayoutMetrics(pattern, cellPx)
  return { width: layout.width, height: layout.height }
}
