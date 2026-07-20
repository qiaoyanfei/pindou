import Taro from '@tarojs/taro'

type InterstitialAdLike = {
  show: () => Promise<unknown>
  destroy?: () => void
  onLoad: (listener: () => void) => void
  onError: (listener: (err: { errMsg?: string; errCode?: number }) => void) => void
  onClose: (listener: () => void) => void
  offLoad?: (listener: (...args: unknown[]) => void) => void
  offError?: (listener: (...args: unknown[]) => void) => void
  offClose?: (listener: (...args: unknown[]) => void) => void
}

export type InterstitialAdSession = {
  /** 尝试展示；失败静默（无填充/频控不影响页面） */
  show: () => Promise<boolean>
  destroy: () => void
}

function getCreateInterstitialAd():
  | ((option: { adUnitId: string }) => InterstitialAdLike)
  | null {
  if (process.env.TARO_ENV !== 'weapp') return null
  const runtime = Taro as typeof Taro & {
    createInterstitialAd?: (option: { adUnitId: string }) => InterstitialAdLike
  }
  return typeof runtime.createInterstitialAd === 'function'
    ? runtime.createInterstitialAd.bind(runtime)
    : null
}

/**
 * 创建页面级插屏广告。离开页面时 destroy。
 * 文档：插屏不宜一进页立刻弹，建议短暂延迟后再 show。
 */
export function createInterstitialAdSession(adUnitId: string): InterstitialAdSession | null {
  const create = getCreateInterstitialAd()
  if (!create || !adUnitId.trim()) return null

  let ad: InterstitialAdLike | null = create({ adUnitId })
  let destroyed = false

  const onError = (err: { errMsg?: string; errCode?: number }) => {
    console.error('插屏广告错误', err)
  }
  const onClose = () => {
    // 关闭后无需处理
  }

  ad.onError(onError)
  ad.onClose(onClose)
  ad.onLoad(() => {
    // loaded
  })

  return {
    async show() {
      if (!ad || destroyed) return false
      try {
        await ad.show()
        return true
      } catch (err) {
        console.error('插屏广告显示失败', err)
        return false
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
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
