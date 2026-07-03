import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const DEFAULT_CONVERSION_BUTTON_TEXT = '下一步：转换图纸'
const HIGH_GRID_CONVERSION_BUTTON_TEXT = '高格数可能需要数分钟'
const STILL_PROCESSING_BUTTON_TEXT = '处理中，请保持当前页面'
const HIGH_GRID_THRESHOLD = 200

export function useConversionButtonText(longEdge: number) {
  const [activeText, setActiveText] = useState('')
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const buttonText = activeText || DEFAULT_CONVERSION_BUTTON_TEXT

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current = []
  }, [])

  const start = useCallback(() => {
    clearTimers()
    setActiveText(longEdge > HIGH_GRID_THRESHOLD ? HIGH_GRID_CONVERSION_BUTTON_TEXT : '')
    timersRef.current = [
      setTimeout(() => {
        setActiveText(STILL_PROCESSING_BUTTON_TEXT)
      }, 30000),
    ]
  }, [clearTimers, longEdge])

  const stop = useCallback(() => {
    clearTimers()
    setActiveText('')
  }, [clearTimers])

  useEffect(() => clearTimers, [clearTimers])

  return useMemo(() => ({ buttonText, start, stop }), [buttonText, start, stop])
}
