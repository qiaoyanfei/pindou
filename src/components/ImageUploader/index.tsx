import { View, Image, Text } from '@tarojs/components'
import { chooseMediaWithPermission, handleMediaPickerError, isMediaPickerCancelled, notifyMediaPickerEmptyResult } from '@/utils/mediaPickerError'
import cloudUploadIcon from '@/assets/icons/cloud-upload.png'
import exampleBear from '@/assets/generate/example-bear.jpg'
import exampleDog from '@/assets/generate/example-dog.jpg'
import exampleBoy from '@/assets/generate/example-boy.jpg'
import exampleGirl from '@/assets/generate/example-girl.jpg'
import './index.scss'

const EXAMPLES = [exampleBear, exampleDog, exampleBoy, exampleGirl]

interface ImageUploaderProps {
  imagePath: string
  onSelect: (path: string) => void
}

export default function ImageUploader({ imagePath, onSelect }: ImageUploaderProps) {
  const handleChoose = async () => {
    try {
      const res = await chooseMediaWithPermission({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
      })

      const path = res.tempFiles?.[0]?.tempFilePath
      if (path) {
        onSelect(path)
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
