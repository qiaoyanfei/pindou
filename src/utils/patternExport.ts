import Taro from '@tarojs/taro'
import { canvasToTempFile } from '@/utils/canvas'
import {
  ensurePrivacyForMediaAction,
  isPrivacyAgreementCancelled,
  isPrivacyAuthorizeError,
} from '@/utils/privacyAuthorize'
import {
  ensureWritePhotosAlbumScope,
  promptWritePhotosAlbumSettings,
} from '@/utils/writePhotosAlbumScope'

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
