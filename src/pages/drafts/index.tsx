import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import PageListBanner from '@/components/PageListBanner'
import PostListItem from '@/components/PostListItem'
import { fetchDrafts } from '@/services/communityService'
import { downloadJsonFile } from '@/services/cloudClient'
import { PUBLISH_STORAGE_KEY, type PatternResult } from '@/types'
import type { DraftItem, PostSummary } from '@/types/community'
import '@/styles/list-page.scss'
import './index.scss'

function draftToListItem(draft: DraftItem): PostSummary {
  return {
    _id: draft._id,
    title: draft.title,
    category: '宠物',
    coverUrl: draft.coverUrl,
    width: draft.width,
    height: draft.height,
    styleMode: draft.styleMode,
    paletteId: draft.paletteId,
    likeCount: 0,
    favoriteCount: 0,
    downloadCount: 0,
    author: { nickName: '', avatarUrl: '' },
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  }
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadDrafts = async () => {
    setLoading(true)
    try {
      setDrafts(await fetchDrafts())
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadDrafts()
  })

  const handlePublish = async (draft: DraftItem) => {
    Taro.showLoading({ title: '加载中...' })
    try {
      const pattern = await downloadJsonFile<PatternResult>(draft.patternFileId)
      Taro.setStorageSync(PUBLISH_STORAGE_KEY, {
        pattern,
        config: draft.config,
        draftId: draft._id,
        title: draft.title,
      })
      Taro.hideLoading()
      Taro.navigateTo({ url: '/pages/publish/index' })
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载草稿失败',
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
          ) : drafts.length === 0 ? (
            <View className='list-page__empty'>
              <Text className='list-page__empty-icon'>📝</Text>
              <Text className='list-page__empty-text'>暂无待发布草稿</Text>
              <Text className='list-page__empty-desc'>在预览页保存草稿后会显示在这里</Text>
            </View>
          ) : (
            <>
              <Text className='list-page__count'>共 {drafts.length} 张待发布图纸</Text>
              <PageListBanner variant='tip' icon='📝' title='在预览页保存草稿后会显示在这里' />
              {drafts.map((draft, index) => (
                <PostListItem
                  key={draft._id}
                  item={draftToListItem(draft)}
                  mode='draft'
                  tintIndex={index}
                  onPublish={() => handlePublish(draft)}
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
