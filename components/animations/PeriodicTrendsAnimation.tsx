'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 400

// --- table geometry --------------------------------------------------
const CELL_W = 30
const CELL_H = 26
const GAP = 1.5
const TABLE_X = 20
const TABLE_Y = 54

// --- line plot -------------------------------------------------------
const PL = 54
const PR = 566
const PT = 232
const PB = 344

const ORANGE = '#FB923C'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

type El = {
  z: number
  sym: string
  name: string
  group: number // 1..18
  period: number // 1..4
  config: string
  radius: number // pm, Slater empirical (noble gases: calculated)
  ie: number // first ionisation energy, kJ/mol
  en: number | null // Pauling electronegativity
  zeff: number // Slater effective nuclear charge on a valence electron
}

// Real published values. Radii: Slater (1964) empirical, with calculated
// values for the noble gases. Ionisation energies: CRC first IE in kJ/mol.
// Electronegativity: Pauling scale (undefined for He, Ne, Ar).
const ELEMENTS: El[] = [
  { z: 1, sym: 'H', name: 'Hydrogen', group: 1, period: 1, config: '1s¹', radius: 25, ie: 1312, en: 2.20, zeff: 1.00 },
  { z: 2, sym: 'He', name: 'Helium', group: 18, period: 1, config: '1s²', radius: 31, ie: 2372, en: null, zeff: 1.70 },
  { z: 3, sym: 'Li', name: 'Lithium', group: 1, period: 2, config: '[He]2s¹', radius: 145, ie: 520, en: 0.98, zeff: 1.30 },
  { z: 4, sym: 'Be', name: 'Beryllium', group: 2, period: 2, config: '[He]2s²', radius: 105, ie: 899, en: 1.57, zeff: 1.95 },
  { z: 5, sym: 'B', name: 'Boron', group: 13, period: 2, config: '[He]2s²2p¹', radius: 85, ie: 801, en: 2.04, zeff: 2.60 },
  { z: 6, sym: 'C', name: 'Carbon', group: 14, period: 2, config: '[He]2s²2p²', radius: 70, ie: 1086, en: 2.55, zeff: 3.25 },
  { z: 7, sym: 'N', name: 'Nitrogen', group: 15, period: 2, config: '[He]2s²2p³', radius: 65, ie: 1402, en: 3.04, zeff: 3.90 },
  { z: 8, sym: 'O', name: 'Oxygen', group: 16, period: 2, config: '[He]2s²2p⁴', radius: 60, ie: 1314, en: 3.44, zeff: 4.55 },
  { z: 9, sym: 'F', name: 'Fluorine', group: 17, period: 2, config: '[He]2s²2p⁵', radius: 50, ie: 1681, en: 3.98, zeff: 5.20 },
  { z: 10, sym: 'Ne', name: 'Neon', group: 18, period: 2, config: '[He]2s²2p⁶', radius: 38, ie: 2081, en: null, zeff: 5.85 },
  { z: 11, sym: 'Na', name: 'Sodium', group: 1, period: 3, config: '[Ne]3s¹', radius: 180, ie: 496, en: 0.93, zeff: 2.20 },
  { z: 12, sym: 'Mg', name: 'Magnesium', group: 2, period: 3, config: '[Ne]3s²', radius: 150, ie: 738, en: 1.31, zeff: 2.85 },
  { z: 13, sym: 'Al', name: 'Aluminium', group: 13, period: 3, config: '[Ne]3s²3p¹', radius: 125, ie: 578, en: 1.61, zeff: 3.50 },
  { z: 14, sym: 'Si', name: 'Silicon', group: 14, period: 3, config: '[Ne]3s²3p²', radius: 110, ie: 787, en: 1.90, zeff: 4.15 },
  { z: 15, sym: 'P', name: 'Phosphorus', group: 15, period: 3, config: '[Ne]3s²3p³', radius: 100, ie: 1012, en: 2.19, zeff: 4.80 },
  { z: 16, sym: 'S', name: 'Sulfur', group: 16, period: 3, config: '[Ne]3s²3p⁴', radius: 100, ie: 1000, en: 2.58, zeff: 5.45 },
  { z: 17, sym: 'Cl', name: 'Chlorine', group: 17, period: 3, config: '[Ne]3s²3p⁵', radius: 100, ie: 1251, en: 3.16, zeff: 6.10 },
  { z: 18, sym: 'Ar', name: 'Argon', group: 18, period: 3, config: '[Ne]3s²3p⁶', radius: 71, ie: 1521, en: null, zeff: 6.75 },
  { z: 19, sym: 'K', name: 'Potassium', group: 1, period: 4, config: '[Ar]4s¹', radius: 220, ie: 419, en: 0.82, zeff: 2.20 },
  { z: 20, sym: 'Ca', name: 'Calcium', group: 2, period: 4, config: '[Ar]4s²', radius: 180, ie: 590, en: 1.00, zeff: 2.85 },
  { z: 21, sym: 'Sc', name: 'Scandium', group: 3, period: 4, config: '[Ar]3d¹4s²', radius: 160, ie: 633, en: 1.36, zeff: 3.00 },
  { z: 22, sym: 'Ti', name: 'Titanium', group: 4, period: 4, config: '[Ar]3d²4s²', radius: 140, ie: 659, en: 1.54, zeff: 3.15 },
  { z: 23, sym: 'V', name: 'Vanadium', group: 5, period: 4, config: '[Ar]3d³4s²', radius: 135, ie: 651, en: 1.63, zeff: 3.30 },
  { z: 24, sym: 'Cr', name: 'Chromium', group: 6, period: 4, config: '[Ar]3d⁵4s¹', radius: 140, ie: 653, en: 1.66, zeff: 3.45 },
  { z: 25, sym: 'Mn', name: 'Manganese', group: 7, period: 4, config: '[Ar]3d⁵4s²', radius: 140, ie: 717, en: 1.55, zeff: 3.60 },
  { z: 26, sym: 'Fe', name: 'Iron', group: 8, period: 4, config: '[Ar]3d⁶4s²', radius: 140, ie: 762, en: 1.83, zeff: 3.75 },
  { z: 27, sym: 'Co', name: 'Cobalt', group: 9, period: 4, config: '[Ar]3d⁷4s²', radius: 135, ie: 760, en: 1.88, zeff: 3.90 },
  { z: 28, sym: 'Ni', name: 'Nickel', group: 10, period: 4, config: '[Ar]3d⁸4s²', radius: 135, ie: 737, en: 1.91, zeff: 4.05 },
  { z: 29, sym: 'Cu', name: 'Copper', group: 11, period: 4, config: '[Ar]3d¹⁰4s¹', radius: 135, ie: 745, en: 1.90, zeff: 4.20 },
  { z: 30, sym: 'Zn', name: 'Zinc', group: 12, period: 4, config: '[Ar]3d¹⁰4s²', radius: 135, ie: 906, en: 1.65, zeff: 4.35 },
  { z: 31, sym: 'Ga', name: 'Gallium', group: 13, period: 4, config: '[Ar]3d¹⁰4s²4p¹', radius: 130, ie: 579, en: 1.81, zeff: 5.00 },
  { z: 32, sym: 'Ge', name: 'Germanium', group: 14, period: 4, config: '[Ar]3d¹⁰4s²4p²', radius: 125, ie: 762, en: 2.01, zeff: 5.65 },
  { z: 33, sym: 'As', name: 'Arsenic', group: 15, period: 4, config: '[Ar]3d¹⁰4s²4p³', radius: 115, ie: 947, en: 2.18, zeff: 6.30 },
  { z: 34, sym: 'Se', name: 'Selenium', group: 16, period: 4, config: '[Ar]3d¹⁰4s²4p⁴', radius: 115, ie: 941, en: 2.55, zeff: 6.95 },
  { z: 35, sym: 'Br', name: 'Bromine', group: 17, period: 4, config: '[Ar]3d¹⁰4s²4p⁵', radius: 115, ie: 1140, en: 2.96, zeff: 7.60 },
  { z: 36, sym: 'Kr', name: 'Krypton', group: 18, period: 4, config: '[Ar]3d¹⁰4s²4p⁶', radius: 88, ie: 1351, en: 3.00, zeff: 8.25 },
]

