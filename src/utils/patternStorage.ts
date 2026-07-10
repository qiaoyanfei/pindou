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

export function isRecoverableGeneratePattern(stored?: PatternStoragePayload | null): boolean {
  if (!stored?.pattern) return false
  if (stored.previewOrigin === 'post') return false
  return true
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
): PatternStoragePayload {
  return {
    pattern,
    config,
    sourceImagePath,
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
