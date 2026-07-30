import Taro from '@tarojs/taro'
import { GENERATE_DRAFT_STORAGE_KEY, PATTERN_STORAGE_KEY, type PatternConfig, type StyleMode } from '@/types'
import { createDefaultConfigForStyleMode, normalizeConfig } from '@/utils/constants'
import { isRecoverableGeneratePattern } from '@/utils/patternStorage'
import {
  getImageDimensionsWithRetry,
  loadCanvasImageWithRetry,
  loadCanvasNode,
} from '@/services/imageProcessor'
import { yieldToMain } from '@/utils/patternGenerationProgress'

export interface GenerateDraft {
  imagePath: string
  config: PatternConfig
}

export class SourceImagePersistError extends Error {
  constructor(message = '无法保存所选图片，请重新选择') {
    super(message)
    this.name = 'SourceImagePersistError'
  }
}

let draft: GenerateDraft | null = null

const SOURCE_IMAGE_PREFIX = 'pindou_source_'

function cloneDraft(next: GenerateDraft): GenerateDraft {
  return {
    imagePath: next.imagePath,
    config: { ...next.config },
  }
}

function readStoredDraft(): GenerateDraft | null {
  try {
    if (!shouldPersistGenerateDraftToStorage()) {
      Taro.removeStorageSync(GENERATE_DRAFT_STORAGE_KEY)
      return null
    }
    const stored = Taro.getStorageSync(GENERATE_DRAFT_STORAGE_KEY) as GenerateDraft | undefined
    if (!stored?.imagePath) return null
    return {
      imagePath: stored.imagePath,
      config: normalizeConfig(stored.config),
    }
  } catch {
    return null
  }
}

function shouldPersistGenerateDraftToStorage(): boolean {
  try {
    const stored = Taro.getStorageSync(PATTERN_STORAGE_KEY)
    return isRecoverableGeneratePattern(stored)
  } catch {
    return false
  }
}

function writeStoredDraft(next: GenerateDraft): void {
  try {
    if (!next.imagePath) {
      Taro.removeStorageSync(GENERATE_DRAFT_STORAGE_KEY)
      return
    }
    if (!shouldPersistGenerateDraftToStorage()) return
    Taro.setStorageSync(GENERATE_DRAFT_STORAGE_KEY, cloneDraft(next))
  } catch {
    // 仅影响重新预览兜底，不阻断主流程
  }
}

function clearStoredDraft(): void {
  try {
    Taro.removeStorageSync(GENERATE_DRAFT_STORAGE_KEY)
  } catch {
    // ignore
  }
}

function removeSourceImageQuietly(path: string): void {
  if (process.env.TARO_ENV !== 'weapp') return
  if (!path.includes(`/${SOURCE_IMAGE_PREFIX}`)) return
  try {
    Taro.getFileSystemManager().unlinkSync(path)
  } catch {
    // ignore
  }
}

function pathsPointSameFile(left: string, right: string): boolean {
  if (!left || !right) return false
  if (left === right) return true
  const leftName = left.split('/').pop() || ''
  const rightName = right.split('/').pop() || ''
  return Boolean(leftName) && leftName === rightName
}

function readPatternStorageSourceImagePath(): string {
  try {
    const stored = Taro.getStorageSync(PATTERN_STORAGE_KEY) as { sourceImagePath?: string } | undefined
    return stored?.sourceImagePath?.trim() || ''
  } catch {
    return ''
  }
}

/** 换图时先把预览缓存里的源图路径指到新文件，避免预览仍引用已删除路径 */
function syncPatternStorageSourceImagePath(nextPath: string): void {
  if (!nextPath) return
  try {
    const stored = Taro.getStorageSync(PATTERN_STORAGE_KEY) as Record<string, unknown> | undefined
    if (!stored?.pattern) return
    const current = typeof stored.sourceImagePath === 'string' ? stored.sourceImagePath.trim() : ''
    if (pathsPointSameFile(current, nextPath)) return
    Taro.setStorageSync(PATTERN_STORAGE_KEY, {
      ...stored,
      sourceImagePath: nextPath,
    })
  } catch {
    // 仅影响预览重新读图，不阻断选图
  }
}

