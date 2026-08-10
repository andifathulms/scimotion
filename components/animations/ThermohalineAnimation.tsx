'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

const X0 = 40
const X1 = 566
const Y_SURF = 52
const Y_BED = 274

// Linearised equation of state, sigma = rho - 1000 kg/m^3.
const RHO0 = 1027
const ALPHA = 2.0e-4 // thermal expansion, per K
const BETA = 7.6e-4 // haline contraction, per psu
const T_REF = 10
const S_REF = 35

const sigma = (T: number, S: number) =>
  RHO0 * (1 - ALPHA * (T - T_REF) + BETA * (S - S_REF)) - 1000

const T_NORTH = 2
const S_NORTH = 35.0
const T_DEEP = 2.5
const S_DEEP = 34.9

const SIGMA_DEEP = sigma(T_DEEP, S_DEEP)
const SIGMA_BASE = sigma(T_NORTH, S_NORTH)
const K_SV = 17 / (SIGMA_BASE - SIGMA_DEEP) // calibrated so 0 freshwater = 17 Sv

// Freshwater flux (Sv) into the North Atlantic -> surface salinity anomaly (psu)
const DS_PER_SV = 0.6

type Pt = { x: number; y: number }

// The conveyor, in cross-section: south (left) to the North Atlantic (right).
const DEEP_LOOP: Pt[] = [
  { x: 62, y: 66 },
  { x: 240, y: 62 },
  { x: 400, y: 64 },
  { x: 486, y: 70 },
  { x: 516, y: 96 },
  { x: 528, y: 160 },
  { x: 526, y: 236 },
  { x: 460, y: 252 },
  { x: 160, y: 254 },
  { x: 86, y: 214 },
  { x: 64, y: 134 },
  { x: 62, y: 66 },
]

// When the sinking weakens, water turns back before it reaches the deep basin.
const SHALLOW_LOOP: Pt[] = [
  { x: 62, y: 66 },
  { x: 260, y: 62 },
  { x: 430, y: 66 },
  { x: 470, y: 84 },
  { x: 452, y: 104 },
  { x: 260, y: 104 },
  { x: 96, y: 96 },
  { x: 62, y: 66 },
]

type Path = { pts: Pt[]; cum: number[]; total: number }

function buildPath(pts: Pt[]): Path {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  }
  return { pts, cum, total: cum[cum.length - 1] }
}

const DEEP = buildPath(DEEP_LOOP)
const SHALLOW = buildPath(SHALLOW_LOOP)

