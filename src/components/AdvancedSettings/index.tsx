import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import gearIcon from '@/assets/icons/gear.svg'
import chevronRightIcon from '@/assets/icons/chevron-right.svg'
import { GENERATE_CONFIG_STORAGE_KEY, type PatternConfig } from '@/types'
import './index.scss'

interface AdvancedSettingsProps {
  config: PatternConfig
}

export default function AdvancedSettings({ config }: AdvancedSettingsProps) {
  const openSettings = () => {
    Taro.setStorageSync(GENERATE_CONFIG_STORAGE_KEY, config)
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
