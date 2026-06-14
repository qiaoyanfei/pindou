import Taro from '@tarojs/taro'
import type { PostSummary } from '@/types/community'

export interface PostInteractionPatch {
  postId: string
  liked?: boolean
  likeCount?: number
  favorited?: boolean
  favoriteCount?: number
}

export const POST_INTERACTION_EVENT = 'postInteractionChange'

const patches = new Map<string, PostInteractionPatch>()

export function patchPostInteraction(patch: PostInteractionPatch): void {
  const prev = patches.get(patch.postId)
  patches.set(patch.postId, { ...prev, ...patch, postId: patch.postId })
  Taro.eventCenter.trigger(POST_INTERACTION_EVENT, patches.get(patch.postId))
}

export function applyPatchToPost<T extends PostSummary>(post: T): T {
  const patch = patches.get(post._id)
  if (!patch) return post
  return {
    ...post,
    liked: patch.liked ?? post.liked,
    likeCount: patch.likeCount ?? post.likeCount,
    favorited: patch.favorited ?? post.favorited,
    favoriteCount: patch.favoriteCount ?? post.favoriteCount,
  }
}

export function applyPatchesToPosts<T extends PostSummary>(posts: T[]): T[] {
  return posts.map(applyPatchToPost)
}

export function patchPostInList<T extends PostSummary>(posts: T[], patch: PostInteractionPatch): T[] {
  const index = posts.findIndex((item) => item._id === patch.postId)
  if (index === -1) return posts
  const next = [...posts]
  next[index] = applyPatchToPost(next[index])
  return next
}
