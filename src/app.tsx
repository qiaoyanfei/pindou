import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import Taro from '@tarojs/taro'
import { getPalette } from '@/services/palette'
import { initCloud } from '@/services/cloudClient'
import { restoreSessionFromStorage, refreshSessionIfLoggedIn } from '@/services/session'
import './app.scss'

function App({ children }: PropsWithChildren) {
  useLaunch((options) => {
    getPalette()
    const inviterId = options?.query?.inviterId as string | undefined
    if (inviterId) {
      Taro.setStorageSync('inviterId', inviterId)
    }
    if (initCloud()) {
      restoreSessionFromStorage()
      refreshSessionIfLoggedIn().catch(() => {
        // 云环境未配置或未登录时在页面内提示
      })
    }
  })

  return children
}

export default App
