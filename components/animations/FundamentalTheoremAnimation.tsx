'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 350
const PAD_L = 44
const PAD_R = 18

// Top panel (f) and bottom panel (A) geometry.
const TOP_T = 20
const TOP_B = 150
const BOT_T = 196
const BOT_B = 326

const VIOLET = '#A78BFA'
const BLUE = '#60A5FA'
const PINK = '#F472B6'
const GOLD = '#F59E0B'

// f(x) = sin(x) on [0, 2π]; accumulation A(x) = ∫₀ˣ sin(t) dt = 1 − cos(x).
// A′(x) = sin(x) = f(x), and on (π, 2π) f < 0 so A decreases. Clean FTC demo.
const X0 = 0
const X1 = 2 * Math.PI
const f = (x: number) => Math.sin(x)
const A = (x: number) => 1 - Math.cos(x)

const F_MAX = 1.35
const A_LO = -0.2
const A_HI = 2.3

const plotW = W - PAD_L - PAD_R
const px = (x: number) => PAD_L + ((x - X0) / (X1 - X0)) * plotW
const pyF = (y: number) => TOP_T + (1 - (y + F_MAX) / (2 * F_MAX)) * (TOP_B - TOP_T)
const pyA = (y: number) => BOT_T + (1 - (y - A_LO) / (A_HI - A_LO)) * (BOT_B - BOT_T)

export function FundamentalTheoremAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const [x, setX] = useState(X0)
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) setX(X1)
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

    ctx.font = '11px monospace'

    // ---- TOP PANEL: f with signed area shaded up to x ----
    // Shade the accumulated signed area column by column.
    const xPix = px(x)
    for (let s = PAD_L; s <= xPix; s++) {
      const xx = X0 + ((s - PAD_L) / plotW) * (X1 - X0)
      const y = f(xx)
      ctx.strokeStyle = y >= 0 ? 'rgba(167,139,250,0.30)' : 'rgba(244,114,182,0.30)'
      ctx.beginPath(); ctx.moveTo(s, pyF(0)); ctx.lineTo(s, pyF(y)); ctx.stroke()
    }

    // Axis (f = 0)
    ctx.strokeStyle = 'rgba(255,245,235,0.28)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(PAD_L, pyF(0)); ctx.lineTo(PAD_L + plotW, pyF(0)); ctx.stroke()

    // f curve
    ctx.beginPath()
    ctx.strokeStyle = BLUE
    ctx.lineWidth = 2.5
    for (let s = 0; s <= plotW; s++) {
      const xx = X0 + (s / plotW) * (X1 - X0)
      const yy = pyF(f(xx))
      if (s === 0) ctx.moveTo(px(xx), yy); else ctx.lineTo(px(xx), yy)
    }
    ctx.stroke()

    // Sweeping vertical line + height marker f(x)
    const fx = f(x)
    ctx.strokeStyle = 'rgba(245,158,11,0.7)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(xPix, TOP_T); ctx.lineTo(xPix, TOP_B); ctx.stroke()
    ctx.setLineDash([])
    // height bar from axis to f(x)
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(xPix, pyF(0)); ctx.lineTo(xPix, pyF(fx)); ctx.stroke()
    ctx.beginPath(); ctx.arc(xPix, pyF(fx), 4, 0, Math.PI * 2)
    ctx.fillStyle = GOLD; ctx.fill()

    ctx.fillStyle = BLUE
    ctx.textAlign = 'left'
    ctx.fillText('f(x) = sin x', PAD_L + 6, TOP_T + 14)
    ctx.fillStyle = GOLD
    ctx.fillText(`height f(x) = ${fx.toFixed(3)}`, PAD_L + 6, TOP_B - 8)

    // ---- BOTTOM PANEL: A(x) = ∫₀ˣ f ----
    // Axis (A = 0)
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PAD_L, pyA(0)); ctx.lineTo(PAD_L + plotW, pyA(0)); ctx.stroke()

    // A curve traced up to x
    ctx.beginPath()
    ctx.strokeStyle = VIOLET
    ctx.lineWidth = 2.5
    let started = false
    for (let s = 0; s <= plotW; s++) {
      const xx = X0 + (s / plotW) * (X1 - X0)
      if (xx > x) break
      const yy = pyA(A(xx))
      if (!started) { ctx.moveTo(px(xx), yy); started = true } else ctx.lineTo(px(xx), yy)
    }
    ctx.stroke()

    // Faint full A curve for reference
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(167,139,250,0.22)'
    ctx.lineWidth = 1.2
    for (let s = 0; s <= plotW; s++) {
      const xx = X0 + (s / plotW) * (X1 - X0)
      const yy = pyA(A(xx))
      if (s === 0) ctx.moveTo(px(xx), yy); else ctx.lineTo(px(xx), yy)
    }
    ctx.stroke()

    // Tangent to A at x, whose slope equals f(x)
    const ax = A(x)
    const slope = fx // A'(x) = f(x)
    const dxw = 0.9
    const p1x = px(x - dxw)
    const p1y = pyA(ax - slope * dxw)
    const p2x = px(x + dxw)
    const p2y = pyA(ax + slope * dxw)
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(p1x, p1y); ctx.lineTo(p2x, p2y); ctx.stroke()

    ctx.beginPath(); ctx.arc(px(x), pyA(ax), 4.5, 0, Math.PI * 2)
    ctx.fillStyle = VIOLET; ctx.fill()

    ctx.fillStyle = VIOLET
    ctx.fillText('A(x) = ∫₀ˣ f', PAD_L + 6, BOT_T + 14)
    ctx.fillStyle = GOLD
    ctx.fillText(`slope A′(x) = ${slope.toFixed(3)}`, PAD_L + 6, BOT_B - 8)

    // x-axis ticks (0, π, 2π)
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.textAlign = 'center'
    ctx.fillText('0', px(0), H - 6)
    ctx.fillText('π', px(Math.PI), H - 6)
    ctx.fillText('2π', px(X1), H - 6)
    ctx.textAlign = 'left'
  }, [x])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running || !visible) return
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      setX(prev => {
        const next = prev + dt * 0.0016
        if (next >= X1) { setRunning(false); return X1 }
        return next
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [running, visible])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setX(X0)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Fundamental Theorem</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Fundamental Theorem. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)', aspectRatio: `${W} / ${H}` }} />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>x = <strong className="text-text-primary">{x.toFixed(3)}</strong></span>
        <span>f(x) = <strong style={{ color: GOLD }}>{f(x).toFixed(3)}</strong></span>
        <span>A(x) = <strong style={{ color: VIOLET }}>{A(x).toFixed(3)}</strong></span>
        <span style={{ color: PINK }}>{f(x) < 0 ? 'f < 0 → A falling' : 'f ≥ 0 → A rising'}</span>
        <span className="text-text-muted">slope of A = height of f</span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { if (x >= X1) setX(X0); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Sweep x</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>x:</span>
          <input type="range" min={X0} max={X1} step={0.01} value={x}
            onChange={e => { setX(+e.target.value); setRunning(false) }}
            className="w-40 accent-accent-gold"
          />
        </label>
      </div>
    </div>
  )
}
