import Taro from '@tarojs/taro'
import type { AppRemoteConfig, UserProfile } from '@/types/community'
import { getCachedUser, login, setCachedUser } from '@/services/communityService'
import { initCloud } from '@/services/cloudClient'
import { isUserAuthenticated, markSessionLoggedIn } from '@/services/wechatAuth'
import { sanitizeProfileForStorage } from '@/utils/userProfile'
import { goLogin } from '@/utils/authRoute'
import { isOnLoginPage } from '@/utils/navigation'

const USER_STORAGE_KEY = 'pindou_user_profile'
const CONFIG_STORAGE_KEY = 'pindou_app_config'
const SESSION_REFRESHED_AT_KEY = 'pindou_session_refreshed_at'
const SESSION_REFRESH_TTL_MS = 15 * 60 * 1000

let cachedConfig: AppRemoteConfig | null = null
let refreshPromise: Promise<UserProfile | null> | null = null

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  const errMsg = (error as { errMsg?: string })?.errMsg
  return errMsg || ''
}

export function isSessionInvalidError(message: string): boolean {
  const invalidHints = ['登录已失效', '账号已注销', '未获取到 openid', '未获取到用户身份', '用户不存在']
  return invalidHints.some((hint) => message.includes(hint))
}

export function getSessionConfig(): AppRemoteConfig | null {
  return cachedConfig
}

export function setSessionConfig(config: AppRemoteConfig | null): void {
  cachedConfig = config
}

export function persistSession(user: UserProfile, config: AppRemoteConfig): void {
  const canonical = sanitizeProfileForStorage(user)
  setCachedUser(canonical)
  cachedConfig = config
  Taro.setStorageSync(USER_STORAGE_KEY, canonical)
  Taro.setStorageSync(CONFIG_STORAGE_KEY, config)
  Taro.setStorageSync(SESSION_REFRESHED_AT_KEY, Date.now())
}

export function clearSession(): void {
  setCachedUser(null)
  cachedConfig = null
  Taro.removeStorageSync(USER_STORAGE_KEY)
  Taro.removeStorageSync(CONFIG_STORAGE_KEY)
  Taro.removeStorageSync(SESSION_REFRESHED_AT_KEY)
  Taro.removeStorageSync('sessionLoggedIn')
}

function shouldRefreshSession(force = false): boolean {
  if (force) return true
  if (!getCachedUser()) return true
  const lastRefreshedAt = Number(Taro.getStorageSync(SESSION_REFRESHED_AT_KEY) || 0)
  if (!lastRefreshedAt) return true
  return Date.now() - lastRefreshedAt > SESSION_REFRESH_TTL_MS
}

export function restoreSessionFromStorage(): boolean {
  try {
    const user = Taro.getStorageSync(USER_STORAGE_KEY) as UserProfile | undefined
    const config = Taro.getStorageSync(CONFIG_STORAGE_KEY) as AppRemoteConfig | undefined
    if (user?.openid) {
      const restored = sanitizeProfileForStorage({
        ...user,
        beanBalance: Math.max(0, Number(user.beanBalance) || 0),
      })
      setCachedUser(restored)
      if (restored.avatarUrl !== (user.avatarUrl || '')) {
        Taro.setStorageSync(USER_STORAGE_KEY, restored)
      }
      cachedConfig = config || null
      return Taro.getStorageSync('sessionLoggedIn') === '1'
    }
  } catch {
    // ignore corrupted cache
  }
  return false
}

export async function refreshSessionIfLoggedIn(options?: { force?: boolean }): Promise<UserProfile | null> {
  if (Taro.getStorageSync('sessionLoggedIn') !== '1') {
    return getCachedUser()
  }

  restoreSessionFromStorage()
  if (!shouldRefreshSession(options?.force)) {
    return getCachedUser()
  }

  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    if (!initCloud()) {
      return restoreSessionFromStorage() ? getCachedUser() : null
    }

    try {
      const result = await login({ refreshOnly: true })
      persistSession(result.user, result.config)
      markSessionLoggedIn()
      return result.user
    } catch (error) {
      const message = getErrorMessage(error)
      if (isSessionInvalidError(message)) {
        clearSession()
        return null
      }
      return getCachedUser()
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export async function requireAuthenticated(redirect: string): Promise<UserProfile | null> {
  restoreSessionFromStorage()
  await refreshSessionIfLoggedIn()
  const user = getCachedUser()
  if (isUserAuthenticated(user)) return user
  if (!isOnLoginPage()) {
    goLogin(redirect)
  }
  return null
}
