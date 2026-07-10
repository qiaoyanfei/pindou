import { View, Text, Textarea, Image, Button } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { submitFeedback } from '@/services/communityService'
import { uploadCloudFile } from '@/services/cloudClient'
import { FEEDBACK_TYPES, type FeedbackType } from '@/types/community'
import { useDefaultPageShare } from '@/utils/shareReward'
import './index.scss'

const MAX_IMAGES = 3

export default function FeedbackFormPage() {
  useDefaultPageShare({ title: '问题反馈', path: '/pages/feedback/index' })

  const router = useRouter()
  const [type, setType] = useState<FeedbackType | ''>('')
  const [content, setContent] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const preset = router.params.type as FeedbackType | undefined
    if (preset && FEEDBACK_TYPES.includes(preset)) {
      setType(preset)
    }
  }, [router.params.type])

  const handleChooseImages = async () => {
    if (images.length >= MAX_IMAGES) {
      Taro.showToast({ title: `最多上传 ${MAX_IMAGES} 张`, icon: 'none' })
      return
    }

    try {
      const res = await Taro.chooseImage({
        count: MAX_IMAGES - images.length,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      if (res.tempFilePaths.length > 0) {
        setImages((prev) => [...prev, ...res.tempFilePaths])
      }
    } catch (error) {
      if ((error as { errMsg?: string })?.errMsg?.includes('cancel')) return
      Taro.showToast({ title: '选图失败', icon: 'none' })
    }
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!type) {
      Taro.showToast({ title: '请选择问题类型', icon: 'none' })
      return
    }
    if (!content.trim()) {
      Taro.showToast({ title: '请填写问题描述', icon: 'none' })
      return
    }

    setSubmitting(true)
    Taro.showLoading({ title: '提交中...' })

    try {
      const stamp = Date.now()
      const fileIds = await Promise.all(
        images.map((path, index) =>
          uploadCloudFile(`feedbacks/${stamp}_${index}.jpg`, path),
        ),
      )
      await submitFeedback({
        type,
        content: content.trim(),
        images: fileIds,
      })
      Taro.hideLoading()
      Taro.showToast({ title: '提交成功', icon: 'success' })
      setTimeout(() => {
        Taro.navigateBack()
      }, 1500)
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({
        title: error instanceof Error ? error.message : '提交失败',
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='feedback-form-page'>
      <View className='feedback-form-page__section'>
        <Text className='feedback-form-page__label'>问题类型</Text>
        <View className='feedback-form-page__tags'>
          {FEEDBACK_TYPES.map((item) => (
            <Text
              key={item}
              className={`feedback-form-page__tag${type === item ? ' is-active' : ''}`}
              onClick={() => setType(item)}
            >
              {item}
            </Text>
          ))}
        </View>
      </View>

      <View className='feedback-form-page__section'>
        <Text className='feedback-form-page__label'>问题描述</Text>
        <Textarea
          className='feedback-form-page__textarea'
          value={content}
          maxlength={500}
          placeholder='请详细描述您遇到的问题，便于我们快速定位'
          onInput={(event) => setContent(event.detail.value)}
        />
      </View>

      <View className='feedback-form-page__section'>
        <Text className='feedback-form-page__label'>截图（选填）</Text>
        <View className='feedback-form-page__images'>
          {images.map((path, index) => (
            <View key={path} className='feedback-form-page__image-item'>
              <Image className='feedback-form-page__image' src={path} mode='aspectFill' />
              <View className='feedback-form-page__image-remove' onClick={() => removeImage(index)}>
                ×
              </View>
            </View>
          ))}
          {images.length < MAX_IMAGES ? (
            <View className='feedback-form-page__upload' onClick={handleChooseImages}>
              +
            </View>
          ) : null}
        </View>
        <Text className='feedback-form-page__hint'>最多上传 {MAX_IMAGES} 张截图</Text>
      </View>

      <Button
        className='feedback-form-page__submit'
        type='primary'
        loading={submitting}
        disabled={submitting}
        onClick={handleSubmit}
      >
        提交反馈
      </Button>
    </View>
  )
}
