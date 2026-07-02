import { View, Text, Image, ScrollView, Button, CoverView } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PatternCanvas from '@/components/PatternCanvas'
import {
  downloadPost,
  fetchPostDetail,
  formatCount,
  formatPostMeta,
  getCachedConfig,
  getCachedUser,
  loadPatternFromPost,
  toggleFavorite,
  toggleLike,
} from '@/services/communityService'
import { restoreSessionFromStorage } from '@/services/session'
import { isUserAuthenticated } from '@/services/wechatAuth'
import { buildLoginUrl } from '@/utils/authRoute'
import { safeNavigateTo } from '@/utils/navigation'
import { patchPostInteraction } from '@/utils/postInteractionSync'
import { invalidateMyListCache } from '@/utils/myListCache'
import { getColorById } from '@/services/palette'
import { DEFAULT_CONFIG, MINI_PROGRAM_NAME, STYLE_MODE_LABELS, normalizeConfig } from '@/utils/constants'
import { handleAlbumSaveError, saveCanvasToAlbum } from '@/utils/patternExport'
import HdPatternPreviewHost, { requestHdPatternPreview } from '@/components/HdPatternPreviewHost'
import { resolvePatternForPreview } from '@/utils/patternPreviewCache'
import type { PatternConfig, PatternResult } from '@/types'
import type { PostDetail } from '@/types/community'
import { formatColorStatsTitle } from '@/utils/colorStatsTitle'
import { useShareContent, claimShareReward } from '@/utils/shareReward'
import './index.scss'

const POST_DETAIL_EXPORT_CANVAS_ID = 'post-detail-export-canvas'

