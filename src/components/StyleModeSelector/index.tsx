import { View, Text } from '@tarojs/components'
import { STYLE_MODE_HINTS, STYLE_MODE_LABELS } from '@/utils/constants'
import type { StyleMode } from '@/types'
import './index.scss'

interface StyleModeSelectorProps {
  value: StyleMode
  onChange: (mode: StyleMode) => void
}

export default function StyleModeSelector({ value, onChange }: StyleModeSelectorProps) {
  const modes: StyleMode[] = ['portrait', 'manga']

  return (
    <View className='style-mode'>
      <Text className='style-mode__label'>转换模式</Text>
      <View className='style-mode__options'>
        {modes.map((mode) => (
          <View
            key={mode}
            className={`style-mode__option${value === mode ? ' style-mode__option--active' : ''}`}
            onClick={() => onChange(mode)}
          >
            {STYLE_MODE_LABELS[mode]}
          </View>
        ))}
      </View>
      <Text className='style-mode__hint'>{STYLE_MODE_HINTS[value]}</Text>
    </View>
  )
}
