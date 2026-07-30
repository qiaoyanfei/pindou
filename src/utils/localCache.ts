import Taro from '@tarojs/taro'
import { PATTERN_STORAGE_KEY, PUBLISH_STORAGE_KEY } from '@/types'
import { cleanupOrphanSourceImages, clearGenerateDraft } from '@/services/generateSession'
import { clearPatternPreviewCache } from '@/utils/patternPreviewCache'

const UPLOAD_JSON_PREFIX = 'pindou_upload_'
const DISPOSABLE_FILE_SUFFIX = '_payload.json'

export const LOCAL_STORAGE_LIMIT_TOAST = '本地缓存已满，请清理后重试'

export const LOCAL_STORAGE_LIMIT_GUIDE = [
  '本地存储空间不足，可能导致发布、保存失败。',
  '',
  '请按顺序尝试：',
  '1. 完全关闭小程序后重新打开',
  '2. 若仍失败：微信 → 我 → 设置 → 通用 → 存储空间 → 清理小程序缓存',
].join('\n')

function getFileSystemManager() {
  return Taro.getFileSystemManager()
}

function removeFileQuietly(filePath: string): void {
  try {
    getFileSystemManager().unlinkSync(filePath)
  } catch {
    // ignore missing files
  }
}

export function isLocalStorageLimitError(error: unknown): boolean {
  const text = [
    error instanceof Error ? error.message : '',
    (error as { errMsg?: string })?.errMsg || '',
  ].join(' ')
  return (
    text.includes('maximum size of the file storage limit')
    || text.includes('storage limit is exceeded')
    || text.includes('file storage limit')
    || text.includes('exceed max storage')
    || text.includes('quota exceeded')
  )
}

/** USER_DATA_PATH 下可安全删除的临时文件 + 未在用的源图 */
export function cleanupDisposableLocalFiles(): void {
  if (process.env.TARO_ENV !== 'weapp') return
  try {
    const base = Taro.env.USER_DATA_PATH
    const files = getFileSystemManager().readdirSync(base) as string[]
    files.forEach((name) => {
      if (name.startsWith(UPLOAD_JSON_PREFIX) || name.endsWith(DISPOSABLE_FILE_SUFFIX)) {
        removeFileQuietly(`${base}/${name}`)
      }
    })
  } catch {
    // ignore unreadable cache dir
  }
  cleanupOrphanSourceImages()
}

/** 发布成功后清理工作流缓存，避免 pattern 重复占用 storage */
export function cleanupAfterPublishSuccess(): void {
  try {
    Taro.removeStorageSync(PUBLISH_STORAGE_KEY)
    Taro.removeStorageSync(PATTERN_STORAGE_KEY)
  } catch {
    // ignore
  }
  clearGenerateDraft()
  cleanupDisposableLocalFiles()
}

/** 小程序冷启动时清理可丢弃的本地缓存 */
export function cleanupOnAppLaunch(): void {
  cleanupDisposableLocalFiles()
  clearPatternPreviewCache()
}

export function showStorageLimitModal(): void {
  Taro.showModal({
    title: '本地缓存已满',
    content: LOCAL_STORAGE_LIMIT_GUIDE,
    showCancel: false,
    confirmText: '我知道了',
  })
}

function resolveInlineErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    if (isLocalStorageLimitError(error)) return LOCAL_STORAGE_LIMIT_TOAST
    return error.message
  }
  const errMsg = (error as { errMsg?: string })?.errMsg
  if (errMsg) {
    if (isLocalStorageLimitError(errMsg)) return LOCAL_STORAGE_LIMIT_TOAST
    return errMsg
  }
  return fallback
}

/** 存储满时弹窗引导；其他错误 toast */
export function notifyOperationError(error: unknown, fallback: string): void {
  if (isLocalStorageLimitError(error)) {
    cleanupDisposableLocalFiles()
    showStorageLimitModal()
    return
  }
  Taro.showToast({
    title: resolveInlineErrorMessage(error, fallback),
    icon: 'none',
    duration: 3000,
  })
}

export function setStorageSafe(key: string, data: unknown): void {
  try {
    Taro.setStorageSync(key, data)
  } catch (error) {
    if (!isLocalStorageLimitError(error)) throw error
    cleanupDisposableLocalFiles()
    try {
      Taro.setStorageSync(key, data)
    } catch (retryError) {
      if (isLocalStorageLimitError(retryError)) {
        showStorageLimitModal()
      }
      throw retryError
    }
  }
}
