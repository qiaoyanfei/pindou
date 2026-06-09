import { analyzeContentCrop } from '@/services/backgroundMatting'
import { processBlockPattern } from '@/services/patternBlockProcessor'
import {
  computeGridSize,
  loadCanvasNode,
} from '@/services/imageProcessor'
import type { PatternConfig, PatternResult } from '@/types'

export async function generatePatternFromImage(
  imagePath: string,
  config: PatternConfig,
  canvasId = 'process-canvas',
): Promise<PatternResult> {
  const canvas = await loadCanvasNode(canvasId)
  const { crop } = await analyzeContentCrop(canvas, imagePath)
  const gridSize = computeGridSize(crop.width, crop.height, config.longEdge, config.styleMode)

  return processBlockPattern(
    canvas,
    imagePath,
    crop,
    gridSize.width,
    gridSize.height,
    config.styleMode,
  )
}
