import { Canvas, View } from '@tarojs/components'
import { useEffect, useRef } from 'react'
import Taro from '@tarojs/taro'
import {
  getExportSheetPixelSize,
  getPreviewCellPx,
  renderPatternSheetToCanvas,
  renderPatternToCanvas,
} from '@/services/patternRenderer'
import type { PatternConfig, PatternResult } from '@/types'
import './index.scss'

interface PatternCanvasProps {
  canvasId: string
  pattern: PatternResult
  config: PatternConfig
  mode?: 'preview' | 'export'
  hidden?: boolean
  cellPx?: number
  creatorNickname?: string
  onReady?: () => void
}

export default function PatternCanvas({
  canvasId,
  pattern,
  config,
  mode = 'preview',
  hidden = false,
  cellPx: cellPxOverride,
  creatorNickname,
  onReady,
}: PatternCanvasProps) {
  const readyRef = useRef(false)

  useEffect(() => {
    readyRef.current = false
    const timer = setTimeout(() => {
      drawPattern()
    }, 120)

    return () => clearTimeout(timer)
  }, [pattern, config, mode, canvasId, cellPxOverride, creatorNickname])

  const drawPattern = () => {
    const query = Taro.createSelectorQuery()
    query
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res?.[0]?.node as {
          getContext: (type: '2d') => CanvasRenderingContext2D | null
          width: number
          height: number
        } | undefined

        if (!canvas) return

        const cellPx =
          cellPxOverride ??
          (mode === 'export' ? config.exportCellPx : getPreviewCellPx(pattern))

        const renderOptions = {
          cellPx,
          showGrid: config.showGrid,
          showColorCode: config.showColorCode,
          minCellPxForLabel: mode === 'export' ? 10 : 12,
        }

        if (mode === 'export') {
          renderPatternSheetToCanvas(canvas, pattern, {
            ...renderOptions,
            creatorNickname,
          })
        } else {
          renderPatternToCanvas(canvas, pattern, renderOptions)
        }

        if (!readyRef.current) {
          readyRef.current = true
          onReady?.()
        }
      })
  }

  const cellPx =
    cellPxOverride ??
    (mode === 'export' ? config.exportCellPx : getPreviewCellPx(pattern))

  const canvasStyle =
    mode === 'export'
      ? (() => {
          const size = getExportSheetPixelSize(pattern, cellPx)
          return {
            width: `${size.width}px`,
            height: `${size.height}px`,
          }
        })()
      : {
          width: `${pattern.width * cellPx}px`,
          height: `${pattern.height * cellPx}px`,
        }

  const classNames = [
    'pattern-canvas',
    `pattern-canvas--${mode}`,
    hidden ? 'pattern-canvas--hidden' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <View className={classNames}>
      <Canvas
        type='2d'
        id={canvasId}
        canvasId={canvasId}
        style={canvasStyle}
        className='pattern-canvas__node'
      />
      {mode === 'preview' && !hidden && (
        <View className='pattern-canvas__meta'>
          {pattern.width}×{pattern.height} 格
        </View>
      )}
    </View>
  )
}
