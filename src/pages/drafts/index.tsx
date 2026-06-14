import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useState } from 'react'
import PageListBanner from '@/components/PageListBanner'
import PostListItem from '@/components/PostListItem'
import {
  fetchPendingPosts,
  prepareRegenerateFromPost,
  updatePostVisibility,
} from '@/services/communityService'
import { showModal } from '@/utils/dialog'
import { resolveErrorMessage } from '@/utils/errorMessage'
import type { PostSummary } from '@/types/community'
import '@/styles/list-page.scss'
import './index.scss'

export default function DraftsPage() {
  const [list, setList] = useState<PostSummary[]>([])
  const [loading, setLoading] = useState(true)

  const loadPending = useCallback(async () => {
    setLoading(true)
    try {
      setList(await fetchPendingPosts())
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
    loadPending()
  })

  const handleGoPublic = async (postId: string) => {
    const res = await showModal({
      title: '提交公开审核',
      content: '提交后将进入人工审核，通过前作品保存在待发布列表，审核通过后将公开展示并获得小豆奖励',
      confirmText: '提交审核',
    })
    if (!res?.confirm) return
    try {
      await updatePostVisibility(postId, 'public')
      Taro.showToast({ title: '已提交审核', icon: 'success' })
      loadPending()
    } catch (error) {
      Taro.showToast({
        title: resolveErrorMessage(error, '操作失败'),
        icon: 'none',
        duration: 3000,
      })
    }
  }

  const handleRegenerate = async (postId: string) => {
    Taro.showLoading({ title: '加载图纸...' })
    try {
      await prepareRegenerateFromPost(postId)
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
    }
  }

  return (
    <View className='list-page drafts-page'>
      <ScrollView scrollY className='list-page__scroll'>
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
              <Text className='list-page__count'>共 {list.length} 张待发布图纸</Text>
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
                  onClick={() => Taro.navigateTo({ url: `/pages/my-post-detail/index?type=pending&id=${item._id}` })}
                  onPublish={() => handleGoPublic(item._id)}
                  onRegenerate={() => handleRegenerate(item._id)}
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
