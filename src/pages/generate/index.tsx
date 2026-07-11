import { View, Text, Button, Canvas, Slider, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useUnload } from '@tarojs/taro'
import { useCallback, useRef, useState } from 'react'
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
import { createGeneratePreviewStoragePayload, isRecoverableGeneratePattern } from '@/utils/patternStorage'
import { TAB_INDEX, updateTabBarSelected } from '@/utils/tabBar'
import { useDefaultPageShare } from '@/utils/shareReward'
import PatternGenerationOverlay from '@/components/PatternGenerationOverlay'
import {
  createPatternAbortController,
  createPatternGenerationProgressReporter,
  computeStageProgressPercent,
  isPatternGenerationCancelled,
  throwIfAborted,
  type PatternAbortController,
} from '@/utils/patternGenerationProgress'
import {
  clampLongEdge,
  createDefaultConfigForStyleMode,
  getLongEdgeLimits,
} from '@/utils/constants'
import {
  PATTERN_STORAGE_KEY,
  PUBLISH_STORAGE_KEY,
  GENERATE_PAGE_RESET_KEY,
  type PatternConfig,
  type PatternStoragePayload,
  type StyleMode,
} from '@/types'
import './index.scss'

const GRID_PRESETS: Record<StyleMode, number[]> = {
  portrait: [60, 90, 120, 160],
  manga: [29, 52, 78, 104],
}

function createInitialConfig(): PatternConfig {
  return createDefaultConfigForStyleMode('manga')
}

function readDraftState(): { imagePath: string; config: PatternConfig } {
  if (!hasRecoverablePattern()) {
    return {
      imagePath: '',
      config: createInitialConfig(),
    }
  }
  const draft = getGenerateDraft()
  return {
    imagePath: draft?.imagePath ?? '',
    config: draft?.config ?? createInitialConfig(),
  }
}

