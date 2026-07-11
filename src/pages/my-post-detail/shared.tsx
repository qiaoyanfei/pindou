import { View, Text, Image, ScrollView, Button } from '@tarojs/components'
import Taro, { useDidShow, useRouter, useUnload } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deletePost,
  fetchPostDetail,
  formatCount,
  getCachedConfig,
  prepareRegenerateFromPost,
  resolvePostSourceImagePath,
  updatePostVisibility,
} from '@/services/communityService'
import { STYLE_MODE_LABELS } from '@/utils/constants'
import { resolveErrorMessage } from '@/utils/errorMessage'
import { setStorageSafe } from '@/utils/localCache'
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
import { getCachedPreviewData, removeCachedPreview, resolvePatternForPreview, resolvePreviewData } from '@/utils/patternPreviewCache'
import { showModal } from '@/utils/dialog'
import { safeNavigateTo } from '@/utils/navigation'
import { useShareContent, claimShareReward } from '@/utils/shareReward'
import { PATTERN_STORAGE_KEY } from '@/types'
import { createPostPreviewStoragePayload } from '@/utils/patternStorage'
import type { PostCategory, PostDetail, PostReviewHistoryItem, PostReviewStatus, PostVisibility } from '@/types/community'
import './index.scss'

export type DetailMode = 'published' | 'pending'

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

export default function MyPostDetail() {
  const router = useRouter()
  const itemId = router.params.id || ''
  const [source, setSource] = useState<DetailSource | null>(null)
  const [loading, setLoading] = useState(true)
  const [previewing, setPreviewing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [hiding, setHiding] = useState(false)
  const loadTokenRef = useRef(0)
  const postRef = useRef<PostDetail | null>(null)
  const sourceRef = useRef<DetailSource | null>(null)

  sourceRef.current = source

  useEffect(() => {
    setSource(null)
    postRef.current = null
    setLoading(true)
  }, [itemId])

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

    const silent = options?.silent ?? Boolean(sourceRef.current?.id === itemId && sourceRef.current)
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
    void loadDetail({ silent: sourceRef.current?.id === itemId })
  })

  useShareContent(() => ({
    title: source?.title || '拼豆图纸',
    path: isApproved ? `/pages/post-detail/index?id=${itemId}` : '/pages/drafts/index',
    imageUrl: source?.coverUrl,
  }))

  const handlePreviewCover = () => {
    if (!postRef.current) return
    requestHdPatternPreview({
      post: postRef.current,
    })
  }

  const handlePreviewPattern = async () => {
    if (!source || previewing) return

    setPreviewing(true)
    Taro.showLoading({ title: '加载图纸...' })
    try {
      let previewData = getCachedPreviewData(source.id, postRef.current?.patternFileId)
      if (!previewData && postRef.current) {
        previewData = await resolvePreviewData(postRef.current)
      }
      if (!previewData) {
        throw new Error('图纸加载失败')
      }

      const sourceImagePath = postRef.current
        ? await resolvePostSourceImagePath(postRef.current)
        : ''

      setStorageSafe(PATTERN_STORAGE_KEY, createPostPreviewStoragePayload(
        previewData.pattern,
        previewData.config,
        {
          postId: source.id,
          creatorNickname: postRef.current?.author?.nickName,
          sourceImagePath,
          title: postRef.current?.title,
          category: postRef.current?.category,
          existingSourceImageFileId: postRef.current?.sourceImageFileId,
        },
      ))
      Taro.hideLoading()
      safeNavigateTo('/pages/preview/index')
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
    } finally {
      setPreviewing(false)
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

  const handleHideWork = async () => {
    if (!source || hiding || deleting || !isApproved) return
    const res = await showModal({
      title: '隐藏作品',
      content: '隐藏后作品将从已发布列表中移除，并移至待发布，可随时再次提交公开审核。确定要隐藏吗？',
      confirmText: '隐藏',
      confirmColor: '#7c3aed',
      cancelText: '取消',
    })
    if (!res?.confirm) return

    setHiding(true)
    Taro.showLoading({ title: '处理中...', mask: true })
    try {
      await updatePostVisibility(source.id, 'private')
      invalidateMyListCache(['my-posts', 'drafts'])
      Taro.hideLoading()
      Taro.showToast({ title: '已隐藏作品', icon: 'success' })
      loadDetail()
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({
        title: resolveErrorMessage(error, '操作失败'),
        icon: 'none',
        duration: 3000,
      })
    } finally {
      setHiding(false)
    }
  }

  const handleRegenerate = async () => {
    if (!source) return
    Taro.showLoading({ title: '加载图纸...' })
    try {
      await prepareRegenerateFromPost(source.id)
      Taro.hideLoading()
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
    }
  }

  const handleDelete = async () => {
    if (!source || deleting || previewing || hiding) return
    const isPublished = source.mode === 'published'
    const res = await showModal({
      title: '删除作品',
      content: isPublished
        ? '删除后作品将从已发布列表中移除，且无法恢复。确定要删除吗？'
        : '删除后该图纸将从待发布中移除，且无法恢复。确定要删除吗？',
      confirmText: '删除',
      confirmColor: '#dc2626',
      cancelText: '取消',
    })
    if (!res?.confirm) return

    setDeleting(true)
    Taro.showLoading({ title: '删除中...', mask: true })
    try {
      await deletePost(source.id)
      removeCachedPreview(source.id)
      Taro.hideLoading()
      Taro.showToast({ title: '已删除', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 500)
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({
        title: resolveErrorMessage(error, '删除失败'),
        icon: 'none',
        duration: 3000,
      })
    } finally {
      setDeleting(false)
    }
  }

  const handleCommunityPreview = () => {
    if (!source || !isApproved) return
    safeNavigateTo(`/pages/post-detail/index?id=${source.id}`)
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

          <View className='owner-section owner-section--status'>
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
            </View>
            <View className={`owner-status__actions${isApproved ? '' : ' owner-status__actions--single'}`}>
              {isApproved ? (
                <View
                  className={`owner-status__btn${hiding || deleting ? ' owner-status__btn--disabled' : ''}`}
                  onClick={() => {
                    if (!hiding && !deleting) void handleHideWork()
                  }}
                >
                  <Text>{hiding ? '处理中...' : '隐藏作品'}</Text>
                </View>
              ) : null}
              <View
                className={`owner-status__btn owner-status__btn--danger${deleting || hiding ? ' owner-status__btn--disabled' : ''}`}
                onClick={() => {
                  if (!deleting && !hiding) void handleDelete()
                }}
              >
                <Text>{deleting ? '删除中...' : '删除作品'}</Text>
              </View>
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
          loading={previewing}
          disabled={previewing}
          onClick={handlePreviewPattern}
        >
          预览图纸
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

      <HdPatternPreviewHost />
    </View>
  )
}
