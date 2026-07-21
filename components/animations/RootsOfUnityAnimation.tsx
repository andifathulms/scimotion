'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340
const CX = 170
const CY = H / 2
const R = 120

const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

// Screen coords for a point at angle a (counterclockwise from +Re axis).
const sx = (a: number) => CX + R * Math.cos(a)
const sy = (a: number) => CY - R * Math.sin(a)

export function RootsOfUnityAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [n, setN] = useState(6)
  const nRef = useRef(n)
  const rafRef = useRef<number>(0)
  const progRef = useRef(0) // how far the walk has advanced, in units of steps (0..n)
  const [running, setRunning] = useState(false)

  useEffect(() => { nRef.current = n }, [n])

  const draw = useCallback((count: number, prog: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    const step = (2 * Math.PI) / count

    // Grid
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    ctx.lineWidth = 1
    for (let gx = CX % 30; gx <= 2 * CX + 10; gx += 30) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke() }
    for (let gy = CY % 30; gy <= H; gy += 30) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(2 * CX + 10, gy); ctx.stroke() }

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(CX - R - 24, CY); ctx.lineTo(CX + R + 24, CY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(CX, CY - R - 24); ctx.lineTo(CX, CY + R + 24); ctx.stroke()
    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.font = '10px monospace'
    ctx.fillText('Re', CX + R + 6, CY - 6)
    ctx.fillText('Im', CX + 6, CY - R - 8)

    // Unit circle
    ctx.beginPath()
    ctx.arc(CX, CY, R, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(167,139,250,0.35)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // The regular n-gon connecting the roots
    ctx.beginPath()
    for (let k = 0; k < count; k++) {
      const a = k * step
      if (k === 0) ctx.moveTo(sx(a), sy(a)); else ctx.lineTo(sx(a), sy(a))
    }
    ctx.closePath()
    ctx.strokeStyle = 'rgba(96,165,250,0.35)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Completed walk chords (from 1, multiplying by omega each step)
    const done = Math.floor(prog)
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sx(0), sy(0))
    for (let s = 1; s <= done; s++) ctx.lineTo(sx(s * step), sy(s * step))
    // partial chord in progress
    const frac = prog - done
    if (frac > 0 && done < count) {
      const a = (done + frac) * step
      ctx.lineTo(sx(a), sy(a))
    }
    ctx.stroke()

    // Root markers
    for (let k = 0; k < count; k++) {
      const a = k * step
      const isOne = k === 0
      const reached = k <= done
      ctx.beginPath()
      ctx.arc(sx(a), sy(a), isOne ? 6 : 5, 0, Math.PI * 2)
      ctx.fillStyle = isOne ? GREEN : reached ? GOLD : VIOLET
      ctx.fill()
      if (isOne) {
        ctx.fillStyle = GREEN
        ctx.font = 'bold 11px monospace'
        ctx.fillText('1', sx(a) + 9, sy(a) + 4)
      }
    }

    // omega label (first primitive root, k = 1)
    if (count > 1) {
      const a1 = step
      ctx.fillStyle = VIOLET
      ctx.font = 'bold 11px monospace'
      ctx.fillText('ω', sx(a1) + 9, sy(a1) - 6)
    }

    // The travelling point
    const walkAngle = prog * step
    const wx = sx(walkAngle), wy = sy(walkAngle)
    ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(wx, wy)
    ctx.strokeStyle = 'rgba(245,158,11,0.6)'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.beginPath(); ctx.arc(wx, wy, 5.5, 0, Math.PI * 2); ctx.fillStyle = GOLD; ctx.fill()

    // Right panel: the current power ωᵏ
    const panelX = 2 * CX + 30
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(panelX - 18, 24); ctx.lineTo(panelX - 18, H - 24); ctx.stroke()
    ctx.fillStyle = 'rgba(255,245,235,0.55)'
    ctx.font = '11px monospace'
    ctx.fillText('ωᵏ = e^(2πik/n)', panelX, 44)
    ctx.fillStyle = VIOLET
    ctx.font = 'bold 13px monospace'
    ctx.fillText(`n = ${count}`, panelX, 74)
    ctx.fillStyle = GOLD
    ctx.fillText(`k = ${Math.min(done, count)}`, panelX, 100)
    ctx.fillStyle = 'rgba(255,245,235,0.75)'
    ctx.font = '11px monospace'
    ctx.fillText(`angle = ${done} · 360°/${count}`, panelX, 126)
    ctx.fillText(`      = ${Math.round((done * 360) / count)}°`, panelX, 144)
    if (done >= count) {
      ctx.fillStyle = GREEN
      ctx.font = 'bold 12px monospace'
      ctx.fillText('ωⁿ = 1  ✓', panelX, 176)
      ctx.font = '10px monospace'
      ctx.fillText('back to the start', panelX, 194)
    } else {
      ctx.fillStyle = 'rgba(255,245,235,0.45)'
      ctx.font = '10px monospace'
      ctx.fillText('each ×ω turns by', panelX, 172)
      ctx.fillText(`360°/${count} = ${Math.round(360 / count)}°`, panelX, 188)
    }
  }, [])

  useEffect(() => {
    if (!running) { draw(n, progRef.current); return }
    let last = performance.now()
    const speed = 1.1 // steps per second
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      progRef.current = Math.min(nRef.current, progRef.current + speed * dt)
      draw(nRef.current, progRef.current)
      if (progRef.current >= nRef.current) { setRunning(false); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, n, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { progRef.current = 0; draw(nRef.current, 0); return }
      progRef.current = 0
      setRunning(true)
    },
  })

  const startWalk = () => {
    if (progRef.current >= nRef.current) progRef.current = 0
    setRunning(r => !r)
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    progRef.current = 0
    setRunning(false)
    triggerReset()
    draw(nRef.current, 0)
  }

  const changeN = (v: number) => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    progRef.current = 0
    setN(v)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Roots of unity</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls">
        <button onClick={startWalk}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-violet text-bg-base text-xs font-medium hover:bg-accent-violet/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Walk ωᵏ</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>n:</span>
          <input type="range" min={2} max={12} step={1} value={n}
            onChange={e => changeN(+e.target.value)}
            className="w-40 accent-accent-violet" />
          <span className="font-mono">{n}</span>
        </div>
        <span className="ml-auto font-mono text-xs" style={{ color: VIOLET }}>
          n points, spaced 360°/n apart
        </span>
      </div>
    </div>
  )
}
