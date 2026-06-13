import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import Taro from '@tarojs/taro'
import { getPalette } from '@/services/palette'
import { initCloud } from '@/services/cloudClient'
import { login } from '@/services/communityService'
import './app.scss'

function App({ children }: PropsWithChildren) {
  useLaunch((options) => {
    getPalette()
    const inviterId = options?.query?.inviterId as string | undefined
    if (inviterId) {
      Taro.setStorageSync('inviterId', inviterId)
    }
    if (initCloud()) {
      const storedInviter = Taro.getStorageSync('inviterId') as string | undefined
      login({ inviterId: storedInviter || inviterId })
        .then(() => {
          if (storedInviter || inviterId) Taro.removeStorageSync('inviterId')
        })
        .catch(() => {
          // 云环境未配置时在页面内提示
        })
    }
  })

  return children
}

export default App
