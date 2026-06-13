import Taro from '@tarojs/taro'
import { initCloud, uploadCloudFile, getTempFileUrl } from '@/services/cloudClient'
import { getCachedUser, login, refreshCounts, setCachedUser } from '@/services/communityService'
import { persistSession } from '@/services/session'
import { sanitizeProfileForStorage, isUsableNickName, normalizeNickName, resolveNickNameForDisplay } from '@/utils/userProfile'
import type { AppRemoteConfig, UserProfile } from '@/types/community'

function sanitizeLoginNickName(nickName?: string): string | undefined {
  if (!nickName || !isUsableNickName(nickName)) return undefined
  return normalizeNickName(nickName)
}

export interface WechatProfileInput {
  nickName?: string
  avatarUrl?: string
}

export interface WechatLoginResult {
  user: UserProfile
  registerReward: number
  isNew: boolean
}

/** 云开发 openid + 用户主动点击过「微信一键登录」 */
export function isUserAuthenticated(user: UserProfile | null | undefined): boolean {
  const sessionLoggedIn = Taro.getStorageSync('sessionLoggedIn') === '1'
  return Boolean(sessionLoggedIn && user?.openid)
}

export function markSessionLoggedIn(): void {
  Taro.setStorageSync('sessionLoggedIn', '1')
}

export function getDisplayNickName(user: UserProfile | null | undefined): string {
  return resolveNickNameForDisplay(user ?? null)
}

export function formatAuthError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  const errMsg = (error as { errMsg?: string })?.errMsg
  if (errMsg) return errMsg
  return '登录失败，请稍后重试'
}

export function showAuthError(message: string): void {
  const content = message.length > 120 ? `${message.slice(0, 120)}...` : message
  Taro.showModal({
    title: '登录提示',
    content,
    showCancel: false,
    confirmText: '知道了',
  })
}

export async function enrichUserProfile(user: UserProfile): Promise<UserProfile> {
  let avatarUrl = user.avatarUrl || ''
  if (avatarUrl.startsWith('cloud://')) {
    try {
      avatarUrl = (await getTempFileUrl(avatarUrl)) || avatarUrl
    } catch {
      // keep cloud id if temp url fails
    }
  }
  return { ...user, avatarUrl }
}

async function normalizeAvatarUrl(avatarUrl?: string): Promise<string | undefined> {
  if (!avatarUrl) return undefined
  if (avatarUrl.startsWith('cloud://')) return avatarUrl

  initCloud()
  try {
    let localPath = avatarUrl
    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
      const res = await Taro.downloadFile({ url: avatarUrl })
      if (res.statusCode !== 200 || !res.tempFilePath) {
        return avatarUrl
      }
      localPath = res.tempFilePath
    }
    return await uploadCloudFile(
      `avatars/${Date.now()}_${Math.random().toString(36).slice(2)}.png`,
      localPath,
    )
  } catch {
    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
      return avatarUrl
    }
    return undefined
  }
}

/** @deprecated 2022 年后微信统一返回「微信用户」，请改用 input type="nickname" */
export async function tryGetWechatProfile(): Promise<WechatProfileInput | null> {
  try {
    const profile = await Taro.getUserProfile({ desc: '用于展示您的微信头像和昵称' })
    return {
      nickName: profile.userInfo.nickName,
      avatarUrl: profile.userInfo.avatarUrl,
    }
  } catch {
    try {
      const setting = await Taro.getSetting()
      if (setting.authSetting['scope.userInfo']) {
        const info = await Taro.getUserInfo()
        return {
          nickName: info.userInfo.nickName,
          avatarUrl: info.userInfo.avatarUrl,
        }
      }
    } catch {
      // ignore fallback errors
    }
  }
  return null
}

async function saveWechatProfile(profile?: WechatProfileInput): Promise<{
  user: UserProfile
  config: AppRemoteConfig
  registerReward: number
  isNew: boolean
}> {
  initCloud()
  const avatarUrl = profile?.avatarUrl ? await normalizeAvatarUrl(profile.avatarUrl) : undefined
  const result = await login({
    nickName: sanitizeLoginNickName(profile?.nickName),
    avatarUrl,
    persist: false,
  })
  const canonical = sanitizeProfileForStorage(result.user)
  setCachedUser(canonical)
  persistSession(canonical, result.config)
  return {
    user: canonical,
    config: result.config,
    registerReward: result.registerReward,
    isNew: Boolean(result.user.isNew),
  }
}

export async function oneClickWechatLogin(
  profile?: WechatProfileInput,
): Promise<WechatLoginResult> {
  const inviterId = Taro.getStorageSync('inviterId') as string
  const avatarUrl = profile?.avatarUrl ? await normalizeAvatarUrl(profile.avatarUrl) : undefined

  const result = await login({
    inviterId: inviterId || undefined,
    nickName: sanitizeLoginNickName(profile?.nickName),
    avatarUrl,
    persist: false,
  })

  if (inviterId) Taro.removeStorageSync('inviterId')

  try {
    await refreshCounts()
  } catch {
    // counts refresh is best-effort
  }

  const canonical = sanitizeProfileForStorage(result.user)

  if (!canonical.openid) {
    throw new Error('登录失败，未获取到用户身份')
  }

  setCachedUser(canonical)
  markSessionLoggedIn()
  persistSession(canonical, result.config)
  return {
    user: canonical,
    registerReward: result.registerReward,
    isNew: Boolean(result.user.isNew),
  }
}

/** 已登录用户点击同步微信昵称与头像 */
export async function updateWechatProfile(profile: WechatProfileInput): Promise<UserProfile> {
  const result = await saveWechatProfile(profile)
  try {
    await refreshCounts()
  } catch {
    // counts refresh is best-effort
  }
  const latest = getCachedUser()
  return latest || result.user
}

/** @deprecated use oneClickWechatLogin */
export async function completeWechatLogin(profile: WechatProfileInput): Promise<UserProfile> {
  const result = await oneClickWechatLogin(profile)
  return result.user
}
