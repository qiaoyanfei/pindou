import { View, Text, Button } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { getCachedConfig } from '@/services/communityService'
import { reLaunchGeneratePage, safeRedirect } from '@/utils/navigation'
import type { PostReviewStatus } from '@/types/community'
import { REVIEW_STATUS_LABELS } from '@/utils/postReview'
import './index.scss'

export default function PublishSuccessPage() {
  const router = useRouter()
  const visibility = router.params.visibility === 'private' ? 'private' : 'public'
  const reviewStatus = (router.params.reviewStatus || (visibility === 'public' ? 'pending' : 'draft')) as PostReviewStatus
  const isPublicIntent = visibility === 'public'
  const reward = Number(router.params.reward || getCachedConfig()?.publishReward || 0)

  const title = reviewStatus === 'rejected'
    ? '审核未通过'
    : isPublicIntent
      ? '已提交审核'
      : '已保存到待发布'

  const desc = reviewStatus === 'rejected'
    ? '作品内容未通过安全检测，请在「待发布」中查看详情并重新生成后再次提交。'
    : isPublicIntent
      ? '你的作品已进入审核队列，审核通过后将在首页公开展示。可在「待发布」中查看进度。'
      : '作品已保存，仅自己可见。可在「待发布」中查看，随时提交公开审核。'

  return (
    <View className='publish-success-page'>
      <View className='publish-success-page__icon'>{reviewStatus === 'rejected' ? '!' : '✓'}</View>
      <Text className='publish-success-page__title'>{title}</Text>
      {reviewStatus === 'pending' && reward > 0 ? (
        <Text className='publish-success-page__reward'>审核通过后将获得 {reward} 小豆</Text>
      ) : null}
      <Text className='publish-success-page__status'>当前状态：{REVIEW_STATUS_LABELS[reviewStatus]}</Text>
      <Text className='publish-success-page__desc'>{desc}</Text>

      <View className='publish-success-page__actions'>
        <Button
          className='publish-success-page__btn publish-success-page__btn--primary'
          onClick={() => safeRedirect('/pages/drafts/index')}
        >
          查看待发布
        </Button>
        <Button
          className='publish-success-page__btn publish-success-page__btn--ghost'
          onClick={() => reLaunchGeneratePage(true)}
        >
          继续创作
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
