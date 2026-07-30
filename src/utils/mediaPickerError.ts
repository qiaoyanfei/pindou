import Taro from '@tarojs/taro'
import { MINI_PROGRAM_NAME } from '@/utils/constants'
import { cleanupDisposableLocalFiles, isLocalStorageLimitError, showStorageLimitModal } from '@/utils/localCache'
import {
  ensurePrivacyForMediaAction,
  isPrivacyAlreadyAgreed,
  isPrivacyAgreementCancelled,
  isPrivacyAuthorizeError,
  syncPrivacyAuthorizeBeforeApi,
} from '@/utils/privacyAuthorize'

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return (error as { errMsg?: string })?.errMsg ?? ''
}

function isIosDevice(): boolean {
  try {
    return Taro.getSystemInfoSync().platform === 'ios'
  } catch {
    return false
  }
}

export function isMediaPickerCancelled(error: unknown): boolean {
  return extractErrorMessage(error).toLowerCase().includes('cancel')
}

function isMediaAuthError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('auth deny')
    || lower.includes('authorize:fail')
    || lower.includes('permission denied')
    || lower.includes('system auth deny')
  )
}

function isCameraAuthError(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('camera') && isMediaAuthError(message)
}

function isIcloudOrDownloadError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('icloud')
    || lower.includes('cloud')
    || lower.includes('download')
    || lower.includes('network')
    || lower.includes('fail to read')
    || lower.includes('read file')
    || lower.includes('file not exist')
    || lower.includes('no such file')
  )
}

function isFormatOrSizeError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('heic')
    || lower.includes('heif')
    || lower.includes('live photo')
    || lower.includes('invalid')
    || lower.includes('format')
    || lower.includes('too large')
    || lower.includes('exceed')
    || lower.includes('size limit')
    || lower.includes('not support')
  )
}

function isImageReadError(message: string): boolean {
  return (
    message.includes('图片加载失败')
    || message.includes('getImageInfo:fail')
    || message.includes('Canvas 初始化失败')
  )
}

function normalizeToastMessage(message: string, fallback: string): string {
  const trimmed = message.trim()
  if (!trimmed) return fallback
  if (trimmed.length <= 28) return trimmed
  return `${trimmed.slice(0, 28)}…`
}

function isScopeGranted(
  authSetting: unknown,
  scope: string,
): boolean {
  const scopes = authSetting as Partial<Record<string, boolean>>
  return scopes[scope] === true
}

async function readScopeGranted(scope: string): Promise<boolean> {
  const setting = await Taro.getSetting()
  return isScopeGranted(setting.authSetting, scope)
}

async function promptOpenCameraSettings(): Promise<'granted' | 'denied' | 'cancelled'> {
  const goSettings = await new Promise<boolean>((resolve) => {
    Taro.showModal({
      title: '需要相机权限',
      content: `请在设置中允许${MINI_PROGRAM_NAME}使用相机，以便拍摄参考图片。`,
      confirmText: '去设置',
      cancelText: '取消',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    })
  })

  if (!goSettings) return 'cancelled'

  const openResult = await Taro.openSetting()
  if (isScopeGranted(openResult.authSetting, 'scope.camera')) return 'granted'
  if (await readScopeGranted('scope.camera')) return 'granted'
  return 'denied'
}

/** 选图：隐私授权（收集照片/视频）+ chooseMedia，不含「添加到相册」写入权限 */
async function attemptChooseMedia(
  options: Taro.chooseMedia.Option,
): Promise<Taro.chooseMedia.SuccessCallbackResult> {
  if (!(await isPrivacyAlreadyAgreed())) {
    await ensurePrivacyForMediaAction()
  }
  await syncPrivacyAuthorizeBeforeApi()
  return await Taro.chooseMedia(options)
}

/** 生成页选图：隐私（收集照片/视频）与下载（保存相册）分开处理 */
export async function chooseMediaWithPermission(
  options: Taro.chooseMedia.Option,
): Promise<Taro.chooseMedia.SuccessCallbackResult> {
  try {
    return await attemptChooseMedia(options)
  } catch (error) {
    if (isMediaPickerCancelled(error)) throw error
    if (isPrivacyAgreementCancelled(error)) throw error

    const message = extractErrorMessage(error)

    if (isPrivacyAuthorizeError(error)) {
      try {
        await ensurePrivacyForMediaAction()
        return await attemptChooseMedia(options)
      } catch (retryError) {
        if (isMediaPickerCancelled(retryError)) throw retryError
        throw retryError
      }
    }

    if (isCameraAuthError(message)) {
      const cameraResult = await promptOpenCameraSettings()
      if (cameraResult === 'cancelled') throw error
      try {
        await syncPrivacyAuthorizeBeforeApi()
        return await Taro.chooseMedia(options)
      } catch (retryError) {
        if (isMediaPickerCancelled(retryError)) throw retryError
        Taro.showToast({ title: '未获得相机权限', icon: 'none', duration: 3000 })
        throw retryError
      }
    }

    if (isMediaAuthError(message)) {
      Taro.showToast({
        title: '无法访问相册，请在系统设置中允许微信访问照片',
        icon: 'none',
        duration: 3000,
      })
      throw error
    }

    throw error
  }
}

