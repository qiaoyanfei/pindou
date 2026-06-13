import { getColorById } from '@/services/palette'

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
        break
      case gn:
        h = ((bn - rn) / d + 2) / 6
        break
      default:
        h = ((rn - gn) / d + 4) / 6
        break
    }
  }

  return [h * 360, s, l]
}

function hueName(hue: number): string {
  if (hue < 15 || hue >= 345) return '红色'
  if (hue < 45) return '橙色'
  if (hue < 70) return '黄色'
  if (hue < 150) return '绿色'
  if (hue < 195) return '青色'
  if (hue < 250) return '蓝色'
  if (hue < 290) return '紫色'
  if (hue < 345) return '粉色'
  return '红色'
}

export function getColorDisplayName(id: string): string {
  const color = getColorById(id)
  if (!color) return id

  const [h, s, l] = rgbToHsl(...color.rgb)

  if (l < 0.12) return '深黑色'
  if (l < 0.22 && s < 0.35) return '深棕色'
  if (l > 0.92 && s < 0.12) return '奶白色'
  if (l > 0.85 && s < 0.2) return '浅白色'
  if (s < 0.1) {
    if (l < 0.35) return '深灰色'
    if (l < 0.65) return '灰色'
    return '浅灰色'
  }

  const base = hueName(h)
  if (l < 0.32) return `深${base}`
  if (l < 0.58) return base
  if (l < 0.78) return `浅${base}`
  return `淡${base}`
}
