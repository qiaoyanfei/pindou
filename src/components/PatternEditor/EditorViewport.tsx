import { View, Image, MovableArea, MovableView } from '@tarojs/components'
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

interface EditorViewportProps {
  viewportWidth: number
  scrollHeight: number
  imageSrc: string
  preloadSrc: string
  imageWidth: number
  imageHeight: number
  patternWidth: number
  cellPxKey: string
  highlights: CellHighlight[]
  highlightCellPx: number
  viewport: ViewportTransform
  onViewChange: (event: { detail: { x: number; y: number } }) => void
  onViewScale: (event: { detail: { x: number; y: number; scale: number } }) => void
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

function EditorViewport({
  viewportWidth,
  scrollHeight,
  imageSrc,
  preloadSrc,
  imageWidth,
  imageHeight,
  patternWidth,
  cellPxKey,
  highlights,
  highlightCellPx,
  viewport,
  onViewChange,
  onViewScale,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onPreloadLoad,
  onPreloadError,
  onDisplayError,
}: EditorViewportProps) {
  const transformProps = {
    scaleValue: viewport.scale,
    x: viewport.x,
    y: viewport.y,
  }

  return (
    <MovableArea
      id='pattern-editor-movable-area'
      className='pattern-editor__area'
      style={{ width: `${viewportWidth}px`, height: `${scrollHeight}px` }}
    >
      <MovableView
        key={`${patternWidth}x${cellPxKey}`}
        className='pattern-editor__content'
        direction='all'
        inertia
        scale
        animation={false}
        scaleMin={0.2}
        scaleMax={4}
        {...transformProps}
        style={{
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
        }}
        onChange={onViewChange}
        onScale={onViewScale}
      >
        <View
          id='pattern-editor-image-wrap'
          className='pattern-editor__image-wrap'
          style={{
            width: `${imageWidth}px`,
            height: `${imageHeight}px`,
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
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
          <View className='pattern-editor__highlights'>
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
      </MovableView>
    </MovableArea>
  )
}

export default EditorViewport
