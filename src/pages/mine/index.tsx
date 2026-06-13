import { View, Text, Image, Button } from '@tarojs/components'
import Taro, { useDidShow, useShareAppMessage } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import AppTabBar from '@/components/AppTabBar'
import defaultAvatar from '@/assets/default-avatar.svg'
import mineBeanIcon from '@/assets/icons/mine-bean.svg'
import mineLikeIcon from '@/assets/icons/mine-like.svg'
import mineFavoriteIcon from '@/assets/icons/mine-favorite.svg'
import mineDraftIcon from '@/assets/icons/mine-draft.svg'
import minePublishedIcon from '@/assets/icons/mine-published.svg'
import mineFeedbackIcon from '@/assets/icons/mine-feedback.svg'
import chevronRightIcon from '@/assets/icons/chevron-right-grey.svg'
import { initCloud } from '@/services/cloudClient'
import {
  getCachedConfig,
  getCachedUser,
  refreshCounts,
  setCachedUser,
} from '@/services/communityService'
import { enrichUserProfile, isUserAuthenticated } from '@/services/wechatAuth'
import { goLogin } from '@/utils/authRoute'
import { DEFAULT_USER_BIO, DEFAULT_USER_NICKNAME } from '@/utils/userDisplay'
import './index.scss'

interface MenuItem {
  icon: string
  label: string
  url: string
  count?: number
}

export default function MinePage() {
  const [user, setUser] = useState(getCachedUser())
  const [pageTop, setPageTop] = useState(24)
  const config = getCachedConfig()

  useEffect(() => {
    const menu = Taro.getMenuButtonBoundingClientRect()
    setPageTop(menu.bottom + 12)
  }, [])

  const syncUser = async () => {
    const cached = getCachedUser()
    if (!cached?.openid) return
    const enriched = await enrichUserProfile(cached)
    setCachedUser(enriched)
    setUser(enriched)
  }

  useDidShow(async () => {
    const cached = getCachedUser()
    if (!isUserAuthenticated(cached)) {
      goLogin('/pages/mine/index')
      return
    }

    try {
      initCloud()
      await syncUser()
      await refreshCounts()
      await syncUser()
    } catch {
      // silent refresh is best-effort
    }
  })

  useShareAppMessage(() => ({
    title: '一起来拼豆豆，生成专属拼豆图纸',
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

  if (!user?.openid) {
    return null
  }

  return (
    <View className='mine-page' style={{ paddingTop: `${pageTop}px` }}>
      <View className='mine-page__header'>
        <View className='mine-page__profile-main'>
          <Image className='mine-page__avatar' src={defaultAvatar} mode='aspectFill' />
          <View className='mine-page__info'>
            <Text className='mine-page__nickname'>{DEFAULT_USER_NICKNAME}</Text>
            <Text className='mine-page__bio'>{user.bio || DEFAULT_USER_BIO}</Text>
            <View className='mine-page__beans' onClick={() => navigate('/pages/beans/index')}>
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
          <Text className='mine-page__invite-title'>邀请好友，一起拼豆豆</Text>
          <Text className='mine-page__invite-desc'>
            每成功邀请 1 位新用户注册{'\n'}你将获得 {config?.inviteReward ?? 5} 小豆奖励
          </Text>
          <Button className='mine-page__invite-btn' openType='share'>
            立即邀请
          </Button>
        </View>
        <View className='mine-page__invite-art'>
          <Text className='mine-page__invite-gift'>🎁</Text>
          <Text className='mine-page__invite-spark'>✨</Text>
        </View>
      </View>

      <AppTabBar active='mine' />
    </View>
  )
}
