import { View, Text, Image, ScrollView, Button } from '@tarojs/components'
import Taro, { useDidShow, useRouter, useUnload } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ColorStats from '@/components/ColorStats'
import PatternCanvas from '@/components/PatternCanvas'
import {
  fetchPostDetail,
  formatCount,
  getCachedConfig,
  prepareRegenerateFromPost,
  updatePostVisibility,
} from '@/services/communityService'
import { STYLE_MODE_LABELS } from '@/utils/constants'
import { resolveCreatorNickname } from '@/utils/creatorNickname'
import { handleAlbumSaveError, saveCanvasToAlbum } from '@/utils/patternExport'
import { resolveErrorMessage } from '@/utils/errorMessage'
import { invalidateMyListCache } from '@/utils/myListCache'
import { formatDateTime } from '@/utils/formatDate'
import {
  formatReviewHistory,
  resolveReviewStatus,
  REVIEW_STATUS_DESC,
  REVIEW_STATUS_ICONS,
  REVIEW_STATUS_LABELS,
} from '@/utils/postReview'
import HdPatternPreviewHost, { requestHdPatternPreview } from '@/components/HdPatternPreviewHost'
import { getCachedPreviewData, resolvePatternForPreview, resolvePreviewData } from '@/utils/patternPreviewCache'
import { showActionSheet, showModal } from '@/utils/dialog'
import { safeNavigateTo } from '@/utils/navigation'
import { useShareContent, claimShareReward } from '@/utils/shareReward'
import type { PatternConfig, PatternResult } from '@/types'
import type { PostCategory, PostDetail, PostReviewHistoryItem, PostReviewStatus, PostVisibility } from '@/types/community'
import './index.scss'

type DetailMode = 'published' | 'pending'

const EXPORT_CANVAS_ID = 'my-post-detail-export-canvas'

interface ExportPayload {
  pattern: PatternResult
  config: PatternConfig
  creatorNickname: string
}

interface DetailSource {
  mode: DetailMode
  id: string
  title: string
  category?: PostCategory
  coverUrl: string
  width: number
  height: number
  styleMode: PostDetail['styleMode']
  paletteId: string
  stats: Record<string, number>
  totalBeads: number
  description: string
  likeCount: number
  favoriteCount: number
  downloadCount: number
  publishedAt?: string
  createdAt: string
  updatedAt?: string
  visibility?: PostVisibility
  reviewStatus: PostReviewStatus
  reviewNote?: string
  reviewHistory: PostReviewHistoryItem[]
}

function buildPatternStub(source: Pick<DetailSource, 'width' | 'height' | 'stats' | 'totalBeads'>): PatternResult {
  return {
    width: source.width,
    height: source.height,
    grid: [],
    stats: source.stats,
    totalBeads: source.totalBeads,
  }
}

