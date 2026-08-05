import type { PostCategory } from '@/types/community'
import type { PatternResult, PatternStoragePayload, PublishStoragePayload } from '@/types'

export function buildPatternPreviewSessionId(pattern: PatternResult, suffix?: string): string {
  const sample = pattern.grid.slice(0, 12).join('|')
  const tail = pattern.grid.length > 12 ? pattern.grid[pattern.grid.length - 1] : ''
  const base = `${pattern.width}x${pattern.height}:${pattern.grid.length}:${pattern.totalBeads}:${sample}:${tail}`
  return suffix ? `${base}:${suffix}` : base
}

export function resolvePreviewSessionKey(stored: PatternStoragePayload): string {
  if (stored.previewSessionId) return stored.previewSessionId
  return buildPatternPreviewSessionId(stored.pattern)
}

export function serializePatternFingerprint(pattern: PatternResult): string {
  return `${pattern.width}x${pattern.height}:${pattern.totalBeads}:${pattern.grid.join('|')}`
}

/** 仅「从作品只读打开且未改」不可恢复；生成中 / 本地已改均可恢复 */
export function isRecoverableGeneratePattern(stored?: PatternStoragePayload | null): boolean {
  if (!stored?.pattern) return false
  if (stored.previewOrigin === 'post') return false
  return true
}

export function hasSubstantialPatternChange(
  pattern: PatternResult,
  baselineFingerprint?: string,
): boolean {
  if (!baselineFingerprint) return false
  return serializePatternFingerprint(pattern) !== baselineFingerprint
}

/**
 * 从作品打开后发生实质变化：改为可恢复本地草稿（仍保留 postId 便于之后更新发布）。
 */
export function markAsRecoverableLocalDraft(
  payload: PatternStoragePayload,
  reason: string,
): PatternStoragePayload {
  const nextOrigin = payload.previewOrigin === 'post' ? 'edit' : (payload.previewOrigin || 'generate')
  return bumpPatternPreviewSession({
    ...payload,
    previewOrigin: nextOrigin,
  }, reason)
}

export function createPostPreviewStoragePayload(
  pattern: PatternResult,
  config: PatternStoragePayload['config'],
  options: {
    postId: string
    creatorNickname?: string
    sourceImagePath?: string
    title?: string
    category?: PostCategory
    existingSourceImageFileId?: string
  },
): PatternStoragePayload {
  return {
    pattern,
    config,
    sourceImagePath: options.sourceImagePath?.trim() || undefined,
    previewOrigin: 'post',
    postId: options.postId,
    previewSessionId: `post:${options.postId}:${Date.now()}`,
    creatorNickname: options.creatorNickname?.trim() || undefined,
    postTitle: options.title?.trim() || undefined,
    postCategory: options.category,
    existingSourceImageFileId: options.existingSourceImageFileId || undefined,
    sourcePatternFingerprint: serializePatternFingerprint(pattern),
  }
}

export function buildPublishStorageFromPattern(
  stored: Pick<
    PatternStoragePayload,
    'config' | 'postId' | 'postTitle' | 'postCategory' | 'existingSourceImageFileId'
  >,
  coverPath: string,
): PublishStoragePayload {
  return {
    config: stored.config,
    coverPath,
    postId: stored.postId,
    title: stored.postTitle,
    category: stored.postCategory,
    existingSourceImageFileId: stored.existingSourceImageFileId,
  }
}

export function createGeneratePreviewStoragePayload(
  pattern: PatternResult,
  config: PatternStoragePayload['config'],
  sourceImagePath: string,
  sourceCrop?: PatternStoragePayload['sourceCrop'],
): PatternStoragePayload {
  return {
    pattern,
    config,
    sourceImagePath,
    sourceCrop,
    previewOrigin: 'generate',
    previewSessionId: `generate:${Date.now()}`,
  }
}

export function bumpPatternPreviewSession(
  payload: PatternStoragePayload,
  reason: string,
): PatternStoragePayload {
  return {
    ...payload,
    previewSessionId: `${resolvePreviewSessionKey(payload)}:${reason}:${Date.now()}`,
  }
}
