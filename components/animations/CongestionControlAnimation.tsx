'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Zap } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 380

const RED = '#F87171'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const INK = 'rgba(255,245,235,0.55)'
const FAINT = 'rgba(255,245,235,0.10)'

// Plot area for the sawtooth.
const PAD_L = 48
const PAD_R = 20
const PAD_T = 40
const PAD_B = 56
const PLOT_W = W - PAD_L - PAD_R
const PLOT_H = H - PAD_T - PAD_B

const WIN_MAX = 40 // congestion window ceiling on the y-axis (segments)
const HISTORY = 260 // number of round trips shown across the x-axis
const RTT_MS = 120 // virtual ms per round trip (one simulation step)

type Phase = 'slow-start' | 'avoidance'

type Sim = {
  cwnd: number // congestion window (segments)
  ssthresh: number // slow-start threshold
  phase: Phase
  capacity: number // network capacity (segments the link holds); loss above this
  history: { cwnd: number; loss: boolean; cap: number }[]
  injectLoss: boolean
  rtts: number
  losses: number
  event: string
}

function makeSim(capacity: number): Sim {
  return {
    cwnd: 1,
    ssthresh: WIN_MAX, // start high so slow start runs freely at first
    phase: 'slow-start',
    capacity,
    history: [],
    injectLoss: false,
    rtts: 0,
    losses: 0,
    event: 'slow start — window doubles each round trip to find the pipe fast',
  }
}

function step(sim: Sim) {
  sim.rtts++

  // A loss occurs if we exceed the network's capacity, or if the user injects one.
  const overCapacity = sim.cwnd > sim.capacity
  const loss = overCapacity || sim.injectLoss
  sim.injectLoss = false

  if (loss) {
    sim.losses++
    // Multiplicative decrease: halve, and set the threshold to the new window.
    sim.ssthresh = Math.max(2, Math.floor(sim.cwnd / 2))
    sim.cwnd = sim.ssthresh
    sim.phase = 'avoidance'
    sim.event = overCapacity
      ? `window hit the link's capacity → loss, halve to ${sim.cwnd} (multiplicative decrease)`
      : `injected loss → window halved to ${sim.cwnd}`
    sim.history.push({ cwnd: sim.cwnd, loss: true, cap: sim.capacity })
  } else {
    if (sim.phase === 'slow-start') {
      // Exponential growth: double per round trip.
      sim.cwnd = Math.min(WIN_MAX, sim.cwnd * 2)
      if (sim.cwnd >= sim.ssthresh) {
        sim.phase = 'avoidance'
        sim.event = 'reached threshold → congestion avoidance (additive: +1 per round trip)'
      } else {
        sim.event = 'slow start — window doubling each round trip'
      }
    } else {
      // Additive increase: +1 per round trip.
      sim.cwnd = Math.min(WIN_MAX, sim.cwnd + 1)
      sim.event = 'congestion avoidance — probing gently, +1 segment per round trip'
    }
    sim.history.push({ cwnd: sim.cwnd, loss: false, cap: sim.capacity })
  }

  if (sim.history.length > HISTORY) sim.history.shift()
}

