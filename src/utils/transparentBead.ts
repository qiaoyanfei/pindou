import { isTransparentBeadId } from '@/utils/constants'

export { isTransparentBeadId }

/** 透明豆近似色（非纯白；真正材质靠渐变+高光+折射） */
export const TRANSPARENT_BEAD_PROXY_HEX = '#C6DEEE'
export const TRANSPARENT_BEAD_TEXT_COLOR = '#333842'
const TRANSPARENT_BEAD_EDGE = 'rgba(120, 156, 182, 0.95)'

/**
 * Canvas：更通透的玻璃材质（淡蓝灰半透 + 强高光 + 折射阴影）
 */
export function drawTransparentBeadFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const ox = Math.round(x)
  const oy = Math.round(y)
  const w = Math.max(1, Math.round(size))
  const h = Math.max(1, Math.round(size))

  ctx.save()

  // 底：更透、更偏冷蓝灰，避免接近 H2 纯白
  const base = ctx.createLinearGradient(ox, oy, ox + w, oy + h)
  base.addColorStop(0, 'rgba(255, 255, 255, 0.52)')
  base.addColorStop(0.35, 'rgba(214, 233, 245, 0.34)')
  base.addColorStop(0.7, 'rgba(176, 208, 228, 0.4)')
  base.addColorStop(1, 'rgba(148, 186, 212, 0.48)')
  ctx.fillStyle = base
  ctx.fillRect(ox, oy, w, h)

  // 顶/左边高光描边
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.lineWidth = Math.max(1, Math.round(w * 0.055))
  ctx.beginPath()
  ctx.moveTo(ox + 0.5, oy + h - 1)
  ctx.lineTo(ox + 0.5, oy + 0.5)
  ctx.lineTo(ox + w - 1, oy + 0.5)
  ctx.stroke()

  // 底部与右侧内阴影（增强厚度感）
  ctx.fillStyle = 'rgba(110, 148, 176, 0.28)'
  ctx.fillRect(ox, oy + h * 0.62, w, h * 0.38)
  ctx.fillStyle = 'rgba(125, 162, 188, 0.2)'
  ctx.fillRect(ox + w * 0.62, oy, w * 0.38, h)

  // 左上玻璃高光（更亮、更大）
  const highlight = ctx.createLinearGradient(ox, oy, ox + w * 0.75, oy + h * 0.1)
  highlight.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
  highlight.addColorStop(0.55, 'rgba(255, 255, 255, 0.35)')
  highlight.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = highlight
  ctx.fillRect(ox + w * 0.06, oy + h * 0.06, w * 0.7, h * 0.2)

  // 第二层细高光条
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.fillRect(ox + w * 0.1, oy + h * 0.1, w * 0.42, Math.max(1, Math.round(h * 0.05)))

  // 右下折射斑
  ctx.fillStyle = 'rgba(120, 168, 198, 0.32)'
  ctx.fillRect(ox + w * 0.52, oy + h * 0.62, w * 0.4, h * 0.3)

  // 冷灰蓝边缘（更醒目）
  ctx.strokeStyle = TRANSPARENT_BEAD_EDGE
  ctx.lineWidth = Math.max(1, Math.round(w * 0.06))
  const inset = ctx.lineWidth / 2
  ctx.strokeRect(ox + inset, oy + inset, w - ctx.lineWidth, h - ctx.lineWidth)

  ctx.restore()
}

export function getTransparentLabelColor(): string {
  return TRANSPARENT_BEAD_TEXT_COLOR
}

