import { View, Text, Button, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import ZoomablePatternViewer from '@/components/ZoomablePatternViewer'
import PatternCanvas from '@/components/PatternCanvas'
import ColorStats from '@/components/ColorStats'
import { getCanvasNode } from '@/utils/canvas'
import { DEFAULT_CONFIG, STYLE_MODE_LABELS, normalizeConfig } from '@/utils/constants'
import { PATTERN_STORAGE_KEY, type PatternConfig, type PatternResult } from '@/types'
import './index.scss'

interface StoredPayload {
  pattern: PatternResult
  config: PatternConfig
}

export default function PreviewPage() {
  const [pattern, setPattern] = useState<PatternResult | null>(null)
  const [config, setConfig] = useState<PatternConfig>({ ...DEFAULT_CONFIG })
  const [exportReady, setExportReady] = useState(false)
  const [saving, setSaving] = useState(false)

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
    setExportReady(false)
  })

  const handleSave = async () => {
    if (!pattern || !exportReady || saving) return

    setSaving(true)
    Taro.showLoading({ title: '保存中...' })

    try {
      const setting = await Taro.getSetting()
      if (!setting.authSetting['scope.writePhotosAlbum']) {
        await Taro.authorize({ scope: 'scope.writePhotosAlbum' })
      }

      const canvas = await getCanvasNode('export-canvas')
      const tempFile = await Taro.canvasToTempFilePath({ canvas })
      await Taro.saveImageToPhotosAlbum({ filePath: tempFile.tempFilePath })

      Taro.hideLoading()
      Taro.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (error) {
      Taro.hideLoading()
      const message = (error as { errMsg?: string })?.errMsg ?? ''
      if (message.includes('auth deny') || message.includes('authorize')) {
        Taro.showModal({
          title: '需要相册权限',
          content: '请在设置中允许保存图片到相册，以便保存拼豆图纸。',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) Taro.openSetting()
          },
        })
        return
      }
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  if (!pattern) {
    return <View className='preview-page preview-page--empty'>加载中...</View>
  }

  return (
    <View className='preview-page'>
      <View className='preview-page__summary'>
        <Text className='preview-page__headline'>
          {pattern.width}×{pattern.height} 格 · {pattern.totalBeads} 颗
        </Text>
        <Text className='preview-page__desc'>
          MARD 221 标准色 · 5mm 拼豆 · {STYLE_MODE_LABELS[config.styleMode]}模式
        </Text>
      </View>

      <View className='preview-page__preview-slot'>
        <ZoomablePatternViewer pattern={pattern} config={config} exportReady={exportReady} />
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
          loading={saving}
          disabled={!exportReady || saving}
          onClick={handleSave}
        >
          保存相册
        </Button>
      </View>

      <PatternCanvas
        canvasId='export-canvas'
        pattern={pattern}
        config={config}
        mode='export'
        onReady={() => setExportReady(true)}
      />
    </View>
  )
}
