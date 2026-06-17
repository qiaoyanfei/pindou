import { View, Text, Image, Input, Textarea, Switch, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import {
  CATEGORY_OPTIONS,
  publishPost,
} from '@/services/communityService'
import { uploadCloudFile, uploadJsonCloudFile } from '@/services/cloudClient'
import { requireAuthenticated } from '@/services/session'
import HdPatternPreviewHost, { requestHdPatternPreview } from '@/components/HdPatternPreviewHost'
import { resolveErrorMessage } from '@/utils/errorMessage'
import { invalidateMyListCache } from '@/utils/myListCache'
import { STYLE_MODE_LABELS } from '@/utils/constants'
import { PUBLISH_STORAGE_KEY, type PublishStoragePayload } from '@/types'
import type { PostCategory } from '@/types/community'
import './index.scss'

export default function PublishPage() {
  const [payload, setPayload] = useState<PublishStoragePayload | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<PostCategory>(CATEGORY_OPTIONS[0])
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [coverPreview, setCoverPreview] = useState('')

  useDidShow(async () => {
    const user = await requireAuthenticated('/pages/publish/index')
    if (!user) return

    const stored = Taro.getStorageSync(PUBLISH_STORAGE_KEY) as PublishStoragePayload | undefined
    if (!stored?.pattern) {
      Taro.showToast({ title: '请先准备图纸', icon: 'none' })
      setTimeout(() => Taro.navigateBack(), 800)
      return
    }
    setPayload(stored)
    setTitle(stored.title || '')
    setCoverPreview(stored.coverPath || '')
  })

  const handleSubmit = async () => {
    if (!payload?.pattern) return
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      Taro.showToast({ title: '请填写标题', icon: 'none' })
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

      const result = await publishPost({
        title: trimmedTitle,
        category,
        description: description.trim(),
        visibility: isPublic ? 'public' : 'private',
        coverFileId,
        patternFileId,
        pattern: payload.pattern,
        config: payload.config,
      })

      Taro.removeStorageSync(PUBLISH_STORAGE_KEY)
      invalidateMyListCache(['my-posts', 'drafts'])
      Taro.hideLoading()
      Taro.redirectTo({
        url: `/pages/publish-success/index?reward=${result.reward}&postId=${result.postId}&visibility=${isPublic ? 'public' : 'private'}&reviewStatus=${result.reviewStatus || (isPublic ? 'pending' : 'draft')}`,
      })
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({
        title: resolveErrorMessage(error, '发布失败'),
        icon: 'none',
        duration: 3000,
      })
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
          <Text className='publish-page__label'>
            标题 <Text className='publish-page__label-hint'>（必填）</Text>
          </Text>
          <Input
            className='publish-page__input'
            value={title}
            maxlength={40}
            placeholder='给作品起个名字'
            onInput={(event) => setTitle(event.detail.value)}
          />
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
          <Text className='publish-page__label'>简介</Text>
          <Textarea
            className='publish-page__textarea'
            value={description}
            maxlength={200}
            placeholder='介绍一下你的作品（选填）'
            onInput={(event) => setDescription(event.detail.value)}
          />
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
