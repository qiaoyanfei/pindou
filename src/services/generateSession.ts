import type { PatternConfig, StyleMode } from '@/types'
import { createDefaultConfigForStyleMode, normalizeConfig } from '@/utils/constants'

export interface GenerateDraft {
  imagePath: string
  config: PatternConfig
}

let draft: GenerateDraft | null = null

export function getGenerateDraft(): GenerateDraft | null {
  if (!draft) return null
  return {
    imagePath: draft.imagePath,
    config: { ...draft.config },
  }
}

export function setGenerateDraft(imagePath: string, config: PatternConfig): void {
  draft = {
    imagePath,
    config: normalizeConfig(config),
  }
}

export function updateGenerateConfig(config: PatternConfig): void {
  const normalized = normalizeConfig(config)
  if (draft) {
    draft = { ...draft, config: normalized }
    return
  }
  draft = {
    imagePath: '',
    config: normalized,
  }
}

export function setGenerateImageWithDefaultConfig(imagePath: string, styleMode: StyleMode): GenerateDraft {
  draft = {
    imagePath,
    config: createDefaultConfigForStyleMode(styleMode),
  }
  return { ...draft, config: { ...draft.config } }
}

export function resetGenerateDraft(styleMode: StyleMode = 'manga'): GenerateDraft {
  draft = {
    imagePath: '',
    config: createDefaultConfigForStyleMode(styleMode),
  }
  return { ...draft, config: { ...draft.config } }
}

export function clearGenerateDraft(): void {
  draft = null
}

export function syncGenerateDraftFromPage(imagePath: string, config: PatternConfig): GenerateDraft {
  setGenerateDraft(imagePath, config)
  return getGenerateDraft()!
}
