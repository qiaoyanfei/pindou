import {
  getImageDimensions,
  loadCanvasImageWithRetry,
  type CanvasNode,
  type Rgb,
} from '@/services/imageProcessor'
import { findBestSymmetryAxis } from '@/services/patternSymmetryAnalysis'
import {
  BACKGROUND_ANALYSIS_MAX_EDGE,
  BACKGROUND_LIGHT_CHROMA,
  BACKGROUND_LIGHT_LUMA,
  BACKGROUND_RGB_TOLERANCE,
  SYMMETRY_AXIS_ALIGN_MIN_SCORE,
} from '@/utils/constants'
import { throwIfAborted, yieldToMain, type PatternAbortSignal } from '@/utils/patternGenerationProgress'

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

const MASK_FLOOD_YIELD_EVERY = 4096

export interface MaskBuildProgressOptions {
  signal?: PatternAbortSignal
  onSubProgress?: (ratio: number) => void | Promise<void>
}

async function yieldMaskProgress(
  options: MaskBuildProgressOptions | undefined,
  ratio: number,
): Promise<void> {
  throwIfAborted(options?.signal)
  void options?.onSubProgress?.(ratio)
  await yieldToMain(16)
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

/** 与 buildExteriorBackgroundMask 算法一致，分段 yield 以便上报进度 */
export async function buildExteriorBackgroundMaskAsync(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: MaskBuildProgressOptions,
): Promise<Uint8Array> {
  const mask = new Uint8Array(width * height)
  const visited = new Uint8Array(width * height)
  const queue: number[] = []
  const totalPixels = width * height
  let processed = 0

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

    processed += 1
    if (processed % MASK_FLOOD_YIELD_EVERY === 0) {
      await yieldMaskProgress(options, Math.min(1, processed / totalPixels))
    }
  }

  await yieldMaskProgress(options, 1)
  return mask
}

const NEIGHBOR8: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]

const PORTRAIT_SUBJECT_DILATE_RATIO = 0.012
const PORTRAIT_SUBJECT_DILATE_MIN = 4
const PORTRAIT_SUBJECT_DILATE_MAX = 10

function computePortraitDilateIterations(width: number, height: number): number {
  return Math.min(
    PORTRAIT_SUBJECT_DILATE_MAX,
    Math.max(
      PORTRAIT_SUBJECT_DILATE_MIN,
      Math.round(Math.min(width, height) * PORTRAIT_SUBJECT_DILATE_RATIO),
    ),
  )
}

function dilateBinaryMask(
  mask: Uint8Array,
  width: number,
  height: number,
  iterations: number,
): Uint8Array {
  let current = mask
  for (let pass = 0; pass < iterations; pass += 1) {
    const next = new Uint8Array(current)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x
        if (current[index] === 1) continue
        for (const [dx, dy] of NEIGHBOR8) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          if (current[ny * width + nx] === 1) {
            next[index] = 1
            break
          }
        }
      }
    }
    current = next
  }
  return current
}

async function dilateBinaryMaskAsync(
  mask: Uint8Array,
  width: number,
  height: number,
  iterations: number,
  options?: MaskBuildProgressOptions,
): Promise<Uint8Array> {
  let current = mask
  for (let pass = 0; pass < iterations; pass += 1) {
    const next = new Uint8Array(current)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x
        if (current[index] === 1) continue
        for (const [dx, dy] of NEIGHBOR8) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          if (current[ny * width + nx] === 1) {
            next[index] = 1
            break
          }
        }
      }
    }
    current = next
    await yieldMaskProgress(
      options,
      iterations > 0 ? (pass + 1) / iterations : 1,
    )
  }
  return current
}

