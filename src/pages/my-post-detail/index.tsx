import { View } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useDefaultPageShare } from '@/utils/shareReward'
import { safeNavigateBack } from '@/utils/navigation'

export default function MyPostDetailRedirectPage() {
  useDefaultPageShare()
  useLoad((options) => {
    const id = options.id || ''
    if (!id) {
      safeNavigateBack('/pages/mine/index')
      return
    }
    const isPending = options.type === 'draft' || options.type === 'pending'
    Taro.redirectTo({
      url: isPending
        ? `/pages/my-pending-detail/index?id=${id}`
        : `/pages/my-published-detail/index?id=${id}`,
    })
  })

  return <View />
}
