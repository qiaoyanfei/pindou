import Taro from '@tarojs/taro'
import { canvasToTempFile } from '@/utils/canvas'
import { isLocalStorageLimitError, notifyOperationError } from '@/utils/localCache'
import {
  ensurePrivacyForMediaAction,
  isPrivacyAgreementCancelled,
  isPrivacyAuthorizeError,
} from '@/utils/privacyAuthorize'
import {
  ensureWritePhotosAlbumScope,
  promptWritePhotosAlbumSettings,
} from '@/utils/writePhotosAlbumScope'

export type PatternExportFormat = 'png' | 'svg'

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return (error as { errMsg?: string })?.errMsg ?? ''
}

function isAlbumSaveAuthError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('auth deny')
    || lower.includes('authorize:fail')
    || lower.includes('permission denied')
    || lower.includes('system auth deny')
  )
}

function isAlbumSaveCancelled(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower === 'cancel'
    || lower === 'cancelled'
    || lower.includes('fail cancel')
    || lower.includes('user cancel')
  )
}

/** 同一次保存内已引导过设置页 */
let albumSettingsPromptedInCurrentSave = false

/** 微信隐私协议 + 相册写入权限（saveImageToPhotosAlbum 前置） */
export async function ensureAlbumPermission(): Promise<void> {
  await ensurePrivacyForMediaAction()
  await ensureWritePhotosAlbumScope(() => {
    albumSettingsPromptedInCurrentSave = true
  })
}

export async function saveCanvasToAlbum(canvasId: string): Promise<void> {
  albumSettingsPromptedInCurrentSave = false
  await ensureAlbumPermission()
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
      return
    }
    setTimeout(resolve, 32)
  })
  const tempFilePath = await canvasToTempFile(canvasId)
  await Taro.saveImageToPhotosAlbum({ filePath: tempFilePath })
}

export function handleAlbumSaveError(error: unknown): void {
  const message = extractErrorMessage(error)
  if (
    message === 'album_scope_cancelled'
    || message === 'album_auth_cancelled'
    || isAlbumSaveCancelled(message)
  ) return
  if (isPrivacyAgreementCancelled(error)) return

  if (message === 'album_scope_denied') {
    albumSettingsPromptedInCurrentSave = false
    Taro.showToast({ title: '未获得相册权限', icon: 'none', duration: 3000 })
    return
  }

  if (isPrivacyAuthorizeError(error)) {
    Taro.showToast({ title: '请先同意隐私保护指引', icon: 'none', duration: 3000 })
    return
  }

  if (isAlbumSaveAuthError(message)) {
    if (albumSettingsPromptedInCurrentSave) {
      albumSettingsPromptedInCurrentSave = false
      Taro.showToast({ title: '未获得相册权限', icon: 'none', duration: 3000 })
      return
    }
    void promptWritePhotosAlbumSettings().then((result) => {
      if (result === 'denied') {
        Taro.showToast({ title: '未获得相册权限', icon: 'none', duration: 3000 })
      }
    })
    return
  }

  albumSettingsPromptedInCurrentSave = false
  Taro.showToast({
    title: message || '保存失败',
    icon: 'none',
    duration: 3000,
  })
}

function isShareCancelled(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower === 'cancel'
    || lower === 'cancelled'
    || lower.includes('fail cancel')
    || lower.includes('user cancel')
  )
}

function sanitizeExportFileName(name: string): string {
  return name.replace(/[^\w\u4e00-\u9fa5.-]+/g, '_')
}

function resolveSvgFilePath(fileName: string): { filePath: string; safeName: string } {
  const safeName = sanitizeExportFileName(fileName.endsWith('.svg') ? fileName : `${fileName}.svg`)
  return {
    filePath: `${Taro.env.USER_DATA_PATH}/${safeName}`,
    safeName,
  }
}

/** 同步写入 SVG，便于在用户点击事件栈内紧接着调用 shareFileMessage */
export function writeSvgToUserFileSync(svgContent: string, fileName: string): string {
  if (process.env.TARO_ENV !== 'weapp') {
    throw new Error('SVG 导出仅支持微信小程序')
  }
  const fs = Taro.getFileSystemManager()
  const { filePath } = resolveSvgFilePath(fileName)
  fs.writeFileSync(filePath, svgContent, 'utf8')
  return filePath
}

/**
 * 必须在用户 TAP 手势回调中同步调用（不可前置 await）。
 * shareFileMessage 的 success/fail 通过回调处理。
 */
export function exportSvgAndShareSync(
  svgContent: string,
  fileName: string,
  callbacks?: {
    onSuccess?: () => void
    onFail?: (error: unknown) => void
  },
): void {
  if (process.env.TARO_ENV !== 'weapp') {
    throw new Error('SVG 导出仅支持微信小程序')
  }
  if (typeof Taro.shareFileMessage !== 'function') {
    throw new Error('当前微信版本过低，请升级后重试')
  }
  const { filePath, safeName } = resolveSvgFilePath(fileName)
  const fs = Taro.getFileSystemManager()
  fs.writeFileSync(filePath, svgContent, 'utf8')
  Taro.shareFileMessage({
    filePath,
    fileName: safeName,
    success: () => callbacks?.onSuccess?.(),
    fail: (error) => callbacks?.onFail?.(error),
  })
}

export function handleSvgExportError(error: unknown): void {
  const message = extractErrorMessage(error)
  if (isShareCancelled(message)) return
  if (message.includes('user TAP') || message.includes('user tap')) {
    Taro.showToast({ title: '请直接点击分享文件按钮', icon: 'none', duration: 3000 })
    return
  }
  if (isLocalStorageLimitError(error)) {
    notifyOperationError(error, '导出失败')
    return
  }
  Taro.showToast({
    title: message || '导出失败',
    icon: 'none',
    duration: 3000,
  })
}
