import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import PageListBanner from '@/components/PageListBanner'
import PostListItem from '@/components/PostListItem'
import { useCachedPostList } from '@/hooks/useCachedPostList'
import { fetchPendingPosts } from '@/services/communityService'
import { useDefaultPageShare } from '@/utils/shareReward'
import '@/styles/list-page.scss'
import './index.scss'

export default function DraftsPage() {
  useDefaultPageShare({ title: '待发布', path: '/pages/drafts/index' })

  const {
    list,
    loading,
    loadingMore,
    hasMore,
    total,
    loadMore,
  } = useCachedPostList('drafts', fetchPendingPosts)
  const displayedCount = total ?? list.length

  return (
    <View className='list-page drafts-page'>
      <ScrollView scrollY className='list-page__scroll' lowerThreshold={120} onScrollToLower={loadMore}>
        <View className='list-page__content'>
          {loading ? (
            <View className='list-page__loading'>加载中...</View>
          ) : list.length === 0 ? (
            <View className='list-page__empty'>
              <Text className='list-page__empty-icon'>📝</Text>
              <Text className='list-page__empty-text'>暂无待发布作品</Text>
              <Text className='list-page__empty-desc'>发布时关闭「公开作品」，或提交公开审核中的作品会保存在这里</Text>
            </View>
          ) : (
            <>
              <Text className='list-page__count'>
                共 {displayedCount} 张待发布图纸
              </Text>
              <PageListBanner
                variant='tip'
                icon='📝'
                title='待发布包含：未公开、审核中、审核未通过的作品'
              />
              {list.map((item, index) => (
                <PostListItem
                  key={item._id}
                  item={item}
                  mode='pending'
                  tintIndex={index}
                  onClick={() => Taro.navigateTo({ url: `/pages/my-pending-detail/index?id=${item._id}` })}
                />
              ))}
              <Text className='list-page__end'>
                {loadingMore ? '加载中...' : hasMore ? '上拉加载更多' : '· 没有更多啦 ·'}
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
