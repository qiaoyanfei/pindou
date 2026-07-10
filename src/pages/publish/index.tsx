import { View, Text, Image, Switch, Button, Input } from '@tarojs/components'
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
import { useDefaultPageShare } from '@/utils/shareReward'
import './index.scss'

function guessImageExtension(path: string): string {
  const match = path.match(/\.(jpe?g|png|webp|gif)(?=\?|$)/i)
  return match ? `.${match[1].toLowerCase()}` : '.jpg'
}

export default function PublishPage() {
  useDefaultPageShare({ title: '发布图纸', path: '/pages/home/index' })

  const [payload, setPayload] = useState<ReturnType<typeof readPublishWorkflow>>(null)
  const [category, setCategory] = useState<PostCategory>(CATEGORY_OPTIONS[0])
  const [isPublic, setIsPublic] = useState(true)
  const [manualTitle, setManualTitle] = useState('')
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
    if (workflow.category && CATEGORY_OPTIONS.includes(workflow.category)) {
      setCategory(workflow.category)
    }
    if (workflow.title && workflow.title !== '标题待生成') {
      setManualTitle(workflow.title)
    }
  })

  const handleSubmit = async () => {
    if (!payload?.pattern) return
    const title = isPublic ? '' : manualTitle.trim()
    if (!isPublic && !title) {
      Taro.showToast({ title: '请输入标题', icon: 'none' })
      return
    }

    setSubmitting(true)
    Taro.showLoading({ title: isPublic ? '提交审核...' : '保存中...' })
    try {
      if (!payload.coverPath) {
        throw new Error('缺少封面图，请返回预览页重新操作')
      }
      const stamp = Date.now()
      const coverFileId = await uploadCloudFile(`posts/covers/${stamp}.png`, payload.coverPath)
      const patternFileId = await uploadJsonCloudFile(`posts/patterns/${stamp}.json`, payload.pattern)
      let sourceImageFileId = payload.existingSourceImageFileId || ''
      if (payload.sourceImagePath) {
        try {
          const extension = guessImageExtension(payload.sourceImagePath)
          sourceImageFileId = await uploadCloudFile(
            `posts/sources/${stamp}${extension}`,
            payload.sourceImagePath,
          )
        } catch {
          // 原图上传失败时保留已有 fileId
        }
      }

      const result = await publishPost({
        postId: payload.postId,
        title,
        category,
        description: '',
        visibility: isPublic ? 'public' : 'private',
        coverFileId,
        patternFileId,
        sourceImageFileId: sourceImageFileId || undefined,
        pattern: payload.pattern,
        config: payload.config,
      })

      cleanupAfterPublishSuccess()
      invalidateMyListCache(['my-posts', 'drafts'])
      Taro.hideLoading()
      Taro.redirectTo({
        url: `/pages/publish-success/index?reward=${result.reward}&postId=${result.postId}&visibility=${isPublic ? 'public' : 'private'}&reviewStatus=${result.reviewStatus || (isPublic ? 'pending' : 'draft')}&update=${payload.postId ? '1' : '0'}`,
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
  const isUpdate = Boolean(payload.postId)

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
          {isPublic ? (
            <View className='publish-page__system-title'>
              <Text className='publish-page__system-title-hint'>
                {isUpdate && manualTitle
                  ? `当前标题「${manualTitle}」，公开审核通过后仍可使用；也可关闭公开后修改`
                  : '标题由系统生成，审核通过后确定'}
              </Text>
            </View>
          ) : (
            <Input
              className='publish-page__title-input'
              value={manualTitle}
              maxlength={30}
              placeholder='请输入图纸标题'
              placeholderClass='publish-page__title-placeholder'
              onInput={(event) => setManualTitle(event.detail.value)}
            />
          )}
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
          {isPublic ? (isUpdate ? '更新并提交审核' : '提交公开审核') : (isUpdate ? '更新保存' : '保存到待发布')}
        </Button>
      </View>

      <HdPatternPreviewHost />
    </View>
  )
}
