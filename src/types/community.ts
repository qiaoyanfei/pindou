import type { PatternConfig, PatternResult, StyleMode } from '@/types'

export type PostCategory = '动漫' | '动物' | '亲子' | '人物' | '宠物' | '食物' | '饰品'

export const POST_CATEGORIES: PostCategory[] = [
  '动漫',
  '动物',
  '亲子',
  '人物',
  '宠物',
  '食物',
  '饰品',
]

export type PostVisibility = 'public' | 'private'

export type PostReviewStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export interface PostReviewHistoryItem {
  status: PostReviewStatus
  label: string
  note?: string
  createdAt: string
}

export type FeedTab = 'recommend' | 'latest'

export interface UserProfile {
  _id?: string
  openid?: string
  nickName: string
  avatarUrl: string
  beanBalance: number
  level: number
  bio: string
  draftCount?: number // 待发布（未公开）作品数量
  postCount?: number
}

export interface PostSummary {
  _id: string
  title: string
  category: PostCategory
  coverUrl?: string
  coverFileId?: string
  width: number
  height: number
  styleMode: StyleMode
  paletteId: string
  likeCount: number
  favoriteCount: number
  downloadCount: number
  visibility?: PostVisibility
  reviewStatus?: PostReviewStatus
  reviewNote?: string
  reviewHistory?: PostReviewHistoryItem[]
  author: {
    nickName: string
    avatarUrl: string
    openid?: string
  }
  createdAt: string
  publishedAt?: string
  updatedAt?: string
  liked?: boolean
  favorited?: boolean
  likedAt?: string
  favoritedAt?: string
}

export interface PostDetail extends PostSummary {
  description: string
  visibility: PostVisibility
  patternFileId: string
  sheetFileId?: string
  config?: PatternConfig
  stats: Record<string, number>
  totalBeads: number
  pattern?: PatternResult
}

export interface DraftItem {
  _id: string
  title: string
  coverFileId: string
  coverUrl: string
  width: number
  height: number
  styleMode: StyleMode
  paletteId: string
  stats: Record<string, number>
  totalBeads: number
  colorCount: number
  createdAt: string
  updatedAt: string
  patternFileId: string
  config: PatternConfig
}

export interface BeanTransaction {
  _id: string
  type: 'income' | 'expense'
  amount: number
  title: string
  subtitle?: string
  createdAt: string
}

export interface AppRemoteConfig {
  downloadCost: number
  publishReward: number
  registerReward: number
  inviteReward: number
  shareReward: number
  feedbackWechatId: string
  feedbackQrUrl: string
  adminOpenIds?: string[]
  /** 每人每日最多发布次数，0 表示不限制 */
  dailyPublishLimit?: number
  /** 发布白名单 OpenID，不受每日发布次数限制 */
  publishWhitelistOpenIds?: string[]
}

export type FeedbackType =
  | '生成失败'
  | '色号不准确'
  | '下载失败'
  | '小豆异常'
  | '功能建议'
  | '其他问题'

export const FEEDBACK_TYPES: FeedbackType[] = [
  '生成失败',
  '色号不准确',
  '下载失败',
  '小豆异常',
  '功能建议',
  '其他问题',
]

export interface PublishPayload {
  draftId?: string
  title: string
  category: PostCategory
  description: string
  visibility: PostVisibility
  coverFileId: string
  sheetFileId?: string
  patternFileId: string
  pattern: PatternResult
  config: PatternConfig
}
