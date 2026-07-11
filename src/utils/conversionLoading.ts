import Taro from '@tarojs/taro'

const KEEP_ALIVE_MS = 8000
const SHOW_THROTTLE_MS = 250

export function createConversionLoadingController(options?: { mask?: boolean }) {
  let stopped = false
  let currentTitle = ''
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null
  let showThrottleTimer: ReturnType<typeof setTimeout> | null = null
  let pendingTitle: string | null = null
  const useMask = options?.mask !== false

  const clearKeepAlive = () => {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer)
      keepAliveTimer = null
    }
  }

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
    if (!keepAliveTimer) {
      keepAliveTimer = setInterval(() => {
        if (stopped || !currentTitle) return
        Taro.showLoading({ title: currentTitle, mask: useMask })
      }, KEEP_ALIVE_MS)
    }
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
    clearKeepAlive()
    clearShowThrottle()
    Taro.hideLoading()
  }

  return { start, show, stop }
}
