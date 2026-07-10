import { getColorById } from '@/services/palette'
import { getSheetLayoutMetrics } from '@/services/patternRenderer'
import { isEmptyCell } from '@/services/patternStats'
import { MINI_PROGRAM_NAME } from '@/utils/constants'
import type { PatternResult, RenderOptions } from '@/types'

const GRID_LINE_COLOR = '#d0d0d0'
const MAJOR_GRID_LINE_COLOR = '#f59e42'
const EMPTY_CELL_FILL = '#f3f4f6'
const AXIS_TEXT_COLOR = '#666666'
const LEGEND_TEXT_COLOR = '#444444'
const HEADER_TITLE_COLOR = '#1a1a1a'
const HEADER_META_COLOR = '#1a1a1a'
const HEADER_SEPARATOR_COLOR = '#c8c8c8'
const META_SEPARATOR = '|'
const WATERMARK_COLOR = '#b8c2ce'
const SVG_LOGICAL_CELL_PX = 20

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getLabelColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#1a1a1a' : '#ffffff'
}

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

function appendMetaLineSvg(
  parts: string[],
  segments: string[],
  x: number,
  y: number,
  fontSize: number,
  segmentGap: number,
): void {
  let cursorX = x
  segments.forEach((segment, index) => {
    if (index > 0) {
      cursorX += segmentGap
      parts.push(
        `<text x="${cursorX}" y="${y}" fill="${HEADER_SEPARATOR_COLOR}" font-size="${fontSize}" font-weight="700" font-family="sans-serif" dominant-baseline="middle">${META_SEPARATOR}</text>`,
      )
      cursorX += fontSize * 0.35 + segmentGap
    }
    parts.push(
      `<text x="${cursorX}" y="${y}" fill="${HEADER_META_COLOR}" font-size="${fontSize}" font-weight="700" font-family="sans-serif" dominant-baseline="middle">${escapeXml(segment)}</text>`,
    )
    cursorX += segment.length * fontSize * 0.62
  })
}

function appendGridLinesSvg(
  parts: string[],
  originX: number,
  originY: number,
  cols: number,
  rows: number,
  cellPx: number,
): void {
  const w = cols * cellPx
  const h = rows * cellPx
  parts.push(`<g stroke="${GRID_LINE_COLOR}" stroke-width="1" shape-rendering="crispEdges">`)
  for (let i = 0; i <= cols; i += 1) {
    const x = originX + i * cellPx
    parts.push(`<line x1="${x}" y1="${originY}" x2="${x}" y2="${originY + h}"/>`)
  }
  for (let j = 0; j <= rows; j += 1) {
    const y = originY + j * cellPx
    parts.push(`<line x1="${originX}" y1="${y}" x2="${originX + w}" y2="${y}"/>`)
  }
  parts.push('</g>')
}

function appendMajorGridLinesSvg(
  parts: string[],
  originX: number,
  originY: number,
  cols: number,
  rows: number,
  cellPx: number,
  every: number,
): void {
  if (every <= 0) return
  const w = cols * cellPx
  const h = rows * cellPx
  const lineWidth = Math.max(1.5, cellPx * 0.1)
  parts.push(`<g stroke="${MAJOR_GRID_LINE_COLOR}" stroke-width="${lineWidth}" shape-rendering="crispEdges">`)
  for (let i = 0; i <= cols; i += every) {
    const x = originX + i * cellPx
    parts.push(`<line x1="${x}" y1="${originY}" x2="${x}" y2="${originY + h}"/>`)
  }
  for (let j = 0; j <= rows; j += every) {
    const y = originY + j * cellPx
    parts.push(`<line x1="${originX}" y1="${y}" x2="${originX + w}" y2="${y}"/>`)
  }
  parts.push('</g>')
}

function appendWatermarkSvg(
  parts: string[],
  canvasWidth: number,
  canvasHeight: number,
  cellPx: number,
  appName: string,
): void {
  if (!appName) return
  const fontSize = Math.max(10, Math.round(cellPx * 1.35))
  const gapX = fontSize * 8 + 80
  const gapY = fontSize * 7 + 64
  const diagonal = Math.sqrt(canvasWidth ** 2 + canvasHeight ** 2)
  parts.push(
    `<g opacity="0.32" fill="${WATERMARK_COLOR}" font-size="${fontSize}" font-weight="600" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">`,
  )
  parts.push(`<g transform="translate(${canvasWidth / 2} ${canvasHeight / 2}) rotate(-45)">`)
  for (let y = -diagonal; y <= diagonal; y += gapY) {
    const rowIndex = Math.round(y / gapY)
    const rowOffset = (rowIndex % 2) * (gapX / 2)
    for (let x = -diagonal + rowOffset; x <= diagonal; x += gapX) {
      parts.push(`<text x="${x}" y="${y}">${escapeXml(appName)}</text>`)
    }
  }
  parts.push('</g></g>')
}

