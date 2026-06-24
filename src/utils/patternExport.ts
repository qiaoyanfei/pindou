import Taro from '@tarojs/taro'
import { MINI_PROGRAM_NAME } from '@/utils/constants'
import { canvasToTempFile } from '@/utils/canvas'

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return (error as { errMsg?: string })?.errMsg ?? ''
}

function isPrivacyOrAlbumAuthError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('auth deny')
    || lower.includes('authorize')
    || lower.includes('privacy')
    || lower.includes('album_auth_denied')
    || lower.includes('permission denied')
  )
}

function requirePrivacyAuthorize(): Promise<void> {
  if (process.env.TARO_ENV !== 'weapp') {
    return Promise.resolve()
  }

  const wxApi = wx as WechatMiniprogram.Wx & {
    requirePrivacyAuthorize?: (option: {
      success?: () => void
      fail?: (res: WechatMiniprogram.GeneralCallbackResult) => void
    }) => void
  }

  if (typeof wxApi.requirePrivacyAuthorize !== 'function') {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    wxApi.requirePrivacyAuthorize!({
      success: () => resolve(),
      fail: (err) => reject(err ?? new Error('用户未同意隐私协议')),
    })
  })
}

function promptOpenAlbumSettings(): Promise<void> {
  return new Promise((resolve, reject) => {
    Taro.showModal({
      title: '需要相册权限',
      content: `请在设置中允许保存图片到相册，以便保存${MINI_PROGRAM_NAME}图纸。`,
      confirmText: '去设置',
      success: (res) => {
        if (res.confirm) {
          void Taro.openSetting().finally(resolve)
          return
        }
        reject(new Error('album_auth_denied'))
      },
      fail: () => reject(new Error('album_auth_denied')),
    })
  })
}

/** 微信隐私协议 + 相册写入权限（saveImageToPhotosAlbum 前置） */
export async function ensureAlbumPermission(): Promise<void> {
  await requirePrivacyAuthorize()

  const setting = await Taro.getSetting()
  const albumAuth = setting.authSetting['scope.writePhotosAlbum']

  if (albumAuth === true) return
  if (albumAuth === false) {
    await promptOpenAlbumSettings()
    throw new Error('album_auth_denied')
  }

  try {
    await Taro.authorize({ scope: 'scope.writePhotosAlbum' })
  } catch {
    // 新隐私流程下 authorize 可能无效，后续 saveImageToPhotosAlbum 仍会触发系统授权
  }
}

export async function saveCanvasToAlbum(canvasId: string): Promise<void> {
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
  if (isPrivacyOrAlbumAuthError(message)) {
    void promptOpenAlbumSettings()
    return
  }
  Taro.showToast({
    title: message || '保存失败',
    icon: 'none',
    duration: 3000,
  })
}