function hasRecoverablePattern(): boolean {
  try {
    const stored = Taro.getStorageSync(PATTERN_STORAGE_KEY) as PatternStoragePayload | undefined
    return isRecoverableGeneratePattern(stored)
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


function resetScrollTop(setScrollTop: (value: number | ((prev: number) => number)) => void): void {
  setScrollTop(0.01)
  Taro.nextTick(() => {
    setScrollTop(0)
  })
}

type GenerationPhase = 'idle' | 'running'

async function resolveGenerateConfig(
  imagePath: string,
  config: PatternConfig,
  manualLongEdge: number | null,
  onProgress?: import('@/services/patternPipeline').PatternProgressCallback,
  signal?: import('@/utils/patternGenerationProgress').PatternAbortSignal,
): Promise<PatternConfig> {
  throwIfAborted(signal)
  if (manualLongEdge !== null) {
    return {
      ...config,
      longEdge: manualLongEdge,
    }
  }

  try {
    const recommendedLongEdge = await recommendLongEdgeFromImage(
      imagePath,
      config.styleMode,
      'process-canvas',
      signal,
      onProgress,
    )
    throwIfAborted(signal)
    return {
      ...config,
      longEdge: recommendedLongEdge,
    }
  } catch (error) {
    if (isPatternGenerationCancelled(error)) {
      throw error
    }
    return {
      ...config,
      longEdge: getFallbackAutoLongEdge(config.styleMode),
    }
  }
}

export default function GeneratePage() {
  const initialDraft = readDraftState()
  const [imagePath, setImagePath] = useState(initialDraft.imagePath)
  const [config, setConfig] = useState<PatternConfig>(initialDraft.config)
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [loadingPercent, setLoadingPercent] = useState<number | null>(null)
  const [generationPhase, setGenerationPhase] = useState<GenerationPhase>('idle')
  const [gridSettingsOpen, setGridSettingsOpen] = useState(true)
  const [manualLongEdge, setManualLongEdge] = useState<number | null>(null)
  const [manualLongEdgeInput, setManualLongEdgeInput] = useState('')
  const [authed, setAuthed] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const recoverPromptShownRef = useRef(false)
  const abortRef = useRef<PatternAbortController | null>(null)
  const generatingRef = useRef(false)
  const cancelRequestedRef = useRef(false)

  useDefaultPageShare({ title: '生成拼豆图纸', path: '/pages/generate/index' })

  const applyDraftState = (next: { imagePath: string; config: PatternConfig }) => {
    setImagePath(next.imagePath)
    setConfig(next.config)
    setManualLongEdge(null)
    setManualLongEdgeInput('')
  }

  useDidShow(async () => {
    resetScrollTop(setScrollTop)
    updateTabBarSelected(TAB_INDEX.generate)
    const user = await requireAuthenticated('/pages/generate/index')
    if (!user) return
    setAuthed(true)

    if (Taro.getStorageSync(GENERATE_PAGE_RESET_KEY)) {
      Taro.removeStorageSync(GENERATE_PAGE_RESET_KEY)
      clearRecoverablePattern()
      recoverPromptShownRef.current = false
      applyDraftState(resetGenerateDraft())
      resetScrollTop(setScrollTop)
      return
    }

    if (!recoverPromptShownRef.current && hasRecoverablePattern()) {
      recoverPromptShownRef.current = true
      const result = await Taro.showModal({
        title: '继续未完成图纸？',
        content: '检测到上次未发布成功的图纸，可以继续预览和编辑。',
        confirmText: '继续',
        cancelText: '重新生成',
      })
      if (result.confirm) {
        Taro.navigateTo({ url: '/pages/preview/index' })
        return
      }
      clearRecoverablePattern()
      applyDraftState(resetGenerateDraft())
      resetScrollTop(setScrollTop)
      return
    }

    if (hasRecoverablePattern()) {
      const draft = getGenerateDraft()
      if (draft?.imagePath) {
        setImagePath(draft.imagePath)
      }
      if (draft?.config) {
        setConfig(draft.config)
        setManualLongEdge(null)
        setManualLongEdgeInput('')
      }
    } else if (!getGenerateDraft()?.imagePath) {
      applyDraftState(resetGenerateDraft())
    }

    resetScrollTop(setScrollTop)
  })

  useUnload(() => {
    abortRef.current?.abort()
  })

  const updateManualLongEdge = (value: number) => {
    const nextLongEdge = clampLongEdge(value, config.styleMode)
    const nextConfig = {
      ...config,
      longEdge: nextLongEdge,
    }
    setManualLongEdge(nextLongEdge)
    setManualLongEdgeInput(String(nextLongEdge))
    setGenerateDraft(imagePath, nextConfig)
    setConfig(nextConfig)
  }

  const resetManualLongEdge = () => {
    setManualLongEdge(null)
    setManualLongEdgeInput('')
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
      return
    }
    updateManualLongEdge(Number(normalized))
  }

  const resetGenerationUi = () => {
    cancelRequestedRef.current = false
    setGenerationPhase('idle')
    setLoading(false)
    setLoadingMessage('')
    setLoadingPercent(null)
  }

  const requestCancelGeneration = () => {
    if (cancelRequestedRef.current) return
    cancelRequestedRef.current = true
    abortRef.current?.abort()
    setGenerationPhase('idle')
    setLoading(false)
    setLoadingMessage('')
    setLoadingPercent(null)
  }

  const handleImageSelect = (path: string) => {
    resetGenerationUi()
    const sourcePath = persistGenerateSourceImage(path)
    const next = setGenerateImageWithDefaultConfig(sourcePath, config.styleMode)
    applyDraftState(next)
  }

  const handleStyleModeChange = (styleMode: StyleMode) => {
    const nextConfig = createDefaultConfigForStyleMode(styleMode)
    setManualLongEdge(null)
    setManualLongEdgeInput('')
    setGenerateDraft(imagePath, nextConfig)
    setConfig(nextConfig)
  }

  const handleGenerate = useCallback(async () => {
    if (!imagePath) {
      generatingRef.current = false
      setGenerationPhase('idle')
      setLoading(false)
      Taro.showToast({ title: '请先上传图片', icon: 'none' })
      return
    }

    cancelRequestedRef.current = false
    setGenerationPhase('running')
    setLoading(true)
    setLoadingMessage('读取图片...')
    setLoadingPercent(computeStageProgressPercent('读取图片...', 0))

    const abortController = createPatternAbortController()
    abortRef.current = abortController

    const progress = createPatternGenerationProgressReporter(
      async (message, context) => {
        if (abortController.signal.aborted || cancelRequestedRef.current) return
        setLoadingMessage(message)
        if (context?.percent != null) {
          setLoadingPercent(context.percent)
        }
      },
    )

    let wasCancelled = false

    try {
      const finalConfig = await resolveGenerateConfig(
        imagePath,
        config,
        manualLongEdge,
        progress.report,
        abortController.signal,
      )
      throwIfAborted(abortController.signal)

      syncGenerateDraftFromPage(imagePath, finalConfig)
      setConfig(finalConfig)

      const pattern = await generatePatternFromImage(
        imagePath,
        finalConfig,
        'process-canvas',
        progress.report,
        { signal: abortController.signal },
      )
      throwIfAborted(abortController.signal)

      setStorageSafe(PATTERN_STORAGE_KEY, createGeneratePreviewStoragePayload(pattern, finalConfig, imagePath))
      Taro.navigateTo({ url: '/pages/preview/index' })
    } catch (error) {
      wasCancelled = isPatternGenerationCancelled(error) || cancelRequestedRef.current
      if (wasCancelled) return
      handleImageProcessError(error, '生成失败')
    } finally {
      await progress.finish({ skipDelay: wasCancelled || cancelRequestedRef.current })
      abortRef.current = null
      generatingRef.current = false
      setLoading(false)
      setLoadingMessage('')
      setLoadingPercent(null)

      if (wasCancelled || cancelRequestedRef.current) {
        resetGenerationUi()
      } else {
        setGenerationPhase('idle')
      }
    }
  }, [config, imagePath, manualLongEdge])

  const handleSubmit = () => {
    if (!imagePath) {
      Taro.showToast({ title: '请先上传图片', icon: 'none' })
      return
    }
    if (cancelRequestedRef.current || generatingRef.current) return
    generatingRef.current = true
    void handleGenerate()
  }

  if (!authed) {
    return null
  }

  const longEdgeLimits = getLongEdgeLimits(config.styleMode)
  const isManualGrid = manualLongEdge !== null
  const gridSettingClass = `generate-page__grid-setting${isManualGrid ? ' is-manual' : ''}`
  const gridPresets = GRID_PRESETS[config.styleMode].filter(
    (item) => item >= longEdgeLimits.min && item <= longEdgeLimits.max,
  )
  const isRunning = generationPhase === 'running'
  const canSubmit = Boolean(imagePath) && !isRunning
  const submitClassName = [
    'generate-page__submit',
    isRunning ? ' generate-page__submit--disabled' : '',
    !canSubmit ? ' generate-page__submit--disabled' : '',
  ].join('')

  return (
    <View className='generate-page'>
      <ScrollView
        scrollY
        scrollTop={scrollTop}
        className='generate-page__scroll'
        enhanced
        showScrollbar={false}
      >
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

      </ScrollView>

      <View className='generate-page__fixed-action'>
        <Button
          className={submitClassName}
          type='primary'
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          <View className='generate-page__submit-content'>
            {canSubmit ? (
              <View className='generate-page__submit-sparkles'>
                <Text className='generate-page__submit-sparkle-main'>✦</Text>
                <Text className='generate-page__submit-sparkle-sub'>✦</Text>
              </View>
            ) : null}
            <Text className='generate-page__submit-main'>下一步，预览图纸</Text>
          </View>
        </Button>
      </View>

      <Canvas
        type='2d'
        id='process-canvas'
        canvasId='process-canvas'
        className='generate-page__hidden-canvas'
      />

      <PatternGenerationOverlay
        visible={isRunning}
        stageMessage={loadingMessage}
        percent={loadingPercent}
        onCancel={requestCancelGeneration}
      />
    </View>
  )
}
