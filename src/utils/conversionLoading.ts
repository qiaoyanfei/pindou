import Taro from '@tarojs/taro'

export function createConversionLoadingController() {
  let stopped = false

  const show = (title: string) => {
    if (stopped) return
    Taro.showLoading({ title, mask: true })
  }

  const start = () => {
    stopped = false
  }

  const stop = () => {
    stopped = true
    Taro.hideLoading()
  }

  return { start, show, stop }
}
