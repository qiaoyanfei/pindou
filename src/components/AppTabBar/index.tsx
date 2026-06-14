import { View, Text, Image } from '@tarojs/components'
import { getCachedUser } from '@/services/communityService'
import { isUserAuthenticated } from '@/services/wechatAuth'
import { restoreSessionFromStorage, refreshSessionIfLoggedIn } from '@/services/session'
import { buildLoginUrl } from '@/utils/authRoute'
import { redirectToGeneratePage, safeNavigateTo, safeRedirect } from '@/utils/navigation'
import tabHomeIcon from '@/assets/icons/tab-home.svg'
import tabHomeActiveIcon from '@/assets/icons/tab-home-active.svg'
import tabMineIcon from '@/assets/icons/tab-mine.svg'
import tabMineActiveIcon from '@/assets/icons/tab-mine-active.svg'
import './index.scss'

interface AppTabBarProps {
  active: 'home' | 'generate' | 'mine'
}

const TABS = [
  {
    key: 'home' as const,
    label: '首页',
    url: '/pages/home/index',
    icon: tabHomeIcon,
    activeIcon: tabHomeActiveIcon,
  },
  { key: 'generate' as const, label: '生成', url: '/pages/generate/index' },
  {
    key: 'mine' as const,
    label: '我的',
    url: '/pages/mine/index',
    icon: tabMineIcon,
    activeIcon: tabMineActiveIcon,
  },
]

export default function AppTabBar({ active }: AppTabBarProps) {
  const switchTab = async (url: string, key: 'home' | 'generate' | 'mine') => {
    if (active === key) return

    restoreSessionFromStorage()
    if (key === 'mine' || key === 'generate') {
      await refreshSessionIfLoggedIn()
      if (!isUserAuthenticated(getCachedUser())) {
        safeNavigateTo(buildLoginUrl(url))
        return
      }
    }
    safeRedirect(url)
  }

  const openGenerate = async () => {
    if (active === 'generate') return

    restoreSessionFromStorage()
    await refreshSessionIfLoggedIn()
    if (!isUserAuthenticated(getCachedUser())) {
      safeNavigateTo(buildLoginUrl('/pages/generate/index'))
      return
    }
    redirectToGeneratePage(true)
  }

  return (
    <View className='app-tabbar'>
      <View className='app-tabbar__inner'>
        {TABS.map((tab) => {
          const isActive = active === tab.key

          if (tab.key === 'generate') {
            return (
              <View
                key={tab.key}
                className={`app-tabbar__col app-tabbar__col--center${isActive ? ' is-active' : ''}`}
                onClick={openGenerate}
              >
                <View className='app-tabbar__icon-slot'>
                  <View className='app-tabbar__center-btn'>
                    <Text className='app-tabbar__center-icon'>+</Text>
                  </View>
                </View>
                <Text className={`app-tabbar__label${isActive ? ' is-active' : ''}`}>
                  {tab.label}
                </Text>
              </View>
            )
          }

          return (
            <View
              key={tab.key}
              className={`app-tabbar__col${isActive ? ' is-active' : ''}`}
              onClick={() => switchTab(tab.url, tab.key)}
            >
              <View className='app-tabbar__icon-slot'>
                <Image
                  className='app-tabbar__icon'
                  src={isActive ? tab.activeIcon! : tab.icon!}
                  mode='aspectFit'
                />
              </View>
              <Text className={`app-tabbar__label${isActive ? ' is-active' : ''}`}>
                {tab.label}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}