type PropKey = 'radius' | 'ie' | 'en'

const PROPS: Record<PropKey, { label: string; unit: string; note: string; get: (e: El) => number | null }> = {
  radius: {
    label: 'Atomic radius',
    unit: 'pm',
    note: 'shrinks left→right (Zeff climbs), jumps down each new period (new shell)',
    get: e => e.radius,
  },
  ie: {
    label: 'First ionisation energy',
    unit: 'kJ/mol',
    note: 'rises left→right, falls down a group — a tighter grip costs more to break',
    get: e => e.ie,
  },
  en: {
    label: 'Electronegativity',
    unit: 'Pauling',
    note: 'peaks at fluorine — small radius plus high Zeff is the strongest possible pull',
    get: e => e.en,
  },
}

type Axis = 'period' | 'group'

const cellX = (g: number) => TABLE_X + (g - 1) * (CELL_W + GAP)
const cellY = (p: number) => TABLE_Y + (p - 1) * (CELL_H + GAP)

// Heat map: low = cool blue/violet, high = orange/gold.
function heat(t: number): string {
  const stops: [number, number, number][] = [
    [37, 62, 110],
    [96, 165, 250],
    [167, 139, 250],
    [251, 146, 60],
    [245, 158, 11],
  ]
  const x = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1)
  const i = Math.floor(x)
  const f = x - i
  const a = stops[i]
  const b = stops[i + 1]
  const mix = (k: number) => Math.round(a[k] + (b[k] - a[k]) * f)
  return `rgb(${mix(0)},${mix(1)},${mix(2)})`
}

