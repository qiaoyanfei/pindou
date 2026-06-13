import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getCachedUser } from '@/services/communityService'
import { isUserAuthenticated } from '@/services/wechatAuth'
import { buildLoginUrl } from '@/utils/authRoute'
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
  const switchTab = (url: string, key: 'home' | 'generate' | 'mine') => {
    if (key === 'mine' && !isUserAuthenticated(getCachedUser())) {
      Taro.navigateTo({ url: buildLoginUrl(url) })
      return
    }
    Taro.reLaunch({ url })
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
                onClick={() => switchTab(tab.url, tab.key)}
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
