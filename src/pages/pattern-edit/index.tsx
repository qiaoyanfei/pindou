import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import PatternEditor from '@/components/PatternEditor'
import { notifyOperationError, setStorageSafe } from '@/utils/localCache'
import { DEFAULT_CONFIG, normalizeConfig } from '@/utils/constants'
import { PATTERN_STORAGE_KEY, type PatternConfig, type PatternResult } from '@/types'
import './index.scss'

interface StoredPayload {
  pattern: PatternResult
  config: PatternConfig
}

const PATTERN_PERSIST_DELAY_MS = 400

export default function PatternEditPage() {
  const [pattern, setPattern] = useState<PatternResult | null>(null)
  const [config, setConfig] = useState<PatternConfig>({ ...DEFAULT_CONFIG })
  const [navLayout, setNavLayout] = useState({ paddingTop: 48, rowHeight: 32 })
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const configRef = useRef(config)
  const patternRef = useRef<PatternResult | null>(null)

  configRef.current = config
  patternRef.current = pattern

  useEffect(() => {
    const menu = Taro.getMenuButtonBoundingClientRect()
    setNavLayout({
      paddingTop: menu.top,
      rowHeight: menu.height,
    })
  }, [])

  const persistPattern = useCallback((nextPattern: PatternResult, immediate = false) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }

    const write = () => {
      setStorageSafe(PATTERN_STORAGE_KEY, { pattern: nextPattern, config: configRef.current })
    }

    if (immediate) {
      write()
      return
    }

    persistTimerRef.current = setTimeout(write, PATTERN_PERSIST_DELAY_MS)
  }, [])

  useDidShow(() => {
    const stored = Taro.getStorageSync(PATTERN_STORAGE_KEY) as StoredPayload | undefined
    if (!stored?.pattern) {
      Taro.showToast({ title: '请先制作图纸', icon: 'none' })
      setTimeout(() => Taro.navigateBack(), 800)
      return
    }

    setPattern(stored.pattern)
    setConfig(normalizeConfig(stored.config))
  })

  const handlePatternChange = useCallback((nextPattern: PatternResult) => {
    setPattern(nextPattern)
    persistPattern(nextPattern)
  }, [persistPattern])

  const handleDone = () => {
    if (patternRef.current) {
      try {
        persistPattern(patternRef.current, true)
      } catch (error) {
        notifyOperationError(error, '保存失败')
        return
      }
    }
    Taro.navigateBack()
  }

  if (!pattern) {
    return <View className='pattern-edit-page pattern-edit-page--empty'>加载中...</View>
  }

  return (
    <View className='pattern-edit-page'>
      <View
        className='pattern-edit-page__nav'
        style={{ paddingTop: `${navLayout.paddingTop}px` }}
      >
        <View
          className='pattern-edit-page__nav-row'
          style={{ height: `${navLayout.rowHeight}px` }}
        >
          <Text className='pattern-edit-page__nav-action' onClick={handleDone}>
            完成
          </Text>
          <Text className='pattern-edit-page__nav-title'>
            {pattern.width}×{pattern.height} · 高清预览
          </Text>
        </View>
      </View>

      <PatternEditor
        pattern={pattern}
        config={config}
        onPatternChange={handlePatternChange}
      />
    </View>
  )
}
