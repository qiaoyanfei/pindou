import { View, Text, Switch, Slider } from '@tarojs/components'
import { EXPORT_LIMITS, getLongEdgeLimits } from '@/utils/constants'
import type { PatternConfig } from '@/types'
import './index.scss'

interface AdvancedSettingsProps {
  config: PatternConfig
  expanded: boolean
  onToggle: () => void
  onChange: (config: PatternConfig) => void
}

export default function AdvancedSettings({
  config,
  expanded,
  onToggle,
  onChange,
}: AdvancedSettingsProps) {
  const longEdgeLimits = getLongEdgeLimits(config.styleMode)

  return (
    <View className='advanced-settings'>
      <View className='advanced-settings__header' onClick={onToggle}>
        <Text>{expanded ? '▼' : '▶'} 高级设置</Text>
        <Text className='advanced-settings__summary'>MARD221 · {config.longEdge} 格</Text>
      </View>

      {expanded && (
        <View className='advanced-settings__body'>
          <View className='advanced-settings__slider-row'>
            <Text className='advanced-settings__label'>长边格数：{config.longEdge}</Text>
            <Slider
              className='advanced-settings__slider'
              min={longEdgeLimits.min}
              max={longEdgeLimits.max}
              step={1}
              value={config.longEdge}
              activeColor='#4f46e5'
              backgroundColor='#e5e7eb'
              blockColor='#4f46e5'
              blockSize={24}
              showValue={false}
              onChanging={(event) =>
                onChange({ ...config, longEdge: event.detail.value })
              }
              onChange={(event) =>
                onChange({ ...config, longEdge: event.detail.value })
              }
            />
            <View className='advanced-settings__slider-scale'>
              <Text>{longEdgeLimits.min}</Text>
              <Text>{longEdgeLimits.max}</Text>
            </View>
          </View>

          <View className='advanced-settings__slider-row'>
            <Text className='advanced-settings__label'>导出清晰度：{config.exportCellPx}px/格</Text>
            <Slider
              className='advanced-settings__slider'
              min={EXPORT_LIMITS.minCellPx}
              max={EXPORT_LIMITS.maxCellPx}
              step={1}
              value={config.exportCellPx}
              activeColor='#4f46e5'
              backgroundColor='#e5e7eb'
              blockColor='#4f46e5'
              blockSize={24}
              showValue={false}
              onChanging={(event) =>
                onChange({ ...config, exportCellPx: event.detail.value })
              }
              onChange={(event) =>
                onChange({ ...config, exportCellPx: event.detail.value })
              }
            />
            <View className='advanced-settings__slider-scale'>
              <Text>{EXPORT_LIMITS.minCellPx}</Text>
              <Text>{EXPORT_LIMITS.maxCellPx}</Text>
            </View>
          </View>

          <View className='advanced-settings__row'>
            <Text className='advanced-settings__label'>显示色号</Text>
            <Switch
              checked={config.showColorCode}
              onChange={(event) =>
                onChange({ ...config, showColorCode: event.detail.value })
              }
            />
          </View>

          <View className='advanced-settings__row'>
            <Text className='advanced-settings__label'>显示网格线</Text>
            <Switch
              checked={config.showGrid}
              onChange={(event) => onChange({ ...config, showGrid: event.detail.value })}
            />
          </View>
        </View>
      )}
    </View>
  )
}