function collectKeptSourceImagePaths(): Set<string> {
  const keep = new Set<string>()
  const add = (path?: string) => {
    const trimmed = path?.trim()
    if (trimmed) keep.add(trimmed)
  }

  add(draft?.imagePath)
  add(readPatternStorageSourceImagePath())

  try {
    const stored = Taro.getStorageSync(GENERATE_DRAFT_STORAGE_KEY) as GenerateDraft | undefined
    add(stored?.imagePath)
  } catch {
    // ignore
  }

  return keep
}

/** 删除未在用的 pindou_source_*，保留当前草稿/可恢复预览指向的源图 */
export function cleanupOrphanSourceImages(): void {
  if (process.env.TARO_ENV !== 'weapp') return
  try {
    const base = Taro.env.USER_DATA_PATH
    const keep = collectKeptSourceImagePaths()
    const files = Taro.getFileSystemManager().readdirSync(base) as string[]

    files.forEach((name) => {
      if (!name.startsWith(SOURCE_IMAGE_PREFIX)) return
      const fullPath = `${base}/${name}`
      const shouldKeep = [...keep].some((path) => pathsPointSameFile(path, fullPath))
      if (shouldKeep) return
      try {
        Taro.getFileSystemManager().unlinkSync(fullPath)
      } catch {
        // ignore
      }
    })
  } catch {
    // ignore unreadable cache dir
  }
}

/**
 * 换新源图：先同步预览缓存路径，再删旧文件。
 * 若预览缓存同步失败且仍引用旧路径，则保留旧文件，交给后续 orphan 清理。
 */
function replaceSourceImagePath(nextPath: string): string | undefined {
  const previousPath = draft?.imagePath
  syncPatternStorageSourceImagePath(nextPath)
  if (!previousPath || pathsPointSameFile(previousPath, nextPath)) return undefined

  const patternSource = readPatternStorageSourceImagePath()
  if (patternSource && pathsPointSameFile(patternSource, previousPath)) {
    return previousPath
  }
  removeSourceImageQuietly(previousPath)
  return undefined
}

function assertFileExists(path: string): void {
  try {
    Taro.getFileSystemManager().accessSync(path)
  } catch {
    throw new SourceImagePersistError('本地图片已失效，请重新选择')
  }
}

async function verifySourceImageReadable(path: string, canvasId?: string): Promise<void> {
  assertFileExists(path)
  await getImageDimensionsWithRetry(path)
  if (!canvasId) return

  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const canvas = await loadCanvasNode(canvasId)
      await loadCanvasImageWithRetry(canvas, path)
      return
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : ''
      // Canvas 节点偶发未挂载：稍后重试；纯读图失败则继续重试 createImage
      await yieldToMain(message.includes('Canvas 初始化失败') ? 100 : 120)
    }
  }

  // 选图阶段 Canvas 仍不可用时，只要 getImageInfo 已通过就放行，生成阶段还会再校验/重试
  const message = lastError instanceof Error ? lastError.message : ''
  if (message.includes('Canvas 初始化失败')) return
  throw lastError instanceof Error ? lastError : new SourceImagePersistError('无法读取所选图片，请重新选择')
}

export function getGenerateDraft(): GenerateDraft | null {
  if (!draft) {
    draft = readStoredDraft()
  }
  if (!draft) return null
  return cloneDraft(draft)
}

export function setGenerateDraft(imagePath: string, config: PatternConfig): void {
  const nextDraft = {
    imagePath,
    config: normalizeConfig(config),
  }
  replaceSourceImagePath(imagePath)
  draft = nextDraft
  writeStoredDraft(nextDraft)
}

export function updateGenerateConfig(config: PatternConfig): void {
  const normalized = normalizeConfig(config)
  if (draft) {
    draft = { ...draft, config: normalized }
    writeStoredDraft(draft)
    return
  }
  draft = {
    imagePath: '',
    config: normalized,
  }
  clearStoredDraft()
}

export function setGenerateImageWithDefaultConfig(imagePath: string, styleMode: StyleMode): GenerateDraft {
  const nextDraft = {
    imagePath,
    config: createDefaultConfigForStyleMode(styleMode),
  }
  replaceSourceImagePath(imagePath)
  draft = nextDraft
  writeStoredDraft(nextDraft)
  return cloneDraft(draft)
}

