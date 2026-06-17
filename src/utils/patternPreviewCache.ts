import { fetchPostDetail, loadPatternFromPost } from '@/services/communityService'
import { DEFAULT_CONFIG, normalizeConfig } from '@/utils/constants'
import type { PatternConfig, PatternResult } from '@/types'
import type { PostDetail } from '@/types/community'

interface CachedPreviewData {
  pattern: PatternResult
  config: PatternConfig
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

export function getCachedPreviewData(postId: string): CachedPreviewData | undefined {
  return previewCache.get(postId)
}

export function buildPreviewConfigFromPost(
  post: Pick<PostDetail, 'styleMode' | 'paletteId'>,
): PatternConfig {
  return normalizeConfig({
    ...DEFAULT_CONFIG,
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
  if (cached) return cached

  const pending = inflight.get(post._id)
  if (pending) return pending

  const promise = loadPatternFromPost(post)
    .then((pattern) => {
      const data = {
        pattern,
        config: buildPreviewConfigFromPost(post),
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
  if (previewCache.has(postId) || inflight.has(postId)) return
  try {
    const post = await fetchPostDetail(postId)
    await resolvePreviewData(post)
  } catch {
    // 后台预加载失败不影响页面
  }
}
