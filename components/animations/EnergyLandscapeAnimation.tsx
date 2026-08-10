'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 290
const PAD = { left: 46, right: 18, top: 22, bottom: 40 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const X_MIN = -1
const X_MAX = 1
const E_MIN = -0.6
const E_MAX = 4.4

const MAX_STEPS = 1400
const ETA = 0.004          // downhill step size
const KT = 0.014           // thermal jitter
const NATIVE_X = 0.06      // how close to the bottom counts as folded
const STALL_WINDOW = 200   // steps without progress before we call it trapped

const C_FUNNEL = '#A78BFA'  // violet — entropic funnel envelope
const C_CURVE = '#F472B6'   // pink   — the rugged landscape itself
const C_BALL = '#F59E0B'    // gold   — the folding chain
const C_TRAIL = '#60A5FA'   // blue   — where it has been
const C_NATIVE = '#10B981'  // green  — native state
const DIM = 'rgba(245,240,232,0.4)'

const NMODES = 6

type Landscape = { amp: number[]; freq: number[]; phase: number[] }

function makeLandscape(): Landscape {
  const amp: number[] = []
  const freq: number[] = []
  const phase: number[] = []
  for (let k = 0; k < NMODES; k++) {
    amp.push(0.34 / (k + 1))
    freq.push(7 + k * 4.5 + Math.random() * 2.5)
    phase.push(Math.random() * Math.PI * 2)
  }
  return { amp, freq, phase }
}

// Smooth funnel plus R-scaled ruggedness. R = 0 is a perfect funnel.
function energy(x: number, R: number, L: Landscape): number {
  let e = 3.6 * x * x
  for (let k = 0; k < NMODES; k++) e += R * L.amp[k] * Math.sin(L.freq[k] * x + L.phase[k])
  return e
}

function slope(x: number, R: number, L: Landscape): number {
  let g = 7.2 * x
  for (let k = 0; k < NMODES; k++) g += R * L.amp[k] * L.freq[k] * Math.cos(L.freq[k] * x + L.phase[k])
  return g
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

type Outcome = 'folding' | 'folded' | 'trapped'
type Run = { xs: number[]; outcome: Outcome; foldStep: number }

function buildRun(x0: number, R: number, L: Landscape): Run {
  const xs = [x0]
  let x = x0
  let outcome: Outcome = 'folding'
  let foldStep = MAX_STEPS
  let bestX = Math.abs(x)
  let sinceProgress = 0

  for (let i = 1; i <= MAX_STEPS; i++) {
    const noise = (Math.random() - 0.5) * 2 * KT
    x = clamp(x - ETA * slope(x, R, L) + noise, X_MIN, X_MAX)
    xs.push(x)
    if (Math.abs(x) < bestX - 0.002) { bestX = Math.abs(x); sinceProgress = 0 }
    else sinceProgress++

    if (Math.abs(x) < NATIVE_X) { outcome = 'folded'; foldStep = i; break }
    if (sinceProgress > STALL_WINDOW) { outcome = 'trapped'; foldStep = i; break }
  }
  if (outcome === 'folding') outcome = 'trapped'
  return { xs, outcome, foldStep }
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  rug: { default: 0.25, min: 0, max: 1, step: 0.01 },
}

export function EnergyLandscapeAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('energy-landscape', SPEC)
  const { rug } = params
  const [land, setLand] = useState<Landscape>(() => makeLandscape())
  const [run, setRun] = useState<Run | null>(null)
  const [step, setStep] = useState(0)
  const [running, setRunning] = useState(false)
  const rafRef = useRef<number>(0)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) return
      setStep(0)
      setRunning(true)
    },
  })

  useEffect(() => {
    setRun(buildRun(-0.94, rug, land))
    setStep(0)
  }, [rug, land])

  const toPx = useCallback(
    (x: number) => PAD.left + ((x - X_MIN) / (X_MAX - X_MIN)) * PLOT_W,
    [],
  )
  const toPy = useCallback(
    (e: number) => PAD.top + ((E_MAX - e) / (E_MAX - E_MIN)) * PLOT_H,
    [],
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    // Axes.
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()
    ctx.fillStyle = DIM
    ctx.fillText('free energy', PAD.left - 34, PAD.top - 8)
    ctx.fillText('conformational coordinate  →  native', PAD.left + 4, PAD.top + PLOT_H + 24)

    // Entropic funnel envelope: wide and high at the unfolded rim, narrow at the
    // bottom, because vastly fewer conformations remain as the chain compacts.
    ctx.strokeStyle = `${C_FUNNEL}66`
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    for (const sign of [-1, 1]) {
      ctx.beginPath()
      for (let i = 0; i <= 100; i++) {
        const t = i / 100
        const x = sign * t
        const e = 3.6 * x * x + 0.55
        const px = toPx(x)
        const py = toPy(e)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.fillStyle = `${C_FUNNEL}AA`
    ctx.fillText('funnel rim — many unfolded shapes', PAD.left + 6, PAD.top + 14)

    // The rugged landscape.
    ctx.strokeStyle = C_CURVE
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let p = 0; p <= PLOT_W; p++) {
      const x = X_MIN + (p / PLOT_W) * (X_MAX - X_MIN)
      const py = clamp(toPy(energy(x, rug, land)), PAD.top - 20, PAD.top + PLOT_H + 20)
      if (p === 0) ctx.moveTo(PAD.left + p, py)
      else ctx.lineTo(PAD.left + p, py)
    }
    ctx.stroke()

    // Native state at the bottom of the funnel.
    ctx.beginPath()
    ctx.arc(toPx(0), toPy(energy(0, rug, land)), 5, 0, Math.PI * 2)
    ctx.fillStyle = `${C_NATIVE}55`
    ctx.fill()
    ctx.strokeStyle = C_NATIVE
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = C_NATIVE
    ctx.fillText('native', toPx(0) - 16, toPy(energy(0, rug, land)) + 20)

    if (!run) return
    const idx = Math.min(step, run.xs.length - 1)

    // Trail.
    ctx.strokeStyle = `${C_TRAIL}77`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i <= idx; i += 2) {
      const x = run.xs[i]
      const py = clamp(toPy(energy(x, rug, land)), PAD.top, PAD.top + PLOT_H)
      if (i === 0) ctx.moveTo(toPx(x), py)
      else ctx.lineTo(toPx(x), py)
    }
    ctx.stroke()

    // The chain itself, sliding down the landscape.
    const x = run.xs[idx]
    const cx = toPx(x)
    const cy = clamp(toPy(energy(x, rug, land)), PAD.top, PAD.top + PLOT_H)
    ctx.beginPath()
    ctx.arc(cx, cy, 6.5, 0, Math.PI * 2)
    ctx.fillStyle = C_BALL
    ctx.fill()

    const finished = idx >= run.xs.length - 1
    if (finished) {
      ctx.font = '12px monospace'
      if (run.outcome === 'folded') {
        ctx.fillStyle = C_NATIVE
        ctx.fillText(`reached the native state in ${run.foldStep} steps`, PAD.left + 6, PAD.top + PLOT_H - 8)
      } else {
        ctx.fillStyle = C_CURVE
        ctx.fillText('kinetically trapped in a local minimum', PAD.left + 6, PAD.top + PLOT_H - 8)
        ctx.beginPath()
        ctx.arc(cx, cy, 13, 0, Math.PI * 2)
        ctx.strokeStyle = `${C_CURVE}88`
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }
  }, [run, step, rug, land, toPx, toPy])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running || !run) { cancelAnimationFrame(rafRef.current); return }
    const loop = () => {
      setStep(s => {
        if (s >= run.xs.length - 1) { setRunning(false); return run.xs.length - 1 }
        return s + 1
      })
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, run])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setStep(0)
    setLand(makeLandscape())
  }

  const finished = run ? step >= run.xs.length - 1 : false
  const outcome = run?.outcome ?? 'folding'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The folding funnel</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { if (finished) setStep(0); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-pink text-bg-base text-xs font-medium hover:bg-accent-pink/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Drop chain</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Ruggedness:</span>
          <input
            type="range" min={SPEC.rug.min} max={SPEC.rug.max} step={SPEC.rug.step} value={rug}
            onChange={e => { setRunning(false); set('rug', +e.target.value) }}
            className="w-32 accent-accent-violet"
          />
          <span className="font-mono text-text-secondary">{rug.toFixed(2)}</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary">
          {finished
            ? outcome === 'folded'
              ? <>folded in <strong className="font-mono" style={{ color: C_NATIVE }}>{run?.foldStep}</strong> steps</>
              : <strong style={{ color: C_CURVE }}>trapped — a misfolded intermediate</strong>
            : <>descending · step <strong className="font-mono" style={{ color: C_BALL }}>{step}</strong></>
          }
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Reset redraws the ruggedness with fresh bumps, so the same setting gives a different landscape each time.
      </p>
    </div>
  )
}
