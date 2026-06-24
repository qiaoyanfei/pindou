import type { LegacyStyleMode, PatternConfig, StyleMode } from '@/types'

export const STYLE_MODE_LONG_EDGE_LIMITS: Record<StyleMode, { min: number; max: number }> = {
  portrait: { min: 29, max: 300 },
  manga: { min: 20, max: 160 },
}

export function getLongEdgeLimits(styleMode: StyleMode): { min: number; max: number } {
  return STYLE_MODE_LONG_EDGE_LIMITS[styleMode]
}

export function clampLongEdge(longEdge: number, styleMode: StyleMode): number {
  const { min, max } = getLongEdgeLimits(styleMode)
  return Math.max(min, Math.min(max, longEdge))
}

export const EXPORT_LIMITS = {
  minCellPx: 20,
  maxCellPx: 36,
}

export const STYLE_MODE_DEFAULT_LONG_EDGE: Record<StyleMode, number> = {
  portrait: 104,
  manga: 52,
}

export const STYLE_MODE_DEFAULT_EXPORT_CELL_PX: Record<StyleMode, number> = {
  portrait: 20,
  manga: 28,
}

export const DEFAULT_CONFIG: PatternConfig = {
  paletteId: 'mard221',
  longEdge: STYLE_MODE_DEFAULT_LONG_EDGE.portrait,
  showGrid: true,
  showColorCode: true,
  exportCellPx: STYLE_MODE_DEFAULT_EXPORT_CELL_PX.portrait,
  styleMode: 'portrait',
}

export const PALETTE_VERSION = 'mard221-v1'

export const STYLE_MODE_LABELS: Record<StyleMode, string> = {
  portrait: '写实风',
  manga: '漫画风',
}

export const STYLE_MODE_SUBTITLES: Record<StyleMode, string> = {
  portrait: '适合人物、宠物',
  manga: '适合插画、卡通、萌宠等',
}

export const STYLE_MODE_HINTS: Record<StyleMode, string> = {
  portrait: STYLE_MODE_SUBTITLES.portrait,
  manga: STYLE_MODE_SUBTITLES.manga,
}

export function getExportClarityLabel(exportCellPx: number): string {
  return `${exportCellPx}px/格`
}

export function createDefaultConfigForStyleMode(styleMode: StyleMode): PatternConfig {
  return normalizeConfig({
    styleMode,
    longEdge: STYLE_MODE_DEFAULT_LONG_EDGE[styleMode],
    exportCellPx: STYLE_MODE_DEFAULT_EXPORT_CELL_PX[styleMode],
  })
}

/** 每格分块采样密度（4×4 像素/格） */
export const PATTERN_SAMPLES_PER_CELL = 4

/** 中间分辨率倍数，再众数下采样 */
export const PATTERN_INTERMEDIATE_SCALE = 2

/** 块内暗像素亮度阈值（描边保护） */
export const PATTERN_DARK_LUMA = 48

/** 块内暗像素占比阈值（描边保护） */
export const PATTERN_DARK_RATIO = 0.22

/** 块内同时有足够亮像素时视为白+描边混合，不整格强制判黑 */
export const PATTERN_MIXED_LIGHT_RATIO = 0.35

export const PATTERN_LIGHT_NEUTRAL_IDS = new Set(['H2', 'H13'])

const PATTERN_DARK_IDS = new Set(['H16', 'H7', 'H17', 'H3', 'H18', 'H9'])

export function isLightNeutralId(id: string): boolean {
  return PATTERN_LIGHT_NEUTRAL_IDS.has(id)
}

export function isDarkBeadId(id: string): boolean {
  return PATTERN_DARK_IDS.has(id)
}

/** 全图出现次数 ≤ 该值的色号视为孤立杂点并剔除 */
export const PATTERN_SPECKLE_MAX_COUNT = 3

/** 不参与拼豆的空格子标记 */
export const PATTERN_EMPTY_CELL = ''

