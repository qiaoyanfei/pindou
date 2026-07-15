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
import { normalizeConfig, STYLE_MODE_LABELS } from '@/utils/constants'
import { PATTERN_STORAGE_KEY } from '@/types'
import {
  callCloudApi,
  downloadCloudFile,
  downloadJsonFile,
  getTempFileUrl,
  getTempFileUrls,
  uploadCloudFile,
  uploadJsonCloudFile,
} from '@/services/cloudClient'
import { persistGenerateSourceImage, setGenerateDraft } from '@/services/generateSession'
import { getSessionConfig, persistSession, setSessionConfig } from '@/services/session'
import { resolveAuthorNickName } from '@/utils/userProfile'
import { safeSwitchTab } from '@/utils/navigation'
import { setStorageSafe } from '@/utils/localCache'
import { invalidateMyListCache, removePostFromMyListCache } from '@/utils/myListCache'

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
  const fileIds = getCloudFileIds(result.list)
  const authorAvatars = result.list
    .map((item) => item.author?.avatarUrl)
    .filter((fileId): fileId is string => Boolean(fileId))
  const urlMap = await getTempFileUrls([...fileIds, ...authorAvatars] as string[])
  const list = result.list.map((item) => {
    const coverFileId = item.coverFileId || ''
    const normalized = normalizePostSummary({
      ...item,
      coverUrl: urlMap[coverFileId] || item.coverUrl || '',
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

export async function searchPosts(
  keyword: string,
  page = 1,
  category?: PostCategory | '',
): Promise<{ list: PostSummary[]; hasMore: boolean }> {
  const result = await callCloudApi<{ list: PostSummary[]; hasMore?: boolean }>('searchPosts', {
    keyword,
    page,
    pageSize: 20,
    category,
  })
  const fileIds = result.list
    .map((item) => item.coverFileId)
    .filter((fileId): fileId is string => Boolean(fileId))
  const urlMap = await getTempFileUrls(fileIds)
  return {
    list: result.list.map((item) => {
      const coverFileId = item.coverFileId || ''
      return normalizePostSummary({
        ...item,
        coverUrl: urlMap[coverFileId] || '',
      })
    }),
    hasMore: result.hasMore ?? false,
  }
}

export async function fetchPostDetail(postId: string): Promise<PostDetail> {
  const result = await callCloudApi<{ post: PostDetail }>('getPost', { postId })
  const post = result.post
  const coverFileId = post.coverFileId || ''
  const avatarFileId = post.author?.avatarUrl || ''
  const urlMap = await getTempFileUrls([coverFileId, avatarFileId])
  return normalizePostSummary({
    ...post,
    coverUrl: urlMap[coverFileId] || post.coverUrl || '',
    author: { ...post.author, avatarUrl: urlMap[avatarFileId] || post.author?.avatarUrl || '' },
  }) as PostDetail
}

export async function toggleLike(postId: string): Promise<{ liked: boolean; likeCount: number }> {
  return callCloudApi('toggleLike', { postId })
}

export async function toggleFavorite(postId: string): Promise<{ favorited: boolean; favoriteCount: number }> {
  return callCloudApi('toggleFavorite', { postId })
}

export async function downloadPost(
  postId: string,
  options?: {
    rewardedVideoCompleted?: boolean
    chargeOnAdNotCompleted?: boolean
  },
): Promise<{
  post: PostDetail
  charged: boolean
  beanCost?: number
  beanBalance?: number
  rewardedVideoFree?: boolean
}> {
  const result = await callCloudApi<{
    post: PostDetail
    charged: boolean
    beanCost?: number
    beanBalance?: number
    rewardedVideoFree?: boolean
  }>('downloadPost', {
    postId,
    rewardedVideoCompleted: Boolean(options?.rewardedVideoCompleted),
    chargeOnAdNotCompleted: Boolean(options?.chargeOnAdNotCompleted),
  })
  if (cachedUser && result.charged && result.beanCost) {
    const nextBalance = Number.isFinite(result.beanBalance)
      ? Number(result.beanBalance)
      : cachedUser.beanBalance - result.beanCost
    cachedUser = { ...cachedUser, beanBalance: Math.max(0, nextBalance) }
    const config = getSessionConfig()
    if (config) persistSession(cachedUser, config)
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

export async function resolvePostSourceImagePath(
  post: Pick<PostDetail, 'sourceImageFileId'>,
): Promise<string> {
  if (!post.sourceImageFileId) return ''
  try {
    const tempPath = await downloadCloudFile(post.sourceImageFileId)
    return persistGenerateSourceImage(tempPath)
  } catch {
    return ''
  }
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
    postId: payload.postId,
    draftId: payload.draftId,
    title: payload.title,
    category: payload.category,
    description: payload.description,
    visibility: payload.visibility,
    coverFileId: payload.coverFileId,
    sheetFileId: payload.sheetFileId,
    patternFileId: payload.patternFileId,
    sourceImageFileId: payload.sourceImageFileId,
    width: payload.pattern.width,
    height: payload.pattern.height,
    styleMode: payload.config.styleMode,
    paletteId: payload.config.paletteId,
    stats: payload.pattern.stats,
    totalBeads: payload.pattern.totalBeads,
    colorCount: Object.keys(payload.pattern.stats).length,
    config: payload.config,
  })
  if (cachedUser && !payload.postId) {
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

type PagedPostSummaryResult = { list: PostSummary[]; hasMore: boolean; total?: number }

function getCloudFileIds(list: PostSummary[]): string[] {
  return list
    .map((item) => item.coverFileId)
    .filter((fileId): fileId is string => Boolean(fileId))
}

async function mapPostSummariesWithCover(
  list: PostSummary[],
  extra?: Partial<PostSummary>,
): Promise<PostSummary[]> {
  const urlMap = await getTempFileUrls(getCloudFileIds(list))
  return list.map((item) => {
    const coverFileId = item.coverFileId || ''
    return normalizePostSummary({
      ...item,
      ...extra,
      coverUrl: urlMap[coverFileId] || item.coverUrl || '',
    })
  })
}

export async function fetchMyPosts(page = 1): Promise<PagedPostSummaryResult> {
  const result = await callCloudApi<{ list: PostSummary[]; hasMore?: boolean; total?: number }>('getMyPosts', {
    page,
    pageSize: 20,
  })
  return {
    list: await mapPostSummariesWithCover(result.list),
    hasMore: result.hasMore ?? false,
    total: result.total,
  }
}

export async function fetchPendingPosts(page = 1): Promise<PagedPostSummaryResult> {
  const result = await callCloudApi<{ list: PostSummary[]; hasMore?: boolean; total?: number }>('getPendingPosts', {
    page,
    pageSize: 20,
  })
  return {
    list: await mapPostSummariesWithCover(result.list),
    hasMore: result.hasMore ?? false,
    total: result.total,
  }
}

export async function fetchMyLikes(page = 1): Promise<PagedPostSummaryResult> {
  const result = await callCloudApi<{ list: PostSummary[]; hasMore?: boolean; total?: number }>('getMyLikes', {
    page,
    pageSize: 20,
  })
  const fileIds = getCloudFileIds(result.list)
  const authorAvatars = result.list
    .map((item) => item.author?.avatarUrl)
    .filter(Boolean) as string[]
  const urlMap = await getTempFileUrls([...fileIds, ...authorAvatars])
  return {
    list: result.list.map((item) => {
      const coverFileId = item.coverFileId || ''
      const normalized = normalizePostSummary({
        ...item,
        coverUrl: urlMap[coverFileId] || item.coverUrl || '',
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
    }),
    hasMore: result.hasMore ?? false,
    total: result.total,
  }
}

export async function fetchMyFavorites(page = 1): Promise<PagedPostSummaryResult> {
  const result = await callCloudApi<{ list: PostSummary[]; hasMore?: boolean; total?: number }>('getMyFavorites', {
    page,
    pageSize: 20,
  })
  return {
    list: await mapPostSummariesWithCover(result.list, { favorited: true }),
    hasMore: result.hasMore ?? false,
    total: result.total,
  }
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

export async function deletePost(postId: string): Promise<void> {
  await callCloudApi('deletePost', { postId })
  removePostFromMyListCache(postId, ['my-posts', 'drafts'])
  invalidateMyListCache(['my-posts', 'drafts'])
  try {
    await refreshCounts()
  } catch {
    // count sync failure should not block delete
  }
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
  const urlMap = await getTempFileUrls(getCloudFileIds(result.list))
  return result.list.map((item) =>
    normalizePostSummary({ ...item, coverUrl: urlMap[item.coverFileId || ''] || '' }),
  )
}

export async function fetchReviewAuthorPosts(
  authorOpenid: string,
  options: { tab?: 'published' | 'pending'; page?: number; pageSize?: number } = {},
): Promise<{
  list: PostSummary[]
  tab: 'published' | 'pending'
  page: number
  total: number
  publishedTotal: number
  pendingTotal: number
  hasMore: boolean
}> {
  const tab = options.tab || 'published'
  const page = options.page || 1
  const result = await callCloudApi<{
    list?: PostSummary[]
    tab?: 'published' | 'pending'
    page?: number
    total?: number
    publishedTotal?: number
    pendingTotal?: number
    hasMore?: boolean
    published?: PostSummary[]
    pending?: PostSummary[]
  }>('getReviewAuthorPosts', {
    authorOpenid,
    tab,
    page,
    pageSize: options.pageSize || 20,
  })

  if (result.published && result.pending) {
    const legacyList = tab === 'pending' ? result.pending : result.published
    const list = await mapPostSummariesWithCover(legacyList)
    return {
      list,
      tab,
      page: 1,
      total: legacyList.length,
      publishedTotal: result.published.length,
      pendingTotal: result.pending.length,
      hasMore: false,
    }
  }

  const list = await mapPostSummariesWithCover(result.list || [])
  return {
    list,
    tab: result.tab || tab,
    page: result.page || page,
    total: result.total ?? list.length,
    publishedTotal: result.publishedTotal ?? 0,
    pendingTotal: result.pendingTotal ?? 0,
    hasMore: result.hasMore ?? false,
  }
}

export async function reviewPost(
  postId: string,
  action: 'approve' | 'reject',
  note?: string,
  reviewTitle?: string,
): Promise<void> {
  await callCloudApi('reviewPost', { postId, action, note, reviewTitle })
}

export async function prepareRegenerateFromPost(postId: string): Promise<void> {
  const post = await fetchPostDetail(postId)
  const pattern = await loadPatternFromPost(post)
  const config: PatternConfig = normalizeConfig({
    ...(post.config || {}),
    styleMode: post.styleMode,
    paletteId: post.paletteId,
  })
  const sourceImagePath = await resolvePostSourceImagePath(post)
  setStorageSafe(PATTERN_STORAGE_KEY, {
    pattern,
    config,
    sourceImagePath: sourceImagePath || undefined,
    previewOrigin: 'post',
    postId,
    postTitle: post.title,
    postCategory: post.category,
    existingSourceImageFileId: post.sourceImageFileId,
    previewSessionId: `post:${postId}:regenerate:${Date.now()}`,
  })
  if (sourceImagePath) {
    setGenerateDraft(sourceImagePath, config)
  }
  safeSwitchTab('/pages/generate/index')
}

export function formatPostMeta(item: Pick<PostSummary, 'width' | 'height' | 'styleMode' | 'paletteId'>): string {
  const modeLabel = STYLE_MODE_LABELS[item.styleMode]
  return `${item.width}×${item.height} | ${modeLabel} | ${item.paletteId.toUpperCase()}`
}

export function buildPostDetailForPreview(item: PostSummary): PostDetail | null {
  if (!item.patternFileId) return null
  return {
    ...item,
    description: '',
    visibility: item.visibility || 'private',
    patternFileId: item.patternFileId,
    stats: item.stats || {},
    totalBeads: item.totalBeads || 0,
    config: item.config,
  }
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
    return type === 'pending'
      ? `/pages/my-pending-detail/index?id=${postId}`
      : `/pages/my-published-detail/index?id=${postId}`
  }
  return `/pages/post-detail/index?id=${postId}`
}

export const CATEGORY_OPTIONS: PostCategory[] = ['宠物', '人物', '饰品', '食物', '动漫', '动物', '亲子']
