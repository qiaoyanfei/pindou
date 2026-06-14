import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useState } from 'react'
import mineBeanIcon from '@/assets/icons/mine-bean.svg'
import beansPouchIcon from '@/assets/beans-pouch-art.png'
import chevronRightIcon from '@/assets/icons/chevron-right-grey.svg'
import { fetchBeanLogs, getCachedUser } from '@/services/communityService'
import { isUserAuthenticated } from '@/services/wechatAuth'
import { refreshSessionIfLoggedIn } from '@/services/session'
import { goLogin } from '@/utils/authRoute'
import { formatDateTime } from '@/utils/formatDate'
import { getBeanLogIconStyle } from '@/utils/beanLogIcon'
import type { BeanTransaction } from '@/types/community'
import './index.scss'

type BeanFilter = 'all' | 'income' | 'expense'

const TABS: { key: BeanFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'income', label: '收入' },
  { key: 'expense', label: '支出' },
]

export default function BeansPage() {
  const [balance, setBalance] = useState(0)
  const [filter, setFilter] = useState<BeanFilter>('all')
  const [logs, setLogs] = useState<BeanTransaction[]>([])
  const [loading, setLoading] = useState(true)

  const loadLogs = useCallback(async (nextFilter: BeanFilter) => {
    setLoading(true)
    try {
      setLogs(await fetchBeanLogs(nextFilter))
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useDidShow(async () => {
    const user = await refreshSessionIfLoggedIn()
    if (!isUserAuthenticated(user)) {
      goLogin('/pages/beans/index')
      return
    }
    setBalance(user?.beanBalance ?? 0)
    loadLogs(filter)
  })

  const handleTabChange = (nextFilter: BeanFilter) => {
    setFilter(nextFilter)
    loadLogs(nextFilter)
  }

  const goEarn = () => {
    Taro.navigateTo({ url: '/pages/drafts/index' })
  }

  const goSpend = () => {
    Taro.reLaunch({ url: '/pages/home/index' })
  }

  return (
    <View className='beans-page'>
      <ScrollView scrollY className='beans-page__scroll'>
        <View className='beans-page__content'>
          <View className='beans-page__balance-card'>
            <View className='beans-page__balance-top'>
              <View className='beans-page__balance-info'>
                <View className='beans-page__balance-label-row'>
                  <Image className='beans-page__bean-icon' src={mineBeanIcon} mode='aspectFit' />
                  <Text className='beans-page__balance-label'>当前小豆</Text>
                </View>
                <Text className='beans-page__balance-value'>{balance}</Text>
                <Text className='beans-page__balance-desc'>小豆可用于下载社区图纸</Text>
              </View>
              <Image className='beans-page__balance-art' src={beansPouchIcon} mode='aspectFit' />
            </View>

            <View className='beans-page__actions'>
              <View className='beans-page__action' onClick={goEarn}>
                <View className='beans-page__action-icon beans-page__action-icon--earn'>
                  <Text>+</Text>
                </View>
                <View className='beans-page__action-text'>
                  <Text className='beans-page__action-title'>攒小豆</Text>
                  <Text className='beans-page__action-desc'>发布图纸得奖励</Text>
                </View>
                <Image className='beans-page__action-arrow' src={chevronRightIcon} mode='aspectFit' />
              </View>
              <View className='beans-page__action-divider' />
              <View className='beans-page__action' onClick={goSpend}>
                <View className='beans-page__action-icon beans-page__action-icon--spend'>
                  <Text>−</Text>
                </View>
                <View className='beans-page__action-text'>
                  <Text className='beans-page__action-title'>花小豆</Text>
                  <Text className='beans-page__action-desc'>下载图纸消耗</Text>
                </View>
                <Image className='beans-page__action-arrow' src={chevronRightIcon} mode='aspectFit' />
              </View>
            </View>
          </View>

          <Text className='beans-page__section-title'>小豆明细</Text>

          <View className='beans-page__tabs'>
            {TABS.map((tab) => (
              <View
                key={tab.key}
                className={`beans-page__tab${filter === tab.key ? ' is-active' : ''}`}
                onClick={() => handleTabChange(tab.key)}
              >
                {tab.label}
              </View>
            ))}
          </View>

          {loading ? (
            <View className='beans-page__empty'>
              <Text className='beans-page__empty-text'>加载中...</Text>
            </View>
          ) : logs.length === 0 ? (
            <View className='beans-page__empty'>
              <Text className='beans-page__empty-text'>暂无明细</Text>
            </View>
          ) : (
            <>
              {logs.map((item) => {
                const iconStyle = getBeanLogIconStyle(item.title, item.type)
                return (
                  <View key={item._id} className='beans-page__log'>
                    <View
                      className='beans-page__log-icon'
                      style={{ background: iconStyle.background }}
                    >
                      <Text>{iconStyle.glyph}</Text>
                    </View>
                    <View className='beans-page__log-main'>
                      <Text className='beans-page__log-title'>{item.title}</Text>
                      {item.subtitle ? (
                        <Text className='beans-page__log-subtitle'>{item.subtitle}</Text>
                      ) : null}
                      <Text className='beans-page__log-time'>{formatDateTime(item.createdAt)}</Text>
                    </View>
                    <Text
                      className={`beans-page__log-amount${item.type === 'income' ? ' is-income' : ' is-expense'}`}
                    >
                      {item.type === 'income' ? '+ ' : '- '}
                      {item.amount}
                    </Text>
                  </View>
                )
              })}
              <Text className='beans-page__end'>· 没有更多了 ·</Text>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
