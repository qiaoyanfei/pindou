import { View, Text } from '@tarojs/components'
import { useMemo, useState } from 'react'
import { getColorById } from '@/services/palette'
import { getColorDisplayName } from '@/utils/colorDisplayName'
import { formatColorStatsTitle } from '@/utils/colorStatsTitle'
import { getBeadSwatchStyle } from '@/utils/transparentBead'
import type { PatternResult } from '@/types'
import './index.scss'

interface ColorStatsProps {
  pattern: PatternResult
  previewLimit?: number
}

export default function ColorStats({ pattern, previewLimit = 4 }: ColorStatsProps) {
  const [expanded, setExpanded] = useState(false)

  const entries = useMemo(
    () => Object.entries(pattern.stats).sort((a, b) => b[1] - a[1]),
    [pattern.stats],
  )

  const visibleEntries = expanded ? entries : entries.slice(0, previewLimit)
  const colorCount = entries.length

  return (
    <View className='color-stats'>
      <Text className='color-stats__title'>
        {formatColorStatsTitle(colorCount, pattern.totalBeads)}
      </Text>

      <View className='color-stats__list'>
        {visibleEntries.map(([id, count]) => {
          const color = getColorById(id)
          const percent = ((count / pattern.totalBeads) * 100).toFixed(1)
          return (
            <View className='color-stats__item' key={id}>
              <View
                className='color-stats__swatch'
                style={getBeadSwatchStyle(id, color?.hex)}
              />
              <View className='color-stats__meta'>
                <Text className='color-stats__id'>{id}</Text>
                <Text className='color-stats__name'>{getColorDisplayName(id)}</Text>
              </View>
              <View className='color-stats__values'>
                <Text className='color-stats__count'>{count} 颗</Text>
                <Text className='color-stats__percent'>{percent}%</Text>
              </View>
            </View>
          )
        })}
      </View>

      {colorCount > previewLimit && (
        <Text className='color-stats__more' onClick={() => setExpanded((value) => !value)}>
          {expanded ? '收起色号 ^' : '查看全部色号 >'}
        </Text>
      )}
    </View>
  )
}
