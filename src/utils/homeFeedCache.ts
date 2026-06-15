import type { FeedTab, PostSummary } from '@/types/community'
import { applyPatchesToPosts } from '@/utils/postInteractionSync'

export interface HomeFeedState {
  posts: PostSummary[]
  page: number
  hasMore: boolean
}

export type HomeFeedsCache = Record<FeedTab, HomeFeedState>

const EMPTY_FEED: HomeFeedState = { posts: [], page: 1, hasMore: true }

export function createEmptyHomeFeeds(): HomeFeedsCache {
  return {
    recommend: { ...EMPTY_FEED, posts: [] },
    latest: { ...EMPTY_FEED, posts: [] },
  }
}

let homeFeedCache: HomeFeedsCache | null = null

export function readHomeFeedCache(): HomeFeedsCache {
  if (!homeFeedCache) return createEmptyHomeFeeds()
  return {
    recommend: {
      ...homeFeedCache.recommend,
      posts: applyPatchesToPosts(homeFeedCache.recommend.posts),
    },
    latest: {
      ...homeFeedCache.latest,
      posts: applyPatchesToPosts(homeFeedCache.latest.posts),
    },
  }
}

export function writeHomeFeedCache(feeds: HomeFeedsCache): void {
  homeFeedCache = feeds
}

export function hasHomeFeedCache(tab: FeedTab): boolean {
  return (homeFeedCache?.[tab]?.posts.length ?? 0) > 0
}

export function hasAnyHomeFeedCache(): boolean {
  return hasHomeFeedCache('recommend') || hasHomeFeedCache('latest')
}

export function patchHomeFeedCache(
  updater: (prev: HomeFeedsCache) => HomeFeedsCache,
): HomeFeedsCache {
  const base = homeFeedCache ?? createEmptyHomeFeeds()
  const next = updater(base)
  homeFeedCache = next
  return next
}
