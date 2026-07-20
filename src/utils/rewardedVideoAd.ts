import Taro from '@tarojs/taro'

export type RewardedVideoResult = 'completed' | 'skipped' | 'failed' | 'unavailable'

type RewardedVideoAdLike = {
  show: () => Promise<unknown>
  load: () => Promise<unknown>
  destroy?: () => void
  onLoad: (listener: (res?: { useFallbackSharePage?: boolean }) => void) => void
  onError: (listener: (err: { errMsg?: string; errCode?: number }) => void) => void
  onClose: (listener: (res: { isEnded?: boolean } | undefined) => void) => void
  offLoad?: (listener: (...args: unknown[]) => void) => void
  offError?: (listener: (...args: unknown[]) => void) => void
  offClose?: (listener: (...args: unknown[]) => void) => void
}

export type ShowRewardedVideoOptions = {
  /** 广告界面已弹出（可立刻关掉「加载中」） */
  onPresented?: () => void
}

export type RewardedVideoSession = {
  preload: () => void
  show: (options?: ShowRewardedVideoOptions) => Promise<RewardedVideoResult>
  destroy: () => void
}

const SHOW_TIMEOUT_MS = 15_000

function getCreateRewardedVideoAd():
  | ((option: { adUnitId: string }) => RewardedVideoAdLike)
  | null {
  if (process.env.TARO_ENV !== 'weapp') return null
  const runtime = Taro as typeof Taro & {
    createRewardedVideoAd?: (option: { adUnitId: string }) => RewardedVideoAdLike
  }
  return typeof runtime.createRewardedVideoAd === 'function'
    ? runtime.createRewardedVideoAd.bind(runtime)
    : null
}

async function showWithRetry(ad: RewardedVideoAdLike): Promise<void> {
  try {
    await ad.show()
  } catch {
    // 拉取失败或上一条关闭后未就绪时，手动 load 再 show
    await ad.load()
    await ad.show()
  }
}

/**
 * 创建「当前页」激励视频会话。
 * 微信文档：小程序里激励视频是页面级单例，禁止跨页面复用；离开页面时务必 destroy。
 */
export function createRewardedVideoSession(adUnitId: string): RewardedVideoSession | null {
  const create = getCreateRewardedVideoAd()
  if (!create || !adUnitId.trim()) return null

  let ad: RewardedVideoAdLike | null = create({ adUnitId })
  let pendingResolve: ((result: RewardedVideoResult) => void) | null = null
  let lastError: { errMsg?: string; errCode?: number } | null = null
  let destroyed = false

  const settle = (result: RewardedVideoResult) => {
    if (!pendingResolve) return
    const resolve = pendingResolve
    pendingResolve = null
    resolve(result)
  }

  const onError = (err: { errMsg?: string; errCode?: number }) => {
    lastError = err
    console.error('激励视频广告错误', err)
    // 仅在用户正等待 show 结果时才 settle；预加载失败不误伤后续点击
    settle('failed')
  }

  const onClose = (res: { isEnded?: boolean } | undefined) => {
    // 旧基础库可能不返回 res，视为已看完
    if (res === undefined) {
      settle('completed')
    } else {
      settle(res?.isEnded ? 'completed' : 'skipped')
    }
    // 关闭后预拉下一条，缩短下次等待
    if (ad && !destroyed) {
      void ad.load().catch(() => {
        // 预拉失败可忽略，下次 show 会再 load
      })
    }
  }

  ad.onError(onError)
  ad.onClose(onClose)
  ad.onLoad(() => {
    lastError = null
  })

  return {
    preload() {
      if (!ad || destroyed) return
      void ad.load().catch(() => {
        // 预加载失败不影响后续 show 重试
      })
    },

    show(options?: ShowRewardedVideoOptions) {
      if (!ad || destroyed) return Promise.resolve('unavailable')

      return new Promise((resolve) => {
        if (pendingResolve) {
          resolve('failed')
          return
        }

        pendingResolve = resolve
        lastError = null
        let presented = false

        const timeoutId = setTimeout(() => {
          if (!presented && pendingResolve) {
            console.error('激励视频广告显示超时', lastError)
            settle('failed')
          }
        }, SHOW_TIMEOUT_MS)

        const userResolve = pendingResolve
        pendingResolve = (result) => {
          clearTimeout(timeoutId)
          userResolve(result)
        }

        void showWithRetry(ad)
          .then(() => {
            presented = true
            clearTimeout(timeoutId)
            options?.onPresented?.()
          })
          .catch((err) => {
            console.error('激励视频广告显示失败', err, lastError)
            settle('failed')
          })
      })
    },

    destroy() {
      if (destroyed) return
      destroyed = true
      settle('failed')
      const current = ad
      ad = null
      if (!current) return
      try {
        current.offError?.(onError)
        current.offClose?.(onClose)
      } catch {
        // ignore
      }
      try {
        current.destroy?.()
      } catch {
        // ignore
      }
    },
  }
}

/** @deprecated 保留给临时调用；新代码请用 createRewardedVideoSession */
let legacySession: RewardedVideoSession | null = null

export function preloadRewardedVideoAd(adUnitId: string): void {
  if (!legacySession) {
    legacySession = createRewardedVideoSession(adUnitId)
  }
  legacySession?.preload()
}

export function showRewardedVideoAd(
  adUnitId: string,
  options?: ShowRewardedVideoOptions,
): Promise<RewardedVideoResult> {
  if (!legacySession) {
    legacySession = createRewardedVideoSession(adUnitId)
  }
  if (!legacySession) return Promise.resolve('unavailable')
  return legacySession.show(options)
}
