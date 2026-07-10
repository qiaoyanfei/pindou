import { View, Text, Image } from '@tarojs/components'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import PatternCanvas from '@/components/PatternCanvas'
import { getPreviewCellPxForArea } from '@/services/patternRenderer'
import { canvasToTempFile } from '@/utils/canvas'
import { serializePatternFingerprint } from '@/utils/patternStorage'
import type { PatternConfig, PatternResult } from '@/types'
import fullscreenIcon from '@/assets/icons/preview-fullscreen.svg'
import './index.scss'

interface ZoomablePatternViewerProps {
  pattern: PatternResult
  config: PatternConfig
  onFullscreen?: () => void
}

const VIEWPORT_INSET = 8
const VIEWPORT_PADDING_X = 0
const VIEWPORT_PADDING_Y = 0
const THUMBNAIL_WIDTH_RATIO = 0.82

/** 同一份图纸预览缩略图缓存，避免页面返回时重复 Canvas 渲染 */
const previewThumbnailCache = new Map<string, string>()

function buildPreviewThumbnailCacheKey(
  pattern: PatternResult,
  config: PatternConfig,
  cellPx: number,
): string {
  return `${serializePatternFingerprint(pattern)}:${Number(config.showGrid)}:${Number(config.showColorCode)}:${cellPx}`
}

function ZoomablePatternViewer({
  pattern,
  config,
  onFullscreen,
}: ZoomablePatternViewerProps) {
  const sys = Taro.getWindowInfo()
  const [imageSrc, setImageSrc] = useState('')
  const [loading, setLoading] = useState(true)
  const [needsPreviewCanvas, setNeedsPreviewCanvas] = useState(true)

  const areaWidth = sys.windowWidth - 64
  const maxViewportHeight = Math.floor(sys.windowHeight * 0.3)

  const previewCellPx = useMemo(
    () => getPreviewCellPxForArea(pattern, areaWidth, maxViewportHeight, VIEWPORT_INSET),
    [pattern, areaWidth, maxViewportHeight],
  )
  const cacheKey = useMemo(
    () => buildPreviewThumbnailCacheKey(pattern, config, previewCellPx),
    [pattern, config, previewCellPx],
  )
  const cacheKeyRef = useRef(cacheKey)
  const previewLayout = useMemo(() => {
    const maxWidth = (areaWidth - VIEWPORT_PADDING_X * 2) * THUMBNAIL_WIDTH_RATIO
    const maxHeight = maxViewportHeight - VIEWPORT_PADDING_Y * 2
    const rawWidth = pattern.width * previewCellPx
    const rawHeight = pattern.height * previewCellPx
    const scale = Math.min(1, maxWidth / rawWidth, maxHeight / rawHeight)
    const imageWidth = Math.max(1, Math.floor(rawWidth * scale))
    const imageHeight = Math.max(1, Math.floor(rawHeight * scale))
    return {
      viewportHeight: imageHeight + VIEWPORT_PADDING_Y * 2,
      imageStyle: {
        width: `${imageWidth}px`,
        height: `${imageHeight}px`,
      },
    }
  }, [areaWidth, maxViewportHeight, pattern.height, pattern.width, previewCellPx])

  const handleCanvasReady = async () => {
    if (cacheKeyRef.current !== cacheKey) return

    try {
      const tempFilePath = await canvasToTempFile('preview-canvas')
      if (cacheKeyRef.current !== cacheKey) return
      previewThumbnailCache.set(cacheKey, tempFilePath)
      setImageSrc(tempFilePath)
      setNeedsPreviewCanvas(false)
    } catch {
      Taro.showToast({ title: '图纸渲染失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cacheKeyRef.current = cacheKey
    const cached = previewThumbnailCache.get(cacheKey)
    if (cached) {
      setImageSrc(cached)
      setLoading(false)
      setNeedsPreviewCanvas(false)
      return
    }

    setLoading(true)
    setImageSrc('')
    setNeedsPreviewCanvas(true)
  }, [cacheKey])

  const handleFullscreen = () => {
    onFullscreen?.()
  }

  return (
    <View className='zoom-viewer'>
      <View
        className='zoom-viewer__viewport'
        style={{ height: `${previewLayout.viewportHeight}px` }}
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
            style={previewLayout.imageStyle}
            showMenuByLongpress={false}
          />
        )}

        {!loading && imageSrc && (
          <View className='zoom-viewer__fullscreen' onClick={handleFullscreen}>
            <Image className='zoom-viewer__fullscreen-icon' src={fullscreenIcon} mode='aspectFit' />
          </View>
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

export default memo(ZoomablePatternViewer)
