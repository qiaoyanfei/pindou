import type { PatternResult } from '@/types'
import type { StyleMode } from '@/types'
import { isDarkBeadId, isLightNeutralId } from '@/utils/constants'
import { finalizePattern, isEmptyCell } from '@/services/patternStats'

function getNeighborColors(
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
      const id = grid[ny * width + nx]
      if (!isEmptyCell(id)) {
        neighbors.push(id)
      }
    }
  }
  return neighbors
}

function pickReplacementColor(neighbors: string[], current: string): string | null {
  if (neighbors.length === 0) return null

  const counts = new Map<string, number>()
  for (const id of neighbors) {
    if (id === current) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  if (counts.size === 0) {
    return neighbors[0]
  }

  let bestId = neighbors[0]
  let bestCount = 0
  counts.forEach((count, id) => {
    if (count > bestCount) {
      bestCount = count
      bestId = id
    }
  })
  return bestId
}

/** 将全图出现次数极少的色号替换为邻域主色，清除孤立杂点 */
export function removeIsolatedSpeckles(
  pattern: PatternResult,
  maxCount = 3,
  styleMode: StyleMode = 'portrait',
): PatternResult {
  const { width, height, grid } = pattern
  const speckleIds = new Set(
    Object.entries(pattern.stats)
      .filter(([id, count]) => {
        if (count > maxCount) return false
        if (styleMode === 'portrait' && isDarkBeadId(id)) return false
        if (styleMode === 'manga' && isLightNeutralId(id)) return false
        return true
      })
      .map(([id]) => id),
  )

  if (speckleIds.size === 0) return pattern

  const newGrid = [...grid]

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const current = newGrid[index]
      if (isEmptyCell(current) || !speckleIds.has(current)) continue

      const replacement = pickReplacementColor(
        getNeighborColors(newGrid, width, height, x, y),
        current,
      )
      if (replacement) {
        newGrid[index] = replacement
      }
    }
  }

  return finalizePattern(width, height, newGrid)
}
