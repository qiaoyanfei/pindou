import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useState } from 'react'
import PostListItem from '@/components/PostListItem'
import { fetchMyFavorites } from '@/services/communityService'
import type { PostSummary } from '@/types/community'
import '@/styles/list-page.scss'
import './index.scss'

export default function MyFavoritesPage() {
  const [list, setList] = useState<PostSummary[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setList(await fetchMyFavorites())
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useDidShow(() => {
    load()
  })

  const openPost = (postId: string) => {
    Taro.navigateTo({ url: `/pages/post-detail/index?id=${postId}` })
  }

  return (
    <View className='list-page my-favorites-page'>
      <ScrollView scrollY className='list-page__scroll'>
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
              <Text className='list-page__count'>共 {list.length} 个收藏</Text>
              {list.map((item, index) => (
                <PostListItem
                  key={item._id}
                  item={item}
                  mode='favorite'
                  tintIndex={index}
                  onClick={() => openPost(item._id)}
                />
              ))}
              <Text className='list-page__end'>· 没有更多啦 ·</Text>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
