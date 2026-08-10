'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340
const CX = W / 2
const CY = H / 2
const S = 32          // pixels per unit
const N = 32          // number of probe vectors around the circle
const ALIGN_TOL = 0.05

type Vec = [number, number]

type Eigen = {
  real: boolean
  l1: number
  l2: number
  im: number
  v1: Vec | null
  v2: Vec | null
}

function normalize(v: Vec): Vec {
  const m = Math.hypot(v[0], v[1])
  return m < 1e-12 ? [1, 0] : [v[0] / m, v[1] / m]
}

function eigenvectorFor(a: number, b: number, c: number, d: number, l: number): Vec {
  if (Math.abs(b) > 1e-9) return normalize([b, l - a])
  if (Math.abs(c) > 1e-9) return normalize([l - d, c])
  // Already triangular/diagonal: the eigenvectors are the axes.
  return Math.abs(l - a) <= Math.abs(l - d) ? [1, 0] : [0, 1]
}

function eigen(a: number, b: number, c: number, d: number): Eigen {
  const tr = a + d
  const det = a * d - b * c
  const disc = tr * tr - 4 * det
  if (disc >= 0) {
    const s = Math.sqrt(disc)
    const l1 = (tr + s) / 2
    const l2 = (tr - s) / 2
    return {
      real: true,
      l1,
      l2,
      im: 0,
      v1: eigenvectorFor(a, b, c, d, l1),
      v2: eigenvectorFor(a, b, c, d, l2),
    }
  }
  return { real: false, l1: tr / 2, l2: tr / 2, im: Math.sqrt(-disc) / 2, v1: null, v2: null }
}

function arrow(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  color: string, width: number, head: number
) {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
  const ang = Math.atan2(y1 - y0, x1 - x0)
  if (Math.hypot(x1 - x0, y1 - y0) < 3) return
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 - head * Math.cos(ang - 0.4), y1 - head * Math.sin(ang - 0.4))
  ctx.lineTo(x1 - head * Math.cos(ang + 0.4), y1 - head * Math.sin(ang + 0.4))
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

const PRESETS: { name: string; m: [number, number, number, number] }[] = [
  { name: 'Shear + stretch', m: [2, 1, 1, 2] },
  { name: 'Pure rotation 90°', m: [0, -1, 1, 0] },
  { name: 'Axis stretch', m: [2, 0, 0, 0.5] },
  { name: 'Shear', m: [1, 1, 0, 1] },
]

