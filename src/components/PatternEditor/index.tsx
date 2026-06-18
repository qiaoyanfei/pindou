import { View, Text, Canvas, ScrollView } from '@tarojs/components'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import ColorPickerSheet from '@/components/ColorPickerSheet'
import {
  getPreviewCellPxForArea,
  paintCellSelectionOutline,
  paintPatternCell,
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
const PAGE_PADDING = 64
const TOOLBAR_HEIGHT = 72
const MAX_UNDO = 40

interface PatternEditorProps {
  pattern: PatternResult
  config: PatternConfig
  onPatternChange: (pattern: PatternResult) => void
  onDone: () => void
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
  onDone,
}: PatternEditorProps) {
  const sys = Taro.getWindowInfo()
  const areaWidth = sys.windowWidth - PAGE_PADDING
  const areaHeight = Math.floor(sys.windowHeight * 0.38)

  const cellPx = useMemo(
    () => getPreviewCellPxForArea(pattern, areaWidth, areaHeight - TOOLBAR_HEIGHT),
    [pattern, areaWidth, areaHeight],
  )

  const canvasWidth = pattern.width * cellPx
  const canvasHeight = pattern.height * cellPx

  const paintOptions = useMemo(
    () => ({
      cellPx,
      showGrid: config.showGrid,
      showColorCode: false,
      minCellPxForLabel: 16,
    }),
    [cellPx, config.showGrid],
  )

  const canvasRef = useRef<CanvasNode | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const patternRef = useRef(pattern)
  const selectionRef = useRef<GridCoord | null>(null)
  const undoStackRef = useRef<PatternCellEdit[]>([])
  const [selectedCell, setSelectedCell] = useState<GridCoord | null>(null)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [ready, setReady] = useState(false)
  const [canUndo, setCanUndo] = useState(false)

  patternRef.current = pattern

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

  const updateSelection = useCallback((coord: GridCoord) => {
    const ctx = ctxRef.current
    const prev = selectionRef.current
    if (ctx && prev) {
      paintPatternCell(ctx, patternRef.current, prev.col, prev.row, paintOptions)
    }
    selectionRef.current = coord
    setSelectedCell(coord)
    if (ctx) {
      paintCellSelectionOutline(ctx, coord.col, coord.row, cellPx)
    }
  }, [cellPx, paintOptions])

  const initCanvas = useCallback((retry = 0) => {
    Taro.createSelectorQuery()
      .select(`#${CANVAS_ID}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        const node = res?.[0]?.node as CanvasNode | undefined
        if (!node) {
          if (retry < 8) {
            setTimeout(() => initCanvas(retry + 1), 120)
          }
          return
        }

        canvasRef.current = node
        const ctx = fullRedraw(node, patternRef.current, selectionRef.current)
        ctxRef.current = ctx
        setReady(true)
      })
  }, [fullRedraw])

  useEffect(() => {
    setReady(false)
    selectionRef.current = null
    setSelectedCell(null)
    setPickerVisible(false)
    undoStackRef.current = []
    setCanUndo(false)
    const timer = setTimeout(() => initCanvas(), 80)
    return () => clearTimeout(timer)
  }, [pattern.width, pattern.height, cellPx, config.showGrid, initCanvas])

  const handleTouchStart = (event: { detail: { x: number; y: number } }) => {
    const coord = coordFromTouch(event.detail.x, event.detail.y, cellPx, patternRef.current)
    if (!coord) return
    updateSelection(coord)
    setPickerVisible(true)
  }

  const pushUndo = (edit: PatternCellEdit) => {
    undoStackRef.current.push(edit)
    if (undoStackRef.current.length > MAX_UNDO) {
      undoStackRef.current.shift()
    }
    setCanUndo(true)
  }

  const handleColorSelect = (colorId: string) => {
    if (!selectedCell) return
    const index = coordToCellIndex(patternRef.current, selectedCell.col, selectedCell.row)
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

    const ctx = ctxRef.current
    if (ctx) {
      paintPatternCell(ctx, nextPattern, selectedCell.col, selectedCell.row, paintOptions)
      paintCellSelectionOutline(ctx, selectedCell.col, selectedCell.row, cellPx)
    }

    setPickerVisible(false)
  }

  const handleUndo = () => {
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

  const selectedColorId = selectedCell
    ? pattern.grid[coordToCellIndex(pattern, selectedCell.col, selectedCell.row)] ?? ''
    : ''

  return (
    <View className='pattern-editor'>
      <View className='pattern-editor__toolbar'>
        <Text
          className={`pattern-editor__action${canUndo ? '' : ' pattern-editor__action--disabled'}`}
          onClick={canUndo ? handleUndo : undefined}
        >
          撤销
        </Text>
        <Text className='pattern-editor__hint'>点击格子选择色号</Text>
        <Text className='pattern-editor__action pattern-editor__action--primary' onClick={onDone}>
          完成
        </Text>
      </View>

      <ScrollView
        scrollX
        scrollY
        enhanced
        showScrollbar={false}
        className='pattern-editor__scroll'
        style={{ width: `${areaWidth}px`, height: `${areaHeight - TOOLBAR_HEIGHT}px` }}
      >
        <Canvas
          type='2d'
          id={CANVAS_ID}
          canvasId={CANVAS_ID}
          className='pattern-editor__canvas'
          style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
          onTouchStart={handleTouchStart}
        />
      </ScrollView>

      {!ready && (
        <View className='pattern-editor__loading'>
          <Text>加载编辑画布...</Text>
        </View>
      )}

      <ColorPickerSheet
        visible={pickerVisible}
        pattern={pattern}
        currentColorId={selectedColorId}
        onSelect={handleColorSelect}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  )
}
