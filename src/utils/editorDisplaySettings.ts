import Taro from '@tarojs/taro'

const EDITOR_DISPLAY_SETTINGS_KEY = 'editorDisplaySettings'

export interface EditorDisplaySettings {
  showGuideLines: boolean
  showMajorGridLines: boolean
}

export const DEFAULT_EDITOR_DISPLAY_SETTINGS: EditorDisplaySettings = {
  showGuideLines: true,
  showMajorGridLines: true,
}

export function getEditorDisplaySettings(): EditorDisplaySettings {
  try {
    const stored = Taro.getStorageSync(EDITOR_DISPLAY_SETTINGS_KEY) as Partial<EditorDisplaySettings> | undefined
    return {
      showGuideLines: stored?.showGuideLines !== false,
      showMajorGridLines: stored?.showMajorGridLines !== false,
    }
  } catch {
    return { ...DEFAULT_EDITOR_DISPLAY_SETTINGS }
  }
}

export function setEditorDisplaySettings(settings: EditorDisplaySettings): void {
  Taro.setStorageSync(EDITOR_DISPLAY_SETTINGS_KEY, settings)
}
