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
  const liked = patch.liked ?? post.liked
  const likeCount = patch.likeCount ?? post.likeCount
  const favorited = patch.favorited ?? post.favorited
  const favoriteCount = patch.favoriteCount ?? post.favoriteCount
  if (
    liked === post.liked
    && likeCount === post.likeCount
    && favorited === post.favorited
    && favoriteCount === post.favoriteCount
  ) {
    return post
  }
  return {
    ...post,
    liked,
    likeCount,
    favorited,
    favoriteCount,
  }
}

export function applyPatchesToPosts<T extends PostSummary>(posts: T[]): T[] {
  let changed = false
  const next = posts.map((post) => {
    const patched = applyPatchToPost(post)
    if (patched !== post) changed = true
    return patched
  })
  return changed ? next : posts
}

export function patchPostInList<T extends PostSummary>(posts: T[], patch: PostInteractionPatch): T[] {
  const index = posts.findIndex((item) => item._id === patch.postId)
  if (index === -1) return posts
  const patched = applyPatchToPost(posts[index])
  if (patched === posts[index]) return posts
  const next = [...posts]
  next[index] = patched
  return next
}
