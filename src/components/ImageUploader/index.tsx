import { View, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

interface ImageUploaderProps {
  imagePath: string
  onSelect: (path: string) => void
}

export default function ImageUploader({ imagePath, onSelect }: ImageUploaderProps) {
  const handleChoose = async () => {
    try {
      const res = await Taro.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
      })

      const path = res.tempFiles?.[0]?.tempFilePath
      if (path) onSelect(path)
    } catch (error) {
      if ((error as { errMsg?: string })?.errMsg?.includes('cancel')) return
      Taro.showToast({ title: '选图失败', icon: 'none' })
    }
  }

  return (
    <View className='image-uploader' onClick={handleChoose}>
      {imagePath ? (
        <Image className='image-uploader__preview' src={imagePath} mode='aspectFit' />
      ) : (
        <View className='image-uploader__placeholder'>
          <View className='image-uploader__icon'>+</View>
          <View className='image-uploader__text'>点击上传图片</View>
          <View className='image-uploader__hint'>支持 JPG / PNG</View>
        </View>
      )}
    </View>
  )
}
