import type { LegacyStyleMode, PatternConfig, StyleMode } from '@/types'

export const GRID_LIMITS = {
  minEdge: 29,
  maxEdge: 160,
}

export const EXPORT_LIMITS = {
  minCellPx: 20,
  maxCellPx: 36,
}

export const STYLE_MODE_DEFAULT_LONG_EDGE: Record<StyleMode, number> = {
  portrait: 104,
  manga: 52,
}

export const DEFAULT_CONFIG: PatternConfig = {
  paletteId: 'mard221',
  longEdge: STYLE_MODE_DEFAULT_LONG_EDGE.portrait,
  showGrid: true,
  showColorCode: true,
  exportCellPx: 28,
  styleMode: 'portrait',
}

export const PALETTE_VERSION = 'mard221-v1'

export const STYLE_MODE_LABELS: Record<StyleMode, string> = {
  portrait: '人物',
  manga: '漫画',
}

export const STYLE_MODE_HINTS: Record<StyleMode, string> = {
  portrait: `适合人像照片，白色干净背景，默认长边 ${STYLE_MODE_DEFAULT_LONG_EDGE.portrait} 格`,
  manga: `适合插画 / 二次元，白色干净背景，默认长边 ${STYLE_MODE_DEFAULT_LONG_EDGE.manga} 格`,
}

/** 每格分块采样密度（4×4 像素/格） */
export const PATTERN_SAMPLES_PER_CELL = 4

/** 中间分辨率倍数，再众数下采样 */
export const PATTERN_INTERMEDIATE_SCALE = 2

/** 块内暗像素亮度阈值（描边保护） */
export const PATTERN_DARK_LUMA = 48

/** 块内暗像素占比阈值（描边保护） */
export const PATTERN_DARK_RATIO = 0.22

/** 全图出现次数 ≤ 该值的色号视为孤立杂点并剔除 */
export const PATTERN_SPECKLE_MAX_COUNT = 3

/** 不参与拼豆的空格子标记 */
export const PATTERN_EMPTY_CELL = ''

/** 纯色背景 RGB 容差（相对检测到的边框主色） */
export const BACKGROUND_RGB_TOLERANCE = 30

/** 浅白背景：最低亮度 */
export const BACKGROUND_LIGHT_LUMA = 235

/** 浅白背景：RGB 通道最大差值（低饱和度） */
export const BACKGROUND_LIGHT_CHROMA = 36

/** 格块内超过该比例的边缘连通背景像素 → 该格不参与拼豆 */
export const BACKGROUND_CELL_EXTERIOR_RATIO = 0.55

/** 背景分析时缩小原图的长边上限 */
export const BACKGROUND_ANALYSIS_MAX_EDGE = 512

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function normalizeStyleMode(mode?: LegacyStyleMode): StyleMode {
  if (mode === 'manga') return 'manga'
  return 'portrait'
}

export function normalizeConfig(config?: Partial<PatternConfig> & { styleMode?: LegacyStyleMode }): PatternConfig {
  const styleMode = normalizeStyleMode(config?.styleMode)
  return {
    ...DEFAULT_CONFIG,
    ...config,
    styleMode,
    longEdge: clamp(
      config?.longEdge ?? STYLE_MODE_DEFAULT_LONG_EDGE[styleMode],
      GRID_LIMITS.minEdge,
      GRID_LIMITS.maxEdge,
    ),
    exportCellPx: clamp(
      config?.exportCellPx ?? DEFAULT_CONFIG.exportCellPx,
      EXPORT_LIMITS.minCellPx,
      EXPORT_LIMITS.maxCellPx,
    ),
  }
}
