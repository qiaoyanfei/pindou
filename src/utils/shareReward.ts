import Taro, { useShareAppMessage } from '@tarojs/taro'
import { getCachedUser, rewardShare } from '@/services/communityService'
import { initCloud } from '@/services/cloudClient'
import { isUserAuthenticated } from '@/services/wechatAuth'

export interface ShareContent {
  title: string
  path: string
  imageUrl?: string
}

export function useShareContent(getContent: () => ShareContent) {
  useShareAppMessage(() => getContent())
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
