import Taro, { useDidShow, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { getCachedUser, rewardShare } from '@/services/communityService'
import { initCloud } from '@/services/cloudClient'
import { isUserAuthenticated } from '@/services/wechatAuth'

export interface ShareContent {
  title: string
  path: string
  imageUrl?: string
}

function getTimelineQuery(path: string): string {
  const queryIndex = path.indexOf('?')
  if (queryIndex < 0) return ''
  return path.slice(queryIndex + 1)
}

export function useShareContent(getContent: () => ShareContent) {
  useDidShow(() => {
    Taro.showShareMenu({
      withShareTicket: true,
      showShareItems: ['shareAppMessage', 'shareTimeline'],
    })
  })
  useShareAppMessage(() => getContent())
  useShareTimeline(() => {
    const content = getContent()
    return {
      title: content.title,
      query: getTimelineQuery(content.path),
      imageUrl: content.imageUrl,
    }
  })
}

export async function claimShareReward(
  onRewarded?: (result: { amount: number; beanBalance: number }) => void,
): Promise<void> {
  if (!isUserAuthenticated(getCachedUser())) return
  try {
    initCloud()
    const result = await rewardShare()
    if (result.rewarded && result.amount > 0) {
      onRewarded?.({ amount: result.amount, beanBalance: result.beanBalance })
      Taro.showToast({ title: `获得${result.amount}小豆`, icon: 'success', duration: 2000 })
    }
  } catch (error) {
    Taro.showToast({
      title: error instanceof Error ? error.message : '奖励领取失败',
      icon: 'none',
      duration: 2500,
    })
  }
}
