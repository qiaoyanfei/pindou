import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PostListItem from '@/components/PostListItem'
import {
  buildPostDetailUrl,
  fetchFinishedProduct,
  fetchPostDetail,
  formatCount,
  getCachedUser,
  toggleFinishedProductLike,
} from '@/services/communityService'
import { restoreSessionFromStorage } from '@/services/session'
import { isUserAuthenticated } from '@/services/wechatAuth'
import {
  cacheFinishedProduct,
  getCachedFinishedProduct,
} from '@/utils/finishedProductCache'
import { patchFinishedProductInteraction } from '@/utils/finishedProductInteractionSync'
import { previewImageWithoutMenu } from '@/utils/previewImage'
import { useShareContent } from '@/utils/shareReward'
import type { FinishedProductDetail, PostSummary } from '@/types/community'
import cloudUploadIcon from '@/assets/icons/cloud-upload.png'
import mineLikeIcon from '@/assets/icons/mine-like.svg'
import previewFullscreenIcon from '@/assets/icons/preview-fullscreen.svg'
import statLikeIcon from '@/assets/icons/stat-like-grey.svg'
import './index.scss'

const STATUS_TAGS = [
  { key: 'shot', label: '用户实拍', tone: 'purple' },
  { key: 'done', label: '已完成', tone: 'green' },
  { key: 'show', label: '成品展示', tone: 'soft' },
] as const

