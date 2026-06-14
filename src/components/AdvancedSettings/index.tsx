import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import gearIcon from '@/assets/icons/gear.svg'
import chevronRightIcon from '@/assets/icons/chevron-right.svg'
import { syncGenerateDraftFromPage } from '@/services/generateSession'
import type { PatternConfig } from '@/types'
import './index.scss'

interface AdvancedSettingsProps {
  config: PatternConfig
  imagePath: string
}

export default function AdvancedSettings({ config, imagePath }: AdvancedSettingsProps) {
  const openSettings = () => {
    if (!imagePath) {
      Taro.showToast({ title: '请先上传图片', icon: 'none' })
      return
    }

    syncGenerateDraftFromPage(imagePath, config)
    Taro.navigateTo({ url: '/pages/advanced-settings/index' })
  }

  return (
    <View className='advanced-settings'>
      <View className='advanced-settings__bar' onClick={openSettings}>
        <Image className='advanced-settings__gear' src={gearIcon} mode='aspectFit' />
        <View className='advanced-settings__text'>
          <Text className='advanced-settings__title'>高级设置</Text>
          <Text className='advanced-settings__desc'>可自由调整规格大小、色号、清晰度</Text>
        </View>
        <Image className='advanced-settings__chevron' src={chevronRightIcon} mode='aspectFit' />
      </View>
    </View>
  )
}
