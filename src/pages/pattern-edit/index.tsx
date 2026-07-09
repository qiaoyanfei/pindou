import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidHide, useDidShow, useUnload } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import PatternEditor from '@/components/PatternEditor'
import { notifyOperationError, setStorageSafe } from '@/utils/localCache'
import { DEFAULT_CONFIG, normalizeConfig } from '@/utils/constants'
import { PATTERN_STORAGE_KEY, type PatternConfig, type PatternResult } from '@/types'
import backIcon from '@/assets/icons/back-chevron.svg'
import './index.scss'

interface StoredPayload {
  pattern: PatternResult
  config: PatternConfig
  sourceImagePath?: string
}

const PATTERN_PERSIST_DELAY_MS = 400

export default function PatternEditPage() {
  const [pattern, setPattern] = useState<PatternResult | null>(null)
  const [config, setConfig] = useState<PatternConfig>({ ...DEFAULT_CONFIG })
  const [navLayout, setNavLayout] = useState({
    paddingTop: 48,
    rowHeight: 32,
    capsuleReserve: 96,
  })
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const configRef = useRef(config)
  const patternRef = useRef<PatternResult | null>(null)
  const sourceImagePathRef = useRef('')

  configRef.current = config
  patternRef.current = pattern

  useEffect(() => {
    const windowInfo = Taro.getWindowInfo()
    const menu = Taro.getMenuButtonBoundingClientRect()
    const gapBeforeCapsule = 8
    setNavLayout({
      paddingTop: menu.top,
      rowHeight: menu.height,
      capsuleReserve: windowInfo.windowWidth - menu.left + gapBeforeCapsule,
    })
  }, [])

  const persistPattern = useCallback((nextPattern: PatternResult, immediate = false) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }

    const write = () => {
      setStorageSafe(PATTERN_STORAGE_KEY, {
        pattern: nextPattern,
        config: configRef.current,
        sourceImagePath: sourceImagePathRef.current,
      })
    }

    if (immediate) {
      write()
      return
    }

    persistTimerRef.current = setTimeout(write, PATTERN_PERSIST_DELAY_MS)
  }, [])

  const flushPattern = useCallback(() => {
    if (!patternRef.current) return
    persistPattern(patternRef.current, true)
  }, [persistPattern])

  useDidShow(() => {
    const stored = Taro.getStorageSync(PATTERN_STORAGE_KEY) as StoredPayload | undefined
    if (!stored?.pattern) {
      Taro.showToast({ title: '请先制作图纸', icon: 'none' })
      setTimeout(() => Taro.navigateBack(), 800)
      return
    }

    setPattern(stored.pattern)
    setConfig(normalizeConfig(stored.config))
    sourceImagePathRef.current = stored.sourceImagePath || ''
  })

  const handlePatternChange = useCallback((nextPattern: PatternResult) => {
    patternRef.current = nextPattern
    setPattern(nextPattern)
    persistPattern(nextPattern)
  }, [persistPattern])

  useDidHide(flushPattern)
  useUnload(flushPattern)

  const saveAndExit = () => {
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
          style={{
            height: `${navLayout.rowHeight}px`,
            paddingRight: `${navLayout.capsuleReserve}px`,
          }}
        >
          <View className='pattern-edit-page__nav-back' onClick={saveAndExit}>
            <Image
              className='pattern-edit-page__nav-back-icon'
              src={backIcon}
              mode='aspectFit'
            />
          </View>
          <Text className='pattern-edit-page__nav-title'>
            {pattern.width}×{pattern.height} · 编辑图纸
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
