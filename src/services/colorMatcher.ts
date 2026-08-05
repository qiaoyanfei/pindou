import { getPalette } from '@/services/palette'
import { finalizePattern } from '@/services/patternStats'
import type { BeadColor, PatternResult } from '@/types'
import type { Rgb } from '@/services/imageProcessor'
import { PATTERN_EMPTY_CELL, isTransparentBeadId } from '@/utils/constants'
import { deltaE2000, labDistance, rgbToLab } from '@/utils/colorSpace'
import { throwIfAborted, yieldToMain, type PatternAbortSignal } from '@/utils/patternGenerationProgress'

const TOP_CANDIDATES = 5
const MATCH_CELL_BATCH = 2000

function findNearestColor(
  rgb: [number, number, number],
  palette: BeadColor[],
): BeadColor {
  const pixelLab = rgbToLab(rgb)

  const ranked = palette
    .map((color) => ({
      color,
      dist: labDistance(pixelLab, color.lab!),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, TOP_CANDIDATES)

  let best = ranked[0].color
  let bestDelta = deltaE2000(pixelLab, best.lab!)

  for (let i = 1; i < ranked.length; i += 1) {
    const candidate = ranked[i].color
    const delta = deltaE2000(pixelLab, candidate.lab!)
    if (delta < bestDelta) {
      best = candidate
      bestDelta = delta
    }
  }

  return best
}

/** 取色：单个像素匹配最接近的色号（透明豆需手动选，不参与自动匹配） */
export function matchRgbToColorId(rgb: Rgb): string {
  const palette = getPalette().filter((color) => !isTransparentBeadId(color.id))
  return findNearestColor(rgb, palette).id
}

export function matchRgbGridToPattern(
  colors: [number, number, number][],
  width: number,
  height: number,
): PatternResult {
  const palette = getPalette().filter((color) => !isTransparentBeadId(color.id))
  const grid: string[] = new Array(width * height)
  const stats: Record<string, number> = {}

  for (let i = 0; i < colors.length; i += 1) {
    const matched = findNearestColor(colors[i], palette)
    grid[i] = matched.id
    stats[matched.id] = (stats[matched.id] ?? 0) + 1
  }

  return {
    width,
    height,
    grid,
    stats,
    totalBeads: width * height,
  }
}

/** 映射 MARD 色，仅边缘连通背景格标记为空（不参与拼豆） */
export async function matchRgbGridWithExteriorBackground(
  colors: Rgb[],
  width: number,
  height: number,
  exteriorBackground: boolean[],
  signal?: PatternAbortSignal,
  onCellProgress?: (done: number, total: number) => void,
): Promise<PatternResult> {
  const palette = getPalette().filter((color) => !isTransparentBeadId(color.id))
  const grid: string[] = new Array(width * height)

  for (let i = 0; i < colors.length; i += 1) {
    if (i > 0 && i % MATCH_CELL_BATCH === 0) {
      throwIfAborted(signal)
      onCellProgress?.(i, colors.length)
      await yieldToMain()
    }
    if (exteriorBackground[i]) {
      grid[i] = PATTERN_EMPTY_CELL
      continue
    }
    grid[i] = findNearestColor(colors[i], palette).id
  }

  onCellProgress?.(colors.length, colors.length)
  throwIfAborted(signal)
  return finalizePattern(width, height, grid)
}

function downsampleExteriorBlock(
  exteriorBackground: boolean[],
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
  pickExterior: (exteriorCount: number, blockCells: number) => boolean,
): boolean[] {
  if (width === targetWidth && height === targetHeight) {
    return [...exteriorBackground]
  }

  const scaleX = width / targetWidth
  const scaleY = height / targetHeight
  if (!Number.isInteger(scaleX) || !Number.isInteger(scaleY) || scaleX !== scaleY) {
    return [...exteriorBackground]
  }

  const scale = scaleX
  const result: boolean[] = []

  for (let ty = 0; ty < targetHeight; ty += 1) {
    for (let tx = 0; tx < targetWidth; tx += 1) {
      let exteriorCount = 0
      let blockCells = 0
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const index = (ty * scale + dy) * width + (tx * scale + dx)
          blockCells += 1
          if (exteriorBackground[index]) exteriorCount += 1
        }
      }
      result.push(pickExterior(exteriorCount, blockCells))
    }
  }

  return result
}

export function downsampleExteriorBackground(
  exteriorBackground: boolean[],
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
): boolean[] {
  return downsampleExteriorBlock(
    exteriorBackground,
    width,
    height,
    targetWidth,
    targetHeight,
    (exteriorCount, blockCells) => exteriorCount * 2 >= blockCells,
  )
}

/** 按采样阶段背景标记强制为空，避免下采样/后处理把背景染成拼豆 */
export function applyExteriorBackgroundMask(
  pattern: PatternResult,
  exteriorBackground: boolean[],
): PatternResult {
  const { width, height, grid } = pattern
  const newGrid = grid.map((id, index) =>
    exteriorBackground[index] ? PATTERN_EMPTY_CELL : id,
  )
  return finalizePattern(width, height, newGrid)
}

export function matchPixelsToPattern(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): PatternResult {
  const colors: [number, number, number][] = new Array(width * height)
  for (let i = 0; i < width * height; i += 1) {
    const pi = i * 4
    colors[i] = [pixels[pi], pixels[pi + 1], pixels[pi + 2]]
  }
  return matchRgbGridToPattern(colors, width, height)
}
