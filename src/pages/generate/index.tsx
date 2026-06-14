import { View, Text, Button, Canvas, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import AppTabBar from '@/components/AppTabBar'
import ImageUploader from '@/components/ImageUploader'
import AdvancedSettings from '@/components/AdvancedSettings'
import StyleModeSelector from '@/components/StyleModeSelector'
import { generatePatternFromImage } from '@/services/patternPipeline'
import {
  getGenerateDraft,
  resetGenerateDraft,
  setGenerateDraft,
  setGenerateImageWithDefaultConfig,
  syncGenerateDraftFromPage,
} from '@/services/generateSession'
import { requireAuthenticated } from '@/services/session'
import { safeRedirect } from '@/utils/navigation'
import {
  createDefaultConfigForStyleMode,
  getExportClarityLabel,
  STYLE_MODE_LABELS,
} from '@/utils/constants'
import { PATTERN_STORAGE_KEY, GENERATE_PAGE_RESET_KEY, type PatternConfig, type StyleMode } from '@/types'
import backIcon from '@/assets/icons/back-chevron.svg'
import './index.scss'

function createInitialConfig(): PatternConfig {
  return createDefaultConfigForStyleMode('manga')
}

function readDraftState(): { imagePath: string; config: PatternConfig } {
  const draft = getGenerateDraft()
  if (draft) {
    return {
      imagePath: draft.imagePath,
      config: draft.config,
    }
  }
  return {
    imagePath: '',
    config: createInitialConfig(),
  }
}

export default function GeneratePage() {
  const initialDraft = readDraftState()
  const [navLayout, setNavLayout] = useState({ paddingTop: 48, rowHeight: 32, headerRight: 96 })
  const [imagePath, setImagePath] = useState(initialDraft.imagePath)
  const [config, setConfig] = useState<PatternConfig>(initialDraft.config)
  const [loading, setLoading] = useState(false)
  const [authed, setAuthed] = useState(false)

  const applyDraftState = (next: { imagePath: string; config: PatternConfig }) => {
    setImagePath(next.imagePath)
    setConfig(next.config)
  }

  useDidShow(async () => {
    const user = await requireAuthenticated('/pages/generate/index')
    if (!user) return
    setAuthed(true)

    if (Taro.getStorageSync(GENERATE_PAGE_RESET_KEY)) {
      Taro.removeStorageSync(GENERATE_PAGE_RESET_KEY)
      applyDraftState(resetGenerateDraft())
      return
    }

    const draft = getGenerateDraft()
    if (draft) {
      applyDraftState(draft)
    }
  })

  const handleImageSelect = (path: string) => {
    const next = setGenerateImageWithDefaultConfig(path, config.styleMode)
    applyDraftState(next)
  }

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
    const nextConfig = createDefaultConfigForStyleMode(styleMode)
    setGenerateDraft(imagePath, nextConfig)
    setConfig(nextConfig)
  }

  const handleBack = () => {
    safeRedirect('/pages/home/index')
  }

  const handleGenerate = async () => {
    if (!imagePath) {
      Taro.showToast({ title: '请先上传图片', icon: 'none' })
      return
    }

    syncGenerateDraftFromPage(imagePath, config)
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

  if (!authed) {
    return null
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
        <ImageUploader imagePath={imagePath} onSelect={handleImageSelect} />

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

        <AdvancedSettings config={config} imagePath={imagePath} />

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
