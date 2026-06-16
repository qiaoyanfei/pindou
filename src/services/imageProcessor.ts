import Taro from '@tarojs/taro'
import { clampLongEdge } from '@/utils/constants'
import type { CropRect } from '@/services/backgroundMatting'
import {
  buildExteriorBackgroundMask,
  buildPortraitSubjectMask,
  isExteriorBackgroundPixel,
  isPortraitSubjectPixel,
} from '@/services/backgroundMatting'
import {
  BACKGROUND_LIGHT_LUMA,
  isExteriorBackgroundCell,
  PATTERN_MANGA_FILL_LIGHT_LUMA,
  PATTERN_MANGA_FORCE_DARK_RATIO,
  PATTERN_MIXED_LIGHT_RATIO,
} from '@/utils/constants'
import type { StyleMode } from '@/types'

export interface GridSize {
  width: number
  height: number
}

export type Rgb = [number, number, number]

export function computeGridSize(
  imageWidth: number,
  imageHeight: number,
  longEdge: number,
  styleMode: StyleMode = 'portrait',
): GridSize {
  const clampedEdge = clampLongEdge(longEdge, styleMode)

  if (imageWidth >= imageHeight) {
    const width = clampedEdge
    const height = Math.max(1, Math.round((clampedEdge * imageHeight) / imageWidth))
    return { width, height }
  }

  const height = clampedEdge
  const width = Math.max(1, Math.round((clampedEdge * imageWidth) / imageHeight))
  return { width, height }
}

export async function getImageDimensions(imagePath: string): Promise<GridSize> {
  const info = await Taro.getImageInfo({ src: imagePath })
  return { width: info.width, height: info.height }
}

type CanvasNode = {
  getContext: (type: '2d') => CanvasRenderingContext2D | null
  width: number
  height: number
  createImage: () => WechatMiniprogram.Image
}

export type { CanvasNode }

export function loadCanvasNode(canvasId: string): Promise<CanvasNode> {
  return new Promise((resolve, reject) => {
    const query = Taro.createSelectorQuery()
    query
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        const node = res?.[0]?.node as CanvasNode | undefined
        if (!node) {
          reject(new Error('Canvas 初始化失败'))
          return
        }
        resolve(node)
      })
  })
}

function getLuma(rgb: Rgb): number {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]
}

function dominantRgbFromPixels(pixels: Rgb[]): Rgb {
  if (pixels.length === 0) return [255, 255, 255]

  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>()
  for (const [r, g, b] of pixels) {
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.r += r
      bucket.g += g
      bucket.b += b
    } else {
      buckets.set(key, { count: 1, r, g, b })
    }
  }

  let bestCount = 0
  let bestR = 255
  let bestG = 255
  let bestB = 255
  buckets.forEach((bucket) => {
    if (bucket.count > bestCount) {
      bestCount = bucket.count
      bestR = bucket.r
      bestG = bucket.g
      bestB = bucket.b
    }
  })

  return [
    Math.round(bestR / bestCount),
    Math.round(bestG / bestCount),
    Math.round(bestB / bestCount),
  ]
}

function dominantRgbFromBlock(
  pixels: Rgb[],
  darkLumaThreshold: number,
  darkRatioThreshold: number,
  styleMode: StyleMode = 'portrait',
): Rgb {
  if (pixels.length === 0) return [255, 255, 255]

  let darkCount = 0
  let lightCount = 0
  for (const rgb of pixels) {
    const luma = getLuma(rgb)
    if (luma < darkLumaThreshold) darkCount += 1
    if (luma >= BACKGROUND_LIGHT_LUMA) lightCount += 1
  }

  const darkRatio = darkCount / pixels.length

  if (styleMode === 'manga') {
    if (darkRatio >= PATTERN_MANGA_FORCE_DARK_RATIO) return [18, 18, 18]
    const fillPixels = pixels.filter((rgb) => getLuma(rgb) >= darkLumaThreshold)
    if (fillPixels.length > 0) {
      const lightPixels = fillPixels.filter((rgb) => getLuma(rgb) >= PATTERN_MANGA_FILL_LIGHT_LUMA)
      if (lightPixels.length > 0) return dominantRgbFromPixels(lightPixels)
      return dominantRgbFromPixels(fillPixels)
    }
    return [18, 18, 18]
  }

  const lightRatio = lightCount / pixels.length
  const isMixedLightOutline =
    darkRatio >= darkRatioThreshold && lightRatio >= PATTERN_MIXED_LIGHT_RATIO

  if (darkRatio >= darkRatioThreshold && !isMixedLightOutline) {
    return [18, 18, 18]
  }

  if (isMixedLightOutline) {
    const lightPixels = pixels.filter((rgb) => getLuma(rgb) >= BACKGROUND_LIGHT_LUMA)
    if (lightPixels.length > 0) {
      return dominantRgbFromPixels(lightPixels)
    }
  }

  return dominantRgbFromPixels(pixels)
}

