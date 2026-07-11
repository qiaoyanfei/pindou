import { fetchPostDetail, loadPatternFromPost } from '@/services/communityService'
import { normalizeConfig } from '@/utils/constants'
import type { PatternConfig, PatternResult } from '@/types'
import type { PostDetail } from '@/types/community'

interface CachedPreviewData {
  pattern: PatternResult
  config: PatternConfig
  patternFileId: string
}

const previewCache = new Map<string, CachedPreviewData>()
const inflight = new Map<string, Promise<CachedPreviewData>>()
const PREVIEW_CACHE_LIMIT = 5

function trimPreviewCache(): void {
  while (previewCache.size > PREVIEW_CACHE_LIMIT) {
    const oldestKey = previewCache.keys().next().value
    if (!oldestKey) break
    previewCache.delete(oldestKey)
  }
}

export function clearPatternPreviewCache(): void {
  previewCache.clear()
  inflight.clear()
}

export function getCachedPattern(postId: string): PatternResult | undefined {
  return previewCache.get(postId)?.pattern
}

function isCachedPreviewStale(
  cached: CachedPreviewData | undefined,
  patternFileId: string | undefined,
): cached is CachedPreviewData {
  if (!cached) return false
  if (!patternFileId) return true
  return cached.patternFileId === patternFileId
}

export function getCachedPreviewData(
  postId: string,
  patternFileId?: string,
): CachedPreviewData | undefined {
  const cached = previewCache.get(postId)
  if (!isCachedPreviewStale(cached, patternFileId)) {
    if (cached) removeCachedPreview(postId)
    return undefined
  }
  return cached
}

export function removeCachedPreview(postId: string): void {
  previewCache.delete(postId)
  inflight.delete(postId)
}

export function buildPreviewConfigFromPost(
  post: Pick<PostDetail, 'styleMode' | 'paletteId' | 'config'>,
): PatternConfig {
  return normalizeConfig({
    ...(post.config || {}),
    styleMode: post.styleMode,
    paletteId: post.paletteId,
  })
}

export async function resolvePatternForPreview(post: PostDetail): Promise<PatternResult> {
  const data = await resolvePreviewData(post)
  return data.pattern
}

export async function resolvePreviewData(post: PostDetail): Promise<CachedPreviewData> {
  const cached = previewCache.get(post._id)
  if (isCachedPreviewStale(cached, post.patternFileId)) {
    return cached
  }
  if (cached) {
    previewCache.delete(post._id)
  }

  const pending = inflight.get(post._id)
  if (pending) return pending

  const promise = loadPatternFromPost(post)
    .then((pattern) => {
      const data = {
        pattern,
        config: buildPreviewConfigFromPost(post),
        patternFileId: post.patternFileId,
      }
      previewCache.set(post._id, data)
      trimPreviewCache()
      inflight.delete(post._id)
      return data
    })
    .catch((error) => {
      inflight.delete(post._id)
      throw error
    })

  inflight.set(post._id, promise)
  return promise
}

export async function preloadPatternForPost(postId: string): Promise<void> {
  try {
    const post = await fetchPostDetail(postId)
    await resolvePreviewData(post)
  } catch {
    // 后台预加载失败不影响页面
  }
}
