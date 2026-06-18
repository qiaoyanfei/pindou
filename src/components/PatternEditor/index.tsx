import { View, Text, Canvas, MovableArea, MovableView } from '@tarojs/components'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import ColorPickerSheet from '@/components/ColorPickerSheet'
import {
  getEditCellPx,
  getEditHdCellPx,
  paintCellSelectionOutline,
  paintPatternGrid,
} from '@/services/patternRenderer'
import {
  applyPatternCellEdit,
  coordFromTouch,
  coordToCellIndex,
  revertPatternCellEdit,
  type GridCoord,
  type PatternCellEdit,
} from '@/utils/patternEdit'
import type { PatternConfig, PatternResult } from '@/types'
import './index.scss'

const CANVAS_ID = 'pattern-editor-canvas'
const TOOLBAR_HEIGHT = 72
const VIEW_PADDING = 24
const MAX_UNDO = 40

interface PatternEditorProps {
  pattern: PatternResult
  config: PatternConfig
  onPatternChange: (pattern: PatternResult) => void
}

type CanvasNode = {
  getContext: (type: '2d') => CanvasRenderingContext2D | null
  width: number
  height: number
}

export default function PatternEditor({
  pattern,
  config,
  onPatternChange,
}: PatternEditorProps) {
  const sys = Taro.getWindowInfo()
  const viewportWidth = sys.windowWidth
  const viewportHeight = sys.windowHeight

  const scrollHeight = useMemo(() => {
    const menu = Taro.getMenuButtonBoundingClientRect()
    const navHeight = menu.top + menu.height + 8
    return viewportHeight - navHeight - TOOLBAR_HEIGHT
  }, [viewportHeight])

  const hdCellPx = useMemo(
    () => getEditHdCellPx(pattern, config.exportCellPx),
    [pattern.width, pattern.height, config.exportCellPx],
  )

  const cellPx = useMemo(
    () => getEditCellPx(pattern, config.exportCellPx, viewportWidth, scrollHeight, VIEW_PADDING * 2),
    [pattern.width, pattern.height, config.exportCellPx, viewportWidth, scrollHeight],
  )

  const canvasWidth = pattern.width * cellPx
  const canvasHeight = pattern.height * cellPx

  const maxScale = useMemo(
    () => Math.max(1, Math.min(6, hdCellPx / cellPx)),
    [hdCellPx, cellPx],
  )

  const initialScale = useMemo(() => {
    const horizontalFit = (viewportWidth - VIEW_PADDING) / canvasWidth
    const verticalFit = (scrollHeight - VIEW_PADDING) / canvasHeight
    return Math.max(0.3, Math.min(horizontalFit, verticalFit, 1))
  }, [viewportWidth, scrollHeight, canvasWidth, canvasHeight])

  const initialPosition = useMemo(() => {
    const scaledW = canvasWidth * initialScale
    const scaledH = canvasHeight * initialScale
    return {
      x: Math.max(0, Math.round((viewportWidth - scaledW) / 2)),
      y: Math.max(0, Math.round((scrollHeight - scaledH) / 2)),
    }
  }, [canvasWidth, canvasHeight, initialScale, viewportWidth, scrollHeight])

  const paintOptions = useMemo(
    () => ({
      cellPx,
      showGrid: config.showGrid,
      showColorCode: config.showColorCode && cellPx >= 10,
      minCellPxForLabel: 10,
    }),
    [cellPx, config.showGrid, config.showColorCode],
  )

  const canvasRef = useRef<CanvasNode | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const patternRef = useRef(pattern)
  const selectionRef = useRef<GridCoord | null>(null)
  const scaleRef = useRef(initialScale)
  const undoStackRef = useRef<PatternCellEdit[]>([])
  const [selectedColorId, setSelectedColorId] = useState('')
  const [pickerVisible, setPickerVisible] = useState(false)
  const [ready, setReady] = useState(false)
  const [canUndo, setCanUndo] = useState(false)

  patternRef.current = pattern
  scaleRef.current = initialScale

  const fullRedraw = useCallback((node: CanvasNode, nextPattern: PatternResult, selection: GridCoord | null) => {
    node.width = canvasWidth
    node.height = canvasHeight
    const ctx = node.getContext('2d')
    if (!ctx) return null

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    paintPatternGrid(ctx, nextPattern, paintOptions)
    if (selection) {
      paintCellSelectionOutline(ctx, selection.col, selection.row, cellPx)
    }
    return ctx
  }, [canvasWidth, canvasHeight, cellPx, paintOptions])

  const initCanvas = useCallback((retry = 0) => {
    Taro.createSelectorQuery()
      .select(`#${CANVAS_ID}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        const node = res?.[0]?.node as CanvasNode | undefined
        if (!node) {
          if (retry < 12) {
            setTimeout(() => initCanvas(retry + 1), 150)
            return
          }
          Taro.showToast({ title: '画布加载失败', icon: 'none' })
          return
        }

        canvasRef.current = node
        const ctx = fullRedraw(node, patternRef.current, selectionRef.current)
        if (!ctx) {
          if (retry < 12) {
            setTimeout(() => initCanvas(retry + 1), 150)
            return
          }
          Taro.showToast({ title: '画布加载失败', icon: 'none' })
          return
        }
        ctxRef.current = ctx
        setReady(true)
      })
  }, [fullRedraw])

  useEffect(() => {
    undoStackRef.current = []
    setCanUndo(false)
    selectionRef.current = null
    setSelectedColorId('')
    setPickerVisible(false)
  }, [pattern.width, pattern.height])

  useEffect(() => {
    if (pickerVisible) {
      setReady(false)
      canvasRef.current = null
      ctxRef.current = null
      return undefined
    }

    setReady(false)
    const timer = setTimeout(() => initCanvas(), 80)
    return () => clearTimeout(timer)
  }, [pickerVisible, pattern.width, pattern.height, cellPx, config.showGrid, config.showColorCode, initCanvas])

  const handleScale = (event: { detail: { scale: number } }) => {
    scaleRef.current = event.detail.scale
  }

  const handleTouchStart = (event: { detail: { x: number; y: number } }) => {
    const coord = coordFromTouch(event.detail.x, event.detail.y, cellPx, patternRef.current)
    if (!coord) return
    const index = coordToCellIndex(patternRef.current, coord.col, coord.row)
    selectionRef.current = coord
    setSelectedColorId(patternRef.current.grid[index] ?? '')
    setPickerVisible(true)
  }

  const pushUndo = (edit: PatternCellEdit) => {
    undoStackRef.current.push(edit)
    if (undoStackRef.current.length > MAX_UNDO) {
      undoStackRef.current.shift()
    }
    setCanUndo(true)
  }

  const handleUndo = () => {
    if (!canUndo) return
    const edit = undoStackRef.current.pop()
    if (!edit) {
      setCanUndo(false)
      return
    }

    const nextPattern = revertPatternCellEdit(patternRef.current, edit)
    patternRef.current = nextPattern
    onPatternChange(nextPattern)
    setCanUndo(undoStackRef.current.length > 0)

    const node = canvasRef.current
    if (node) {
      const ctx = fullRedraw(node, nextPattern, selectionRef.current)
      ctxRef.current = ctx
    }
  }

  const handleColorSelect = (colorId: string) => {
    const cell = selectionRef.current
    if (!cell) return
    const index = coordToCellIndex(patternRef.current, cell.col, cell.row)
    const prevColorId = patternRef.current.grid[index]
    if (prevColorId === colorId) {
      setPickerVisible(false)
      return
    }

    const edit: PatternCellEdit = { index, prevColorId, nextColorId: colorId }
    const nextPattern = applyPatternCellEdit(patternRef.current, edit)
    patternRef.current = nextPattern
    pushUndo(edit)
    onPatternChange(nextPattern)
    setPickerVisible(false)
  }

  const handlePickerClose = () => {
    setPickerVisible(false)
  }

  return (
    <View className='pattern-editor pattern-editor--fullscreen'>
      <View className='pattern-editor__toolbar'>
        <Text
          className={`pattern-editor__action${canUndo ? '' : ' pattern-editor__action--disabled'}`}
          onClick={handleUndo}
        >
          撤销
        </Text>
        <Text className='pattern-editor__hint'>双指缩放 · 点击改色</Text>
        <Text className='pattern-editor__meta'>
          {pattern.width}×{pattern.height}
        </Text>
      </View>

      <View
        className='pattern-editor__viewport'
        style={{ width: `${viewportWidth}px`, height: `${scrollHeight}px` }}
      >
        {!ready && !pickerVisible && (
          <View className='pattern-editor__loading'>
            <Text>加载画布...</Text>
          </View>
        )}

        {!pickerVisible && (
          <MovableArea
            className={`pattern-editor__area${ready ? '' : ' pattern-editor__area--hidden'}`}
            style={{ width: `${viewportWidth}px`, height: `${scrollHeight}px` }}
          >
            <MovableView
              key={`${pattern.width}x${pattern.height}-${cellPx}`}
              className='pattern-editor__content'
              direction='all'
              inertia
              scale
              scaleMin={Math.min(initialScale, 0.3)}
              scaleMax={maxScale}
              scaleValue={initialScale}
              x={initialPosition.x}
              y={initialPosition.y}
              style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
              onScale={handleScale}
            >
              <View
                className='pattern-editor__canvas-wrap'
                style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
                onTouchStart={(event) => {
                  if (!ready) return
                  handleTouchStart(event)
                }}
              >
                <Canvas
                  type='2d'
                  id={CANVAS_ID}
                  canvasId={CANVAS_ID}
                  className='pattern-editor__canvas'
                  style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
                />
              </View>
            </MovableView>
          </MovableArea>
        )}
      </View>

      {pickerVisible && (
        <ColorPickerSheet
          visible={pickerVisible}
          pattern={pattern}
          currentColorId={selectedColorId}
          onSelect={handleColorSelect}
          onClose={handlePickerClose}
        />
      )}
    </View>
  )
}
