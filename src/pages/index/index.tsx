import Taro from '@tarojs/taro'

export default function LegacyIndexRedirect() {
  Taro.useLoad(() => {
    Taro.reLaunch({ url: '/pages/home/index' })
  })
  return null
}
