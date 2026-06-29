import Taro from '@tarojs/taro'
import { MINI_PROGRAM_NAME } from '@/utils/constants'

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return (error as { errMsg?: string })?.errMsg ?? ''
}

/** 本次小程序会话内用户已同意隐私指引（下载/选图共用） */
let privacyAuthorizedInSession = false
const PRIVACY_AGREEMENT_CANCELLED = 'privacy_agreement_cancelled'

type PrivacyCallbackResult = {
  errMsg?: string
}

type WxPrivacyApi = {
  getPrivacySetting?: (option: {
    success?: (res: { needAuthorization: boolean; privacyContractName: string }) => void
    fail?: (res: PrivacyCallbackResult) => void
  }) => void
  requirePrivacyAuthorize?: (option: {
    success?: () => void
    fail?: (res: PrivacyCallbackResult) => void
  }) => void
  openPrivacyContract?: (option?: object) => void
}

function getWxPrivacyApi(): WxPrivacyApi | null {
  if (process.env.TARO_ENV !== 'weapp') return null
  const runtimeGlobal = globalThis as typeof globalThis & { wx?: WxPrivacyApi }
  return runtimeGlobal.wx ?? null
}

function invokeRequirePrivacyAuthorize(): Promise<void> {
  const wxApi = getWxPrivacyApi()
  if (!wxApi?.requirePrivacyAuthorize) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    wxApi.requirePrivacyAuthorize!({
      success: () => {
        privacyAuthorizedInSession = true
        resolve()
      },
      fail: (err) => reject(err ?? new Error('用户未同意隐私协议')),
    })
  })
}

/** 调用隐私 API 前强制同步一次授权（已同意时无弹窗，下载保存使用） */
export async function syncPrivacyAuthorizeBeforeApi(): Promise<void> {
  const wxApi = getWxPrivacyApi()
  if (!wxApi?.requirePrivacyAuthorize) return

  try {
    await invokeRequirePrivacyAuthorize()
  } catch (error) {
    if (!isPrivacyAuthorizeError(error)) throw error
    const agreed = await promptPrivacyAgreementAsync()
    if (!agreed) throw new Error(PRIVACY_AGREEMENT_CANCELLED)
  }
}

/** 是否仍需弹出隐私指引 */
async function needsPrivacyAuthorization(): Promise<boolean> {
  if (privacyAuthorizedInSession) return false

  const wxApi = getWxPrivacyApi()
  if (!wxApi?.getPrivacySetting) return true

  try {
    const res = await new Promise<{ needAuthorization: boolean }>((resolve, reject) => {
      wxApi.getPrivacySetting!({
        success: (setting) => resolve(setting),
        fail: (err) => reject(err),
      })
    })
    if (!res.needAuthorization) {
      privacyAuthorizedInSession = true
      return false
    }
    return true
  } catch {
    return true
  }
}

/** 自定义弹窗兜底（与微信原生授权配合） */
async function promptPrivacyAgreementAsync(): Promise<boolean> {
  const confirmed = await new Promise<boolean>((resolve) => {
    Taro.showModal({
      title: '需要同意隐私指引',
      content: `使用相册或相机需您同意${MINI_PROGRAM_NAME}用户隐私保护指引，同意后将自动继续。`,
      confirmText: '去同意',
      cancelText: '取消',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    })
  })

  if (!confirmed) return false

  try {
    await invokeRequirePrivacyAuthorize()
    return privacyAuthorizedInSession
  } catch {
    const wxApi = getWxPrivacyApi()
    if (typeof wxApi?.openPrivacyContract === 'function') {
      wxApi.openPrivacyContract({})
    }
    return false
  }
}

/**
 * 用户是否已同意隐私指引（含下载页授权后会话内复用）
 * 选图仅在未同意时才弹隐私窗，已同意则直接调 chooseMedia
 */
export async function isPrivacyAlreadyAgreed(): Promise<boolean> {
  if (privacyAuthorizedInSession) return true
  return !(await needsPrivacyAuthorization())
}

/**
 * 下载 / 选图共用的隐私授权
 * 1. 已同意 → 直接通过
 * 2. 未同意 → 微信原生弹窗
 * 3. 仍失败 → 自定义「需要同意隐私指引」弹窗后再调原生授权
 */
export async function ensurePrivacyForMediaAction(): Promise<void> {
  if (privacyAuthorizedInSession) return

  const wxApi = getWxPrivacyApi()
  if (!wxApi) return

  if (!await needsPrivacyAuthorization()) return

  try {
    await invokeRequirePrivacyAuthorize()
    return
  } catch (error) {
    if (!isPrivacyAuthorizeError(error)) throw error
    const agreed = await promptPrivacyAgreementAsync()
    if (!agreed) throw new Error(PRIVACY_AGREEMENT_CANCELLED)
  }
}

/** chooseMedia 等仍报隐私错误时，清除缓存并重新授权 */
export function resetPrivacySessionCache(): void {
  privacyAuthorizedInSession = false
}

export function isPrivacyAuthorizeError(error: unknown): boolean {
  const lower = extractErrorMessage(error).toLowerCase()
  return (
    lower.includes('用户未同意隐私协议')
    || lower.includes('privacy permission')
    || lower.includes('needprivacyauthorization')
    || lower.includes('privacy api banned')
    || lower.includes('buttonid is wrong')
    || lower.includes('api scope is not declared')
    || lower.includes('api scope is not authorized')
    || (lower.includes('privacy') && lower.includes('not authorized'))
  )
}

export function isPrivacyAgreementCancelled(error: unknown): boolean {
  return extractErrorMessage(error) === PRIVACY_AGREEMENT_CANCELLED
}