export function PeriodicTrendsAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const revealRef = useRef(1)

  const [prop, setProp] = useState<PropKey>('radius')
  const [axis, setAxis] = useState<Axis>('period')
  const [selZ, setSelZ] = useState(17) // chlorine
  const [reveal, setReveal] = useState(1)

  const sel = useMemo(() => ELEMENTS.find(e => e.z === selZ) ?? ELEMENTS[0], [selZ])

  const range = useMemo(() => {
    const vals = ELEMENTS.map(PROPS[prop].get).filter((v): v is number => v !== null)
    return { lo: Math.min(...vals), hi: Math.max(...vals) }
  }, [prop])

  const series = useMemo(() => {
    const members =
      axis === 'period'
        ? ELEMENTS.filter(e => e.period === sel.period).sort((a, b) => a.group - b.group)
        : ELEMENTS.filter(e => e.group === sel.group).sort((a, b) => a.period - b.period)
    return members
  }, [axis, sel])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const info = PROPS[prop]
    const rev = revealRef.current

    // ---- header ----
    ctx.textAlign = 'left'
    ctx.font = '12px monospace'
    ctx.fillStyle = ORANGE
    ctx.fillText(`${info.label}  (${info.unit})`, TABLE_X, 24)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.45)'
    ctx.fillText(info.note, TABLE_X, 40)

    // ---- table ----
    for (const e of ELEMENTS) {
      const x = cellX(e.group)
      const y = cellY(e.period)
      const v = info.get(e)
      const shown = e.z <= Math.ceil(rev * ELEMENTS.length)
      if (!shown) continue

      if (v === null) {
        ctx.fillStyle = 'rgba(255,245,235,0.06)'
      } else {
        const t = (v - range.lo) / (range.hi - range.lo || 1)
        ctx.fillStyle = heat(t)
      }
      ctx.fillRect(x, y, CELL_W, CELL_H)

      const inSeries = axis === 'period' ? e.period === sel.period : e.group === sel.group
      if (inSeries) {
        ctx.strokeStyle = 'rgba(255,245,235,0.5)'
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, y + 0.5, CELL_W - 1, CELL_H - 1)
      }
      if (e.z === sel.z) {
        ctx.strokeStyle = GREEN
        ctx.lineWidth = 2
        ctx.strokeRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2)
      }

      ctx.textAlign = 'center'
      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = v === null ? 'rgba(255,245,235,0.4)' : 'rgba(15,13,10,0.92)'
      ctx.fillText(e.sym, x + CELL_W / 2, y + 12)
      ctx.font = '8px monospace'
      ctx.fillStyle = v === null ? 'rgba(255,245,235,0.3)' : 'rgba(15,13,10,0.7)'
      ctx.fillText(v === null ? '—' : String(v), x + CELL_W / 2, y + 22)
    }

    // Group / period labels
    ctx.font = '8px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.28)'
    ctx.textAlign = 'center'
    for (let g = 1; g <= 18; g++) ctx.fillText(String(g), cellX(g) + CELL_W / 2, TABLE_Y - 5)
    ctx.textAlign = 'right'
    for (let p = 1; p <= 4; p++) ctx.fillText(String(p), TABLE_X - 5, cellY(p) + 17)

    // Block bands
    const blocks: [number, number, string, string][] = [
      [1, 2, 's', GOLD],
      [3, 12, 'd', BLUE],
      [13, 18, 'p', VIOLET],
    ]
    const bandY = cellY(4) + CELL_H + 6
    for (const [g0, g1, label, col] of blocks) {
      const x0 = cellX(g0)
      const x1 = cellX(g1) + CELL_W
      ctx.strokeStyle = col
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x0, bandY)
      ctx.lineTo(x1, bandY)
      ctx.stroke()
      ctx.fillStyle = col
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`${label}-block`, (x0 + x1) / 2, bandY + 12)
    }

    // ---- selected element readout ----
    const ry = bandY + 34
    ctx.textAlign = 'left'
    ctx.font = '12px monospace'
    ctx.fillStyle = GREEN
    ctx.fillText(`${sel.sym} — ${sel.name}  (Z = ${sel.z})`, TABLE_X, ry)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.6)'
    ctx.fillText(sel.config, TABLE_X + 210, ry)
    ctx.fillStyle = GOLD
    ctx.fillText(`Zeff ≈ ${sel.zeff.toFixed(2)}  (Slater)`, TABLE_X + 360, ry)

    // ---- line plot ----
    ctx.strokeStyle = 'rgba(255,245,235,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PL, PT)
    ctx.lineTo(PL, PB)
    ctx.lineTo(PR, PB)
    ctx.stroke()

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.textAlign = 'left'
    ctx.fillText(
      axis === 'period'
        ? `across period ${sel.period} →`
        : `down group ${sel.group} →`,
      PL,
      PT - 8
    )
    ctx.textAlign = 'right'
    ctx.fillText(`${Math.round(range.hi)}`, PL - 6, PT + 4)
    ctx.fillText(`${Math.round(range.lo)}`, PL - 6, PB + 3)

    const n = series.length
    const sx = (i: number) => (n === 1 ? (PL + PR) / 2 : PL + (i / (n - 1)) * (PR - PL))
    const sy = (v: number) => PB - ((v - range.lo) / (range.hi - range.lo || 1)) * (PB - PT)

    // Zeff overlay (normalised across the whole table) — the cause behind the trend.
    const zLo = 1
    const zHi = 8.25
    ctx.save()
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(245,158,11,0.55)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    series.forEach((e, i) => {
      const y = PB - ((e.zeff - zLo) / (zHi - zLo)) * (PB - PT)
      if (i === 0) ctx.moveTo(sx(i), y)
      else ctx.lineTo(sx(i), y)
    })
    ctx.stroke()
    ctx.restore()
    ctx.fillStyle = 'rgba(245,158,11,0.8)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'right'
    ctx.fillText('Zeff (dashed)', PR, PT + 4)

    // Property line
    ctx.strokeStyle = ORANGE
    ctx.lineWidth = 2
    ctx.beginPath()
    let started = false
    series.forEach((e, i) => {
      const v = info.get(e)
      if (v === null) { started = false; return }
      const x = sx(i)
      const y = sy(v)
      if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
    })
    ctx.stroke()

    series.forEach((e, i) => {
      const v = info.get(e)
      const x = sx(i)
      if (v !== null) {
        ctx.beginPath()
        ctx.arc(x, sy(v), e.z === sel.z ? 4.5 : 3, 0, Math.PI * 2)
        ctx.fillStyle = e.z === sel.z ? GREEN : ORANGE
        ctx.fill()
      }
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = e.z === sel.z ? GREEN : 'rgba(255,245,235,0.45)'
      ctx.fillText(e.sym, x, PB + 14)
    })

    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.35)'
    ctx.fillText('click any cell to move the trace · Zeff = Z − shielding', PL, PB + 32)
  }, [prop, axis, sel, series, range])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        revealRef.current = 1
        setReveal(1)
        return
      }
      revealRef.current = 0
      setReveal(0)
      const start = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 1100)
        revealRef.current = t
        setReveal(t)
        draw()
        if (t < 1) rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    },
  })

  useEffect(() => {
    draw()
  }, [draw, reveal])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) * W) / rect.width
    const y = ((e.clientY - rect.top) * H) / rect.height
    for (const el of ELEMENTS) {
      const ex = cellX(el.group)
      const ey = cellY(el.period)
      if (x >= ex && x <= ex + CELL_W && y >= ey && y <= ey + CELL_H) {
        setSelZ(el.z)
        return
      }
    }
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setProp('radius')
    setAxis('period')
    setSelZ(17)
    revealRef.current = 1
    setReveal(1)
    triggerReset()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Periodic trends and Zeff</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onClick={onClick}
          className="w-full rounded-lg cursor-pointer"
          style={{ background: '#0F0D0A' }}
        />
      </div>
      <div className="animation-controls">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(Object.keys(PROPS) as PropKey[]).map(k => (
            <button
              key={k}
              onClick={() => setProp(k)}
              className={`px-3 py-1.5 transition-colors ${prop === k ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {k === 'radius' ? 'Radius' : k === 'ie' ? 'Ionisation' : 'Electroneg.'}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(['period', 'group'] as Axis[]).map(a => (
            <button
              key={a}
              onClick={() => setAxis(a)}
              className={`px-3 py-1.5 capitalize transition-colors ${axis === a ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {a === 'period' ? 'Across period' : 'Down group'}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-xs text-text-muted">
          {sel.sym}: {PROPS[prop].get(sel) ?? '—'} {PROPS[prop].unit}
        </span>
      </div>
    </div>
  )
}