/** 纯色背景 RGB 容差（相对检测到的边框主色） */
export const BACKGROUND_RGB_TOLERANCE = 30

/** 浅白背景：最低亮度 */
export const BACKGROUND_LIGHT_LUMA = 235

/** 漫画风填色采样：优先取白的亮度下限（含抗锯齿，低于背景裁剪 235） */
export const PATTERN_MANGA_FILL_LIGHT_LUMA = 200

/** 漫画风整格强制 H16 的暗像素占比下限 */
export const PATTERN_MANGA_FORCE_DARK_RATIO = 0.5

/** 漫画风 2×2 下采样：H16 占块比例 ≥ 该值则输出 H16（4/4 全黑） */
export const PATTERN_MANGA_DOWNSAMPLE_DARK_MAJORITY = 1

/** 浅白背景：RGB 通道最大差值（低饱和度） */
export const BACKGROUND_LIGHT_CHROMA = 36

/** 格块内超过该比例的边缘连通背景像素 → 该格不参与拼豆 */
export const BACKGROUND_CELL_EXTERIOR_RATIO = 0.55

/** 格块内非背景像素 ≥ 该比例时，视为跨边界轮廓格，仍参与拼豆（人物模式） */
export const BACKGROUND_CELL_INTERIOR_MIN_RATIO_PORTRAIT = 0.28

/** 漫画/插画纯色底：不放宽标空，避免主体外背景被当成内容 */
export const BACKGROUND_CELL_INTERIOR_MIN_RATIO_MANGA = 0

export function getBackgroundCellInteriorMinRatio(styleMode: StyleMode): number {
  return styleMode === 'portrait'
    ? BACKGROUND_CELL_INTERIOR_MIN_RATIO_PORTRAIT
    : BACKGROUND_CELL_INTERIOR_MIN_RATIO_MANGA
}

/** 格块是否标为 crop 外背景（不参与拼豆） */
export function isExteriorBackgroundCell(
  exteriorRatio: number,
  interiorRatio: number,
  styleMode: StyleMode,
): boolean {
  if (exteriorRatio < BACKGROUND_CELL_EXTERIOR_RATIO) return false
  const interiorMinRatio = getBackgroundCellInteriorMinRatio(styleMode)
  if (interiorMinRatio <= 0) return true
  return interiorRatio < interiorMinRatio
}

/** 背景分析时缩小原图的长边上限 */
export const BACKGROUND_ANALYSIS_MAX_EDGE = 512

/** 对称轴可信时用于裁剪居中（仅几何对齐，不合并色号） */
export const SYMMETRY_AXIS_ALIGN_MIN_SCORE = 0.35

/** 对称轴检测 / 裁剪对齐使用的面部纵向范围（占比） */
export const SYMMETRY_FACE_BAND_TOP = 0.2
export const SYMMETRY_FACE_BAND_BOTTOM = 0.58

/** 对称轴搜索范围（占网格宽度比例） */
export const SYMMETRY_AXIS_SEARCH_MIN = 0.42
export const SYMMETRY_AXIS_SEARCH_MAX = 0.58

/** 距对称轴最大成对偏移（格，用于轴检测采样） */
export const SYMMETRY_MAX_PAIR_OFFSET = 12

/** 原图像素镜像匹配的 RGB 容差 */
export const SYMMETRY_RGB_MATCH_TOLERANCE = 36

/** 导出图水印：小程序名称 */
export const MINI_PROGRAM_NAME = 'happy拼豆嘛'

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
    longEdge: clampLongEdge(
      config?.longEdge ?? STYLE_MODE_DEFAULT_LONG_EDGE[styleMode],
      styleMode,
    ),
    exportCellPx: clamp(
      config?.exportCellPx ?? STYLE_MODE_DEFAULT_EXPORT_CELL_PX[styleMode],
      EXPORT_LIMITS.minCellPx,
      EXPORT_LIMITS.maxCellPx,
    ),
  }
}
