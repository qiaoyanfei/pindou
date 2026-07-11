import type { PostSummary } from '@/types/community'

export type MyListCacheKey = 'my-posts' | 'drafts' | 'my-likes' | 'my-favorites'

export interface MyListCacheState {
  list: PostSummary[]
  page: number
  hasMore: boolean
  total?: number
}

const listCaches = new Map<MyListCacheKey, MyListCacheState>()
const invalidatedKeys = new Set<MyListCacheKey>()

export function readMyListCache(key: MyListCacheKey): MyListCacheState | null {
  return listCaches.get(key) ?? null
}

export function writeMyListCache(key: MyListCacheKey, state: MyListCacheState): void {
  listCaches.set(key, state)
  invalidatedKeys.delete(key)
}

export function hasMyListCache(key: MyListCacheKey): boolean {
  return listCaches.has(key)
}

export function invalidateMyListCache(keys: MyListCacheKey | MyListCacheKey[]): void {
  const list = Array.isArray(keys) ? keys : [keys]
  list.forEach((key) => invalidatedKeys.add(key))
}

export function isMyListCacheStale(key: MyListCacheKey): boolean {
  return invalidatedKeys.has(key)
}

export function clearMyListCacheStale(key: MyListCacheKey): void {
  invalidatedKeys.delete(key)
}

/** 离开列表页（返回上一级）时清除，下次从「我的」进入会重新加载 */
export function clearMyListCache(key: MyListCacheKey): void {
  listCaches.delete(key)
  invalidatedKeys.delete(key)
}

export function removePostFromMyListCache(
  postId: string,
  keys: MyListCacheKey | MyListCacheKey[],
): void {
  const targetKeys = Array.isArray(keys) ? keys : [keys]
  targetKeys.forEach((key) => {
    const cached = readMyListCache(key)
    if (!cached || !cached.list.some((item) => item._id === postId)) return
    writeMyListCache(key, {
      ...cached,
      list: cached.list.filter((item) => item._id !== postId),
      total: typeof cached.total === 'number' ? Math.max(0, cached.total - 1) : cached.total,
    })
  })
}
