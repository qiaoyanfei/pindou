import { View, Text, Image, ScrollView, Button } from '@tarojs/components'
import Taro, { useDidShow, useRouter, useShareAppMessage } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  downloadPost,
  fetchPostDetail,
  formatCount,
  formatPostMeta,
  getCachedConfig,
  loadPatternFromPost,
  toggleFavorite,
  toggleLike,
} from '@/services/communityService'
import { getColorById } from '@/services/palette'
import { DEFAULT_CONFIG, MINI_PROGRAM_NAME, STYLE_MODE_LABELS, normalizeConfig } from '@/utils/constants'
import { PATTERN_STORAGE_KEY, type PatternConfig, type PatternResult } from '@/types'
import type { PostDetail } from '@/types/community'
import './index.scss'

const COLOR_PREVIEW_LIMIT = 6
const PREVIEW_TOOLBAR_HEIGHT = 72

function getPreviewFrameSize() {
  const sys = Taro.getWindowInfo()
  const totalHeight = Math.floor(sys.windowHeight * 0.38)
  return {
    totalHeight,
    viewportHeight: totalHeight - PREVIEW_TOOLBAR_HEIGHT,
  }
}

export default function PostDetailPage() {
  const router = useRouter()
  const postId = router.params.id || ''
  const [post, setPost] = useState<PostDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [showAllColors, setShowAllColors] = useState(false)
  const [previewFrame, setPreviewFrame] = useState(getPreviewFrameSize)
  const downloadCost = getCachedConfig()?.downloadCost ?? 0

  useEffect(() => {
    setPreviewFrame(getPreviewFrameSize())
  }, [])

  const loadPost = useCallback(async () => {
    if (!postId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const detail = await fetchPostDetail(postId)
      setPost(detail)
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
    } finally {
      setLoading(false)
    }
  }, [postId])

  useDidShow(() => {
    Taro.showShareMenu({ withShareTicket: true, showShareItems: ['shareAppMessage'] })
    loadPost()
  })

  useShareAppMessage(() => ({
    title: post?.title || `${MINI_PROGRAM_NAME}图纸`,
    path: `/pages/post-detail/index?id=${postId}`,
    imageUrl: post?.coverUrl,
  }))

  const colorEntries = useMemo(() => {
    if (!post?.stats) return []
    return Object.entries(post.stats).sort((a, b) => b[1] - a[1])
  }, [post?.stats])

  const visibleColors = showAllColors ? colorEntries : colorEntries.slice(0, COLOR_PREVIEW_LIMIT)

  const handlePreviewCover = () => {
    if (!post?.coverUrl) return
    Taro.previewImage({ urls: [post.coverUrl], current: post.coverUrl })
  }

  const handleToggleLike = async () => {
    if (!post) return
    try {
      const result = await toggleLike(post._id)
      setPost({ ...post, liked: result.liked, likeCount: result.likeCount })
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      })
    }
  }

  const handleToggleFavorite = async () => {
    if (!post) return
    try {
      const result = await toggleFavorite(post._id)
      setPost({ ...post, favorited: result.favorited, favoriteCount: result.favoriteCount })
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      })
    }
  }

  const handleDownload = async () => {
    if (!post || downloading) return

    const confirm = await new Promise<boolean>((resolve) => {
      Taro.showModal({
        title: '下载图纸',
        content: downloadCost > 0 ? `下载将消耗 ${downloadCost} 小豆，确认下载？` : '确认下载该图纸？',
        success: (res) => resolve(!!res.confirm),
      })
    })
    if (!confirm) return

    setDownloading(true)
    Taro.showLoading({ title: '下载中...' })
    try {
      const result = await downloadPost(post._id)
      const pattern = await loadPatternFromPost(result.post)
      const config: PatternConfig = normalizeConfig({
        ...DEFAULT_CONFIG,
        styleMode: result.post.styleMode,
        paletteId: result.post.paletteId,
      })
      Taro.setStorageSync(PATTERN_STORAGE_KEY, { pattern, config } satisfies {
        pattern: PatternResult
        config: PatternConfig
      })
      Taro.hideLoading()
      Taro.showToast({ title: result.charged ? `已消耗 ${result.beanCost} 小豆` : '下载成功', icon: 'success' })
      setTimeout(() => {
        Taro.navigateTo({ url: '/pages/preview/index' })
      }, 600)
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({
        title: error instanceof Error ? error.message : '下载失败',
        icon: 'none',
      })
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return <View className='post-detail-page post-detail-page--empty'>加载中...</View>
  }

  if (!post) {
    return <View className='post-detail-page post-detail-page--empty'>图纸不存在</View>
  }

  return (
    <View className='post-detail-page'>
      <ScrollView scrollY className='post-detail-page__scroll'>
        <View className='post-detail-page__body'>
          <View className='post-detail-page__preview'>
            <View className='post-detail-page__preview-toolbar'>
              <Text className='post-detail-page__preview-hint'>点击查看高清大图</Text>
              <Text className='post-detail-page__preview-action' onClick={handlePreviewCover}>
                全屏预览
              </Text>
            </View>
            <View
              className='post-detail-page__preview-viewport'
              style={{ height: `${previewFrame.viewportHeight}px` }}
              onClick={handlePreviewCover}
            >
              {post.coverUrl ? (
                <Image className='post-detail-page__preview-image' src={post.coverUrl} mode='aspectFit' />
              ) : (
                <View className='post-detail-page__preview-image post-detail-page__preview-image--empty' />
              )}
            </View>
          </View>

          <Text className='post-detail-page__title'>{post.title}</Text>

          <View className='post-detail-page__tags'>
            <Text className='post-detail-page__tag'>{post.width}×{post.height}</Text>
            <Text className='post-detail-page__tag'>{post.paletteId.toUpperCase()}</Text>
            <Text className='post-detail-page__tag'>{STYLE_MODE_LABELS[post.styleMode]}</Text>
            {post.category ? <Text className='post-detail-page__tag'>{post.category}</Text> : null}
          </View>

          <View className='post-detail-page__author-row'>
            <View className='post-detail-page__author'>
              {post.author.avatarUrl ? (
                <Image className='post-detail-page__avatar' src={post.author.avatarUrl} />
              ) : (
                <View className='post-detail-page__avatar post-detail-page__avatar--placeholder' />
              )}
              <Text className='post-detail-page__author-name'>{post.author.nickName}</Text>
            </View>
            <View className='post-detail-page__follow'>+ 关注</View>
          </View>

          <Text className='post-detail-page__meta'>{formatPostMeta(post)}</Text>

          <View className='post-detail-page__stats'>
            <Text>❤ {formatCount(post.likeCount)}</Text>
            <Text>★ {formatCount(post.favoriteCount)}</Text>
            <Text>↓ {formatCount(post.downloadCount)}</Text>
            <Text>{post.totalBeads} 颗</Text>
          </View>

          {post.description ? (
            <View className='post-detail-page__desc'>
              <Text className='post-detail-page__desc-label'>简介</Text>
              <Text className='post-detail-page__desc-text'>{post.description}</Text>
            </View>
          ) : null}

          {colorEntries.length > 0 ? (
            <View className='post-detail-page__colors'>
              <View className='post-detail-page__colors-header'>
                <Text className='post-detail-page__colors-title'>色号用量</Text>
                {colorEntries.length > COLOR_PREVIEW_LIMIT ? (
                  <Text
                    className='post-detail-page__colors-more'
                    onClick={() => setShowAllColors((value) => !value)}
                  >
                    {showAllColors ? '收起' : '查看全部色号'}
                  </Text>
                ) : null}
              </View>
              {visibleColors.map(([id, count]) => {
                const color = getColorById(id)
                const percent = ((count / post.totalBeads) * 100).toFixed(1)
                return (
                  <View className='post-detail-page__color-item' key={id}>
                    <View
                      className='post-detail-page__swatch'
                      style={{ backgroundColor: color?.hex ?? '#ccc' }}
                    />
                    <View className='post-detail-page__color-info'>
                      <Text className='post-detail-page__color-id'>{id}</Text>
                      <Text className='post-detail-page__color-count'>
                        {count} 颗 · {percent}%
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View className='post-detail-page__actions'>
        <View
          className={`post-detail-page__action${post.liked ? ' is-active' : ''}`}
          onClick={handleToggleLike}
        >
          <Text className='post-detail-page__action-icon'>{post.liked ? '❤️' : '🤍'}</Text>
          <Text>点赞</Text>
        </View>
        <View
          className={`post-detail-page__action${post.favorited ? ' is-active' : ''}`}
          onClick={handleToggleFavorite}
        >
          <Text className='post-detail-page__action-icon'>{post.favorited ? '★' : '☆'}</Text>
          <Text>收藏</Text>
        </View>
        <Button className='post-detail-page__share-btn' openType='share'>
          <Text className='post-detail-page__action-icon'>↗</Text>
          <Text>分享</Text>
        </Button>
        <Button
          className='post-detail-page__download'
          loading={downloading}
          disabled={downloading}
          onClick={handleDownload}
        >
          下载{downloadCost > 0 ? ` · ${downloadCost}豆` : ''}
        </Button>
      </View>
    </View>
  )
}
