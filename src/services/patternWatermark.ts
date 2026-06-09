const WATERMARK_ALPHA = 0.32
const WATERMARK_COLOR = '#b8c2ce'
const ROTATION = -Math.PI / 4
const MIN_FONT_PX = 10

function resolveGlobalWatermarkFontSize(cellPx: number): number {
  return Math.max(MIN_FONT_PX, Math.round(cellPx * 1.35))
}

/** 整图平铺斜向水印，仅显示小程序名称 */
export function drawGlobalWatermarks(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  cellPx: number,
  appName: string,
): void {
  if (!appName) return

  const fontSize = resolveGlobalWatermarkFontSize(cellPx)

  ctx.save()
  ctx.font = `600 ${fontSize}px sans-serif`
  const textWidth = ctx.measureText(appName).width
  const gapX = textWidth * 2.8 + 80
  const gapY = fontSize * 7 + 64
  const diagonal = Math.sqrt(canvasWidth ** 2 + canvasHeight ** 2)

  ctx.globalAlpha = WATERMARK_ALPHA
  ctx.fillStyle = WATERMARK_COLOR
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.translate(canvasWidth / 2, canvasHeight / 2)
  ctx.rotate(ROTATION)

  for (let y = -diagonal; y <= diagonal; y += gapY) {
    const rowIndex = Math.round(y / gapY)
    const rowOffset = (rowIndex % 2) * (gapX / 2)
    for (let x = -diagonal + rowOffset; x <= diagonal; x += gapX) {
      ctx.fillText(appName, x, y)
    }
  }

  ctx.restore()
}
