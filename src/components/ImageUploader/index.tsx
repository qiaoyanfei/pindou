import { View, Image, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import cloudUploadIcon from '@/assets/icons/cloud-upload.svg'
import exampleBear from '@/assets/generate/example-bear.png'
import exampleDog from '@/assets/generate/example-dog.png'
import exampleBoy from '@/assets/generate/example-boy.png'
import exampleGirl from '@/assets/generate/example-girl.png'
import './index.scss'

const EXAMPLES = [exampleBear, exampleDog, exampleBoy, exampleGirl]

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
          <View className='image-uploader__cloud-wrap'>
            <Image className='image-uploader__cloud' src={cloudUploadIcon} mode='aspectFit' />
          </View>
          <Text className='image-uploader__title'>点击上传照片</Text>
          <Text className='image-uploader__format'>支持 JPG / PNG 格式</Text>

          <View className='image-uploader__tip-box'>
            <Text className='image-uploader__tip-line'>
              <Text className='image-uploader__tip-emoji'>💡 </Text>
              <Text className='image-uploader__tip-prefix'>提示：</Text>
              <Text className='image-uploader__tip-highlight'>请上传纯白色背景</Text>
            </Text>
            <Text className='image-uploader__tip-suggest'>
              建议：头像、宠物、卡通、玩偶等效果更佳
            </Text>
          </View>

          <View className='image-uploader__examples'>
            {EXAMPLES.map((src, index) => (
              <Image
                key={index}
                className='image-uploader__example'
                src={src}
                mode='aspectFill'
              />
            ))}
          </View>
        </View>
      )}
    </View>
  )
}
