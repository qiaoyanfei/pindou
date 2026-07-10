import { View, Text, Image, ScrollView, Button, CoverView } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PatternCanvas from '@/components/PatternCanvas'
import ZoomablePatternViewer from '@/components/ZoomablePatternViewer'
import {
  downloadPost,
  fetchPostDetail,
  formatCount,
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
import { MINI_PROGRAM_NAME, STYLE_MODE_LABELS } from '@/utils/constants'
import { setStorageSafe } from '@/utils/localCache'
import { handleAlbumSaveError, saveCanvasToAlbum } from '@/utils/patternExport'
import HdPatternPreviewHost, { requestHdPatternPreview } from '@/components/HdPatternPreviewHost'
import {
  buildPreviewConfigFromPost,
  getCachedPreviewData,
  resolvePreviewData,
} from '@/utils/patternPreviewCache'
import { resolveDisplayedPattern, type PreviewVariant } from '@/utils/patternVariant'
import { COLOR_DETAIL_STORAGE_KEY, type PatternConfig, type PatternResult } from '@/types'
import type { PostDetail } from '@/types/community'
import { useShareContent, claimShareReward } from '@/utils/shareReward'
import './index.scss'

const POST_DETAIL_EXPORT_CANVAS_ID = 'post-detail-export-canvas'

interface ExportPayload {
  pattern: PatternResult
  config: PatternConfig
  creatorNickname: string
  charged: boolean
  beanCost?: number
  showMirrorLabel: boolean
}

interface PreviewData {
  pattern: PatternResult
  config: PatternConfig
}

function formatPaletteLabel(paletteId: string): string {
  const normalized = paletteId.trim().toLowerCase()
  if (normalized === 'mard221' || normalized === 'mard') return 'MARD 221'
  return paletteId.toUpperCase()
}

export default function PostDetailPage() {
  const router = useRouter()
  const postId = router.params.id || ''
  const [post, setPost] = useState<PostDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [variant, setVariant] = useState<PreviewVariant>('original')
  const [downloading, setDownloading] = useState(false)
  const [exportPayload, setExportPayload] = useState<ExportPayload | null>(null)
  const exportPayloadRef = useRef<ExportPayload | null>(null)
  const postRef = useRef<PostDetail | null>(null)
  const variantRef = useRef<PreviewVariant>('original')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const downloadCost = getCachedConfig()?.downloadCost ?? 0
  const loginRedirectUrl = `/pages/post-detail/index?id=${postId}`

  postRef.current = post
  variantRef.current = variant

  useEffect(() => {
    setVariant('original')
    setPreviewData(null)
  }, [postId])

  const loadPreviewData = useCallback(async (detail: PostDetail) => {
    const cached = getCachedPreviewData(detail._id)
    if (cached) {
      setPreviewData(cached)
      return
    }

    setPreviewLoading(true)
    try {
      const data = await resolvePreviewData(detail)
      setPreviewData(data)
    } catch {
      setPreviewData(null)
    } finally {
      setPreviewLoading(false)
    }
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
      void loadPreviewData(detail)
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
  }, [postId, loadPreviewData])

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

  const displayedPattern = useMemo(() => {
    if (!previewData) return null
    return resolveDisplayedPattern(previewData.pattern, variant)
  }, [previewData, variant])

  const totalBeads = displayedPattern?.totalBeads ?? post?.totalBeads ?? 0
  const colorCount = Object.keys(displayedPattern?.stats ?? post?.stats ?? {}).length
  const specLabel = post ? `${post.width}×${post.height}` : '--'
  const contentTags = useMemo(() => {
    if (!post) return []
    return [STYLE_MODE_LABELS[post.styleMode], post.category].filter(Boolean) as string[]
  }, [post])

  const handlePreviewCover = () => {
    if (!post) return
    if (displayedPattern && previewData) {
      requestHdPatternPreview({
        pattern: displayedPattern,
        config: previewData.config,
        creatorNickname: post.author?.nickName,
        showMirrorLabel: variant === 'mirror',
      })
      return
    }
    requestHdPatternPreview({
      post,
      creatorNickname: post.author?.nickName,
    })
  }

  const handleColorDetail = () => {
    if (!post) return

    const patternForDetail = displayedPattern ?? {
      width: post.width,
      height: post.height,
      grid: [],
      stats: post.stats,
      totalBeads: post.totalBeads,
    }
    const configForDetail = previewData?.config ?? buildPreviewConfigFromPost(post)

    setStorageSafe(COLOR_DETAIL_STORAGE_KEY, {
      pattern: patternForDetail,
      config: configForDetail,
    })
    Taro.navigateTo({ url: '/pages/color-detail/index' })
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
      const basePattern = await loadPatternFromPost(result.post)
      const config: PatternConfig = buildPreviewConfigFromPost(result.post)
      const currentVariant = variantRef.current
      const pattern = resolveDisplayedPattern(basePattern, currentVariant)
      const payload: ExportPayload = {
        pattern,
        config,
        creatorNickname: result.post.author?.nickName || '',
        charged: Boolean(result.charged),
        beanCost: result.beanCost,
        showMirrorLabel: currentVariant === 'mirror',
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
          <View className='post-detail-page__variant-switch'>
            <View
              className={`post-detail-page__variant-option${variant === 'original' ? ' is-active' : ''}${downloading ? ' is-disabled' : ''}`}
              onClick={() => {
                if (!downloading) setVariant('original')
              }}
            >
              <Text>原图</Text>
            </View>
            <View
              className={`post-detail-page__variant-option${variant === 'mirror' ? ' is-active' : ''}${downloading ? ' is-disabled' : ''}`}
              onClick={() => {
                if (!downloading) setVariant('mirror')
              }}
            >
              <Text>镜像</Text>
            </View>
          </View>

          <View className='post-detail-page__preview-slot'>
            {displayedPattern && previewData ? (
              <ZoomablePatternViewer
                key={`${post._id}-${variant}`}
                pattern={displayedPattern}
                config={previewData.config}
                onFullscreen={handlePreviewCover}
              />
            ) : previewLoading ? (
              <View className='post-detail-page__preview-loading'>
                <Text>图纸加载中...</Text>
              </View>
            ) : post.coverUrl ? (
              <View className='post-detail-page__preview-fallback' onClick={handlePreviewCover}>
                <Image
                  className='post-detail-page__preview-image'
                  src={post.coverUrl}
                  mode='aspectFit'
                  showMenuByLongpress={false}
                />
              </View>
            ) : (
              <View className='post-detail-page__preview-loading post-detail-page__preview-loading--empty' />
            )}
          </View>

          {colorCount > 0 ? (
            <View className='post-detail-page__stats-card'>
              <View className='post-detail-page__stats-row'>
                <View className='post-detail-page__stat-item'>
                  <Text className='post-detail-page__stat-label'>规格</Text>
                  <Text className='post-detail-page__stat-value'>{specLabel}</Text>
                </View>
                <View className='post-detail-page__stat-divider' />
                <View className='post-detail-page__stat-item'>
                  <Text className='post-detail-page__stat-label'>颜色</Text>
                  <Text className='post-detail-page__stat-value'>{colorCount}种</Text>
                </View>
                <View className='post-detail-page__stat-divider' />
                <View className='post-detail-page__stat-item'>
                  <Text className='post-detail-page__stat-label'>颗数</Text>
                  <Text className='post-detail-page__stat-value post-detail-page__stat-value--compact'>
                    {totalBeads}颗
                  </Text>
                </View>
                <View className='post-detail-page__stat-divider' />
                <View className='post-detail-page__stat-item'>
                  <Text className='post-detail-page__stat-label'>色卡</Text>
                  <Text className='post-detail-page__stat-value post-detail-page__stat-value--compact'>
                    {formatPaletteLabel(post.paletteId)}
                  </Text>
                </View>
              </View>
              <View className='post-detail-page__stats-footer'>
                <Text className='post-detail-page__color-link' onClick={handleColorDetail}>
                  查看色号详情 ›
                </Text>
              </View>
            </View>
          ) : null}

          <View className='post-detail-page__notice'>
            <View className='post-detail-page__notice-icon'>
              <Text className='post-detail-page__notice-icon-text'>!</Text>
            </View>
            <Text className='post-detail-page__notice-text'>
              图纸仅供个人手工参考，未经授权请勿商用或二次售卖。
            </Text>
          </View>

          <View className='post-detail-page__info-card'>
            <Text className='post-detail-page__title'>{post.title}</Text>

            {contentTags.length > 0 ? (
              <View className='post-detail-page__content-tags'>
                {contentTags.map((tag) => (
                  <Text className='post-detail-page__content-tag' key={tag}>{tag}</Text>
                ))}
              </View>
            ) : null}

            <View className='post-detail-page__author'>
              {post.author.avatarUrl ? (
                <Image className='post-detail-page__avatar' src={post.author.avatarUrl} />
              ) : (
                <View className='post-detail-page__avatar post-detail-page__avatar--placeholder' />
              )}
              <Text className='post-detail-page__author-name'>{post.author.nickName}</Text>
            </View>

            <View className='post-detail-page__engagement'>
              <View className='post-detail-page__engagement-item'>
                <Text className='post-detail-page__engagement-icon'>❤</Text>
                <Text>{formatCount(post.likeCount)}</Text>
              </View>
              <View className='post-detail-page__engagement-item'>
                <Text className='post-detail-page__engagement-icon'>★</Text>
                <Text>{formatCount(post.favoriteCount)}</Text>
              </View>
              <View className='post-detail-page__engagement-item'>
                <Text className='post-detail-page__engagement-icon'>↓</Text>
                <Text>{formatCount(post.downloadCount)}</Text>
              </View>
            </View>
          </View>

          {post.description ? (
            <View className='post-detail-page__desc'>
              <Text className='post-detail-page__desc-label'>简介</Text>
              <Text className='post-detail-page__desc-text'>{post.description}</Text>
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
          showMirrorLabel={exportPayload.showMirrorLabel}
          onReady={handleExportCanvasReady}
        />
      ) : null}

      {downloading ? <CoverView className='post-detail-page__export-mask' /> : null}

      <HdPatternPreviewHost />
    </View>
  )
}
