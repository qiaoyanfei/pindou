import { View, Text, ScrollView, Input } from '@tarojs/components'
import { useMemo, useState } from 'react'
import { getColorById, getPalette } from '@/services/palette'
import { getColorDisplayName } from '@/utils/colorDisplayName'
import { getPatternColorIds } from '@/utils/patternEdit'
import type { PatternResult } from '@/types'
import './index.scss'

interface ColorPickerSheetProps {
  visible: boolean
  pattern: PatternResult
  currentColorId: string
  onSelect: (colorId: string) => void
  onClose: () => void
}

export default function ColorPickerSheet({
  visible,
  pattern,
  currentColorId,
  onSelect,
  onClose,
}: ColorPickerSheetProps) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  const patternColorIds = useMemo(() => getPatternColorIds(pattern), [pattern])

  const filteredPaletteIds = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return getPalette().map((color) => color.id)
    return getPalette()
      .filter((color) => color.id.toUpperCase().includes(q))
      .map((color) => color.id)
  }, [query])

  const visibleColorIds = showAll ? filteredPaletteIds : patternColorIds

  if (!visible) return null

  return (
    <View className='color-picker-sheet'>
      <View className='color-picker-sheet__mask' onClick={onClose} />
      <View className='color-picker-sheet__panel'>
        <View className='color-picker-sheet__header'>
          <Text className='color-picker-sheet__title'>选择色号</Text>
          <Text className='color-picker-sheet__close' onClick={onClose}>
            关闭
          </Text>
        </View>

        <View className='color-picker-sheet__current'>
          <Text className='color-picker-sheet__current-label'>当前格子</Text>
          <View
            className='color-picker-sheet__current-swatch'
            style={{ backgroundColor: getColorById(currentColorId)?.hex ?? '#ccc' }}
          />
          <Text className='color-picker-sheet__current-id'>{currentColorId || '空'}</Text>
        </View>

        <View className='color-picker-sheet__search'>
          <Input
            className='color-picker-sheet__search-input'
            placeholder='搜索色号，如 H7'
            value={query}
            onInput={(event) => setQuery(event.detail.value)}
          />
        </View>

        <View className='color-picker-sheet__tabs'>
          <Text
            className={`color-picker-sheet__tab${showAll ? '' : ' color-picker-sheet__tab--active'}`}
            onClick={() => setShowAll(false)}
          >
            图纸色号
          </Text>
          <Text
            className={`color-picker-sheet__tab${showAll ? ' color-picker-sheet__tab--active' : ''}`}
            onClick={() => setShowAll(true)}
          >
            全部 221 色
          </Text>
        </View>

        <ScrollView scrollY className='color-picker-sheet__list' enhanced showScrollbar={false}>
          <View className='color-picker-sheet__grid'>
            {visibleColorIds.map((id) => {
              const color = getColorById(id)
              const active = id === currentColorId
              return (
                <View
                  key={id}
                  className={`color-picker-sheet__item${active ? ' color-picker-sheet__item--active' : ''}`}
                  onClick={() => onSelect(id)}
                >
                  <View
                    className='color-picker-sheet__swatch'
                    style={{ backgroundColor: color?.hex ?? '#ccc' }}
                  />
                  <Text className='color-picker-sheet__id'>{id}</Text>
                  <Text className='color-picker-sheet__name'>{getColorDisplayName(id)}</Text>
                </View>
              )
            })}
          </View>
          {visibleColorIds.length === 0 && (
            <Text className='color-picker-sheet__empty'>未找到匹配色号</Text>
          )}
        </ScrollView>
      </View>
    </View>
  )
}
