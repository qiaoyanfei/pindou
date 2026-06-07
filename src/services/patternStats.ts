import { PATTERN_EMPTY_CELL } from '@/utils/constants'

export function isEmptyCell(colorId: string): boolean {
  return colorId === PATTERN_EMPTY_CELL
}

export function rebuildPatternStats(grid: string[]): {
  stats: Record<string, number>
  totalBeads: number
} {
  const stats: Record<string, number> = {}
  let totalBeads = 0

  for (const id of grid) {
    if (isEmptyCell(id)) continue
    stats[id] = (stats[id] ?? 0) + 1
    totalBeads += 1
  }

  return { stats, totalBeads }
}

export function finalizePattern(
  width: number,
  height: number,
  grid: string[],
): {
  width: number
  height: number
  grid: string[]
  stats: Record<string, number>
  totalBeads: number
} {
  const { stats, totalBeads } = rebuildPatternStats(grid)
  return { width, height, grid, stats, totalBeads }
}
