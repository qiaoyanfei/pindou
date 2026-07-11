import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useCallback, useRef, useState } from 'react'
import HdPatternPreviewHost, { requestHdPatternPreview } from '@/components/HdPatternPreviewHost'
import {
  buildPostDetailForPreview,
  checkIsAdmin,
  fetchReviewAuthorPosts,
  formatPostMeta,
} from '@/services/communityService'
import { requireAuthenticated } from '@/services/session'
import type { PostSummary } from '@/types/community'
import { formatDateTime } from '@/utils/formatDate'
import { useDefaultPageShare } from '@/utils/shareReward'
import './index.scss'

type AuthorPostsTab = 'published' | 'pending'

interface TabState {
  list: PostSummary[]
  page: number
  hasMore: boolean
  total: number
  loaded: boolean
}

const EMPTY_TAB_STATE: TabState = {
  list: [],
  page: 1,
  hasMore: false,
  total: 0,
  loaded: false,
}

function decodeParam(value?: string): string {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function getPostTimeLabel(post: PostSummary, type: 'published' | 'pending'): string {
  const label = type === 'published' ? '发布时间' : '提交时间'
  const time = formatDateTime(type === 'published' ? post.publishedAt || post.createdAt : post.updatedAt || post.createdAt)
  return time ? `${label}：${time}` : `${label}：未知`
}

export default function AdminAuthorPostsPage() {
  useDefaultPageShare({ title: '用户作品', path: '/pages/home/index' })

  const router = useRouter()
  const authorOpenid = decodeParam(String(router.params.authorOpenid || ''))
  const authorName = decodeParam(String(router.params.authorName || ''))
  const adminCheckedRef = useRef(false)
  const isAdminRef = useRef(false)
  const inflightRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeTab, setActiveTab] = useState<AuthorPostsTab>('published')
  const [publishedState, setPublishedState] = useState<TabState>(EMPTY_TAB_STATE)
  const [pendingState, setPendingState] = useState<TabState>(EMPTY_TAB_STATE)
  const [publishedTotal, setPublishedTotal] = useState(0)
  const [pendingTotal, setPendingTotal] = useState(0)

  const currentState = activeTab === 'published' ? publishedState : pendingState

  const loadTab = useCallback(async (
    tab: AuthorPostsTab,
    nextPage = 1,
    options: { append?: boolean; silent?: boolean } = {},
  ) => {
    if (!authorOpenid || inflightRef.current) return
    inflightRef.current = true
    const append = options.append ?? false
    const silent = options.silent ?? false

    if (append) {
      setLoadingMore(true)
    } else if (!silent) {
      setLoading(true)
    }

    try {
      const result = await fetchReviewAuthorPosts(authorOpenid, { tab, page: nextPage })
      setPublishedTotal(result.publishedTotal)
      setPendingTotal(result.pendingTotal)

      const update = (prev: TabState): TabState => ({
        list: append ? [...prev.list, ...result.list] : result.list,
        page: nextPage,
        hasMore: result.hasMore,
        total: result.total,
        loaded: true,
      })

      if (tab === 'published') {
        setPublishedState(update)
      } else {
        setPendingState(update)
      }
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
    } finally {
      inflightRef.current = false
      setLoading(false)
      setLoadingMore(false)
    }
  }, [authorOpenid])

  const ensureAdminAndLoad = useCallback(async () => {
    if (!authorOpenid) {
      setLoading(false)
      Taro.showToast({ title: '缺少作者信息', icon: 'none' })
      return
    }

    if (!adminCheckedRef.current) {
      setLoading(true)
      try {
        const adminResult = await checkIsAdmin()
        adminCheckedRef.current = true
        isAdminRef.current = adminResult.isAdmin
        setIsAdmin(adminResult.isAdmin)
        if (!adminResult.isAdmin) return
      } catch (error) {
        Taro.showToast({
          title: error instanceof Error ? error.message : '加载失败',
          icon: 'none',
        })
        return
      } finally {
        setLoading(false)
      }
    }

    if (!isAdminRef.current) return
    await loadTab('published', 1, { silent: publishedState.loaded })
  }, [authorOpenid, loadTab, publishedState.loaded])

  useDidShow(async () => {
    const user = await requireAuthenticated('/pages/admin-author-posts/index')
    if (!user) return
    await ensureAdminAndLoad()
  })

  const handleTabChange = (tab: AuthorPostsTab) => {
    setActiveTab(tab)
    const state = tab === 'published' ? publishedState : pendingState
    if (!state.loaded) {
      void loadTab(tab, 1)
    }
  }

  const handleLoadMore = () => {
    if (loading || loadingMore || !currentState.hasMore) return
    void loadTab(activeTab, currentState.page + 1, { append: true, silent: true })
  }

  const handlePreviewHd = (post: PostSummary) => {
    const detail = buildPostDetailForPreview(post)
    if (!detail) {
      Taro.showToast({ title: '缺少图纸数据', icon: 'none' })
      return
    }
    requestHdPatternPreview({
      post: detail,
      creatorNickname: post.author?.nickName || authorName,
    })
  }

  const renderPost = (post: PostSummary, type: 'published' | 'pending') => (
    <View className='admin-author-posts-page__post' key={post._id}>
      <View
        className='admin-author-posts-page__cover-wrap'
        catchMove
        onClick={() => handlePreviewHd(post)}
      >
        {post.coverUrl ? (
          <Image
            className='admin-author-posts-page__cover'
            src={post.coverUrl}
            mode='aspectFit'
            showMenuByLongpress={false}
          />
        ) : (
          <View className='admin-author-posts-page__cover admin-author-posts-page__cover--empty' />
        )}
      </View>
      <View className='admin-author-posts-page__post-info'>
        <Text className='admin-author-posts-page__title'>{post.title || '未命名作品'}</Text>
        <Text className='admin-author-posts-page__meta'>{formatPostMeta(post)}</Text>
        <Text className='admin-author-posts-page__time'>{getPostTimeLabel(post, type)}</Text>
        <Text className='admin-author-posts-page__status'>
          {type === 'published' ? '已发布' : '待审核'}
        </Text>
      </View>
    </View>
  )

  if (loading && !currentState.loaded) {
    return <View className='admin-author-posts-page admin-author-posts-page__loading'>加载中...</View>
  }

  if (!isAdmin) {
    return (
      <View className='admin-author-posts-page admin-author-posts-page__empty'>
        <Text>暂无访问权限</Text>
      </View>
    )
  }

  return (
    <View className='admin-author-posts-page'>
      <ScrollView
        scrollY
        className='admin-author-posts-page__scroll'
        lowerThreshold={120}
        onScrollToLower={handleLoadMore}
      >
        <View className='admin-author-posts-page__content'>
          <View className='admin-author-posts-page__header'>
            <Text className='admin-author-posts-page__author'>{authorName || '未知用户'}</Text>
            <Text className='admin-author-posts-page__openid'>{authorOpenid}</Text>
          </View>
          <View className='admin-author-posts-page__tabs'>
            <Text
              className={`admin-author-posts-page__tab${activeTab === 'published' ? ' admin-author-posts-page__tab--active' : ''}`}
              onClick={() => handleTabChange('published')}
            >
              已发布（{publishedTotal}）
            </Text>
            <Text
              className={`admin-author-posts-page__tab${activeTab === 'pending' ? ' admin-author-posts-page__tab--active' : ''}`}
              onClick={() => handleTabChange('pending')}
            >
              审核（{pendingTotal}）
            </Text>
          </View>
          <View className='admin-author-posts-page__group'>
            {currentState.list.length === 0 ? (
              <View className='admin-author-posts-page__empty-block'>暂无作品</View>
            ) : (
              currentState.list.map((post) => renderPost(post, activeTab))
            )}
            {currentState.list.length > 0 ? (
              <Text className='admin-author-posts-page__end'>
                {loadingMore ? '加载中...' : currentState.hasMore ? '上拉加载更多' : '· 没有更多啦 ·'}
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>
      <HdPatternPreviewHost />
    </View>
  )
}
