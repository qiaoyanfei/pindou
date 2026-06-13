import { View, Text, Button } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import {
  formatAuthError,
  isUserAuthenticated,
  oneClickWechatLogin,
  showAuthError,
  tryGetWechatProfile,
} from '@/services/wechatAuth'
import { getCachedUser } from '@/services/communityService'
import './index.scss'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [redirectUrl, setRedirectUrl] = useState('/pages/mine/index')

  useLoad((options) => {
    const redirect = options?.redirect as string | undefined
    const target = redirect ? decodeURIComponent(redirect) : '/pages/mine/index'
    if (redirect) setRedirectUrl(target)

    if (isUserAuthenticated(getCachedUser())) {
      Taro.reLaunch({ url: target })
    }
  })

  const handleOneClickLogin = async () => {
    let profile = null
    try {
      profile = await tryGetWechatProfile()
    } catch {
      // 获取微信资料失败不影响云登录
    }

    setLoading(true)
    try {
      await oneClickWechatLogin(profile || undefined)
      Taro.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => {
        Taro.reLaunch({ url: redirectUrl })
      }, 400)
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
        <Text className='login-page__title'>拼豆豆</Text>
        <Text className='login-page__desc'>登录后查看个人中心，使用点赞、收藏、发布等功能</Text>
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
