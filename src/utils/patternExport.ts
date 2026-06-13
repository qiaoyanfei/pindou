import Taro from '@tarojs/taro'
import { MINI_PROGRAM_NAME } from '@/utils/constants'
import { canvasToTempFile } from '@/utils/canvas'

export async function ensureAlbumPermission(): Promise<void> {
  const setting = await Taro.getSetting()
  if (!setting.authSetting['scope.writePhotosAlbum']) {
    await Taro.authorize({ scope: 'scope.writePhotosAlbum' })
  }
}

export async function saveCanvasToAlbum(canvasId: string): Promise<void> {
  await ensureAlbumPermission()
  const tempFilePath = await canvasToTempFile(canvasId)
  await Taro.saveImageToPhotosAlbum({ filePath: tempFilePath })
}

export function handleAlbumSaveError(error: unknown): void {
  const message = (error as { errMsg?: string })?.errMsg ?? ''
  if (message.includes('auth deny') || message.includes('authorize')) {
    Taro.showModal({
      title: '需要相册权限',
      content: `请在设置中允许保存图片到相册，以便保存${MINI_PROGRAM_NAME}图纸。`,
      confirmText: '去设置',
      success: (res) => {
        if (res.confirm) Taro.openSetting()
      },
    })
    return
  }
  Taro.showToast({
    title: error instanceof Error ? error.message : '保存失败',
    icon: 'none',
  })
}
