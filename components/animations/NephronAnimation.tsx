'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300

const PINK = '#F472B6' // waste / urea — the thing actually excreted
const GOLD = '#F59E0B' // proteins, highlights, urine tint
const BLUE = '#60A5FA' // water
const GREEN = '#10B981' // glucose
const VIOLET = '#A78BFA' // salt / electrolytes
const RED = '#F87171' // blood cells (too big to filter)

// Renal threshold for glucose: above ~180 mg/dL the tubule's transporters
// saturate and glucose begins to spill into the urine (glucosuria).
const GLU_THRESHOLD = 180
const GLU_SPAN = 180

// A nephron traced as a polyline: glomerulus exit → proximal tubule (coiled) →
// descending limb → loop of Henle → ascending limb → distal tubule →
// collecting duct → urine. All coordinates sit inside the 600×300 canvas.
const WAYPOINTS: [number, number][] = [
  [132, 92], [168, 66], [200, 100], [234, 66], [264, 100],
  [292, 122], [304, 176], [302, 216],
  [320, 234], [342, 220],
  [348, 174], [354, 120], [374, 94],
  [404, 66], [434, 100], [464, 74],
  [494, 96], [508, 146], [508, 206], [508, 244], [508, 258],
]

type Seg = { x0: number; y0: number; x1: number; y1: number; len: number; cum: number }

function buildPath(): { segs: Seg[]; total: number } {
  const segs: Seg[] = []
  let cum = 0
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const [x0, y0] = WAYPOINTS[i]
    const [x1, y1] = WAYPOINTS[i + 1]
    const len = Math.hypot(x1 - x0, y1 - y0)
    segs.push({ x0, y0, x1, y1, len, cum })
    cum += len
  }
  return { segs, total: cum }
}
const PATH = buildPath()

type PointOnPath = { x: number; y: number; nx: number; ny: number }
function posAt(s: number): PointOnPath {
  const d = Math.max(0, Math.min(1, s)) * PATH.total
  let seg = PATH.segs[PATH.segs.length - 1]
  for (const sg of PATH.segs) {
    if (d >= sg.cum && d <= sg.cum + sg.len) {
      seg = sg
      break
    }
  }
  const t = seg.len === 0 ? 0 : (d - seg.cum) / seg.len
  const x = seg.x0 + (seg.x1 - seg.x0) * t
  const y = seg.y0 + (seg.y1 - seg.y0) * t
  const ux = (seg.x1 - seg.x0) / (seg.len || 1)
  const uy = (seg.y1 - seg.y0) / (seg.len || 1)
  return { x, y, nx: -uy, ny: ux } // (nx, ny) is the unit normal
}

// Tubule half-width narrows along the path — a visual proxy for the filtrate
// volume shrinking as water is reabsorbed (≈180 L/day in, ≈1.5 L/day out).
const widthAt = (s: number) => 8 - 5.6 * s

type PType = 'water' | 'glucose' | 'salt' | 'urea'
type Particle = {
  type: PType
  s: number
  lane: number
  spd: number
  sReab: number // path fraction at which it gets reabsorbed (Infinity = never)
  reab: boolean
  fade: number
  rx: number
  ry: number
}

const COLOR: Record<PType, string> = { water: BLUE, glucose: GREEN, salt: VIOLET, urea: PINK }
const RADIUS: Record<PType, number> = { water: 2, glucose: 2.7, salt: 2.2, urea: 2.9 }

function pickType(): PType {
  const r = Math.random()
  if (r < 0.5) return 'water'
  if (r < 0.7) return 'salt'
  if (r < 0.84) return 'glucose'
  return 'urea'
}

// glucoseHigh in [0,1] is the fraction of glucose particles that spill (exceed Tm).
function initParticle(spread: boolean, glucoseSpill: number): Particle {
  const type = pickType()
  let sReab = Infinity
  if (type === 'water') {
    sReab = Math.random() < 0.98 ? 0.14 + Math.random() * 0.66 : Infinity // ~2% of water escapes
  } else if (type === 'salt') {
    sReab = 0.16 + Math.random() * 0.7
  } else if (type === 'glucose') {
    sReab = Math.random() < glucoseSpill ? Infinity : 0.08 + Math.random() * 0.3 // reclaimed early in the PCT
  } // urea: never reabsorbed → concentrated into urine
  return {
    type,
    s: spread ? Math.random() : -Math.random() * 0.08,
    lane: Math.random() * 2 - 1,
    spd: 0.0022 + Math.random() * 0.0014,
    sReab,
    reab: false,
    fade: 0,
    rx: 0,
    ry: 0,
  }
}

