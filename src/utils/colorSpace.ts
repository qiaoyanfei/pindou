type Lab = [number, number, number]

function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function rgbToLab(rgb: [number, number, number]): Lab {
  const r = srgbToLinear(rgb[0])
  const g = srgbToLinear(rgb[1])
  const b = srgbToLinear(rgb[2])

  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883

  const fx = x > 0.008856 ? x ** (1 / 3) : 7.787 * x + 16 / 116
  const fy = y > 0.008856 ? y ** (1 / 3) : 7.787 * y + 16 / 116
  const fz = z > 0.008856 ? z ** (1 / 3) : 7.787 * z + 16 / 116

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1
  const [L2, a2, b2] = lab2

  const avgLp = (L1 + L2) / 2
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const avgC = (C1 + C2) / 2

  const G = 0.5 * (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)))
  const a1p = a1 * (1 + G)
  const a2p = a2 * (1 + G)
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const avgCp = (C1p + C2p) / 2

  const h1p = Math.atan2(b1, a1p) * (180 / Math.PI)
  const h2p = Math.atan2(b2, a2p) * (180 / Math.PI)
  const h1pn = h1p >= 0 ? h1p : h1p + 360
  const h2pn = h2p >= 0 ? h2p : h2p + 360

  let dhp = h2pn - h1pn
  if (Math.abs(dhp) > 180) dhp += dhp > 0 ? -360 : 360

  const dLp = L2 - L1
  const dCp = C2p - C1p
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360)

  let avgHp = h1pn + h2pn
  if (Math.abs(h1pn - h2pn) > 180) avgHp += 360
  avgHp /= 2

  const T =
    1 -
    0.17 * Math.cos(((avgHp - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * avgHp * Math.PI) / 180) +
    0.32 * Math.cos(((3 * avgHp + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * avgHp - 63) * Math.PI) / 180)

  const Sl = 1 + (0.015 * (avgLp - 50) ** 2) / Math.sqrt(20 + (avgLp - 50) ** 2)
  const Sc = 1 + 0.045 * avgCp
  const Sh = 1 + 0.015 * avgCp * T
  const dRo = 30 * Math.exp(-(((avgHp - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7))
  const Rt = -Rc * Math.sin((2 * dRo * Math.PI) / 180)

  return Math.sqrt(
    (dLp / Sl) ** 2 +
      (dCp / Sc) ** 2 +
      (dHp / Sh) ** 2 +
      Rt * (dCp / Sc) * (dHp / Sh),
  )
}

export function labDistance(lab1: Lab, lab2: Lab): number {
  const dL = lab1[0] - lab2[0]
  const da = lab1[1] - lab2[1]
  const db = lab1[2] - lab2[2]
  return dL * dL + da * da + db * db
}
