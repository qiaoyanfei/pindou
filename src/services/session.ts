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

let cachedConfig: AppRemoteConfig | null = null
let refreshPromise: Promise<UserProfile | null> | null = null

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
}

export function clearSession(): void {
  setCachedUser(null)
  cachedConfig = null
  Taro.removeStorageSync(USER_STORAGE_KEY)
  Taro.removeStorageSync(CONFIG_STORAGE_KEY)
  Taro.removeStorageSync('sessionLoggedIn')
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

export async function refreshSessionIfLoggedIn(): Promise<UserProfile | null> {
  if (Taro.getStorageSync('sessionLoggedIn') !== '1') {
    return getCachedUser()
  }

  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    if (!initCloud()) {
      return restoreSessionFromStorage() ? getCachedUser() : null
    }

    restoreSessionFromStorage()
    try {
      const inviterId = Taro.getStorageSync('inviterId') as string | undefined
      const result = await login({
        inviterId: inviterId || undefined,
      })
      if (inviterId) Taro.removeStorageSync('inviterId')
      persistSession(result.user, result.config)
      markSessionLoggedIn()
      return result.user
    } catch {
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
