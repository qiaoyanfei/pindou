import { isLightBackgroundRgb } from '@/services/backgroundMatting'
import type { Rgb } from '@/services/imageProcessor'
import {
  SYMMETRY_AXIS_SEARCH_MAX,
  SYMMETRY_AXIS_SEARCH_MIN,
  SYMMETRY_FACE_BAND_BOTTOM,
  SYMMETRY_FACE_BAND_TOP,
  SYMMETRY_MAX_PAIR_OFFSET,
  SYMMETRY_RGB_MATCH_TOLERANCE,
} from '@/utils/constants'

function rgbMatch(a: Rgb, b: Rgb, tolerance: number): boolean {
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance &&
    Math.abs(a[2] - b[2]) <= tolerance
  )
}

function scoreAxis(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  exteriorMask: Uint8Array,
  axisX: number,
): number {
  const y0 = Math.floor(height * SYMMETRY_FACE_BAND_TOP)
  const y1 = Math.floor(height * SYMMETRY_FACE_BAND_BOTTOM)
  let matched = 0
  let total = 0

  for (let y = y0; y < y1; y += 1) {
    const maxOffset = Math.min(
      SYMMETRY_MAX_PAIR_OFFSET,
      axisX,
      width - axisX - 1,
    )
    for (let offset = 1; offset <= maxOffset; offset += 1) {
      const xl = Math.round(axisX - offset)
      const xr = Math.round(axisX + offset)
      if (xl < 0 || xr >= width) continue

      const il = y * width + xl
      const ir = y * width + xr
      if (exteriorMask[il] === 1 || exteriorMask[ir] === 1) continue

      const piL = il * 4
      const piR = ir * 4
      const left: Rgb = [data[piL], data[piL + 1], data[piL + 2]]
      const right: Rgb = [data[piR], data[piR + 1], data[piR + 2]]

      if (isLightBackgroundRgb(left) && isLightBackgroundRgb(right)) {
        matched += 1
        total += 1
        continue
      }

      total += 1
      if (rgbMatch(left, right, SYMMETRY_RGB_MATCH_TOLERANCE)) {
        matched += 1
      }
    }
  }

  return total > 0 ? matched / total : 0
}

/** 搜索最佳垂直对称轴，供裁剪几何对齐使用（不改 grid 色号） */
export function findBestSymmetryAxis(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  exteriorMask: Uint8Array,
): { axisX: number; score: number } {
  const axisMin = width * SYMMETRY_AXIS_SEARCH_MIN
  const axisMax = width * SYMMETRY_AXIS_SEARCH_MAX

  let bestAxis = width / 2
  let bestScore = 0

  for (let axis = Math.floor(axisMin); axis <= Math.ceil(axisMax); axis += 1) {
    const score = scoreAxis(data, width, height, exteriorMask, axis)
    if (score > bestScore) {
      bestScore = score
      bestAxis = axis
    }
  }

  return { axisX: bestAxis, score: bestScore }
}
