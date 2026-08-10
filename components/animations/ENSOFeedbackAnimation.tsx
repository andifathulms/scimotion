'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const CYAN = '#22D3EE'   // field accent / El Niño warm
const WARM = '#F97316'   // warm phase fill
const COOL = '#3B82F6'   // La Niña cool
const TEAL = '#2DD4BF'
const MUTED = 'rgba(148,163,184,0.7)'

// --- recharge-oscillator style ENSO model (deterministic) -------------------
// T = eastern-Pacific SST anomaly (°C), h = warm-water volume / thermocline depth anomaly.
// Bjerknes growth on T, saturating; h provides the delayed negative feedback that
// turns runaway warming into an oscillation with a ~2–7 yr period.
const OMEGA = 1.35       // rad/yr → period ≈ 4.6 yr
const GROWTH = 0.16      // Bjerknes positive-feedback growth rate (1/yr)
const AMAX = 2.4         // saturation amplitude (°C)
const DT = 0.02          // yr per step
const STEPS_PER_FRAME = 2
const WINDOW_YR = 28
const THRESH = 0.5       // El Niño / La Niña index threshold

// left panel: Bjerknes feedback loop
const CX = 150
const CY = 150
const RAD = 88

type Node = { ang: number; lines: string[] }
const NODES: Node[] = [
  { ang: -Math.PI / 2, lines: ['weaker', 'trade winds'] },
  { ang: -Math.PI / 2 + (2 * Math.PI) / 3, lines: ['warmer', 'eastern SST'] },
  { ang: -Math.PI / 2 + (4 * Math.PI) / 3, lines: ['weaker SST', 'gradient'] },
]

// plot region (right)
const PL = 300
const PR = W - 18
const PT = 40
const PB = H - 46
const V_MAX = 3

function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, size: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-size, -size * 0.55)
  ctx.lineTo(-size, size * 0.55)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()
}

