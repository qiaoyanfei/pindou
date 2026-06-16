import Taro from '@tarojs/taro'
import type {
  AppRemoteConfig,
  BeanTransaction,
  DraftItem,
  FeedTab,
  PostCategory,
  PostDetail,
  PostReviewStatus,
  PostSummary,
  PostVisibility,
  PublishPayload,
  UserProfile,
} from '@/types/community'
import type { PatternConfig, PatternResult } from '@/types'
import { DEFAULT_CONFIG, normalizeConfig, STYLE_MODE_LABELS } from '@/utils/constants'
import { PATTERN_STORAGE_KEY } from '@/types'
import {
  callCloudApi,
  downloadJsonFile,
  getTempFileUrl,
  getTempFileUrls,
  uploadCloudFile,
  uploadJsonCloudFile,
} from '@/services/cloudClient'
import { getSessionConfig, persistSession, setSessionConfig } from '@/services/session'
import { resolveAuthorNickName } from '@/utils/userProfile'
import { safeSwitchTab } from '@/utils/navigation'

let cachedUser: UserProfile | null = null
let loginPromise: Promise<LoginResult> | null = null

function normalizeUserProfile(user: UserProfile & { isNew?: boolean }): UserProfile {
  return {
    ...user,
    beanBalance: Math.max(0, Number(user.beanBalance) || 0),
  }
}

export interface LoginResult {
  user: UserProfile & { isNew?: boolean }
  config: AppRemoteConfig
  registerReward: number
}

export function getCachedUser(): UserProfile | null {
  return cachedUser
}

export function getCachedConfig(): AppRemoteConfig | null {
  return getSessionConfig()
}

export function setCachedUser(user: UserProfile | null): void {
  cachedUser = user
}

export async function login(params?: {
  inviterId?: string
  nickName?: string
  avatarUrl?: string
  persist?: boolean
  refreshOnly?: boolean
}): Promise<LoginResult> {
  const wantsProfileUpdate = Boolean(params?.nickName || params?.avatarUrl)

  if (loginPromise) {
    if (wantsProfileUpdate) {
      try {
        await loginPromise
      } catch {
        // ignore stale login failure, retry with profile payload
      }
    } else {
      return loginPromise
    }
  }

  loginPromise = (async () => {
    const { persist, ...loginData } = params || {}
    const result = await callCloudApi<LoginResult>('login', loginData)
    const user = normalizeUserProfile(result.user)
    cachedUser = user
    setSessionConfig(result.config)
    const shouldPersist = persist ?? Taro.getStorageSync('sessionLoggedIn') === '1'
    if (shouldPersist) {
      persistSession(user, result.config)
    }
    return { ...result, user }
  })()

  try {
    return await loginPromise
  } finally {
    loginPromise = null
  }
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
    const config = getSessionConfig()
    if (config) persistSession(cachedUser, config)
  }
}

export async function fetchFeed(tab: FeedTab, page = 1): Promise<{ list: PostSummary[]; hasMore: boolean }> {
  const result = await callCloudApi<{ list: PostSummary[]; hasMore: boolean }>('getFeed', { tab, page })
  const fileIds = result.list.map((item) => item.coverFileId).filter(Boolean)
  const authorAvatars = result.list.map((item) => item.author?.avatarUrl).filter(Boolean)
  const urlMap = await getTempFileUrls([...fileIds, ...authorAvatars] as string[])
  const list = result.list.map((item) => {
    const normalized = normalizePostSummary({
      ...item,
      coverUrl: urlMap[item.coverFileId] || item.coverUrl || '',
    })
    const avatarKey = item.author?.avatarUrl || ''
    return {
      ...normalized,
      author: {
        ...normalized.author,
        avatarUrl: urlMap[avatarKey] || normalized.author.avatarUrl || '',
      },
    }
  })
  return { list, hasMore: result.hasMore }
}

export async function searchPosts(keyword: string): Promise<PostSummary[]> {
  const result = await callCloudApi<{ list: PostSummary[] }>('searchPosts', { keyword })
  const fileIds = result.list.map((item) => item.coverFileId).filter(Boolean)
  const urlMap = await getTempFileUrls(fileIds)
  return result.list.map((item) => normalizePostSummary({
    ...item,
    coverUrl: urlMap[item.coverFileId] || '',
  }))
}

