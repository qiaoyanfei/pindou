import { View, Text, Button, ScrollView, CoverView, Image, Slider, Input, Canvas, Switch } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useMemo, useRef, useState } from 'react'
import ZoomablePatternViewer from '@/components/ZoomablePatternViewer'
import PatternCanvas from '@/components/PatternCanvas'
import { canvasToTempFile } from '@/utils/canvas'
import { notifyOperationError, setStorageSafe } from '@/utils/localCache'
import { handleAlbumSaveError, saveCanvasToAlbum, exportSvgAndShare, handleSvgExportError, type PatternExportFormat } from '@/utils/patternExport'
import { resolveCreatorNickname } from '@/utils/creatorNickname'
import HdPatternPreviewHost, { requestHdPatternPreview } from '@/components/HdPatternPreviewHost'
import {
  clampLongEdge,
  DEFAULT_CONFIG,
  getLongEdgeLimits,
  normalizeConfig,
} from '@/utils/constants'
import { getCoverCellPx } from '@/services/patternRenderer'
import { buildPatternSheetSvg } from '@/services/patternSvgBuilder'
import { generatePatternFromImage } from '@/services/patternPipeline'
import { getGenerateDraft, setGenerateDraft } from '@/services/generateSession'
import { createConversionLoadingController } from '@/utils/conversionLoading'
import { handleImageProcessError } from '@/utils/mediaPickerError'
import { requireAuthenticated, restoreSessionFromStorage } from '@/services/session'
import bulbIcon from '@/assets/icons/preview-bulb.svg'
import editIcon from '@/assets/icons/preview-edit.svg'
import refreshIcon from '@/assets/icons/preview-refresh.svg'
import saveIcon from '@/assets/icons/preview-save.svg'
import publishIcon from '@/assets/icons/preview-publish.svg'
import {
  COLOR_DETAIL_STORAGE_KEY,
  PATTERN_STORAGE_KEY,
  PUBLISH_STORAGE_KEY,
  type PatternConfig,
  type PatternResult,
  type PublishStoragePayload,
} from '@/types'
import './index.scss'

interface StoredPayload {
  pattern: PatternResult
  config: PatternConfig
  sourceImagePath?: string
}

type ExportJob = 'save' | 'cover'
type PreviewVariant = 'original' | 'mirror'

const PROCESS_CANVAS_ID = 'preview-process-canvas'
const GRID_PRESETS: Record<PatternConfig['styleMode'], number[]> = {
  portrait: [60, 90, 120, 160],
  manga: [29, 52, 78, 104],
}

function waitForLoadingPaint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60))
}

function areConfigsEqual(a: PatternConfig, b: PatternConfig): boolean {
  return a.paletteId === b.paletteId
    && a.longEdge === b.longEdge
    && a.showGrid === b.showGrid
    && a.showColorCode === b.showColorCode
    && a.exportCellPx === b.exportCellPx
    && a.styleMode === b.styleMode
}

function arePatternStatsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => a[key] === b[key])
}

function arePatternsEqual(a: PatternResult | null, b: PatternResult): boolean {
  if (!a) return false
  if (
    a.width !== b.width
    || a.height !== b.height
    || a.totalBeads !== b.totalBeads
    || a.grid.length !== b.grid.length
    || !arePatternStatsEqual(a.stats, b.stats)
  ) {
    return false
  }
  return a.grid.every((cell, index) => cell === b.grid[index])
}

function mirrorPattern(pattern: PatternResult): PatternResult {
  const grid: string[] = []
  for (let row = 0; row < pattern.height; row += 1) {
    const start = row * pattern.width
    const rowCells = pattern.grid.slice(start, start + pattern.width)
    grid.push(...rowCells.reverse())
  }

  return {
    ...pattern,
    grid,
    stats: { ...pattern.stats },
  }
}

