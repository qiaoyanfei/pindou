import type { PatternResult } from '@/types'

export type PreviewVariant = 'original' | 'mirror'

export function mirrorPattern(pattern: PatternResult): PatternResult {
  const grid: string[] = []
  for (let row = 0; row < pattern.height; row += 1) {
    const start = row * pattern.width
    const rowCells = pattern.grid.slice(start, start + pattern.width)
    grid.push(...rowCells.reverse())
  }

  return {
    ...pattern,
    grid,
    stats: { ...pattern.stats },
  }
}

export function resolveDisplayedPattern(
  pattern: PatternResult,
  variant: PreviewVariant,
): PatternResult {
  return variant === 'mirror' ? mirrorPattern(pattern) : pattern
}