interface ExportPayload {
  pattern: PatternResult
  config: PatternConfig
  creatorNickname: string
  charged: boolean
  beanCost?: number
}

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
  const [exportPayload, setExportPayload] = useState<ExportPayload | null>(null)
  const exportPayloadRef = useRef<ExportPayload | null>(null)
  const postRef = useRef<PostDetail | null>(null)
  const [showAllColors, setShowAllColors] = useState(false)
  const [previewFrame, setPreviewFrame] = useState(getPreviewFrameSize)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const downloadCost = getCachedConfig()?.downloadCost ?? 0
  const loginRedirectUrl = `/pages/post-detail/index?id=${postId}`

  postRef.current = post

  useEffect(() => {
    setPreviewFrame(getPreviewFrameSize())
  }, [])

  const loadPost = useCallback(async (options?: { silent?: boolean }) => {
    if (!postId) {
      setLoading(false)
      return
    }
    const silent = options?.silent ?? Boolean(postRef.current)
    if (!silent) setLoading(true)
    try {
      const detail = await fetchPostDetail(postId)
      setPost(detail)
      void resolvePatternForPreview(detail).catch(() => {})
    } catch (error) {
      if (!silent) {
        Taro.showToast({
          title: error instanceof Error ? error.message : '加载失败',
          icon: 'none',
        })
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [postId])

  useDidShow(() => {
    restoreSessionFromStorage()
    setIsLoggedIn(isUserAuthenticated(getCachedUser()))
    void loadPost({ silent: Boolean(postRef.current) })
  })

  useShareContent(() => ({
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
    if (!post) return
    requestHdPatternPreview({
      post,
      creatorNickname: post.author?.nickName,
    })
  }

  const handleToggleLike = async () => {
    if (!post) return
    restoreSessionFromStorage()
    if (!isUserAuthenticated(getCachedUser())) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    try {
      const result = await toggleLike(post._id)
      setPost({ ...post, liked: result.liked, likeCount: result.likeCount })
      patchPostInteraction({
        postId: post._id,
        liked: result.liked,
        likeCount: result.likeCount,
      })
      if (!result.liked) invalidateMyListCache('my-likes')
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      })
    }
  }

  const handleToggleFavorite = async () => {
    if (!post) return
    restoreSessionFromStorage()
    if (!isUserAuthenticated(getCachedUser())) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    try {
      const result = await toggleFavorite(post._id)
      setPost({ ...post, favorited: result.favorited, favoriteCount: result.favoriteCount })
      patchPostInteraction({
        postId: post._id,
        favorited: result.favorited,
        favoriteCount: result.favoriteCount,
      })
      if (!result.favorited) invalidateMyListCache('my-favorites')
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      })
    }
  }

  const handleExportCanvasReady = async () => {
    const payload = exportPayloadRef.current
    if (!payload) return

    try {
      await saveCanvasToAlbum(POST_DETAIL_EXPORT_CANVAS_ID)
      Taro.hideLoading()
      Taro.showToast({
        title: payload.charged && payload.beanCost ? `已保存，消耗 ${payload.beanCost} 小豆` : '已保存到相册',
        icon: 'success',
      })
      if (payload.charged) {
        setPost((prev) =>
          prev ? { ...prev, downloadCount: prev.downloadCount + 1 } : prev,
        )
      }
    } catch (error) {
      Taro.hideLoading()
      handleAlbumSaveError(error)
    } finally {
      exportPayloadRef.current = null
      setExportPayload(null)
      setDownloading(false)
    }
  }

  const handleDownload = async () => {
    if (!post || downloading || exportPayload) return
    restoreSessionFromStorage()
    if (!isUserAuthenticated(getCachedUser())) {
      safeNavigateTo(buildLoginUrl(loginRedirectUrl))
      return
    }

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
      const payload: ExportPayload = {
        pattern,
        config,
        creatorNickname: result.post.author?.nickName || '',
        charged: Boolean(result.charged),
        beanCost: result.beanCost,
      }
      exportPayloadRef.current = payload
      setExportPayload(payload)
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({
        title: error instanceof Error ? error.message : '下载失败',
        icon: 'none',
      })
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
                <Image
                  className='post-detail-page__preview-image'
                  src={post.coverUrl}
                  mode='aspectFit'
                  showMenuByLongpress={false}
                />
              ) : (
                <View className='post-detail-page__preview-image post-detail-page__preview-image--empty' />
              )}
            </View>
          </View>

          <View className='post-detail-page__notice'>
            <View className='post-detail-page__notice-icon'>
              <Text className='post-detail-page__notice-icon-text'>!</Text>
            </View>
            <Text className='post-detail-page__notice-text'>
              图纸仅供个人手工参考，未经授权请勿商用或二次售卖。
            </Text>
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
                <Text className='post-detail-page__colors-title'>
                  {formatColorStatsTitle(colorEntries.length, post.totalBeads)}
                </Text>
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
          className={`post-detail-page__action${post.liked ? ' is-active' : ''}${!isLoggedIn ? ' is-disabled' : ''}`}
          onClick={handleToggleLike}
        >
          <Text className='post-detail-page__action-icon'>{post.liked ? '❤️' : '🤍'}</Text>
          <Text>点赞</Text>
        </View>
        <View
          className={`post-detail-page__action${post.favorited ? ' is-active' : ''}${!isLoggedIn ? ' is-disabled' : ''}`}
          onClick={handleToggleFavorite}
        >
          <Text className='post-detail-page__action-icon'>{post.favorited ? '★' : '☆'}</Text>
          <Text>收藏</Text>
        </View>
        <Button
          className='post-detail-page__share-btn'
          openType='share'
          onClick={() => void claimShareReward()}
        >
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

      {exportPayload ? (
        <PatternCanvas
          canvasId={POST_DETAIL_EXPORT_CANVAS_ID}
          pattern={exportPayload.pattern}
          config={exportPayload.config}
          mode='export'
          hidden
          creatorNickname={exportPayload.creatorNickname}
          onReady={handleExportCanvasReady}
        />
      ) : null}

      {downloading ? <CoverView className='post-detail-page__export-mask' /> : null}

      <HdPatternPreviewHost />
    </View>
  )
}
