import { useRef } from 'react'
import { View, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { PatternSourceCrop } from '@/types'
import './index.scss'

export interface CellHighlight {
  index: number
  col: number
  row: number
  color?: string
}

export interface ViewportTransform {
  scale: number
  x: number
  y: number
}

export type EditorLayerMode = 'pattern' | 'compare' | 'source'
export type EditorGestureMode = 'pan' | 'draw'

export const SCALE_MIN = 0.05
export const SCALE_MAX = 4
const PAN_START_TOLERANCE = 6
/** 画笔/橡皮下长按进入临时拖动画布 */
const LONG_PRESS_PAN_MS = 220

interface EditorViewportProps {
  patternBuffers: Array<{ key: string; src: string }>
  activePatternBufferKey: string
  pendingPatternBufferKey: string | null
  sourceImageSrc?: string
  sourceCrop?: PatternSourceCrop | null
  layerMode: EditorLayerMode
  gestureMode: EditorGestureMode
  imageWidth: number
  imageHeight: number
  viewport: ViewportTransform
  interactive: boolean
  highlights: CellHighlight[]
  highlightCellPx: number
  onViewportChange: (viewport: ViewportTransform) => void
  /** 画笔模式下长按拖开始/结束，用于取消误触笔画 */
  onLongPressPanChange?: (active: boolean) => void
  onTouchStart: (event: {
    touches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
  }) => void
  onTouchMove: (event: {
    touches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
    changedTouches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
    stopPropagation?: () => void
  }) => void
  onTouchEnd: (event: {
    changedTouches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
    touches?: Array<unknown>
  }) => void
  onTouchCancel: () => void
  onPatternBufferLoad: (key: string) => void
  onPatternBufferError: (key: string) => void
}

function readTouch(touch: {
  clientX?: number
  clientY?: number
  x?: number
  y?: number
}): { clientX: number; clientY: number } | null {
  const clientX = touch.clientX ?? touch.x
  const clientY = touch.clientY ?? touch.y
  if (typeof clientX !== 'number' || typeof clientY !== 'number') return null
  return { clientX, clientY }
}

function clampScale(scale: number) {
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, scale))
}

/** 把生成时的原图裁剪区映射到图纸画布；正方形留白时只对齐 contentRect */
function resolveSourceLayerStyle(
  frameWidth: number,
  frameHeight: number,
  crop?: PatternSourceCrop | null,
): { width: number; height: number; left: number; top: number } {
  if (
    !(
      crop
      && crop.width > 0
      && crop.height > 0
      && crop.sourceWidth > 0
      && crop.sourceHeight > 0
    )
  ) {
    return {
      width: frameWidth,
      height: frameHeight,
      left: 0,
      top: 0,
    }
  }

  const content = crop.contentRect
  const squareSide = crop.squareSide
    ?? (content
      ? Math.max(
        content.x + content.width + content.x,
        content.y + content.height + content.y,
        content.x + content.width,
        content.y + content.height,
      )
      : 0)

  if (content && squareSide > 0 && content.width > 0 && content.height > 0) {
    const cellW = frameWidth / squareSide
    const cellH = frameHeight / squareSide
    const contentFrameW = content.width * cellW
    const contentFrameH = content.height * cellH
    const contentLeft = content.x * cellW
    const contentTop = content.y * cellH
    const scaleX = contentFrameW / crop.width
    const scaleY = contentFrameH / crop.height
    return {
      width: crop.sourceWidth * scaleX,
      height: crop.sourceHeight * scaleY,
      left: contentLeft - crop.x * scaleX,
      top: contentTop - crop.y * scaleY,
    }
  }

  const scaleX = frameWidth / crop.width
  const scaleY = frameHeight / crop.height
  return {
    width: crop.sourceWidth * scaleX,
    height: crop.sourceHeight * scaleY,
    left: -crop.x * scaleX,
    top: -crop.y * scaleY,
  }
}