export function resetGenerateDraft(styleMode: StyleMode = 'manga'): GenerateDraft {
  const previousPath = draft?.imagePath
  draft = {
    imagePath: '',
    config: createDefaultConfigForStyleMode(styleMode),
  }
  clearStoredDraft()
  // 预览缓存若仍引用该文件则保留，避免来回选图后预览读图失败
  const patternSource = readPatternStorageSourceImagePath()
  if (previousPath && !pathsPointSameFile(previousPath, patternSource)) {
    removeSourceImageQuietly(previousPath)
  }
  return cloneDraft(draft)
}

export function clearGenerateDraft(): void {
  const previousPath = draft?.imagePath
  draft = null
  clearStoredDraft()
  const patternSource = readPatternStorageSourceImagePath()
  if (previousPath && !pathsPointSameFile(previousPath, patternSource)) {
    removeSourceImageQuietly(previousPath)
  }
}

export function syncGenerateDraftFromPage(imagePath: string, config: PatternConfig): GenerateDraft {
  setGenerateDraft(imagePath, config)
  return getGenerateDraft()!
}

/**
 * 将选图结果二进制拷贝到 USER_DATA_PATH（不重编码，不影响图纸取色），
 * 并用 getImageInfo（及可选 Canvas）校验可读。失败时抛错，绝不回退临时路径。
 */
export async function persistGenerateSourceImage(
  path: string,
  options?: { canvasId?: string },
): Promise<string> {
  if (!path) {
    throw new SourceImagePersistError()
  }

  if (process.env.TARO_ENV !== 'weapp') {
    return path
  }

  const base = Taro.env.USER_DATA_PATH

  if (path.startsWith(base)) {
    await verifySourceImageReadable(path, options?.canvasId)
    return path
  }

  const extension = path.match(/\.[a-zA-Z0-9]+(?=($|\?))/)?.[0] || '.jpg'
  const target = `${base}/${SOURCE_IMAGE_PREFIX}${Date.now()}${extension}`

  try {
    Taro.getFileSystemManager().copyFileSync(path, target)
  } catch {
    removeSourceImageQuietly(target)
    throw new SourceImagePersistError('无法保存所选图片，请重新选择')
  }

  try {
    // 拷贝刚完成时偶发 access/读图未就绪，稍等再校验
    await yieldToMain(40)
    await verifySourceImageReadable(target, options?.canvasId)
    return target
  } catch {
    removeSourceImageQuietly(target)
    throw new SourceImagePersistError('无法读取所选图片，请重新选择')
  }
}

/** 生成前再确认本地源图仍可读；失效则提示重选 */
export async function ensureGenerateSourceImageReady(path: string): Promise<void> {
  if (!path) {
    throw new SourceImagePersistError('请先上传图片')
  }
  if (process.env.TARO_ENV !== 'weapp') return

  try {
    await verifySourceImageReadable(path)
  } catch (error) {
    if (error instanceof SourceImagePersistError) throw error
    throw new SourceImagePersistError('本地图片已失效，请重新选择')
  }
}

/**
 * 解析当前仍可读的源图路径。
 * 解决：生成页重新选图后预览页内存仍持有旧路径、旧文件已被替换的问题。
 */
export async function resolveReadableSourceImagePath(preferredPath: string): Promise<string> {
  const candidates = [
    preferredPath,
    draft?.imagePath || '',
    readPatternStorageSourceImagePath(),
  ]
    .map((item) => item.trim())
    .filter(Boolean)

  const unique: string[] = []
  candidates.forEach((path) => {
    if (!unique.some((item) => pathsPointSameFile(item, path))) {
      unique.push(path)
    }
  })

  let lastError: unknown
  for (const path of unique) {
    try {
      await ensureGenerateSourceImageReady(path)
      if (!pathsPointSameFile(path, preferredPath)) {
        syncPatternStorageSourceImagePath(path)
        if (draft) {
          draft = { ...draft, imagePath: path }
          writeStoredDraft(draft)
        }
      }
      return path
    } catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof SourceImagePersistError) throw lastError
  throw new SourceImagePersistError('本地图片已失效，请重新选择')
}
