import Taro from '@tarojs/taro'
import type { FeedTab, PostSummary } from '@/types/community'
import { applyPatchesToPosts } from '@/utils/postInteractionSync'

export interface HomeFeedState {
  posts: PostSummary[]
  page: number
  hasMore: boolean
}

export type HomeFeedsCache = Record<FeedTab, HomeFeedState>

const EMPTY_FEED: HomeFeedState = { posts: [], page: 1, hasMore: true }
const HOME_FEED_CACHE_STORAGE_KEY = 'pindou_home_feed_cache_v1'
const HOME_FEED_CACHE_TTL_MS = 10 * 60 * 1000

interface StoredHomeFeedsCache {
  savedAt: number
  feeds: HomeFeedsCache
}

export function createEmptyHomeFeeds(): HomeFeedsCache {
  return {
    recommend: { ...EMPTY_FEED, posts: [] },
    latest: { ...EMPTY_FEED, posts: [] },
  }
}

let homeFeedCache: HomeFeedsCache | null = null

function readStoredHomeFeedCache(): HomeFeedsCache | null {
  try {
    const stored = Taro.getStorageSync(HOME_FEED_CACHE_STORAGE_KEY) as StoredHomeFeedsCache | undefined
    if (!stored?.feeds || !stored.savedAt) return null
    if (Date.now() - stored.savedAt > HOME_FEED_CACHE_TTL_MS) {
      Taro.removeStorageSync(HOME_FEED_CACHE_STORAGE_KEY)
      return null
    }
    return {
      recommend: {
        ...EMPTY_FEED,
        ...stored.feeds.recommend,
        posts: stored.feeds.recommend?.posts || [],
      },
      latest: {
        ...EMPTY_FEED,
        ...stored.feeds.latest,
        posts: stored.feeds.latest?.posts || [],
      },
    }
  } catch {
    return null
  }
}

function writeStoredHomeFeedCache(feeds: HomeFeedsCache): void {
  try {
    Taro.setStorageSync(HOME_FEED_CACHE_STORAGE_KEY, {
      savedAt: Date.now(),
      feeds,
    } satisfies StoredHomeFeedsCache)
  } catch {
    // 首页缓存只是首屏加速，写入失败不影响主流程
  }
}

function ensureHomeFeedCache(): HomeFeedsCache | null {
  if (homeFeedCache) return homeFeedCache
  homeFeedCache = readStoredHomeFeedCache()
  return homeFeedCache
}

export function readHomeFeedCache(): HomeFeedsCache {
  if (!ensureHomeFeedCache()) return createEmptyHomeFeeds()
  return {
    recommend: {
      ...homeFeedCache!.recommend,
      posts: applyPatchesToPosts(homeFeedCache!.recommend.posts),
    },
    latest: {
      ...homeFeedCache!.latest,
      posts: applyPatchesToPosts(homeFeedCache!.latest.posts),
    },
  }
}

export function writeHomeFeedCache(feeds: HomeFeedsCache): void {
  homeFeedCache = feeds
  writeStoredHomeFeedCache(feeds)
}

export function hasHomeFeedCache(tab: FeedTab): boolean {
  return (ensureHomeFeedCache()?.[tab]?.posts.length ?? 0) > 0
}

export function hasAnyHomeFeedCache(): boolean {
  return hasHomeFeedCache('recommend') || hasHomeFeedCache('latest')
}

export function patchHomeFeedCache(
  updater: (prev: HomeFeedsCache) => HomeFeedsCache,
): HomeFeedsCache {
  const base = ensureHomeFeedCache() ?? createEmptyHomeFeeds()
  const next = updater(base)
  writeHomeFeedCache(next)
  return next
}
