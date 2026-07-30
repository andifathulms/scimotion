'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300
const PAD_L = 40
const PAD_R = 20
const PAD_T = 20
const PAD_B = 34

const VIOLET = '#A78BFA'
const BLUE = '#60A5FA'
const GREEN = '#10B981'
const GOLD = '#F59E0B'

// Curve: f(x) = 4 − x² on [a, b] = [−2, 2]. Strictly positive dome, so every
// rectangle sits above the axis. Exact area ∫₋₂² (4 − x²) dx = 32/3.
const A = -2
const B = 2
const EXACT = 32 / 3
const f = (x: number) => 4 - x * x
const Y_MAX = 4.4

type Rule = 'left' | 'right' | 'mid'
const RULES: { key: Rule; label: string }[] = [
  { key: 'left', label: 'Left' },
  { key: 'mid', label: 'Midpoint' },
  { key: 'right', label: 'Right' },
]

const N_MIN = 1
const N_MAX = 80

function riemann(n: number, rule: Rule) {
  const dx = (B - A) / n
  let sum = 0
  for (let i = 0; i < n; i++) {
    const xl = A + i * dx
    const sx = rule === 'left' ? xl : rule === 'right' ? xl + dx : xl + dx / 2
    sum += f(sx) * dx
  }
  return sum
}

export function RiemannSumAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const [n, setN] = useState(6)
  const [rule, setRule] = useState<Rule>('mid')
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) setN(60)
      else setRunning(true)
    },
  })

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
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    const plotW = W - PAD_L - PAD_R
    const plotH = H - PAD_T - PAD_B
    const px = (x: number) => PAD_L + ((x - A) / (B - A)) * plotW
    const py = (y: number) => PAD_T + (1 - y / Y_MAX) * plotH

    // Grid
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    ctx.lineWidth = 1
    for (let gx = A; gx <= B; gx++) {
      ctx.beginPath(); ctx.moveTo(px(gx), PAD_T); ctx.lineTo(px(gx), PAD_T + plotH); ctx.stroke()
    }
    for (let gy = 0; gy <= 4; gy++) {
      ctx.beginPath(); ctx.moveTo(PAD_L, py(gy)); ctx.lineTo(PAD_L + plotW, py(gy)); ctx.stroke()
    }

    // Rectangles
    const dx = (B - A) / n
    for (let i = 0; i < n; i++) {
      const xl = A + i * dx
      const sx = rule === 'left' ? xl : rule === 'right' ? xl + dx : xl + dx / 2
      const h = f(sx)
      const x0 = px(xl)
      const x1 = px(xl + dx)
      const yTop = py(h)
      const yBase = py(0)
      ctx.fillStyle = 'rgba(167,139,250,0.28)'
      ctx.fillRect(x0, yTop, x1 - x0, yBase - yTop)
      ctx.strokeStyle = 'rgba(167,139,250,0.85)'
      ctx.lineWidth = n > 40 ? 0.5 : 1
      ctx.strokeRect(x0, yTop, x1 - x0, yBase - yTop)
      // Sample-point dot on the curve
      if (n <= 24) {
        ctx.beginPath(); ctx.arc(px(sx), py(h), 2.5, 0, Math.PI * 2)
        ctx.fillStyle = GOLD; ctx.fill()
      }
    }

    // Axis
    ctx.strokeStyle = 'rgba(255,245,235,0.28)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(PAD_L, py(0)); ctx.lineTo(PAD_L + plotW, py(0)); ctx.stroke()

    // Curve
    ctx.beginPath()
    ctx.strokeStyle = BLUE
    ctx.lineWidth = 2.5
    for (let s = 0; s <= plotW; s++) {
      const x = A + (s / plotW) * (B - A)
      const y = py(f(x))
      if (s === 0) ctx.moveTo(px(x), y); else ctx.lineTo(px(x), y)
    }
    ctx.stroke()

    // x labels
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.textAlign = 'center'
    ctx.fillText('a = −2', px(A), H - 12)
    ctx.fillText('b = 2', px(B), H - 12)
    ctx.textAlign = 'left'
    ctx.fillStyle = BLUE
    ctx.fillText('f(x) = 4 − x²', PAD_L + 8, PAD_T + 16)
  }, [n, rule])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    let last = performance.now()
    let acc = n
    const tick = (now: number) => {
      const dt = now - last
      last = now
      acc += dt * 0.012
      const next = Math.min(N_MAX, Math.round(acc))
      setN(next)
      if (next >= N_MAX) { setRunning(false); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [running]) // eslint-disable-line react-hooks/exhaustive-deps

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setN(6)
  }

  const estimate = riemann(n, rule)
  const err = Math.abs(estimate - EXACT)
  const dx = (B - A) / n

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Riemann Sum → Integral</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A', aspectRatio: `${W} / ${H}` }} />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>n = <strong className="text-text-primary">{n}</strong></span>
        <span>Δx = <strong className="text-text-primary">{dx.toFixed(4)}</strong></span>
        <span>sum ≈ <strong style={{ color: VIOLET }}>{estimate.toFixed(4)}</strong></span>
        <span>exact = <strong style={{ color: BLUE }}>{EXACT.toFixed(4)}</strong></span>
        <span>error = <strong style={{ color: err < 0.01 ? GREEN : GOLD }}>{err.toFixed(4)}</strong></span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { if (n >= N_MAX) setN(6); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Add rectangles</>}
        </button>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {RULES.map(r => (
            <button key={r.key} onClick={() => { setRule(r.key); setRunning(false) }}
              className={`px-3 py-1.5 transition-colors ${rule === r.key ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>n:</span>
          <input type="range" min={N_MIN} max={N_MAX} step={1} value={n}
            onChange={e => { setN(+e.target.value); setRunning(false) }}
            className="w-28 accent-accent-gold"
          />
          <span className="font-mono text-text-secondary w-8">{n}</span>
        </div>
      </div>
    </div>
  )
}
