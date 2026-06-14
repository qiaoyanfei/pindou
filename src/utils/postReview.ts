import type { PostReviewHistoryItem, PostReviewStatus } from '@/types/community'

export const REVIEW_STATUS_LABELS: Record<PostReviewStatus, string> = {
  draft: '待发布',
  pending: '审核中',
  approved: '已发布',
  rejected: '审核未通过',
}

export const REVIEW_STATUS_ICONS: Record<PostReviewStatus, string> = {
  draft: '📝',
  pending: '⏳',
  approved: '🌐',
  rejected: '⚠️',
}

export const REVIEW_STATUS_DESC: Record<PostReviewStatus, string> = {
  draft: '作品未公开，仅自己可见。开启公开后将提交审核。',
  pending: '已提交公开申请，正在审核中，通过后将公开展示。',
  approved: '审核已通过，作品已公开发布。',
  rejected: '审核未通过，请修改后重新生成并再次提交。',
}

export function resolveReviewStatus(
  reviewStatus?: PostReviewStatus,
  visibility?: 'public' | 'private',
): PostReviewStatus {
  if (reviewStatus) return reviewStatus
  return visibility === 'public' ? 'approved' : 'draft'
}

export function isPendingBucketStatus(status: PostReviewStatus): boolean {
  return status === 'draft' || status === 'pending' || status === 'rejected'
}

export function formatReviewHistory(history?: PostReviewHistoryItem[]): PostReviewHistoryItem[] {
  if (!history?.length) return []
  return [...history].sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime()
    const tb = new Date(b.createdAt || 0).getTime()
    return tb - ta
  })
}
