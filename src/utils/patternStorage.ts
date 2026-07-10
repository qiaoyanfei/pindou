import type { PatternResult, PatternStoragePayload } from '@/types'

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
  },
): PatternStoragePayload {
  return {
    pattern,
    config,
    previewOrigin: 'post',
    postId: options.postId,
    previewSessionId: `post:${options.postId}:${Date.now()}`,
    creatorNickname: options.creatorNickname?.trim() || undefined,
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
