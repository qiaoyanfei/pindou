import { View, Text, ScrollView, Input } from '@tarojs/components'
import { useEffect, useMemo, useState } from 'react'
import { isEmptyCell } from '@/services/patternStats'
import { getColorById, getPalette } from '@/services/palette'
import { getColorDisplayName } from '@/utils/colorDisplayName'
import { countCellsWithColor, getPatternColorIds } from '@/utils/patternEdit'
import type { PatternResult } from '@/types'
import './index.scss'

export type ColorPickMode = 'single' | 'batch'

interface ColorPickerSheetProps {
  visible: boolean
  pattern: PatternResult
  currentColorId: string
  selectedCount: number
  initialPickMode?: ColorPickMode
  onSelect: (colorId: string, mode: ColorPickMode) => void
  onContinuePick: () => void
  onSelectAllSameColor: () => void
  onClearSelection: () => void
  onClose: () => void
}

export default function ColorPickerSheet({
  visible,
  pattern,
  currentColorId,
  selectedCount,
  initialPickMode = 'single',
  onSelect,
  onContinuePick,
  onSelectAllSameColor,
  onClearSelection,
  onClose,
}: ColorPickerSheetProps) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [pickMode, setPickMode] = useState<ColorPickMode>(initialPickMode)

  useEffect(() => {
    if (visible) {
      setPickMode(initialPickMode)
    }
  }, [visible, initialPickMode])

  const patternColorIds = useMemo(() => getPatternColorIds(pattern), [pattern])

  const filteredPaletteIds = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return getPalette().map((color) => color.id)
    return getPalette()
      .filter((color) => color.id.toUpperCase().includes(q))
      .map((color) => color.id)
  }, [query])

  const visibleColorIds = showAll ? filteredPaletteIds : patternColorIds
  const isEmpty = isEmptyCell(currentColorId)
  const currentHex = isEmpty ? '#f3f4f6' : (getColorById(currentColorId)?.hex ?? '#ccc')
  const currentLabel = isEmpty ? '背景格（未填色）' : currentColorId
  const sameColorCount = useMemo(
    () => countCellsWithColor(pattern, currentColorId),
    [pattern, currentColorId],
  )

  if (!visible) return null

  return (
    <View className='color-picker-sheet'>
      <View className='color-picker-sheet__mask' catchMove />
      <View className='color-picker-sheet__panel'>
        <View className='color-picker-sheet__panel-body'>
          <View className='color-picker-sheet__header'>
            <Text className='color-picker-sheet__title'>选择色号</Text>
            <View className='color-picker-sheet__close' onClick={onClose}>
              <Text>关闭</Text>
            </View>
          </View>

          <View className='color-picker-sheet__current'>
            <Text className='color-picker-sheet__current-label'>当前格子</Text>
            <View
              className='color-picker-sheet__current-swatch'
              style={{ backgroundColor: currentHex }}
            />
            <Text className='color-picker-sheet__current-id'>{currentLabel}</Text>
          </View>

          <View className='color-picker-sheet__mode'>
            <View
              className={`color-picker-sheet__mode-btn${pickMode === 'single' ? ' color-picker-sheet__mode-btn--active' : ''}`}
              onClick={() => setPickMode('single')}
            >
              <Text>单格改色</Text>
            </View>
            <View
              className={`color-picker-sheet__mode-btn${pickMode === 'batch' ? ' color-picker-sheet__mode-btn--active' : ''}`}
              onClick={() => setPickMode('batch')}
            >
              <Text>批量替换</Text>
            </View>
          </View>

          <View
            className={`color-picker-sheet__batch-panel${pickMode === 'batch' ? '' : ' color-picker-sheet__batch-panel--hidden'}`}
          >
            <Text className='color-picker-sheet__batch-hint'>
              已选 {selectedCount} 格，点选图纸可增删选区
            </Text>
            <View className='color-picker-sheet__batch-actions'>
              <View className='color-picker-sheet__batch-action' onClick={onContinuePick}>
                <Text>继续选格</Text>
              </View>
              <View className='color-picker-sheet__batch-action' onClick={onSelectAllSameColor}>
                <Text>全选同色({sameColorCount})</Text>
              </View>
              <View className='color-picker-sheet__batch-action' onClick={onClearSelection}>
                <Text>清空</Text>
              </View>
            </View>
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
            <View
              className={`color-picker-sheet__tab${showAll ? '' : ' color-picker-sheet__tab--active'}`}
              onClick={() => setShowAll(false)}
            >
              <Text>图纸色号</Text>
            </View>
            <View
              className={`color-picker-sheet__tab${showAll ? ' color-picker-sheet__tab--active' : ''}`}
              onClick={() => setShowAll(true)}
            >
              <Text>全部 221 色</Text>
            </View>
          </View>
        </View>

        <View className='color-picker-sheet__list-wrap'>
          <ScrollView scrollY className='color-picker-sheet__list' showScrollbar={false}>
            <View className='color-picker-sheet__grid'>
              {visibleColorIds.map((id) => {
                const color = getColorById(id)
                const active = id === currentColorId
                return (
                  <View
                    key={id}
                    className={`color-picker-sheet__item${active ? ' color-picker-sheet__item--active' : ''}`}
                    onClick={() => onSelect(id, pickMode)}
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
    </View>
  )
}
