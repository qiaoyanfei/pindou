import type { UserProfile } from '@/types/community'
import { DEFAULT_USER_NICKNAME } from '@/utils/userDisplay'

const NICK_PREFIXES = ['软萌', '元气', '像素', '创意', '手工', '可爱', '迷你', '糖果', '治愈', '复古']
const NICK_SUFFIXES = ['拼豆手', '豆豆酱', '拼豆人', '豆匠', '小豆子', '拼友', '豆友', '制作人', '手作娘', '拼贴师']

export function isLegacyDefaultNickName(nickName?: string): boolean {
  const value = nickName?.trim() || ''
  return !value || value === '拼豆玩家' || value === '微信用户'
}

export function normalizeNickName(value: string): string {
  return value.trim().slice(0, 20)
}

export function isUsableNickName(nickName?: string): boolean {
  const value = normalizeNickName(nickName || '')
  return value.length >= 2 && !isLegacyDefaultNickName(value)
}

export function generateRandomNickname(seed?: string): string {
  let prefixIndex = Math.floor(Math.random() * NICK_PREFIXES.length)
  let suffixIndex = Math.floor(Math.random() * NICK_SUFFIXES.length)
  let num = Math.floor(Math.random() * 900) + 100

  if (seed) {
    let hash = 0
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash + seed.charCodeAt(i)) | 0
    }
    const abs = Math.abs(hash)
    prefixIndex = abs % NICK_PREFIXES.length
    suffixIndex = Math.floor(abs / NICK_PREFIXES.length) % NICK_SUFFIXES.length
    num = (abs % 900) + 100
  }

  return `${NICK_PREFIXES[prefixIndex]}${NICK_SUFFIXES[suffixIndex]}${num}`
}

export function getFallbackNickName(user?: Pick<UserProfile, 'openid'> | null): string {
  if (user?.openid) return generateRandomNickname(user.openid)
  return DEFAULT_USER_NICKNAME
}

export function resolveNickNameForDisplay(user: UserProfile | null | undefined): string {
  if (isUsableNickName(user?.nickName)) return normalizeNickName(user!.nickName)
  return getFallbackNickName(user)
}

/** 作品作者展示名：过滤「微信用户」等无效昵称，按 openid 生成稳定 fallback */
export function resolveAuthorNickName(nickName?: string, openid?: string): string {
  if (isUsableNickName(nickName)) return normalizeNickName(nickName!)
  return getFallbackNickName(openid ? { openid } : null)
}

export function sanitizeProfileForStorage(user: UserProfile): UserProfile {
  const avatarUrl = user.avatarUrl?.trim() || ''
  return {
    ...user,
    avatarUrl: avatarUrl.startsWith('cloud://') ? avatarUrl : '',
  }
}
