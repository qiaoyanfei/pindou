import { Canvas, Image, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import { getColorById } from '@/services/palette'
import { getCanvasNode } from '@/utils/canvas'
import { getColorDisplayName } from '@/utils/colorDisplayName'
import {
  COLOR_DETAIL_STORAGE_KEY,
  PATTERN_STORAGE_KEY,
  type PatternConfig,
  type PatternResult,
} from '@/types'
import { useDefaultPageShare } from '@/utils/shareReward'
import './index.scss'

interface StoredPayload {
  pattern?: PatternResult
  config?: PatternConfig
}

interface ColorEntry {
  id: string
  count: number
  hex: string
  name: string
  percent: number
}

const DONUT_CANVAS_ID = 'color-detail-donut'
const DONUT_SIZE = 220
const DETAIL_PREVIEW_LIMIT = 6
const LEGEND_LIMIT = 6

function toEntry([id, count]: [string, number], total: number): ColorEntry {
  const color = getColorById(id)
  return {
    id,
    count,
    hex: color?.hex ?? '#d1d5db',
    name: getColorDisplayName(id),
    percent: total > 0 ? (count / total) * 100 : 0,
  }
}

async function drawDonut(entries: ColorEntry[]): Promise<string> {
  if (!entries.length) return ''
  const canvas = await getCanvasNode(DONUT_CANVAS_ID)
  const dpr = Taro.getWindowInfo().pixelRatio || 1
  canvas.width = DONUT_SIZE * dpr
  canvas.height = DONUT_SIZE * dpr

  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, DONUT_SIZE, DONUT_SIZE)

  const cx = DONUT_SIZE / 2
  const cy = DONUT_SIZE / 2
  const outerRadius = DONUT_SIZE / 2 - 8
  const innerRadius = 56
  const total = entries.reduce((sum, entry) => sum + entry.count, 0)
  let start = -Math.PI / 2

  entries.forEach((entry) => {
    const angle = total > 0 ? (entry.count / total) * Math.PI * 2 : 0
    if (angle <= 0) return
    const end = start + angle

    ctx.beginPath()
    ctx.arc(cx, cy, outerRadius, start, end)
    ctx.arc(cx, cy, innerRadius, end, start, true)
    ctx.closePath()
    ctx.fillStyle = entry.hex
    ctx.fill()
    start = end
  })

  const result = await Taro.canvasToTempFilePath({
    canvas,
    x: 0,
    y: 0,
    width: DONUT_SIZE * dpr,
    height: DONUT_SIZE * dpr,
    destWidth: DONUT_SIZE * dpr,
    destHeight: DONUT_SIZE * dpr,
  })
  return result.tempFilePath
}

export default function ColorDetailPage() {
  useDefaultPageShare({ title: '色号详情', path: '/pages/home/index' })

  const [pattern, setPattern] = useState<PatternResult | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [donutSrc, setDonutSrc] = useState('')

  useDidShow(() => {
    const stored = (
      Taro.getStorageSync(COLOR_DETAIL_STORAGE_KEY)
      || Taro.getStorageSync(PATTERN_STORAGE_KEY)
    ) as StoredPayload | undefined
    if (!stored?.pattern) {
      Taro.showToast({ title: '未找到图纸数据', icon: 'none' })
      setPattern(null)
      return
    }
    setPattern(stored.pattern)
  })

  const entries = useMemo(() => {
    if (!pattern) return []
    return Object.entries(pattern.stats)
      .sort((a, b) => b[1] - a[1])
      .map((entry) => toEntry(entry, pattern.totalBeads))
  }, [pattern])

  const legendEntries = useMemo(() => {
    if (entries.length <= LEGEND_LIMIT) return entries
    const visible = entries.slice(0, LEGEND_LIMIT)
    const otherCount = entries.slice(LEGEND_LIMIT).reduce((sum, item) => sum + item.count, 0)
    return [
      ...visible,
      {
        id: '其他',
        count: otherCount,
        hex: '#e5e7eb',
        name: '其他',
        percent: pattern && pattern.totalBeads > 0 ? (otherCount / pattern.totalBeads) * 100 : 0,
      },
    ]
  }, [entries, pattern])

  const visibleDetailEntries = expanded ? entries : entries.slice(0, DETAIL_PREVIEW_LIMIT)

  useEffect(() => {
    setDonutSrc('')
    drawDonut(entries)
      .then((src) => setDonutSrc(src))
      .catch(() => {
        Taro.showToast({ title: '色号图表绘制失败', icon: 'none' })
      })
  }, [entries])

  if (!pattern) {
    return <View className='color-detail color-detail--empty'>加载中...</View>
  }

  return (
    <View className='color-detail'>
      <ScrollView scrollY className='color-detail__scroll' enhanced showScrollbar={false}>
        <View className='color-detail__body'>
          <View className='color-detail__summary-card'>
            <View className='color-detail__donut-wrap'>
              {donutSrc ? (
                <Image className='color-detail__donut-image' src={donutSrc} mode='aspectFit' />
              ) : (
                <View className='color-detail__donut-placeholder' />
              )}
              <View className='color-detail__donut-center'>
                <Text className='color-detail__donut-count'>共{entries.length}种</Text>
                <Text className='color-detail__donut-total'>{pattern.totalBeads}颗</Text>
              </View>
            </View>

            <View className='color-detail__legend'>
              {legendEntries.map((entry) => (
                <View className='color-detail__legend-row' key={entry.id}>
                  <View className='color-detail__swatch' style={{ backgroundColor: entry.hex }} />
                  <Text className='color-detail__legend-id'>{entry.id}</Text>
                  <Text className='color-detail__legend-count'>{entry.count}颗</Text>
                  <Text className='color-detail__legend-percent'>{entry.percent.toFixed(1)}%</Text>
                </View>
              ))}
            </View>
          </View>

          <View className='color-detail__detail-card'>
            <Text className='color-detail__section-title'>色号明细</Text>
            <View className='color-detail__table-head'>
              <Text>色号</Text>
              <Text>颜色</Text>
              <Text>用量</Text>
              <Text>占比</Text>
            </View>
            {visibleDetailEntries.map((entry) => (
              <View className='color-detail__table-row' key={entry.id}>
                <View className='color-detail__cell-id'>
                  <View className='color-detail__swatch color-detail__swatch--detail' style={{ backgroundColor: entry.hex }} />
                  <Text>{entry.id}</Text>
                </View>
                <View className='color-detail__cell-color'>
                  <View className='color-detail__swatch color-detail__swatch--detail' style={{ backgroundColor: entry.hex }} />
                  <Text>{entry.name}</Text>
                </View>
                <Text className='color-detail__cell-strong'>{entry.count}颗</Text>
                <Text>{entry.percent.toFixed(1)}%</Text>
              </View>
            ))}

            {entries.length > DETAIL_PREVIEW_LIMIT ? (
              <Text className='color-detail__more' onClick={() => setExpanded((value) => !value)}>
                {expanded ? '收起色号 ^' : `查看全部${entries.length}种色号 >`}
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>
      <Canvas
        type='2d'
        id={DONUT_CANVAS_ID}
        canvasId={DONUT_CANVAS_ID}
        className='color-detail__hidden-canvas'
      />
    </View>
  )
}
