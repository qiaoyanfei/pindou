import { View, Text, Image, ScrollView, Button, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useState } from 'react'
import {
  checkIsAdmin,
  fetchReviewQueue,
  formatPostMeta,
  reviewPost,
} from '@/services/communityService'
import { requireAuthenticated } from '@/services/session'
import type { PostSummary } from '@/types/community'
import './index.scss'

export default function AdminReviewPage() {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentOpenid, setCurrentOpenid] = useState('')
  const [adminCount, setAdminCount] = useState(0)
  const [list, setList] = useState<PostSummary[]>([])
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({})
  const [processingId, setProcessingId] = useState('')

  const loadQueue = useCallback(async () => {
    setLoading(true)
    try {
      const adminResult = await checkIsAdmin()
      setIsAdmin(adminResult.isAdmin)
      setCurrentOpenid(adminResult.openid || '')
      setAdminCount(adminResult.adminCount || 0)
      if (!adminResult.isAdmin) return
      setList(await fetchReviewQueue())
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useDidShow(async () => {
    const user = await requireAuthenticated('/pages/admin-review/index')
    if (!user) return
    await loadQueue()
  })

  const handleApprove = async (postId: string) => {
    if (processingId) return
    setProcessingId(postId)
    try {
      await reviewPost(postId, 'approve')
      Taro.showToast({ title: '已通过', icon: 'success' })
      await loadQueue()
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      })
    } finally {
      setProcessingId('')
    }
  }

  const handleReject = async (postId: string) => {
    if (processingId) return
    setProcessingId(postId)
    try {
      await reviewPost(postId, 'reject', rejectNotes[postId]?.trim())
      Taro.showToast({ title: '已驳回', icon: 'success' })
      await loadQueue()
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      })
    } finally {
      setProcessingId('')
    }
  }

  if (loading) {
    return <View className='admin-review-page admin-review-page__loading'>加载中...</View>
  }

  if (!isAdmin) {
    return (
      <View className='admin-review-page admin-review-page__empty'>
        <Text>无审核权限。</Text>
        <Text className='admin-review-page__empty-meta'>
          当前 OpenID：{currentOpenid || '未获取'}
        </Text>
        <Text className='admin-review-page__empty-meta'>
          已配置管理员数量：{adminCount}
        </Text>
        <Text className='admin-review-page__empty-meta'>
          请在 app_config.adminOpenIds 数组中加入上面的 OpenID，并重新部署云函数 api。
        </Text>
      </View>
    )
  }

  return (
    <View className='admin-review-page'>
      <ScrollView scrollY className='admin-review-page__scroll'>
        <View className='admin-review-page__content'>
          <Text className='admin-review-page__tip'>
            微信提供 msgSecCheck 文本检测，图片需 mediaCheckAsync 异步回调。当前以人工审核为主，通过后作品才会进入社区。
          </Text>

          {list.length === 0 ? (
            <View className='admin-review-page__empty'>暂无待审核作品</View>
          ) : (
            list.map((item) => (
              <View className='admin-review-page__card' key={item._id}>
                <View className='admin-review-page__card-top'>
                  {item.coverUrl ? (
                    <Image className='admin-review-page__cover' src={item.coverUrl} mode='aspectFit' />
                  ) : (
                    <View className='admin-review-page__cover admin-review-page__cover--empty' />
                  )}
                  <View className='admin-review-page__info'>
                    <Text className='admin-review-page__title'>{item.title}</Text>
                    <Text className='admin-review-page__meta'>{formatPostMeta(item)}</Text>
                    <Text className='admin-review-page__author'>
                      作者：{item.author?.nickName || '未知'}
                    </Text>
                  </View>
                </View>
                <View className='admin-review-page__card-footer'>
                  <Input
                    className='admin-review-page__reject-input'
                    placeholder='驳回原因（选填）'
                    value={rejectNotes[item._id] || ''}
                    onInput={(event) => {
                      setRejectNotes((prev) => ({ ...prev, [item._id]: event.detail.value }))
                    }}
                  />
                  <View className='admin-review-page__actions'>
                    <Button
                      className='admin-review-page__btn admin-review-page__btn--approve'
                      loading={processingId === item._id}
                      disabled={Boolean(processingId)}
                      onClick={() => handleApprove(item._id)}
                    >
                      通过
                    </Button>
                    <Button
                      className='admin-review-page__btn admin-review-page__btn--reject'
                      loading={processingId === item._id}
                      disabled={Boolean(processingId)}
                      onClick={() => handleReject(item._id)}
                    >
                      驳回
                    </Button>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  )
}
