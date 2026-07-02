import { View, Text, Button, ScrollView, CoverView, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useRef, useState } from 'react'
import ZoomablePatternViewer from '@/components/ZoomablePatternViewer'
import PatternCanvas from '@/components/PatternCanvas'
import ColorStats from '@/components/ColorStats'
import { canvasToTempFile } from '@/utils/canvas'
import { notifyOperationError, setStorageSafe } from '@/utils/localCache'
import { handleAlbumSaveError, saveCanvasToAlbum } from '@/utils/patternExport'
import { resolveCreatorNickname } from '@/utils/creatorNickname'
import HdPatternPreviewHost, { requestHdPatternPreview } from '@/components/HdPatternPreviewHost'
import { DEFAULT_CONFIG, getExportClarityLabel, normalizeConfig } from '@/utils/constants'
import { getCoverCellPx } from '@/services/patternRenderer'
import { requireAuthenticated, restoreSessionFromStorage } from '@/services/session'
import saveIcon from '@/assets/icons/preview-save.svg'
import publishIcon from '@/assets/icons/preview-publish.svg'
import {
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
}

type ExportJob = 'save' | 'cover'

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

export default function PreviewPage() {
  const [pattern, setPattern] = useState<PatternResult | null>(null)
  const [config, setConfig] = useState<PatternConfig>({ ...DEFAULT_CONFIG })
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportJob, setExportJob] = useState<ExportJob | null>(null)
  const [creatorNickname, setCreatorNickname] = useState('')
  const exportJobRef = useRef<ExportJob | null>(null)

  useDidShow(() => {
    restoreSessionFromStorage()
    const stored = Taro.getStorageSync(PATTERN_STORAGE_KEY) as StoredPayload | undefined
    if (!stored?.pattern) {
      Taro.showToast({ title: '请先制作图纸', icon: 'none' })
      setTimeout(() => Taro.navigateBack(), 800)
      return
    }

    setPattern((prev) => arePatternsEqual(prev, stored.pattern) ? prev : stored.pattern)
    setConfig((prev) => {
      const nextConfig = normalizeConfig(stored.config)
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
    if (!job || !pattern) return

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
        Taro.showLoading({ title: '保存中...' })
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
    if (exportBusy) return
    Taro.navigateTo({ url: '/pages/pattern-edit/index' })
  }

  const handleSave = () => {
    if (!pattern || saving || exportBusy) return
    beginExportJob('save')
  }

  const handlePublish = async () => {
    if (!pattern || publishing || exportBusy) return
    const user = await requireAuthenticated('/pages/publish/index')
    if (!user) return
    beginExportJob('cover')
  }

  const handleFullscreen = useCallback(() => {
    if (!pattern) return
    requestHdPatternPreview({
      pattern,
      config,
      creatorNickname,
    })
  }, [pattern, config, creatorNickname])

  if (!pattern) {
    return <View className='preview-page preview-page--empty'>加载中...</View>
  }

  return (
    <View className='preview-page'>
      <ScrollView scrollY className='preview-page__scroll' enhanced showScrollbar={false}>
        <View className='preview-page__content'>
          <View className='preview-page__tags'>
            <Text className='preview-page__tag'>{config.longEdge}格</Text>
            <Text className='preview-page__tag'>MARD 221 标准色</Text>
            <Text className='preview-page__tag'>{getExportClarityLabel(config.exportCellPx)}</Text>
          </View>

          <View className='preview-page__preview-slot'>
            <ZoomablePatternViewer
              pattern={pattern}
              config={config}
              onFullscreen={handleFullscreen}
              onEdit={handleStartEdit}
            />
          </View>

          <View className='preview-page__stats'>
            <ColorStats pattern={pattern} />
          </View>

          <View className='preview-page__actions'>
            <Button
              className='preview-page__btn preview-page__btn--ghost'
              loading={saving || (exportBusy && exportJob === 'save')}
              disabled={saving || exportBusy}
              onClick={handleSave}
            >
              <View className='preview-page__btn-inner'>
                <Image className='preview-page__btn-icon' src={saveIcon} mode='aspectFit' />
                <Text>保存相册</Text>
              </View>
            </Button>
            <Button
              className='preview-page__btn preview-page__btn--primary'
              loading={publishing || (exportBusy && exportJob === 'cover')}
              disabled={saving || exportBusy}
              onClick={handlePublish}
            >
              <View className='preview-page__btn-inner'>
                <Image className='preview-page__btn-icon preview-page__btn-icon--primary' src={publishIcon} mode='aspectFit' />
                <Text>发布</Text>
              </View>
            </Button>
          </View>
        </View>
      </ScrollView>

      {exportJob === 'save' && (
        <PatternCanvas
          canvasId='export-canvas'
          pattern={pattern}
          config={config}
          mode='export'
          hidden
          creatorNickname={creatorNickname}
          onReady={handleExportCanvasReady}
        />
      )}

      {exportJob === 'cover' && (
        <PatternCanvas
          canvasId='cover-canvas'
          pattern={pattern}
          config={config}
          mode='preview'
          hidden
          hideColorCode
          cellPx={getCoverCellPx(pattern)}
          onReady={handleExportCanvasReady}
        />
      )}

      {exportBusy && <CoverView className='preview-page__export-mask' />}

      <HdPatternPreviewHost />
    </View>
  )
}
