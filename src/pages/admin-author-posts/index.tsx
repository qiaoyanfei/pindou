import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useCallback, useState } from 'react'
import HdPatternPreviewHost, { requestHdPatternPreview } from '@/components/HdPatternPreviewHost'
import {
  checkIsAdmin,
  fetchReviewAuthorPosts,
  formatPostMeta,
} from '@/services/communityService'
import { requireAuthenticated } from '@/services/session'
import type { PostSummary } from '@/types/community'
import { formatDateTime } from '@/utils/formatDate'
import './index.scss'

type AuthorPostsTab = 'published' | 'pending'

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
  const router = useRouter()
  const authorOpenid = decodeParam(String(router.params.authorOpenid || ''))
  const authorName = decodeParam(String(router.params.authorName || ''))
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeTab, setActiveTab] = useState<AuthorPostsTab>('published')
  const [published, setPublished] = useState<PostSummary[]>([])
  const [pending, setPending] = useState<PostSummary[]>([])

  const loadAuthorPosts = useCallback(async () => {
    if (!authorOpenid) {
      setLoading(false)
      Taro.showToast({ title: '缺少作者信息', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const adminResult = await checkIsAdmin()
      setIsAdmin(adminResult.isAdmin)
      if (!adminResult.isAdmin) return
      const result = await fetchReviewAuthorPosts(authorOpenid)
      setPublished(result.published)
      setPending(result.pending)
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
    } finally {
      setLoading(false)
    }
  }, [authorOpenid])

  useDidShow(async () => {
    const user = await requireAuthenticated('/pages/admin-author-posts/index')
    if (!user) return
    await loadAuthorPosts()
  })

  const renderPost = (post: PostSummary, type: 'published' | 'pending') => (
    <View className='admin-author-posts-page__post' key={post._id}>
      {post.coverUrl ? (
        <Image
          className='admin-author-posts-page__cover'
          src={post.coverUrl}
          mode='aspectFit'
          showMenuByLongpress={false}
          onClick={() => {
            requestHdPatternPreview({
              postId: post._id,
              creatorNickname: post.author?.nickName,
            })
          }}
        />
      ) : (
        <View className='admin-author-posts-page__cover admin-author-posts-page__cover--empty' />
      )}
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

  const renderList = (posts: PostSummary[], type: 'published' | 'pending') => (
    <View className='admin-author-posts-page__group'>
      {posts.length === 0 ? (
        <View className='admin-author-posts-page__empty-block'>暂无作品</View>
      ) : posts.map((post) => renderPost(post, type))}
    </View>
  )

  if (loading) {
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
      <ScrollView scrollY className='admin-author-posts-page__scroll'>
        <View className='admin-author-posts-page__content'>
          <View className='admin-author-posts-page__header'>
            <Text className='admin-author-posts-page__author'>{authorName || '未知用户'}</Text>
            <Text className='admin-author-posts-page__openid'>{authorOpenid}</Text>
          </View>
          <View className='admin-author-posts-page__tabs'>
            <Text
              className={`admin-author-posts-page__tab${activeTab === 'published' ? ' admin-author-posts-page__tab--active' : ''}`}
              onClick={() => setActiveTab('published')}
            >
              已发布（{published.length}）
            </Text>
            <Text
              className={`admin-author-posts-page__tab${activeTab === 'pending' ? ' admin-author-posts-page__tab--active' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              审核（{pending.length}）
            </Text>
          </View>
          {activeTab === 'published'
            ? renderList(published, 'published')
            : renderList(pending, 'pending')}
        </View>
      </ScrollView>
      <HdPatternPreviewHost />
    </View>
  )
}
