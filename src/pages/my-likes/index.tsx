import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useState } from 'react'
import PageListBanner from '@/components/PageListBanner'
import PostListItem from '@/components/PostListItem'
import { buildPostDetailUrl, fetchMyLikes } from '@/services/communityService'
import { restoreSessionFromStorage } from '@/services/session'
import type { PostSummary } from '@/types/community'
import '@/styles/list-page.scss'
import './index.scss'

export default function MyLikesPage() {
  const [list, setList] = useState<PostSummary[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setList(await fetchMyLikes())
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

  const openPost = (item: PostSummary) => {
    restoreSessionFromStorage()
    Taro.navigateTo({
      url: buildPostDetailUrl(item._id, item.author?.openid, item.visibility),
    })
  }

  return (
    <View className='list-page my-likes-page'>
      <ScrollView scrollY className='list-page__scroll'>
        <View className='list-page__content'>
          {loading ? (
            <View className='list-page__loading'>加载中...</View>
          ) : list.length === 0 ? (
            <View className='list-page__empty'>
              <Text className='list-page__empty-icon'>❤</Text>
              <Text className='list-page__empty-text'>还没有点赞的图纸</Text>
              <Text className='list-page__empty-desc'>在图纸详情页点赞后会显示在这里</Text>
            </View>
          ) : (
            <>
              <Text className='list-page__count'>共 {list.length} 个点赞</Text>
              <PageListBanner variant='tip' icon='❤️' title='这里展示你点赞过的图纸' />
              {list.map((item, index) => (
                <PostListItem
                  key={item._id}
                  item={item}
                  mode='like'
                  tintIndex={index}
                  onClick={() => openPost(item)}
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