function posAt(p: Path, d: number): Pt {
  let s = d % p.total
  if (s < 0) s += p.total
  let i = 1
  while (i < p.cum.length - 1 && p.cum[i] < s) i++
  const a = p.pts[i - 1]
  const b = p.pts[i]
  const seg = p.cum[i] - p.cum[i - 1] || 1
  const t = (s - p.cum[i - 1]) / seg
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16))
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t))
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`
}

// Colour a parcel by where it is on the loop: warm on the way north, cold once
// it has sunk, slowly warming again as it upwells.
function parcelColor(frac: number): string {
  if (frac < 0.42) return lerpHex(GOLD, CYAN, frac / 0.42)
  if (frac < 0.55) return lerpHex(CYAN, BLUE, (frac - 0.42) / 0.13)
  if (frac < 0.86) return BLUE
  return lerpHex(BLUE, VIOLET, (frac - 0.86) / 0.14)
}

const N_PARTICLES = 150
const DEFAULT_FW = 0

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  fw: { default: DEFAULT_FW, min: 0, max: 0.5, step: 0.01 },
}

export function ThermohalineAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const distRef = useRef<number[]>([])
  const fwRef = useRef(DEFAULT_FW)

  const { params, set, permalink, isDefault, restored } = useWidgetParams('thermohaline', SPEC)
  const { fw } = params
  const [running, setRunning] = useState(false)
  const [sv, setSv] = useState(17)

  useEffect(() => {
    fwRef.current = fw
  }, [fw])

  const strengthFor = useCallback((f: number) => {
    const sN = S_NORTH - DS_PER_SV * f
    const sig = sigma(T_NORTH, sN)
    const dRho = sig - SIGMA_DEEP
    return {
      sv: Math.max(0, K_SV * dRho),
      sigmaN: sig,
      salinity: sN,
      dRho,
    }
  }, [])

  const seed = useCallback(() => {
    distRef.current = Array.from(
      { length: N_PARTICLES },
      (_, i) => (i / N_PARTICLES) * DEEP.total
    )
  }, [])

  const step = useCallback(() => {
    const { sv: s } = strengthFor(fwRef.current)
    const shallowFrac = Math.min(1, Math.max(0, 1 - s / 17))
    const d = distRef.current
    for (let i = 0; i < d.length; i++) {
      const isShallow = i / d.length < shallowFrac
      const path = isShallow ? SHALLOW : DEEP
      const speed = isShallow ? 0.9 : 0.45 + 1.9 * (s / 17)
      d[i] = (d[i] + speed) % path.total
    }
  }, [strengthFor])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const f = fwRef.current
    const { sv: s, sigmaN, salinity, dRho } = strengthFor(f)
    const shallowFrac = Math.min(1, Math.max(0, 1 - s / 17))

    ctx.clearRect(0, 0, W, H)

    // basin
    ctx.fillStyle = 'rgba(34,211,238,0.045)'
    ctx.fillRect(X0, Y_SURF, X1 - X0, Y_BED - Y_SURF)
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.lineWidth = 1.2
    ctx.strokeRect(X0, Y_SURF, X1 - X0, Y_BED - Y_SURF)

    // depth axis
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    for (let km = 0; km <= 4; km++) {
      const y = Y_SURF + ((Y_BED - Y_SURF) * km) / 4
      if (km > 0 && km < 4) {
        ctx.beginPath()
        ctx.moveTo(X0, y)
        ctx.lineTo(X1, y)
        ctx.stroke()
      }
      ctx.fillText(`${km}km`, 8, y + 3)
    }

    // latitude labels
    for (const [x, tag] of [
      [78, '40S'],
      [212, 'EQ'],
      [356, '40N'],
      [500, '65N'],
    ] as [number, string][]) {
      ctx.fillStyle = 'rgba(245,240,232,0.3)'
      ctx.fillText(tag, x - 8, Y_BED + 14)
    }

    // sea ice in the far north, with brine rejection
    ctx.fillStyle = 'rgba(245,240,232,0.22)'
    for (let i = 0; i < 7; i++) {
      const x = 452 + i * 16
      ctx.fillRect(x, Y_SURF - 7, 12, 6)
    }
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '8px monospace'
    ctx.fillText('sea ice: fresh ice out, salt left behind', 400, Y_SURF - 12)

    // freshwater input
    if (f > 0.001) {
      ctx.strokeStyle = GREEN
      ctx.lineWidth = 1.2
      const n = Math.max(1, Math.round(f * 12))
      for (let i = 0; i < n; i++) {
        const x = 430 + ((i * 97) % 120)
        ctx.beginPath()
        ctx.moveTo(x, Y_SURF - 30)
        ctx.lineTo(x, Y_SURF - 10)
        ctx.stroke()
      }
      ctx.fillStyle = GREEN
      ctx.font = '9px monospace'
      ctx.fillText(`+${f.toFixed(2)} Sv freshwater`, 402, Y_SURF - 34)
    }

    // the sinking limb, drawn with a width that tracks the overturning strength
    const limbW = 4 + 26 * (s / 17)
    ctx.fillStyle = `rgba(96,165,250,${0.06 + 0.14 * (s / 17)})`
    ctx.fillRect(500 - limbW / 2, Y_SURF + 16, limbW, 150)

    // parcels
    const d = distRef.current
    for (let i = 0; i < d.length; i++) {
      const isShallow = i / d.length < shallowFrac
      const path = isShallow ? SHALLOW : DEEP
      const pt = posAt(path, d[i])
      const frac = (d[i] % path.total) / path.total
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, isShallow ? 2 : 2.6, 0, Math.PI * 2)
      ctx.fillStyle = isShallow ? 'rgba(245,158,11,0.55)' : parcelColor(frac)
      ctx.fill()
    }

    // labels on the limbs
    ctx.font = '9px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText('warm surface flow, poleward →', 120, 50)
    ctx.fillStyle = BLUE
    ctx.fillText('← cold, dense return flow at depth', 170, 268)
    ctx.fillStyle = VIOLET
    ctx.fillText('upwelling', 76, 178)

    // density panel
    const px = X0 + 8
    const py = 118
    ctx.fillStyle = 'rgba(15,13,10,0.8)'
    ctx.fillRect(px, py, 178, 62)
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.lineWidth = 1
    ctx.strokeRect(px, py, 178, 62)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText(`N. Atlantic  T ${T_NORTH.toFixed(1)}C  S ${salinity.toFixed(2)}`, px + 7, py + 15)
    ctx.fillStyle = CYAN
    ctx.fillText(`sigma_surf  ${sigmaN.toFixed(3)}`, px + 7, py + 29)
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText(`sigma_deep  ${SIGMA_DEEP.toFixed(3)}`, px + 7, py + 43)
    ctx.fillStyle = dRho > 0 ? GOLD : '#F472B6'
    ctx.fillText(
      `contrast   ${dRho >= 0 ? '+' : ''}${dRho.toFixed(3)} kg/m3`,
      px + 7,
      py + 57
    )

    // overturning readout
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = s > 8 ? CYAN : s > 3 ? GOLD : '#F472B6'
    ctx.fillText(`overturning ${s.toFixed(1)} Sv`, X1 - 158, Y_BED - 18)
    const mw = 140
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(X1 - 158, Y_BED - 12, mw, 7)
    ctx.fillStyle = s > 8 ? CYAN : s > 3 ? GOLD : '#F472B6'
    ctx.fillRect(X1 - 158, Y_BED - 12, mw * Math.min(1, s / 20), 7)
  }, [strengthFor])

  const settle = useCallback(
    (n: number) => {
      for (let i = 0; i < n; i++) step()
    },
    [step]
  )

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        settle(120)
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    seed()
    draw()
  }, [seed, draw])

  useEffect(() => {
    setSv(strengthFor(fw).sv)
  }, [fw, strengthFor])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      step()
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  useEffect(() => {
    if (!running) draw()
  }, [fw, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    set('fw', DEFAULT_FW)
    fwRef.current = DEFAULT_FW
    seed()
    draw()
  }

  const state =
    sv > 13
      ? 'vigorous overturning'
      : sv > 6
        ? 'weakened overturning'
        : sv > 1
          ? 'near shutdown'
          : 'sinking has stopped'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Overturning in cross-section
        </span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button
            onClick={reset}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: '#0F0D0A' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Play
            </>
          )}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Freshwater:</span>
          <input
            type="range"
            min={SPEC.fw.min}
            max={SPEC.fw.max}
            step={SPEC.fw.step}
            value={fw}
            onChange={e => set('fw', +e.target.value)}
            className="w-40"
            style={{ accentColor: CYAN }}
          />
          <span className="font-mono text-text-secondary">
            {fw.toFixed(2)} Sv
          </span>
        </div>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          {sv.toFixed(1)} Sv · {state}
        </span>
      </div>
    </div>
  )
}
