import type { FinishedProductDetail, FinishedProductSummary } from '@/types/community'

const CACHE_LIMIT = 20
const cache = new Map<string, FinishedProductDetail>()

function trimCache(): void {
  while (cache.size > CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value
    if (!oldestKey) break
    cache.delete(oldestKey)
  }
}

/** 列表摘要也可先塞进缓存，详情页可立即展示 */
export function cacheFinishedProduct(
  product: FinishedProductSummary | FinishedProductDetail | null | undefined,
): void {
  if (!product?._id) return
  const prev = cache.get(product._id)
  cache.delete(product._id)
  cache.set(product._id, {
    ...(prev || {}),
    ...product,
  } as FinishedProductDetail)
  trimCache()
}

export function getCachedFinishedProduct(productId: string): FinishedProductDetail | null {
  if (!productId) return null
  const cached = cache.get(productId)
  if (!cached) return null
  cache.delete(productId)
  cache.set(productId, cached)
  return cached
}
