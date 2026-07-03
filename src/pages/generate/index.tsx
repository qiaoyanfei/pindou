import { View, Text, Button, Canvas, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
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
import { handleImageProcessError } from '@/utils/mediaPickerError'
import { setStorageSafe } from '@/utils/localCache'
import { safeSwitchTab } from '@/utils/navigation'
import { GENERATE_TAB_CONVERT_EVENT, TAB_INDEX, updateTabBarSelected } from '@/utils/tabBar'
import { createConversionLoadingController } from '@/utils/conversionLoading'
import { useConversionButtonText } from '@/hooks/useConversionButtonText'
import {
  createDefaultConfigForStyleMode,
  getExportClarityLabel,
  STYLE_MODE_LABELS,
} from '@/utils/constants'
import {
  PATTERN_STORAGE_KEY,
  PUBLISH_STORAGE_KEY,
  GENERATE_PAGE_RESET_KEY,
  type PatternConfig,
  type StyleMode,
} from '@/types'
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

function hasRecoverablePattern(): boolean {
  try {
    const stored = Taro.getStorageSync(PATTERN_STORAGE_KEY) as { pattern?: unknown } | undefined
    return Boolean(stored?.pattern)
  } catch {
    return false
  }
}

function clearRecoverablePattern(): void {
  try {
    Taro.removeStorageSync(PATTERN_STORAGE_KEY)
    Taro.removeStorageSync(PUBLISH_STORAGE_KEY)
  } catch {
    // ignore
  }
}

function waitForLoadingPaint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60))
}

export default function GeneratePage() {
  const initialDraft = readDraftState()
  const [navLayout, setNavLayout] = useState({ paddingTop: 48, rowHeight: 32, headerRight: 96 })
  const [imagePath, setImagePath] = useState(initialDraft.imagePath)
  const [config, setConfig] = useState<PatternConfig>(initialDraft.config)
  const [loading, setLoading] = useState(false)
  const [authed, setAuthed] = useState(false)
  const recoverPromptShownRef = useRef(false)
  const conversionButton = useConversionButtonText(config.longEdge)

  const applyDraftState = (next: { imagePath: string; config: PatternConfig }) => {
    setImagePath(next.imagePath)
    setConfig(next.config)
  }

  useDidShow(async () => {
    updateTabBarSelected(TAB_INDEX.generate)
    const user = await requireAuthenticated('/pages/generate/index')
    if (!user) return
    setAuthed(true)

    if (Taro.getStorageSync(GENERATE_PAGE_RESET_KEY)) {
      Taro.removeStorageSync(GENERATE_PAGE_RESET_KEY)
      clearRecoverablePattern()
      recoverPromptShownRef.current = false
      applyDraftState(resetGenerateDraft())
      return
    }

    if (!recoverPromptShownRef.current && hasRecoverablePattern()) {
      recoverPromptShownRef.current = true
      const result = await Taro.showModal({
        title: '继续未完成图纸？',
        content: '检测到上次未发布成功的图纸，可以继续预览和编辑。',
        confirmText: '继续',
        cancelText: '重新转换',
      })
      if (result.confirm) {
        Taro.navigateTo({ url: '/pages/preview/index' })
        return
      }
      clearRecoverablePattern()
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
    safeSwitchTab('/pages/home/index')
  }

  const handleGenerate = useCallback(async () => {
    if (loading) return

    if (!imagePath) {
      Taro.showToast({ title: '请先上传图片', icon: 'none' })
      return
    }

    syncGenerateDraftFromPage(imagePath, config)
    setLoading(true)
    conversionButton.start()
    const loadingController = createConversionLoadingController()
    loadingController.start()

    try {
      const pattern = await generatePatternFromImage(imagePath, config, 'process-canvas', async (message) => {
        loadingController.show(message)
        await waitForLoadingPaint()
      })
      setStorageSafe(PATTERN_STORAGE_KEY, { pattern, config })
      Taro.navigateTo({ url: '/pages/preview/index' })
    } catch (error) {
      handleImageProcessError(error, '转换失败')
    } finally {
      loadingController.stop()
      conversionButton.stop()
      setLoading(false)
    }
  }, [config, conversionButton, imagePath, loading])

  useEffect(() => {
    const handleConvertFromTab = () => {
      void handleGenerate()
    }
    Taro.eventCenter.on(GENERATE_TAB_CONVERT_EVENT, handleConvertFromTab)
    return () => {
      Taro.eventCenter.off(GENERATE_TAB_CONVERT_EVENT, handleConvertFromTab)
    }
  }, [handleGenerate])

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
          <Text className='generate-page__nav-title'>制作图纸</Text>
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
          {conversionButton.buttonText}
        </Button>
      </View>

      <Canvas
        type='2d'
        id='process-canvas'
        canvasId='process-canvas'
        className='generate-page__hidden-canvas'
      />
    </View>
  )
}
