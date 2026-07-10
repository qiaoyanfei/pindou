import { View, Text, Image, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { checkIsAdmin, getCachedConfig } from '@/services/communityService'
import { getTempFileUrl } from '@/services/cloudClient'
import { useDefaultPageShare } from '@/utils/shareReward'
import './index.scss'

export default function FeedbackPage() {
  useDefaultPageShare({ title: '联系反馈', path: '/pages/feedback/index' })

  const config = getCachedConfig()
  const wechatId = config?.feedbackWechatId || 'doudou_shouzuo'
  const qrFileId = config?.feedbackQrUrl || ''
  const [qrUrl, setQrUrl] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  useDidShow(() => {
    checkIsAdmin()
      .then((result) => setIsAdmin(result.isAdmin))
      .catch(() => setIsAdmin(false))
  })

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

  const handleCopy = (value: string, label: string) => {
    Taro.setClipboardData({
      data: value,
      success: () => {
        Taro.showToast({ title: `${label}已复制`, icon: 'success' })
      },
    })
  }

  return (
    <View className='feedback-page'>
      <View className='feedback-page__body'>
        <View className='feedback-page__card'>
          <Text className='feedback-page__card-title'>添加微信反馈</Text>
          <Text className='feedback-page__card-desc'>遇到问题？扫码添加客服微信，长按二维码保存后识别添加</Text>

          <View className='feedback-page__qr-frame'>
            <View className='feedback-page__qr'>
              {qrUrl ? (
                <Image className='feedback-page__qr-image' src={qrUrl} mode='aspectFit' showMenuByLongpress />
              ) : (
                <Text className='feedback-page__qr-placeholder'>客服二维码</Text>
              )}
            </View>
          </View>

          <View className='feedback-page__wechat'>
            <View className='feedback-page__wechat-main'>
              <Text className='feedback-page__wechat-label'>微信号</Text>
              <Text className='feedback-page__wechat-id'>{wechatId}</Text>
            </View>
            <View className='feedback-page__copy' onClick={() => handleCopy(wechatId, '微信号')}>
              <Text>复制</Text>
            </View>
          </View>
        </View>

        {isAdmin ? (
          <Button
            className='feedback-page__admin'
            onClick={() => Taro.navigateTo({ url: '/pages/admin-review/index' })}
          >
            作品审核
          </Button>
        ) : null}
      </View>
    </View>
  )
}
