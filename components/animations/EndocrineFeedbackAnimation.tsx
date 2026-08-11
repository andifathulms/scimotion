'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const PINK = '#F472B6'
const TEAL = '#2DD4BF'
const GOLD = '#F59E0B'
const ORANGE = '#FB923C'
const GREEN = '#10B981'
const BG = '#0F0D0A'

// --- Control model (illustrative units, not clinical values) ---
const SET = 50 // hormone set point
const BAND = 8 // half-width of the healthy range
const DEAD = 2 // deadband for the "at set point" readout
const BASE_DRIVE = 1 // trophic drive when the level sits exactly on target
const GAIN = 0.06 // feedback gain
const K_PROD = 25 // production per unit drive
const K_CLEAR = 0.5 // first-order clearance
const MAX_DRIVE = 3.2
const DT = 0.05 // integration step per frame

// Chart geometry (right panel).
const CH_X = 268
const CH_R = W - 14
const CH_TOP = 40
const CH_BOT = H - 34
const PLOT_W = CH_R - CH_X
const L_MAX = 100

const yForL = (v: number) => CH_BOT - (Math.max(0, Math.min(v, L_MAX)) / L_MAX) * (CH_BOT - CH_TOP)

export function EndocrineFeedbackAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [blocked, setBlocked] = useState(false)
  // Mirror for readouts, updated from the loop.
  const [ui, setUi] = useState({ level: SET, drive: BASE_DRIVE })

  const levelRef = useRef(SET)
  const driveRef = useRef(BASE_DRIVE)
  const blockedRef = useRef(false)
  const histRef = useRef<number[]>([])
  const frameRef = useRef(0)

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Static final frame: converge to the set point, no loop.
        resetSim()
        for (let i = 0; i < 400; i++) stepSim()
        setUi({ level: levelRef.current, drive: driveRef.current })
        draw()
        return
      }
      setRunning(true)
    },
  })

  const resetSim = useCallback(() => {
    levelRef.current = SET
    driveRef.current = BASE_DRIVE
    histRef.current = new Array(PLOT_W).fill(SET)
    frameRef.current = 0
  }, [])

  // One integration tick of the negative-feedback loop.
  const stepSim = useCallback(() => {
    const L = levelRef.current
    const error = SET - L
    const drive = Math.max(0, Math.min(MAX_DRIVE, BASE_DRIVE + GAIN * error))
    driveRef.current = drive
    const production = blockedRef.current ? 0 : K_PROD * drive
    const dL = production - K_CLEAR * L
    let next = L + dL * DT
    if (next < 0) next = 0
    levelRef.current = next

    const h = histRef.current
    h.push(next)
    if (h.length > PLOT_W) h.shift()

    frameRef.current++
  }, [])

  const inject = () => {
    levelRef.current = Math.min(L_MAX, levelRef.current + 32)
  }
  const toggleBlock = () => {
    const nb = !blockedRef.current
    blockedRef.current = nb
    setBlocked(nb)
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    const L = levelRef.current
    const drive = driveRef.current
    const f = frameRef.current
    const isBlocked = blockedRef.current

    // Regulation state.
    let regime: 'up' | 'down' | 'set'
    if (L < SET - DEAD) regime = 'up'
    else if (L > SET + DEAD) regime = 'down'
    else regime = 'set'

    // Stimulatory strength (drive) and inhibitory strength (level) as 0..1.
    const stim = Math.max(0, Math.min(1, drive / MAX_DRIVE))
    const inhib = Math.max(0, Math.min(1, L / (SET + BAND)))

    drawAxis(ctx, stim, inhib, L, isBlocked, f, regime)
    drawChart(ctx, histRef.current, regime)
  }, [])

  // --- Left panel: the hypothalamus → pituitary → gland loop ---
  const drawAxis = (
    ctx: CanvasRenderingContext2D,
    stim: number,
    inhib: number,
    L: number,
    isBlocked: boolean,
    f: number,
    regime: 'up' | 'down' | 'set'
  ) => {
    const cx = 120
    const nodes = [
      { y: 40, label: 'HYPOTHALAMUS', color: VIOLETish() },
      { y: 108, label: 'PITUITARY', color: TEAL },
      { y: 176, label: 'TARGET GLAND', color: isBlocked ? '#6b7280' : GOLD },
    ]

    // Stimulatory arrows (down the axis) — brighter when drive is high.
    ctx.lineWidth = 1 + stim * 3
    ctx.strokeStyle = `rgba(45,212,191,${0.3 + stim * 0.6})`
    for (let i = 0; i < 2; i++) {
      arrow(ctx, cx, nodes[i].y + 15, cx, nodes[i + 1].y - 15)
    }
    // Gland -> hormone secretion arrow.
    ctx.strokeStyle = isBlocked ? 'rgba(120,120,130,0.4)' : `rgba(244,114,182,${0.4 + stim * 0.5})`
    arrow(ctx, cx, nodes[2].y + 15, cx, 236)

    // Inhibitory feedback loop up the left side (blunt ⊣ head) — stronger when level is high.
    ctx.lineWidth = 1 + inhib * 3
    ctx.strokeStyle = `rgba(251,146,60,${0.3 + inhib * 0.6})`
    ctx.beginPath()
    ctx.moveTo(cx - 8, 248)
    ctx.lineTo(30, 248)
    ctx.lineTo(30, 74)
    ctx.lineTo(cx - 44, 74)
    ctx.stroke()
    // Blunt inhibitory head.
    ctx.beginPath()
    ctx.moveTo(cx - 44, 66); ctx.lineTo(cx - 44, 82)
    ctx.stroke()
    ctx.fillStyle = `rgba(251,146,60,${0.5 + inhib * 0.5})`
    ctx.font = '8px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('inhibits', 34, 64)

    // Nodes.
    for (const n of nodes) {
      ctx.beginPath()
      roundRect(ctx, cx - 62, n.y - 14, 124, 28, 8)
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      ctx.fill()
      ctx.strokeStyle = n.color
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = n.color
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(n.label, cx, n.y + 3)
    }

    // Hormone pool indicator with pulsing molecules proportional to L.
    ctx.fillStyle = PINK
    ctx.font = 'bold 9px monospace'
    ctx.fillText('HORMONE', cx, 246)
    const count = Math.round((L / L_MAX) * 10)
    for (let i = 0; i < count; i++) {
      const px = cx - 45 + (i % 5) * 22
      const py = 262 + Math.floor(i / 5) * 14 + Math.sin(f * 0.08 + i) * 1.5
      ctx.beginPath()
      ctx.arc(px, py, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // Regime badge.
    ctx.textAlign = 'left'
    ctx.font = 'bold 10px monospace'
    if (regime === 'up') {
      ctx.fillStyle = TEAL
      ctx.fillText('▲ UP-REGULATING', 12, H - 12)
    } else if (regime === 'down') {
      ctx.fillStyle = ORANGE
      ctx.fillText('▼ DOWN-REGULATING', 12, H - 12)
    } else {
      ctx.fillStyle = GREEN
      ctx.fillText('● AT SET POINT', 12, H - 12)
    }
    if (isBlocked) {
      ctx.fillStyle = '#ef4444'
      ctx.font = '9px monospace'
      ctx.fillText('gland blocked', 150, H - 12)
    }
  }

  // --- Right panel: live hormone level vs time (thermostat trace) ---
  const drawChart = (ctx: CanvasRenderingContext2D, hist: number[], regime: 'up' | 'down' | 'set') => {
    // Healthy range band.
    const yHi = yForL(SET + BAND)
    const yLo = yForL(SET - BAND)
    ctx.fillStyle = 'rgba(16,185,129,0.10)'
    ctx.fillRect(CH_X, yHi, PLOT_W, yLo - yHi)

    // Frame.
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    ctx.strokeRect(CH_X, CH_TOP, PLOT_W, CH_BOT - CH_TOP)

    // Set-point line.
    const ySet = yForL(SET)
    ctx.strokeStyle = 'rgba(96,165,250,0.7)'
    ctx.setLineDash([5, 4])
    ctx.beginPath(); ctx.moveTo(CH_X, ySet); ctx.lineTo(CH_R, ySet); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(96,165,250,0.85)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`set point ${SET}`, CH_X + 4, ySet - 4)
    ctx.fillStyle = 'rgba(16,185,129,0.7)'
    ctx.fillText('healthy range', CH_X + 4, yHi - 4)

    // Trace.
    ctx.strokeStyle = PINK
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let i = 0; i < hist.length; i++) {
      const x = CH_X + i
      const y = yForL(hist[i])
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Leading dot.
    if (hist.length > 0) {
      const lx = CH_X + hist.length - 1
      const ly = yForL(hist[hist.length - 1])
      ctx.fillStyle = regime === 'set' ? GREEN : regime === 'up' ? TEAL : ORANGE
      ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.fill()
    }

    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('hormone level →', CH_X + 4, CH_TOP - 6)
  }

  // --- Loop ---
  useEffect(() => {
    if (!running || !visible) return
    const loop = () => {
      // Two substeps per frame for smoother, faster convergence.
      stepSim(); stepSim()
      setUi({ level: levelRef.current, drive: driveRef.current })
      draw()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running, stepSim, draw, visible])

  useEffect(() => {
    if (!running) draw()
  }, [running, draw])


  const reset = () => {
    triggerReset()
    setRunning(false)
    blockedRef.current = false
    setBlocked(false)
    resetSim()
    setUi({ level: SET, drive: BASE_DRIVE })
    draw()
  }

  // Initialise history once.
  useEffect(() => {
    if (histRef.current.length === 0) resetSim()
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const regimeLabel =
    ui.level < SET - DEAD ? 'up-regulating' : ui.level > SET + DEAD ? 'down-regulating' : 'at set point'

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Negative feedback holds a hormone near its set point
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Negative feedback holds a hormone near its set point. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: BG }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>set point: <span className="text-accent-blue">{SET}</span></span>
        <span>level: <span style={{ color: PINK }}>{ui.level.toFixed(1)}</span></span>
        <span>trophic drive: <span className="text-accent-teal">{ui.drive.toFixed(2)}×</span></span>
        <span>state: <span className="text-accent-gold">{regimeLabel}</span></span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={inject}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-surface border border-border text-text-secondary hover:bg-bg-hover"
        >
          Inject hormone
        </button>
        <button
          onClick={toggleBlock}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border ${
            blocked ? 'bg-accent-orange text-bg-base' : 'bg-bg-surface text-text-secondary hover:bg-bg-hover'
          }`}
        >
          {blocked ? 'Unblock gland' : 'Block gland'}
        </button>
      </div>
    </div>
  )
}

function VIOLETish() {
  return '#A78BFA'
}

function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  // Head.
  const ang = Math.atan2(y2 - y1, x2 - x1)
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - 6 * Math.cos(ang - 0.5), y2 - 6 * Math.sin(ang - 0.5))
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - 6 * Math.cos(ang + 0.5), y2 - 6 * Math.sin(ang + 0.5))
  ctx.stroke()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
