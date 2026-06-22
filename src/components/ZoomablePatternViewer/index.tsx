import { View, Text, Image } from '@tarojs/components'
import { memo, useEffect, useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import PatternCanvas from '@/components/PatternCanvas'
import { getPreviewCellPxForArea } from '@/services/patternRenderer'
import { canvasToTempFile } from '@/utils/canvas'
import type { PatternConfig, PatternResult } from '@/types'
import './index.scss'

interface ZoomablePatternViewerProps {
  pattern: PatternResult
  config: PatternConfig
  onFullscreen?: () => void
  onEdit?: () => void
}

const TOOLBAR_HEIGHT = 72
const VIEWPORT_INSET = 8

function ZoomablePatternViewer({
  pattern,
  config,
  onFullscreen,
  onEdit,
}: ZoomablePatternViewerProps) {
  const sys = Taro.getWindowInfo()
  const [imageSrc, setImageSrc] = useState('')
  const [loading, setLoading] = useState(true)
  const [needsPreviewCanvas, setNeedsPreviewCanvas] = useState(true)

  const areaWidth = sys.windowWidth - 64
  const areaHeight = Math.floor(sys.windowHeight * 0.38)
  const viewportHeight = areaHeight - TOOLBAR_HEIGHT

  const previewCellPx = useMemo(
    () => getPreviewCellPxForArea(pattern, areaWidth, viewportHeight, VIEWPORT_INSET),
    [pattern, areaWidth, viewportHeight],
  )

  const handleCanvasReady = async () => {
    try {
      const tempFilePath = await canvasToTempFile('preview-canvas')
      setImageSrc(tempFilePath)
      setNeedsPreviewCanvas(false)
    } catch {
      Taro.showToast({ title: '图纸渲染失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    setImageSrc('')
    setNeedsPreviewCanvas(true)
  }, [pattern, config, previewCellPx])

  const handleFullscreen = () => {
    onFullscreen?.()
  }

  return (
    <View className='zoom-viewer'>
      <View className='zoom-viewer__toolbar'>
        {onEdit ? (
          <Text className='zoom-viewer__action zoom-viewer__action--left' onClick={onEdit}>
            编辑
          </Text>
        ) : (
          <View className='zoom-viewer__action-spacer' />
        )}
        <Text className='zoom-viewer__action' onClick={handleFullscreen}>
          全屏预览
        </Text>
      </View>

      <View
        className='zoom-viewer__viewport'
        style={{ height: `${viewportHeight}px` }}
        onClick={handleFullscreen}
      >
        {loading && (
          <View className='zoom-viewer__loading'>
            <Text>图纸生成中...</Text>
          </View>
        )}

        {!loading && imageSrc && (
          <Image
            className='zoom-viewer__image'
            src={imageSrc}
            mode='aspectFit'
            showMenuByLongpress={false}
          />
        )}
      </View>

      {needsPreviewCanvas && (
        <PatternCanvas
          canvasId='preview-canvas'
          pattern={pattern}
          config={config}
          mode='preview'
          hidden
          hideColorCode
          cellPx={previewCellPx}
          onReady={handleCanvasReady}
        />
      )}
    </View>
  )
}

export default memo(
  ZoomablePatternViewer,
  (prev, next) => prev.pattern === next.pattern && prev.config === next.config,
)
