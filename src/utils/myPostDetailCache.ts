import type { PostSummary } from '@/types/community'

export type MyPostDetailMode = 'published' | 'pending'

const MY_POST_DETAIL_CACHE_LIMIT = 20

interface CachedMyPostDetail {
  mode: MyPostDetailMode
  item: PostSummary
}

const myPostDetailCache = new Map<string, CachedMyPostDetail>()

function trimMyPostDetailCache(): void {
  while (myPostDetailCache.size > MY_POST_DETAIL_CACHE_LIMIT) {
    const oldestKey = myPostDetailCache.keys().next().value
    if (!oldestKey) break
    myPostDetailCache.delete(oldestKey)
  }
}

export function cacheMyPostDetail(item: PostSummary, mode: MyPostDetailMode): void {
  if (!item._id) return
  myPostDetailCache.delete(item._id)
  myPostDetailCache.set(item._id, { mode, item })
  trimMyPostDetailCache()
}

export function getCachedMyPostDetail(postId: string): CachedMyPostDetail | null {
  if (!postId) return null
  const cached = myPostDetailCache.get(postId)
  if (!cached) return null
  myPostDetailCache.delete(postId)
  myPostDetailCache.set(postId, cached)
  return cached
}
