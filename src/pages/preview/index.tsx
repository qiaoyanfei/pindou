import { View, Text, Button, ScrollView, CoverView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useRef, useState } from 'react'
import ZoomablePatternViewer from '@/components/ZoomablePatternViewer'
import PatternCanvas from '@/components/PatternCanvas'
import ColorStats from '@/components/ColorStats'
import CreatorSignatureInput from '@/components/CreatorSignatureInput'
import { canvasToTempFile } from '@/utils/canvas'
import { resolveCreatorNickname } from '@/utils/creatorNickname'
import { DEFAULT_CONFIG, STYLE_MODE_LABELS, normalizeConfig } from '@/utils/constants'
import { PATTERN_STORAGE_KEY, type PatternConfig, type PatternResult } from '@/types'
import './index.scss'

interface StoredPayload {
  pattern: PatternResult
  config: PatternConfig
}

type ExportJob = 'save' | 'fullscreen'

export default function PreviewPage() {
  const [pattern, setPattern] = useState<PatternResult | null>(null)
  const [config, setConfig] = useState<PatternConfig>({ ...DEFAULT_CONFIG })
  const [saving, setSaving] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportJob, setExportJob] = useState<ExportJob | null>(null)
  const [creatorNickname, setCreatorNickname] = useState('')
  const exportJobRef = useRef<ExportJob | null>(null)
  const exportBusyRef = useRef(false)
  exportBusyRef.current = exportBusy

  useDidShow(() => {
    const stored = Taro.getStorageSync(PATTERN_STORAGE_KEY) as StoredPayload | undefined
    if (!stored?.pattern) {
      Taro.showToast({ title: '请先生成图纸', icon: 'none' })
      setTimeout(() => {
        Taro.navigateBack()
      }, 800)
      return
    }

    setPattern(stored.pattern)
    setConfig(normalizeConfig(stored.config))
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
    if (!job) return

    try {
      if (job === 'save') {
        setSaving(true)
        Taro.showLoading({ title: '保存中...' })

        const setting = await Taro.getSetting()
        if (!setting.authSetting['scope.writePhotosAlbum']) {
          await Taro.authorize({ scope: 'scope.writePhotosAlbum' })
        }

        const tempFilePath = await canvasToTempFile('export-canvas')
        await Taro.saveImageToPhotosAlbum({ filePath: tempFilePath })

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
          content: '请在设置中允许保存图片到相册，以便保存拼豆图纸。',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) Taro.openSetting()
          },
        })
      } else {
        Taro.showToast({
          title: job === 'save' ? '保存失败' : '预览失败',
          icon: 'none',
        })
      }
    } finally {
      if (job === 'save') setSaving(false)
      finishExportJob()
    }
  }

  const handleSave = () => {
    if (!pattern || saving || exportBusy) return
    beginExportJob('save')
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
      <View className='preview-page__summary'>
        <View className='preview-page__block'>
          <Text className='preview-page__headline'>
            {pattern.width}×{pattern.height} 格 · {pattern.totalBeads} 颗
          </Text>
          <Text className='preview-page__desc'>
            MARD 221 标准色 · 5mm 拼豆 · {STYLE_MODE_LABELS[config.styleMode]}模式
          </Text>
        </View>
        <View className='preview-page__block'>
          <Text className='preview-page__headline'>署名</Text>
          <CreatorSignatureInput value={creatorNickname} onChange={setCreatorNickname} />
        </View>
      </View>

      <View className='preview-page__preview-slot'>
        <ZoomablePatternViewer
          pattern={pattern}
          config={config}
          onFullscreen={handleFullscreen}
        />
      </View>

      <ScrollView scrollY className='preview-page__stats-scroll'>
        <ColorStats pattern={pattern} />
      </ScrollView>

      <View className='preview-page__actions'>
        <Button className='preview-page__btn preview-page__btn--ghost' onClick={() => Taro.navigateBack()}>
          重新选图
        </Button>
        <Button
          className='preview-page__btn preview-page__btn--primary'
          loading={saving || (exportBusy && exportJob === 'save')}
          disabled={saving || exportBusy}
          onClick={handleSave}
        >
          保存相册
        </Button>
      </View>

      {exportJob && (
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

      {exportBusy && <CoverView className='preview-page__export-mask' />}
    </View>
  )
}
