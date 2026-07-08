import { View, Text, Button, Canvas, Image, Slider, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import ImageUploader from '@/components/ImageUploader'
import StyleModeSelector from '@/components/StyleModeSelector'
import { generatePatternFromImage } from '@/services/patternPipeline'
import {
  getGenerateDraft,
  persistGenerateSourceImage,
  resetGenerateDraft,
  setGenerateDraft,
  setGenerateImageWithDefaultConfig,
  syncGenerateDraftFromPage,
} from '@/services/generateSession'
import {
  getFallbackAutoLongEdge,
  recommendLongEdgeFromImage,
} from '@/services/gridRecommendation'
import { requireAuthenticated } from '@/services/session'
import { handleImageProcessError } from '@/utils/mediaPickerError'
import { setStorageSafe } from '@/utils/localCache'
import { safeSwitchTab } from '@/utils/navigation'
import { GENERATE_TAB_CONVERT_EVENT, TAB_INDEX, updateTabBarSelected } from '@/utils/tabBar'
import { createConversionLoadingController } from '@/utils/conversionLoading'
import {
  clampLongEdge,
  createDefaultConfigForStyleMode,
  getLongEdgeLimits,
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

const GRID_PRESETS: Record<StyleMode, number[]> = {
  portrait: [60, 90, 120, 160],
  manga: [29, 52, 78, 104],
}

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
  const [recommendingGrid, setRecommendingGrid] = useState(false)
  const [gridSettingsOpen, setGridSettingsOpen] = useState(true)
  const [manualLongEdge, setManualLongEdge] = useState<number | null>(null)
  const [manualLongEdgeInput, setManualLongEdgeInput] = useState('')
  const [authed, setAuthed] = useState(false)
  const recoverPromptShownRef = useRef(false)
  const autoGridRequestRef = useRef(0)

  const applyDraftState = (next: { imagePath: string; config: PatternConfig }) => {
    setImagePath(next.imagePath)
    setConfig(next.config)
    setManualLongEdge(null)
    setManualLongEdgeInput('')
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

  const applyAutoGridRecommendation = useCallback(async (
    path: string,
    styleMode: StyleMode,
    baseConfig: PatternConfig,
  ) => {
    const requestId = autoGridRequestRef.current + 1
    autoGridRequestRef.current = requestId
    setRecommendingGrid(true)

    try {
      const recommendedLongEdge = await recommendLongEdgeFromImage(path, styleMode, 'process-canvas')
      if (autoGridRequestRef.current !== requestId) return

      const nextConfig = {
        ...baseConfig,
        styleMode,
        longEdge: recommendedLongEdge,
      }
      setGenerateDraft(path, nextConfig)
      setConfig(nextConfig)
    } catch {
      if (autoGridRequestRef.current !== requestId) return

      const nextConfig = {
        ...baseConfig,
        styleMode,
        longEdge: getFallbackAutoLongEdge(styleMode),
      }
      setGenerateDraft(path, nextConfig)
      setConfig(nextConfig)
    } finally {
      if (autoGridRequestRef.current === requestId) {
        setRecommendingGrid(false)
      }
    }
  }, [])

  const updateManualLongEdge = (value: number) => {
    const nextLongEdge = clampLongEdge(value, config.styleMode)
    const nextConfig = {
      ...config,
      longEdge: nextLongEdge,
    }
    autoGridRequestRef.current += 1
    setRecommendingGrid(false)
    setManualLongEdge(nextLongEdge)
    setManualLongEdgeInput(String(nextLongEdge))
    setGenerateDraft(imagePath, nextConfig)
    setConfig(nextConfig)
  }

  const resetManualLongEdge = () => {
    setManualLongEdge(null)
    setManualLongEdgeInput('')
    if (imagePath) {
      void applyAutoGridRecommendation(imagePath, config.styleMode, config)
    }
  }

  const adjustManualLongEdge = (delta: number) => {
    const base = manualLongEdge ?? config.longEdge
    updateManualLongEdge(base + delta)
  }

  const handleManualLongEdgeInput = (value: string) => {
    const normalized = value.replace(/[^\d]/g, '')
    setManualLongEdgeInput(normalized)
    if (!normalized) {
      setManualLongEdge(null)
      setManualLongEdgeInput('')
      if (imagePath) {
        void applyAutoGridRecommendation(imagePath, config.styleMode, config)
      }
      return
    }
    updateManualLongEdge(Number(normalized))
  }

  const handleImageSelect = (path: string) => {
    const sourcePath = persistGenerateSourceImage(path)
    const next = setGenerateImageWithDefaultConfig(sourcePath, config.styleMode)
    setManualLongEdge(null)
    setManualLongEdgeInput('')
    applyDraftState(next)
    void applyAutoGridRecommendation(sourcePath, next.config.styleMode, next.config)
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
    setManualLongEdge(null)
    setManualLongEdgeInput('')
    setGenerateDraft(imagePath, nextConfig)
    setConfig(nextConfig)
    if (imagePath) {
      void applyAutoGridRecommendation(imagePath, styleMode, nextConfig)
    }
  }

  const handleBack = () => {
    safeSwitchTab('/pages/home/index')
  }

  const handleGenerate = useCallback(async () => {
    if (loading || recommendingGrid) return

    if (!imagePath) {
      Taro.showToast({ title: '请先上传图片', icon: 'none' })
      return
    }

    syncGenerateDraftFromPage(imagePath, config)
    setLoading(true)
    const loadingController = createConversionLoadingController()
    loadingController.start()

    try {
      const pattern = await generatePatternFromImage(imagePath, config, 'process-canvas', async (message) => {
        loadingController.show(message)
        await waitForLoadingPaint()
      })
      setStorageSafe(PATTERN_STORAGE_KEY, { pattern, config, sourceImagePath: imagePath })
      Taro.navigateTo({ url: '/pages/preview/index' })
    } catch (error) {
      handleImageProcessError(error, '转换失败')
    } finally {
      loadingController.stop()
      setLoading(false)
    }
  }, [config, imagePath, loading, recommendingGrid])

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

  const longEdgeLimits = getLongEdgeLimits(config.styleMode)
  const isManualGrid = manualLongEdge !== null
  const gridSettingClass = `generate-page__grid-setting${isManualGrid ? ' is-manual' : ''}`
  const gridPresets = GRID_PRESETS[config.styleMode].filter(
    (item) => item >= longEdgeLimits.min && item <= longEdgeLimits.max,
  )

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

        <View className='generate-page__settings'>
          <Text className='generate-page__settings-title'>图纸设置</Text>
          <View className={gridSettingClass}>
            <View
              className='generate-page__grid-head'
              onClick={() => setGridSettingsOpen((prev) => !prev)}
            >
              <View className='generate-page__grid-head-text'>
                <Text className='generate-page__grid-title'>
                  {isManualGrid ? '调整格子数' : '格子数设置'}
                </Text>
                <Text className='generate-page__grid-desc'>
                  {isManualGrid ? '格子数越多，细节越丰富，耗时越长' : '默认不设置格子数'}
                </Text>
              </View>
              <View className='generate-page__grid-head-actions'>
                <Text className='generate-page__grid-mode'>
                  {isManualGrid ? `${manualLongEdge}格` : '自动匹配'}
                </Text>
                <View className={`generate-page__grid-toggle${gridSettingsOpen ? ' is-open' : ''}`}>
                  <Text className='generate-page__grid-toggle-icon'>‹</Text>
                </View>
              </View>
            </View>

            {gridSettingsOpen ? (
              <View className='generate-page__grid-body'>
                <View className='generate-page__preset-row'>
                  {gridPresets.map((preset) => (
                    <View
                      key={preset}
                      className={`generate-page__preset${manualLongEdge === preset ? ' is-active' : ''}`}
                      onClick={() => updateManualLongEdge(preset)}
                    >
                      <Text>{preset}格</Text>
                    </View>
                  ))}
                </View>

                <View className='generate-page__manual-head'>
                  <Text className='generate-page__manual-title'>自定义格子数</Text>
                  <View className='generate-page__reset' onClick={resetManualLongEdge}>
                    <Text className='generate-page__reset-icon'>↻</Text>
                    <Text>重置</Text>
                  </View>
                </View>

                <View className='generate-page__manual-row'>
                  <Text className='generate-page__limit'>{longEdgeLimits.min}</Text>
                  <Slider
                    className='generate-page__slider'
                    min={longEdgeLimits.min}
                    max={longEdgeLimits.max}
                    step={1}
                    value={manualLongEdge ?? longEdgeLimits.min}
                    activeColor={isManualGrid ? '#7c3aed' : '#b79cff'}
                    backgroundColor='#eee7ff'
                    blockColor={isManualGrid ? '#7c3aed' : '#b79cff'}
                    blockSize={18}
                    showValue={false}
                    onChanging={(event) => updateManualLongEdge(event.detail.value)}
                    onChange={(event) => updateManualLongEdge(event.detail.value)}
                  />
                  <Text className='generate-page__limit'>{longEdgeLimits.max}</Text>
                  <View className='generate-page__stepper'>
                    <View className='generate-page__stepper-btn' onClick={() => adjustManualLongEdge(-1)}>
                      <Text>−</Text>
                    </View>
                    <Input
                      className='generate-page__stepper-input'
                      type='number'
                      value={manualLongEdgeInput}
                      placeholder=''
                      onInput={(event) => {
                        handleManualLongEdgeInput(String(event.detail.value || ''))
                        return event.detail.value
                      }}
                    />
                    <View className='generate-page__stepper-btn' onClick={() => adjustManualLongEdge(1)}>
                      <Text>＋</Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : null}
          </View>

          <View className='generate-page__palette-row'>
            <Text>默认色卡</Text>
            <Text className='generate-page__palette-pill'>MARD 221</Text>
          </View>
        </View>

      </View>

      <View className='generate-page__fixed-action'>
        <Button
          className='generate-page__submit'
          type='primary'
          loading={loading}
          disabled={loading || recommendingGrid}
          onClick={handleGenerate}
        >
          <View className='generate-page__submit-content'>
            <View className='generate-page__submit-sparkles'>
              <Text className='generate-page__submit-sparkle-main'>✦</Text>
              <Text className='generate-page__submit-sparkle-sub'>✦</Text>
            </View>
            <Text>{recommendingGrid ? '正在推荐规格...' : '下一步，预览图纸'}</Text>
          </View>
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
