import { Canvas, View } from '@tarojs/components'
import { useEffect, useRef } from 'react'
import Taro from '@tarojs/taro'
import {
  getExportSheetPixelSize,
  getMaxExportCellPx,
  getPreviewCellPx,
  getSafeExportCellPx,
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
  /** 缩略图等场景固定不显示色号；全屏高清预览与导出按 config.showColorCode */
  hideColorCode?: boolean
  creatorNickname?: string
  showSheetHeader?: boolean
  showWatermark?: boolean
  /** 导出时使用当前规格在 Canvas 上限内的最大 cellPx */
  maxExportResolution?: boolean
  showMirrorLabel?: boolean
  onReady?: () => void
}

function resolveCellPx(
  pattern: PatternResult,
  config: PatternConfig,
  mode: 'preview' | 'export',
  showSheetHeader: boolean,
  cellPxOverride?: number,
  maxExportResolution?: boolean,
): number {
  if (mode === 'export') {
    if (maxExportResolution) {
      return getMaxExportCellPx(pattern, { showSheetHeader })
    }
    const exportCellPx = cellPxOverride ?? config.exportCellPx
    return getSafeExportCellPx(pattern, exportCellPx, { showSheetHeader })
  }
  return cellPxOverride ?? getPreviewCellPx(pattern)
}

export default function PatternCanvas({
  canvasId,
  pattern,
  config,
  mode = 'preview',
  hidden = false,
  cellPx: cellPxOverride,
  hideColorCode = false,
  creatorNickname,
  showSheetHeader = true,
  showWatermark = true,
  maxExportResolution = false,
  showMirrorLabel = false,
  onReady,
}: PatternCanvasProps) {
  const readyRef = useRef(false)

  useEffect(() => {
    readyRef.current = false
    const timer = setTimeout(() => {
      drawPattern()
    }, 120)

    return () => clearTimeout(timer)
  }, [pattern, config, mode, canvasId, cellPxOverride, hideColorCode, creatorNickname, showSheetHeader, showWatermark, maxExportResolution, showMirrorLabel])

  const drawPattern = (retry = 0) => {
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

        if (!canvas) {
          if (retry < 8) {
            setTimeout(() => drawPattern(retry + 1), 150)
          }
          return
        }

        const cellPx = resolveCellPx(pattern, config, mode, showSheetHeader, cellPxOverride, maxExportResolution)

        const renderOptions = {
          cellPx,
          showGrid: config.showGrid,
          showColorCode: hideColorCode ? false : config.showColorCode,
          minCellPxForLabel: mode === 'export' ? 10 : 12,
        }

        if (mode === 'export') {
          renderPatternSheetToCanvas(canvas, pattern, {
            ...renderOptions,
            creatorNickname,
            showSheetHeader,
            showWatermark,
            showMirrorLabel,
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

  const cellPx = resolveCellPx(pattern, config, mode, showSheetHeader, cellPxOverride, maxExportResolution)

  const canvasStyle =
    mode === 'export'
      ? (() => {
          const size = getExportSheetPixelSize(pattern, cellPx, { showSheetHeader })
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