export default function PreviewPage() {
  const [basePattern, setBasePattern] = useState<PatternResult | null>(null)
  const [config, setConfig] = useState<PatternConfig>({ ...DEFAULT_CONFIG })
  const [draftImagePath, setDraftImagePath] = useState('')
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportJob, setExportJob] = useState<ExportJob | null>(null)
  const [saveOptionsOpen, setSaveOptionsOpen] = useState(false)
  const [saveShowColorCode, setSaveShowColorCode] = useState(true)
  const [saveShowGrid, setSaveShowGrid] = useState(true)
  const [exportFormat, setExportFormat] = useState<PatternExportFormat>('png')
  const [variant, setVariant] = useState<PreviewVariant>('original')
  const [gridSettingsOpen, setGridSettingsOpen] = useState(false)
  const [longEdgeInput, setLongEdgeInput] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [regeneratingMessage, setRegeneratingMessage] = useState('')
  const [creatorNickname, setCreatorNickname] = useState('')
  const exportJobRef = useRef<ExportJob | null>(null)

  const displayedPattern = useMemo(() => {
    if (!basePattern) return null
    return variant === 'mirror' ? mirrorPattern(basePattern) : basePattern
  }, [basePattern, variant])

  const pendingLongEdge = useMemo(
    () => clampLongEdge(Number(longEdgeInput || config.longEdge), config.styleMode),
    [config.longEdge, config.styleMode, longEdgeInput],
  )
  const hasPendingGridChange = pendingLongEdge !== config.longEdge

  useDidShow(() => {
    restoreSessionFromStorage()
    const stored = Taro.getStorageSync(PATTERN_STORAGE_KEY) as StoredPayload | undefined
    if (!stored?.pattern) {
      Taro.showToast({ title: '请先制作图纸', icon: 'none' })
      setTimeout(() => Taro.navigateBack(), 800)
      return
    }

    const draft = getGenerateDraft()
    const sourceImagePath = draft?.imagePath || stored.sourceImagePath || ''
    setDraftImagePath(sourceImagePath)
    if (sourceImagePath) {
      const nextConfig = normalizeConfig(stored.config)
      setGenerateDraft(sourceImagePath, nextConfig)
      if (stored.sourceImagePath !== sourceImagePath) {
        setStorageSafe(PATTERN_STORAGE_KEY, {
          pattern: stored.pattern,
          config: nextConfig,
          sourceImagePath,
        })
      }
    }
    setBasePattern((prev) => {
      const shouldReplacePattern = !prev || !arePatternsEqual(prev, stored.pattern)
      if (shouldReplacePattern) setVariant('original')
      return shouldReplacePattern ? stored.pattern : prev
    })
    setConfig((prev) => {
      const nextConfig = normalizeConfig(stored.config)
      if (!areConfigsEqual(prev, nextConfig) || !longEdgeInput) {
        setLongEdgeInput(String(nextConfig.longEdge))
      }
      return areConfigsEqual(prev, nextConfig) ? prev : nextConfig
    })
    setExportJob(null)
    setExportBusy(false)
    setCreatorNickname(resolveCreatorNickname())
  })

  const beginExportJob = (job: ExportJob) => {
    if (exportBusy) return
    exportJobRef.current = job
    setExportBusy(true)
    setExportJob(job)
  }

  const finishExportJob = () => {
    exportJobRef.current = null
    setExportJob(null)
    setExportBusy(false)
  }

  const handleExportCanvasReady = async () => {
    const job = exportJobRef.current
    if (!job || !displayedPattern) return

    try {
      if (job === 'cover') {
        setPublishing(true)
        const coverPath = await canvasToTempFile('cover-canvas')
        setStorageSafe(PUBLISH_STORAGE_KEY, { config, coverPath } satisfies PublishStoragePayload)
        Taro.navigateTo({ url: '/pages/publish/index' })
        return
      }

      if (job === 'save') {
        setSaving(true)
        Taro.showLoading({ title: '导出中...' })
        await saveCanvasToAlbum('export-canvas')
        Taro.hideLoading()
        Taro.showToast({ title: '已保存到相册', icon: 'success' })
      }
    } catch (error) {
      Taro.hideLoading()
      if (job === 'save') {
        handleAlbumSaveError(error)
      } else {
        notifyOperationError(error, '准备发布失败')
      }
    } finally {
      if (job === 'save') setSaving(false)
      if (job === 'cover') setPublishing(false)
      finishExportJob()
    }
  }

  const handleStartEdit = () => {
    if (exportBusy || !displayedPattern) return
    setStorageSafe(PATTERN_STORAGE_KEY, { pattern: displayedPattern, config, sourceImagePath: draftImagePath })
    Taro.navigateTo({ url: '/pages/pattern-edit/index' })
  }

  const handleSave = () => {
    if (!displayedPattern || saving || exportBusy) return
    setSaveShowColorCode(true)
    setSaveShowGrid(true)
    setExportFormat('png')
    setSaveOptionsOpen(true)
  }

  const handleConfirmExport = async () => {
    if (!displayedPattern || saving || exportBusy) return
    setSaveOptionsOpen(false)

    if (exportFormat === 'svg') {
      setSaving(true)
      setExportBusy(true)
      Taro.showLoading({ title: '导出中...' })
      try {
        const svg = buildPatternSheetSvg(displayedPattern, {
          cellPx: 20,
          showGrid: saveShowGrid,
          showColorCode: saveShowColorCode,
          creatorNickname,
          showSheetHeader: true,
          showWatermark: true,
        })
        const fileName = `拼豆图纸-${displayedPattern.width}x${displayedPattern.height}.svg`
        await exportSvgAndShare(svg, fileName)
        Taro.hideLoading()
        Taro.showToast({ title: '请选择文件接收方', icon: 'none' })
      } catch (error) {
        Taro.hideLoading()
        handleSvgExportError(error)
      } finally {
        setSaving(false)
        setExportBusy(false)
      }
      return
    }

    beginExportJob('save')
  }

  const exportConfig = useMemo(
    () => normalizeConfig({
      ...config,
      showColorCode: exportJob === 'save' ? saveShowColorCode : config.showColorCode,
      showGrid: exportJob === 'save' ? saveShowGrid : config.showGrid,
    }),
    [config, exportJob, saveShowColorCode, saveShowGrid],
  )

  const handlePublish = async () => {
    if (!displayedPattern || publishing || exportBusy) return
    const user = await requireAuthenticated('/pages/publish/index')
    if (!user) return
    setStorageSafe(PATTERN_STORAGE_KEY, { pattern: displayedPattern, config, sourceImagePath: draftImagePath })
    beginExportJob('cover')
  }

  const handleFullscreen = useCallback(() => {
    if (!displayedPattern) return
    requestHdPatternPreview({
      pattern: displayedPattern,
      config,
      creatorNickname,
    })
  }, [displayedPattern, config, creatorNickname])

  const handleColorDetail = () => {
    if (!displayedPattern) return
    setStorageSafe(COLOR_DETAIL_STORAGE_KEY, { pattern: displayedPattern, config })
    Taro.navigateTo({ url: '/pages/color-detail/index' })
  }

  const longEdgeLimits = getLongEdgeLimits(config.styleMode)
  const gridPresets = GRID_PRESETS[config.styleMode].filter(
    (item) => item >= longEdgeLimits.min && item <= longEdgeLimits.max,
  )

  const updateLongEdge = (value: number) => {
    const longEdge = clampLongEdge(value, config.styleMode)
    setLongEdgeInput(String(longEdge))
  }

  const handleLongEdgeInput = (value: string) => {
    const normalized = value.replace(/[^\d]/g, '')
    setLongEdgeInput(normalized)
  }

  const adjustLongEdge = (delta: number) => {
    updateLongEdge(pendingLongEdge + delta)
  }

  const handleRegenerate = async () => {
    if (!draftImagePath || regenerating || exportBusy || !hasPendingGridChange) {
      if (!draftImagePath) Taro.showToast({ title: '未找到原图，请重新制作', icon: 'none' })
      return
    }

    const nextConfig = normalizeConfig({
      ...config,
      longEdge: pendingLongEdge,
    })
    setRegenerating(true)
    setRegeneratingMessage('正在匹配色号...')

    const loadingController = createConversionLoadingController()
    loadingController.start()

    try {
      const nextPattern = await generatePatternFromImage(
        draftImagePath,
        nextConfig,
        PROCESS_CANVAS_ID,
        async (message) => {
          setRegeneratingMessage(message)
          loadingController.show(message)
          await waitForLoadingPaint()
        },
      )
      setBasePattern(nextPattern)
      setConfig(nextConfig)
      setLongEdgeInput(String(nextConfig.longEdge))
      setGenerateDraft(draftImagePath, nextConfig)
      setStorageSafe(PATTERN_STORAGE_KEY, { pattern: nextPattern, config: nextConfig, sourceImagePath: draftImagePath })
      Taro.showToast({ title: '已重新预览', icon: 'success' })
    } catch (error) {
      handleImageProcessError(error, '重新预览失败')
    } finally {
      loadingController.stop()
      setRegenerating(false)
      setRegeneratingMessage('')
    }
  }

  if (!displayedPattern) {
    return <View className='preview-page preview-page--empty'>加载中...</View>
  }

  return (
    <View className='preview-page'>
      <ScrollView scrollY className='preview-page__scroll' enhanced showScrollbar={false}>
        <View className='preview-page__content'>
          <View className='preview-page__variant-switch'>
            <View
              className={`preview-page__variant-option${variant === 'original' ? ' is-active' : ''}`}
              onClick={() => {
                if (!exportBusy && !regenerating) setVariant('original')
              }}
            >
              <Text>原图</Text>
            </View>
            <View
              className={`preview-page__variant-option${variant === 'mirror' ? ' is-active' : ''}`}
              onClick={() => {
                if (!exportBusy && !regenerating) setVariant('mirror')
              }}
            >
              <Text>镜像</Text>
            </View>
          </View>

          <View className='preview-page__preview-slot'>
            <ZoomablePatternViewer
              pattern={displayedPattern}
              config={config}
              onFullscreen={handleFullscreen}
            />
          </View>

          <View className='preview-page__stats-card'>
            <View className='preview-page__stat-item'>
              <Text className='preview-page__stat-label'>规格</Text>
              <Text className='preview-page__stat-value'>{config.longEdge}格</Text>
            </View>
            <View className='preview-page__stat-divider' />
            <View className='preview-page__stat-item'>
              <Text className='preview-page__stat-label'>颜色</Text>
              <Text className='preview-page__stat-value'>{Object.keys(displayedPattern.stats).length}种</Text>
            </View>
            <View className='preview-page__stat-divider' />
            <View className='preview-page__stat-item'>
              <Text className='preview-page__stat-label'>MARD</Text>
              <Text className='preview-page__stat-value'>221</Text>
            </View>
            <View className='preview-page__stat-divider' />
            <Text className='preview-page__color-link' onClick={handleColorDetail}>
              查看色号详情 ›
            </Text>
          </View>

          <View className='preview-page__edit-hint'>
            <Image className='preview-page__edit-bulb' src={bulbIcon} mode='aspectFit' />
            <Text>不满意？可手动编辑图纸</Text>
          </View>

          <Button
            className='preview-page__edit-btn'
            disabled={exportBusy}
            onClick={handleStartEdit}
          >
            <View className='preview-page__edit-btn-inner'>
              <Image className='preview-page__edit-icon' src={editIcon} mode='aspectFit' />
              <Text>编辑图纸</Text>
            </View>
          </Button>

          <View className='preview-page__grid-setting'>
            <View
              className='preview-page__grid-head'
              onClick={() => setGridSettingsOpen((prev) => !prev)}
            >
              <View className='preview-page__grid-copy'>
                <Text className='preview-page__grid-title'>调整格子数</Text>
                <Text className='preview-page__grid-desc'>
                  {gridSettingsOpen ? '格子数越多，细节越丰富，耗时越长' : '效果不满意？可调整格子数后重新预览'}
                </Text>
              </View>
              <View className='preview-page__grid-actions'>
                <Text className='preview-page__grid-value'>{pendingLongEdge}格</Text>
                <Text className={`preview-page__grid-arrow${gridSettingsOpen ? ' is-open' : ''}`}>‹</Text>
              </View>
            </View>

            {gridSettingsOpen ? (
              <View className='preview-page__grid-body'>
                <View className='preview-page__preset-row'>
                  {gridPresets.map((preset) => (
                    <View
                      key={preset}
                      className={`preview-page__preset${pendingLongEdge === preset ? ' is-active' : ''}`}
                      onClick={() => updateLongEdge(preset)}
                    >
                      <Text>{preset}格</Text>
                    </View>
                  ))}
                </View>
                <View className='preview-page__manual-row'>
                  <Text className='preview-page__limit'>{longEdgeLimits.min}</Text>
                  <Slider
                    className='preview-page__slider'
                    min={longEdgeLimits.min}
                    max={longEdgeLimits.max}
                    step={1}
                    value={pendingLongEdge}
                    activeColor='#7c3aed'
                    backgroundColor='#eee7ff'
                    blockColor='#7c3aed'
                    blockSize={18}
                    showValue={false}
                    onChanging={(event) => updateLongEdge(event.detail.value)}
                    onChange={(event) => updateLongEdge(event.detail.value)}
                  />
                  <Text className='preview-page__limit'>{longEdgeLimits.max}</Text>
                  <View className='preview-page__stepper'>
                    <View className='preview-page__stepper-btn' onClick={() => adjustLongEdge(-1)}>
                      <Text>−</Text>
                    </View>
                    <Input
                      className='preview-page__stepper-input'
                      type='number'
                      value={longEdgeInput}
                      onInput={(event) => {
                        handleLongEdgeInput(String(event.detail.value || ''))
                        return event.detail.value
                      }}
                    />
                    <View className='preview-page__stepper-btn' onClick={() => adjustLongEdge(1)}>
                      <Text>＋</Text>
                    </View>
                  </View>
                </View>
                <Button
                  className={`preview-page__regenerate${hasPendingGridChange ? '' : ' is-disabled'}${regenerating ? ' preview-page__regenerate--loading' : ''}`}
                  disabled={regenerating || exportBusy || !hasPendingGridChange}
                  onClick={handleRegenerate}
                >
                  <View className='preview-page__regenerate-inner'>
                    {!regenerating ? (
                      <Image className='preview-page__regenerate-icon' src={refreshIcon} mode='aspectFit' />
                    ) : null}
                    <Text>{regenerating ? regeneratingMessage || '正在处理...' : '重新预览'}</Text>
                  </View>
                </Button>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <View className='preview-page__fixed-actions'>
        <Button
          className='preview-page__btn preview-page__btn--ghost'
          loading={saving || (exportBusy && exportJob === 'save')}
          disabled={saving || exportBusy}
          onClick={handleSave}
        >
          <View className='preview-page__btn-inner'>
            <Image className='preview-page__btn-icon' src={saveIcon} mode='aspectFit' />
            <Text>导出图片</Text>
          </View>
        </Button>
        <Button
          className='preview-page__btn preview-page__btn--ghost'
          loading={publishing || (exportBusy && exportJob === 'cover')}
          disabled={saving || exportBusy}
          onClick={handlePublish}
        >
          <View className='preview-page__btn-inner'>
            <Image className='preview-page__btn-icon' src={publishIcon} mode='aspectFit' />
            <Text>发布</Text>
          </View>
        </Button>
      </View>

      {saveOptionsOpen && (
        <View className='preview-page__save-modal-mask' onClick={() => setSaveOptionsOpen(false)}>
          <View className='preview-page__save-modal' onClick={(event) => event.stopPropagation()}>
            <View className='preview-page__save-modal-head'>
              <Text className='preview-page__save-modal-title'>导出图片</Text>
              <Text className='preview-page__save-modal-subtitle'>选择导出格式与图纸设置</Text>
            </View>

            <View className='preview-page__format-section'>
              <Text className='preview-page__save-option-title preview-page__format-label'>导出格式</Text>
              <View className='preview-page__format-row'>
                <View
                  className={`preview-page__format-option${exportFormat === 'png' ? ' is-active' : ''}`}
                  onClick={() => setExportFormat('png')}
                >
                  <Text className='preview-page__format-option-title'>PNG</Text>
                  <Text className='preview-page__format-option-desc'>高清位图，保存到相册</Text>
                </View>
                <View
                  className={`preview-page__format-option${exportFormat === 'svg' ? ' is-active' : ''}`}
                  onClick={() => setExportFormat('svg')}
                >
                  <Text className='preview-page__format-option-title'>SVG</Text>
                  <Text className='preview-page__format-option-desc'>矢量文件，分享后在电脑打开</Text>
                </View>
              </View>
            </View>

            <View className='preview-page__save-option'>
              <View className='preview-page__save-option-copy'>
                <Text className='preview-page__save-option-title'>显示色号</Text>
                <Text className='preview-page__save-option-desc'>在图纸上显示所使用的色号</Text>
              </View>
              <Switch
                checked={saveShowColorCode}
                color='#7c3aed'
                onChange={(event) => setSaveShowColorCode(event.detail.value)}
              />
            </View>

            <View className='preview-page__save-option'>
              <View className='preview-page__save-option-copy'>
                <Text className='preview-page__save-option-title'>显示网格线</Text>
                <Text className='preview-page__save-option-desc'>显示网格有助于对齐参考</Text>
              </View>
              <Switch
                checked={saveShowGrid}
                color='#7c3aed'
                onChange={(event) => setSaveShowGrid(event.detail.value)}
              />
            </View>

            <View className='preview-page__save-modal-actions'>
              <Button className='preview-page__save-modal-btn preview-page__save-modal-btn--ghost' onClick={() => setSaveOptionsOpen(false)}>
                取消
              </Button>
              <Button className='preview-page__save-modal-btn preview-page__save-modal-btn--primary' onClick={handleConfirmExport}>
                {exportFormat === 'png' ? '保存相册' : '分享文件'}
              </Button>
            </View>
          </View>
        </View>
      )}

      {exportJob === 'save' && (
        <PatternCanvas
          canvasId='export-canvas'
          pattern={displayedPattern}
          config={exportConfig}
          mode='export'
          hidden
          maxExportResolution
          creatorNickname={creatorNickname}
          onReady={handleExportCanvasReady}
        />
      )}

      {exportJob === 'cover' && (
        <PatternCanvas
          canvasId='cover-canvas'
          pattern={displayedPattern}
          config={config}
          mode='preview'
          hidden
          hideColorCode
          cellPx={getCoverCellPx(displayedPattern)}
          onReady={handleExportCanvasReady}
        />
      )}

      <Canvas
        type='2d'
        id={PROCESS_CANVAS_ID}
        canvasId={PROCESS_CANVAS_ID}
        className='preview-page__hidden-canvas'
      />

      {exportBusy && <CoverView className='preview-page__export-mask' />}

      <HdPatternPreviewHost />
    </View>
  )
}
