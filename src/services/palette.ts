import rawPalette from '@/data/mard221.json'
import type { BeadColor } from '@/types'
import { PATTERN_TRANSPARENT_IDS } from '@/utils/constants'
import { rgbToLab } from '@/utils/colorSpace'

let paletteCache: BeadColor[] | null = null
const colorMapCache = new Map<string, BeadColor>()

export function getPalette(): BeadColor[] {
  if (paletteCache) return paletteCache

  paletteCache = (rawPalette as Omit<BeadColor, 'lab'>[]).map((color) => {
    const type = color.type === 'transparent' ? 'transparent' : 'solid'
    if (type === 'transparent') {
      PATTERN_TRANSPARENT_IDS.add(color.id)
    }
    return {
      ...color,
      type,
      textColor: color.textColor || (type === 'transparent' ? '#343A42' : undefined),
      lab: rgbToLab(color.rgb),
    }
  })

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
