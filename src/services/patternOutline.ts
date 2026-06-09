import type { PatternResult } from '@/types'
import { PATTERN_EMPTY_CELL, isLightNeutralId } from '@/utils/constants'
import { finalizePattern, isEmptyCell } from '@/services/patternStats'

const PRIMARY_DARK = 'H16'
const SECONDARY_DARK_IDS = new Set(['H7', 'H17', 'H3', 'H18', 'H9'])

function isDarkId(id: string): boolean {
  return id === PRIMARY_DARK || SECONDARY_DARK_IDS.has(id)
}

function pickMajorityId(counts: Map<string, number>): string {
  let bestId = PATTERN_EMPTY_CELL
  let bestCount = -1

  counts.forEach((count, id) => {
    const preferDark =
      count === bestCount &&
      isDarkId(id) &&
      bestId !== PRIMARY_DARK &&
      id === PRIMARY_DARK
    const preferContent =
      count === bestCount &&
      isEmptyCell(bestId) &&
      !isEmptyCell(id)

    if (count > bestCount || preferDark || preferContent) {
      bestCount = count
      bestId = id
    }
  })

  return bestId
}

/** 2× 中间网格众数下采样到目标格数，保留描边连续性 */
export function downsamplePatternMajority(
  pattern: PatternResult,
  targetWidth: number,
  targetHeight: number,
): PatternResult {
  const { width, height, grid } = pattern
  if (width === targetWidth && height === targetHeight) return pattern

  const scaleX = width / targetWidth
  const scaleY = height / targetHeight
  if (!Number.isInteger(scaleX) || !Number.isInteger(scaleY) || scaleX !== scaleY) {
    return pattern
  }

  const scale = scaleX
  const newGrid: string[] = []

  for (let ty = 0; ty < targetHeight; ty += 1) {
    for (let tx = 0; tx < targetWidth; tx += 1) {
      const counts = new Map<string, number>()
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const id = grid[(ty * scale + dy) * width + (tx * scale + dx)]
          counts.set(id, (counts.get(id) ?? 0) + 1)
        }
      }
      newGrid.push(pickMajorityId(counts))
    }
  }

  return finalizePattern(targetWidth, targetHeight, newGrid)
}

function getNeighborIds(
  grid: string[],
  width: number,
  height: number,
  x: number,
  y: number,
): string[] {
  const neighbors: string[] = []
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      neighbors.push(grid[ny * width + nx])
    }
  }
  return neighbors
}

/** 合并 H7 等次级深灰到 H16，强化描边 */
export function consolidateDarkOutlines(pattern: PatternResult): PatternResult {
  const { width, height, grid } = pattern
  const newGrid = [...grid]

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const id = newGrid[index]
      if (isEmptyCell(id) || !SECONDARY_DARK_IDS.has(id)) continue

      const neighbors = getNeighborIds(newGrid, width, height, x, y)
      const hasPrimaryDark = neighbors.includes(PRIMARY_DARK)
      const lightNeighborCount = neighbors.filter((id) => isLightNeutralId(id)).length

      if (hasPrimaryDark && lightNeighborCount < 2) {
        newGrid[index] = PRIMARY_DARK
      }
    }
  }

  return finalizePattern(width, height, newGrid)
}
