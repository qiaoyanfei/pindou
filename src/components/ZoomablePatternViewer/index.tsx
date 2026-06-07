import { View, Text, Image, MovableArea, MovableView } from '@tarojs/components'
import { useEffect, useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import PatternCanvas from '@/components/PatternCanvas'
import {
  getPreviewCellPxForArea,
} from '@/services/patternRenderer'
import { canvasToTempFile } from '@/utils/canvas'
import type { PatternConfig, PatternResult } from '@/types'
import './index.scss'

interface ZoomablePatternViewerProps {
  pattern: PatternResult
  config: PatternConfig
  exportReady?: boolean
}

const PAGE_PADDING = 64
const TOOLBAR_HEIGHT = 72

export default function ZoomablePatternViewer({
  pattern,
  config,
  exportReady = false,
}: ZoomablePatternViewerProps) {
  const sys = Taro.getSystemInfoSync()
  const [imageSrc, setImageSrc] = useState('')
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [loading, setLoading] = useState(true)

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
  }, [pattern, config, previewCellPx])

  const handleFullscreen = async () => {
    if (!exportReady) {
      Taro.showToast({ title: '高清图准备中，请稍候', icon: 'none' })
      return
    }

    try {
      Taro.showLoading({ title: '加载预览...' })
      const tempFilePath = await canvasToTempFile('export-canvas')
      Taro.hideLoading()
      await Taro.previewImage({
        urls: [tempFilePath],
        current: tempFilePath,
      })
    } catch {
      Taro.hideLoading()
      Taro.showToast({ title: '预览失败', icon: 'none' })
    }
  }

  return (
    <View className='zoom-viewer'>
      <View className='zoom-viewer__toolbar'>
        <Text className='zoom-viewer__hint'>双指缩放 · 单指拖动</Text>
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

      {/* 离屏 Canvas 渲染，避免原生层遮挡其他 UI */}
      <PatternCanvas
        canvasId='preview-canvas'
        pattern={pattern}
        config={config}
        mode='preview'
        hidden
        cellPx={previewCellPx}
        onReady={handleCanvasReady}
      />
    </View>
  )
}
