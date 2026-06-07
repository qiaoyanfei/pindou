import rawPalette from '@/data/mard221.json'
import type { BeadColor } from '@/types'
import { rgbToLab } from '@/utils/colorSpace'

let paletteCache: BeadColor[] | null = null
const colorMapCache = new Map<string, BeadColor>()

export function getPalette(): BeadColor[] {
  if (paletteCache) return paletteCache

  paletteCache = (rawPalette as Omit<BeadColor, 'lab'>[]).map((color) => ({
    ...color,
    lab: rgbToLab(color.rgb),
  }))

  paletteCache.forEach((color) => colorMapCache.set(color.id, color))
  return paletteCache
}

export function getColorById(id: string): BeadColor | undefined {
  getPalette()
  return colorMapCache.get(id)
}

export function getColorMap(): Map<string, BeadColor> {
  getPalette()
  return colorMapCache
}
