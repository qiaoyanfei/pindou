import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getColorById } from '@/services/palette'
import { buildStatsTsv } from '@/services/patternRenderer'
import type { PatternResult } from '@/types'
import './index.scss'

interface ColorStatsProps {
  pattern: PatternResult
}

export default function ColorStats({ pattern }: ColorStatsProps) {
  const entries = Object.entries(pattern.stats).sort((a, b) => b[1] - a[1])

  const handleCopy = async () => {
    try {
      await Taro.setClipboardData({
        data: buildStatsTsv(pattern.stats),
      })
      Taro.showToast({ title: '已复制清单', icon: 'success' })
    } catch {
      Taro.showToast({ title: '复制失败', icon: 'none' })
    }
  }

  return (
    <View className='color-stats'>
      <View className='color-stats__header'>
        <Text className='color-stats__title'>色号用量</Text>
        <Text className='color-stats__copy' onClick={handleCopy}>
          复制清单
        </Text>
      </View>

      <View className='color-stats__list'>
        {entries.map(([id, count]) => {
          const color = getColorById(id)
          const percent = ((count / pattern.totalBeads) * 100).toFixed(1)
          return (
            <View className='color-stats__item' key={id}>
              <View
                className='color-stats__swatch'
                style={{ backgroundColor: color?.hex ?? '#ccc' }}
              />
              <View className='color-stats__info'>
                <Text className='color-stats__id'>{id}</Text>
                <Text className='color-stats__count'>
                  {count} 颗 · {percent}%
                </Text>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}
