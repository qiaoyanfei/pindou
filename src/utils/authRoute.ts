import Taro from '@tarojs/taro'

export const LOGIN_PAGE = '/pages/login/index'

export function buildLoginUrl(redirect = '/pages/mine/index'): string {
  return `${LOGIN_PAGE}?redirect=${encodeURIComponent(redirect)}`
}

export function goLogin(redirect = '/pages/mine/index'): void {
  Taro.redirectTo({ url: buildLoginUrl(redirect) })
}
