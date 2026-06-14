import { View, Text, Image, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { checkIsAdmin, getCachedConfig } from '@/services/communityService'
import { getTempFileUrl } from '@/services/cloudClient'
import './index.scss'

export default function FeedbackPage() {
  const config = getCachedConfig()
  const wechatId = config?.feedbackWechatId || 'doudou_shouzuo'
  const qrFileId = config?.feedbackQrUrl || ''
  const [qrUrl, setQrUrl] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentOpenid, setCurrentOpenid] = useState('')
  const [adminCheckError, setAdminCheckError] = useState('')

  useDidShow(() => {
    checkIsAdmin()
      .then((result) => {
        setIsAdmin(result.isAdmin)
        setCurrentOpenid(result.openid || '')
        setAdminCheckError('')
      })
      .catch((error) => {
        setIsAdmin(false)
        setAdminCheckError(error instanceof Error ? error.message : '权限检查失败')
      })
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
            作品审核（管理员）
          </Button>
        ) : null}

        {!isAdmin && currentOpenid ? (
          <View className='feedback-page__admin-hint'>
            <Text className='feedback-page__admin-hint-title'>管理员配置</Text>
            <Text className='feedback-page__admin-hint-desc'>
              将下方 OpenID 填入云数据库 app_config.adminOpenIds（数组类型），并重新部署云函数 api。
            </Text>
            <View className='feedback-page__admin-hint-row'>
              <Text className='feedback-page__admin-hint-openid'>{currentOpenid}</Text>
              <View className='feedback-page__copy' onClick={() => handleCopy(currentOpenid, 'OpenID')}>
                <Text>复制</Text>
              </View>
            </View>
            {adminCheckError ? (
              <Text className='feedback-page__admin-hint-error'>{adminCheckError}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  )
}
