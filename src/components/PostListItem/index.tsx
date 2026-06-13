import { View, Text, Image } from '@tarojs/components'
import type { PostSummary } from '@/types/community'
import { formatCount, formatPostMeta } from '@/services/communityService'
import { formatDateTime } from '@/utils/formatDate'
import chevronRightIcon from '@/assets/icons/chevron-right-grey.svg'
import mineLikeIcon from '@/assets/icons/mine-like.svg'
import mineFavoriteIcon from '@/assets/icons/mine-favorite.svg'
import './index.scss'

interface PostListItemProps {
  item: PostSummary
  mode?: 'default' | 'like' | 'favorite' | 'draft' | 'published'
  tintIndex?: number
  coverTint?: string
  onClick?: () => void
  onPublish?: () => void
}

function renderStats(mode: PostListItemProps['mode'], item: PostSummary) {
  const colored = mode === 'published'
  return (
    <View className={`post-list-item__stats${colored ? ' post-list-item__stats--colored' : ''}`}>
      <Text className='post-list-item__stat post-list-item__stat--like'>♡ {formatCount(item.likeCount)}</Text>
      <Text className='post-list-item__stat post-list-item__stat--favorite'>★ {formatCount(item.favoriteCount)}</Text>
      <Text className='post-list-item__stat post-list-item__stat--download'>↓ {formatCount(item.downloadCount)}</Text>
    </View>
  )
}

export default function PostListItem({
  item,
  mode = 'default',
  tintIndex = 0,
  coverTint,
  onClick,
  onPublish,
}: PostListItemProps) {
  const tint = coverTint || ['#f3e8ff', '#fef3c7', '#dcfce7', '#ffe4e6', '#e0f2fe'][tintIndex % 5]
  const authorName = item.author?.nickName || '拼豆玩家'
  const authorAvatar = item.author?.avatarUrl || ''

  const timeLabel =
    mode === 'like'
      ? `${formatDateTime(item.likedAt || item.createdAt)} 点赞`
      : mode === 'favorite'
        ? `${formatDateTime(item.favoritedAt || item.createdAt)} 收藏`
        : mode === 'draft'
          ? `生成于 ${formatDateTime(item.updatedAt || item.createdAt)}`
          : `发布于 ${formatDateTime(item.publishedAt || item.createdAt)}`

  return (
    <View className='post-list-item' onClick={onClick}>
      <View className='post-list-item__cover-wrap' style={{ background: tint }}>
        <Image className='post-list-item__cover' src={item.coverUrl || ''} mode='aspectFill' />
      </View>

      <View className='post-list-item__body'>
        <Text className='post-list-item__title'>{item.title}</Text>

        {mode === 'published' || mode === 'draft' ? (
          <>
            <Text className='post-list-item__time'>{timeLabel}</Text>
            <Text className='post-list-item__meta'>{formatPostMeta(item)}</Text>
            {mode === 'published' && item.category ? (
              <Text className='post-list-item__tag'>{item.category}</Text>
            ) : null}
            {mode === 'published' ? renderStats(mode, item) : null}
          </>
        ) : (
          <>
            <View className='post-list-item__author'>
              {authorAvatar ? (
                <Image className='post-list-item__avatar' src={authorAvatar} />
              ) : (
                <View className='post-list-item__avatar post-list-item__avatar--placeholder' />
              )}
              <Text className='post-list-item__author-name'>{authorName}</Text>
            </View>
            <Text className='post-list-item__meta'>{formatPostMeta(item)}</Text>
            <Text className='post-list-item__time'>{timeLabel}</Text>
            {renderStats(mode, item)}
          </>
        )}
      </View>

      {mode === 'like' ? (
        <View className='post-list-item__status post-list-item__status--liked'>
          <Image className='post-list-item__status-icon' src={mineLikeIcon} mode='aspectFit' />
          <Text className='post-list-item__status-text'>已点赞</Text>
        </View>
      ) : null}

      {mode === 'favorite' ? (
        <View className='post-list-item__status post-list-item__status--favorited'>
          <Image className='post-list-item__status-icon' src={mineFavoriteIcon} mode='aspectFit' />
          <Text className='post-list-item__status-text'>已收藏</Text>
        </View>
      ) : null}

      {mode === 'draft' ? (
        <View
          className='post-list-item__publish'
          onClick={(event) => {
            event.stopPropagation()
            onPublish?.()
          }}
        >
          发布
        </View>
      ) : null}

      {mode === 'published' || mode === 'default' ? (
        <Image className='post-list-item__arrow' src={chevronRightIcon} mode='aspectFit' />
      ) : null}
    </View>
  )
}
