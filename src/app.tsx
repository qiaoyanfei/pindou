import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import { getPalette } from '@/services/palette'
import './app.scss'

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    getPalette()
  })

  return children
}

export default App
