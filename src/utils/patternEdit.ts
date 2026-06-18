import { finalizePattern } from '@/services/patternStats'
import type { PatternResult } from '@/types'

export interface GridCoord {
  col: number
  row: number
}

export interface PatternCellEdit {
  index: number
  prevColorId: string
  nextColorId: string
}

export function coordToCellIndex(pattern: PatternResult, col: number, row: number): number {
  return row * pattern.width + col
}

export function cellIndexToCoord(pattern: PatternResult, index: number): GridCoord {
  return {
    col: index % pattern.width,
    row: Math.floor(index / pattern.width),
  }
}

export function coordFromTouch(
  touchX: number,
  touchY: number,
  cellPx: number,
  pattern: PatternResult,
): GridCoord | null {
  const col = Math.floor(touchX / cellPx)
  const row = Math.floor(touchY / cellPx)
  if (col < 0 || row < 0 || col >= pattern.width || row >= pattern.height) {
    return null
  }
  return { col, row }
}

export function setPatternCellColor(
  pattern: PatternResult,
  index: number,
  colorId: string,
): PatternResult {
  if (index < 0 || index >= pattern.grid.length) return pattern
  if (pattern.grid[index] === colorId) return pattern
  const grid = pattern.grid.slice()
  grid[index] = colorId
  return finalizePattern(pattern.width, pattern.height, grid)
}

export function applyPatternCellEdit(
  pattern: PatternResult,
  edit: PatternCellEdit,
): PatternResult {
  return setPatternCellColor(pattern, edit.index, edit.nextColorId)
}

export function revertPatternCellEdit(
  pattern: PatternResult,
  edit: PatternCellEdit,
): PatternResult {
  return setPatternCellColor(pattern, edit.index, edit.prevColorId)
}

export function getPatternColorIds(pattern: PatternResult): string[] {
  return Object.entries(pattern.stats)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
}