export function EigenvectorAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0)
  const [running, setRunning] = useState(false)
  const [t, setT] = useState(0)
  const [a, setA] = useState(2)
  const [b, setB] = useState(1)
  const [c, setC] = useState(1)
  const [d, setD] = useState(2)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setT(1); return }
      setRunning(true)
    },
  })

  const draw = useCallback((tt: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const e = eigen(a, b, c, d)

    // Faint background grid
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    ctx.lineWidth = 1
    for (let gx = -8; gx <= 8; gx++) {
      const px = CX + gx * S
      if (px < 0 || px > W) continue
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke()
    }
    for (let gy = -5; gy <= 5; gy++) {
      const py = CY + gy * S
      if (py < 0 || py > H) continue
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke()
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, CY); ctx.lineTo(W, CY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(CX, 0); ctx.lineTo(CX, H); ctx.stroke()

    // Unit circle (where every probe vector starts)
    ctx.beginPath()
    ctx.arc(CX, CY, S, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,245,235,0.16)'
    ctx.lineWidth = 1.2
    ctx.stroke()

    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, W, H)
    ctx.clip()

    // Eigen-spans (the invariant lines), drawn behind the vectors
    if (e.real) {
      const spans: [Vec | null, string][] = [[e.v1, '#F59E0B'], [e.v2, '#60A5FA']]
      for (const [v, col] of spans) {
        if (!v) continue
        ctx.beginPath()
        ctx.setLineDash([5, 5])
        ctx.strokeStyle = col + '55'
        ctx.lineWidth = 1.4
        ctx.moveTo(CX - v[0] * 400, CY + v[1] * 400)
        ctx.lineTo(CX + v[0] * 400, CY - v[1] * 400)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // Probe vectors and their images
    for (let k = 0; k < N; k++) {
      const th = (k / N) * Math.PI * 2
      const vx = Math.cos(th)
      const vy = Math.sin(th)
      const wx = a * vx + b * vy
      const wy = c * vx + d * vy
      const wm = Math.hypot(wx, wy)

      // How far off its own span did the vector get pushed?
      const cross = Math.abs(vx * wy - vy * wx)
      const align = wm < 1e-9 ? 0 : cross / wm
      const isEigen = e.real && align < ALIGN_TOL

      const mx = vx + (wx - vx) * tt
      const my = vy + (wy - vy) * tt

      // Ghost of the original vector
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      ctx.lineTo(CX + vx * S, CY - vy * S)
      ctx.strokeStyle = 'rgba(255,245,235,0.12)'
      ctx.lineWidth = 1
      ctx.stroke()

      const col = isEigen ? '#F59E0B' : `rgba(167,139,250,${0.35 + 0.45 * (1 - Math.min(1, align))})`
      arrow(ctx, CX, CY, CX + mx * S, CY - my * S, col, isEigen ? 2.6 : 1.5, isEigen ? 9 : 6)

      if (isEigen) {
        ctx.beginPath()
        ctx.arc(CX + mx * S, CY - my * S, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#F59E0B'
        ctx.fill()
        // Halo
        ctx.beginPath()
        ctx.arc(CX + mx * S, CY - my * S, 9, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(245,158,11,0.35)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }
    ctx.restore()

    // Readout
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.55)'
    ctx.fillText(`A = [ ${a.toFixed(1)}  ${b.toFixed(1)} ]`, 12, 20)
    ctx.fillText(`    [ ${c.toFixed(1)}  ${d.toFixed(1)} ]`, 12, 34)
    ctx.fillText(`det = ${(a * d - b * c).toFixed(2)}   tr = ${(a + d).toFixed(2)}`, 12, 52)

    if (e.real) {
      ctx.fillStyle = '#F59E0B'
      ctx.fillText(`λ₁ = ${e.l1.toFixed(3)}`, 12, H - 30)
      ctx.fillStyle = '#60A5FA'
      ctx.fillText(`λ₂ = ${e.l2.toFixed(3)}`, 12, H - 14)
    } else {
      ctx.fillStyle = '#F472B6'
      ctx.fillText(`λ = ${e.l1.toFixed(3)} ± ${e.im.toFixed(3)}i`, 12, H - 30)
      ctx.fillText('no real eigenvector — every vector rotates', 12, H - 14)
    }

    ctx.fillStyle = 'rgba(255,245,235,0.35)'
    ctx.font = '10px monospace'
    ctx.fillText(`v → Av   (${(tt * 100).toFixed(0)}%)`, W - 130, 20)
  }, [a, b, c, d])

  useEffect(() => {
    if (!running) return
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      phaseRef.current += dt * 0.35
      const tt = 0.5 - 0.5 * Math.cos(phaseRef.current * Math.PI * 2)
      setT(tt)
      draw(tt)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  // Static redraw whenever the matrix or the slider changes while paused.
  useEffect(() => {
    if (!running) draw(t)
  }, [running, t, draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    phaseRef.current = 0
    setRunning(false)
    setT(0)
    setA(2); setB(1); setC(1); setD(2)
    triggerReset()
  }

  const e = eigen(a, b, c, d)

  const slider = (label: string, value: number, set: (n: number) => void) => (
    <div className="flex items-center gap-1.5 text-xs text-text-muted">
      <span className="font-mono">{label}:</span>
      <input type="range" min={-2.5} max={2.5} step={0.1} value={value}
        onChange={ev => { setRunning(false); set(+ev.target.value) }}
        className="w-16 accent-accent-violet" />
      <span className="font-mono w-8">{value.toFixed(1)}</span>
    </div>
  )

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Eigenvectors of a 2×2 matrix</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>v → Av:</span>
          <input type="range" min={0} max={1} step={0.01} value={t}
            onChange={ev => { setRunning(false); setT(+ev.target.value) }}
            className="w-20 accent-accent-gold" />
        </div>
        {slider('a', a, setA)}
        {slider('b', b, setB)}
        {slider('c', c, setC)}
        {slider('d', d, setD)}
        <select
          value={`${a},${b},${c},${d}`}
          onChange={ev => {
            const [na, nb, nc, nd] = ev.target.value.split(',').map(Number)
            setRunning(false); setA(na); setB(nb); setC(nc); setD(nd)
          }}
          className="px-2 py-1.5 rounded-lg border border-border bg-bg-surface text-xs text-text-secondary">
          {PRESETS.map(p => (
            <option key={p.name} value={p.m.join(',')}>{p.name}</option>
          ))}
          <option value={`${a},${b},${c},${d}`}>custom</option>
        </select>
        <span className="ml-auto font-mono text-xs" style={{ color: e.real ? '#F59E0B' : '#F472B6' }}>
          {e.real
            ? `λ = ${e.l1.toFixed(2)}, ${e.l2.toFixed(2)}`
            : `λ = ${e.l1.toFixed(2)} ± ${e.im.toFixed(2)}i`}
        </span>
      </div>
    </div>
  )
}
