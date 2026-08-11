'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

// plot region
const PL = 60
const PR = 486
const PT = 44
const PB = 250

// peak-force meters (right column)
const MET_HARD_X = 512
const MET_SOFT_X = 552
const MET_W = 26

const RED = '#F87171' // hard / concrete — dangerous peak force
const GREEN = '#10B981' // soft / cushion — field accent
const GOLD = '#F59E0B'
const MUTED = 'rgba(245,240,232,0.5)'
const GRID = 'rgba(255,245,235,0.08)'

// The fixed impulse both impacts must deliver:  J = Δp  (N·s)
const J = 12
const T_MAX = 0.5 // seconds shown on the time axis
const F_MAX = 500 // newtons at the top of the force axis

const T_HARD = 0.04 // concrete: short, fixed contact time
const DEFAULT_T_SOFT = 0.3 // cushion: long contact time (adjustable)

const SWEEP_SECONDS = 3.2 // real seconds to sweep the whole time axis

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

// Half-sine force pulse of total contact time T. Its area (impulse) is exactly J,
// independent of T, because peak = Jπ/2T makes ∫₀ᵀ peak·sin(πt/T) dt = J.
const peakForce = (T: number) => (J * Math.PI) / (2 * T)
const force = (t: number, T: number) =>
  t >= 0 && t <= T ? peakForce(T) * Math.sin((Math.PI * t) / T) : 0

const tToX = (t: number) => PL + (clamp(t, 0, T_MAX) / T_MAX) * (PR - PL)
const fToY = (f: number) => PB - (clamp(f, 0, F_MAX) / F_MAX) * (PB - PT)

