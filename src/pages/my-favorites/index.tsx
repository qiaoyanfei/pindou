import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import PostListItem from '@/components/PostListItem'
import { useCachedPostList } from '@/hooks/useCachedPostList'
import { fetchMyFavorites } from '@/services/communityService'
import '@/styles/list-page.scss'
import './index.scss'

export default function MyFavoritesPage() {
  const { list, loading, loadingMore, hasMore, total, loadMore } = useCachedPostList('my-favorites', fetchMyFavorites)
  const displayedCount = total ?? list.length

  const openPost = (postId: string) => {
    Taro.navigateTo({ url: `/pages/post-detail/index?id=${postId}` })
  }

  return (
    <View className='list-page my-favorites-page'>
      <ScrollView scrollY className='list-page__scroll' lowerThreshold={120} onScrollToLower={loadMore}>
        <View className='list-page__content'>
          {loading ? (
            <View className='list-page__loading'>加载中...</View>
          ) : list.length === 0 ? (
            <View className='list-page__empty'>
              <Text className='list-page__empty-icon'>★</Text>
              <Text className='list-page__empty-text'>还没有收藏的图纸</Text>
            </View>
          ) : (
            <>
              <Text className='list-page__count'>
                共 {displayedCount} 个收藏
              </Text>
              {list.map((item, index) => (
                <PostListItem
                  key={item._id}
                  item={item}
                  mode='favorite'
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
