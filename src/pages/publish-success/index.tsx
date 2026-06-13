import { View, Text, Button } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { getCachedConfig } from '@/services/communityService'
import './index.scss'

export default function PublishSuccessPage() {
  const router = useRouter()
  const reward = Number(router.params.reward || getCachedConfig()?.publishReward || 0)

  return (
    <View className='publish-success-page'>
      <View className='publish-success-page__icon'>✓</View>
      <Text className='publish-success-page__title'>发布成功</Text>
      {reward > 0 ? (
        <Text className='publish-success-page__reward'>+{reward} 小豆</Text>
      ) : null}
      <Text className='publish-success-page__desc'>
        你的作品已提交，可以在「我的作品」中查看和管理。
      </Text>

      <View className='publish-success-page__actions'>
        <Button
          className='publish-success-page__btn publish-success-page__btn--primary'
          onClick={() => Taro.redirectTo({ url: '/pages/my-posts/index' })}
        >
          查看我的作品
        </Button>
        <Button
          className='publish-success-page__btn publish-success-page__btn--ghost'
          onClick={() => Taro.reLaunch({ url: '/pages/generate/index' })}
        >
          继续发布
        </Button>
        <Button
          className='publish-success-page__btn publish-success-page__btn--ghost'
          onClick={() => Taro.reLaunch({ url: '/pages/home/index' })}
        >
          返回首页
        </Button>
      </View>
    </View>
  )
}
