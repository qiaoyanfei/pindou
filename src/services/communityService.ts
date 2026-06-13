import type {
  AppRemoteConfig,
  BeanTransaction,
  DraftItem,
  FeedTab,
  PostCategory,
  PostDetail,
  PostSummary,
  PublishPayload,
  UserProfile,
} from '@/types/community'
import type { PatternConfig, PatternResult } from '@/types'
import {
  callCloudApi,
  downloadJsonFile,
  getTempFileUrl,
  getTempFileUrls,
  uploadCloudFile,
  uploadJsonCloudFile,
} from '@/services/cloudClient'

let cachedUser: UserProfile | null = null
let cachedConfig: AppRemoteConfig | null = null

export function getCachedUser(): UserProfile | null {
  return cachedUser
}

export function getCachedConfig(): AppRemoteConfig | null {
  return cachedConfig
}

export function setCachedUser(user: UserProfile | null): void {
  cachedUser = user
}

export async function login(params?: {
  inviterId?: string
  nickName?: string
  avatarUrl?: string
}): Promise<{ user: UserProfile; config: AppRemoteConfig }> {
  const result = await callCloudApi<{ user: UserProfile; config: AppRemoteConfig }>('login', params || {})
  cachedUser = result.user
  cachedConfig = result.config
  return result
}

export async function refreshCounts(): Promise<void> {
  const counts = await callCloudApi<{
    draftCount: number
    postCount: number
    likeCount: number
    favoriteCount: number
  }>('getCounts')
  if (cachedUser) {
    cachedUser = { ...cachedUser, draftCount: counts.draftCount, postCount: counts.postCount }
  }
}

export async function fetchFeed(tab: FeedTab, page = 1): Promise<{ list: PostSummary[]; hasMore: boolean }> {
  const result = await callCloudApi<{ list: PostSummary[]; hasMore: boolean }>('getFeed', { tab, page })
  const fileIds = result.list.map((item) => item.coverFileId).filter(Boolean)
  const authorAvatars = result.list.map((item) => item.author?.avatarUrl).filter(Boolean)
  const urlMap = await getTempFileUrls([...fileIds, ...authorAvatars] as string[])
  const list = result.list.map((item) => ({
    ...item,
    coverUrl: urlMap[item.coverFileId] || item.coverUrl || '',
    author: {
      ...item.author,
      avatarUrl: urlMap[item.author.avatarUrl] || item.author.avatarUrl || '',
    },
  }))
  return { list, hasMore: result.hasMore }
}

export async function searchPosts(keyword: string): Promise<PostSummary[]> {
  const result = await callCloudApi<{ list: PostSummary[] }>('searchPosts', { keyword })
  const fileIds = result.list.map((item) => item.coverFileId).filter(Boolean)
  const urlMap = await getTempFileUrls(fileIds)
  return result.list.map((item) => ({
    ...item,
    coverUrl: urlMap[item.coverFileId] || '',
  }))
}

export async function fetchPostDetail(postId: string): Promise<PostDetail> {
  const result = await callCloudApi<{ post: PostDetail }>('getPost', { postId })
  const post = result.post
  const coverUrl = post.coverFileId ? await getTempFileUrl(post.coverFileId) : ''
  const avatarUrl = post.author?.avatarUrl ? await getTempFileUrl(post.author.avatarUrl) : ''
  return {
    ...post,
    coverUrl,
    author: { ...post.author, avatarUrl },
  }
}

export async function toggleLike(postId: string): Promise<{ liked: boolean; likeCount: number }> {
  return callCloudApi('toggleLike', { postId })
}

export async function toggleFavorite(postId: string): Promise<{ favorited: boolean; favoriteCount: number }> {
  return callCloudApi('toggleFavorite', { postId })
}

export async function downloadPost(postId: string): Promise<{ post: PostDetail; charged: boolean; beanCost?: number }> {
  const result = await callCloudApi<{ post: PostDetail; charged: boolean; beanCost?: number }>('downloadPost', { postId })
  if (cachedUser && result.charged && result.beanCost) {
    cachedUser = { ...cachedUser, beanBalance: Math.max(0, cachedUser.beanBalance - result.beanCost) }
  }
  return result
}

export async function loadPatternFromPost(post: PostDetail): Promise<PatternResult> {
  if (post.pattern) return post.pattern
  return downloadJsonFile<PatternResult>(post.patternFileId)
}

export async function saveDraft(payload: {
  draftId?: string
  title?: string
  coverPath: string
  pattern: PatternResult
  config: PatternConfig
}): Promise<string> {
  const stamp = Date.now()
  const coverFileId = await uploadCloudFile(
    `drafts/covers/${stamp}.png`,
    payload.coverPath,
  )
  const patternFileId = await uploadJsonCloudFile(
    `drafts/patterns/${stamp}.json`,
    payload.pattern,
  )
  const result = await callCloudApi<{ draftId: string }>('saveDraft', {
    draftId: payload.draftId,
    title: payload.title || '未命名图纸',
    coverFileId,
    patternFileId,
    width: payload.pattern.width,
    height: payload.pattern.height,
    styleMode: payload.config.styleMode,
    paletteId: payload.config.paletteId,
    stats: payload.pattern.stats,
    totalBeads: payload.pattern.totalBeads,
    colorCount: Object.keys(payload.pattern.stats).length,
    config: payload.config,
  })
  await refreshCounts()
  return result.draftId
}

