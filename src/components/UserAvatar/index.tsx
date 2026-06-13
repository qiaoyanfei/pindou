import { useEffect, useState } from 'react'
import { View, Image } from '@tarojs/components'
import { getTempFileUrl } from '@/services/cloudClient'
import './index.scss'

interface UserAvatarProps {
  avatarUrl?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function UserAvatar({
  avatarUrl = '',
  size = 'md',
  className = '',
}: UserAvatarProps) {
  const [displayUrl, setDisplayUrl] = useState('')
  const sizeClass = `user-avatar--${size}`

  useEffect(() => {
    let cancelled = false

    async function resolve() {
      const stored = avatarUrl.trim()
      if (!stored) {
        setDisplayUrl('')
        return
      }

      if (stored.startsWith('cloud://')) {
        try {
          const url = await getTempFileUrl(stored)
          if (!cancelled) setDisplayUrl(url || '')
        } catch {
          if (!cancelled) setDisplayUrl('')
        }
        return
      }

      if (
        stored.startsWith('http://')
        || stored.startsWith('https://')
        || stored.startsWith('wxfile://')
        || stored.startsWith('/')
      ) {
        if (!cancelled) setDisplayUrl(stored)
        return
      }

      if (!cancelled) setDisplayUrl('')
    }

    void resolve()
    return () => {
      cancelled = true
    }
  }, [avatarUrl])

  if (displayUrl) {
    return (
      <Image
        className={`user-avatar user-avatar--image ${sizeClass} ${className}`}
        src={displayUrl}
        mode='aspectFill'
      />
    )
  }

  return <View className={`user-avatar user-avatar--placeholder ${sizeClass} ${className}`} />
}
