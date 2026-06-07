import type { Rgb } from '@/services/imageProcessor'
import type { CanvasNode } from '@/services/imageProcessor'
import { getImageDimensions } from '@/services/imageProcessor'
import {
  BACKGROUND_ANALYSIS_MAX_EDGE,
  BACKGROUND_LIGHT_CHROMA,
  BACKGROUND_LIGHT_LUMA,
  BACKGROUND_RGB_TOLERANCE,
} from '@/utils/constants'

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ContentAnalysis {
  crop: CropRect
  backgroundRgb: Rgb
}

function getPixelRgb(data: Uint8ClampedArray, width: number, x: number, y: number): Rgb {
  const pi = (y * width + x) * 4
  return [data[pi], data[pi + 1], data[pi + 2]]
}

/** 白色 / 浅白色（高亮、低饱和度） */
export function isLightBackgroundRgb(rgb: Rgb): boolean {
  const [r, g, b] = rgb
  const min = Math.min(r, g, b)
  const max = Math.max(r, g, b)
  const luma = 0.299 * r + 0.587 * g + 0.114 * b
  return luma >= BACKGROUND_LIGHT_LUMA && max - min <= BACKGROUND_LIGHT_CHROMA
}

export function isBackgroundRgb(
  rgb: Rgb,
  background: Rgb,
  tolerance = BACKGROUND_RGB_TOLERANCE,
): boolean {
  if (isLightBackgroundRgb(rgb)) return true
  const dr = Math.abs(rgb[0] - background[0])
  const dg = Math.abs(rgb[1] - background[1])
  const db = Math.abs(rgb[2] - background[2])
  return dr <= tolerance && dg <= tolerance && db <= tolerance
}

function detectBackgroundRgb(data: Uint8ClampedArray, width: number, height: number): Rgb {
  const counts = new Map<number, { count: number; r: number; g: number; b: number }>()

  const add = (x: number, y: number) => {
    const rgb = getPixelRgb(data, width, x, y)
    if (!isLightBackgroundRgb(rgb)) return
    const [r, g, b] = rgb
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = counts.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.r += r
      bucket.g += g
      bucket.b += b
    } else {
      counts.set(key, { count: 1, r, g, b })
    }
  }

  for (let x = 0; x < width; x += 1) {
    add(x, 0)
    add(x, height - 1)
  }
  for (let y = 1; y < height - 1; y += 1) {
    add(0, y)
    add(width - 1, y)
  }

  if (counts.size === 0) return [255, 255, 255]

  let bestCount = 0
  let bestR = 255
  let bestG = 255
  let bestB = 255
  counts.forEach((bucket) => {
    if (bucket.count > bestCount) {
      bestCount = bucket.count
      bestR = Math.round(bucket.r / bucket.count)
      bestG = Math.round(bucket.g / bucket.count)
      bestB = Math.round(bucket.b / bucket.count)
    }
  })

  return [bestR, bestG, bestB]
}

/** 从四边泛洪：仅与画布边缘连通的浅白区域视为背景 */
export function buildExteriorBackgroundMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const mask = new Uint8Array(width * height)
  const visited = new Uint8Array(width * height)
  const queue: number[] = []

  const trySeed = (x: number, y: number) => {
    const index = y * width + x
    if (visited[index]) return
    if (!isLightBackgroundRgb(getPixelRgb(data, width, x, y))) return
    visited[index] = 1
    mask[index] = 1
    queue.push(index)
  }

  for (let x = 0; x < width; x += 1) {
    trySeed(x, 0)
    trySeed(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    trySeed(0, y)
    trySeed(width - 1, y)
  }

  while (queue.length > 0) {
    const index = queue.pop()!
    const x = index % width
    const y = Math.floor(index / width)

    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const ni = ny * width + nx
      if (visited[ni]) continue
      if (!isLightBackgroundRgb(getPixelRgb(data, width, nx, ny))) continue
      visited[ni] = 1
      mask[ni] = 1
      queue.push(ni)
    }
  }

  return mask
}

function findContentBoundsFromMask(mask: Uint8Array, width: number, height: number): CropRect {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] === 1) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width, height }
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

/** 分析原图背景色与主体裁剪区域（边缘连通浅白为背景） */
export async function analyzeContentCrop(
  canvas: CanvasNode,
  imagePath: string,
): Promise<ContentAnalysis> {
  const source = await getImageDimensions(imagePath)
  const longEdge = Math.max(source.width, source.height)
  const scale = Math.min(1, BACKGROUND_ANALYSIS_MAX_EDGE / longEdge)
  const analysisWidth = Math.max(1, Math.round(source.width * scale))
  const analysisHeight = Math.max(1, Math.round(source.height * scale))

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

  ctx.clearRect(0, 0, analysisWidth, analysisHeight)
  ctx.drawImage(
    image as unknown as CanvasImageSource,
    0,
    0,
    analysisWidth,
    analysisHeight,
  )

  const { data } = ctx.getImageData(0, 0, analysisWidth, analysisHeight)
  const backgroundRgb = detectBackgroundRgb(data, analysisWidth, analysisHeight)
  const exteriorMask = buildExteriorBackgroundMask(data, analysisWidth, analysisHeight)
  const analysisCrop = findContentBoundsFromMask(exteriorMask, analysisWidth, analysisHeight)

  const toSourceCoord = (value: number, max: number) =>
    Math.max(0, Math.min(Math.round(value / scale), max))

  const x = toSourceCoord(analysisCrop.x, source.width - 1)
  const y = toSourceCoord(analysisCrop.y, source.height - 1)
  const right = Math.min(
    source.width,
    Math.max(x + 1, toSourceCoord(analysisCrop.x + analysisCrop.width - 1, source.width - 1) + 1),
  )
  const bottom = Math.min(
    source.height,
    Math.max(y + 1, toSourceCoord(analysisCrop.y + analysisCrop.height - 1, source.height - 1) + 1),
  )

  return {
    backgroundRgb,
    crop: {
      x,
      y,
      width: Math.max(1, right - x),
      height: Math.max(1, bottom - y),
    },
  }
}

export function isExteriorBackgroundPixel(
  mask: Uint8Array,
  width: number,
  x: number,
  y: number,
): boolean {
  return mask[y * width + x] === 1
}
