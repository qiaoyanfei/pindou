import { useCallback, useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { getCachedUser } from '@/services/communityService'
import {
  enrichUserProfile,
  isUserAuthenticated,
  oneClickWechatLogin,
} from '@/services/wechatAuth'
import type { UserProfile } from '@/types/community'

export { isUserAuthenticated }

export function useLogin() {
  const [user, setUser] = useState<UserProfile | null>(getCachedUser())
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const nextUser = await oneClickWechatLogin()
      setUser(nextUser)
      return nextUser
    } catch {
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useDidShow(async () => {
    const cached = getCachedUser()
    if (cached?.openid) {
      setUser(await enrichUserProfile(cached))
    }
  })

  return { user, setUser, loading, refresh, isAuthenticated: isUserAuthenticated(user) }
}
