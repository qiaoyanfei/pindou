import { View, Text, Switch, Slider, Image, Button, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import AppTabBar from '@/components/AppTabBar'
import {
  EXPORT_LIMITS,
  STYLE_MODE_DEFAULT_EXPORT_CELL_PX,
  STYLE_MODE_DEFAULT_LONG_EDGE,
  clampLongEdge,
  getLongEdgeLimits,
  normalizeConfig,
} from '@/utils/constants'
import { GENERATE_CONFIG_STORAGE_KEY, type PatternConfig } from '@/types'
import bannerCatArt from '@/assets/advanced-settings-banner-cat.svg'
import './index.scss'

const SLIDER_BLOCK_SIZE = 14

function clampExportCellPx(value: number): number {
  return Math.max(EXPORT_LIMITS.minCellPx, Math.min(EXPORT_LIMITS.maxCellPx, value))
}

export default function AdvancedSettingsPage() {
  const [config, setConfig] = useState<PatternConfig>(() => normalizeConfig())

  useDidShow(() => {
    const saved = Taro.getStorageSync(GENERATE_CONFIG_STORAGE_KEY)
    if (saved) {
      setConfig(normalizeConfig(saved))
    }
  })

  const longEdgeLimits = getLongEdgeLimits(config.styleMode)
  const recommendedLongEdge = STYLE_MODE_DEFAULT_LONG_EDGE[config.styleMode]

  const updateConfig = (patch: Partial<PatternConfig>) => {
    setConfig((prev) => normalizeConfig({ ...prev, ...patch }))
  }

  const adjustLongEdge = (delta: number) => {
    updateConfig({ longEdge: clampLongEdge(config.longEdge + delta, config.styleMode) })
  }

  const adjustExportCellPx = (delta: number) => {
    updateConfig({ exportCellPx: clampExportCellPx(config.exportCellPx + delta) })
  }

  const handleSave = () => {
    Taro.setStorageSync(GENERATE_CONFIG_STORAGE_KEY, config)
    Taro.showToast({ title: '设置已保存', icon: 'success' })
    setTimeout(() => {
      Taro.navigateBack()
    }, 400)
  }

  return (
    <View className='advanced-settings-page'>
      <ScrollView scrollY className='advanced-settings-page__scroll'>
        <View className='advanced-settings-page__content'>
          <View className='advanced-settings-page__banner'>
            <View className='advanced-settings-page__banner-text'>
              <Text className='advanced-settings-page__banner-title'>自由调整规格大小、色号、清晰度</Text>
              <Text className='advanced-settings-page__banner-desc'>打造更满意的图纸效果</Text>
            </View>
            <Image className='advanced-settings-page__banner-art' src={bannerCatArt} mode='aspectFit' />
          </View>

          <View className='advanced-settings-page__section-head'>
            <Text className='advanced-settings-page__section-title'>规格设置</Text>
          </View>

          <View className='advanced-settings-page__field'>
            <Text className='advanced-settings-page__field-label'>规格</Text>
            <View className='advanced-settings-page__control-group'>
              <View className='advanced-settings-page__slider-wrap'>
                <Slider
                  className='advanced-settings-page__slider'
                  min={longEdgeLimits.min}
                  max={longEdgeLimits.max}
                  step={1}
                  value={config.longEdge}
                  activeColor='#7c3aed'
                  backgroundColor='#e5e7eb'
                  blockColor='#7c3aed'
                  blockSize={SLIDER_BLOCK_SIZE}
                  showValue={false}
                  onChanging={(event) => updateConfig({ longEdge: event.detail.value })}
                  onChange={(event) => updateConfig({ longEdge: event.detail.value })}
                />
              </View>
              <View className='advanced-settings-page__stepper-col'>
                <View className='advanced-settings-page__stepper'>
                  <View className='advanced-settings-page__stepper-btn' onClick={() => adjustLongEdge(-1)}>
                    <Text>−</Text>
                  </View>
                  <Text className='advanced-settings-page__stepper-value'>{config.longEdge}</Text>
                  <View className='advanced-settings-page__stepper-btn' onClick={() => adjustLongEdge(1)}>
                    <Text>+</Text>
                  </View>
                </View>
                <Text className='advanced-settings-page__unit'>格</Text>
              </View>
              <View className='advanced-settings-page__scale'>
                <Text>{longEdgeLimits.min}格</Text>
                <Text>{recommendedLongEdge}格 (推荐)</Text>
                <Text>{longEdgeLimits.max}格</Text>
              </View>
            </View>
          </View>

          <View className='advanced-settings-page__field'>
            <Text className='advanced-settings-page__field-label'>
              导出清晰度：{config.exportCellPx}px/格
            </Text>
            <Text className='advanced-settings-page__field-hint'>
              清晰度越高，图片越大，可能导出失败。
            </Text>
            <View className='advanced-settings-page__control-group'>
              <View className='advanced-settings-page__slider-wrap'>
                <Slider
                  className='advanced-settings-page__slider'
                  min={EXPORT_LIMITS.minCellPx}
                  max={EXPORT_LIMITS.maxCellPx}
                  step={1}
                  value={config.exportCellPx}
                  activeColor='#7c3aed'
                  backgroundColor='#e5e7eb'
                  blockColor='#7c3aed'
                  blockSize={SLIDER_BLOCK_SIZE}
                  showValue={false}
                  onChanging={(event) => updateConfig({ exportCellPx: event.detail.value })}
                  onChange={(event) => updateConfig({ exportCellPx: event.detail.value })}
                />
              </View>
              <View className='advanced-settings-page__stepper-col'>
                <View className='advanced-settings-page__stepper'>
                  <View className='advanced-settings-page__stepper-btn' onClick={() => adjustExportCellPx(-1)}>
                    <Text>−</Text>
                  </View>
                  <Text className='advanced-settings-page__stepper-value'>{config.exportCellPx}</Text>
                  <View className='advanced-settings-page__stepper-btn' onClick={() => adjustExportCellPx(1)}>
                    <Text>+</Text>
                  </View>
                </View>
                <Text className='advanced-settings-page__unit'>px/格</Text>
              </View>
              <View className='advanced-settings-page__scale advanced-settings-page__scale--compact'>
                <Text>{EXPORT_LIMITS.minCellPx}</Text>
                <Text>{EXPORT_LIMITS.maxCellPx}</Text>
              </View>
            </View>
          </View>

          <View className='advanced-settings-page__toggle-row'>
            <View className='advanced-settings-page__toggle-text'>
              <Text className='advanced-settings-page__toggle-title'>显示色号</Text>
              <Text className='advanced-settings-page__toggle-desc'>在图纸上显示所使用的色号</Text>
            </View>
            <Switch
              checked={config.showColorCode}
              color='#7c3aed'
              onChange={(event) => updateConfig({ showColorCode: event.detail.value })}
            />
          </View>

          <View className='advanced-settings-page__toggle-row'>
            <View className='advanced-settings-page__toggle-text'>
              <Text className='advanced-settings-page__toggle-title'>显示网格线</Text>
              <Text className='advanced-settings-page__toggle-desc'>显示网格有助于对齐参考</Text>
            </View>
            <Switch
              checked={config.showGrid}
              color='#7c3aed'
              onChange={(event) => updateConfig({ showGrid: event.detail.value })}
            />
          </View>
        </View>
      </ScrollView>

      <View className='advanced-settings-page__footer'>
        <Button className='advanced-settings-page__save' onClick={handleSave}>
          保存设置
        </Button>
      </View>

      <AppTabBar active='generate' />
    </View>
  )
}
