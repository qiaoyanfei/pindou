import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useState } from 'react'
import PageListBanner from '@/components/PageListBanner'
import PostListItem from '@/components/PostListItem'
import { fetchMyPosts } from '@/services/communityService'
import type { PostSummary } from '@/types/community'
import '@/styles/list-page.scss'
import './index.scss'

export default function MyPostsPage() {
  const [list, setList] = useState<PostSummary[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setList(await fetchMyPosts())
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
    Taro.navigateTo({ url: `/pages/my-post-detail/index?type=published&id=${postId}` })
  }

  return (
    <View className='list-page my-posts-page'>
      <ScrollView scrollY className='list-page__scroll'>
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
                title={`共 ${list.length} 个已公开作品`}
                desc='这些作品已公开到社区，其他用户可以看到'
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
            </>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
