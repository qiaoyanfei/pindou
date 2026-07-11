import { analyzeContentCrop } from '@/services/backgroundMatting'
import { loadCanvasNode } from '@/services/imageProcessor'
import {
  STYLE_MODE_AUTO_LONG_EDGE_LIMITS,
  STYLE_MODE_DEFAULT_LONG_EDGE,
} from '@/utils/constants'
import { throwIfAborted, computeStageProgressPercent, type PatternProgressContext } from '@/utils/patternGenerationProgress'
import type { StyleMode } from '@/types'

type GridRecommendProgress = (
  message: string,
  context?: PatternProgressContext,
) => void | Promise<void>

const ANALYSIS_MAX_EDGE = 192

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function roundToEven(value: number): number {
  return Math.round(value / 2) * 2
}

function getLuma(data: Uint8ClampedArray, index: number): number {
  const r = data[index]
  const g = data[index + 1]
  const b = data[index + 2]
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function getChannelSpread(data: Uint8ClampedArray, index: number): number {
  const r = data[index]
  const g = data[index + 1]
  const b = data[index + 2]
  return Math.max(r, g, b) - Math.min(r, g, b)
}

function normalizeMetric(value: number, low: number, high: number): number {
  if (high <= low) return 0
  return clamp((value - low) / (high - low), 0, 1)
}

function computeDetailScore(data: Uint8ClampedArray, width: number, height: number, styleMode: StyleMode): number {
  if (width <= 1 || height <= 1) return 0

  let edgeCount = 0
  let darkCount = 0
  let gradientTotal = 0
  let lumaTotal = 0
  let lumaSquareTotal = 0
  let channelSpreadTotal = 0
  const total = width * height

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const luma = getLuma(data, index)
      lumaTotal += luma
      lumaSquareTotal += luma * luma
      channelSpreadTotal += getChannelSpread(data, index)
      if (luma < 96) darkCount += 1

      if (x >= width - 1 || y >= height - 1) continue
      const rightLuma = getLuma(data, (y * width + x + 1) * 4)
      const bottomLuma = getLuma(data, ((y + 1) * width + x) * 4)
      const gradient = Math.abs(rightLuma - luma) + Math.abs(bottomLuma - luma)
      gradientTotal += gradient
      if (gradient >= 42) edgeCount += 1
    }
  }

  const gradientSamples = Math.max(1, (width - 1) * (height - 1))
  const edgeDensity = edgeCount / gradientSamples
  const darkRatio = darkCount / total
  const meanGradient = gradientTotal / gradientSamples
  const meanLuma = lumaTotal / total
  const lumaVariance = Math.max(0, lumaSquareTotal / total - meanLuma * meanLuma)
  const lumaStd = Math.sqrt(lumaVariance)
  const meanChannelSpread = channelSpreadTotal / total

  if (styleMode === 'manga') {
    const edgeScore = normalizeMetric(edgeDensity, 0.035, 0.18)
    const lineScore = normalizeMetric(darkRatio, 0.035, 0.24)
    const gradientScore = normalizeMetric(meanGradient, 8, 36)
    return clamp(edgeScore * 0.55 + lineScore * 0.25 + gradientScore * 0.2, 0, 1)
  }

  const edgeScore = normalizeMetric(edgeDensity, 0.04, 0.22)
  const contrastScore = normalizeMetric(lumaStd, 28, 78)
  const colorScore = normalizeMetric(meanChannelSpread, 12, 54)
  return clamp(edgeScore * 0.45 + contrastScore * 0.35 + colorScore * 0.2, 0, 1)
}

function mapScoreToLongEdge(score: number, styleMode: StyleMode): number {
  const limits = STYLE_MODE_AUTO_LONG_EDGE_LIMITS[styleMode]
  const easedScore = Math.pow(clamp(score, 0, 1), 0.85)
  const raw = limits.min + (limits.max - limits.min) * easedScore
  return clamp(roundToEven(raw), limits.min, limits.max)
}

export function clampAutoLongEdge(longEdge: number, styleMode: StyleMode): number {
  const limits = STYLE_MODE_AUTO_LONG_EDGE_LIMITS[styleMode]
  return clamp(Math.round(longEdge), limits.min, limits.max)
}

export function getFallbackAutoLongEdge(styleMode: StyleMode): number {
  return clampAutoLongEdge(STYLE_MODE_DEFAULT_LONG_EDGE[styleMode], styleMode)
}

export async function recommendLongEdgeFromImage(
  imagePath: string,
  styleMode: StyleMode,
  canvasId: string,
  signal?: import('@/utils/patternGenerationProgress').PatternAbortSignal,
  onProgress?: GridRecommendProgress,
): Promise<number> {
  throwIfAborted(signal)
  await onProgress?.('读取图片...', { percent: computeStageProgressPercent('读取图片...', 0) })
  const canvas = await loadCanvasNode(canvasId)
  throwIfAborted(signal)
  await onProgress?.('分析图片...', { percent: computeStageProgressPercent('分析图片...', 0) })
  const { crop } = await analyzeContentCrop(canvas, imagePath)
  throwIfAborted(signal)
  const scale = Math.min(1, ANALYSIS_MAX_EDGE / Math.max(crop.width, crop.height))
  const analysisWidth = Math.max(1, Math.round(crop.width * scale))
  const analysisHeight = Math.max(1, Math.round(crop.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法获取 Canvas 上下文')

  canvas.width = analysisWidth
  canvas.height = analysisHeight
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = true

  const image = canvas.createImage()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = imagePath
  })
  throwIfAborted(signal)

  ctx.clearRect(0, 0, analysisWidth, analysisHeight)
  ctx.drawImage(
    image as unknown as CanvasImageSource,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    analysisWidth,
    analysisHeight,
  )

  const { data } = ctx.getImageData(0, 0, analysisWidth, analysisHeight)
  throwIfAborted(signal)
  return mapScoreToLongEdge(computeDetailScore(data, analysisWidth, analysisHeight, styleMode), styleMode)
}
