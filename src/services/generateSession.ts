import Taro from '@tarojs/taro'
import { GENERATE_DRAFT_STORAGE_KEY, type PatternConfig, type StyleMode } from '@/types'
import { createDefaultConfigForStyleMode, normalizeConfig } from '@/utils/constants'

export interface GenerateDraft {
  imagePath: string
  config: PatternConfig
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

function writeStoredDraft(next: GenerateDraft): void {
  try {
    if (!next.imagePath) {
      Taro.removeStorageSync(GENERATE_DRAFT_STORAGE_KEY)
      return
    }
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

function cleanupPreviousSourceImage(nextPath: string): void {
  const previousPath = draft?.imagePath
  if (!previousPath || previousPath === nextPath) return
  removeSourceImageQuietly(previousPath)
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
  cleanupPreviousSourceImage(imagePath)
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
  cleanupPreviousSourceImage(imagePath)
  draft = nextDraft
  writeStoredDraft(nextDraft)
  return cloneDraft(nextDraft)
}

export function resetGenerateDraft(styleMode: StyleMode = 'manga'): GenerateDraft {
  if (draft?.imagePath) {
    removeSourceImageQuietly(draft.imagePath)
  }
  draft = {
    imagePath: '',
    config: createDefaultConfigForStyleMode(styleMode),
  }
  clearStoredDraft()
  return cloneDraft(draft)
}

export function clearGenerateDraft(): void {
  if (draft?.imagePath) {
    removeSourceImageQuietly(draft.imagePath)
  }
  draft = null
  clearStoredDraft()
}

export function syncGenerateDraftFromPage(imagePath: string, config: PatternConfig): GenerateDraft {
  setGenerateDraft(imagePath, config)
  return getGenerateDraft()!
}

export function persistGenerateSourceImage(path: string): string {
  if (process.env.TARO_ENV !== 'weapp' || !path) return path
  try {
    const base = Taro.env.USER_DATA_PATH
    if (path.startsWith(base)) return path

    const extension = path.match(/\.[a-zA-Z0-9]+(?=($|\?))/)?.[0] || '.jpg'
    const target = `${base}/${SOURCE_IMAGE_PREFIX}${Date.now()}${extension}`
    Taro.getFileSystemManager().copyFileSync(path, target)
    return target
  } catch {
    return path
  }
}