export async function fetchDrafts(): Promise<DraftItem[]> {
  const result = await callCloudApi<{ list: DraftItem[] }>('getDrafts')
  const urlMap = await getTempFileUrls(result.list.map((item) => item.coverFileId))
  return result.list.map((item) => ({ ...item, coverUrl: urlMap[item.coverFileId] || '' }))
}

export async function fetchDraft(draftId: string): Promise<DraftItem> {
  const result = await callCloudApi<{ draft: DraftItem }>('getDraft', { draftId })
  const coverUrl = await getTempFileUrl(result.draft.coverFileId)
  return { ...result.draft, coverUrl }
}

export async function deleteDraft(draftId: string): Promise<void> {
  await callCloudApi('deleteDraft', { draftId })
  await refreshCounts()
}

export async function publishPost(payload: PublishPayload): Promise<{ postId: string; reward: number }> {
  const result = await callCloudApi<{ postId: string; reward: number }>('publishPost', {
    ...payload,
    width: payload.pattern.width,
    height: payload.pattern.height,
    styleMode: payload.config.styleMode,
    paletteId: payload.config.paletteId,
    stats: payload.pattern.stats,
    totalBeads: payload.pattern.totalBeads,
    colorCount: Object.keys(payload.pattern.stats).length,
  })
  if (cachedUser) {
    cachedUser = {
      ...cachedUser,
      beanBalance: cachedUser.beanBalance + result.reward,
      postCount: (cachedUser.postCount || 0) + 1,
    }
  }
  await refreshCounts()
  return result
}

function normalizePostSummary(item: PostSummary): PostSummary {
  const raw = item as PostSummary & { authorNickName?: string; authorAvatarUrl?: string }
  return {
    ...item,
    author: item.author?.nickName
      ? item.author
      : {
          nickName: raw.authorNickName || '拼豆玩家',
          avatarUrl: raw.authorAvatarUrl || '',
          openid: raw.author?.openid,
        },
  }
}

export async function fetchMyPosts(): Promise<PostSummary[]> {
  const result = await callCloudApi<{ list: PostSummary[] }>('getMyPosts')
  const urlMap = await getTempFileUrls(result.list.map((item) => item.coverFileId))
  return result.list.map((item) =>
    normalizePostSummary({ ...item, coverUrl: urlMap[item.coverFileId] || '' }),
  )
}

export async function fetchMyLikes(): Promise<PostSummary[]> {
  const result = await callCloudApi<{ list: PostSummary[] }>('getMyLikes')
  const urlMap = await getTempFileUrls(result.list.map((item) => item.coverFileId))
  return result.list.map((item) =>
    normalizePostSummary({ ...item, coverUrl: urlMap[item.coverFileId] || '', liked: true }),
  )
}

export async function fetchMyFavorites(): Promise<PostSummary[]> {
  const result = await callCloudApi<{ list: PostSummary[] }>('getMyFavorites')
  const urlMap = await getTempFileUrls(result.list.map((item) => item.coverFileId))
  return result.list.map((item) =>
    normalizePostSummary({ ...item, coverUrl: urlMap[item.coverFileId] || '', favorited: true }),
  )
}

export async function fetchBeanLogs(filter: 'all' | 'income' | 'expense'): Promise<BeanTransaction[]> {
  const result = await callCloudApi<{ list: BeanTransaction[] }>('getBeanLogs', { filter })
  return result.list
}

export async function updateProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
  const result = await callCloudApi<{ user: UserProfile }>('updateProfile', profile)
  cachedUser = { ...cachedUser, ...result.user }
  return result.user
}

export async function submitFeedback(payload: {
  type: string
  content: string
  contact?: string
  images?: string[]
}): Promise<void> {
  await callCloudApi('submitFeedback', payload)
}

export async function updatePostVisibility(postId: string, visibility: 'public' | 'private'): Promise<void> {
  await callCloudApi('updatePostVisibility', { postId, visibility })
}

export function formatPostMeta(item: Pick<PostSummary, 'width' | 'height' | 'styleMode' | 'paletteId'>): string {
  const modeLabel = item.styleMode === 'manga' ? '漫画模式' : '人物模式'
  return `${item.width}×${item.height} | ${modeLabel} | ${item.paletteId.toUpperCase()}`
}

export function formatCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(value)
}

export const CATEGORY_OPTIONS: PostCategory[] = ['宠物', '人物', '饰品', '食物', '动漫', '动物', '亲子']