/** 将不与画布边缘连通的背景孔洞并入主体（胸口等内白区） */
function fillBinaryMaskHoles(interiorMask: Uint8Array, width: number, height: number): Uint8Array {
  const outside = new Uint8Array(width * height)
  const queue: number[] = []

  const seedOutside = (x: number, y: number) => {
    const index = y * width + x
    if (outside[index] || interiorMask[index] === 1) return
    outside[index] = 1
    queue.push(index)
  }

  for (let x = 0; x < width; x += 1) {
    seedOutside(x, 0)
    seedOutside(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    seedOutside(0, y)
    seedOutside(width - 1, y)
  }

  let head = 0
  while (head < queue.length) {
    const index = queue[head]
    head += 1
    const x = index % width
    const y = Math.floor(index / width)

    for (const [dx, dy] of NEIGHBOR8) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const ni = ny * width + nx
      if (outside[ni] || interiorMask[ni] === 1) continue
      outside[ni] = 1
      queue.push(ni)
    }
  }

  const filled = new Uint8Array(interiorMask)
  for (let i = 0; i < filled.length; i += 1) {
    if (interiorMask[i] === 1 || outside[i] === 1) continue
    filled[i] = 1
  }
  return filled
}

async function fillBinaryMaskHolesAsync(
  interiorMask: Uint8Array,
  width: number,
  height: number,
  options?: MaskBuildProgressOptions,
): Promise<Uint8Array> {
  const outside = new Uint8Array(width * height)
  const queue: number[] = []
  const totalPixels = width * height
  let processed = 0

  const seedOutside = (x: number, y: number) => {
    const index = y * width + x
    if (outside[index] || interiorMask[index] === 1) return
    outside[index] = 1
    queue.push(index)
  }

  for (let x = 0; x < width; x += 1) {
    seedOutside(x, 0)
    seedOutside(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    seedOutside(0, y)
    seedOutside(width - 1, y)
  }

  let head = 0
  while (head < queue.length) {
    const index = queue[head]
    head += 1
    const x = index % width
    const y = Math.floor(index / width)

    for (const [dx, dy] of NEIGHBOR8) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const ni = ny * width + nx
      if (outside[ni] || interiorMask[ni] === 1) continue
      outside[ni] = 1
      queue.push(ni)
    }

    processed += 1
    if (processed % MASK_FLOOD_YIELD_EVERY === 0) {
      await yieldMaskProgress(options, Math.min(1, processed / totalPixels))
    }
  }

  const filled = new Uint8Array(interiorMask)
  for (let i = 0; i < filled.length; i += 1) {
    if (interiorMask[i] === 1 || outside[i] === 1) continue
    filled[i] = 1
  }
  await yieldMaskProgress(options, 1)
  return filled
}

/**
 * 人物模式主体 mask：非外部背景种子 → 轻膨胀闭合领口 → 孔洞填充。
 * 1 = 应拼豆区域（含胸口等封闭内白区）。
 */
export function buildPortraitSubjectMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const exterior = buildExteriorBackgroundMask(data, width, height)
  const seed = new Uint8Array(width * height)
  for (let i = 0; i < seed.length; i += 1) {
    seed[i] = exterior[i] === 1 ? 0 : 1
  }

  const dilated = dilateBinaryMask(
    seed,
    width,
    height,
    computePortraitDilateIterations(width, height),
  )
  return fillBinaryMaskHoles(dilated, width, height)
}

/** 与 buildPortraitSubjectMask 算法一致，分段 yield 以便上报进度 */
export async function buildPortraitSubjectMaskAsync(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: MaskBuildProgressOptions,
): Promise<Uint8Array> {
  const report = async (ratio: number) => {
    await yieldMaskProgress(options, ratio)
  }

  const exterior = await buildExteriorBackgroundMaskAsync(data, width, height, {
    signal: options?.signal,
    onSubProgress: (ratio) => report(ratio * 0.55),
  })
  const seed = new Uint8Array(width * height)
  for (let i = 0; i < seed.length; i += 1) {
    seed[i] = exterior[i] === 1 ? 0 : 1
  }

  const iterations = computePortraitDilateIterations(width, height)
  const dilated = await dilateBinaryMaskAsync(seed, width, height, iterations, {
    signal: options?.signal,
    onSubProgress: (ratio) => report(0.55 + ratio * 0.25),
  })
  return fillBinaryMaskHolesAsync(dilated, width, height, {
    signal: options?.signal,
    onSubProgress: (ratio) => report(0.8 + ratio * 0.2),
  })
}

