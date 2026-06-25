import { useRef } from 'react'
import { View, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

export interface CellHighlight {
  index: number
  col: number
  row: number
}

export interface ViewportTransform {
  scale: number
  x: number
  y: number
}

const SCALE_MIN = 0.2
const SCALE_MAX = 4
const PAN_START_TOLERANCE = 6

interface EditorViewportProps {
  imageSrc: string
  preloadSrc: string
  imageWidth: number
  imageHeight: number
  viewport: ViewportTransform
  interactive: boolean
  highlights: CellHighlight[]
  highlightCellPx: number
  onViewportChange: (viewport: ViewportTransform) => void
  onTouchStart: (event: {
    touches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
  }) => void
  onTouchMove: (event: {
    touches?: Array<unknown>
    stopPropagation?: () => void
  }) => void
  onTouchEnd: (event: {
    changedTouches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
    touches?: Array<unknown>
  }) => void
  onPreloadLoad: () => void
  onPreloadError: () => void
  onDisplayError: () => void
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

function EditorViewport({
  imageSrc,
  preloadSrc,
  imageWidth,
  imageHeight,
  viewport,
  interactive,
  highlights,
  highlightCellPx,
  onViewportChange,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onPreloadLoad,
  onPreloadError,
  onDisplayError,
}: EditorViewportProps) {
  const gestureRef = useRef<{
    mode: 'none' | 'pending' | 'pan' | 'pinch'
    startX: number
    startY: number
    startViewport: ViewportTransform
    pinchStartDistance: number
    pinchMidX: number
    pinchMidY: number
    pinchWorldX: number
    pinchWorldY: number
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
  })

  const areaRectRef = useRef({ left: 0, top: 0 })

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
      }
      return
    }

    const touch = readTouch(touches[0] ?? {})
    if (!touch) return
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
    }
  }

  const handleAreaTouchMove = (event: {
    touches?: Array<{ clientX?: number; clientY?: number; x?: number; y?: number }>
    stopPropagation?: () => void
  }) => {
    onTouchMove(event)

    if (!interactive) return

    const touches = event.touches ?? []
    const gesture = gestureRef.current

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

    if (gesture.mode === 'pinch') return

    const touch = readTouch(touches[0] ?? {})
    if (!touch) return

    const dx = touch.clientX - gesture.startX
    const dy = touch.clientY - gesture.startY

    if (gesture.mode === 'pending') {
      if (Math.hypot(dx, dy) < PAN_START_TOLERANCE) return
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
    gestureRef.current.mode = 'none'
    onTouchEnd(event)
  }

  const contentTransform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`

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
          {preloadSrc ? (
            <Image
              className='pattern-editor__image pattern-editor__image--preload'
              src={preloadSrc}
              style={{
                width: `${imageWidth}px`,
                height: `${imageHeight}px`,
              }}
              showMenuByLongpress={false}
              onLoad={onPreloadLoad}
              onError={onPreloadError}
            />
          ) : null}
          <Image
            className='pattern-editor__image'
            src={imageSrc}
            style={{
              width: `${imageWidth}px`,
              height: `${imageHeight}px`,
            }}
            showMenuByLongpress={false}
            onError={onDisplayError}
          />
        </View>
        <View className='pattern-editor__highlights-layer'>
          {highlights.map(({ index, col, row }) => (
            <View
              key={index}
              className='pattern-editor__cell-highlight'
              style={{
                left: `${col * highlightCellPx}px`,
                top: `${row * highlightCellPx}px`,
                width: `${highlightCellPx}px`,
                height: `${highlightCellPx}px`,
              }}
            />
          ))}
        </View>
      </View>
    </View>
  )
}

export default EditorViewport
