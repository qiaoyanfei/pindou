import { View, Text, Image, Switch, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import {
  CATEGORY_OPTIONS,
  publishPost,
} from '@/services/communityService'
import { uploadCloudFile, uploadJsonCloudFile } from '@/services/cloudClient'
import { requireAuthenticated } from '@/services/session'
import HdPatternPreviewHost, { requestHdPatternPreview } from '@/components/HdPatternPreviewHost'
import { cleanupAfterPublishSuccess, notifyOperationError } from '@/utils/localCache'
import { readPublishWorkflow } from '@/utils/publishWorkflow'
import { invalidateMyListCache } from '@/utils/myListCache'
import { STYLE_MODE_LABELS } from '@/utils/constants'
import type { PostCategory } from '@/types/community'
import './index.scss'

export default function PublishPage() {
  const [payload, setPayload] = useState<ReturnType<typeof readPublishWorkflow>>(null)
  const [category, setCategory] = useState<PostCategory>(CATEGORY_OPTIONS[0])
  const [isPublic, setIsPublic] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [coverPreview, setCoverPreview] = useState('')

  useDidShow(async () => {
    const user = await requireAuthenticated('/pages/publish/index')
    if (!user) return

    const workflow = readPublishWorkflow()
    if (!workflow?.pattern) {
      Taro.showToast({ title: '请先准备图纸', icon: 'none' })
      setTimeout(() => Taro.navigateBack(), 800)
      return
    }
    setPayload(workflow)
    setCoverPreview(workflow.coverPath || '')
  })

  const handleSubmit = async () => {
    if (!payload?.pattern) return
    const title = '标题待生成'

    setSubmitting(true)
    Taro.showLoading({ title: isPublic ? '提交审核...' : '保存中...' })
    try {
      if (!payload.coverPath) {
        throw new Error('缺少封面图，请返回预览页重新操作')
      }
      const stamp = Date.now()
      const coverFileId = await uploadCloudFile(`posts/covers/${stamp}.png`, payload.coverPath)
      const patternFileId = await uploadJsonCloudFile(`posts/patterns/${stamp}.json`, payload.pattern)

      const result = await publishPost({
        title,
        category,
        description: '',
        visibility: isPublic ? 'public' : 'private',
        coverFileId,
        patternFileId,
        pattern: payload.pattern,
        config: payload.config,
      })

      cleanupAfterPublishSuccess()
      invalidateMyListCache(['my-posts', 'drafts'])
      Taro.hideLoading()
      Taro.redirectTo({
        url: `/pages/publish-success/index?reward=${result.reward}&postId=${result.postId}&visibility=${isPublic ? 'public' : 'private'}&reviewStatus=${result.reviewStatus || (isPublic ? 'pending' : 'draft')}`,
      })
    } catch (error) {
      Taro.hideLoading()
      notifyOperationError(error, '发布失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePreviewCover = () => {
    if (!payload?.pattern) return
    requestHdPatternPreview({
      pattern: payload.pattern,
      config: payload.config,
    })
  }

  if (!payload?.pattern) {
    return <View className='publish-page publish-page--empty'>加载中...</View>
  }

  const { pattern, config } = payload

  return (
    <View className='publish-page'>
      <View className='publish-page__preview'>
        <View className='publish-page__cover-wrap' onClick={handlePreviewCover}>
          {coverPreview ? (
            <Image className='publish-page__cover' src={coverPreview} mode='aspectFit' showMenuByLongpress={false} />
          ) : (
            <View className='publish-page__cover publish-page__cover--empty' />
          )}
        </View>
        <View className='publish-page__preview-meta'>
          <Text className='publish-page__preview-size'>
            {pattern.width}×{pattern.height} · {pattern.totalBeads} 颗
          </Text>
          <View className='publish-page__preview-tags'>
            <Text className='publish-page__preview-tag'>MARD221</Text>
            <Text className='publish-page__preview-tag'>{STYLE_MODE_LABELS[config.styleMode]}</Text>
          </View>
        </View>
      </View>

      <View className='publish-page__form'>
        <View className='publish-page__field'>
          <Text className='publish-page__label'>标题</Text>
          <View className='publish-page__system-title'>
            <Text className='publish-page__system-title-hint'>
              标题由系统生成，审核通过后确定
            </Text>
          </View>
        </View>

        <View className='publish-page__field'>
          <Text className='publish-page__label'>分类</Text>
          <View className='publish-page__categories'>
            {CATEGORY_OPTIONS.map((item) => (
              <Text
                key={item}
                className={`publish-page__category${category === item ? ' is-active' : ''}`}
                onClick={() => setCategory(item)}
              >
                {item}
              </Text>
            ))}
          </View>
        </View>

        <View className='publish-page__field'>
          <View className='publish-page__toggle-row'>
            <Text className='publish-page__label'>公开作品</Text>
            <Switch checked={isPublic} color='#7c3aed' onChange={(event) => setIsPublic(event.detail.value)} />
          </View>
          <Text className='publish-page__toggle-hint'>
            {isPublic
              ? '开启后将提交人工审核，通过前保存在「待发布」，审核通过后将公开展示并获得小豆奖励'
              : '关闭后仅自己可见，保存到「待发布」，可随时再提交公开审核'}
          </Text>
        </View>
      </View>

      <View className='publish-page__footer'>
        <Button
          className='publish-page__submit'
          loading={submitting}
          disabled={submitting}
          onClick={handleSubmit}
        >
          {isPublic ? '提交公开审核' : '保存到待发布'}
        </Button>
      </View>

      <HdPatternPreviewHost />
    </View>
  )
}