export function CongestionControlAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const accRef = useRef(0)
  const lastRef = useRef(0)
  const capRef = useRef(24)
  const simRef = useRef<Sim>(makeSim(24))
  const [running, setRunning] = useState(false)
  const [cap, setCap] = useState(24)

  const x = useCallback((i: number) => PAD_L + (i / (HISTORY - 1)) * PLOT_W, [])
  const y = useCallback((w: number) => PAD_T + PLOT_H - (w / WIN_MAX) * PLOT_H, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sim = simRef.current
    ctx.clearRect(0, 0, W, H)

    // Title.
    ctx.fillStyle = RED
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('congestion window over time', PAD_L, 24)
    ctx.fillStyle = INK
    ctx.font = '9px monospace'
    ctx.textAlign = 'right'
    ctx.fillText('the AIMD sawtooth', W - PAD_R, 24)

    // Axes.
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD_L, PAD_T)
    ctx.lineTo(PAD_L, PAD_T + PLOT_H)
    ctx.lineTo(PAD_L + PLOT_W, PAD_T + PLOT_H)
    ctx.stroke()

    // Y gridlines / labels.
    ctx.textAlign = 'right'
    ctx.font = '8px monospace'
    for (let v = 0; v <= WIN_MAX; v += 10) {
      const yy = y(v)
      ctx.strokeStyle = FAINT
      ctx.beginPath()
      ctx.moveTo(PAD_L, yy)
      ctx.lineTo(PAD_L + PLOT_W, yy)
      ctx.stroke()
      ctx.fillStyle = INK
      ctx.fillText(String(v), PAD_L - 6, yy + 3)
    }
    ctx.save()
    ctx.translate(14, PAD_T + PLOT_H / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillStyle = INK
    ctx.font = '9px monospace'
    ctx.fillText('cwnd (segments)', 0, 0)
    ctx.restore()
    ctx.textAlign = 'center'
    ctx.fillStyle = INK
    ctx.fillText('round trips →', PAD_L + PLOT_W / 2, PAD_T + PLOT_H + 34)

    // Capacity line (current).
    const capY = y(sim.capacity)
    ctx.strokeStyle = GOLD
    ctx.setLineDash([6, 5])
    ctx.lineWidth = 1.25
    ctx.beginPath()
    ctx.moveTo(PAD_L, capY)
    ctx.lineTo(PAD_L + PLOT_W, capY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = GOLD
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillText(`network capacity ≈ ${sim.capacity}`, PAD_L + 6, capY - 5)

    // Sawtooth history. Colour: slow-start ramp vs. avoidance handled by drop markers.
    const h = sim.history
    if (h.length > 1) {
      ctx.strokeStyle = RED
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i < h.length; i++) {
        const xx = x(i)
        const yy = y(h[i].cwnd)
        if (i === 0) ctx.moveTo(xx, yy)
        else ctx.lineTo(xx, yy)
      }
      ctx.stroke()

      // Loss markers — a gold dot at each halving point.
      for (let i = 0; i < h.length; i++) {
        if (!h[i].loss) continue
        ctx.beginPath()
        ctx.arc(x(i), y(h[i].cwnd), 3, 0, Math.PI * 2)
        ctx.fillStyle = GOLD
        ctx.fill()
      }

      // Current point.
      const last = h.length - 1
      ctx.beginPath()
      ctx.arc(x(last), y(h[last].cwnd), 4, 0, Math.PI * 2)
      ctx.fillStyle = sim.phase === 'slow-start' ? VIOLET : BLUE
      ctx.fill()
    }

    // Phase / stats badges.
    ctx.textAlign = 'left'
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = sim.phase === 'slow-start' ? VIOLET : BLUE
    ctx.fillText(sim.phase === 'slow-start' ? 'phase: SLOW START (×2 / RTT)' : 'phase: CONGESTION AVOIDANCE (+1 / RTT)', PAD_L, PAD_T + 14)
    ctx.fillStyle = INK
    ctx.font = '9px monospace'
    ctx.fillText(`cwnd ${Math.round(sim.cwnd)}   ssthresh ${sim.ssthresh}`, PAD_L, PAD_T + 28)

    // Counters (bottom-right).
    ctx.textAlign = 'right'
    ctx.fillStyle = GREEN
    ctx.fillText(`round trips: ${sim.rtts}`, W - PAD_R, H - 30)
    ctx.fillStyle = GOLD
    ctx.fillText(`losses: ${sim.losses}`, W - PAD_R, H - 18)

    // Event line.
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,245,235,0.6)'
    ctx.font = '9px monospace'
    ctx.fillText(`› ${sim.event}`, PAD_L, H - 8)
  }, [x, y])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const loop = (ts: number) => {
      if (!lastRef.current) lastRef.current = ts
      const dt = ts - lastRef.current
      lastRef.current = ts
      accRef.current += dt
      while (accRef.current >= RTT_MS) {
        step(simRef.current)
        accRef.current -= RTT_MS
      }
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(rafRef.current)
      lastRef.current = 0
    }
  }, [running, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
      else draw()
    },
  })

  useEffect(() => {
    draw()
  }, [draw])

  const changeCap = (v: number) => {
    capRef.current = v
    simRef.current.capacity = v
    setCap(v)
    draw()
  }

  const injectLoss = () => {
    simRef.current.injectLoss = true
    simRef.current.event = 'loss injected — watch the window halve on the next round trip'
    draw()
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    lastRef.current = 0
    accRef.current = 0
    simRef.current = makeSim(capRef.current)
    setRunning(false)
    triggerReset()
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Congestion Control</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <button onClick={injectLoss}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors">
          <Zap size={12} /> Inject loss
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Bandwidth:</span>
          <input type="range" min={6} max={WIN_MAX} step={1} value={cap}
            onChange={e => changeCap(+e.target.value)}
            className="w-20 accent-accent-gold" />
          <span>{cap}</span>
        </div>
      </div>
    </div>
  )
}
