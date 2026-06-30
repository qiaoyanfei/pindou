import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import PageListBanner from '@/components/PageListBanner'
import PostListItem from '@/components/PostListItem'
import { useCachedPostList } from '@/hooks/useCachedPostList'
import { fetchMyPosts } from '@/services/communityService'
import '@/styles/list-page.scss'
import './index.scss'

export default function MyPostsPage() {
  const { list, loading, loadingMore, hasMore, loadMore } = useCachedPostList('my-posts', fetchMyPosts)

  const openPost = (postId: string) => {
    Taro.navigateTo({ url: `/pages/my-post-detail/index?type=published&id=${postId}` })
  }

  return (
    <View className='list-page my-posts-page'>
      <ScrollView scrollY className='list-page__scroll' onScrollToLower={loadMore}>
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
                title={`${hasMore ? '已加载' : '共'} ${list.length} 个已公开作品`}
                desc='这些作品已公开发布，其他用户可以看到'
              />
              {list.map((item, index) => (
                <PostListItem
                  key={item._id}
                  item={item}
                  mode='published'
                  tintIndex={index}
                  onClick={() => openPost(item._id)}
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
