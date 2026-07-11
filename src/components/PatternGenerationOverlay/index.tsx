import { View, Text } from '@tarojs/components'
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
  const cancelUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setTabBarInteractionBlocked(visible)
    return () => setTabBarInteractionBlocked(false)
  }, [visible])

  useEffect(() => {
    if (cancelUnlockTimerRef.current) {
      clearTimeout(cancelUnlockTimerRef.current)
      cancelUnlockTimerRef.current = null
    }

    if (!visible) {
      setCanCancel(false)
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

  return (
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

        {canCancel && onCancel ? (
          <View className='pattern-generation-overlay__cancel' onClick={onCancel}>
            {PATTERN_GENERATION_OVERLAY_CANCEL_LABEL}
          </View>
        ) : null}
      </View>
    </View>
  )
}
