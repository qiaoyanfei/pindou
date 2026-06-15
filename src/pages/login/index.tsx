import { View, Text, Button, Image } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import {
  formatAuthError,
  isUserAuthenticated,
  oneClickWechatLogin,
  showAuthError,
} from '@/services/wechatAuth'
import { getCachedUser } from '@/services/communityService'
import { restoreSessionFromStorage } from '@/services/session'
import { safeNavigateBack, safeRedirect } from '@/utils/navigation'
import WechatLoginIcon from '@/components/WechatLoginIcon'
import loginLogo from '@/assets/login-logo.jpg'
import backIcon from '@/assets/icons/back-chevron.svg'
import './index.scss'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [redirectUrl, setRedirectUrl] = useState('/pages/mine/index')
  const [navLayout, setNavLayout] = useState({ paddingTop: 48, rowHeight: 32, headerRight: 96 })

  useLoad((options) => {
    restoreSessionFromStorage()
    const redirect = options?.redirect as string | undefined
    const target = redirect ? decodeURIComponent(redirect) : '/pages/mine/index'
    if (redirect) setRedirectUrl(target)

    if (isUserAuthenticated(getCachedUser())) {
      safeRedirect(target)
    }
  })

  useEffect(() => {
    const windowInfo = Taro.getWindowInfo()
    const menu = Taro.getMenuButtonBoundingClientRect()
    setNavLayout({
      paddingTop: menu.top,
      rowHeight: menu.height,
      headerRight: windowInfo.windowWidth - menu.left + 8,
    })
  }, [])

  const handleBack = () => {
    safeNavigateBack('/pages/home/index')
  }

  const handleOneClickLogin = async () => {
    if (!agreed) {
      Taro.showToast({ title: '请先阅读并同意相关协议', icon: 'none' })
      return
    }

    setLoading(true)
    try {
      const loginResult = await oneClickWechatLogin()
      const reward = loginResult.registerReward
      const toastDuration = reward > 0 ? 2000 : 1500
      Taro.showToast({
        title: reward > 0 ? `获得${reward}小豆` : '登录成功',
        icon: 'success',
        duration: toastDuration,
      })
      setTimeout(() => {
        safeRedirect(redirectUrl)
      }, reward > 0 ? toastDuration : 400)
    } catch (error) {
      showAuthError(formatAuthError(error))
    } finally {
      setLoading(false)
    }
  }

  const openAgreement = (type: 'user' | 'privacy', event?: { stopPropagation?: () => void }) => {
    event?.stopPropagation?.()
    Taro.navigateTo({
      url: type === 'user' ? '/pages/user-agreement/index' : '/pages/privacy-policy/index',
    })
  }

  return (
    <View className='login-page'>
      <View
        className='login-page__nav'
        style={{
          paddingTop: `${navLayout.paddingTop}px`,
          paddingRight: `${navLayout.headerRight}px`,
        }}
      >
        <View
          className='login-page__nav-back'
          style={{ height: `${navLayout.rowHeight}px` }}
          onClick={handleBack}
        >
          <Image className='login-page__nav-back-icon' src={backIcon} mode='aspectFit' />
        </View>
      </View>

      <View className='login-page__body'>
        <View className='login-page__brand'>
          <Image className='login-page__logo' src={loginLogo} mode='aspectFill' showMenuByLongpress={false} />
          <Text className='login-page__title'>happy拼豆嘛</Text>
          <View className='login-page__slogan'>
            <View className='login-page__slogan-line' />
            <Text className='login-page__slogan-text'>拼出美好，分享快乐。</Text>
            <View className='login-page__slogan-line' />
          </View>
        </View>

        <View className='login-page__actions'>
          <Button
            className='login-page__btn'
            disabled={loading}
            onClick={handleOneClickLogin}
          >
            <View className='login-page__btn-inner'>
              <WechatLoginIcon />
              <Text className='login-page__btn-text'>{loading ? '登录中...' : '微信一键登录'}</Text>
            </View>
          </Button>

          <View className='login-page__agreement'>
            <View
              className={`login-page__checkbox${agreed ? ' is-checked' : ''}`}
              onClick={() => setAgreed((prev) => !prev)}
            >
              {agreed ? <Text className='login-page__checkbox-mark'>✓</Text> : null}
            </View>
            <View className='login-page__agreement-text'>
              <Text className='login-page__agreement-muted'>已阅读并同意</Text>
              <Text className='login-page__agreement-link' onClick={(e) => openAgreement('user', e)}>
                《用户协议》
              </Text>
              <Text className='login-page__agreement-muted'>和</Text>
              <Text className='login-page__agreement-link' onClick={(e) => openAgreement('privacy', e)}>
                《隐私政策》
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
