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

const USER_AGREEMENT = `欢迎使用 happy拼豆嘛。

1. 您应合法、正当地使用本小程序提供的图纸生成、发布与作品浏览等功能。
2. 您上传、发布的内容需符合法律法规及平台规范，不得侵犯他人合法权益。
3. 平台有权对违规内容进行审核、下架或限制相关功能。`

const PRIVACY_POLICY = `我们重视您的隐私保护。

1. 为提供登录、发布、下载等服务，我们会收集必要的微信身份标识及您主动填写的昵称、头像等信息。
2. 您的图纸、发布记录等数据仅用于向您提供和优化服务，未经您同意不会向第三方出售。
3. 您可在「我的」页面管理个人信息，如需注销或反馈请联系平台客服。`

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

  const openAgreement = (type: 'user' | 'privacy') => {
    Taro.showModal({
      title: type === 'user' ? '用户协议' : '隐私政策',
      content: type === 'user' ? USER_AGREEMENT : PRIVACY_POLICY,
      showCancel: false,
      confirmText: '我知道了',
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
              <Text className='login-page__agreement-link' onClick={() => openAgreement('user')}>
                《用户协议》
              </Text>
              <Text className='login-page__agreement-muted'>和</Text>
              <Text className='login-page__agreement-link' onClick={() => openAgreement('privacy')}>
                《隐私政策》
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
