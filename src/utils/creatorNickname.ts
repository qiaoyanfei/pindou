import Taro from '@tarojs/taro'
import { getCachedUser } from '@/services/communityService'
import { isUsableNickName, resolveNickNameForDisplay } from '@/utils/userProfile'

export const CREATOR_NICKNAME_KEY = 'pindou_creator_nickname'

export function getStoredCreatorNickname(): string {
  const value = Taro.getStorageSync(CREATOR_NICKNAME_KEY) as unknown
  if (typeof value !== 'string') return ''
  return value.trim()
}

export function setStoredCreatorNickname(nickname: string): void {
  const trimmed = nickname.trim()
  if (trimmed) {
    Taro.setStorageSync(CREATOR_NICKNAME_KEY, trimmed)
  } else {
    Taro.removeStorageSync(CREATOR_NICKNAME_KEY)
  }
}

/** 导出图纸作者名：优先自定义署名，否则取登录用户昵称 */
export function resolveCreatorNickname(): string {
  const stored = getStoredCreatorNickname()
  if (isUsableNickName(stored)) return stored
  return resolveNickNameForDisplay(getCachedUser())
}

export function normalizeCreatorSignature(value: string): string {
  return value.trim().slice(0, 20)
}