export default function FinishedProductDetailPage() {
  const router = useRouter()
  const productId = router.params.id || ''
  const initialCached = getCachedFinishedProduct(productId)
  const [product, setProduct] = useState<FinishedProductDetail | null>(initialCached)
  const [linkedPost, setLinkedPost] = useState<PostSummary | null>(null)
  const [loading, setLoading] = useState(!initialCached)
  const [liking, setLiking] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(() => isUserAuthenticated(getCachedUser()))
  const productRef = useRef<FinishedProductDetail | null>(initialCached)

  productRef.current = product

  useShareContent(() => ({
    title: product?.title || '拼豆成品',
    path: `/pages/finished-product-detail/index?id=${productId}`,
    imageUrl: product?.coverUrl || product?.imageUrls?.[0],
  }))

  useEffect(() => {
    const cached = getCachedFinishedProduct(productId)
    if (cached) {
      setProduct(cached)
      setLoading(false)
    } else {
      setProduct(null)
      setLinkedPost(null)
      setLoading(true)
    }
  }, [productId])

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!productId) {
      setLoading(false)
      setProduct(null)
      setLinkedPost(null)
      return
    }

    const silent = options?.silent ?? Boolean(productRef.current)
    if (!silent) setLoading(true)

    try {
      const next = await fetchFinishedProduct(productId)
      cacheFinishedProduct(next)
      setProduct(next)

      if (next.postId) {
        try {
          const post = await fetchPostDetail(next.postId)
          setLinkedPost(post)
        } catch {
          setLinkedPost(null)
        }
      } else {
        setLinkedPost(null)
      }
    } catch (error) {
      if (!silent) {
        setProduct(null)
        setLinkedPost(null)
      }
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
    } finally {
      if (!silent) setLoading(false)
    }
  }, [productId])

  useDidShow(() => {
    restoreSessionFromStorage()
    setIsLoggedIn(isUserAuthenticated(getCachedUser()))
    void load({ silent: Boolean(productRef.current) })
  })

  const coverUrl = product?.coverUrl || product?.imageUrls?.[0] || ''

  const previewUrls = useMemo(() => {
    if (!product) return [] as string[]
    if (product.imageUrls?.length) return product.imageUrls
    if (product.coverUrl) return [product.coverUrl]
    return []
  }, [product])

  const displayTitle = useMemo(() => {
    if (!product?.title) return ''
    return product.title.includes('成品') ? product.title : `${product.title} · 成品`
  }, [product?.title])

  const handleLike = async () => {
    if (!product || liking) return
    restoreSessionFromStorage()
    if (!isUserAuthenticated(getCachedUser())) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    setLiking(true)
    try {
      const result = await toggleFinishedProductLike(product._id)
      const next = {
        ...product,
        liked: result.liked,
        likeCount: result.likeCount,
      }
      setProduct(next)
      cacheFinishedProduct(next)
      patchFinishedProductInteraction({
        productId: product._id,
        liked: result.liked,
        likeCount: result.likeCount,
      })
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      })
    } finally {
      setLiking(false)
    }
  }

  const handlePreviewCover = () => {
    if (!previewUrls.length) return
    void previewImageWithoutMenu({
      current: previewUrls[0],
      urls: previewUrls,
    })
  }

  const openLinkedPost = () => {
    const postId = linkedPost?._id || product?.postId
    if (!postId) {
      Taro.showToast({ title: '未关联图纸', icon: 'none' })
      return
    }
    Taro.navigateTo({
      url: buildPostDetailUrl(postId, linkedPost?.author?.openid || product?.author?.openid),
    })
  }

  const goFeedbackUpload = () => {
    Taro.navigateTo({ url: '/pages/feedback/index' })
  }

  if (loading && !product) {
    return <View className='finished-detail-page finished-detail-page--empty'>加载中...</View>
  }

  if (!product) {
    return <View className='finished-detail-page finished-detail-page--empty'>成品不存在</View>
  }

  return (
    <View className='finished-detail-page'>
      <ScrollView scrollY className='finished-detail-page__scroll' enhanced showScrollbar={false}>
        <View className='finished-detail-page__body'>
          <View className='finished-detail-page__preview-slot'>
            {coverUrl ? (
              <View className='finished-detail-page__preview-fallback' onClick={handlePreviewCover}>
                <Image
                  className='finished-detail-page__preview-image'
                  src={coverUrl}
                  mode='aspectFit'
                  showMenuByLongpress={false}
                />
                <View
                  className='finished-detail-page__fullscreen'
                  onClick={(event) => {
                    event.stopPropagation()
                    handlePreviewCover()
                  }}
                >
                  <Image
                    className='finished-detail-page__fullscreen-icon'
                    src={previewFullscreenIcon}
                    mode='aspectFit'
                  />
                </View>
              </View>
            ) : (
              <View className='finished-detail-page__preview-fallback finished-detail-page__preview-fallback--empty' />
            )}
          </View>

          <View className='finished-detail-page__section finished-detail-page__info'>
            <Text className='finished-detail-page__title'>{displayTitle}</Text>

            <View className='finished-detail-page__author-row'>
              <View className='finished-detail-page__author'>
                {product.author.avatarUrl ? (
                  <Image
                    className='finished-detail-page__avatar'
                    src={product.author.avatarUrl}
                    mode='aspectFill'
                  />
                ) : (
                  <View className='finished-detail-page__avatar finished-detail-page__avatar--placeholder' />
                )}
                <Text className='finished-detail-page__author-name'>{product.author.nickName}</Text>
              </View>

              <View
                className={`finished-detail-page__like${product.liked ? ' is-liked' : ''}${!isLoggedIn ? ' is-disabled' : ''}`}
                onClick={() => void handleLike()}
              >
                <Image
                  className='finished-detail-page__like-icon'
                  src={product.liked ? mineLikeIcon : statLikeIcon}
                  mode='aspectFit'
                />
                <Text className='finished-detail-page__like-count'>{formatCount(product.likeCount)}</Text>
              </View>
            </View>

            <View className='finished-detail-page__tags'>
              {STATUS_TAGS.map((tag) => (
                <View
                  key={tag.key}
                  className={`finished-detail-page__tag finished-detail-page__tag--${tag.tone}`}
                >
                  <Text className='finished-detail-page__tag-icon'>
                    {tag.key === 'shot' ? '📷' : tag.key === 'done' ? '✓' : '👥'}
                  </Text>
                  <Text>{tag.label}</Text>
                </View>
              ))}
            </View>

            {product.description ? (
              <Text className='finished-detail-page__desc'>{product.description}</Text>
            ) : null}
          </View>

          <View className='finished-detail-page__section finished-detail-page__cta'>
            <Text className='finished-detail-page__cta-title'>上传你的成品 ✨</Text>
            <Text className='finished-detail-page__cta-desc'>
              让更多人看到你的拼豆实力成果吧！收获认可与点赞 ✨
            </Text>
            <View className='finished-detail-page__cta-pills'>
              <Text className='finished-detail-page__cta-pill'>收获点赞</Text>
              <Text className='finished-detail-page__cta-pill'>获得认可</Text>
              <Text className='finished-detail-page__cta-pill'>展示实力</Text>
            </View>
            <View className='finished-detail-page__cta-btn' onClick={goFeedbackUpload}>
              <Image className='finished-detail-page__cta-btn-icon' src={cloudUploadIcon} mode='aspectFit' />
              <Text>联系客服上传</Text>
            </View>
          </View>

          {linkedPost || product.postId ? (
            <View className='finished-detail-page__linked'>
              <Text className='finished-detail-page__linked-heading'>关联图纸</Text>
              {linkedPost ? (
                <PostListItem item={linkedPost} mode='published' onClick={openLinkedPost} />
              ) : (
                <View className='finished-detail-page__linked-empty' onClick={openLinkedPost}>
                  <Text>查看关联图纸 ›</Text>
                </View>
              )}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}