function EditorViewport({
  patternBuffers,
  activePatternBufferKey,
  pendingPatternBufferKey,
  sourceImageSrc = '',
  sourceCrop = null,
  layerMode,
  gestureMode,
  imageWidth,
  imageHeight,
  viewport,
  interactive,
  highlights,
  highlightCellPx,
  onViewportChange,
  onLongPressPanChange,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
  onPatternBufferLoad,
  onPatternBufferError,
}: EditorViewportProps) {
  const gestureRef = useRef<{
    mode: 'none' | 'pending' | 'pan' | 'pinch' | 'drawPending'
    startX: number
    startY: number
    startViewport: ViewportTransform
    pinchStartDistance: number
    pinchMidX: number
    pinchMidY: number
    pinchWorldX: number
    pinchWorldY: number
    longPressPan: boolean
  }>({
    mode: 'none',
    startX: 0,
    startY: 0,
    startViewport: { scale: 1, x: 0, y: 0 },
    pinchStartDistance: 0,
    pinchMidX: 0,
    pinchMidY: 0,
    pinchWorldX: 0,
    pinchWorldY: 0,
    longPressPan: false,
  })

  const areaRectRef = useRef({ left: 0, top: 0 })
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const endLongPressPanIfNeeded = () => {
    if (!gestureRef.current.longPressPan) return
    gestureRef.current.longPressPan = false
    onLongPressPanChange?.(false)
  }

  const updateAreaRect = () => {
    Taro.createSelectorQuery()
      .select('#pattern-editor-viewport-area')
      .boundingClientRect((rect) => {
        const box = rect as { left: number; top: number } | null
        if (box) {
          areaRectRef.current = { left: box.left, top: box.top }
        }
      })
      .exec()
  }

  const toAreaPoint = (clientX: number, clientY: number) => ({
    x: clientX - areaRectRef.current.left,
    y: clientY - areaRectRef.current.top,
  })

  const handleAreaTouchStart = (event: {
    touches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
  }) => {
    updateAreaRect()
    clearLongPressTimer()
    endLongPressPanIfNeeded()
    onTouchStart(event)

    if (!interactive) return

    const touches = event.touches ?? []
    if (touches.length >= 2) {
      const t0 = readTouch(touches[0])
      const t1 = readTouch(touches[1])
      if (!t0 || !t1) return
      const p0 = toAreaPoint(t0.clientX, t0.clientY)
      const p1 = toAreaPoint(t1.clientX, t1.clientY)
      const midX = (p0.x + p1.x) / 2
      const midY = (p0.y + p1.y) / 2
      const distance = Math.hypot(p1.x - p0.x, p1.y - p0.y)
      if (distance < 1) return
      const worldX = (midX - viewport.x) / viewport.scale
      const worldY = (midY - viewport.y) / viewport.scale
      gestureRef.current = {
        mode: 'pinch',
        startX: 0,
        startY: 0,
        startViewport: { ...viewport },
        pinchStartDistance: distance,
        pinchMidX: midX,
        pinchMidY: midY,
        pinchWorldX: worldX,
        pinchWorldY: worldY,
        longPressPan: false,
      }
      return
    }

    const touch = readTouch(touches[0] ?? {})
    if (!touch) return

    // 画笔/橡皮：先观察是滑动着色还是长按拖动画布
    if (gestureMode === 'draw') {
      gestureRef.current = {
        mode: 'drawPending',
        startX: touch.clientX,
        startY: touch.clientY,
        startViewport: { ...viewport },
        pinchStartDistance: 0,
        pinchMidX: 0,
        pinchMidY: 0,
        pinchWorldX: 0,
        pinchWorldY: 0,
        longPressPan: false,
      }
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null
        const gesture = gestureRef.current
        if (gesture.mode !== 'drawPending') return
        gesture.mode = 'pan'
        gesture.longPressPan = true
        // 以当前视口为起点，避免长按期间有其他变化
        gesture.startViewport = { ...gesture.startViewport }
        onLongPressPanChange?.(true)
      }, LONG_PRESS_PAN_MS)
      return
    }

    gestureRef.current = {
      mode: 'pending',
      startX: touch.clientX,
      startY: touch.clientY,
      startViewport: { ...viewport },
      pinchStartDistance: 0,
      pinchMidX: 0,
      pinchMidY: 0,
      pinchWorldX: 0,
      pinchWorldY: 0,
      longPressPan: false,
    }
  }

  const handleAreaTouchMove = (event: {
    touches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
    changedTouches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
    stopPropagation?: () => void
  }) => {
    if (!interactive) {
      onTouchMove(event)
      return
    }

    const touches = event.touches ?? []
    const gesture = gestureRef.current

    if (touches.length >= 2) {
      clearLongPressTimer()
      endLongPressPanIfNeeded()
      onTouchMove(event)
      const t0 = readTouch(touches[0])
      const t1 = readTouch(touches[1])
      if (!t0 || !t1) return
      const p0 = toAreaPoint(t0.clientX, t0.clientY)
      const p1 = toAreaPoint(t1.clientX, t1.clientY)
      const midX = (p0.x + p1.x) / 2
      const midY = (p0.y + p1.y) / 2
      const distance = Math.hypot(p1.x - p0.x, p1.y - p0.y)
      if (distance < 1) return

      if (gesture.mode !== 'pinch') {
        const worldX = (midX - viewport.x) / viewport.scale
        const worldY = (midY - viewport.y) / viewport.scale
        gestureRef.current = {
          mode: 'pinch',
          startX: 0,
          startY: 0,
          startViewport: { ...viewport },
          pinchStartDistance: distance,
          pinchMidX: midX,
          pinchMidY: midY,
          pinchWorldX: worldX,
          pinchWorldY: worldY,
          longPressPan: false,
        }
        return
      }

      const nextScale = clampScale(
        gesture.startViewport.scale * distance / gesture.pinchStartDistance,
      )
      onViewportChange({
        scale: nextScale,
        x: midX - gesture.pinchWorldX * nextScale,
        y: midY - gesture.pinchWorldY * nextScale,
      })
      return
    }

    if (gesture.mode === 'pinch') {
      onTouchMove(event)
      return
    }

    const touch = readTouch(touches[0] ?? {})
    if (!touch) {
      onTouchMove(event)
      return
    }

    const dx = touch.clientX - gesture.startX
    const dy = touch.clientY - gesture.startY
    const moved = Math.hypot(dx, dy)

    // 画笔等待长按：一滑动就取消长按，交给着色
    if (gesture.mode === 'drawPending') {
      if (moved >= PAN_START_TOLERANCE) {
        clearLongPressTimer()
        gesture.mode = 'none'
      }
      onTouchMove(event)
      return
    }

    // 长按已进入拖动：不再把 move 交给着色
    if (gesture.mode === 'pan' && gesture.longPressPan) {
      onViewportChange({
        ...gesture.startViewport,
        x: gesture.startViewport.x + dx,
        y: gesture.startViewport.y + dy,
      })
      return
    }

    if (gestureMode === 'draw') {
      onTouchMove(event)
      return
    }

    onTouchMove(event)

    if (gesture.mode === 'pending') {
      if (moved < PAN_START_TOLERANCE) return
      gestureRef.current.mode = 'pan'
    }

    if (gestureRef.current.mode === 'pan') {
      onViewportChange({
        ...gesture.startViewport,
        x: gesture.startViewport.x + dx,
        y: gesture.startViewport.y + dy,
      })
    }
  }

  const handleAreaTouchEnd = (event: {
    changedTouches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
    touches?: Array<unknown>
  }) => {
    clearLongPressTimer()
    const wasLongPressPan = gestureRef.current.longPressPan
    // 先交给编辑器收尾（此时仍可识别长按拖会话），再解除拖拽锁
    onTouchEnd(event)
    if (wasLongPressPan) {
      gestureRef.current.longPressPan = false
      onLongPressPanChange?.(false)
    }
    gestureRef.current.mode = 'none'
  }

  const handleAreaTouchCancel = () => {
    clearLongPressTimer()
    const wasLongPressPan = gestureRef.current.longPressPan
    onTouchCancel()
    if (wasLongPressPan) {
      gestureRef.current.longPressPan = false
      onLongPressPanChange?.(false)
    }
    gestureRef.current.mode = 'none'
  }

  const contentTransform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
  const showSource = Boolean(sourceImageSrc) && (layerMode === 'source' || layerMode === 'compare')
  const showPattern = layerMode === 'pattern' || layerMode === 'compare'
  const patternOpacity = layerMode === 'compare' ? 0.58 : 1
  const sourceLayerStyle = resolveSourceLayerStyle(imageWidth, imageHeight, sourceCrop)

  return (
    <View
      id='pattern-editor-viewport-area'
      className='pattern-editor__area pattern-editor__area--fill'
      style={{
        pointerEvents: interactive ? 'auto' : 'none',
      }}
      onTouchStart={handleAreaTouchStart}
      onTouchMove={handleAreaTouchMove}
      onTouchEnd={handleAreaTouchEnd}
      onTouchCancel={handleAreaTouchCancel}
      catchMove={interactive}
    >
      <View
        className='pattern-editor__content'
        style={{
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transform: contentTransform,
        }}
      >
        <View
          id='pattern-editor-image-wrap'
          className='pattern-editor__image-wrap'
          style={{
            width: `${imageWidth}px`,
            height: `${imageHeight}px`,
          }}
        >
          {showSource ? (
            <Image
              className='pattern-editor__image pattern-editor__image--source'
              src={sourceImageSrc}
              style={{
                width: `${sourceLayerStyle.width}px`,
                height: `${sourceLayerStyle.height}px`,
                left: `${sourceLayerStyle.left}px`,
                top: `${sourceLayerStyle.top}px`,
              }}
              mode='scaleToFill'
              showMenuByLongpress={false}
            />
          ) : null}

          {showPattern
            ? patternBuffers.map((buffer) => {
              const isActive = buffer.key === activePatternBufferKey
              const isPending = buffer.key === pendingPatternBufferKey
              if (!buffer.src || (!isActive && !isPending)) return null
              return (
                <Image
                  key={buffer.key}
                  className={`pattern-editor__image pattern-editor__image--pattern-buffer${isActive ? ' is-active' : ''}${isPending ? ' is-pending' : ''}`}
                  src={buffer.src}
                  style={{
                    width: `${imageWidth}px`,
                    height: `${imageHeight}px`,
                    opacity: isActive ? patternOpacity : 0,
                  }}
                  showMenuByLongpress={false}
                  onLoad={() => onPatternBufferLoad(buffer.key)}
                  onError={() => onPatternBufferError(buffer.key)}
                />
              )
            })
            : null}
        </View>
        <View className='pattern-editor__highlights-layer'>
          {highlights.map(({ index, col, row, color }) => (
            <View
              key={index}
              className={`pattern-editor__cell-highlight${color ? ' pattern-editor__cell-highlight--paint' : ''}`}
              style={{
                left: `${col * highlightCellPx}px`,
                top: `${row * highlightCellPx}px`,
                width: `${highlightCellPx}px`,
                height: `${highlightCellPx}px`,
                ...(color ? { backgroundColor: color } : null),
              }}
            />
          ))}
        </View>
      </View>
    </View>
  )
}

export default EditorViewport
