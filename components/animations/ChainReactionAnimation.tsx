'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'

const W = 600
const H = 260

// Left panel: the reactor volume with fissile nuclei + a swarm of neutrons.
const BOX = { x: 14, y: 22, w: 186, h: 212 }
// Right panel: neutron population vs generation, log-scaled.
const GR = { x: 244, y: 26, w: 342, h: 190 }
const N0 = 20 // starting neutrons
const N_CAP = 20000 // clamp explosive growth
const MAX_GEN = 46
const DECADES = 4.3 // log10(20000) ≈ 4.30

const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const PINK = '#F472B6'

// Fixed fissile-nucleus positions (deterministic, drawn faint).
const FISSILE = Array.from({ length: 22 }, (_, i) => ({
  x: BOX.x + 20 + (i % 5) * ((BOX.w - 40) / 4),
  y: BOX.y + 24 + Math.floor(i / 5) * ((BOX.h - 48) / 4),
}))

// Sample the next-generation count so the expectation equals k. For small
// populations we simulate each neutron (integer offspring, Bernoulli on the
// fractional part) so subcritical dies out stochastically; for large ones we
// scale directly with a little noise.
function nextPopulation(n: number, k: number): number {
  if (n <= 0) return 0
  if (n <= 80) {
    const base = Math.floor(k)
    const frac = k - base
    let total = 0
    for (let i = 0; i < n; i++) {
      total += base + (Math.random() < frac ? 1 : 0)
    }
    return total
  }
  const noisy = n * k * (0.96 + 0.08 * Math.random())
  return Math.min(N_CAP, Math.round(noisy))
}

const logY = (n: number) => {
  const v = Math.max(0.6, n)
  return GR.y + GR.h - (Math.log10(v) / DECADES) * GR.h
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  k: { default: 1.15, min: 0.7, max: 1.5, step: 0.01 },
}

export function ChainReactionAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      historyRef.current = [N0]
      setHistory([N0])
      if (reduced) { setRunning(false); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { params, set } = useWidgetParams('chain-reaction', SPEC)
  const { k } = params
  const [history, setHistory] = useState<number[]>([N0])
  const [running, setRunning] = useState(false)
  const historyRef = useRef<number[]>([N0])
  const kRef = useRef(k)
  useEffect(() => { kRef.current = k }, [k])

  const status =
    k < 0.98 ? { label: 'Subcritical (k < 1)', color: BLUE }
      : k > 1.02 ? { label: 'Supercritical (k > 1)', color: PINK }
        : { label: 'Critical (k ≈ 1)', color: GOLD }
  const current = history[history.length - 1]

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // ---- reactor box ----
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(BOX.x, BOX.y, BOX.w, BOX.h)
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '10px monospace'
    ctx.fillText('reactor volume', BOX.x + 2, BOX.y - 7)

    // fissile nuclei
    for (const f of FISSILE) {
      ctx.fillStyle = 'rgba(16,185,129,0.28)'
      ctx.beginPath(); ctx.arc(f.x, f.y, 4, 0, Math.PI * 2); ctx.fill()
    }

    // neutron swarm — count reflects the current population (capped for drawing)
    const shown = Math.min(current, 110)
    for (let i = 0; i < shown; i++) {
      const nx = BOX.x + 8 + Math.random() * (BOX.w - 16)
      const ny = BOX.y + 8 + Math.random() * (BOX.h - 16)
      ctx.fillStyle = status.color
      ctx.beginPath(); ctx.arc(nx, ny, 1.7, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = status.color
    ctx.font = 'bold 11px monospace'
    ctx.fillText(`${current.toLocaleString()} neutrons`, BOX.x + 6, BOX.y + BOX.h - 8)

    // ---- population graph ----
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(GR.x, GR.y)
    ctx.lineTo(GR.x, GR.y + GR.h)
    ctx.lineTo(GR.x + GR.w, GR.y + GR.h)
    ctx.stroke()

    // log decade gridlines
    ctx.font = '9px monospace'
    ctx.textAlign = 'right'
    for (const p of [0, 1, 2, 3, 4]) {
      const y = GR.y + GR.h - (p / DECADES) * GR.h
      if (y < GR.y) continue
      ctx.setLineDash([2, 3])
      ctx.strokeStyle = 'rgba(255,245,235,0.08)'
      ctx.beginPath(); ctx.moveTo(GR.x, y); ctx.lineTo(GR.x + GR.w, y); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.fillText(`10${['⁰', '¹', '²', '³', '⁴'][p]}`, GR.x - 5, y + 3)
    }
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '10px monospace'
    ctx.fillText('neutron population', GR.x + 2, GR.y - 7)
    ctx.fillText('generation →', GR.x + GR.w - 78, GR.y + GR.h + 16)

    // starting-level reference
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(245,158,11,0.3)'
    ctx.beginPath(); ctx.moveTo(GR.x, logY(N0)); ctx.lineTo(GR.x + GR.w, logY(N0)); ctx.stroke()
    ctx.setLineDash([])

    // population curve
    const gx = (g: number) => GR.x + (g / MAX_GEN) * GR.w
    ctx.strokeStyle = status.color
    ctx.lineWidth = 2.5
    ctx.beginPath()
    history.forEach((n, g) => {
      const px = gx(g)
      const py = n <= 0 ? GR.y + GR.h : logY(n)
      if (g === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    })
    ctx.stroke()

    // head marker
    const hg = history.length - 1
    const hy = current <= 0 ? GR.y + GR.h : logY(current)
    ctx.fillStyle = status.color
    ctx.beginPath(); ctx.arc(gx(hg), hy, 3.5, 0, Math.PI * 2); ctx.fill()
  }, [history, current, status.color])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    let raf = 0
    const step = () => {
      const hist = historyRef.current
      const last = hist[hist.length - 1]
      const next = nextPopulation(last, kRef.current)
      const updated = [...hist, next]
      historyRef.current = updated
      setHistory(updated)
      if (next <= 0 || next >= N_CAP || updated.length > MAX_GEN) {
        setRunning(false)
        return
      }
      raf = requestAnimationFrame(() => setTimeout(step, 420))
    }
    raf = requestAnimationFrame(() => setTimeout(step, 420))
    return () => cancelAnimationFrame(raf)
  }, [running])

  const restart = () => {
    historyRef.current = [N0]
    setHistory([N0])
    setRunning(true)
  }

  const reset = () => {
    triggerReset()
    setRunning(false)
    historyRef.current = [N0]
    setHistory([N0])
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Fission chain reaction</span>
        <button onClick={reset} className="text-xs text-text-muted hover:text-text-secondary transition-colors">Reset</button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={restart} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-teal text-bg-base text-xs font-medium hover:opacity-90 transition-opacity">
          <Play size={12} /> Run
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>k:</span>
          <input
            type="range" min={SPEC.k.min} max={SPEC.k.max} step={SPEC.k.step} value={k}
            onChange={e => set('k', +e.target.value)}
            className="w-40 accent-accent-teal"
          />
          <span className="font-mono font-medium" style={{ color: status.color }}>{k.toFixed(2)}</span>
        </label>
        <span className="ml-auto text-xs font-mono font-medium" style={{ color: status.color }}>{status.label}</span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Each fission releases neutrons; on average <strong className="font-mono" style={{ color: status.color }}>k</strong> of them
        trigger a new fission. k &lt; 1 dies out, k = 1 holds steady, k &gt; 1 grows exponentially. A working reactor is
        held precisely at <strong className="text-accent-gold font-mono">k = 1</strong>.
      </p>
    </div>
  )
}
