import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useMemo, useState } from 'react'
import PageListBanner from '@/components/PageListBanner'
import PostListItem from '@/components/PostListItem'
import { CATEGORY_OPTIONS, fetchMyPosts } from '@/services/communityService'
import type { PostCategory, PostSummary } from '@/types/community'
import '@/styles/list-page.scss'
import './index.scss'

export default function MyPostsPage() {
  const [list, setList] = useState<PostSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<'全部' | PostCategory>('全部')
  const [sortLabel] = useState('最新发布')

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

  const filteredList = useMemo(() => {
    if (categoryFilter === '全部') return list
    return list.filter((item) => item.category === categoryFilter)
  }, [categoryFilter, list])

  const openPost = (postId: string) => {
    Taro.navigateTo({ url: `/pages/post-detail/index?id=${postId}` })
  }

  const pickCategory = () => {
    Taro.showActionSheet({
      itemList: ['全部', ...CATEGORY_OPTIONS],
      success: (res) => {
        const next = res.tapIndex === 0 ? '全部' : CATEGORY_OPTIONS[res.tapIndex - 1]
        setCategoryFilter(next)
      },
    })
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
              <Text className='list-page__empty-text'>还没有发布的图纸</Text>
            </View>
          ) : (
            <>
              <PageListBanner
                variant='summary'
                icon='📦'
                title={`共 ${list.length} 个已发布图纸`}
                desc='这些图纸已发布到社区，其他用户可以看到'
                showChevron
              />
              <View className='list-page__filters'>
                <View
                  className='list-page__filter list-page__filter--active'
                  onClick={pickCategory}
                >
                  <Text>{categoryFilter}</Text>
                  <Text className='list-page__filter-arrow'>⌄</Text>
                </View>
                <View className='list-page__filter'>
                  <Text>{sortLabel}</Text>
                  <Text className='list-page__filter-arrow'>⌄</Text>
                </View>
              </View>
              {filteredList.length === 0 ? (
                <View className='list-page__empty'>
                  <Text className='list-page__empty-text'>该分类下暂无图纸</Text>
                </View>
              ) : (
                filteredList.map((item, index) => (
                  <PostListItem
                    key={item._id}
                    item={item}
                    mode='published'
                    tintIndex={index}
                    onClick={() => openPost(item._id)}
                  />
                ))
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
