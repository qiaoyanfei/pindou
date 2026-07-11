import Taro, { useDidShow, useUnload } from '@tarojs/taro'
import { useCallback, useRef, useState } from 'react'
import type { PostSummary } from '@/types/community'
import {
  clearMyListCache,
  hasMyListCache,
  invalidateMyListCache,
  isMyListCacheStale,
  readMyListCache,
  writeMyListCache,
  type MyListCacheKey,
} from '@/utils/myListCache'

interface LoadOptions {
  /** 已有列表时后台刷新，不显示「加载中」 */
  silent?: boolean
  append?: boolean
}

export function useCachedPostList(
  cacheKey: MyListCacheKey,
  fetcher: (page?: number) => Promise<{ list: PostSummary[]; hasMore: boolean; total?: number }>,
) {
  const initialCache = readMyListCache(cacheKey)
  const [list, setList] = useState<PostSummary[]>(initialCache?.list ?? [])
  const [page, setPage] = useState(initialCache?.page ?? 1)
  const [hasMore, setHasMore] = useState(initialCache?.hasMore ?? false)
  const [total, setTotal] = useState<number | undefined>(initialCache?.total)
  const [loading, setLoading] = useState(!initialCache)
  const [loadingMore, setLoadingMore] = useState(false)
  const inflightRef = useRef(false)

  const load = useCallback(async (nextPage = 1, options: LoadOptions = {}) => {
    if (inflightRef.current) return
    inflightRef.current = true
    const silent = options.silent ?? hasMyListCache(cacheKey)
    const append = options.append ?? false
    if (append) setLoadingMore(true)
    else if (!silent) setLoading(true)
    try {
      const result = await fetcher(nextPage)
      setPage(nextPage)
      setHasMore(result.hasMore)
      setTotal(result.total)
      setList((prev) => {
        const nextList = append ? [...prev, ...result.list] : result.list
        writeMyListCache(cacheKey, {
          list: nextList,
          page: nextPage,
          hasMore: result.hasMore,
          total: result.total,
        })
        return nextList
      })
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
    } finally {
      inflightRef.current = false
      setLoading(false)
      setLoadingMore(false)
    }
  }, [cacheKey, fetcher])

  useDidShow(() => {
    const cached = readMyListCache(cacheKey)
    if (cached && !isMyListCacheStale(cacheKey)) {
      setList(cached.list)
      setPage(cached.page)
      setHasMore(cached.hasMore)
      setTotal(cached.total)
      setLoading(false)
      return
    }

    void load(1, { silent: Boolean(cached) })
  })

  // navigateTo 进详情不会触发 unload；只有返回「我的」等上一级时才清缓存
  useUnload(() => {
    clearMyListCache(cacheKey)
  })

  const reload = useCallback(async () => {
    invalidateMyListCache(cacheKey)
    await load(1, { silent: false })
  }, [cacheKey, load])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return
    await load(page + 1, { append: true, silent: true })
  }, [hasMore, load, loading, loadingMore, page])

  return { list, loading, loadingMore, hasMore, total, reload, loadMore }
}
