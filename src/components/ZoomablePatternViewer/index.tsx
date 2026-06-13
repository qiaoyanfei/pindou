import { View, Text, Image, MovableArea, MovableView } from '@tarojs/components'
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
}

const PAGE_PADDING = 64
const TOOLBAR_HEIGHT = 72

function ZoomablePatternViewer({
  pattern,
  config,
  onFullscreen,
}: ZoomablePatternViewerProps) {
  const sys = Taro.getSystemInfoSync()
  const [imageSrc, setImageSrc] = useState('')
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [loading, setLoading] = useState(true)
  const [needsPreviewCanvas, setNeedsPreviewCanvas] = useState(true)

  const areaWidth = sys.windowWidth - PAGE_PADDING
  const areaHeight = Math.floor(sys.windowHeight * 0.38)

  const previewCellPx = useMemo(
    () => getPreviewCellPxForArea(pattern, areaWidth, areaHeight - TOOLBAR_HEIGHT),
    [pattern, areaWidth, areaHeight],
  )

  const viewportWidth = areaWidth
  const viewportHeight = areaHeight - TOOLBAR_HEIGHT

  const initialScale = useMemo(() => {
    if (!imageSize.width) return 1
    const horizontalFit = (viewportWidth - 16) / imageSize.width
    const verticalFit = (viewportHeight - 16) / imageSize.height
    return Math.max(0.3, Math.min(horizontalFit, verticalFit, 1))
  }, [viewportWidth, viewportHeight, imageSize])

  const initialPosition = useMemo(() => {
    if (!imageSize.width) return { x: 0, y: 0 }
    const scaledW = imageSize.width * initialScale
    const scaledH = imageSize.height * initialScale
    return {
      x: Math.max(0, Math.round((viewportWidth - scaledW) / 2)),
      y: Math.max(0, Math.round((viewportHeight - scaledH) / 2)),
    }
  }, [imageSize, initialScale, viewportWidth, viewportHeight])

  const handleCanvasReady = async () => {
    try {
      const tempFilePath = await canvasToTempFile('preview-canvas')
      const info = await Taro.getImageInfo({ src: tempFilePath })
      setImageSrc(tempFilePath)
      setImageSize({ width: info.width, height: info.height })
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
    setImageSize({ width: 0, height: 0 })
    setNeedsPreviewCanvas(true)
  }, [pattern, config, previewCellPx])

  const handleFullscreen = () => {
    onFullscreen?.()
  }

  return (
    <View className='zoom-viewer'>
      <View className='zoom-viewer__toolbar'>
        <Text className='zoom-viewer__action' onClick={handleFullscreen}>
          全屏预览
        </Text>
      </View>

      <View
        className='zoom-viewer__viewport'
        style={{ width: `${viewportWidth}px`, height: `${viewportHeight}px` }}
      >
        {loading && (
          <View className='zoom-viewer__loading'>
            <Text>图纸生成中...</Text>
          </View>
        )}

        {!loading && imageSrc && (
          <MovableArea
            className='zoom-viewer__area'
            style={{
              width: `${viewportWidth}px`,
              height: `${viewportHeight}px`,
            }}
          >
            <MovableView
              key={`${pattern.width}x${pattern.height}-${imageSrc}`}
              className='zoom-viewer__content'
              direction='all'
              inertia
              scale
              scaleMin={0.3}
              scaleMax={4}
              scaleValue={initialScale}
              x={initialPosition.x}
              y={initialPosition.y}
              style={{
                width: `${imageSize.width}px`,
                height: `${imageSize.height}px`,
              }}
            >
              <Image
                className='zoom-viewer__image'
                src={imageSrc}
                style={{
                  width: `${imageSize.width}px`,
                  height: `${imageSize.height}px`,
                }}
                showMenuByLongpress={false}
              />
            </MovableView>
          </MovableArea>
        )}
      </View>

      {needsPreviewCanvas && (
        <PatternCanvas
          canvasId='preview-canvas'
          pattern={pattern}
          config={config}
          mode='preview'
          hidden
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
