import { View, Text, Image, ScrollView, Button, Input, Textarea } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useRef, useState } from 'react'
import {
  buildPostDetailForPreview,
  checkIsAdmin,
  fetchReviewQueue,
  formatPostMeta,
  reviewPost,
} from '@/services/communityService'
import HdPatternPreviewHost, { requestHdPatternPreview } from '@/components/HdPatternPreviewHost'
import { requireAuthenticated } from '@/services/session'
import { formatDateTime } from '@/utils/formatDate'
import { STYLE_MODE_LABELS } from '@/utils/constants'
import type { PostSummary } from '@/types/community'
import { useDefaultPageShare } from '@/utils/shareReward'
import './index.scss'

type ReviewDialogMode = 'approve' | 'reject'

interface ReviewDialogState {
  mode: ReviewDialogMode
  item: PostSummary
  inputValue: string
}

function resolveDefaultReviewTitle(item: PostSummary): string {
  const title = item.title?.trim() || ''
  return title && title !== '标题待生成' ? title : ''
}

export default function AdminReviewPage() {
  useDefaultPageShare({ title: '作品审核', path: '/pages/home/index' })

  const adminCheckedRef = useRef(false)
  const isAdminRef = useRef(false)
  const scrollTopRef = useRef(0)
  const [scrollTop, setScrollTop] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [list, setList] = useState<PostSummary[]>([])
  const [processingId, setProcessingId] = useState('')
  const [dialog, setDialog] = useState<ReviewDialogState | null>(null)

  const restoreScroll = useCallback(() => {
    const top = scrollTopRef.current
    setScrollTop(top)
    setTimeout(() => {
      setScrollTop(top + 0.01)
      setTimeout(() => setScrollTop(top), 0)
    }, 0)
  }, [])

  const fetchQueue = useCallback(async () => fetchReviewQueue(), [])

  const ensureAdmin = useCallback(async () => {
    if (adminCheckedRef.current) return isAdminRef.current
    const adminResult = await checkIsAdmin()
    adminCheckedRef.current = true
    isAdminRef.current = adminResult.isAdmin
    setIsAdmin(adminResult.isAdmin)
    return adminResult.isAdmin
  }, [])

  const loadQueue = useCallback(async () => {
    setLoading(true)
    try {
      const allowed = await ensureAdmin()
      if (!allowed) return
      setList(await fetchQueue())
      setDialog(null)
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
    } finally {
      setLoading(false)
    }
  }, [ensureAdmin, fetchQueue])

  const refreshQueue = useCallback(async () => {
    if (!isAdminRef.current) return
    try {
      setList(await fetchQueue())
    } catch {
      // 静默刷新失败不打断审核操作
    }
  }, [fetchQueue])

  useDidShow(async () => {
    const user = await requireAuthenticated('/pages/admin-review/index')
    if (!user) return
    if (!adminCheckedRef.current) {
      await loadQueue()
      return
    }
    await refreshQueue()
  })

  const handlePreviewHd = (item: PostSummary) => {
    const post = buildPostDetailForPreview(item)
    if (!post) {
      Taro.showToast({ title: '缺少图纸数据', icon: 'none' })
      return
    }
    restoreScroll()
    requestHdPatternPreview({
      post,
      creatorNickname: item.author?.nickName,
    })
  }

  const openApproveDialog = (item: PostSummary) => {
    if (processingId) return
    setDialog({
      mode: 'approve',
      item,
      inputValue: resolveDefaultReviewTitle(item),
    })
  }

  const openRejectDialog = (item: PostSummary) => {
    if (processingId) return
    setDialog({
      mode: 'reject',
      item,
      inputValue: '',
    })
  }

  const closeDialog = () => {
    if (processingId) return
    setDialog(null)
  }

  const submitDialog = async () => {
    if (!dialog || processingId) return
    const { mode, item, inputValue } = dialog
    const postId = item._id
    const trimmedInput = inputValue.trim()

    if (mode === 'reject' && !trimmedInput) {
      Taro.showToast({ title: '请填写驳回意见', icon: 'none' })
      return
    }

    const prevList = list
    setProcessingId(postId)
    setList((current) => current.filter((entry) => entry._id !== postId))
    setDialog(null)

    try {
      if (mode === 'approve') {
        await reviewPost(postId, 'approve', undefined, trimmedInput || undefined)
        Taro.showToast({ title: '已通过', icon: 'success' })
      } else {
        await reviewPost(postId, 'reject', trimmedInput)
        Taro.showToast({ title: '已驳回', icon: 'success' })
      }
    } catch (error) {
      setList(prevList)
      Taro.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      })
    } finally {
      setProcessingId('')
      restoreScroll()
    }
  }

  const handleViewAuthorPosts = (authorOpenid?: string, authorName?: string) => {
    if (!authorOpenid) {
      Taro.showToast({ title: '缺少作者信息', icon: 'none' })
      return
    }
    const query = [
      `authorOpenid=${encodeURIComponent(authorOpenid)}`,
      authorName ? `authorName=${encodeURIComponent(authorName)}` : '',
    ].filter(Boolean).join('&')
    Taro.navigateTo({ url: `/pages/admin-author-posts/index?${query}` })
  }

  if (loading) {
    return <View className='admin-review-page admin-review-page__loading'>加载中...</View>
  }

  if (!isAdmin) {
    return (
      <View className='admin-review-page admin-review-page__empty'>
        <Text>暂无访问权限</Text>
      </View>
    )
  }

  const dialogTitle = dialog?.mode === 'approve' ? '审核通过' : '驳回作品'
  const dialogHint = dialog?.mode === 'approve'
    ? '请输入作品标题，留空则沿用原标题或自动生成'
    : '请填写驳回意见（必填），将反馈给作者'

  return (
    <View className='admin-review-page'>
      <ScrollView
        scrollY
        className='admin-review-page__scroll'
        scrollTop={scrollTop}
        onScroll={(event) => {
          scrollTopRef.current = event.detail.scrollTop
        }}
      >
        <View className='admin-review-page__content'>
          {list.length === 0 ? (
            <View className='admin-review-page__empty-card'>
              <Text className='admin-review-page__empty-title'>暂无待审核作品</Text>
              <Text className='admin-review-page__empty-desc'>新提交的作品会显示在这里</Text>
            </View>
          ) : (
            list.map((item) => {
              const submitTime = formatDateTime(item.updatedAt || item.createdAt)
              const displayTitle = item.title && item.title !== '标题待生成'
                ? item.title
                : '标题待生成'

              return (
                <View className='admin-review-page__card' key={item._id}>
                  <View className='admin-review-page__card-head'>
                    <Text className='admin-review-page__card-time'>{submitTime || '提交时间未知'}</Text>
                    {item.category ? (
                      <Text className='admin-review-page__card-category'>{item.category}</Text>
                    ) : null}
                  </View>

                  <View className='admin-review-page__preview'>
                    <View
                      className='admin-review-page__cover-wrap'
                      catchMove
                      onClick={() => handlePreviewHd(item)}
                    >
                      {item.coverUrl ? (
                        <Image
                          className='admin-review-page__cover'
                          src={item.coverUrl}
                          mode='aspectFit'
                          showMenuByLongpress={false}
                        />
                      ) : (
                        <View className='admin-review-page__cover admin-review-page__cover--empty' />
                      )}
                    </View>

                    <View className='admin-review-page__preview-side'>
                      <Text className='admin-review-page__title'>{displayTitle}</Text>
                      <View className='admin-review-page__chips'>
                        <Text className='admin-review-page__chip'>{formatPostMeta(item)}</Text>
                        <Text className='admin-review-page__chip'>
                          {STYLE_MODE_LABELS[item.styleMode]}
                        </Text>
                      </View>
                      <View
                        className='admin-review-page__author'
                        onClick={() => handleViewAuthorPosts(item.author?.openid, item.author?.nickName)}
                      >
                        <Text className='admin-review-page__author-name'>
                          {item.author?.nickName || '未知作者'}
                        </Text>
                        <Text className='admin-review-page__author-link'>查看作品 ›</Text>
                      </View>
                    </View>
                  </View>

                  <View className='admin-review-page__actions'>
                    <Button
                      className='admin-review-page__btn admin-review-page__btn--approve'
                      loading={processingId === item._id}
                      disabled={Boolean(processingId)}
                      onClick={() => openApproveDialog(item)}
                    >
                      通过
                    </Button>
                    <Button
                      className='admin-review-page__btn admin-review-page__btn--reject'
                      loading={processingId === item._id}
                      disabled={Boolean(processingId)}
                      onClick={() => openRejectDialog(item)}
                    >
                      驳回
                    </Button>
                  </View>
                </View>
              )
            })
          )}
        </View>
      </ScrollView>

      {dialog ? (
        <View className='admin-review-page__dialog-mask' catchMove onClick={closeDialog}>
          <View
            className='admin-review-page__dialog'
            catchMove
            onClick={(event) => event.stopPropagation()}
          >
            <Text className='admin-review-page__dialog-title'>{dialogTitle}</Text>
            <Text className='admin-review-page__dialog-hint'>{dialogHint}</Text>
            {dialog.mode === 'approve' ? (
              <Input
                className='admin-review-page__dialog-input admin-review-page__dialog-input--title'
                placeholder='请输入作品标题'
                placeholderClass='admin-review-page__dialog-input-placeholder'
                placeholderStyle='text-align:center;line-height:80rpx;color:#9ca3af;font-size:28rpx'
                value={dialog.inputValue}
                maxlength={40}
                focus
                onInput={(event) => {
                  setDialog((prev) => (
                    prev ? { ...prev, inputValue: event.detail.value } : prev
                  ))
                }}
              />
            ) : (
              <Textarea
                className='admin-review-page__dialog-textarea'
                placeholder='请填写驳回意见（必填）'
                value={dialog.inputValue}
                maxlength={200}
                focus
                onInput={(event) => {
                  setDialog((prev) => (
                    prev ? { ...prev, inputValue: event.detail.value } : prev
                  ))
                }}
              />
            )}
            <View className='admin-review-page__dialog-actions'>
              <Button
                className='admin-review-page__dialog-btn admin-review-page__dialog-btn--cancel'
                disabled={Boolean(processingId)}
                onClick={closeDialog}
              >
                取消
              </Button>
              <Button
                className={`admin-review-page__dialog-btn admin-review-page__dialog-btn--confirm${dialog.mode === 'reject' ? ' is-reject' : ''}`}
                loading={Boolean(processingId)}
                disabled={Boolean(processingId) || (dialog.mode === 'reject' && !dialog.inputValue.trim())}
                onClick={() => void submitDialog()}
              >
                确认
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      <HdPatternPreviewHost />
    </View>
  )
}
