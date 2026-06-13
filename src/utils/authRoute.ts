import Taro from '@tarojs/taro'
import { isOnLoginPage, safeNavigateTo, safeRedirect } from '@/utils/navigation'

export const LOGIN_PAGE = '/pages/login/index'

export function buildLoginUrl(redirect = '/pages/mine/index'): string {
  return `${LOGIN_PAGE}?redirect=${encodeURIComponent(redirect)}`
}

export function goLogin(redirect = '/pages/mine/index'): void {
  if (isOnLoginPage()) return
  safeRedirect(buildLoginUrl(redirect))
}