export function ImpulseAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)

  const [tSoft, setTSoft] = useState(DEFAULT_T_SOFT)
  const [running, setRunning] = useState(false)

  const tSoftRef = useRef(DEFAULT_T_SOFT)
  useEffect(() => {
    tSoftRef.current = tSoft
  }, [tSoft])

  const playRef = useRef(0) // playhead time along the axis

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const Ts = tSoftRef.current
    const tp = playRef.current

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'

    // ---- axes + grid ----
    ctx.strokeStyle = GRID
    ctx.lineWidth = 1
    for (let f = 0; f <= F_MAX; f += 100) {
      const y = fToY(f)
      ctx.beginPath()
      ctx.moveTo(PL, y)
      ctx.lineTo(PR, y)
      ctx.stroke()
      ctx.fillStyle = MUTED
      ctx.fillText(`${f}`, PL - 30, y + 3)
    }
    for (let t = 0; t <= T_MAX + 1e-9; t += 0.1) {
      const x = tToX(t)
      ctx.strokeStyle = GRID
      ctx.beginPath()
      ctx.moveTo(x, PT)
      ctx.lineTo(x, PB)
      ctx.stroke()
      ctx.fillStyle = MUTED
      ctx.fillText(`${t.toFixed(1)}`, x - 7, PB + 14)
    }
    ctx.fillStyle = 'rgba(245,240,232,0.7)'
    ctx.fillText('force (N)', PL - 34, PT - 14)
    ctx.fillText('time (s)', PR - 44, PB + 26)

    // strong axis lines
    ctx.strokeStyle = 'rgba(255,245,235,0.22)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(PL, PT - 4)
    ctx.lineTo(PL, PB)
    ctx.lineTo(PR, PB)
    ctx.stroke()

    // ---- draw one pulse: filled area up to the playhead + full outline ----
    const drawPulse = (T: number, col: string, rgb: string) => {
      // filled impulse area (0 .. min(tp, T))
      const tEnd = Math.min(tp, T)
      if (tEnd > 0) {
        ctx.beginPath()
        ctx.moveTo(tToX(0), fToY(0))
        for (let t = 0; t <= tEnd + 1e-6; t += 0.002) {
          ctx.lineTo(tToX(t), fToY(force(t, T)))
        }
        ctx.lineTo(tToX(tEnd), fToY(0))
        ctx.closePath()
        ctx.fillStyle = `rgba(${rgb},0.22)`
        ctx.fill()
      }
      // full pulse outline
      ctx.beginPath()
      for (let t = 0; t <= T + 1e-6; t += 0.002) {
        const x = tToX(t)
        const y = fToY(force(t, T))
        if (t === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = col
      ctx.lineWidth = 2
      ctx.stroke()
      // peak marker
      const pk = peakForce(T)
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(tToX(T / 2), fToY(pk), 3, 0, Math.PI * 2)
      ctx.fill()
    }

    drawPulse(Ts, GREEN, '16,185,129')
    drawPulse(T_HARD, RED, '248,113,113')

    // labels on the curves
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = RED
    ctx.fillText('HARD (concrete)', tToX(T_HARD) + 8, fToY(peakForce(T_HARD)) + 2)
    ctx.fillStyle = GREEN
    ctx.fillText('SOFT (cushion)', tToX(Ts / 2) + 6, fToY(peakForce(Ts)) - 6)

    // playhead
    ctx.strokeStyle = 'rgba(245,240,232,0.35)'
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(tToX(tp), PT)
    ctx.lineTo(tToX(tp), PB)
    ctx.stroke()
    ctx.setLineDash([])

    // ---- peak-force meters ----
    ctx.font = '10px monospace'
    const pkHard = peakForce(T_HARD)
    const pkSoft = peakForce(Ts)
    ctx.fillStyle = 'rgba(245,240,232,0.7)'
    ctx.fillText('peak F', MET_HARD_X - 2, PT - 14)
    const meter = (x: number, pk: number, col: string, lab: string) => {
      const hpx = clamp(pk / F_MAX, 0, 1) * (PB - PT)
      ctx.fillStyle = col
      ctx.globalAlpha = 0.85
      ctx.fillRect(x, PB - hpx, MET_W, hpx)
      ctx.globalAlpha = 1
      ctx.fillStyle = col
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`${Math.round(pk)}`, x + MET_W / 2, PB - hpx - 4)
      ctx.fillStyle = MUTED
      ctx.font = '9px monospace'
      ctx.fillText(lab, x + MET_W / 2, PB + 14)
      ctx.textAlign = 'left'
    }
    meter(MET_HARD_X, pkHard, RED, 'hard')
    meter(MET_SOFT_X, pkSoft, GREEN, 'soft')

    // equal-area callout
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = GOLD
    ctx.textAlign = 'center'
    ctx.fillText(
      `equal area = impulse = Δp = ${J.toFixed(1)} N·s`,
      (PL + PR) / 2,
      PB + 40
    )
    ctx.textAlign = 'left'
  }, [])

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        playRef.current = T_MAX
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = W * dpr
      canvas.height = H * dpr
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    draw()
  }, [draw])

  useEffect(() => {
    if (!running || !visible) return
    let last = 0
    const tick = (t: number) => {
      if (last === 0) last = t
      const dt = clamp((t - last) / 1000, 0, 0.05)
      last = t
      playRef.current += (dt / SWEEP_SECONDS) * T_MAX
      if (playRef.current > T_MAX) playRef.current = 0
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw, visible])

  useEffect(() => {
    if (!running) draw()
  }, [tSoft, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    setTSoft(DEFAULT_T_SOFT)
    tSoftRef.current = DEFAULT_T_SOFT
    playRef.current = 0
    draw()
  }

  const pkHard = peakForce(T_HARD)
  const pkSoft = peakForce(tSoft)
  const ratio = pkHard / pkSoft

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Same Δp, two forces
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: Same Δp, two forces. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          Δp = <strong style={{ color: GOLD }}>{J.toFixed(1)} N·s</strong> (same)
        </span>
        <span style={{ color: RED }}>
          hard: {(T_HARD * 1000).toFixed(0)} ms · {Math.round(pkHard)} N
        </span>
        <span style={{ color: GREEN }}>
          soft: {(tSoft * 1000).toFixed(0)} ms · {Math.round(pkSoft)} N
        </span>
        <span>peak force ×{ratio.toFixed(1)} higher on concrete</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
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

        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Cushion / contact time:</span>
          <input
            type="range"
            min={0.08}
            max={0.45}
            step={0.01}
            value={tSoft}
            onChange={e => setTSoft(+e.target.value)}
            className="w-36"
            style={{ accentColor: GREEN }}
          />
          <span className="text-text-secondary font-mono">
            {(tSoft * 1000).toFixed(0)} ms
          </span>
        </label>
      </div>
    </div>
  )
}
