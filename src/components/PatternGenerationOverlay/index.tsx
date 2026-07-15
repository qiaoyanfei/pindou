import { View, Text, PageContainer, AdCustom } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import {
  formatGenerationOverlayLocalPercent,
  formatGenerationOverlayOverallPercent,
  formatGenerationOverlayStage,
  getGenerationOverlayProgress,
  PATTERN_GENERATION_CANCEL_UNLOCK_MS,
  PATTERN_GENERATION_OVERLAY_CANCEL_LABEL,
  PATTERN_GENERATION_OVERLAY_HINT,
  PATTERN_GENERATION_OVERLAY_PATIENCE_HINT,
} from '@/utils/patternGenerationProgress'
import { setTabBarInteractionBlocked } from '@/utils/tabBar'
import './index.scss'

const GENERATION_AD_UNIT_ID = 'adunit-eea1e16ec3cd6b6d'

export interface PatternGenerationOverlayProps {
  visible: boolean
  stageMessage: string
  percent: number | null
  onCancel?: () => void
}

export default function PatternGenerationOverlay({
  visible,
  stageMessage,
  percent,
  onCancel,
}: PatternGenerationOverlayProps) {
  const [canCancel, setCanCancel] = useState(false)
  const [adVisible, setAdVisible] = useState(process.env.TARO_ENV === 'weapp')
  const [backGuardVisible, setBackGuardVisible] = useState(false)
  const cancelUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remountBackGuardRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  useEffect(() => {
    setTabBarInteractionBlocked(visible)
    return () => setTabBarInteractionBlocked(false)
  }, [visible])

  useEffect(() => {
    setBackGuardVisible(visible)
    return () => {
      if (remountBackGuardRef.current) {
        clearTimeout(remountBackGuardRef.current)
        remountBackGuardRef.current = null
      }
    }
  }, [visible])

  const handleBeforeLeave = () => {
    Taro.showToast({ title: '正在生成中，请稍候', icon: 'none' })
    setBackGuardVisible(false)
    remountBackGuardRef.current = setTimeout(() => {
      remountBackGuardRef.current = null
      if (visibleRef.current) {
        setBackGuardVisible(true)
      }
    }, 50)
  }

  useEffect(() => {
    if (cancelUnlockTimerRef.current) {
      clearTimeout(cancelUnlockTimerRef.current)
      cancelUnlockTimerRef.current = null
    }

    if (!visible) {
      setCanCancel(false)
      setAdVisible(process.env.TARO_ENV === 'weapp')
      return
    }

    setCanCancel(false)
    cancelUnlockTimerRef.current = setTimeout(() => {
      cancelUnlockTimerRef.current = null
      setCanCancel(true)
    }, PATTERN_GENERATION_CANCEL_UNLOCK_MS)

    return () => {
      if (cancelUnlockTimerRef.current) {
        clearTimeout(cancelUnlockTimerRef.current)
        cancelUnlockTimerRef.current = null
      }
    }
  }, [visible])

  if (!visible) return null

  const overallPercent = percent ?? 0
  const { stagePercent, overallPercent: clampedOverall } = getGenerationOverlayProgress(
    stageMessage,
    overallPercent,
  )
  const stageLabel = formatGenerationOverlayStage(stageMessage)
  const stagePercentText = formatGenerationOverlayLocalPercent(stageMessage, overallPercent)
  const overallPercentText = formatGenerationOverlayOverallPercent(overallPercent)
  const hintText = canCancel ? PATTERN_GENERATION_OVERLAY_PATIENCE_HINT : PATTERN_GENERATION_OVERLAY_HINT
  const adEventHandlers = {
    onLoad: () => {
      console.log('原生模板广告加载成功')
    },
    onError: (error) => {
      console.error('原生模板广告加载失败', error)
      setAdVisible(false)
    },
    onClose: () => {
      console.log('原生模板广告关闭')
      setAdVisible(false)
    },
  } as Record<string, unknown>

  return (
    <>
      {backGuardVisible ? (
        <PageContainer show overlay={false} onBeforeLeave={handleBeforeLeave} />
      ) : null}
      <View className='pattern-generation-overlay' catchMove>
      <View className='pattern-generation-overlay__panel'>
        <View className='pattern-generation-overlay__badge'>生成中</View>

        <View className='pattern-generation-overlay__ring'>
          <View className='pattern-generation-overlay__ring-track' />
          <View
            className='pattern-generation-overlay__ring-active'
            style={{ transform: `rotate(${(stagePercent / 100) * 360}deg)` }}
          />
          <View className='pattern-generation-overlay__ring-core'>
            <Text className='pattern-generation-overlay__percent'>{stagePercentText}</Text>
            <Text className='pattern-generation-overlay__percent-label'>当前阶段</Text>
          </View>
        </View>

        <Text className='pattern-generation-overlay__stage'>{stageLabel}</Text>

        <View className='pattern-generation-overlay__track-wrap'>
          <View className='pattern-generation-overlay__track-head'>
            <Text className='pattern-generation-overlay__track-label'>总进度</Text>
            <Text className='pattern-generation-overlay__track-value'>{overallPercentText}</Text>
          </View>
          <View className='pattern-generation-overlay__track'>
            <View
              className='pattern-generation-overlay__fill'
              style={{ width: `${clampedOverall}%` }}
            />
          </View>
        </View>

        <Text className='pattern-generation-overlay__hint'>{hintText}</Text>

        {adVisible ? (
          <View className='pattern-generation-overlay__ad'>
            <AdCustom
              unitId={GENERATION_AD_UNIT_ID}
              {...adEventHandlers}
            />
          </View>
        ) : null}

        {canCancel && onCancel ? (
          <View className='pattern-generation-overlay__cancel' onClick={onCancel}>
            {PATTERN_GENERATION_OVERLAY_CANCEL_LABEL}
          </View>
        ) : null}
      </View>
      </View>
    </>
  )
}
