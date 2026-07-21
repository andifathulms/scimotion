'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300
const PLOT_L = 46
const PLOT_R = W - 16
const PLOT_T = 40
const PLOT_B = H - 40

const MAX_DAY = 200
const DT = 0.05
const STEPS = Math.round(MAX_DAY / DT)
const STEPS_PER_FRAME = 14

const C_S = '#60A5FA' // blue    — susceptible
const C_I = '#F472B6' // pink    — infectious
const C_R = '#A78BFA' // violet  — removed
const C_MARK = '#F59E0B' // gold — thresholds & markers

type Traj = {
  S: Float64Array
  I: Float64Array
  R: Float64Array
  peakIdx: number
  peakI: number
  attack: number
}

// Forward integration of the classic SIR system with fractions of N:
//   dS/dt = -beta S I,  dI/dt = beta S I - gamma I,  dR/dt = gamma I
// Fourth-order Runge-Kutta so the peak stays accurate at large R0.
function integrate(r0: number, days: number): Traj {
  const gamma = 1 / days
  const beta = r0 * gamma
  const S = new Float64Array(STEPS + 1)
  const I = new Float64Array(STEPS + 1)
  const R = new Float64Array(STEPS + 1)

  let s = 0.999
  let i = 0.001
  let r = 0
  S[0] = s
  I[0] = i
  R[0] = r

  const dS = (sv: number, iv: number) => -beta * sv * iv
  const dI = (sv: number, iv: number) => beta * sv * iv - gamma * iv

  let peakIdx = 0
  let peakI = i

  for (let n = 1; n <= STEPS; n++) {
    const k1s = dS(s, i)
    const k1i = dI(s, i)
    const k2s = dS(s + (DT / 2) * k1s, i + (DT / 2) * k1i)
    const k2i = dI(s + (DT / 2) * k1s, i + (DT / 2) * k1i)
    const k3s = dS(s + (DT / 2) * k2s, i + (DT / 2) * k2i)
    const k3i = dI(s + (DT / 2) * k2s, i + (DT / 2) * k2i)
    const k4s = dS(s + DT * k3s, i + DT * k3i)
    const k4i = dI(s + DT * k3s, i + DT * k3i)

    s += (DT / 6) * (k1s + 2 * k2s + 2 * k3s + k4s)
    i += (DT / 6) * (k1i + 2 * k2i + 2 * k3i + k4i)
    if (s < 0) s = 0
    if (i < 0) i = 0
    r = 1 - s - i

    S[n] = s
    I[n] = i
    R[n] = r
    if (i > peakI) {
      peakI = i
      peakIdx = n
    }
  }

  return { S, I, R, peakIdx, peakI, attack: 1 - S[STEPS] }
}

function xFor(idx: number): number {
  return PLOT_L + (idx / STEPS) * (PLOT_R - PLOT_L)
}

function yFor(v: number): number {
  return PLOT_B - v * (PLOT_B - PLOT_T)
}

