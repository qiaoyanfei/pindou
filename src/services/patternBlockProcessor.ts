import {
  applyExteriorBackgroundMask,
  downsampleExteriorBackground,
  matchRgbGridWithExteriorBackground,
} from '@/services/colorMatcher'
import { removeIsolatedSpeckles } from '@/services/patternDenoise'
import {
  consolidateDarkOutlines,
  downsamplePatternMajority,
} from '@/services/patternOutline'
import type { CropRect } from '@/services/backgroundMatting'
import type { CanvasNode } from '@/services/imageProcessor'
import { extractBlockDominantColors } from '@/services/imageProcessor'
import {
  PATTERN_DARK_LUMA,
  PATTERN_DARK_RATIO,
  PATTERN_INTERMEDIATE_SCALE,
  PATTERN_SAMPLES_PER_CELL,
  PATTERN_SPECKLE_MAX_COUNT,
} from '@/utils/constants'
import type { PatternResult } from '@/types'
import type { StyleMode } from '@/types'
import type { PatternProgressCallback } from '@/services/patternPipeline'

export async function processBlockPattern(
  canvas: CanvasNode,
  imagePath: string,
  cropRect: CropRect,
  targetWidth: number,
  targetHeight: number,
  styleMode: StyleMode = 'portrait',
  onProgress?: PatternProgressCallback,
): Promise<PatternResult> {
  const intermediateWidth = targetWidth * PATTERN_INTERMEDIATE_SCALE
  const intermediateHeight = targetHeight * PATTERN_INTERMEDIATE_SCALE

  await onProgress?.('正在采样颜色...')
  const sample = await extractBlockDominantColors(
    canvas,
    imagePath,
    intermediateWidth,
    intermediateHeight,
    PATTERN_SAMPLES_PER_CELL,
    cropRect,
    {
      darkLumaThreshold: PATTERN_DARK_LUMA,
      darkRatioThreshold: PATTERN_DARK_RATIO,
      styleMode,
    },
  )

  await onProgress?.('正在匹配色号...')
  let pattern = matchRgbGridWithExteriorBackground(
    sample.colors,
    intermediateWidth,
    intermediateHeight,
    sample.exteriorBackground,
  )
  pattern = downsamplePatternMajority(pattern, targetWidth, targetHeight, styleMode)

  if (styleMode === 'portrait') {
    await onProgress?.('正在优化边缘...')
    const exteriorAtTarget = downsampleExteriorBackground(
      sample.exteriorBackground,
      intermediateWidth,
      intermediateHeight,
      targetWidth,
      targetHeight,
    )
    pattern = applyExteriorBackgroundMask(pattern, exteriorAtTarget)
  }

  await onProgress?.('正在生成图纸...')
  pattern = consolidateDarkOutlines(pattern, styleMode)
  pattern = removeIsolatedSpeckles(pattern, PATTERN_SPECKLE_MAX_COUNT, styleMode)
  return pattern
}
