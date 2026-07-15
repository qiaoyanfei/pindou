import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import Taro from '@tarojs/taro'
import { getPalette } from '@/services/palette'
import { initCloud } from '@/services/cloudClient'
import { cleanupOnAppLaunch } from '@/utils/localCache'
import { restoreSessionFromStorage, refreshSessionIfLoggedIn } from '@/services/session'
import './app.scss'

function deferLaunchTask(task: () => void | Promise<void>, delay = 0): void {
  setTimeout(() => {
    void Promise.resolve(task()).catch(() => {
      // 非首屏启动任务失败时交给页面内流程兜底
    })
  }, delay)
}

function App({ children }: PropsWithChildren) {
  useLaunch((options) => {
    const inviterId = options?.query?.inviterId as string | undefined
    if (inviterId) {
      Taro.setStorageSync('inviterId', inviterId)
    }
    if (initCloud()) {
      restoreSessionFromStorage()
      deferLaunchTask(refreshSessionIfLoggedIn, 500)
    }
    deferLaunchTask(getPalette, 800)
    deferLaunchTask(cleanupOnAppLaunch, 1200)
  })

  return children
}

export default App
