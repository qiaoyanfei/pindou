import { View, Text, Button, ScrollView, CoverView, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useRef, useState } from 'react'
import ZoomablePatternViewer from '@/components/ZoomablePatternViewer'
import PatternCanvas from '@/components/PatternCanvas'
import ColorStats from '@/components/ColorStats'
import { canvasToTempFile } from '@/utils/canvas'
import { resolveCreatorNickname } from '@/utils/creatorNickname'
import { DEFAULT_CONFIG, getExportClarityLabel, normalizeConfig } from '@/utils/constants'
import { getCoverCellPx } from '@/services/patternRenderer'
import { saveDraft } from '@/services/communityService'
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

type ExportJob = 'save' | 'fullscreen' | 'cover'

export default function PreviewPage() {
  const [pattern, setPattern] = useState<PatternResult | null>(null)
  const [config, setConfig] = useState<PatternConfig>({ ...DEFAULT_CONFIG })
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportJob, setExportJob] = useState<ExportJob | null>(null)
  const [creatorNickname, setCreatorNickname] = useState('')
  const [draftId, setDraftId] = useState<string>()
  const exportJobRef = useRef<ExportJob | null>(null)
  const exportBusyRef = useRef(false)
  exportBusyRef.current = exportBusy

  useDidShow(() => {
    const stored = Taro.getStorageSync(PATTERN_STORAGE_KEY) as StoredPayload | undefined
    if (!stored?.pattern) {
      Taro.showToast({ title: '请先生成图纸', icon: 'none' })
      setTimeout(() => Taro.navigateBack(), 800)
      return
    }

    setPattern(stored.pattern)
    setConfig(normalizeConfig(stored.config))
    setExportJob(null)
    setExportBusy(false)
    setCreatorNickname(resolveCreatorNickname())
    setDraftId(Taro.getStorageSync('currentDraftId') as string | undefined)
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

  const persistDraft = async (coverPath: string) => {
    if (!pattern) return draftId
    const nextDraftId = await saveDraft({
      draftId,
      title: '未命名图纸',
      coverPath,
      pattern,
      config,
    })
    setDraftId(nextDraftId)
    Taro.setStorageSync('currentDraftId', nextDraftId)
    return nextDraftId
  }

  const handleExportCanvasReady = async () => {
    const job = exportJobRef.current
    if (!job || !pattern) return

    try {
      if (job === 'cover') {
        setPublishing(true)
        const coverPath = await canvasToTempFile('cover-canvas')
        const payload: PublishStoragePayload = {
          pattern,
          config,
          coverPath,
          draftId,
        }
        Taro.setStorageSync(PUBLISH_STORAGE_KEY, payload)
        Taro.navigateTo({ url: '/pages/publish/index' })
        return
      }

      if (job === 'save') {
        setSaving(true)
        Taro.showLoading({ title: '保存中...' })

        const setting = await Taro.getSetting()
        if (!setting.authSetting['scope.writePhotosAlbum']) {
          await Taro.authorize({ scope: 'scope.writePhotosAlbum' })
        }

        const tempFilePath = await canvasToTempFile('export-canvas')
        await Taro.saveImageToPhotosAlbum({ filePath: tempFilePath })

        try {
          await persistDraft(tempFilePath)
        } catch {
          // 草稿同步失败不阻断保存相册
        }

        Taro.hideLoading()
        Taro.showToast({ title: '已保存到相册', icon: 'success' })
      } else {
        Taro.showLoading({ title: '加载预览...' })
        const tempFilePath = await canvasToTempFile('export-canvas')
        Taro.hideLoading()
        await Taro.previewImage({
          urls: [tempFilePath],
          current: tempFilePath,
        })
      }
    } catch (error) {
      Taro.hideLoading()
      const message = (error as { errMsg?: string })?.errMsg ?? ''
      if (job === 'save' && (message.includes('auth deny') || message.includes('authorize'))) {
        Taro.showModal({
          title: '需要相册权限',
          content: '请在设置中允许保存图片到相册，以便保存拼豆豆图纸。',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) Taro.openSetting()
          },
        })
      } else {
        Taro.showToast({
          title:
            job === 'save'
              ? '保存失败'
              : job === 'cover'
                ? '准备发布失败'
                : '预览失败',
          icon: 'none',
        })
      }
    } finally {
      if (job === 'save') setSaving(false)
      if (job === 'cover') setPublishing(false)
      finishExportJob()
    }
  }

  const handleSave = () => {
    if (!pattern || saving || exportBusy) return
    beginExportJob('save')
  }

  const handlePublish = () => {
    if (!pattern || publishing || exportBusy) return
    beginExportJob('cover')
  }

  const handleFullscreen = useCallback(() => {
    if (exportBusyRef.current) {
      Taro.showToast({ title: '导出图准备中，请稍候', icon: 'none' })
      return
    }
    exportJobRef.current = 'fullscreen'
    setExportBusy(true)
    setExportJob('fullscreen')
  }, [])

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

      {exportJob && exportJob !== 'cover' && (
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
          cellPx={getCoverCellPx(pattern)}
          onReady={handleExportCanvasReady}
        />
      )}

      {exportBusy && <CoverView className='preview-page__export-mask' />}
    </View>
  )
}
