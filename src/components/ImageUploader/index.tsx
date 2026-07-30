import { View, Image, Text } from '@tarojs/components'
import { chooseMediaWithPermission, handleMediaPickerError, isMediaPickerCancelled, notifyMediaPickerEmptyResult } from '@/utils/mediaPickerError'
import cloudUploadIcon from '@/assets/icons/cloud-upload.png'
import './index.scss'

interface ImageUploaderProps {
  imagePath: string
  onSelect: (path: string) => void | Promise<void>
  onBeforeChoose?: () => boolean | Promise<boolean>
}

export default function ImageUploader({ imagePath, onSelect, onBeforeChoose }: ImageUploaderProps) {
  const handleChoose = async () => {
    if (onBeforeChoose) {
      const shouldContinue = await onBeforeChoose()
      if (!shouldContinue) return
    }

    try {
      const res = await chooseMediaWithPermission({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
      })

      const path = res.tempFiles?.[0]?.tempFilePath
      if (path) {
        await onSelect(path)
        return
      }
      notifyMediaPickerEmptyResult()
    } catch (error) {
      if (isMediaPickerCancelled(error)) return
      handleMediaPickerError(error)
    }
  }

  return (
    <View className='image-uploader' onClick={handleChoose}>
      {imagePath ? (
        <Image className='image-uploader__preview' src={imagePath} mode='aspectFit' showMenuByLongpress={false} />
      ) : (
        <View className='image-uploader__placeholder'>
          <View className='image-uploader__cloud-wrap'>
            <Image className='image-uploader__cloud' src={cloudUploadIcon} mode='aspectFit' />
          </View>
          <Text className='image-uploader__title'>点击上传图片</Text>
          <Text className='image-uploader__format'>支持 JPG / PNG 格式</Text>

          <View className='image-uploader__tip-box'>
            <Text className='image-uploader__tip-line'>
              <Text className='image-uploader__tip-emoji'>💡 </Text>
              <Text className='image-uploader__tip-prefix'>提示：</Text>
              <Text className='image-uploader__tip-highlight'>纯白背景，主体清晰的照片效果更佳</Text>
            </Text>
          </View>
        </View>
      )}
    </View>
  )
}
