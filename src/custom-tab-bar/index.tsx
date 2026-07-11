import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Component } from 'react'
import { getCachedUser } from '@/services/communityService'
import { isUserAuthenticated } from '@/services/wechatAuth'
import { restoreSessionFromStorage, refreshSessionIfLoggedIn } from '@/services/session'
import { buildLoginUrl } from '@/utils/authRoute'
import { safeNavigateTo } from '@/utils/navigation'
import { TAB_INDEX, TAB_URLS } from '@/utils/tabBar'
import tabHomeIcon from '@/assets/icons/tab-home.svg'
import tabHomeActiveIcon from '@/assets/icons/tab-home-active.svg'
import tabMineIcon from '@/assets/icons/tab-mine.svg'
import tabMineActiveIcon from '@/assets/icons/tab-mine-active.svg'
import './index.scss'

const TABS = [
  {
    key: 'home' as const,
    label: '首页',
    icon: tabHomeIcon,
    activeIcon: tabHomeActiveIcon,
  },
  { key: 'generate' as const, label: '生成' },
  {
    key: 'mine' as const,
    label: '我的',
    icon: tabMineIcon,
    activeIcon: tabMineActiveIcon,
  },
]

interface CustomTabBarState {
  selected: number
  interactionBlocked: boolean
}

export default class CustomTabBar extends Component<object, CustomTabBarState> {
  state: CustomTabBarState = {
    selected: TAB_INDEX.home,
    interactionBlocked: false,
  }

  setSelected(selected: number) {
    this.setState({ selected })
  }

  setInteractionBlocked(blocked: boolean) {
    this.setState({ interactionBlocked: blocked })
  }

  switchTab = async (index: number) => {
    if (this.state.interactionBlocked) {
      Taro.showToast({ title: '正在生成中，请稍候', icon: 'none' })
      return
    }
    if (index === this.state.selected) return

    const url = TAB_URLS[index]
    restoreSessionFromStorage()

    if (index === TAB_INDEX.generate || index === TAB_INDEX.mine) {
      await refreshSessionIfLoggedIn()
      if (!isUserAuthenticated(getCachedUser())) {
        safeNavigateTo(buildLoginUrl(url))
        return
      }
    }

    Taro.switchTab({ url })
    this.setSelected(index)
  }

  render() {
    const { selected, interactionBlocked } = this.state

    return (
      <View className={`custom-tab-bar${interactionBlocked ? ' custom-tab-bar--blocked' : ''}`}>
        <View className='custom-tab-bar__inner'>
          {TABS.map((tab, index) => {
            const isActive = selected === index

            if (tab.key === 'generate') {
              return (
                <View
                  key={tab.key}
                  className={`custom-tab-bar__col custom-tab-bar__col--center${isActive ? ' is-active' : ''}`}
                  onClick={() => void this.switchTab(index)}
                >
                  <View className='custom-tab-bar__icon-slot'>
                    <View className='custom-tab-bar__center-btn'>
                      <Text className='custom-tab-bar__center-icon'>+</Text>
                    </View>
                  </View>
                  <Text className={`custom-tab-bar__label${isActive ? ' is-active' : ''}`}>
                    {tab.label}
                  </Text>
                </View>
              )
            }

            return (
              <View
                key={tab.key}
                className={`custom-tab-bar__col${isActive ? ' is-active' : ''}`}
                onClick={() => void this.switchTab(index)}
              >
                <View className='custom-tab-bar__icon-slot'>
                  <Image
                    className='custom-tab-bar__icon'
                    src={isActive ? tab.activeIcon! : tab.icon!}
                    mode='aspectFit'
                  />
                </View>
                <Text className={`custom-tab-bar__label${isActive ? ' is-active' : ''}`}>
                  {tab.label}
                </Text>
              </View>
            )
          })}
        </View>
      </View>
    )
  }
}
