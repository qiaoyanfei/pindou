import Taro from '@tarojs/taro'

export const CREATOR_NICKNAME_KEY = 'pindou_creator_nickname'

export const DEFAULT_CREATOR_NICKNAME = '微信用户'

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

/** 读取本地已保存的创作者署名（微信昵称填写或自定义） */
export function resolveCreatorNickname(): string {
  return getStoredCreatorNickname()
}

export function normalizeCreatorSignature(value: string): string {
  return value.trim().slice(0, 20)
}
