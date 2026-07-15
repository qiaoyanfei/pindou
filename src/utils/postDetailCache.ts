import type { PostDetail } from '@/types/community'

const POST_DETAIL_CACHE_LIMIT = 20
const postDetailCache = new Map<string, PostDetail>()

function trimPostDetailCache(): void {
  while (postDetailCache.size > POST_DETAIL_CACHE_LIMIT) {
    const oldestKey = postDetailCache.keys().next().value
    if (!oldestKey) break
    postDetailCache.delete(oldestKey)
  }
}

export function cachePostDetail(post: PostDetail | null | undefined): void {
  if (!post?._id) return
  postDetailCache.delete(post._id)
  postDetailCache.set(post._id, post)
  trimPostDetailCache()
}

export function getCachedPostDetail(postId: string): PostDetail | null {
  if (!postId) return null
  const cached = postDetailCache.get(postId)
  if (!cached) return null
  postDetailCache.delete(postId)
  postDetailCache.set(postId, cached)
  return cached
}
