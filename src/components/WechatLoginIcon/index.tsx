import { Image } from '@tarojs/components'
import wechatIcon from '@/assets/icons/wechat-login-icon.png'
import './index.scss'

export default function WechatLoginIcon() {
  return (
    <Image
      className='wechat-login-icon'
      src={wechatIcon}
      mode='aspectFit'
    />
  )
}
