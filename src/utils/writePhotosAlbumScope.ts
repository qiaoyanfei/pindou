import Taro from '@tarojs/taro'
import { MINI_PROGRAM_NAME } from '@/utils/constants'

const WRITE_PHOTOS_ALBUM = 'scope.writePhotosAlbum'

const ALBUM_PERMISSION_CONTENT = `请在设置中允许保存图片到相册，以便保存${MINI_PROGRAM_NAME}图纸。`

function waitSettingSync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 200))
}

/** 实时读取「添加到相册」开关（微信设置页同一项） */
export async function readWritePhotosAlbumGranted(): Promise<boolean> {
  const setting = await Taro.getSetting()
  return setting.authSetting[WRITE_PHOTOS_ALBUM] === true
}

/** 与下载页完全一致的相册权限弹窗 */
export async function promptWritePhotosAlbumSettings(): Promise<'granted' | 'denied' | 'cancelled'> {
  const goSettings = await new Promise<boolean>((resolve) => {
    Taro.showModal({
      title: '需要相册权限',
      content: ALBUM_PERMISSION_CONTENT,
      confirmText: '去设置',
      cancelText: '取消',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    })
  })

  if (!goSettings) return 'cancelled'

  const openResult = await Taro.openSetting()
  await waitSettingSync()
  if (openResult.authSetting[WRITE_PHOTOS_ALBUM] === true) return 'granted'
  if (await readWritePhotosAlbumGranted()) return 'granted'
  return 'denied'
}

/**
 * 检测「添加到相册」权限（仅 saveImageToPhotosAlbum 下载保存使用）
 */
export async function ensureWritePhotosAlbumScope(
  onBeforePrompt?: () => void,
): Promise<void> {
  if (await readWritePhotosAlbumGranted()) return

  const setting = await Taro.getSetting()
  const albumAuth = setting.authSetting[WRITE_PHOTOS_ALBUM]

  if (albumAuth === false) {
    onBeforePrompt?.()
    const result = await promptWritePhotosAlbumSettings()
    if (result === 'cancelled') {
      throw new Error('album_scope_cancelled')
    }
    if (result === 'granted') return
    throw new Error('album_scope_denied')
  }

  try {
    await Taro.authorize({ scope: WRITE_PHOTOS_ALBUM })
  } catch {
    // 新隐私流程下 authorize 可能无效，后续 API 仍会触发系统授权
  }
}
