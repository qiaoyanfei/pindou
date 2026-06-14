import { CoverView } from '@tarojs/components'
import { useCallback, useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import PatternCanvas from '@/components/PatternCanvas'
import { fetchPostDetail } from '@/services/communityService'
import { resolveCreatorNickname } from '@/utils/creatorNickname'
import {
  getCachedPreviewData,
  resolvePreviewData,
} from '@/utils/patternPreviewCache'
import { canvasToTempFile } from '@/utils/canvas'
import { previewImageWithoutMenu } from '@/utils/previewImage'
import type { PatternConfig, PatternResult } from '@/types'
import type { PostDetail } from '@/types/community'
import './index.scss'

export const HD_PATTERN_PREVIEW_EVENT = 'hdPatternPreviewRequest'

export interface HdPatternPreviewRequest {
  postId?: string
  post?: PostDetail
  pattern?: PatternResult
  config?: PatternConfig
  creatorNickname?: string
}

interface PreviewPayload {
  pattern: PatternResult
  config: PatternConfig
  creatorNickname: string
}

const CANVAS_ID = 'hd-pattern-preview-canvas'
const LOADING_DELAY_MS = 280

export function requestHdPatternPreview(request: HdPatternPreviewRequest): void {
  Taro.eventCenter.trigger(HD_PATTERN_PREVIEW_EVENT, request)
}

export default function HdPatternPreviewHost() {
  const [loading, setLoading] = useState(false)
  const [payload, setPayload] = useState<PreviewPayload | null>(null)
  const inflightRef = useRef(false)
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearLoadingTimer = useCallback(() => {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current)
      loadingTimerRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    clearLoadingTimer()
    Taro.hideLoading()
    setPayload(null)
    setLoading(false)
    inflightRef.current = false
  }, [clearLoadingTimer])

  const showLoadingLater = useCallback(() => {
    clearLoadingTimer()
    loadingTimerRef.current = setTimeout(() => {
      Taro.showLoading({ title: '加载高清图...', mask: true })
    }, LOADING_DELAY_MS)
  }, [clearLoadingTimer])

  const startPreview = useCallback(async (request: HdPatternPreviewRequest) => {
    if (inflightRef.current) {
      Taro.showToast({ title: '预览加载中，请稍候', icon: 'none' })
      return
    }

    inflightRef.current = true
    setLoading(true)
    showLoadingLater()

    try {
      if (request.pattern && request.config) {
        clearLoadingTimer()
        setPayload({
          pattern: request.pattern,
          config: request.config,
          creatorNickname: request.creatorNickname || resolveCreatorNickname(),
        })
        return
      }

      const postId = request.postId || request.post?._id
      if (!postId) {
        throw new Error('缺少图纸信息')
      }

      const cachedPreview = getCachedPreviewData(postId)
      if (cachedPreview) {
        clearLoadingTimer()
        setPayload({
          pattern: cachedPreview.pattern,
          config: request.config || cachedPreview.config,
          creatorNickname: request.creatorNickname || request.post?.author?.nickName || resolveCreatorNickname(),
        })
        return
      }

      const post = request.post || await fetchPostDetail(postId)
      const previewData = await resolvePreviewData(post)
      clearLoadingTimer()
      setPayload({
        pattern: previewData.pattern,
        config: request.config || previewData.config,
        creatorNickname: request.creatorNickname || post.author?.nickName || resolveCreatorNickname(),
      })
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
      reset()
    }
  }, [clearLoadingTimer, reset, showLoadingLater])

  useEffect(() => {
    const handler = (request: HdPatternPreviewRequest) => {
      void startPreview(request)
    }
    Taro.eventCenter.on(HD_PATTERN_PREVIEW_EVENT, handler)
    return () => {
      Taro.eventCenter.off(HD_PATTERN_PREVIEW_EVENT, handler)
    }
  }, [startPreview])

  useEffect(() => {
    if (!payload) return undefined
    const timer = setTimeout(() => {
      if (!inflightRef.current) return
      Taro.hideLoading()
      Taro.showToast({ title: '预览失败，请重试', icon: 'none' })
      reset()
    }, 12000)
    return () => clearTimeout(timer)
  }, [payload, reset])

  useEffect(() => () => {
    clearLoadingTimer()
  }, [clearLoadingTimer])

  const handleCanvasReady = async () => {
    try {
      const tempFilePath = await canvasToTempFile(CANVAS_ID)
      Taro.hideLoading()
      await previewImageWithoutMenu({
        urls: [tempFilePath],
        current: tempFilePath,
      })
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({
        title: error instanceof Error ? error.message : '预览失败',
        icon: 'none',
      })
    } finally {
      reset()
    }
  }

  return (
    <>
      {payload ? (
        <PatternCanvas
          canvasId={CANVAS_ID}
          pattern={payload.pattern}
          config={payload.config}
          mode='preview'
          hidden
          cellPx={payload.config.exportCellPx}
          onReady={handleCanvasReady}
        />
      ) : null}
      {loading ? <CoverView className='hd-pattern-preview-host__mask' /> : null}
    </>
  )
}