export interface BlockSampleResult {
  colors: Rgb[]
  exteriorBackground: boolean[]
}

/** 分块主色采样：每格取裁剪区域对应块众数，并保护近黑描边 */
export async function extractBlockDominantColors(
  canvas: CanvasNode,
  imagePath: string,
  gridWidth: number,
  gridHeight: number,
  samplesPerCell: number,
  cropRect: CropRect,
  options?: {
    darkLumaThreshold?: number
    darkRatioThreshold?: number
    styleMode?: StyleMode
  },
): Promise<BlockSampleResult> {
  const darkLuma = options?.darkLumaThreshold ?? 48
  const darkRatio = options?.darkRatioThreshold ?? 0.22
  const styleMode = options?.styleMode ?? 'portrait'

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法获取 Canvas 上下文')

  const sampleWidth = gridWidth * samplesPerCell
  const sampleHeight = gridHeight * samplesPerCell

  canvas.width = sampleWidth
  canvas.height = sampleHeight
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = styleMode !== 'portrait'

  const image = canvas.createImage()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = imagePath
  })

  ctx.clearRect(0, 0, sampleWidth, sampleHeight)
  ctx.drawImage(
    image as unknown as CanvasImageSource,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    0,
    0,
    sampleWidth,
    sampleHeight,
  )

  const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight)
  const { data } = imageData
  const useSubjectMask = styleMode === 'portrait'
  const exteriorMask = useSubjectMask
    ? null
    : buildExteriorBackgroundMask(data, sampleWidth, sampleHeight)
  const subjectMask = useSubjectMask
    ? buildPortraitSubjectMask(data, sampleWidth, sampleHeight)
    : null
  const colors: Rgb[] = new Array(gridWidth * gridHeight)
  const exteriorBackground: boolean[] = new Array(gridWidth * gridHeight)

  for (let gy = 0; gy < gridHeight; gy += 1) {
    for (let gx = 0; gx < gridWidth; gx += 1) {
      const block: Rgb[] = []
      const x0 = gx * samplesPerCell
      const y0 = gy * samplesPerCell
      let exteriorCount = 0
      let subjectCount = 0
      let blockPixels = 0

      for (let sy = 0; sy < samplesPerCell; sy += 1) {
        for (let sx = 0; sx < samplesPerCell; sx += 1) {
          const px = x0 + sx
          const py = y0 + sy
          const pi = (py * sampleWidth + px) * 4
          block.push([data[pi], data[pi + 1], data[pi + 2]])
          blockPixels += 1
          if (useSubjectMask && subjectMask) {
            if (isPortraitSubjectPixel(subjectMask, sampleWidth, px, py)) {
              subjectCount += 1
            }
          } else if (exteriorMask && isExteriorBackgroundPixel(exteriorMask, sampleWidth, px, py)) {
            exteriorCount += 1
          }
        }
      }

      const cellIndex = gy * gridWidth + gx
      colors[cellIndex] = dominantRgbFromBlock(block, darkLuma, darkRatio, styleMode)
      if (useSubjectMask) {
        exteriorBackground[cellIndex] = subjectCount * 2 < blockPixels
      } else {
        const exteriorRatio = exteriorCount / blockPixels
        const interiorRatio = 1 - exteriorRatio
        exteriorBackground[cellIndex] = isExteriorBackgroundCell(
          exteriorRatio,
          interiorRatio,
          styleMode,
        )
      }
    }
  }

  return { colors, exteriorBackground }
}

export async function extractPixelGrid(
  canvas: CanvasNode,
  imagePath: string,
  gridWidth: number,
  gridHeight: number,
): Promise<Uint8ClampedArray> {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法获取 Canvas 上下文')

  canvas.width = gridWidth
  canvas.height = gridHeight
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false

  const image = canvas.createImage()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = imagePath
  })

  ctx.clearRect(0, 0, gridWidth, gridHeight)
  ctx.drawImage(image as unknown as CanvasImageSource, 0, 0, gridWidth, gridHeight)

  const imageData = ctx.getImageData(0, 0, gridWidth, gridHeight)
  return imageData.data
}