export function ENSOFeedbackAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const stateRef = useRef({ T: 0.25, h: 0, year: 0 })
  const histRef = useRef<{ t: number; T: number }[]>([{ t: 0, T: 0.25 }])
  const phaseRef = useRef(0)

  const [running, setRunning] = useState(false)
  const [snap, setSnap] = useState({ T: 0.25, h: 0, year: 0 })
  const runningRef = useRef(false)

  const { ref, triggered } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // fill a static multi-year trace, no loop
        for (let i = 0; i < 1600; i++) advance()
        setSnap({ ...stateRef.current })
        draw()
      } else {
        runningRef.current = true
        setRunning(true)
      }
    },
  })

  const advance = () => {
    const st = stateRef.current
    // dT/dt : Bjerknes growth (saturating) + coupling to thermocline h
    const dT = GROWTH * st.T * (1 - (st.T * st.T) / (AMAX * AMAX)) + OMEGA * st.h
    const dh = -OMEGA * st.T - 0.04 * st.h
    st.T += dT * DT
    st.h += dh * DT
    st.year += DT
    const hist = histRef.current
    if (st.year - hist[hist.length - 1].t >= 0.05) {
      hist.push({ t: st.year, T: st.T })
      while (hist.length && hist[0].t < st.year - WINDOW_YR) hist.shift()
    }
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const st = stateRef.current
    const ph = phaseRef.current
    const warm = st.T >= 0
    const phaseCol = st.T > THRESH ? WARM : st.T < -THRESH ? COOL : MUTED
    const active = Math.min(1, Math.abs(st.T) / 1.2) // feedback vigor

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)
    ctx.font = '10px monospace'

    // ---- LEFT: Bjerknes feedback loop ----
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(226,232,240,0.75)'
    ctx.font = '11px monospace'
    ctx.fillText('Bjerknes feedback', CX, 24)
    ctx.font = '9px monospace'
    ctx.fillStyle = TEAL
    ctx.fillText('(positive loop)', CX, 36)
    ctx.font = '10px monospace'

    // arcs between nodes with moving arrowhead
    for (let i = 0; i < 3; i++) {
      const a0 = NODES[i].ang + 0.42
      const a1 = NODES[(i + 1) % 3].ang - 0.42
      ctx.beginPath()
      ctx.arc(CX, CY, RAD, a0, a1)
      ctx.strokeStyle = warm ? `rgba(249,115,22,${0.35 + active * 0.5})` : `rgba(59,130,246,${0.35 + active * 0.5})`
      ctx.lineWidth = 2 + active * 1.5
      ctx.stroke()
      // moving arrowhead along arc
      const frac = ((ph * 0.012 + i / 3) % 1)
      const am = a0 + (a1 - a0) * frac
      const ax = CX + RAD * Math.cos(am)
      const ay = CY + RAD * Math.sin(am)
      arrowHead(ctx, ax, ay, am + Math.PI / 2, 6, warm ? WARM : COOL)
    }

    // nodes
    for (const n of NODES) {
      const x = CX + RAD * Math.cos(n.ang)
      const y = CY + RAD * Math.sin(n.ang)
      ctx.beginPath()
      ctx.arc(x, y, 30, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(15,13,10,0.95)'
      ctx.fill()
      ctx.strokeStyle = warm ? `rgba(249,115,22,0.7)` : `rgba(59,130,246,0.7)`
      ctx.lineWidth = 1.4
      ctx.stroke()
      ctx.fillStyle = 'rgba(226,232,240,0.85)'
      ctx.textAlign = 'center'
      n.lines.forEach((ln, k) => ctx.fillText(ln, x, y - 3 + k * 11))
    }
    // center phase badge
    ctx.fillStyle = phaseCol
    ctx.font = '11px monospace'
    ctx.fillText(st.T > THRESH ? 'EL NIÑO' : st.T < -THRESH ? 'LA NIÑA' : 'NEUTRAL', CX, CY - 4)
    ctx.font = '13px monospace'
    ctx.fillText(`${st.T >= 0 ? '+' : ''}${st.T.toFixed(2)}°C`, CX, CY + 12)
    ctx.font = '10px monospace'

    // ---- RIGHT: ENSO index time series ----
    const yFor = (v: number) => PB - ((v + V_MAX) / (2 * V_MAX)) * (PB - PT)
    const zeroY = yFor(0)

    // threshold bands
    ctx.fillStyle = 'rgba(249,115,22,0.08)'
    ctx.fillRect(PL, yFor(V_MAX), PR - PL, yFor(THRESH) - yFor(V_MAX))
    ctx.fillStyle = 'rgba(59,130,246,0.08)'
    ctx.fillRect(PL, yFor(-THRESH), PR - PL, yFor(-V_MAX) - yFor(-THRESH))

    // axes
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PL, zeroY)
    ctx.lineTo(PR, zeroY)
    ctx.stroke()
    ctx.setLineDash([3, 4])
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.beginPath()
    ctx.moveTo(PL, yFor(THRESH)); ctx.lineTo(PR, yFor(THRESH))
    ctx.moveTo(PL, yFor(-THRESH)); ctx.lineTo(PR, yFor(-THRESH))
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = MUTED
    ctx.textAlign = 'left'
    ctx.fillText('ENSO index (SST anomaly °C)', PL, PT - 6)
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(249,115,22,0.85)'
    ctx.fillText('El Niño', PR - 2, yFor(THRESH) - 4)
    ctx.fillStyle = 'rgba(59,130,246,0.85)'
    ctx.fillText('La Niña', PR - 2, yFor(-THRESH) + 11)

    // history trace
    const hist = histRef.current
    const t1 = st.year
    const t0 = Math.max(0, t1 - WINDOW_YR)
    const xFor = (t: number) => PL + ((t - t0) / WINDOW_YR) * (PR - PL)
    if (hist.length > 1) {
      // fill above/below zero
      ctx.beginPath()
      ctx.moveTo(xFor(hist[0].t), zeroY)
      for (const p of hist) ctx.lineTo(xFor(p.t), yFor(p.T))
      ctx.lineTo(xFor(hist[hist.length - 1].t), zeroY)
      ctx.closePath()
      ctx.fillStyle = 'rgba(34,211,238,0.10)'
      ctx.fill()
      // line
      ctx.beginPath()
      for (let i = 0; i < hist.length; i++) {
        const x = xFor(hist[i].t)
        const y = yFor(hist[i].T)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = CYAN
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.stroke()
      // head dot
      const last = hist[hist.length - 1]
      ctx.beginPath()
      ctx.arc(xFor(last.t), yFor(last.T), 3.5, 0, Math.PI * 2)
      ctx.fillStyle = phaseCol === MUTED ? CYAN : phaseCol
      ctx.fill()
    }
    // x label
    ctx.fillStyle = MUTED
    ctx.textAlign = 'center'
    ctx.fillText(`years  ${t0.toFixed(0)} → ${t1.toFixed(0)}  (period ≈ 2–7 yr)`, (PL + PR) / 2, PB + 16)
  }, [])

  useEffect(() => {
    if (!triggered || !running) {
      cancelAnimationFrame(animRef.current)
      return
    }
    const loop = () => {
      for (let i = 0; i < STEPS_PER_FRAME; i++) advance()
      phaseRef.current += 1
      if (phaseRef.current % 5 === 0) setSnap({ ...stateRef.current })
      draw()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [triggered, running, draw])

  const nudge = (dir: 1 | -1) => {
    stateRef.current.T += dir * 0.5
    setSnap({ ...stateRef.current })
    draw()
  }

  const reset = () => {
    setRunning(false)
    runningRef.current = false
    stateRef.current = { T: 0.25, h: 0, year: 0 }
    histRef.current = [{ t: 0, T: 0.25 }]
    phaseRef.current = 0
    setSnap({ T: 0.25, h: 0, year: 0 })
    draw()
  }

  const phaseLabel = snap.T > THRESH ? 'El Niño' : snap.T < -THRESH ? 'La Niña' : 'Neutral'
  const phaseColor = snap.T > THRESH ? WARM : snap.T < -THRESH ? COOL : MUTED

  return (
    <div ref={ref} className="animation-block">
      <canvas role="img" aria-label="Animated diagram: ENSO feedback. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)', aspectRatio: `${W} / ${H}` }} />
      <div className="mt-3 px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>year: {snap.year.toFixed(1)}</span>
        <span>index: <span style={{ color: phaseColor }}>{snap.T >= 0 ? '+' : ''}{snap.T.toFixed(2)}°C</span></span>
        <span>phase: <span style={{ color: phaseColor }}>{phaseLabel}</span></span>
        <span>warm-water vol (h): {snap.h >= 0 ? '+' : ''}{snap.h.toFixed(2)}</span>
      </div>
      <div className="animation-controls flex-wrap gap-3 mt-3">
        <button
          onClick={() => { const n = !running; setRunning(n); runningRef.current = n }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={() => nudge(1)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: 'rgba(249,115,22,0.14)', color: WARM }}
        >
          Nudge warm
        </button>
        <button
          onClick={() => nudge(-1)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: 'rgba(59,130,246,0.14)', color: COOL }}
        >
          Nudge cool
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
    </div>
  )
}
