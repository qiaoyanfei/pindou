import { analyzeContentCrop } from '@/services/backgroundMatting'
import { processBlockPattern } from '@/services/patternBlockProcessor'
import {
  computeGridSize,
  loadCanvasNode,
} from '@/services/imageProcessor'
import type { PatternConfig, PatternResult } from '@/types'

export type PatternProgressCallback = (title: string) => void | Promise<void>

export async function generatePatternFromImage(
  imagePath: string,
  config: PatternConfig,
  canvasId = 'process-canvas',
  onProgress?: PatternProgressCallback,
): Promise<PatternResult> {
  await onProgress?.('正在读取图片...')
  const canvas = await loadCanvasNode(canvasId)
  await onProgress?.('正在分析图片...')
  const { crop } = await analyzeContentCrop(canvas, imagePath)
  const gridSize = computeGridSize(crop.width, crop.height, config.longEdge, config.styleMode)

  return processBlockPattern(
    canvas,
    imagePath,
    crop,
    gridSize.width,
    gridSize.height,
    config.styleMode,
    onProgress,
  )
}
