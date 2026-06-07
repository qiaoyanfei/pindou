import { matchRgbGridWithExteriorBackground } from '@/services/colorMatcher'
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

export async function processBlockPattern(
  canvas: CanvasNode,
  imagePath: string,
  cropRect: CropRect,
  targetWidth: number,
  targetHeight: number,
): Promise<PatternResult> {
  const intermediateWidth = targetWidth * PATTERN_INTERMEDIATE_SCALE
  const intermediateHeight = targetHeight * PATTERN_INTERMEDIATE_SCALE

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
    },
  )

  let pattern = matchRgbGridWithExteriorBackground(
    sample.colors,
    intermediateWidth,
    intermediateHeight,
    sample.exteriorBackground,
  )
  pattern = downsamplePatternMajority(pattern, targetWidth, targetHeight)
  pattern = consolidateDarkOutlines(pattern)
  pattern = removeIsolatedSpeckles(pattern, PATTERN_SPECKLE_MAX_COUNT)
  return pattern
}
