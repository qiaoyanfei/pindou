export type StyleMode = 'portrait' | 'manga'

export interface BeadColor {
  id: string
  series: string
  hex: string
  rgb: [number, number, number]
  lab?: [number, number, number]
}

export interface PatternConfig {
  paletteId: string
  longEdge: number
  showGrid: boolean
  showColorCode: boolean
  exportCellPx: number
  styleMode: StyleMode
}

export interface PatternResult {
  width: number
  height: number
  grid: string[]
  stats: Record<string, number>
  totalBeads: number
}

export interface RenderOptions {
  cellPx: number
  showGrid: boolean
  showColorCode: boolean
  minCellPxForLabel?: number
  /** 导出图顶部作者署名 */
  creatorNickname?: string
  /** 导出图顶部与全局水印小程序名 */
  appName?: string
}

export const PATTERN_STORAGE_KEY = 'pindou_pattern_result'

/** 兼容旧版缓存中的 original */
export type LegacyStyleMode = StyleMode | 'original'
