import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import PageListBanner from '@/components/PageListBanner'
import PostListItem from '@/components/PostListItem'
import { useCachedPostList } from '@/hooks/useCachedPostList'
import { fetchMyPosts } from '@/services/communityService'
import { cacheMyPostDetail } from '@/utils/myPostDetailCache'
import { useDefaultPageShare } from '@/utils/shareReward'
import type { PostSummary } from '@/types/community'
import '@/styles/list-page.scss'
import './index.scss'

export default function MyPostsPage() {
  useDefaultPageShare({ title: '已发布', path: '/pages/my-posts/index' })

  const { list, loading, loadingMore, hasMore, total, loadMore } = useCachedPostList('my-posts', fetchMyPosts)
  const displayedCount = total ?? list.length

  const openPost = (item: PostSummary) => {
    cacheMyPostDetail(item, 'published')
    Taro.navigateTo({ url: `/pages/my-published-detail/index?id=${item._id}` })
  }

  return (
    <View className='list-page my-posts-page'>
      <ScrollView scrollY className='list-page__scroll' lowerThreshold={120} onScrollToLower={loadMore}>
        <View className='list-page__content'>
          {loading ? (
            <View className='list-page__loading'>加载中...</View>
          ) : list.length === 0 ? (
            <View className='list-page__empty'>
              <Text className='list-page__empty-icon'>📋</Text>
              <Text className='list-page__empty-text'>还没有公开的作品</Text>
            </View>
          ) : (
            <>
              <PageListBanner
                variant='summary'
                icon='📦'
                title={`共 ${displayedCount} 个已公开作品`}
                desc='这些作品已公开发布，其他用户可以看到'
              />
              {list.map((item, index) => (
                <PostListItem
                  key={item._id}
                  item={item}
                  mode='published'
                  tintIndex={index}
                  onClick={() => openPost(item)}
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
