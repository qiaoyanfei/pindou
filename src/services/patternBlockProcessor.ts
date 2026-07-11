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
import type { PatternGenerationOptions, PatternProgressCallback } from '@/services/patternPipeline'
import { throwIfAborted, computeStageProgressPercent } from '@/utils/patternGenerationProgress'

export async function processBlockPattern(
  canvas: CanvasNode,
  imagePath: string,
  cropRect: CropRect,
  targetWidth: number,
  targetHeight: number,
  styleMode: StyleMode = 'portrait',
  onProgress?: PatternProgressCallback,
  options?: PatternGenerationOptions,
): Promise<PatternResult> {
  const signal = options?.signal
  const intermediateWidth = targetWidth * PATTERN_INTERMEDIATE_SCALE
  const intermediateHeight = targetHeight * PATTERN_INTERMEDIATE_SCALE

  const sampleStage = '采样颜色...'
  await onProgress?.(sampleStage, { percent: computeStageProgressPercent(sampleStage, 0) })
  throwIfAborted(signal)
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
      signal,
      onSampleProgress: (ratio) => {
        void onProgress?.(sampleStage, {
          percent: computeStageProgressPercent(sampleStage, ratio),
        })
      },
    },
  )

  const matchStage = '匹配色号...'
  await onProgress?.(matchStage, { percent: computeStageProgressPercent(matchStage, 0) })
  throwIfAborted(signal)
  let pattern = await matchRgbGridWithExteriorBackground(
    sample.colors,
    intermediateWidth,
    intermediateHeight,
    sample.exteriorBackground,
    signal,
    (done, total) => {
      void onProgress?.(matchStage, {
        percent: computeStageProgressPercent(matchStage, done / total),
      })
    },
  )
  pattern = downsamplePatternMajority(pattern, targetWidth, targetHeight, styleMode)

  if (styleMode === 'portrait') {
    const optimizeStage = '优化边缘...'
    await onProgress?.(optimizeStage, { percent: computeStageProgressPercent(optimizeStage, 0) })
    throwIfAborted(signal)
    const exteriorAtTarget = downsampleExteriorBackground(
      sample.exteriorBackground,
      intermediateWidth,
      intermediateHeight,
      targetWidth,
      targetHeight,
    )
    pattern = applyExteriorBackgroundMask(pattern, exteriorAtTarget)
  }

  const generateStage = '生成图纸...'
  await onProgress?.(generateStage, { percent: computeStageProgressPercent(generateStage, 0) })
  throwIfAborted(signal)
  pattern = consolidateDarkOutlines(pattern, styleMode)
  pattern = removeIsolatedSpeckles(pattern, PATTERN_SPECKLE_MAX_COUNT, styleMode)
  await onProgress?.(generateStage, { percent: 100 })
  return pattern
}
