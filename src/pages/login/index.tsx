import { View, Text, Button } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import {
  formatAuthError,
  isUserAuthenticated,
  oneClickWechatLogin,
  showAuthError,
} from '@/services/wechatAuth'
import { getCachedUser } from '@/services/communityService'
import { restoreSessionFromStorage } from '@/services/session'
import { safeRedirect } from '@/utils/navigation'
import './index.scss'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [redirectUrl, setRedirectUrl] = useState('/pages/mine/index')

  useLoad((options) => {
    restoreSessionFromStorage()
    const redirect = options?.redirect as string | undefined
    const target = redirect ? decodeURIComponent(redirect) : '/pages/mine/index'
    if (redirect) setRedirectUrl(target)

    if (isUserAuthenticated(getCachedUser())) {
      safeRedirect(target)
    }
  })

  const handleOneClickLogin = async () => {
    setLoading(true)
    try {
      const loginResult = await oneClickWechatLogin()
      const reward = loginResult.registerReward
      Taro.showToast({
        title: reward > 0 ? `登录成功，获得 ${reward} 小豆` : '登录成功',
        icon: 'success',
      })
      setTimeout(() => {
        safeRedirect(redirectUrl)
      }, reward > 0 ? 1200 : 400)
    } catch (error) {
      showAuthError(formatAuthError(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className='login-page'>
      <View className='login-page__content'>
        <View className='login-page__logo'>拼</View>
        <Text className='login-page__title'>happy拼豆嘛</Text>
        <Text className='login-page__desc'>登录后可在「我的」页填写微信昵称与头像</Text>
        <Button
          className='login-page__btn'
          disabled={loading}
          onClick={handleOneClickLogin}
        >
          {loading ? '登录中...' : '微信一键登录'}
        </Button>
      </View>
    </View>
  )
}