export function getTransparentSwatchStyle(): Record<string, string> {
  return {
    backgroundImage: [
      'linear-gradient(135deg, rgba(255,255,255,0.52) 0%, rgba(214,233,245,0.34) 35%, rgba(176,208,228,0.4) 70%, rgba(148,186,212,0.48) 100%)',
      'radial-gradient(ellipse 70% 32% at 32% 18%, rgba(255,255,255,0.92), rgba(255,255,255,0.2) 55%, transparent 72%)',
      'radial-gradient(ellipse 42% 30% at 78% 78%, rgba(120,168,198,0.36), transparent 70%)',
    ].join(','),
    backgroundColor: 'rgba(198, 222, 238, 0.28)',
    border: '1px solid rgba(120, 156, 182, 0.95)',
    boxShadow: [
      'inset 0 2px 0 rgba(255, 255, 255, 0.98)',
      'inset 2px 0 0 rgba(255, 255, 255, 0.7)',
      'inset 0 -6px 10px rgba(110, 148, 176, 0.28)',
      'inset -5px 0 8px rgba(125, 162, 188, 0.2)',
    ].join(','),
    boxSizing: 'border-box',
    color: TRANSPARENT_BEAD_TEXT_COLOR,
  }
}

export function getBeadSwatchStyle(colorId: string, solidHex?: string): Record<string, string> {
  if (isTransparentBeadId(colorId)) return getTransparentSwatchStyle()
  return { backgroundColor: solidHex ?? '#ccc' }
}

export function getBeadDisplayHex(colorId: string, solidHex?: string): string {
  if (isTransparentBeadId(colorId)) return TRANSPARENT_BEAD_PROXY_HEX
  return solidHex ?? '#ccc'
}

export const TRANSPARENT_SVG_GRADIENT_ID = 'pindou-transparent-bead-grad'
const TRANSPARENT_SVG_HIGHLIGHT_ID = 'pindou-transparent-bead-hl'

export function appendTransparentSvgDefs(parts: string[]): void {
  parts.push(
    '<defs>',
    `<linearGradient id="${TRANSPARENT_SVG_GRADIENT_ID}" x1="0%" y1="0%" x2="100%" y2="100%">`,
    '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.52"/>',
    '<stop offset="35%" stop-color="#d6e9f5" stop-opacity="0.34"/>',
    '<stop offset="70%" stop-color="#b0d0e4" stop-opacity="0.4"/>',
    '<stop offset="100%" stop-color="#94bad4" stop-opacity="0.48"/>',
    '</linearGradient>',
    `<linearGradient id="${TRANSPARENT_SVG_HIGHLIGHT_ID}" x1="0%" y1="0%" x2="100%" y2="15%">`,
    '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>',
    '<stop offset="55%" stop-color="#ffffff" stop-opacity="0.35"/>',
    '<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>',
    '</linearGradient>',
    '</defs>',
  )
}

export function appendTransparentSvgCell(
  parts: string[],
  x: number,
  y: number,
  size: number,
): void {
  const strokeW = Math.max(1, Math.round(size * 0.06))
  const thinHl = Math.max(1, Math.round(size * 0.05))
  parts.push(
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="url(#${TRANSPARENT_SVG_GRADIENT_ID})"/>`,
    `<rect x="${x}" y="${y + size * 0.62}" width="${size}" height="${size * 0.38}" fill="rgba(110,148,176,0.28)"/>`,
    `<rect x="${x + size * 0.62}" y="${y}" width="${size * 0.38}" height="${size}" fill="rgba(125,162,188,0.2)"/>`,
    `<rect x="${x + size * 0.06}" y="${y + size * 0.06}" width="${size * 0.7}" height="${size * 0.2}" fill="url(#${TRANSPARENT_SVG_HIGHLIGHT_ID})"/>`,
    `<rect x="${x + size * 0.1}" y="${y + size * 0.1}" width="${size * 0.42}" height="${thinHl}" fill="rgba(255,255,255,0.55)"/>`,
    `<rect x="${x + size * 0.52}" y="${y + size * 0.62}" width="${size * 0.4}" height="${size * 0.3}" fill="rgba(120,168,198,0.32)"/>`,
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="none" stroke="${TRANSPARENT_BEAD_EDGE}" stroke-width="${strokeW}"/>`,
  )
}

export function getBeadSvgFill(colorId: string, solidHex?: string): string {
  if (isTransparentBeadId(colorId)) return `url(#${TRANSPARENT_SVG_GRADIENT_ID})`
  return solidHex ?? '#cccccc'
}