export function buildPatternSheetSvg(
  pattern: PatternResult,
  options: RenderOptions,
): string {
  const { width, height, grid, stats, totalBeads } = pattern
  const {
    cellPx = SVG_LOGICAL_CELL_PX,
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
  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
  ]

  const gridOriginX = layout.padding + layout.axisWidth
  const gridOriginY = layout.padding + layout.headerHeight + layout.axisHeight

  if (showSheetHeader) {
    const headerMetrics = getSheetHeaderMetrics(cellPx)
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

    parts.push(
      `<text x="${layout.padding}" y="${layout.padding + headerMetrics.titleLineHeight / 2}" fill="${HEADER_TITLE_COLOR}" font-size="${headerMetrics.titleFontSize}" font-weight="700" font-family="sans-serif" dominant-baseline="middle">${escapeXml(appName)}</text>`,
    )
    appendMetaLineSvg(
      parts,
      metaSegments,
      layout.padding,
      metaY,
      headerMetrics.metaFontSize,
      metaSegmentGap,
    )

    if (showMirrorLabel) {
      parts.push(
        `<text x="${layout.width - layout.padding}" y="${layout.padding + headerMetrics.titleLineHeight / 2}" fill="${HEADER_TITLE_COLOR}" font-size="${headerMetrics.titleFontSize}" font-weight="700" font-family="sans-serif" text-anchor="end" dominant-baseline="middle">镜像</text>`,
      )
    }
  }

  const axisFontSize = Math.max(9, Math.round(cellPx * 0.45))
  for (let x = 0; x < width; x += 1) {
    parts.push(
      `<text x="${gridOriginX + x * cellPx + cellPx / 2}" y="${layout.padding + layout.headerHeight + layout.axisHeight / 2}" fill="${AXIS_TEXT_COLOR}" font-size="${axisFontSize}" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">${x + 1}</text>`,
    )
  }
  for (let y = 0; y < height; y += 1) {
    parts.push(
      `<text x="${gridOriginX - 6}" y="${gridOriginY + y * cellPx + cellPx / 2}" fill="${AXIS_TEXT_COLOR}" font-size="${axisFontSize}" font-family="sans-serif" text-anchor="end" dominant-baseline="middle">${y + 1}</text>`,
    )
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colorId = grid[y * width + x]
      const fill = isEmptyCell(colorId)
        ? EMPTY_CELL_FILL
        : (getColorById(colorId)?.hex ?? '#cccccc')
      parts.push(
        `<rect x="${gridOriginX + x * cellPx}" y="${gridOriginY + y * cellPx}" width="${cellPx}" height="${cellPx}" fill="${fill}"/>`,
      )
    }
  }

  if (showGrid) {
    appendGridLinesSvg(parts, gridOriginX, gridOriginY, width, height, cellPx)
    appendMajorGridLinesSvg(parts, gridOriginX, gridOriginY, width, height, cellPx, majorGridEvery)
  }

  if (showColorCode && cellPx >= minCellPxForLabel) {
    const fontSize = Math.max(8, Math.floor(cellPx * 0.38))
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const colorId = grid[y * width + x]
        if (isEmptyCell(colorId)) continue
        const color = getColorById(colorId)
        if (!color) continue
        parts.push(
          `<text x="${gridOriginX + x * cellPx + cellPx / 2}" y="${gridOriginY + y * cellPx + cellPx / 2}" fill="${getLabelColor(color.hex)}" font-size="${fontSize}" font-weight="700" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">${escapeXml(color.id)}</text>`,
        )
      }
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
    const hex = getColorById(id)?.hex ?? '#cccccc'
    const swatchY = itemY + (layout.legendItemHeight - swatchSize) / 2
    parts.push(
      `<rect x="${itemX}" y="${swatchY}" width="${swatchSize}" height="${swatchSize}" fill="${hex}" stroke="${GRID_LINE_COLOR}" stroke-width="1"/>`,
      `<text x="${itemX + swatchSize + 6}" y="${itemY + layout.legendItemHeight / 2}" fill="${LEGEND_TEXT_COLOR}" font-size="${legendFontSize}" font-family="sans-serif" dominant-baseline="middle">${escapeXml(`${id} (${count})`)}</text>`,
    )
  })

  if (showWatermark) {
    appendWatermarkSvg(parts, layout.width, layout.height, cellPx, appName)
  }

  parts.push('</svg>')
  return parts.join('')
}
