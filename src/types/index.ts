export type StyleMode = 'portrait' | 'manga'

export interface BeadColor {
  id: string
  series: string
  hex: string
  rgb: [number, number, number]
  /** 透明豆需单独材质渲染，勿仅靠 hex 判断 */
  type?: 'solid' | 'transparent'
  textColor?: string
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

/** 生成图纸时相对原图的采样裁剪区，用于编辑对照层一比一对齐 */
export interface PatternSourceCrop {
  x: number
  y: number
  width: number
  height: number
  sourceWidth: number
  sourceHeight: number
  /**
   * 内容在正方形图纸中的格子区域（居中留白后的有效区）。
   * 缺省时对照层按整张图纸映射（兼容旧草稿）。
   */
  contentRect?: {
    x: number
    y: number
    width: number
    height: number
  }
  /** 正方形图纸边长（格）；与 contentRect 一起用于对照层对齐 */
  squareSide?: number
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
  /** 每隔多少格绘制加粗参考线；导出/高清图使用 */
  majorGridEvery?: number
  /** 导出图右上角显示「镜像」标识 */
  showMirrorLabel?: boolean
}

export const PATTERN_STORAGE_KEY = 'pindou_pattern_result'

export type PreviewOrigin = 'generate' | 'post' | 'edit'

export interface PatternStoragePayload {
  pattern: PatternResult
  config: PatternConfig
  sourceImagePath?: string
  /** 原图采样裁剪，编辑对照层与图纸对齐用 */
  sourceCrop?: PatternSourceCrop
  previewOrigin?: PreviewOrigin
  /** 用于预览页强制刷新，避免页面栈复用时残留旧草稿状态 */
  previewSessionId?: string
  postId?: string
  creatorNickname?: string
  /** 更新已有作品时携带的标题与分类 */
  postTitle?: string
  postCategory?: string
  /** 已有原图云文件 ID，更新时可复用避免重复上传 */
  existingSourceImageFileId?: string
  /** 从作品打开时的原始图纸指纹；有实质变化后转为可恢复本地草稿 */
  sourcePatternFingerprint?: string
}

export const COLOR_DETAIL_STORAGE_KEY = 'pindou_color_detail_pattern'

export const ADVANCED_SETTINGS_SESSION_KEY = 'pindou_advanced_settings_session'

export const GENERATE_PAGE_RESET_KEY = 'pindou_generate_page_reset'

export const GENERATE_DRAFT_STORAGE_KEY = 'pindou_generate_draft'

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
  category?: string
  postId?: string
  existingSourceImageFileId?: string
  /** 兼容旧版：曾在此冗余存 pattern */
  pattern?: PatternResult
}

/** 兼容旧版缓存中的 original */
export type LegacyStyleMode = StyleMode | 'original'