export async function fetchPostDetail(postId: string): Promise<PostDetail> {
  const result = await callCloudApi<{ post: PostDetail }>('getPost', { postId })
  const post = result.post
  const coverUrl = post.coverFileId ? await getTempFileUrl(post.coverFileId) : ''
  const avatarUrl = post.author?.avatarUrl ? await getTempFileUrl(post.author.avatarUrl) : ''
  return normalizePostSummary({
    ...post,
    coverUrl,
    author: { ...post.author, avatarUrl },
  }) as PostDetail
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

export async function rewardShare(): Promise<{ rewarded: boolean; amount: number; beanBalance: number }> {
  const result = await callCloudApi<{ rewarded: boolean; amount: number; beanBalance: number }>('rewardShare')
  if (cachedUser && Number.isFinite(result.beanBalance)) {
    cachedUser = { ...cachedUser, beanBalance: Math.max(0, result.beanBalance) }
    const config = getSessionConfig()
    if (config) persistSession(cachedUser, config)
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

export async function publishPost(payload: PublishPayload): Promise<{
  postId: string
  reward: number
  reviewStatus?: import('@/types/community').PostReviewStatus
}> {
  const result = await callCloudApi<{
    postId: string
    reward: number
    reviewStatus?: import('@/types/community').PostReviewStatus
  }>('publishPost', {
    draftId: payload.draftId,
    title: payload.title,
    category: payload.category,
    description: payload.description,
    visibility: payload.visibility,
    coverFileId: payload.coverFileId,
    sheetFileId: payload.sheetFileId,
    patternFileId: payload.patternFileId,
    width: payload.pattern.width,
    height: payload.pattern.height,
    styleMode: payload.config.styleMode,
    paletteId: payload.config.paletteId,
    stats: payload.pattern.stats,
    totalBeads: payload.pattern.totalBeads,
    colorCount: Object.keys(payload.pattern.stats).length,
    config: payload.config,
  })
  if (cachedUser) {
    cachedUser = {
      ...cachedUser,
      draftCount: (cachedUser.draftCount || 0) + 1,
    }
    const config = getSessionConfig()
    if (config) persistSession(cachedUser, config)
  }
  try {
    await refreshCounts()
  } catch {
    // count sync failure should not block publish
  }
  return result
}

function normalizePostSummary(item: PostSummary): PostSummary {
  const raw = item as PostSummary & { authorNickName?: string; authorAvatarUrl?: string; _openid?: string }
  const openid = item.author?.openid || raw._openid
  return {
    ...item,
    author: {
      nickName: resolveAuthorNickName(item.author?.nickName || raw.authorNickName, openid),
      avatarUrl: item.author?.avatarUrl || raw.authorAvatarUrl || '',
      openid,
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

export async function fetchPendingPosts(): Promise<PostSummary[]> {
  const result = await callCloudApi<{ list: PostSummary[] }>('getPendingPosts')
  const urlMap = await getTempFileUrls(result.list.map((item) => item.coverFileId))
  return result.list.map((item) =>
    normalizePostSummary({ ...item, coverUrl: urlMap[item.coverFileId] || '' }),
  )
}

export async function fetchMyLikes(): Promise<PostSummary[]> {
  const result = await callCloudApi<{ list: PostSummary[] }>('getMyLikes')
  const fileIds = result.list.map((item) => item.coverFileId).filter(Boolean)
  const authorAvatars = result.list
    .map((item) => item.author?.avatarUrl)
    .filter(Boolean) as string[]
  const urlMap = await getTempFileUrls([...fileIds, ...authorAvatars])
  return result.list.map((item) => {
    const normalized = normalizePostSummary({
      ...item,
      coverUrl: urlMap[item.coverFileId] || item.coverUrl || '',
      liked: true,
    })
    const avatarKey = normalized.author?.avatarUrl || ''
    return {
      ...normalized,
      author: {
        ...normalized.author,
        avatarUrl: urlMap[avatarKey] || avatarKey || '',
      },
    }
  })
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

export async function submitFeedback(payload: {
  type: string
  content: string
  contact?: string
  images?: string[]
}): Promise<void> {
  await callCloudApi('submitFeedback', payload)
}

export async function updatePostVisibility(
  postId: string,
  visibility: 'public' | 'private',
): Promise<PostReviewStatus> {
  const result = await callCloudApi<{ reviewStatus: PostReviewStatus }>('updatePostVisibility', {
    postId,
    visibility,
  })
  try {
    await refreshCounts()
  } catch {
    // count sync failure should not block visibility update
  }
  return result.reviewStatus
}

export interface AdminCheckResult {
  isAdmin: boolean
  openid?: string
  adminCount?: number
}

export async function checkIsAdmin(): Promise<AdminCheckResult> {
  const result = await callCloudApi<AdminCheckResult>('checkAdmin')
  return {
    isAdmin: Boolean(result.isAdmin),
    openid: result.openid,
    adminCount: result.adminCount,
  }
}

export async function fetchReviewQueue(): Promise<PostSummary[]> {
  const result = await callCloudApi<{ list: PostSummary[] }>('getReviewQueue')
  const urlMap = await getTempFileUrls(result.list.map((item) => item.coverFileId))
  return result.list.map((item) =>
    normalizePostSummary({ ...item, coverUrl: urlMap[item.coverFileId] || '' }),
  )
}

export async function reviewPost(
  postId: string,
  action: 'approve' | 'reject',
  note?: string,
): Promise<void> {
  await callCloudApi('reviewPost', { postId, action, note })
}

export async function prepareRegenerateFromPost(postId: string): Promise<void> {
  const post = await fetchPostDetail(postId)
  const pattern = await loadPatternFromPost(post)
  const config: PatternConfig = normalizeConfig({
    ...DEFAULT_CONFIG,
    styleMode: post.styleMode,
    paletteId: post.paletteId,
  })
  Taro.setStorageSync(PATTERN_STORAGE_KEY, { pattern, config })
  safeSwitchTab('/pages/generate/index')
}

export function formatPostMeta(item: Pick<PostSummary, 'width' | 'height' | 'styleMode' | 'paletteId'>): string {
  const modeLabel = STYLE_MODE_LABELS[item.styleMode]
  return `${item.width}×${item.height} | ${modeLabel} | ${item.paletteId.toUpperCase()}`
}

export function formatCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(value)
}

export function isOwnPost(authorOpenid?: string): boolean {
  const user = getCachedUser()
  return Boolean(user?.openid && authorOpenid && user.openid === authorOpenid)
}

export function buildPostDetailUrl(
  postId: string,
  authorOpenid?: string,
  visibility?: PostVisibility,
): string {
  if (isOwnPost(authorOpenid)) {
    const type = visibility === 'private' ? 'pending' : 'published'
    return `/pages/my-post-detail/index?type=${type}&id=${postId}`
  }
  return `/pages/post-detail/index?id=${postId}`
}

export const CATEGORY_OPTIONS: PostCategory[] = ['宠物', '人物', '饰品', '食物', '动漫', '动物', '亲子']