const N_PARTICLES = 90

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  glucose: { default: 100, min: 80, max: 360, step: 5 },
}

export function NephronAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const partsRef = useRef<Particle[]>([])
  const spillRef = useRef(0)
  const excretedRef = useRef({ glucose: 0, urea: 0, water: 0, salt: 0 })

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('nephron', SPEC)
  const { glucose } = params
  const [glucoseUrine, setGlucoseUrine] = useState(0)

  const spillFrac = Math.max(0, Math.min(1, (glucose - GLU_THRESHOLD) / GLU_SPAN))
  useEffect(() => {
    spillRef.current = spillFrac
  })

  const seed = useCallback(() => {
    const out: Particle[] = []
    for (let i = 0; i < N_PARTICLES; i++) out.push(initParticle(true, spillRef.current))
    partsRef.current = out
    excretedRef.current = { glucose: 0, urea: 0, water: 0, salt: 0 }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // Peritubular capillary band along the top — where reabsorbed solutes return.
    ctx.fillStyle = 'rgba(248,113,113,0.06)'
    ctx.fillRect(0, 0, W, 40)
    ctx.strokeStyle = 'rgba(248,113,113,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, 40)
    ctx.lineTo(W, 40)
    ctx.stroke()
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('peritubular capillary — reabsorbed water & solutes go back to the blood', 12, 25)

    // Blood supply arrow into the glomerulus.
    ctx.strokeStyle = RED
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(14, 92)
    ctx.lineTo(48, 92)
    ctx.stroke()
    ctx.fillStyle = RED
    ctx.beginPath()
    ctx.moveTo(48, 84)
    ctx.lineTo(62, 92)
    ctx.lineTo(48, 100)
    ctx.closePath()
    ctx.fill()

    // Glomerulus: a capillary tuft. Big cells & proteins bounce inside; they are
    // too large to pass the filter, so they never enter the tubule.
    const gx = 86
    const gy = 92
    ctx.beginPath()
    ctx.arc(gx, gy, 34, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(248,113,113,0.10)'
    ctx.fill()
    ctx.strokeStyle = `${RED}99`
    ctx.lineWidth = 1.5
    ctx.stroke()
    const cells: [number, number, string, number][] = [
      [74, 82, RED, 6], [98, 86, RED, 6.5], [82, 104, RED, 5.5],
      [104, 100, GOLD, 4.5], [70, 96, GOLD, 4], [92, 74, GOLD, 4],
    ]
    for (const [cxp, cyp, col, rr] of cells) {
      ctx.beginPath()
      ctx.arc(cxp, cyp, rr, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.textAlign = 'center'
    ctx.font = '9px monospace'
    ctx.fillText('glomerulus', gx, gy + 50)
    ctx.fillText('cells & proteins stay', gx, gy + 61)

    // Tubule ribbon — width decreases with s (shrinking filtrate volume).
    const steps = 120
    ctx.lineCap = 'round'
    for (let i = 0; i < steps; i++) {
      const s0 = i / steps
      const s1 = (i + 1) / steps
      const p0 = posAt(s0)
      const p1 = posAt(s1)
      ctx.strokeStyle = 'rgba(96,165,250,0.14)'
      ctx.lineWidth = widthAt((s0 + s1) / 2) * 2
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.stroke()
    }
    // Lumen wall outline.
    ctx.strokeStyle = 'rgba(245,240,232,0.28)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i <= steps; i++) {
      const p = posAt(i / steps)
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()

    // Segment labels.
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('proximal tubule', 200, 52)
    ctx.fillText('loop of Henle', 330, 252)
    ctx.fillText('distal tubule', 434, 54)
    ctx.fillText('collecting duct', 552, 150)

    // Particles.
    for (const p of partsRef.current) {
      if (p.s < 0 && !p.reab) continue
      if (p.reab) {
        ctx.globalAlpha = Math.max(0, 1 - p.fade)
        ctx.beginPath()
        ctx.arc(p.rx, p.ry - p.fade * 46, RADIUS[p.type], 0, Math.PI * 2)
        ctx.fillStyle = COLOR[p.type]
        ctx.fill()
        ctx.globalAlpha = 1
        continue
      }
      const pt = posAt(p.s)
      const off = p.lane * widthAt(p.s) * 0.55
      ctx.beginPath()
      ctx.arc(pt.x + pt.nx * off, pt.y + pt.ny * off, RADIUS[p.type], 0, Math.PI * 2)
      ctx.fillStyle = COLOR[p.type]
      ctx.fill()
    }

    // Urine collection at the duct's end.
    const up = posAt(1)
    const conc = Math.min(1, glucoseUrine > 0 ? 0.8 : 0.55)
    ctx.fillStyle = `rgba(245,158,11,${0.15 + conc * 0.25})`
    ctx.beginPath()
    ctx.moveTo(up.x - 20, up.y)
    ctx.lineTo(up.x + 20, up.y)
    ctx.lineTo(up.x + 15, up.y + 34)
    ctx.lineTo(up.x - 15, up.y + 34)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = `${GOLD}88`
    ctx.lineWidth = 1.25
    ctx.stroke()
    ctx.fillStyle = GOLD
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('urine', up.x, up.y + 50)

    // Volume balance readout.
    ctx.textAlign = 'left'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = BLUE
    ctx.fillText('filtered  180 L/day', 132, 116)
    ctx.fillStyle = GREEN
    ctx.font = '10px monospace'
    ctx.fillText('> 99% reabsorbed', 396, 96)
    ctx.textAlign = 'right'
    ctx.fillStyle = GOLD
    ctx.font = 'bold 12px monospace'
    ctx.fillText('urine  ≈ 1.5 L/day', 560, 232)

    // Legend.
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    const legend: [string, string][] = [
      [BLUE, 'water'], [GREEN, 'glucose'], [VIOLET, 'salts'], [PINK, 'urea (waste)'],
    ]
    let lx = 12
    for (const [col, lab] of legend) {
      ctx.beginPath()
      ctx.arc(lx + 4, H - 12, 3.2, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
      ctx.fillStyle = 'rgba(245,240,232,0.6)'
      ctx.fillText(lab, lx + 12, H - 9)
      lx += 24 + ctx.measureText(lab).width + 16
    }

    // Glucosuria warning.
    if (glucoseUrine > 0) {
      ctx.fillStyle = GREEN
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'right'
      ctx.fillText('glucose spilling into urine — Tm exceeded', W - 12, H - 10)
    }
  }, [glucoseUrine])

  const step = useCallback(() => {
    const spill = spillRef.current
    for (const p of partsRef.current) {
      if (p.reab) {
        p.fade += 0.04
        if (p.fade >= 1) Object.assign(p, initParticle(false, spill))
        continue
      }
      p.s += p.spd
      if (p.s >= p.sReab) {
        const pt = posAt(p.s)
        const off = p.lane * widthAt(p.s) * 0.55
        p.reab = true
        p.fade = 0
        p.rx = pt.x + pt.nx * off
        p.ry = pt.y + pt.ny * off
      } else if (p.s >= 1) {
        excretedRef.current[p.type] += 1
        Object.assign(p, initParticle(false, spill))
      }
    }
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) draw()
      else setRunning(true)
    },
  })

  useEffect(() => {
    seed()
    draw()
  }, [seed, draw])

  useEffect(() => {
    if (!running) return
    let frame = 0
    const tick = () => {
      step()
      if (frame % 6 === 0) setGlucoseUrine(excretedRef.current.glucose)
      frame++
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  useEffect(() => {
    if (!running) draw()
  }, [glucoseUrine, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    set('glucose', 100)
    spillRef.current = 0
    setGlucoseUrine(0)
    seed()
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Filter everything, then reabsorb what you need
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
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-pink text-bg-base text-xs font-medium hover:bg-accent-pink/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Blood glucose:</span>
          <input
            type="range" min={SPEC.glucose.min} max={SPEC.glucose.max} step={SPEC.glucose.step} value={glucose}
            onChange={e => { set('glucose', +e.target.value); setGlucoseUrine(0); excretedRef.current.glucose = 0 }}
            className="w-32 accent-accent-pink"
          />
          <span className="text-text-secondary font-mono">{glucose} mg/dL</span>
        </div>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={
            spillFrac > 0
              ? { color: GREEN, borderColor: `${GREEN}44`, background: `${GREEN}12` }
              : { color: 'rgba(245,240,232,0.5)', borderColor: 'rgba(245,240,232,0.15)', background: 'rgba(245,240,232,0.04)' }
          }
        >
          {spillFrac > 0 ? 'above renal threshold → glucosuria' : 'below 180 mg/dL → glucose fully reclaimed'}
        </span>
      </div>
    </div>
  )
}
