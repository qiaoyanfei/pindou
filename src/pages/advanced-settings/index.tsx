import { View, Text, Switch, Slider, Image, Button, ScrollView, Canvas } from '@tarojs/components'
import Taro, { useDidShow, useUnload } from '@tarojs/taro'
import { useRef, useState } from 'react'
import AppTabBar from '@/components/AppTabBar'
import { generatePatternFromImage } from '@/services/patternPipeline'
import { getGenerateDraft, updateGenerateConfig } from '@/services/generateSession'
import {
  EXPORT_LIMITS,
  clampLongEdge,
  getLongEdgeLimits,
  normalizeConfig,
} from '@/utils/constants'
import { PATTERN_STORAGE_KEY, type PatternConfig } from '@/types'
import bannerImage from '@/assets/advanced-settings-banner.jpg'
import './index.scss'

const SLIDER_BLOCK_SIZE = 14
const PROCESS_CANVAS_ID = 'advanced-process-canvas'

function clampExportCellPx(value: number): number {
  return Math.max(EXPORT_LIMITS.minCellPx, Math.min(EXPORT_LIMITS.maxCellPx, value))
}

export default function AdvancedSettingsPage() {
  const [config, setConfig] = useState<PatternConfig>(() => normalizeConfig())
  const [imagePath, setImagePath] = useState('')
  const [loading, setLoading] = useState(false)
  const configRef = useRef(config)

  configRef.current = config

  const persistDraft = () => {
    updateGenerateConfig(configRef.current)
  }

  useDidShow(() => {
    const draft = getGenerateDraft()
    if (!draft?.imagePath) {
      Taro.showToast({ title: '请先上传图片', icon: 'none' })
      setTimeout(() => Taro.navigateBack(), 800)
      return
    }

    setImagePath(draft.imagePath)
    setConfig(normalizeConfig(draft.config))
    configRef.current = normalizeConfig(draft.config)
  })

  useUnload(() => {
    persistDraft()
  })

  const longEdgeLimits = getLongEdgeLimits(config.styleMode)

  const updateConfig = (patch: Partial<PatternConfig>) => {
    setConfig((prev) => {
      const next = normalizeConfig({ ...prev, ...patch })
      configRef.current = next
      updateGenerateConfig(next)
      return next
    })
  }

  const adjustLongEdge = (delta: number) => {
    updateConfig({ longEdge: clampLongEdge(config.longEdge + delta, config.styleMode) })
  }

  const adjustExportCellPx = (delta: number) => {
    updateConfig({ exportCellPx: clampExportCellPx(config.exportCellPx + delta) })
  }

  const handlePreview = async () => {
    if (!imagePath || loading) return

    persistDraft()
    setLoading(true)
    Taro.showLoading({ title: '生成中...' })

    try {
      const pattern = await generatePatternFromImage(imagePath, configRef.current, PROCESS_CANVAS_ID)
      Taro.setStorageSync(PATTERN_STORAGE_KEY, { pattern, config: configRef.current })
      Taro.hideLoading()
      Taro.navigateTo({ url: '/pages/preview/index' })
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({
        title: error instanceof Error ? error.message : '生成失败',
        icon: 'none',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className='advanced-settings-page'>
      <ScrollView scrollY className='advanced-settings-page__scroll'>
        <View className='advanced-settings-page__banner'>
          <Image className='advanced-settings-page__banner-image' src={bannerImage} mode='widthFix' />
        </View>

        <View className='advanced-settings-page__content'>
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
                <Text>{longEdgeLimits.min}</Text>
                <Text>{longEdgeLimits.max}</Text>
              </View>
            </View>
          </View>

          <View className='advanced-settings-page__field'>
            <Text className='advanced-settings-page__field-label'>清晰度</Text>
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
        <Button
          className='advanced-settings-page__preview'
          loading={loading}
          disabled={loading}
          onClick={handlePreview}
        >
          预览图片
        </Button>
      </View>

      <Canvas
        type='2d'
        id={PROCESS_CANVAS_ID}
        canvasId={PROCESS_CANVAS_ID}
        className='advanced-settings-page__hidden-canvas'
      />

      <AppTabBar active='generate' />
    </View>
  )
}
