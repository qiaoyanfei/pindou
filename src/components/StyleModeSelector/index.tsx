import { View, Text, Image } from '@tarojs/components'
import { STYLE_MODE_LABELS, STYLE_MODE_SUBTITLES } from '@/utils/constants'
import modePortrait from '@/assets/generate/mode-portrait.png'
import modeManga from '@/assets/generate/mode-manga.png'
import type { StyleMode } from '@/types'
import './index.scss'

interface StyleModeSelectorProps {
  value: StyleMode
  onChange: (mode: StyleMode) => void
}

const MODES: { key: StyleMode; avatar: string }[] = [
  { key: 'portrait', avatar: modePortrait },
  { key: 'manga', avatar: modeManga },
]

export default function StyleModeSelector({ value, onChange }: StyleModeSelectorProps) {
  return (
    <View className='style-mode'>
      <Text className='style-mode__title'>选择模式</Text>
      <View className='style-mode__cards'>
        {MODES.map((mode) => {
          const isActive = value === mode.key
          return (
            <View
              key={mode.key}
              className={`style-mode__card${isActive ? ' style-mode__card--active' : ''}`}
              onClick={() => onChange(mode.key)}
            >
              {isActive ? (
                <View className='style-mode__check'>
                  <Text className='style-mode__check-icon'>✓</Text>
                </View>
              ) : null}
              <Image className='style-mode__avatar' src={mode.avatar} mode='aspectFit' />
              <Text className={`style-mode__name${isActive ? ' style-mode__name--active' : ''}`}>
                {STYLE_MODE_LABELS[mode.key]}
              </Text>
              <Text className='style-mode__subtitle'>{STYLE_MODE_SUBTITLES[mode.key]}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}
