'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 620
const H = 300
const PAD = { left: 56, right: 88, top: 18, bottom: 34 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const N_MAX = 40
const Y_MAX = 50 // decades of operations shown on the log axis
const OPS_PER_SEC = 1e9
const SECONDS_PER_YEAR = 3.156e7
const AGE_UNIVERSE_YEARS = 1.38e10

const LOG10_2 = Math.log10(2)

function log10Fact(n: number): number {
  let s = 0
  for (let i = 2; i <= n; i++) s += Math.log10(i)
  return s
}

type Series = {
  key: string
  label: string
  color: string
  kind: 'poly' | 'exp'
  log10: (n: number) => number
}

const SERIES: Series[] = [
  { key: 'n', label: 'n', color: '#60A5FA', kind: 'poly', log10: n => Math.log10(n) },
  { key: 'n2', label: 'n²', color: '#A78BFA', kind: 'poly', log10: n => 2 * Math.log10(n) },
  { key: 'n3', label: 'n³', color: '#10B981', kind: 'poly', log10: n => 3 * Math.log10(n) },
  { key: '2n', label: '2ⁿ', color: '#F59E0B', kind: 'exp', log10: n => n * LOG10_2 },
  { key: 'fact', label: 'n!', color: '#F472B6', kind: 'exp', log10: log10Fact },
]

// Renders a base-10 logarithm as a readable operation count.
function fmtOps(l10: number): string {
  if (l10 < 6) return Math.round(Math.pow(10, l10)).toLocaleString('en-US')
  return `10^${l10.toFixed(1)}`
}

// Renders a base-10 logarithm of seconds as human time.
function fmtTime(l10sec: number): string {
  if (l10sec < -8) return 'under 10 ns'
  if (l10sec < 300) {
    const s = Math.pow(10, l10sec)
    if (s < 1e-6) return `${(s * 1e9).toFixed(0)} ns`
    if (s < 1e-3) return `${(s * 1e6).toFixed(1)} µs`
    if (s < 1) return `${(s * 1e3).toFixed(1)} ms`
    if (s < 60) return `${s.toFixed(1)} s`
    if (s < 3600) return `${(s / 60).toFixed(1)} minutes`
    if (s < 86400) return `${(s / 3600).toFixed(1)} hours`
    if (s < SECONDS_PER_YEAR) return `${(s / 86400).toFixed(1)} days`
    const years = s / SECONDS_PER_YEAR
    if (years < 1e6) return `${years.toFixed(0)} years`
    if (years < AGE_UNIVERSE_YEARS) return `10^${Math.log10(years).toFixed(1)} years`
  }
  const l10years = l10sec - Math.log10(SECONDS_PER_YEAR)
  const l10ratio = l10years - Math.log10(AGE_UNIVERSE_YEARS)
  return `10^${l10ratio.toFixed(1)} × age of universe`
}

export function ComplexityGrowthAnimation() {
  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setN(N_MAX); return }
      setN(1)
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [n, setN] = useState(N_MAX)
  const [running, setRunning] = useState(false)

  const x = useCallback((v: number) => PAD.left + ((v - 1) / (N_MAX - 1)) * PLOT_W, [])
  const y = useCallback((l10: number) => PAD.top + PLOT_H - (Math.min(l10, Y_MAX) / Y_MAX) * PLOT_H, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // horizontal decade gridlines
    ctx.font = '9px monospace'
    for (let d = 0; d <= Y_MAX; d += 10) {
      const gy = y(d)
      ctx.strokeStyle = 'rgba(255,245,235,0.07)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PAD.left, gy)
      ctx.lineTo(PAD.left + PLOT_W, gy)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.fillText(d === 0 ? '1 op' : `10^${d}`, 8, gy + 3)
    }

    // axes
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('operations (log scale)', PAD.left + 4, PAD.top - 6)
    ctx.fillText('n (input size)', PAD.left + PLOT_W - 68, PAD.top + PLOT_H + 22)

    // x ticks
    for (let v = 10; v <= N_MAX; v += 10) {
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.fillText(String(v), x(v) - 6, PAD.top + PLOT_H + 14)
    }

    // "a second of compute" reference line at 10^9 ops
    const refY = y(9)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(245,240,232,0.22)'
    ctx.beginPath()
    ctx.moveTo(PAD.left, refY)
    ctx.lineTo(PAD.left + PLOT_W, refY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('1 second', PAD.left + PLOT_W - 52, refY - 4)

    // curves
    for (const s of SERIES) {
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.kind === 'exp' ? 2.5 : 2
      ctx.beginPath()
      let lastX = PAD.left
      let lastY = PAD.top + PLOT_H
      let started = false
      for (let v = 1; v <= N_MAX; v++) {
        const l10 = s.log10(v)
        if (l10 > Y_MAX) break
        const px = x(v)
        const py = y(l10)
        if (!started) { ctx.moveTo(px, py); started = true } else ctx.lineTo(px, py)
        lastX = px
        lastY = py
      }
      ctx.stroke()

      // label at the end of the visible curve
      ctx.fillStyle = s.color
      ctx.font = 'bold 11px monospace'
      const lx = Math.min(lastX + 6, W - 34)
      ctx.fillText(s.label, lx, Math.max(lastY + 4, PAD.top + 10))
      ctx.font = '9px monospace'
    }

    // marker at current n
    const nx = x(n)
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(255,245,235,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(nx, PAD.top)
    ctx.lineTo(nx, PAD.top + PLOT_H)
    ctx.stroke()
    ctx.setLineDash([])

    for (const s of SERIES) {
      const l10 = s.log10(n)
      if (l10 > Y_MAX) continue
      ctx.fillStyle = s.color
      ctx.beginPath()
      ctx.arc(nx, y(l10), 3.5, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle = 'rgba(245,240,232,0.8)'
    ctx.font = 'bold 11px monospace'
    ctx.fillText(`n = ${n}`, Math.min(nx + 6, W - PAD.right - 40), PAD.top + PLOT_H - 6)
  }, [n, x, y])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running || !visible) return
    let timer = 0
    let raf = 0
    const step = () => {
      setN(prev => {
        if (prev >= N_MAX) { setRunning(false); return N_MAX }
        return prev + 1
      })
      timer = window.setTimeout(() => { raf = requestAnimationFrame(step) }, 120)
    }
    timer = window.setTimeout(() => { raf = requestAnimationFrame(step) }, 120)
    return () => { window.clearTimeout(timer); cancelAnimationFrame(raf) }
  }, [running, visible])

  const reset = () => {
    triggerReset()
    setRunning(false)
    setN(N_MAX)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Polynomial vs exponential growth</span>
        <button onClick={reset} className="text-xs text-text-muted hover:text-text-secondary transition-colors">Reset</button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Polynomial vs exponential growth. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
        {SERIES.map(s => {
          const l10 = s.log10(n)
          return (
            <div
              key={s.key}
              className="rounded-lg px-2 py-1.5 border"
              style={{ borderColor: `${s.color}33`, background: `${s.color}0F` }}
            >
              <div className="font-medium" style={{ color: s.color }}>{s.label}</div>
              <div className="text-text-secondary font-mono">{fmtOps(l10)}</div>
              <div className="text-text-muted">{fmtTime(l10 - Math.log10(OPS_PER_SEC))}</div>
            </div>
          )
        })}
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>n:</span>
          <input
            type="range" min={1} max={N_MAX} value={n}
            onChange={e => { setN(+e.target.value); setRunning(false) }}
            className="w-44 accent-accent-blue"
          />
          <span className="text-text-secondary font-medium">{n}</span>
        </label>
        <span className="ml-auto text-xs text-text-muted">
          time assumes <strong className="text-text-secondary">10⁹ operations / second</strong>
        </span>
      </div>
    </div>
  )
}
