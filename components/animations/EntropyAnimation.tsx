'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 280
const PAD = 10
const R = 3

type Particle = { x: number; y: number; vx: number; vy: number }

// Particles all start crammed into the bottom-left corner of the box.
function makeParticles(n: number): Particle[] {
  const boxW = (W - 2 * PAD) * 0.22
  const boxH = (H - 2 * PAD) * 0.3
  return Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2
    const s = 1.1 + Math.random() * 0.9
    return {
      x: PAD + R + Math.random() * boxW,
      y: H - PAD - R - Math.random() * boxH,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
    }
  })
}

// Boltzmann entropy of the left/right split, in units of k_B:
// S = ln W, with W = N! / (nL! nR!) computed via log-gamma for stability.
function lnFactorial(n: number): number {
  if (n < 2) return 0
  // Stirling with correction terms — accurate to ~1e-8 for n >= 2.
  return (
    n * Math.log(n) -
    n +
    0.5 * Math.log(2 * Math.PI * n) +
    1 / (12 * n) -
    1 / (360 * n * n * n)
  )
}

function entropy(nL: number, total: number): number {
  return lnFactorial(total) - lnFactorial(nL) - lnFactorial(total - nL)
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  count: { default: 160, min: 20, max: 400, step: 20 },
}

export function EntropyAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  const { params, set, permalink, isDefault, restored } = useWidgetParams('entropy', SPEC)
  const { count } = params
  const [running, setRunning] = useState(false)
  const [split, setSplit] = useState({ left: 160, right: 0 })

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // Box walls
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(PAD, PAD, W - 2 * PAD, H - 2 * PAD)

    // Dividing line (bookkeeping only — particles pass freely)
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.lineWidth = 1
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.moveTo(W / 2, PAD)
    ctx.lineTo(W / 2, H - PAD)
    ctx.stroke()
    ctx.setLineDash([])

    const ps = particlesRef.current
    let nL = 0
    ps.forEach(p => {
      if (p.x < W / 2) nL += 1
      ctx.beginPath()
      ctx.arc(p.x, p.y, R, 0, Math.PI * 2)
      ctx.fillStyle = p.x < W / 2 ? '#10B981' : '#60A5FA'
      ctx.fill()
    })
    const nR = ps.length - nL

    // Half-occupancy bars along the top
    const total = ps.length || 1
    const barY = PAD + 8
    const halfW = W / 2 - PAD - 14
    ctx.fillStyle = 'rgba(16,185,129,0.22)'
    ctx.fillRect(PAD + 7, barY, halfW * (nL / total), 6)
    ctx.fillStyle = 'rgba(96,165,250,0.22)'
    ctx.fillRect(W / 2 + 7, barY, halfW * (nR / total), 6)

    ctx.font = '11px monospace'
    ctx.fillStyle = '#10B981'
    ctx.fillText(`left ${nL}`, PAD + 7, barY + 22)
    ctx.fillStyle = '#60A5FA'
    ctx.fillText(`right ${nR}`, W / 2 + 7, barY + 22)

    // Entropy readouts
    const S = entropy(nL, total)
    const Smax = entropy(Math.round(total / 2), total)
    ctx.fillStyle = '#F59E0B'
    ctx.font = 'bold 11px monospace'
    ctx.fillText(`S / k_B = ${S.toFixed(2)}`, PAD + 7, H - PAD - 20)
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '10px monospace'
    ctx.fillText(`S_max = ${Smax.toFixed(2)}`, PAD + 7, H - PAD - 7)

    // Entropy meter
    const meterW = 150
    const mx = W - PAD - 8 - meterW
    const my = H - PAD - 18
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(mx, my, meterW, 8)
    ctx.fillStyle = '#F59E0B'
    ctx.fillRect(mx, my, meterW * (Smax > 0 ? S / Smax : 0), 8)

    return { nL, nR }
  }, [])

  const init = useCallback(
    (n: number) => {
      particlesRef.current = makeParticles(n)
      setSplit({ left: n, right: 0 })
      draw()
    },
    [draw]
  )

  useEffect(() => {
    init(count)
  }, [count, init])

  useEffect(() => {
    if (!running) return
    let frame = 0
    const tick = () => {
      particlesRef.current.forEach(p => {
        p.x += p.vx
        p.y += p.vy
        if (p.x < PAD + R) { p.x = PAD + R; p.vx = -p.vx }
        if (p.x > W - PAD - R) { p.x = W - PAD - R; p.vx = -p.vx }
        if (p.y < PAD + R) { p.y = PAD + R; p.vy = -p.vy }
        if (p.y > H - PAD - R) { p.y = H - PAD - R; p.vy = -p.vy }
        // Small random deflection stands in for particle–particle collisions.
        const a = (Math.random() - 0.5) * 0.35
        const nvx = p.vx * Math.cos(a) - p.vy * Math.sin(a)
        const nvy = p.vx * Math.sin(a) + p.vy * Math.cos(a)
        p.vx = nvx
        p.vy = nvy
      })
      const r = draw()
      frame += 1
      if (r && frame % 6 === 0) setSplit({ left: r.nL, right: r.nR })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    init(count)
  }

  const total = split.left + split.right || 1
  const S = entropy(split.left, total)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Gas expanding into a box</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Gas expanding into a box. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-teal text-bg-base text-xs font-medium hover:bg-accent-teal/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Particles:</span>
          <input
            type="range" min={SPEC.count.min} max={SPEC.count.max} step={SPEC.count.step} value={count}
            onChange={e => { setRunning(false); set('count', +e.target.value) }}
            className="w-28 accent-accent-teal"
          />
          <span className="font-mono text-text-secondary">{count}</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          {split.left} | {split.right} · S/k<sub>B</sub> = {S.toFixed(2)}
        </span>
      </div>
    </div>
  )
}
