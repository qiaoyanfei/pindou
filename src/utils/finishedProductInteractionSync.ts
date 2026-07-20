import Taro from '@tarojs/taro'
import type { FinishedProductSummary } from '@/types/community'

export interface FinishedProductInteractionPatch {
  productId: string
  liked?: boolean
  likeCount?: number
}

export const FINISHED_PRODUCT_INTERACTION_EVENT = 'finishedProductInteractionChange'

const patches = new Map<string, FinishedProductInteractionPatch>()

export function patchFinishedProductInteraction(
  patch: FinishedProductInteractionPatch,
): void {
  const prev = patches.get(patch.productId)
  patches.set(patch.productId, { ...prev, ...patch, productId: patch.productId })
  Taro.eventCenter.trigger(
    FINISHED_PRODUCT_INTERACTION_EVENT,
    patches.get(patch.productId),
  )
}

export function applyPatchToFinishedProduct<T extends FinishedProductSummary>(item: T): T {
  const patch = patches.get(item._id)
  if (!patch) return item
  const liked = patch.liked ?? item.liked
  const likeCount = patch.likeCount ?? item.likeCount
  if (liked === item.liked && likeCount === item.likeCount) return item
  return {
    ...item,
    liked,
    likeCount,
  }
}

export function applyPatchesToFinishedProducts<T extends FinishedProductSummary>(
  list: T[],
): T[] {
  let changed = false
  const next = list.map((item) => {
    const patched = applyPatchToFinishedProduct(item)
    if (patched !== item) changed = true
    return patched
  })
  return changed ? next : list
}

export function patchFinishedProductInList<T extends FinishedProductSummary>(
  list: T[],
  patch: FinishedProductInteractionPatch,
): T[] {
  const index = list.findIndex((item) => item._id === patch.productId)
  if (index === -1) return list
  const patched = applyPatchToFinishedProduct(list[index])
  if (patched === list[index]) return list
  const next = [...list]
  next[index] = patched
  return next
}
