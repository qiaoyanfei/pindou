import { View, Text, Button, Canvas } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import ImageUploader from '@/components/ImageUploader'
import AdvancedSettings from '@/components/AdvancedSettings'
import StyleModeSelector from '@/components/StyleModeSelector'
import { generatePatternFromImage } from '@/services/patternPipeline'
import {
  DEFAULT_CONFIG,
  STYLE_MODE_DEFAULT_EXPORT_CELL_PX,
  STYLE_MODE_DEFAULT_LONG_EDGE,
  STYLE_MODE_LABELS,
} from '@/utils/constants'
import { PATTERN_STORAGE_KEY, type PatternConfig, type StyleMode } from '@/types'
import './index.scss'

export default function IndexPage() {
  const [imagePath, setImagePath] = useState('')
  const [config, setConfig] = useState<PatternConfig>({ ...DEFAULT_CONFIG })
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleStyleModeChange = (styleMode: StyleMode) => {
    setConfig((prev) => ({
      ...prev,
      styleMode,
      longEdge: STYLE_MODE_DEFAULT_LONG_EDGE[styleMode],
      exportCellPx: STYLE_MODE_DEFAULT_EXPORT_CELL_PX[styleMode],
    }))
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
    <View className='index-page'>
      <View className='index-page__hero'>
        <Text className='index-page__title'>拼豆豆</Text>
        <Text className='index-page__subtitle'>上传图片，一键生成 MARD 221 拼豆豆图纸</Text>
      </View>

      <ImageUploader imagePath={imagePath} onSelect={setImagePath} />

      <StyleModeSelector value={config.styleMode} onChange={handleStyleModeChange} />

      <View className='index-page__defaults'>
        {STYLE_MODE_LABELS[config.styleMode]} · MARD221 · 长边 {config.longEdge} 格 · 本地处理
      </View>

      <AdvancedSettings
        config={config}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
        onChange={setConfig}
      />

      <Button
        className='index-page__submit'
        type='primary'
        loading={loading}
        disabled={loading}
        onClick={handleGenerate}
      >
        生成图纸
      </Button>

      <Canvas
        type='2d'
        id='process-canvas'
        canvasId='process-canvas'
        className='index-page__hidden-canvas'
      />
    </View>
  )
}
