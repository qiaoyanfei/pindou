import { analyzeContentCrop } from '@/services/backgroundMatting'
import { processBlockPattern } from '@/services/patternBlockProcessor'
import {
  computeGridSize,
  loadCanvasNode,
} from '@/services/imageProcessor'
import type { PatternConfig, PatternResult } from '@/types'
import { throwIfAborted, computeStageProgressPercent, type PatternProgressContext } from '@/utils/patternGenerationProgress'

export type PatternProgressCallback = (
  title: string,
  context?: PatternProgressContext,
) => void | Promise<void>

export interface PatternGenerationOptions {
  signal?: import('@/utils/patternGenerationProgress').PatternAbortSignal
}

export async function generatePatternFromImage(
  imagePath: string,
  config: PatternConfig,
  canvasId = 'process-canvas',
  onProgress?: PatternProgressCallback,
  options?: PatternGenerationOptions,
): Promise<PatternResult> {
  const signal = options?.signal
  await onProgress?.('读取图片...', { percent: computeStageProgressPercent('读取图片...', 0) })
  throwIfAborted(signal)
  const canvas = await loadCanvasNode(canvasId)
  await onProgress?.('分析图片...', { percent: computeStageProgressPercent('分析图片...', 0) })
  throwIfAborted(signal)
  const { crop } = await analyzeContentCrop(canvas, imagePath)
  throwIfAborted(signal)
  const gridSize = computeGridSize(crop.width, crop.height, config.longEdge, config.styleMode)

  return processBlockPattern(
    canvas,
    imagePath,
    crop,
    gridSize.width,
    gridSize.height,
    config.styleMode,
    onProgress,
    options,
  )
}