export function SIRModelAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const [r0, setR0] = useState(2.5)
  const [days, setDays] = useState(7)
  const [running, setRunning] = useState(false)
  const [cursor, setCursor] = useState(0)

  const traj = useMemo(() => integrate(r0, days), [r0, days])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) setCursor(STEPS)
      else setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'

    // Horizontal gridlines at 0/25/50/75/100% of the population
    for (let g = 0; g <= 4; g++) {
      const y = yFor(g / 4)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.07)'
      ctx.lineWidth = 1
      ctx.moveTo(PLOT_L, y)
      ctx.lineTo(PLOT_R, y)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.textAlign = 'right'
      ctx.fillText(`${g * 25}%`, PLOT_L - 6, y + 3)
    }

    // Day ticks
    ctx.textAlign = 'center'
    for (let d = 0; d <= MAX_DAY; d += 25) {
      const x = xFor(d / DT)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.12)'
      ctx.moveTo(x, PLOT_B)
      ctx.lineTo(x, PLOT_B + 4)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.fillText(`${d}`, x, PLOT_B + 15)
    }
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('days →', PLOT_L + 2, H - 6)

    // Herd-immunity line: R_t = 1 exactly when S = 1/R0.
    if (r0 > 1) {
      const y = yFor(1 / r0)
      ctx.beginPath()
      ctx.strokeStyle = `${C_MARK}88`
      ctx.setLineDash([5, 4])
      ctx.lineWidth = 1.25
      ctx.moveTo(PLOT_L, y)
      ctx.lineTo(PLOT_R, y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = C_MARK
      ctx.textAlign = 'left'
      ctx.fillText(`S = 1/R₀ = ${(100 / r0).toFixed(0)}%  (Rt = 1)`, PLOT_L + 6, y - 4)
    }

    // Peak marker, drawn once the sweep has reached it
    if (r0 > 1 && cursor >= traj.peakIdx && traj.peakIdx > 0) {
      const px = xFor(traj.peakIdx)
      const py = yFor(traj.peakI)
      ctx.beginPath()
      ctx.strokeStyle = `${C_MARK}55`
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 1
      ctx.moveTo(px, py)
      ctx.lineTo(px, PLOT_B)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(px, py, 4, 0, Math.PI * 2)
      ctx.fillStyle = C_MARK
      ctx.fill()
      ctx.fillStyle = C_MARK
      ctx.textAlign = px > W - 130 ? 'right' : 'left'
      ctx.fillText(
        `peak ${(traj.peakI * 100).toFixed(1)}% · day ${(traj.peakIdx * DT).toFixed(0)}`,
        px > W - 130 ? px - 8 : px + 8,
        py - 8
      )
      ctx.textAlign = 'left'
    }

    // Axis frame
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(245,240,232,0.2)'
    ctx.lineWidth = 1
    ctx.moveTo(PLOT_L, PLOT_T - 8)
    ctx.lineTo(PLOT_L, PLOT_B)
    ctx.lineTo(PLOT_R, PLOT_B)
    ctx.stroke()

    // Curves
    const series: { color: string; data: Float64Array; width: number }[] = [
      { color: C_S, data: traj.S, width: 2 },
      { color: C_R, data: traj.R, width: 2 },
      { color: C_I, data: traj.I, width: 2.5 },
    ]
    for (const s of series) {
      ctx.beginPath()
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.width
      ctx.lineJoin = 'round'
      for (let n = 0; n <= cursor; n += 4) {
        const x = xFor(n)
        const y = yFor(s.data[n])
        if (n === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      if (cursor > 0 && cursor < STEPS) {
        ctx.beginPath()
        ctx.arc(xFor(cursor), yFor(s.data[cursor]), 3.25, 0, Math.PI * 2)
        ctx.fillStyle = s.color
        ctx.fill()
      }
    }

    // Legend
    ctx.font = '10px monospace'
    const legend: [string, string][] = [
      [C_S, 'S susceptible'],
      [C_I, 'I infectious'],
      [C_R, 'R removed'],
    ]
    let lx = PLOT_L
    for (const [color, label] of legend) {
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.moveTo(lx, 16)
      ctx.lineTo(lx + 16, 16)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.65)'
      ctx.textAlign = 'left'
      ctx.fillText(label, lx + 22, 19)
      lx += 26 + ctx.measureText(label).width + 20
    }

    if (r0 <= 1) {
      ctx.fillStyle = C_MARK
      ctx.font = '11px monospace'
      ctx.textAlign = 'right'
      ctx.fillText('R₀ ≤ 1 — no outbreak takes off', PLOT_R - 4, PLOT_T + 6)
      ctx.textAlign = 'left'
    }
  }, [traj, cursor, r0])

  useEffect(() => {
    draw()
  }, [draw])

  // Changing a parameter restarts the sweep on the new trajectory.
  useEffect(() => {
    setCursor(0)
  }, [r0, days])

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(rafRef.current)
      return
    }
    const tick = () => {
      setCursor(prev => {
        const next = prev + STEPS_PER_FRAME
        if (next >= STEPS) {
          setRunning(false)
          return STEPS
        }
        return next
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    setCursor(0)
    setR0(2.5)
    setDays(7)
    triggerReset()
  }

  const rt = r0 * traj.S[cursor]

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · SIR Epidemic Curve</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (cursor >= STEPS) setCursor(0)
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>R₀:</span>
          <input type="range" min={0.5} max={6} step={0.1} value={r0}
            onChange={e => setR0(+e.target.value)}
            className="w-24 accent-accent-gold" />
          <span className="font-mono">{r0.toFixed(1)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>infectious days (1/γ):</span>
          <input type="range" min={2} max={21} step={1} value={days}
            onChange={e => setDays(+e.target.value)}
            className="w-20 accent-accent-gold" />
          <span className="font-mono">{days}</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          <span style={{ color: C_MARK }}>Rt {rt.toFixed(2)}</span> ·{' '}
          <span style={{ color: C_I }}>peak {(traj.peakI * 100).toFixed(1)}%</span> ·{' '}
          <span style={{ color: C_R }}>attack rate {(traj.attack * 100).toFixed(0)}%</span>
        </span>
      </div>
    </div>
  )
}