export function isPortraitSubjectPixel(
  subjectMask: Uint8Array,
  width: number,
  x: number,
  y: number,
): boolean {
  return subjectMask[y * width + x] === 1
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

/**
 * 以给定水平中心扩展裁剪框，使左右留白对称。
 * 优先用面部对称轴（眼鼻中线），蝴蝶结等单侧装饰不会拉偏中心。
 */
function expandCropHorizontallyAround(
  crop: CropRect,
  centerX: number,
  canvasWidth: number,
): CropRect {
  const left = crop.x
  const right = crop.x + crop.width - 1
  const halfWidth = Math.max(centerX - left, right - centerX)

  let newX = Math.floor(centerX - halfWidth)
  let newWidth = Math.ceil(halfWidth * 2) + 1

  if (newX < 0) {
    newWidth -= -newX
    newX = 0
  }
  if (newX + newWidth > canvasWidth) {
    newWidth = canvasWidth - newX
  }
  newWidth = Math.max(1, newWidth)

  return { x: newX, y: crop.y, width: newWidth, height: crop.height }
}

function computeContentCentroidX(
  crop: CropRect,
  mask: Uint8Array,
  canvasWidth: number,
): number {
  let sumX = 0
  let count = 0

  for (let y = crop.y; y < crop.y + crop.height; y += 1) {
    for (let x = crop.x; x < crop.x + crop.width; x += 1) {
      if (mask[y * canvasWidth + x] === 1) continue
      sumX += x
      count += 1
    }
  }

  return count > 0 ? sumX / count : crop.x + crop.width / 2
}

function analysisCropToSourceCrop(
  crop: CropRect,
  scale: number,
  sourceWidth: number,
  sourceHeight: number,
): CropRect {
  const toSourceCoord = (value: number, max: number) =>
    Math.max(0, Math.min(Math.round(value / scale), max))

  const x = toSourceCoord(crop.x, sourceWidth - 1)
  const y = toSourceCoord(crop.y, sourceHeight - 1)
  const right = Math.min(
    sourceWidth,
    Math.max(x + 1, toSourceCoord(crop.x + crop.width - 1, sourceWidth - 1) + 1),
  )
  const bottom = Math.min(
    sourceHeight,
    Math.max(y + 1, toSourceCoord(crop.y + crop.height - 1, sourceHeight - 1) + 1),
  )

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
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

  const image = await loadCanvasImageWithRetry(canvas, imagePath)

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
  const tightCrop = findContentBoundsFromMask(exteriorMask, analysisWidth, analysisHeight)
  const { axisX, score } = findBestSymmetryAxis(
    data,
    analysisWidth,
    analysisHeight,
    exteriorMask,
  )
  const centerX =
    score >= SYMMETRY_AXIS_ALIGN_MIN_SCORE
      ? axisX
      : computeContentCentroidX(tightCrop, exteriorMask, analysisWidth)
  const analysisCrop = expandCropHorizontallyAround(tightCrop, centerX, analysisWidth)

  let crop = analysisCropToSourceCrop(
    analysisCrop,
    scale,
    source.width,
    source.height,
  )

  if (score >= SYMMETRY_AXIS_ALIGN_MIN_SCORE) {
    const axisFraction = (axisX - analysisCrop.x) / analysisCrop.width
    const shift = (0.5 - axisFraction) * crop.width
    crop = {
      ...crop,
      x: Math.max(0, Math.min(Math.round(crop.x + shift), source.width - crop.width)),
    }
  }

  return {
    backgroundRgb,
    crop,
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
