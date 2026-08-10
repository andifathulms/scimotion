'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw, Maximize2 } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 290
const PAD = { left: 52, right: 18, top: 22, bottom: 38 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const A_MAX = 0.95
const P_MAX = 10 // probes shown on the y axis before clipping

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const GREEN = '#10B981'

// Expected probes for an unsuccessful search under uniform hashing.
const openProbes = (a: number) => 1 / (1 - Math.min(a, 0.995))
const chainProbes = (a: number) => 1 + a

type Mode = 'idle' | 'ramp' | 'resize'

export function LoadFactorAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setAlpha(0.9); return }
      setAlpha(0.06)
      setCap(128)
      setMode('ramp')
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [alpha, setAlpha] = useState(0.5)
  const [cap, setCap] = useState(128)
  const [mode, setMode] = useState<Mode>('idle')
  const [flash, setFlash] = useState(0)
  const alphaRef = useRef(alpha)
  useEffect(() => { alphaRef.current = alpha }, [alpha])

  const x = useCallback((a: number) => PAD.left + (a / 1) * PLOT_W, [])
  const y = useCallback(
    (p: number) => PAD.top + PLOT_H - ((Math.min(p, P_MAX) - 1) / (P_MAX - 1)) * PLOT_H,
    []
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // ---- axes + gridlines ----
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()

    ctx.font = '10px monospace'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    for (const p of [1, 2, 4, 6, 8, 10]) {
      const yy = y(p)
      ctx.strokeStyle = 'rgba(255,245,235,0.06)'
      ctx.beginPath()
      ctx.moveTo(PAD.left, yy)
      ctx.lineTo(PAD.left + PLOT_W, yy)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.fillText(String(p), PAD.left - 8, yy)
    }
    ctx.textAlign = 'center'
    for (const a of [0, 0.25, 0.5, 0.75, 1]) {
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.fillText(a.toFixed(2), x(a), PAD.top + PLOT_H + 14)
    }
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('expected probes', PAD.left - 44, PAD.top - 12)
    ctx.textAlign = 'right'
    ctx.fillText('load factor α = n / capacity', PAD.left + PLOT_W, PAD.top + PLOT_H + 30)
    ctx.textAlign = 'left'

    // ---- the α = 1 wall ----
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = `${PINK}66`
    ctx.beginPath()
    ctx.moveTo(x(1), PAD.top)
    ctx.lineTo(x(1), PAD.top + PLOT_H)
    ctx.stroke()
    ctx.setLineDash([])

    // ---- chaining: 1 + α ----
    ctx.strokeStyle = BLUE
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i <= 200; i++) {
      const a = i / 200
      const px = x(a)
      const py = y(chainProbes(a))
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // ---- open addressing: 1 / (1 - α) ----
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2.5
    ctx.beginPath()
    let started = false
    for (let i = 0; i <= 240; i++) {
      const a = (i / 240) * 0.995
      const p = openProbes(a)
      if (p > P_MAX) break
      const px = x(a)
      const py = y(p)
      if (!started) { ctx.moveTo(px, py); started = true } else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // ---- current α marker ----
    const ax = x(alpha)
    const op = openProbes(alpha)
    const cp = chainProbes(alpha)
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(255,245,235,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(ax, PAD.top)
    ctx.lineTo(ax, PAD.top + PLOT_H)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = GOLD
    ctx.beginPath(); ctx.arc(ax, y(op), 4.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = BLUE
    ctx.beginPath(); ctx.arc(ax, y(cp), 4, 0, Math.PI * 2); ctx.fill()

    ctx.font = 'bold 11px monospace'
    const lx = Math.min(ax + 10, W - 168)
    ctx.fillStyle = GOLD
    ctx.fillText(`open addressing: ${op.toFixed(1)} probes`, lx, Math.max(y(op) - 12, PAD.top + 10))
    ctx.fillStyle = BLUE
    ctx.fillText(`chaining: ${cp.toFixed(2)} probes`, lx, y(cp) + 16)

    // ---- readout ----
    const n = Math.round(alpha * cap)
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText(`n = ${n} entries · capacity = ${cap} · α = ${alpha.toFixed(3)}`, PAD.left, 12)

    // ---- rehash flash ----
    if (flash > 0) {
      ctx.globalAlpha = Math.min(1, flash)
      ctx.fillStyle = `${GREEN}18`
      ctx.fillRect(PAD.left, PAD.top, PLOT_W, PLOT_H)
      ctx.fillStyle = GREEN
      ctx.font = 'bold 13px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`REHASH — capacity ${cap}, α halved`, PAD.left + PLOT_W / 2, PAD.top + 22)
      ctx.textAlign = 'left'
      ctx.globalAlpha = 1
    }

    // ---- danger zone label ----
    if (alpha > 0.8) {
      ctx.font = '10px monospace'
      ctx.fillStyle = PINK
      ctx.textAlign = 'right'
      ctx.fillText('table nearly full → probes blow up', x(1) - 6, PAD.top + PLOT_H - 10)
      ctx.textAlign = 'left'
    }

    // ---- legend ----
    ctx.font = '10px monospace'
    ctx.fillStyle = VIOLET
    ctx.fillText('1/(1−α)', x(0.86), y(P_MAX) + 4)
  }, [alpha, cap, flash, x, y])

  useEffect(() => { draw() }, [draw])

  // ramp α upward until it hits the danger zone, then rehash
  useEffect(() => {
    if (mode !== 'ramp') return
    const id = setInterval(() => {
      setAlpha(a => {
        if (a >= 0.9) { setMode('resize'); return a }
        return Math.min(0.9, a + 0.01)
      })
    }, 45)
    return () => clearInterval(id)
  }, [mode])

  // animate the resize: capacity doubles, α halves
  useEffect(() => {
    if (mode !== 'resize') return
    let raf = 0
    const from = alphaRef.current
    const to = from / 2
    const t0 = performance.now()
    setCap(c => c * 2)
    setFlash(1)
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700)
      setAlpha(from + (to - from) * k)
      setFlash(1 - k * 0.7)
      if (k < 1) raf = requestAnimationFrame(step)
      else { setFlash(0); setMode('idle') }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // alphaRef is a ref; re-running on alpha would restart the tween
  }, [mode])

  const resetAll = () => {
    triggerReset()
    setMode('idle')
    setFlash(0)
    setCap(128)
    setAlpha(0.5)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Probes vs load factor</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Probes vs load factor. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setMode('ramp')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          <Play size={12} /> Fill it up
        </button>
        <button
          onClick={() => setMode('resize')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors"
        >
          <Maximize2 size={12} /> Resize ×2
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>α:</span>
          <input
            type="range" min={0.02} max={A_MAX} step={0.01} value={alpha}
            onChange={e => { setMode('idle'); setAlpha(+e.target.value) }}
            className="w-40 accent-accent-blue"
          />
          <span className="text-text-secondary font-medium">{alpha.toFixed(2)}</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary">
          capacity <strong className="text-accent-gold">{cap}</strong>
          <span className="ml-3">worst probes ≈ {openProbes(alpha) >= P_MAX ? '∞' : openProbes(alpha).toFixed(1)}</span>
        </span>
      </div>
    </div>
  )
}
