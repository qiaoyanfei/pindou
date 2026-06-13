import { View, Text, Button, Canvas, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import AppTabBar from '@/components/AppTabBar'
import ImageUploader from '@/components/ImageUploader'
import AdvancedSettings from '@/components/AdvancedSettings'
import StyleModeSelector from '@/components/StyleModeSelector'
import { generatePatternFromImage } from '@/services/patternPipeline'
import {
  DEFAULT_CONFIG,
  STYLE_MODE_DEFAULT_EXPORT_CELL_PX,
  STYLE_MODE_DEFAULT_LONG_EDGE,
  STYLE_MODE_LABELS,
  getExportClarityLabel,
  normalizeConfig,
} from '@/utils/constants'
import { GENERATE_CONFIG_STORAGE_KEY, PATTERN_STORAGE_KEY, type PatternConfig, type StyleMode } from '@/types'
import backIcon from '@/assets/icons/back-chevron.svg'
import './index.scss'

function createInitialConfig(): PatternConfig {
  const styleMode: StyleMode = 'manga'
  return {
    ...DEFAULT_CONFIG,
    styleMode,
    longEdge: STYLE_MODE_DEFAULT_LONG_EDGE[styleMode],
    exportCellPx: STYLE_MODE_DEFAULT_EXPORT_CELL_PX[styleMode],
  }
}

export default function GeneratePage() {
  const [navLayout, setNavLayout] = useState({ paddingTop: 48, rowHeight: 32, headerRight: 96 })
  const [imagePath, setImagePath] = useState('')
  const [config, setConfig] = useState<PatternConfig>(createInitialConfig)
  const [loading, setLoading] = useState(false)

  useDidShow(() => {
    const saved = Taro.getStorageSync(GENERATE_CONFIG_STORAGE_KEY)
    if (saved) {
      setConfig(normalizeConfig(saved))
    }
  })

  useEffect(() => {
    const windowInfo = Taro.getWindowInfo()
    const menu = Taro.getMenuButtonBoundingClientRect()
    setNavLayout({
      paddingTop: menu.top,
      rowHeight: menu.height,
      headerRight: windowInfo.windowWidth - menu.left + 8,
    })
  }, [])

  const handleStyleModeChange = (styleMode: StyleMode) => {
    setConfig((prev) => {
      const next = normalizeConfig({
        ...prev,
        styleMode,
        longEdge: STYLE_MODE_DEFAULT_LONG_EDGE[styleMode],
        exportCellPx: STYLE_MODE_DEFAULT_EXPORT_CELL_PX[styleMode],
      })
      Taro.setStorageSync(GENERATE_CONFIG_STORAGE_KEY, next)
      return next
    })
  }

  const handleBack = () => {
    Taro.reLaunch({ url: '/pages/home/index' })
  }

  const handleGenerate = async () => {
    if (!imagePath) {
      Taro.showToast({ title: '请先上传图片', icon: 'none' })
      return
    }

    setLoading(true)
    Taro.showLoading({ title: '生成中...' })

    try {
      const pattern = await generatePatternFromImage(imagePath, config, 'process-canvas')
      Taro.setStorageSync(PATTERN_STORAGE_KEY, { pattern, config })
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
    <View className='generate-page'>
      <View
        className='generate-page__nav'
        style={{ paddingTop: `${navLayout.paddingTop}px` }}
      >
        <View
          className='generate-page__nav-inner'
          style={{
            height: `${navLayout.rowHeight}px`,
            paddingRight: `${navLayout.headerRight}px`,
          }}
        >
          <View className='generate-page__nav-back' onClick={handleBack}>
            <Image className='generate-page__nav-back-icon' src={backIcon} mode='aspectFit' />
          </View>
          <Text className='generate-page__nav-title'>生成图纸</Text>
        </View>
      </View>

      <View className='generate-page__body'>
        <ImageUploader imagePath={imagePath} onSelect={setImagePath} />

        <StyleModeSelector value={config.styleMode} onChange={handleStyleModeChange} />

        <View className='generate-page__config'>
          <Text className='generate-page__config-title'>当前配置</Text>
          <View className='generate-page__config-tags'>
            <Text className='generate-page__config-tag'>{STYLE_MODE_LABELS[config.styleMode]}</Text>
            <Text className='generate-page__config-tag'>{config.longEdge}格</Text>
            <Text className='generate-page__config-tag'>MARD 221 标准色</Text>
            <Text className='generate-page__config-tag'>
              {getExportClarityLabel(config.exportCellPx)}
            </Text>
          </View>
        </View>

        <AdvancedSettings config={config} />

        <Button
          className='generate-page__submit'
          type='primary'
          loading={loading}
          disabled={loading}
          onClick={handleGenerate}
        >
          下一步：预览图纸
        </Button>
      </View>

      <Canvas
        type='2d'
        id='process-canvas'
        canvasId='process-canvas'
        className='generate-page__hidden-canvas'
      />

      <AppTabBar active='generate' />
    </View>
  )
}
