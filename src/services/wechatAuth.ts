import Taro from '@tarojs/taro'
import { initCloud, uploadCloudFile, getTempFileUrl } from '@/services/cloudClient'
import { getCachedUser, login, refreshCounts, setCachedUser } from '@/services/communityService'
import type { UserProfile } from '@/types/community'

export interface WechatProfileInput {
  nickName?: string
  avatarUrl?: string
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
  const nickName = user?.nickName?.trim()
  if (!nickName || nickName === '拼豆玩家') return '微信用户'
  return nickName
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
  if (
    avatarUrl.startsWith('cloud://')
    || avatarUrl.startsWith('http://')
    || avatarUrl.startsWith('https://')
  ) {
    return avatarUrl
  }

  try {
    initCloud()
    return await uploadCloudFile(
      `avatars/${Date.now()}_${Math.random().toString(36).slice(2)}.png`,
      avatarUrl,
    )
  } catch {
    return avatarUrl
  }
}

/** 在用户点击回调内第一时间调用，不能先 setState */
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

export async function oneClickWechatLogin(
  profile?: WechatProfileInput,
): Promise<UserProfile> {
  initCloud()
  const inviterId = Taro.getStorageSync('inviterId') as string
  const avatarUrl = profile?.avatarUrl ? await normalizeAvatarUrl(profile.avatarUrl) : undefined

  const result = await login({
    inviterId: inviterId || undefined,
    nickName: profile?.nickName?.trim() || undefined,
    avatarUrl,
  })

  try {
    await refreshCounts()
  } catch {
    // counts refresh is best-effort
  }

  const cached = getCachedUser()
  const merged = cached || result.user
  const enriched = await enrichUserProfile(merged)
  setCachedUser(enriched)

  if (!enriched.openid) {
    throw new Error('登录失败，未获取到用户身份')
  }

  markSessionLoggedIn()
  return enriched
}

/** @deprecated use oneClickWechatLogin */
export async function completeWechatLogin(profile: WechatProfileInput): Promise<UserProfile> {
  return oneClickWechatLogin(profile)
}
