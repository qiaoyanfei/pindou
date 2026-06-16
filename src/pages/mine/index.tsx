import { View, Text, Image, Button, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import UserAvatar from '@/components/UserAvatar'
import mineBeanIcon from '@/assets/icons/mine-bean.svg'
import mineLikeIcon from '@/assets/icons/mine-like.svg'
import mineFavoriteIcon from '@/assets/icons/mine-favorite.svg'
import mineDraftIcon from '@/assets/icons/mine-draft.svg'
import minePublishedIcon from '@/assets/icons/mine-published.svg'
import mineFeedbackIcon from '@/assets/icons/mine-feedback.svg'
import chevronRightIcon from '@/assets/icons/chevron-right-grey.svg'
import { initCloud, uploadCloudFile } from '@/services/cloudClient'
import {
  getCachedConfig,
  getCachedUser,
  refreshCounts,
} from '@/services/communityService'
import {
  formatAuthError,
  isUserAuthenticated,
  showAuthError,
  updateWechatProfile,
} from '@/services/wechatAuth'
import { goLogin } from '@/utils/authRoute'
import { refreshSessionIfLoggedIn, restoreSessionFromStorage } from '@/services/session'
import { DEFAULT_USER_BIO } from '@/utils/userDisplay'
import { MINI_PROGRAM_NAME } from '@/utils/constants'
import {
  normalizeNickName,
  resolveNickNameForDisplay,
} from '@/utils/userProfile'
import { useShareContent, claimShareReward } from '@/utils/shareReward'
import { TAB_INDEX, updateTabBarSelected } from '@/utils/tabBar'
import './index.scss'

interface MenuItem {
  icon: string
  label: string
  url: string
  count?: number
}

export default function MinePage() {
  const [user, setUser] = useState(() => {
    restoreSessionFromStorage()
    return getCachedUser()
  })
  const [nickNameInput, setNickNameInput] = useState(() =>
    resolveNickNameForDisplay(getCachedUser()),
  )
  const [pageTop, setPageTop] = useState(24)
  const [syncingProfile, setSyncingProfile] = useState(false)
  const config = getCachedConfig()

  useEffect(() => {
    const menu = Taro.getMenuButtonBoundingClientRect()
    setPageTop(menu.bottom + 12)
  }, [])

  const syncUser = () => {
    const cached = getCachedUser()
    setUser(cached)
    setNickNameInput(resolveNickNameForDisplay(cached))
  }

  useDidShow(async () => {
    updateTabBarSelected(TAB_INDEX.mine)
    restoreSessionFromStorage()
    syncUser()
    try {
      await refreshSessionIfLoggedIn()
    } catch {
      // best-effort refresh
    }

    if (!isUserAuthenticated(getCachedUser())) {
      goLogin('/pages/mine/index')
      return
    }

    try {
      initCloud()
      await refreshCounts()
      syncUser()
    } catch {
      // silent refresh is best-effort
    }
  })

  useShareContent(() => ({
    title: `一起来${MINI_PROGRAM_NAME}，生成专属拼豆图纸`,
    path: `/pages/home/index?inviterId=${user?.openid || ''}`,
  }))

  const menuItems: MenuItem[] = [
    { icon: mineLikeIcon, label: '我的点赞', url: '/pages/my-likes/index' },
    { icon: mineFavoriteIcon, label: '我的收藏', url: '/pages/my-favorites/index' },
    { icon: mineDraftIcon, label: '待发布', url: '/pages/drafts/index', count: user?.draftCount ?? 0 },
    { icon: minePublishedIcon, label: '已发布', url: '/pages/my-posts/index', count: user?.postCount ?? 0 },
    { icon: mineFeedbackIcon, label: '问题反馈', url: '/pages/feedback/index' },
  ]

  const navigate = (url: string) => {
    if (!isUserAuthenticated(getCachedUser())) {
      goLogin('/pages/mine/index')
      return
    }
    Taro.navigateTo({ url })
  }

  const handleChooseAvatar = async (event: { detail: { avatarUrl?: string } }) => {
    const path = event.detail.avatarUrl
    if (!path || syncingProfile) return

    setSyncingProfile(true)
    Taro.showLoading({ title: '同步头像...' })
    try {
      initCloud()
      const cloudUrl = await uploadCloudFile(
        `avatars/${Date.now()}_${Math.random().toString(36).slice(2)}.png`,
        path,
      )
      const updated = await updateWechatProfile({
        avatarUrl: cloudUrl,
        nickName: getCachedUser()?.nickName,
      })
      setUser(updated)
      Taro.showToast({ title: '头像已更新', icon: 'success' })
    } catch (error) {
      showAuthError(formatAuthError(error))
    } finally {
      Taro.hideLoading()
      setSyncingProfile(false)
    }
  }

  const handleNicknameBlur = async (event: { detail: { value: string } }) => {
    const next = normalizeNickName(event.detail.value)
    const current = resolveNickNameForDisplay(user)

    if (!next) {
      setNickNameInput(current)
      return
    }

    if (next.length < 2) {
      Taro.showToast({ title: '昵称至少 2 个字符', icon: 'none' })
      setNickNameInput(current)
      return
    }

    if (next === current || syncingProfile) return

    setSyncingProfile(true)
    Taro.showLoading({ title: '保存中...' })
    try {
      const updated = await updateWechatProfile({ nickName: next })
      setUser(updated)
      setNickNameInput(resolveNickNameForDisplay(updated))
    } catch (error) {
      setNickNameInput(current)
      showAuthError(formatAuthError(error))
    } finally {
      Taro.hideLoading()
      setSyncingProfile(false)
    }
  }

  if (!user?.openid) {
    return <View className='mine-page mine-page--placeholder' style={{ paddingTop: `${pageTop}px` }} />
  }

  return (
    <View className='mine-page' style={{ paddingTop: `${pageTop}px` }}>
      <View className='mine-page__header'>
        <View className='mine-page__profile-main'>
          <Button
            className='mine-page__avatar-btn'
            openType='chooseAvatar'
            onChooseAvatar={handleChooseAvatar}
          >
            <UserAvatar
              key={user.avatarUrl || 'empty'}
              avatarUrl={user.avatarUrl}
              size='md'
              className='mine-page__avatar'
            />
          </Button>
          <View className='mine-page__info'>
            <View className='mine-page__name-row'>
              <Input
                className='mine-page__nickname-input'
                type='nickname'
                placeholder='点击使用微信昵称'
                maxlength={20}
                value={nickNameInput}
                disabled={syncingProfile}
                onInput={(event) => setNickNameInput(event.detail.value)}
                onBlur={handleNicknameBlur}
              />
            </View>
            <Text className='mine-page__bio'>{user.bio || DEFAULT_USER_BIO}</Text>
            <View
              className='mine-page__beans'
              onClick={() => navigate('/pages/beans/index')}
            >
              <Image className='mine-page__beans-icon' src={mineBeanIcon} mode='aspectFit' />
              <Text className='mine-page__beans-text'>小豆: {user.beanBalance ?? 0}</Text>
              <Text className='mine-page__beans-arrow'>›</Text>
            </View>
          </View>
        </View>
      </View>

      <View className='mine-page__menu'>
        {menuItems.map((item, index) => (
          <View
            key={item.label}
            className={`mine-page__menu-item${index < menuItems.length - 1 ? ' mine-page__menu-item--border' : ''}`}
            onClick={() => navigate(item.url)}
          >
            <View className='mine-page__menu-left'>
              <Image className='mine-page__menu-icon' src={item.icon} mode='aspectFit' />
              <Text className='mine-page__menu-label'>{item.label}</Text>
            </View>
            <View className='mine-page__menu-right'>
              {typeof item.count === 'number' ? (
                <Text className='mine-page__menu-count'>{item.count}</Text>
              ) : null}
              <Image className='mine-page__menu-arrow' src={chevronRightIcon} mode='aspectFit' />
            </View>
          </View>
        ))}
      </View>

      <View className='mine-page__invite'>
        <View className='mine-page__invite-content'>
          <Text className='mine-page__invite-title'>邀请好友，一起{MINI_PROGRAM_NAME}</Text>
          <Text className='mine-page__invite-desc'>
            分享小程序可获得{config?.shareReward ?? 5}小豆
          </Text>
          <Button
            className='mine-page__invite-btn'
            openType='share'
            onClick={() => void claimShareReward(() => syncUser())}
          >
            立即邀请
          </Button>
        </View>
        <View className='mine-page__invite-art'>
          <Text className='mine-page__invite-gift'>🎁</Text>
          <Text className='mine-page__invite-spark'>✨</Text>
        </View>
      </View>

    </View>
  )
}
