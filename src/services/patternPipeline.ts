import { analyzeContentCrop } from '@/services/backgroundMatting'
import { processBlockPattern } from '@/services/patternBlockProcessor'
import {
  computeCenteredContentRect,
  computeContentGridSize,
  computeGridSize,
  loadCanvasNode,
} from '@/services/imageProcessor'
import { finalizePattern } from '@/services/patternStats'
import { PATTERN_EMPTY_CELL } from '@/utils/constants'
import type { PatternConfig, PatternResult, PatternSourceCrop } from '@/types'
import { throwIfAborted, computeStageProgressPercent, type PatternProgressContext } from '@/utils/patternGenerationProgress'

export type PatternProgressCallback = (
  title: string,
  context?: PatternProgressContext,
) => void | Promise<void>

export interface PatternGenerationOptions {
  signal?: import('@/utils/patternGenerationProgress').PatternAbortSignal
}

export interface PatternGenerationResult {
  pattern: PatternResult
  sourceCrop: PatternSourceCrop
}

function findNonEmptyBounds(pattern: PatternResult): {
  minCol: number
  minRow: number
  maxCol: number
  maxRow: number
} | null {
  let minCol = pattern.width
  let minRow = pattern.height
  let maxCol = -1
  let maxRow = -1

  pattern.grid.forEach((colorId, index) => {
    if (colorId === PATTERN_EMPTY_CELL) return
    const col = index % pattern.width
    const row = Math.floor(index / pattern.width)
    minCol = Math.min(minCol, col)
    minRow = Math.min(minRow, row)
    maxCol = Math.max(maxCol, col)
    maxRow = Math.max(maxRow, row)
  })

  if (maxCol < minCol || maxRow < minRow) return null
  return { minCol, minRow, maxCol, maxRow }
}

function centerNonEmptyPattern(
  pattern: PatternResult,
): {
  pattern: PatternResult
  contentRect: { x: number; y: number; width: number; height: number }
} {
  const bounds = findNonEmptyBounds(pattern)
  if (!bounds) {
    return {
      pattern,
      contentRect: { x: 0, y: 0, width: pattern.width, height: pattern.height },
    }
  }

  const contentWidth = bounds.maxCol - bounds.minCol + 1
  const contentHeight = bounds.maxRow - bounds.minRow + 1
  const targetX = Math.floor((pattern.width - contentWidth) / 2)
  const targetY = Math.floor((pattern.height - contentHeight) / 2)
  const dx = targetX - bounds.minCol
  const dy = targetY - bounds.minRow

  if (dx === 0 && dy === 0) {
    return {
      pattern,
      contentRect: {
        x: bounds.minCol,
        y: bounds.minRow,
        width: contentWidth,
        height: contentHeight,
      },
    }
  }

  const grid = new Array<string>(pattern.width * pattern.height).fill(PATTERN_EMPTY_CELL)
  pattern.grid.forEach((colorId, index) => {
    if (colorId === PATTERN_EMPTY_CELL) return
    const col = index % pattern.width
    const row = Math.floor(index / pattern.width)
    const nextCol = col + dx
    const nextRow = row + dy
    if (
      nextCol < 0
      || nextRow < 0
      || nextCol >= pattern.width
      || nextRow >= pattern.height
    ) return
    grid[nextRow * pattern.width + nextCol] = colorId
  })

  return {
    pattern: finalizePattern(pattern.width, pattern.height, grid),
    contentRect: {
      x: targetX,
      y: targetY,
      width: contentWidth,
      height: contentHeight,
    },
  }
}

/** 把内容图纸居中铺进正方形，四周空白格 */
export function padPatternToSquare(
  pattern: PatternResult,
  squareSide: number,
): {
  pattern: PatternResult
  contentRect: { x: number; y: number; width: number; height: number }
} {
  const side = Math.max(squareSide, pattern.width, pattern.height)
  const contentRect = computeCenteredContentRect(pattern.width, pattern.height, side)
  if (pattern.width === side && pattern.height === side) {
    return centerNonEmptyPattern(pattern)
  }

  const grid = new Array<string>(side * side).fill(PATTERN_EMPTY_CELL)
  for (let row = 0; row < pattern.height; row += 1) {
    for (let col = 0; col < pattern.width; col += 1) {
      const from = row * pattern.width + col
      const to = (row + contentRect.y) * side + (col + contentRect.x)
      grid[to] = pattern.grid[from] ?? PATTERN_EMPTY_CELL
    }
  }

  return {
    pattern: finalizePattern(side, side, grid),
    contentRect,
  }
}

export async function generatePatternFromImage(
  imagePath: string,
  config: PatternConfig,
  canvasId = 'process-canvas',
  onProgress?: PatternProgressCallback,
  options?: PatternGenerationOptions,
): Promise<PatternGenerationResult> {
  const signal = options?.signal
  await onProgress?.('读取图片...', { percent: computeStageProgressPercent('读取图片...', 0) })
  throwIfAborted(signal)
  const canvas = await loadCanvasNode(canvasId)
  await onProgress?.('分析图片...', { percent: computeStageProgressPercent('分析图片...', 0) })
  throwIfAborted(signal)
  const { crop, sourceWidth, sourceHeight } = await analyzeContentCrop(canvas, imagePath)
  throwIfAborted(signal)

  const squareSize = computeGridSize(crop.width, crop.height, config.longEdge, config.styleMode)
  const contentSize = computeContentGridSize(
    crop.width,
    crop.height,
    squareSize.width,
    config.styleMode,
  )

  const contentPattern = await processBlockPattern(
    canvas,
    imagePath,
    crop,
    contentSize.width,
    contentSize.height,
    config.styleMode,
    onProgress,
    options,
  )

  const { pattern, contentRect } = padPatternToSquare(contentPattern, squareSize.width)

  return {
    pattern,
    sourceCrop: {
      ...crop,
      sourceWidth,
      sourceHeight,
      contentRect,
      squareSide: squareSize.width,
    },
  }
}
