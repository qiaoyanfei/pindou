import { finalizePattern, isEmptyCell } from '@/services/patternStats'
import type { PatternResult } from '@/types'

export interface GridCoord {
  col: number
  row: number
}

export interface PatternCellEdit {
  kind: 'single'
  index: number
  prevColorId: string
  nextColorId: string
}

export interface PatternBatchEdit {
  kind: 'batch'
  changes: Array<{ index: number; prevColorId: string }>
  nextColorId: string
}

export type PatternUndoEntry = PatternCellEdit | PatternBatchEdit

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

/** 吸附到最近的格子中心，扩大可点击范围 */
export function coordFromTouchNearest(
  touchX: number,
  touchY: number,
  cellPx: number,
  pattern: PatternResult,
  hitRadiusRatio = 0.92,
): GridCoord | null {
  const baseCol = Math.floor(touchX / cellPx)
  const baseRow = Math.floor(touchY / cellPx)
  const hitRadius = cellPx * hitRadiusRatio
  let best: GridCoord | null = null
  let bestDist = Infinity

  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      const col = baseCol + dc
      const row = baseRow + dr
      if (col < 0 || row < 0 || col >= pattern.width || row >= pattern.height) continue
      const centerX = col * cellPx + cellPx / 2
      const centerY = row * cellPx + cellPx / 2
      const dist = Math.hypot(touchX - centerX, touchY - centerY)
      if (dist < bestDist) {
        bestDist = dist
        best = { col, row }
      }
    }
  }

  if (!best || bestDist > hitRadius) return null
  return best
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

export function countCellsWithColor(pattern: PatternResult, colorId: string): number {
  if (isEmptyCell(colorId)) {
    return pattern.grid.filter(isEmptyCell).length
  }
  return pattern.stats[colorId] ?? 0
}

export function applyPatternBatchReplace(
  pattern: PatternResult,
  sourceColorId: string,
  nextColorId: string,
): { pattern: PatternResult; edit: PatternBatchEdit | null } {
  const indices: number[] = []
  pattern.grid.forEach((cellColor, index) => {
    const matches = isEmptyCell(sourceColorId)
      ? isEmptyCell(cellColor)
      : cellColor === sourceColorId
    if (matches) indices.push(index)
  })
  return applyPatternCellsReplace(pattern, indices, nextColorId)
}

export function getIndicesWithColor(pattern: PatternResult, colorId: string): number[] {
  const indices: number[] = []
  pattern.grid.forEach((cellColor, index) => {
    const matches = isEmptyCell(colorId)
      ? isEmptyCell(cellColor)
      : cellColor === colorId
    if (matches) indices.push(index)
  })
  return indices
}

export function applyPatternCellsReplace(
  pattern: PatternResult,
  indices: number[],
  nextColorId: string,
): { pattern: PatternResult; edit: PatternBatchEdit | null } {
  const uniqueIndices = [...new Set(indices)].filter(
    (index) => index >= 0 && index < pattern.grid.length,
  )
  if (uniqueIndices.length === 0) {
    return { pattern, edit: null }
  }

  const changes: PatternBatchEdit['changes'] = []
  const grid = pattern.grid.slice()

  for (const index of uniqueIndices) {
    const prevColorId = grid[index]
    if (prevColorId === nextColorId) continue
    changes.push({ index, prevColorId })
    grid[index] = nextColorId
  }

  if (changes.length === 0) {
    return { pattern, edit: null }
  }

  return {
    pattern: finalizePattern(pattern.width, pattern.height, grid),
    edit: { kind: 'batch', changes, nextColorId },
  }
}

export function revertPatternBatchEdit(
  pattern: PatternResult,
  edit: PatternBatchEdit,
): PatternResult {
  const grid = pattern.grid.slice()
  for (const change of edit.changes) {
    grid[change.index] = change.prevColorId
  }
  return finalizePattern(pattern.width, pattern.height, grid)
}

export function revertPatternEdit(
  pattern: PatternResult,
  edit: PatternUndoEntry,
): PatternResult {
  if (edit.kind === 'batch') {
    return revertPatternBatchEdit(pattern, edit)
  }
  return revertPatternCellEdit(pattern, edit)
}

export function getPatternColorIds(pattern: PatternResult): string[] {
  return Object.entries(pattern.stats)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
}
