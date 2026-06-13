import { View, Text, Image, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { getCachedConfig } from '@/services/communityService'
import { getTempFileUrl } from '@/services/cloudClient'
import { FEEDBACK_TYPES } from '@/types/community'
import './index.scss'

export default function FeedbackPage() {
  const config = getCachedConfig()
  const wechatId = config?.feedbackWechatId || 'doudou_shouzuo'
  const qrFileId = config?.feedbackQrUrl || ''
  const [qrUrl, setQrUrl] = useState('')

  useEffect(() => {
    if (!qrFileId) return
    if (qrFileId.startsWith('cloud://')) {
      getTempFileUrl(qrFileId)
        .then(setQrUrl)
        .catch(() => setQrUrl(''))
      return
    }
    setQrUrl(qrFileId)
  }, [qrFileId])

  const handleCopy = () => {
    Taro.setClipboardData({
      data: wechatId,
      success: () => {
        Taro.showToast({ title: '微信号已复制', icon: 'success' })
      },
    })
  }

  const goForm = (type?: string) => {
    const query = type ? `?type=${encodeURIComponent(type)}` : ''
    Taro.navigateTo({ url: `/pages/feedback-form/index${query}` })
  }

  return (
    <View className='feedback-page'>
      <View className='feedback-page__hero'>
        <Text className='feedback-page__hero-title'>联系反馈</Text>
        <Text className='feedback-page__hero-desc'>
          遇到问题？扫码添加客服微信，或填写在线反馈表单
        </Text>
      </View>

      <View className='feedback-page__quick'>
        <Text className='feedback-page__quick-title'>常见问题类型</Text>
        <View className='feedback-page__quick-tags'>
          {FEEDBACK_TYPES.slice(0, 4).map((item) => (
            <Text key={item} className='feedback-page__quick-tag' onClick={() => goForm(item)}>
              {item}
            </Text>
          ))}
        </View>
      </View>

      <View className='feedback-page__card'>
        <Text className='feedback-page__title'>添加微信反馈</Text>

        <View className='feedback-page__qr'>
          {qrUrl ? (
            <Image className='feedback-page__qr-image' src={qrUrl} mode='aspectFit' showMenuByLongpress />
          ) : (
            <Text className='feedback-page__qr-placeholder'>客服二维码</Text>
          )}
        </View>

        <View className='feedback-page__wechat'>
          <Text className='feedback-page__wechat-label'>微信号</Text>
          <Text className='feedback-page__wechat-id'>{wechatId}</Text>
          <Text className='feedback-page__copy' onClick={handleCopy}>
            复制
          </Text>
        </View>
      </View>

      <Button className='feedback-page__submit' type='primary' onClick={() => goForm()}>
        填写反馈表单
      </Button>
    </View>
  )
}