function promptIcloudImageHelp(): void {
  Taro.showModal({
    title: '照片可能未下载到手机',
    content: '所选照片可能还在 iCloud 或未完全下载。请先在系统相册打开该照片并等待加载完成，或换一张本机 JPG / PNG 后重试。',
    showCancel: false,
    confirmText: '知道了',
  })
}

function promptFormatHelp(): void {
  Taro.showModal({
    title: '图片格式或体积不支持',
    content: '请使用 JPG / PNG 普通照片，避免实况照片。可先通过「存储图像」保存为标准格式，或换一张体积更小、清晰度适中的图片。',
    showCancel: false,
    confirmText: '知道了',
  })
}

function isSourceImagePersistError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === 'SourceImagePersistError')
    || (error instanceof Error && (
      error.message.includes('无法保存所选图片')
      || error.message.includes('无法读取所选图片')
      || error.message.includes('本地图片已失效')
      || error.message.includes('请先上传图片')
    ))
  )
}

function promptSourceImageUnavailable(message?: string): void {
  Taro.showModal({
    title: '请重新选择照片',
    content: message || '本地图片暂时无法读取，请再试一次或重新选择该照片。',
    showCancel: false,
    confirmText: '知道了',
  })
}

function promptImageReadFailed(): void {
  const content = isIosDevice()
    ? '请尝试：\n1. 再点一次「下一步」或「重新预览」\n2. 回到生成页重新选择该照片后再生成\n3. 若仍失败，换一张本机 JPG / PNG（非实况）'
    : '请再试一次，或回到生成页重新选择该照片。多半是本地缓存路径失效，不一定是图片格式问题。'

  Taro.showModal({
    title: '无法读取这张照片',
    content,
    showCancel: false,
    confirmText: '知道了',
  })
}

function promptEmptyPickerResult(): void {
  const content = isIosDevice()
    ? '未获取到可用图片。请换一张本机 JPG / PNG，或检查 iCloud 照片是否已下载、相册权限是否允许访问该照片。'
    : '未获取到可用图片，请换一张 JPG / PNG 后重试。'

  Taro.showModal({
    title: '未获取到图片',
    content,
    showCancel: false,
    confirmText: '知道了',
  })
}

/** 选图/拍照失败时的分类提示（用户取消时不调用） */
export function handleMediaPickerError(error: unknown): void {
  const message = extractErrorMessage(error)

  if (isPrivacyAgreementCancelled(error)) return

  if (isPrivacyAuthorizeError(error)) {
    Taro.showToast({ title: '请先同意隐私保护指引', icon: 'none', duration: 3000 })
    return
  }

  if (isCameraAuthError(message)) {
    void promptOpenCameraSettings()
    return
  }

  if (isMediaAuthError(message)) {
    Taro.showToast({
      title: '无法访问相册，请在系统设置中允许微信访问照片',
      icon: 'none',
      duration: 3000,
    })
    return
  }

  if (isIcloudOrDownloadError(message)) {
    promptIcloudImageHelp()
    return
  }

  if (isFormatOrSizeError(message)) {
    promptFormatHelp()
    return
  }

  if (isIosDevice() && !message.trim()) {
    promptEmptyPickerResult()
    return
  }

  Taro.showToast({
    title: normalizeToastMessage(message, '无法选择图片，请稍后重试'),
    icon: 'none',
    duration: 3000,
  })
}

/** 选图 API 成功但未返回路径 */
export function notifyMediaPickerEmptyResult(): void {
  promptEmptyPickerResult()
}

/** 生成/处理阶段读取图片失败 */
export function handleImageProcessError(error: unknown, fallback = '生成失败'): void {
  const message = extractErrorMessage(error)

  if (isPrivacyAgreementCancelled(error)) return

  if (isLocalStorageLimitError(error)) {
    cleanupDisposableLocalFiles()
    showStorageLimitModal()
    return
  }

  if (isSourceImagePersistError(error)) {
    promptSourceImageUnavailable(message)
    return
  }

  if (isImageReadError(message)) {
    promptImageReadFailed()
    return
  }

  if (isIcloudOrDownloadError(message)) {
    promptIcloudImageHelp()
    return
  }

  if (isFormatOrSizeError(message)) {
    promptFormatHelp()
    return
  }

  if (isPrivacyAuthorizeError(error)) {
    Taro.showToast({ title: '请先同意隐私保护指引', icon: 'none', duration: 3000 })
    return
  }

  Taro.showToast({
    title: normalizeToastMessage(message, fallback),
    icon: 'none',
    duration: 3000,
  })
}
