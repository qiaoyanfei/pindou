import Taro, { useDidShow, useUnload } from '@tarojs/taro'
import { useCallback, useRef, useState } from 'react'
import type { PostSummary } from '@/types/community'
import {
  clearMyListCache,
  clearMyListCacheStale,
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
}

export function useCachedPostList(
  cacheKey: MyListCacheKey,
  fetcher: () => Promise<PostSummary[]>,
) {
  const initialCache = readMyListCache(cacheKey)
  const [list, setList] = useState<PostSummary[]>(initialCache ?? [])
  const [loading, setLoading] = useState(!initialCache)
  const inflightRef = useRef(false)

  const load = useCallback(async (options: LoadOptions = {}) => {
    if (inflightRef.current) return
    inflightRef.current = true
    const silent = options.silent ?? hasMyListCache(cacheKey)
    if (!silent) setLoading(true)
    try {
      const data = await fetcher()
      writeMyListCache(cacheKey, data)
      setList(data)
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
    } finally {
      inflightRef.current = false
      setLoading(false)
    }
  }, [cacheKey, fetcher])

  useDidShow(() => {
    const cached = readMyListCache(cacheKey)
    if (cached && !isMyListCacheStale(cacheKey)) {
      setList(cached)
      setLoading(false)
      return
    }

    clearMyListCacheStale(cacheKey)
    void load({ silent: Boolean(cached) })
  })

  // navigateTo 进详情不会触发 unload；只有返回「我的」等上一级时才清缓存
  useUnload(() => {
    clearMyListCache(cacheKey)
  })

  const reload = useCallback(async () => {
    invalidateMyListCache(cacheKey)
    await load({ silent: false })
  }, [cacheKey, load])

  return { list, loading, reload }
}
