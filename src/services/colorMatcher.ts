import { getPalette } from '@/services/palette'
import { finalizePattern } from '@/services/patternStats'
import type { BeadColor, PatternResult } from '@/types'
import type { Rgb } from '@/services/imageProcessor'
import { PATTERN_EMPTY_CELL } from '@/utils/constants'
import { deltaE2000, labDistance, rgbToLab } from '@/utils/colorSpace'

const TOP_CANDIDATES = 5

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

export function matchRgbGridToPattern(
  colors: [number, number, number][],
  width: number,
  height: number,
): PatternResult {
  const palette = getPalette()
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
export function matchRgbGridWithExteriorBackground(
  colors: Rgb[],
  width: number,
  height: number,
  exteriorBackground: boolean[],
): PatternResult {
  const palette = getPalette()
  const grid: string[] = new Array(width * height)

  for (let i = 0; i < colors.length; i += 1) {
    if (exteriorBackground[i]) {
      grid[i] = PATTERN_EMPTY_CELL
      continue
    }
    grid[i] = findNearestColor(colors[i], palette).id
  }

  return finalizePattern(width, height, grid)
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
