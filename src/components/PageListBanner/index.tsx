import { View, Text, Image } from '@tarojs/components'
import chevronRightIcon from '@/assets/icons/chevron-right-grey.svg'
import './index.scss'

interface PageListBannerProps {
  variant?: 'default' | 'tip' | 'summary'
  icon?: string
  title: string
  desc?: string
  showChevron?: boolean
  onClick?: () => void
}

export default function PageListBanner({
  variant = 'default',
  icon = '📁',
  title,
  desc,
  showChevron = false,
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
      {showChevron ? (
        <Image className='page-list-banner__chevron' src={chevronRightIcon} mode='aspectFit' />
      ) : null}
    </View>
  )
}