export default function MyPostDetailPage() {
  const router = useRouter()
  const listMode: DetailMode = router.params.type === 'draft' || router.params.type === 'pending'
    ? 'pending'
    : 'published'
  const itemId = router.params.id || ''
  const [source, setSource] = useState<DetailSource | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exportPayload, setExportPayload] = useState<ExportPayload | null>(null)
  const loadTokenRef = useRef(0)
  const postRef = useRef<PostDetail | null>(null)
  const sourceRef = useRef<DetailSource | null>(null)
  const exportPayloadRef = useRef<ExportPayload | null>(null)

  sourceRef.current = source

  const reviewStatus = source?.reviewStatus || 'draft'
  const isApproved = reviewStatus === 'approved'
  const isPendingReview = reviewStatus === 'pending'
  const isRejected = reviewStatus === 'rejected'
  const isDraft = reviewStatus === 'draft'

  const loadDetail = useCallback(async (options?: { silent?: boolean }) => {
    if (!itemId) {
      setLoading(false)
      return
    }

    const silent = options?.silent ?? Boolean(sourceRef.current)
    const token = ++loadTokenRef.current
    if (!silent) setLoading(true)
    try {
      const post = await fetchPostDetail(itemId)
      if (token !== loadTokenRef.current) return
      postRef.current = post
      void resolvePatternForPreview(post).catch(() => {})
      const status = resolveReviewStatus(post.reviewStatus, post.visibility)
      setSource({
        mode: status === 'approved' ? 'published' : 'pending',
        id: post._id,
        title: post.title,
        category: post.category,
        coverUrl: post.coverUrl || '',
        width: post.width,
        height: post.height,
        styleMode: post.styleMode,
        paletteId: post.paletteId,
        stats: post.stats,
        totalBeads: post.totalBeads,
        description: post.description,
        likeCount: post.likeCount,
        favoriteCount: post.favoriteCount,
        downloadCount: post.downloadCount,
        publishedAt: post.publishedAt,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        visibility: post.visibility,
        reviewStatus: status,
        reviewNote: post.reviewNote,
        reviewHistory: formatReviewHistory(post.reviewHistory),
      })
    } catch (error) {
      if (token !== loadTokenRef.current) return
      if (!silent) {
        Taro.showToast({
          title: error instanceof Error ? error.message : '加载失败',
          icon: 'none',
        })
      }
    } finally {
      if (token !== loadTokenRef.current) return
      if (!silent) setLoading(false)
    }
  }, [itemId])

  useUnload(() => {
    loadTokenRef.current += 1
  })

  useDidShow(() => {
    void loadDetail({ silent: Boolean(sourceRef.current) })
  })

  useEffect(() => {
    const title = isApproved ? '我的发布详情' : '待发布详情'
    Taro.setNavigationBarTitle({ title })
  }, [isApproved])

  useShareContent(() => ({
    title: source?.title || '拼豆图纸',
    path: isApproved ? `/pages/post-detail/index?id=${itemId}` : '/pages/drafts/index',
    imageUrl: source?.coverUrl,
  }))

  const patternStub = useMemo(
    () => (source ? buildPatternStub(source) : null),
    [source],
  )

  const handlePreviewCover = () => {
    if (!postRef.current) return
    requestHdPatternPreview({
      post: postRef.current,
    })
  }

  const handleSaveImage = async () => {
    if (!source || saving || exportPayload) return

    setSaving(true)
    Taro.showLoading({ title: '保存中...' })
    try {
      let previewData = getCachedPreviewData(source.id)
      if (!previewData && postRef.current) {
        previewData = await resolvePreviewData(postRef.current)
      }
      if (!previewData) {
        throw new Error('图纸加载失败')
      }

      const payload: ExportPayload = {
        pattern: previewData.pattern,
        config: previewData.config,
        creatorNickname: resolveCreatorNickname(),
      }
      exportPayloadRef.current = payload
      setExportPayload(payload)
    } catch (error) {
      Taro.hideLoading()
      setSaving(false)
      Taro.showToast({
        title: error instanceof Error ? error.message : '保存失败',
        icon: 'none',
      })
    }
  }

  const handleExportCanvasReady = async () => {
    if (!exportPayloadRef.current) return

    try {
      await saveCanvasToAlbum(EXPORT_CANVAS_ID)
      Taro.hideLoading()
      Taro.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (error) {
      Taro.hideLoading()
      handleAlbumSaveError(error)
    } finally {
      exportPayloadRef.current = null
      setExportPayload(null)
      setSaving(false)
    }
  }

  const handleGoPublic = async () => {
    if (!source) return
    const reward = getCachedConfig()?.publishReward || 0
    const res = await showModal({
      title: '提交公开审核',
      content: reward > 0
        ? `提交后将进入人工审核，审核通过后将公开展示，并获得 ${reward} 小豆奖励`
        : '提交后将进入人工审核，审核通过后将公开展示',
      confirmText: '提交审核',
    })
    if (!res?.confirm) return
    try {
      await updatePostVisibility(source.id, 'public')
      invalidateMyListCache(['my-posts', 'drafts'])
      Taro.showToast({ title: '已提交审核', icon: 'success' })
      loadDetail()
    } catch (error) {
      Taro.showToast({
        title: resolveErrorMessage(error, '操作失败'),
        icon: 'none',
        duration: 3000,
      })
    }
  }

  const handleChangeVisibility = async () => {
    if (!source) return
    if (isDraft || isRejected) {
      handleGoPublic()
      return
    }
    if (isPendingReview) return
    const res = await showActionSheet({ itemList: ['保持公开', '转为待发布'] })
    if (!res || res.tapIndex !== 1) return
    try {
      await updatePostVisibility(source.id, 'private')
      invalidateMyListCache(['my-posts', 'drafts'])
      Taro.showToast({ title: '已转为待发布', icon: 'success' })
      loadDetail()
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '更新失败',
        icon: 'none',
      })
    }
  }

  const handleRegenerate = async () => {
    if (!source) return
    Taro.showLoading({ title: '加载图纸...' })
    try {
      await prepareRegenerateFromPost(source.id)
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
    }
  }

  const handleCommunityPreview = () => {
    if (!source || !isApproved) return
    safeNavigateTo(`/pages/post-detail/index?id=${source.id}`)
  }

  const statusActionLabel = isApproved
    ? '修改状态'
    : isPendingReview
      ? '审核中'
      : isRejected
        ? '重新生成'
        : '去公开'

  const handleStatusAction = () => {
    if (isRejected) {
      void handleRegenerate()
      return
    }
    if (isPendingReview) return
    void handleChangeVisibility()
  }

  const timeline = useMemo(() => {
    if (!source) return []
    if (source.reviewHistory.length > 0) return source.reviewHistory
    return [{
      status: source.reviewStatus,
      label: REVIEW_STATUS_LABELS[source.reviewStatus],
      createdAt: source.publishedAt || source.createdAt,
    }]
  }, [source])

  if (loading) {
    return <View className='my-post-detail-page my-post-detail-page--empty'>加载中...</View>
  }

  if (!source) {
    return <View className='my-post-detail-page my-post-detail-page--empty'>内容不存在</View>
  }

  return (
    <View className='my-post-detail-page'>
      <ScrollView scrollY className='my-post-detail-page__scroll' enhanced showScrollbar={false}>
        <View className='my-post-detail-page__content'>
          <View className='owner-card'>
            <View className='owner-card__top'>
              <View className='owner-card__cover-wrap' onClick={handlePreviewCover}>
                {source.coverUrl ? (
                  <Image
                    className='owner-card__cover'
                    src={source.coverUrl}
                    mode='aspectFit'
                    showMenuByLongpress={false}
                  />
                ) : (
                  <View className='owner-card__cover owner-card__cover--empty' />
                )}
              </View>

              <View className='owner-card__info'>
                <View className='owner-card__title-row'>
                  <Text className='owner-card__title'>{source.title}</Text>
                  {source.category ? (
                    <View className='owner-card__category'>
                      <Text>{source.category}</Text>
                    </View>
                  ) : null}
                </View>

                <View className='owner-card__specs'>
                  <Text className='owner-card__spec'>规格 {source.width}×{source.height}</Text>
                  <Text className='owner-card__spec'>模式 {STYLE_MODE_LABELS[source.styleMode]}</Text>
                  <Text className='owner-card__spec'>色卡 {source.paletteId.toUpperCase()} 标准色</Text>
                </View>
              </View>
            </View>

            {source.description ? (
              <View className='owner-card__desc'>
                <Text className='owner-card__desc-text'>{source.description}</Text>
              </View>
            ) : null}

            {isApproved ? (
              <View className='owner-card__stats'>
                <View className='owner-card__stat'>
                  <Text className='owner-card__stat-value'>{formatCount(source.likeCount)}</Text>
                  <Text className='owner-card__stat-label'>点赞</Text>
                </View>
                <View className='owner-card__stat'>
                  <Text className='owner-card__stat-value'>{formatCount(source.favoriteCount)}</Text>
                  <Text className='owner-card__stat-label'>收藏</Text>
                </View>
                <View className='owner-card__stat'>
                  <Text className='owner-card__stat-value'>{formatCount(source.downloadCount)}</Text>
                  <Text className='owner-card__stat-label'>下载</Text>
                </View>
              </View>
            ) : null}
          </View>

          {patternStub && Object.keys(source.stats).length > 0 ? (
            <View className='owner-section owner-section--colors'>
              <ColorStats pattern={patternStub} previewLimit={4} />
            </View>
          ) : null}

          <View className='owner-section'>
            <Text className='owner-section__title'>发布状态</Text>
            <View className='owner-status'>
              <View className='owner-status__main'>
                <View className='owner-status__icon'>
                  <Text>{REVIEW_STATUS_ICONS[reviewStatus]}</Text>
                </View>
                <View className='owner-status__text'>
                  <Text className='owner-status__name'>{REVIEW_STATUS_LABELS[reviewStatus]}</Text>
                  <Text className='owner-status__desc'>
                    {isRejected && source.reviewNote
                      ? source.reviewNote
                      : REVIEW_STATUS_DESC[reviewStatus]}
                  </Text>
                </View>
              </View>
              {!isPendingReview ? (
                <View className='owner-status__btn' onClick={handleStatusAction}>
                  <Text>{statusActionLabel}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {isApproved ? (
            <View className='owner-section' onClick={handleCommunityPreview}>
              <Text className='owner-section__title'>公开展示效果</Text>
              <View className='owner-preview-link'>
                <View className='owner-preview-link__thumb-wrap'>
                  {source.coverUrl ? (
                    <Image
                      className='owner-preview-link__thumb'
                      src={source.coverUrl}
                      mode='aspectFit'
                      showMenuByLongpress={false}
                    />
                  ) : (
                    <View className='owner-preview-link__thumb owner-preview-link__thumb--empty' />
                  )}
                </View>
                <View className='owner-preview-link__info'>
                  <Text className='owner-preview-link__title'>查看图纸的公开展示效果</Text>
                  <Text className='owner-preview-link__desc'>预览其他用户看到的详情页</Text>
                </View>
                <Text className='owner-preview-link__arrow'>›</Text>
              </View>
            </View>
          ) : null}

          <View className='owner-section'>
            <Text className='owner-section__title'>发布记录</Text>
            <View className='owner-timeline'>
              {timeline.map((entry, index) => (
                <View className='owner-timeline__item' key={`${entry.label}-${entry.createdAt}-${index}`}>
                  <View className={`owner-timeline__dot${index > 0 ? ' owner-timeline__dot--muted' : ''}`} />
                  <View className='owner-timeline__content'>
                    <Text className='owner-timeline__label'>{entry.label}</Text>
                    {entry.note ? (
                      <Text className='owner-timeline__note'>{entry.note}</Text>
                    ) : null}
                    <Text className='owner-timeline__time'>{formatDateTime(entry.createdAt)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      <View className='my-post-detail-page__footer'>
        <Button
          className='my-post-detail-page__btn-back'
          loading={saving}
          disabled={saving || Boolean(exportPayload)}
          onClick={handleSaveImage}
        >
          保存图片
        </Button>
        {isApproved ? (
          <Button
            className='my-post-detail-page__btn-primary'
            openType='share'
            onClick={() => void claimShareReward()}
          >
            分享图纸
          </Button>
        ) : isRejected ? (
          <Button className='my-post-detail-page__btn-primary' onClick={handleRegenerate}>
            重新生成
          </Button>
        ) : isPendingReview ? (
          <Button className='my-post-detail-page__btn-primary my-post-detail-page__btn-primary--disabled' disabled>
            审核中
          </Button>
        ) : (
          <Button className='my-post-detail-page__btn-primary' onClick={handleGoPublic}>
            去公开
          </Button>
        )}
      </View>

      {exportPayload ? (
        <PatternCanvas
          canvasId={EXPORT_CANVAS_ID}
          pattern={exportPayload.pattern}
          config={exportPayload.config}
          mode='export'
          hidden
          creatorNickname={exportPayload.creatorNickname}
          onReady={handleExportCanvasReady}
        />
      ) : null}

      <HdPatternPreviewHost />
    </View>
  )
}
