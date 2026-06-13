import { View, Text, Image } from '@tarojs/components'
import type { PostSummary } from '@/types/community'
import { formatCount, formatPostMeta } from '@/services/communityService'
import { formatDateTime } from '@/utils/formatDate'
import { resolveAuthorNickName } from '@/utils/userProfile'
import { resolveReviewStatus, REVIEW_STATUS_LABELS } from '@/utils/postReview'
import chevronRightIcon from '@/assets/icons/chevron-right-grey.svg'
import mineLikeIcon from '@/assets/icons/mine-like.svg'
import mineFavoriteIcon from '@/assets/icons/mine-favorite.svg'
import statLikeIcon from '@/assets/icons/stat-like-grey.svg'
import statStarIcon from '@/assets/icons/stat-star-grey.svg'
import statDownloadIcon from '@/assets/icons/stat-download-grey.svg'
import './index.scss'

interface PostListItemProps {
  item: PostSummary
  mode?: 'default' | 'like' | 'favorite' | 'pending' | 'published'
  tintIndex?: number
  coverTint?: string
  onClick?: () => void
  onPublish?: () => void
  onRegenerate?: () => void
}

function renderIconStats(item: PostSummary) {
  return (
    <View className='post-list-item__stats post-list-item__stats--icons'>
      <View className='post-list-item__stat-item'>
        <Image className='post-list-item__stat-icon' src={statLikeIcon} mode='aspectFit' />
        <Text className='post-list-item__stat-value'>{formatCount(item.likeCount)}</Text>
      </View>
      <View className='post-list-item__stat-item'>
        <Image className='post-list-item__stat-icon' src={statStarIcon} mode='aspectFit' />
        <Text className='post-list-item__stat-value'>{formatCount(item.favoriteCount)}</Text>
      </View>
      <View className='post-list-item__stat-item'>
        <Image className='post-list-item__stat-icon' src={statDownloadIcon} mode='aspectFit' />
        <Text className='post-list-item__stat-value'>{formatCount(item.downloadCount)}</Text>
      </View>
    </View>
  )
}

function renderColoredStats(item: PostSummary) {
  return (
    <View className='post-list-item__stats post-list-item__stats--colored'>
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
  onRegenerate,
}: PostListItemProps) {
  const tint = coverTint || ['#f3e8ff', '#fef3c7', '#dcfce7', '#ffe4e6', '#e0f2fe'][tintIndex % 5]
  const authorName = resolveAuthorNickName(item.author?.nickName, item.author?.openid)
  const authorAvatar = item.author?.avatarUrl || ''
  const useIconStats = mode === 'like' || mode === 'favorite' || mode === 'default'
  const reviewStatus = resolveReviewStatus(item.reviewStatus, item.visibility)

  const timeLabel =
    mode === 'like'
      ? `${formatDateTime(item.likedAt || item.createdAt)} 点赞`
      : mode === 'favorite'
        ? `${formatDateTime(item.favoritedAt || item.createdAt)} 收藏`
        : mode === 'pending'
          ? `保存于 ${formatDateTime(item.publishedAt || item.updatedAt || item.createdAt)}`
          : `发布于 ${formatDateTime(item.publishedAt || item.createdAt)}`

  return (
    <View className={`post-list-item${mode === 'like' || mode === 'favorite' ? ' post-list-item--interaction' : ''}`} onClick={onClick}>
      <View className='post-list-item__cover-wrap' style={{ background: tint }}>
        <Image className='post-list-item__cover' src={item.coverUrl || ''} mode='aspectFit' />
      </View>

      <View className='post-list-item__body'>
        <Text className='post-list-item__title'>{item.title}</Text>

        {mode === 'published' || mode === 'pending' ? (
          <>
            {mode === 'pending' ? (
              <Text className={`post-list-item__review-tag post-list-item__review-tag--${reviewStatus}`}>
                {REVIEW_STATUS_LABELS[reviewStatus]}
              </Text>
            ) : null}
            <Text className='post-list-item__time'>{timeLabel}</Text>
            <Text className='post-list-item__meta'>{formatPostMeta(item)}</Text>
            {mode === 'published' && item.category ? (
              <Text className='post-list-item__tag'>{item.category}</Text>
            ) : null}
            {mode === 'published' ? renderColoredStats(item) : null}
          </>
        ) : (
          <>
            <View className='post-list-item__author'>
              {authorAvatar ? (
                <Image className='post-list-item__avatar' src={authorAvatar} mode='aspectFill' />
              ) : (
                <View className='post-list-item__avatar post-list-item__avatar--placeholder' />
              )}
              <Text className='post-list-item__author-name'>{authorName}</Text>
            </View>
            <Text className='post-list-item__meta'>{formatPostMeta(item)}</Text>
            <Text className='post-list-item__time'>{timeLabel}</Text>
            {useIconStats ? renderIconStats(item) : renderColoredStats(item)}
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

      {mode === 'pending' && reviewStatus === 'draft' ? (
        <View
          className='post-list-item__publish'
          onClick={(event) => {
            event.stopPropagation()
            onPublish?.()
          }}
        >
          去公开
        </View>
      ) : null}

      {mode === 'pending' && reviewStatus === 'rejected' ? (
        <View
          className='post-list-item__publish post-list-item__publish--regenerate'
          onClick={(event) => {
            event.stopPropagation()
            onRegenerate?.()
          }}
        >
          重新生成
        </View>
      ) : null}

      {mode === 'published' || mode === 'default' ? (
        <Image className='post-list-item__arrow' src={chevronRightIcon} mode='aspectFit' />
      ) : null}
    </View>
  )
}
