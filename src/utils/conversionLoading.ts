import Taro from '@tarojs/taro'

const SHOW_THROTTLE_MS = 250

export function createConversionLoadingController(options?: { mask?: boolean }) {
  let stopped = false
  let currentTitle = ''
  let showThrottleTimer: ReturnType<typeof setTimeout> | null = null
  let pendingTitle: string | null = null
  const useMask = options?.mask !== false

  const clearShowThrottle = () => {
    if (showThrottleTimer) {
      clearTimeout(showThrottleTimer)
      showThrottleTimer = null
    }
    pendingTitle = null
  }

  const renderLoading = (title: string) => {
    if (stopped) return
    currentTitle = title
    Taro.showLoading({ title, mask: useMask })
  }

  const show = (title: string) => {
    if (stopped) return
    pendingTitle = title
    if (showThrottleTimer) return
    renderLoading(title)
    showThrottleTimer = setTimeout(() => {
      showThrottleTimer = null
      const next = pendingTitle
      pendingTitle = null
      if (next && next !== currentTitle && !stopped) {
        renderLoading(next)
      }
    }, SHOW_THROTTLE_MS)
  }

  const start = () => {
    stopped = false
  }

  const stop = () => {
    stopped = true
    currentTitle = ''
    clearShowThrottle()
    Taro.hideLoading()
  }

  return { start, show, stop }
}
