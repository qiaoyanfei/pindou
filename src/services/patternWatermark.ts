type CornerId = 'tl' | 'tr' | 'bl' | 'br'

const WATERMARK_ALPHA = 0.2
const WATERMARK_COLOR = '#b8c2ce'
const ROTATION = -Math.PI / 4
const MIN_FONT_PX = 14

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}…`
}

function getRotatedBBoxHalfExtents(
  textWidth: number,
  textHeight: number,
  angle: number,
): { halfX: number; halfY: number } {
  const cos = Math.abs(Math.cos(angle))
  const sin = Math.abs(Math.sin(angle))
  return {
    halfX: (textWidth / 2) * cos + (textHeight / 2) * sin,
    halfY: (textWidth / 2) * sin + (textHeight / 2) * cos,
  }
}

function resolveWatermarkFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  cellPx: number,
  gridWidth: number,
  gridHeight: number,
): number {
  const pad = Math.max(4, Math.round(cellPx * 0.12))
  let fontSize = Math.max(28, Math.round(cellPx * 3.15))

  while (fontSize >= MIN_FONT_PX) {
    ctx.font = `600 ${fontSize}px sans-serif`
    const textWidth = ctx.measureText(text).width
    const textHeight = fontSize * 1.05
    const { halfX, halfY } = getRotatedBBoxHalfExtents(textWidth, textHeight, ROTATION)

    if (halfX * 2 + pad * 2 <= gridWidth && halfY * 2 + pad * 2 <= gridHeight) {
      return fontSize
    }
    fontSize -= 2
  }

  return MIN_FONT_PX
}

function getCornerAnchor(
  corner: CornerId,
  gridOriginX: number,
  gridOriginY: number,
  gridWidth: number,
  gridHeight: number,
  halfX: number,
  halfY: number,
  pad: number,
): { x: number; y: number } {
  switch (corner) {
    case 'tl':
      return {
        x: gridOriginX + halfX + pad,
        y: gridOriginY + halfY + pad,
      }
    case 'tr':
      return {
        x: gridOriginX + gridWidth - halfX - pad,
        y: gridOriginY + halfY + pad,
      }
    case 'bl':
      return {
        x: gridOriginX + halfX + pad,
        y: gridOriginY + gridHeight - halfY - pad,
      }
    case 'br':
      return {
        x: gridOriginX + gridWidth - halfX - pad,
        y: gridOriginY + gridHeight - halfY - pad,
      }
  }
}

function drawSingleCornerWatermark(
  ctx: CanvasRenderingContext2D,
  corner: CornerId,
  gridOriginX: number,
  gridOriginY: number,
  gridWidth: number,
  gridHeight: number,
  cellPx: number,
  text: string,
): void {
  if (!text) return

  const fontSize = resolveWatermarkFontSize(ctx, text, cellPx, gridWidth, gridHeight)
  const pad = Math.max(4, Math.round(cellPx * 0.12))

  ctx.font = `600 ${fontSize}px sans-serif`
  const textWidth = ctx.measureText(text).width
  const textHeight = fontSize * 1.05
  const { halfX, halfY } = getRotatedBBoxHalfExtents(textWidth, textHeight, ROTATION)
  const anchor = getCornerAnchor(
    corner,
    gridOriginX,
    gridOriginY,
    gridWidth,
    gridHeight,
    halfX,
    halfY,
    pad,
  )

  ctx.save()
  ctx.globalAlpha = WATERMARK_ALPHA
  ctx.fillStyle = WATERMARK_COLOR
  ctx.font = `600 ${fontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.translate(anchor.x, anchor.y)
  ctx.rotate(ROTATION)
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

/**
 * 四角各画一次斜向水印：
 * 有署名 → 左上/右下小程序名，右上/左下署名
 * 无署名 → 四角均为小程序名
 */
export function drawCornerGridWatermarks(
  ctx: CanvasRenderingContext2D,
  gridOriginX: number,
  gridOriginY: number,
  gridWidth: number,
  gridHeight: number,
  cellPx: number,
  appName: string,
  creatorSignature: string,
): void {
  const signature = truncateText(creatorSignature.trim(), 18)
  const corners: CornerId[] = ['tl', 'tr', 'bl', 'br']

  const draw = (corner: CornerId, text: string) => {
    drawSingleCornerWatermark(
      ctx,
      corner,
      gridOriginX,
      gridOriginY,
      gridWidth,
      gridHeight,
      cellPx,
      text,
    )
  }

  if (!signature) {
    corners.forEach((corner) => draw(corner, appName))
    return
  }

  draw('tl', appName)
  draw('br', appName)
  draw('tr', signature)
  draw('bl', signature)
}
