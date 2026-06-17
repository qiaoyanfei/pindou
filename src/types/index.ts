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
  /** 是否绘制顶部标题与元信息行，默认 true */
  showSheetHeader?: boolean
  /** 是否绘制全局水印，默认 true */
  showWatermark?: boolean
}

export const PATTERN_STORAGE_KEY = 'pindou_pattern_result'

export const ADVANCED_SETTINGS_SESSION_KEY = 'pindou_advanced_settings_session'

export const GENERATE_PAGE_RESET_KEY = 'pindou_generate_page_reset'

export interface AdvancedSettingsSession {
  imagePath: string
  config: PatternConfig
}

export const PUBLISH_STORAGE_KEY = 'pindou_publish_payload'

export interface PublishStoragePayload {
  /** 封面本地路径；pattern 仅存于 PATTERN_STORAGE_KEY，避免重复占用 storage */
  coverPath?: string
  config?: PatternConfig
  title?: string
  /** 兼容旧版：曾在此冗余存 pattern */
  pattern?: PatternResult
}

/** 兼容旧版缓存中的 original */
export type LegacyStyleMode = StyleMode | 'original'
