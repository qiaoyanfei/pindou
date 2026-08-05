import { View, Text, ScrollView, Input, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { isEmptyCell } from '@/services/patternStats'
import { getColorById, getPalette } from '@/services/palette'
import { countCellsWithColor, getPatternColorIds } from '@/utils/patternEdit'
import { getBeadSwatchStyle, isTransparentBeadId } from '@/utils/transparentBead'
import type { PatternResult } from '@/types'
import searchIcon from '@/assets/icons/search.svg'
import closeIcon from '@/assets/icons/editor-close.svg'
import './index.scss'

type EditMode = 'color' | 'erase'
type ColorPickerTab = 'pattern' | 'all'

interface ColorPickerSheetProps {
  visible: boolean
  pattern: PatternResult
  currentColorId: string
  selectedColorIds: string[]
  selectedCount: number
  /** brush：只选画笔颜色，不展示擦除/选区操作 */
  variant?: 'selection' | 'brush'
  onConfirmColor: (colorId: string) => void
  onConfirmErase: () => void
  onSelectAllSameColor: (colorId: string) => void
  onClearSelection: () => void
  onClose: () => void
}

function formatColorLabel(colorId: string): string {
  return isEmptyCell(colorId) ? '空白' : colorId
}

function colorIdToSwatchStyle(colorId: string): Record<string, string> {
  if (isEmptyCell(colorId)) return { backgroundColor: '#f3f4f6' }
  return getBeadSwatchStyle(colorId, getColorById(colorId)?.hex)
}

const STATUS_COLOR_ID_LIMIT = 4
const MODE_PANEL_ID = 'color-picker-mode-panel'
const MODE_PANEL_CONTENT_ID = 'color-picker-mode-panel-content'
const MODE_PANEL_MAX_HEIGHT = 512
const SUMMARY_HEIGHT = 104
/** mode-panel-content 内固定区：padding-top + search + tabs + list margin */
const COLOR_MODE_CHROME = 20 + 72 + 16 + 48 + 16
const COLOR_LIST_FALLBACK_HEIGHT = 240
const COLOR_LIST_MIN_HEIGHT = 180
const ERASE_MAIN_FALLBACK_HEIGHT = 240

function formatColorIdList(colorIds: string[], limit = STATUS_COLOR_ID_LIMIT): string {
  if (colorIds.length === 0) return '—'
  const labels = colorIds.slice(0, limit).map(formatColorLabel)
  const hiddenCount = colorIds.length - limit
  if (hiddenCount > 0) {
    return `${labels.join('、')} 等${colorIds.length}色`
  }
  return labels.join('、')
}

export default function ColorPickerSheet({
  visible,
  pattern,
  currentColorId,
  selectedColorIds,
  selectedCount,
  variant = 'selection',
  onConfirmColor,
  onConfirmErase,
  onSelectAllSameColor,
  onClearSelection,
  onClose,
}: ColorPickerSheetProps) {
  const brushOnly = variant === 'brush'
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<ColorPickerTab>('pattern')
  const [editMode, setEditMode] = useState<EditMode>('color')
  const [pendingColorId, setPendingColorId] = useState('')
  const [colorListScrollHeight, setColorListScrollHeight] = useState(COLOR_LIST_FALLBACK_HEIGHT)
  const [eraseMainHeight, setEraseMainHeight] = useState(ERASE_MAIN_FALLBACK_HEIGHT)
  const [lockedModePanelHeight, setLockedModePanelHeight] = useState<number | null>(null)

  useEffect(() => {
    if (!visible) return
    setQuery('')
    setActiveTab('pattern')
    setEditMode('color')
    setPendingColorId(brushOnly && currentColorId ? currentColorId : '')
    setLockedModePanelHeight(null)
    setColorListScrollHeight(COLOR_LIST_FALLBACK_HEIGHT)
    setEraseMainHeight(ERASE_MAIN_FALLBACK_HEIGHT)
  }, [visible, brushOnly, currentColorId])

  const showSummary = !brushOnly && (editMode === 'erase' || Boolean(pendingColorId))

  const patternColorIds = useMemo(() => getPatternColorIds(pattern), [pattern])

  const filterColorIdsByQuery = (colorIds: string[], rawQuery: string): string[] => {
    const q = rawQuery.trim().toUpperCase()
    if (!q) return colorIds
    return colorIds.filter((id) => id.toUpperCase().includes(q))
  }

  const filteredPatternColorIds = useMemo(
    () => filterColorIdsByQuery(patternColorIds, query),
    [patternColorIds, query],
  )

  const filteredPaletteIds = useMemo(
    () => filterColorIdsByQuery(getPalette().map((color) => color.id), query),
    [query],
  )

  const visibleColorIds = activeTab === 'all' ? filteredPaletteIds : filteredPatternColorIds
  const searchPlaceholder = activeTab === 'pattern' ? '搜索图纸色号' : '搜索全部色号'
  const statusColorIds = selectedColorIds.length > 0 ? selectedColorIds : [currentColorId]
  const statusColorLabel = formatColorIdList(statusColorIds)
  const visibleStatusColorIds = statusColorIds.slice(0, STATUS_COLOR_ID_LIMIT)
  const hiddenStatusColorCount = Math.max(statusColorIds.length - STATUS_COLOR_ID_LIMIT, 0)
  const sameColorOptions = useMemo(
    () => statusColorIds.map((colorId) => ({
      colorId,
      count: countCellsWithColor(pattern, colorId),
    })),
    [pattern, statusColorIds],
  )
  const currentSwatchStyle = colorIdToSwatchStyle(currentColorId)
  const pendingSwatchStyle = pendingColorId
    ? colorIdToSwatchStyle(pendingColorId)
    : { backgroundColor: '#f3f4f6' }

  const lockModePanelHeight = useCallback(() => {
    if (!visible) return
    Taro.createSelectorQuery()
      .select(`#${MODE_PANEL_ID}`)
      .boundingClientRect()
      .exec((res) => {
        const height = res?.[0]?.height
        if (typeof height !== 'number' || height <= 0) return
        setLockedModePanelHeight((prev) => {
          const next = Math.min(MODE_PANEL_MAX_HEIGHT, Math.round(height))
          return prev == null ? next : Math.max(prev, next)
        })
      })
  }, [visible])

  useEffect(() => {
    if (!visible) return
    lockModePanelHeight()
    const timer = setTimeout(lockModePanelHeight, 80)
    return () => clearTimeout(timer)
  }, [visible, lockModePanelHeight])

  useEffect(() => {
    if (!visible || lockedModePanelHeight == null) return
    const summarySlot = showSummary ? SUMMARY_HEIGHT : 0
    const contentHeight = lockedModePanelHeight - summarySlot

    if (editMode === 'color') {
      const nextHeight = Math.floor(contentHeight - COLOR_MODE_CHROME)
      setColorListScrollHeight(Math.max(COLOR_LIST_MIN_HEIGHT, nextHeight))
      return
    }

    const nextEraseHeight = Math.floor(contentHeight - 20)
    setEraseMainHeight(Math.max(COLOR_LIST_MIN_HEIGHT, nextEraseHeight))
  }, [visible, lockedModePanelHeight, showSummary, editMode])

  if (!visible) return null

  const handleConfirm = () => {
    if (brushOnly) {
      if (!pendingColorId) return
      onConfirmColor(pendingColorId)
      return
    }
    if (selectedCount === 0) return
    if (editMode === 'erase') {
      onConfirmErase()
      return
    }
    if (!pendingColorId) {
      return
    }
    onConfirmColor(pendingColorId)
  }

  const confirmDisabled = brushOnly
    ? !pendingColorId
    : selectedCount === 0 || (editMode === 'color' && !pendingColorId)

  return (
    <View className={`color-picker-sheet${brushOnly ? ' color-picker-sheet--brush' : ''}`}>
      <View className='color-picker-sheet__mask' onClick={onClose} catchMove />
      <View className='color-picker-sheet__panel' onClick={(event) => event.stopPropagation()}>
        <View className='color-picker-sheet__header'>
          <Text className='color-picker-sheet__title'>{brushOnly ? '选择画笔颜色' : '编辑格子'}</Text>
          <View className='color-picker-sheet__close' onClick={onClose}>
            <Image className='color-picker-sheet__close-icon' src={closeIcon} mode='aspectFit' />
          </View>
        </View>

        {!brushOnly ? (
        <View className='color-picker-sheet__selection-card'>
          <View className='color-picker-sheet__selection-head'>
            {statusColorIds.length > 1 ? (
              <View className='color-picker-sheet__status-swatches'>
                {visibleStatusColorIds.map((colorId) => (
                  <View
                    key={colorId}
                    className='color-picker-sheet__status-swatch color-picker-sheet__status-swatch--mini'
                    style={colorIdToSwatchStyle(colorId)}
                  />
                ))}
                {hiddenStatusColorCount > 0 ? (
                  <Text className='color-picker-sheet__status-more'>+{hiddenStatusColorCount}</Text>
                ) : null}
              </View>
            ) : (
              <View
                className='color-picker-sheet__status-swatch'
                style={currentSwatchStyle}
              />
            )}
            <Text className='color-picker-sheet__status-text'>
              已选 {selectedCount} 格 · {statusColorLabel}
            </Text>
            <View
              className={`color-picker-sheet__selection-clear${selectedCount > 0 ? ' is-enabled' : ''}`}
              onClick={() => {
                if (selectedCount > 0) onClearSelection()
              }}
            >
              <Text className='color-picker-sheet__selection-clear-text'>清空</Text>
            </View>
          </View>

          <View className='color-picker-sheet__same-color-panel'>
            <Text className='color-picker-sheet__same-color-label'>按色号全选</Text>
            <ScrollView scrollX className='color-picker-sheet__same-color-scroll' showScrollbar={false}>
              <View className='color-picker-sheet__same-color-list'>
                {sameColorOptions.map(({ colorId, count }) => (
                  <View
                    key={colorId}
                    className='color-picker-sheet__same-color-chip'
                    onClick={() => onSelectAllSameColor(colorId)}
                  >
                    <View
                      className='color-picker-sheet__same-color-chip-swatch'
                      style={colorIdToSwatchStyle(colorId)}
                    />
                    <Text className='color-picker-sheet__same-color-chip-text'>
                      {formatColorLabel(colorId)}({count})
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
        ) : (
          <View className='color-picker-sheet__brush-current'>
            <View
              className='color-picker-sheet__status-swatch'
              style={currentSwatchStyle}
            />
            <Text className='color-picker-sheet__status-text'>
              当前画笔 · {formatColorLabel(currentColorId)}
            </Text>
          </View>
        )}

        {!brushOnly ? (
        <View className='color-picker-sheet__mode-tabs'>
          <View
            className={`color-picker-sheet__mode-tab${editMode === 'color' ? ' color-picker-sheet__mode-tab--active' : ''}`}
            onClick={() => setEditMode('color')}
          >
            <Text>换色</Text>
          </View>
          <View
            className={`color-picker-sheet__mode-tab${editMode === 'erase' ? ' color-picker-sheet__mode-tab--active' : ''}`}
            onClick={() => setEditMode('erase')}
          >
            <Text>擦除</Text>
          </View>
        </View>
        ) : null}

        <View
          id={MODE_PANEL_ID}
          className={`color-picker-sheet__mode-panel${lockedModePanelHeight != null ? ' color-picker-sheet__mode-panel--locked' : ''}`}
          style={lockedModePanelHeight != null ? { height: `${lockedModePanelHeight}px` } : undefined}
        >
          <View className='color-picker-sheet__mode-panel-content' id={MODE_PANEL_CONTENT_ID}>
            {editMode === 'color' || brushOnly ? (
              <>
                <View className='color-picker-sheet__search'>
                  <Image className='color-picker-sheet__search-icon' src={searchIcon} mode='aspectFit' />
                  <Input
                    className='color-picker-sheet__search-input'
                    placeholder={searchPlaceholder}
                    placeholderClass='color-picker-sheet__search-input-placeholder'
                    placeholderStyle='font-size:28rpx;line-height:72rpx;color:#9ca3af'
                    value={query}
                    onInput={(event) => setQuery(event.detail.value)}
                  />
                </View>

                <View className='color-picker-sheet__tabs'>
                  <View
                    className={`color-picker-sheet__tab${activeTab === 'pattern' ? ' color-picker-sheet__tab--active' : ''}`}
                    onClick={() => setActiveTab('pattern')}
                  >
                    <Text>图纸色号</Text>
                  </View>
                  <View
                    className={`color-picker-sheet__tab${activeTab === 'all' ? ' color-picker-sheet__tab--active' : ''}`}
                    onClick={() => setActiveTab('all')}
                  >
                    <Text>全部 221 色</Text>
                  </View>
                </View>

                <ScrollView
                  scrollY
                  enhanced
                  showScrollbar={false}
                  className='color-picker-sheet__list'
                  style={{ height: `${colorListScrollHeight}px` }}
                >
                  <View className='color-picker-sheet__grid'>
                    {visibleColorIds.map((id) => {
                      const color = getColorById(id)
                      const active = id === pendingColorId
                      return (
                        <View
                          key={id}
                          className={`color-picker-sheet__item${active ? ' color-picker-sheet__item--active' : ''}`}
                          onClick={() => {
                            if (brushOnly) {
                              onConfirmColor(id)
                              return
                            }
                            setPendingColorId(id)
                          }}
                        >
                          <View
                            className='color-picker-sheet__swatch'
                            style={getBeadSwatchStyle(id, color?.hex)}
                          >
                            {active ? (
                              <Text
                                className={`color-picker-sheet__check${isTransparentBeadId(id) ? ' color-picker-sheet__check--dark' : ''}`}
                              >
                                ✓
                              </Text>
                            ) : null}
                          </View>
                          <Text className='color-picker-sheet__id'>{id}</Text>
                        </View>
                      )
                    })}
                  </View>
                  {visibleColorIds.length === 0 && (
                    <Text className='color-picker-sheet__empty'>未找到匹配色号</Text>
                  )}
                </ScrollView>
              </>
            ) : (
              <ScrollView
                scrollY
                enhanced
                showScrollbar={false}
                className='color-picker-sheet__erase-main'
                style={{ height: `${eraseMainHeight}px` }}
              >
                <View className='color-picker-sheet__erase-card'>
                  <Text className='color-picker-sheet__erase-title'>擦除色号</Text>
                  <Text className='color-picker-sheet__erase-desc'>选中格子将变为空白，可稍后重新填色</Text>
                  <View className='color-picker-sheet__erase-preview'>
                    <View className='color-picker-sheet__erase-preview-side'>
                      <View className='color-picker-sheet__erase-preview-badge'>
                        {statusColorIds.length === 1 ? (
                          <View
                            className='color-picker-sheet__erase-preview-swatch'
                            style={currentSwatchStyle}
                          />
                        ) : (
                          <View className='color-picker-sheet__erase-preview-swatches'>
                            {visibleStatusColorIds.map((colorId) => (
                              <View
                                key={colorId}
                                className='color-picker-sheet__erase-preview-swatch color-picker-sheet__erase-preview-swatch--mini'
                                style={colorIdToSwatchStyle(colorId)}
                              />
                            ))}
                          </View>
                        )}
                        <Text className='color-picker-sheet__erase-preview-count'>{selectedCount} 格</Text>
                        <Text className='color-picker-sheet__erase-preview-label'>当前选中</Text>
                      </View>
                    </View>
                    <View className='color-picker-sheet__erase-preview-arrow-wrap'>
                      <Text className='color-picker-sheet__erase-preview-arrow'>→</Text>
                    </View>
                    <View className='color-picker-sheet__erase-preview-side'>
                      <View className='color-picker-sheet__erase-preview-badge color-picker-sheet__erase-preview-badge--empty'>
                        <View className='color-picker-sheet__erase-preview-empty' />
                        <Text className='color-picker-sheet__erase-preview-count'>空白</Text>
                        <Text className='color-picker-sheet__erase-preview-label'>擦除后</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>

          {showSummary ? (
            <View className='color-picker-sheet__summary'>
              {brushOnly ? (
                <>
                  <Text className='color-picker-sheet__summary-text'>
                    画笔将使用 {pendingColorId}
                  </Text>
                  <View className='color-picker-sheet__summary-row'>
                    <View
                      className={`color-picker-sheet__summary-to${pendingColorId && isTransparentBeadId(pendingColorId) ? ' color-picker-sheet__summary-to--transparent' : ''}`}
                      style={pendingSwatchStyle}
                    >
                      <Text>{pendingColorId}</Text>
                    </View>
                  </View>
                </>
              ) : editMode === 'color' ? (
                <>
                  <Text className='color-picker-sheet__summary-text'>
                    已选格子统一换为 {pendingColorId}
                  </Text>
                  <View className='color-picker-sheet__summary-row'>
                    <Text className='color-picker-sheet__summary-count'>{selectedCount}格</Text>
                    <Text className='color-picker-sheet__summary-arrow'>→</Text>
                    <View
                      className={`color-picker-sheet__summary-to${pendingColorId && isTransparentBeadId(pendingColorId) ? ' color-picker-sheet__summary-to--transparent' : ''}`}
                      style={pendingSwatchStyle}
                    >
                      <Text>{pendingColorId}</Text>
                    </View>
                  </View>
                </>
              ) : (
                <Text className='color-picker-sheet__summary-text color-picker-sheet__summary-text--hint'>
                  确认后将清除 {selectedCount} 格的色号
                </Text>
              )}
            </View>
          ) : null}
        </View>

        {!brushOnly ? (
          <View className='color-picker-sheet__footer'>
            <View className='color-picker-sheet__footer-btn color-picker-sheet__footer-btn--ghost' onClick={onClose}>
              <Text>取消</Text>
            </View>
            <View
              className={`color-picker-sheet__footer-btn color-picker-sheet__footer-btn--primary${confirmDisabled ? ' is-disabled' : ''}`}
              onClick={handleConfirm}
            >
              <Text>{editMode === 'erase' ? '确认擦除' : '确认换色'}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  )
}
