import { View, Text } from '@tarojs/components'
import './index.scss'

interface PageListBannerProps {
  variant?: 'default' | 'tip' | 'summary'
  icon?: string
  title: string
  desc?: string
  onClick?: () => void
}

export default function PageListBanner({
  variant = 'default',
  icon = '📁',
  title,
  desc,
  onClick,
}: PageListBannerProps) {
  const className = `page-list-banner page-list-banner--${variant}${onClick ? ' page-list-banner--clickable' : ''}`

  return (
    <View className={className} onClick={onClick}>
      <Text className='page-list-banner__icon'>{icon}</Text>
      <View className='page-list-banner__content'>
        <Text className='page-list-banner__title'>{title}</Text>
        {desc ? <Text className='page-list-banner__desc'>{desc}</Text> : null}
      </View>
    </View>
  )
}
