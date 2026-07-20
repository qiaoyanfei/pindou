import { View, Text, Image, Button, Switch } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { checkIsAdmin, getCachedConfig } from '@/services/communityService'
import { getTempFileUrl } from '@/services/cloudClient'
import {
  getLocalRequireExportVideo,
  setLocalRequireExportVideo,
} from '@/utils/localRequireExportVideo'
import { useDefaultPageShare } from '@/utils/shareReward'
import './index.scss'

export default function FeedbackPage() {
  useDefaultPageShare({ title: '联系反馈', path: '/pages/feedback/index' })

  const config = getCachedConfig()
  const wechatId = config?.feedbackWechatId || 'doudou_shouzuo'
  const qrFileId = config?.feedbackQrUrl || ''
  const [qrUrl, setQrUrl] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [requireExportVideo, setRequireExportVideo] = useState(getLocalRequireExportVideo)

  useDidShow(() => {
    setRequireExportVideo(getLocalRequireExportVideo())
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

  const handleToggleExportVideo = (next: boolean) => {
    setLocalRequireExportVideo(next)
    setRequireExportVideo(next)
    Taro.showToast({
      title: next ? '本机已开启：保存需看完视频' : '本机已关闭：保存无需看视频',
      icon: 'none',
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
          <View className='feedback-page__admin-group'>
            <View className='feedback-page__admin-card'>
              <View className='feedback-page__admin-switch-row'>
                <View className='feedback-page__admin-switch-copy'>
                  <Text className='feedback-page__admin-switch-title'>保存相册需看完视频</Text>
                  <Text className='feedback-page__admin-switch-desc'>
                    仅影响本机。关闭后当前设备保存 PNG 到相册可跳过激励视频，不影响其他用户
                  </Text>
                </View>
                <Switch
                  checked={requireExportVideo}
                  color='#7c3aed'
                  onChange={(event) => handleToggleExportVideo(event.detail.value)}
                />
              </View>
            </View>

            <Button
              className='feedback-page__admin'
              onClick={() => Taro.navigateTo({ url: '/pages/admin-review/index' })}
            >
              作品审核
            </Button>
            <Button
              className='feedback-page__admin feedback-page__admin--secondary'
              onClick={() => Taro.navigateTo({ url: '/pages/admin-upload-finished/index' })}
            >
              管理用户成品
            </Button>
          </View>
        ) : null}
      </View>
    </View>
  )
}
