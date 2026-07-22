'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 330
const CX = W / 2
const CY = H / 2
const PX = 58 // screen pixels per comoving unit at scale factor a = 1
const A_MIN = 1
const A_MAX = 2.4
const GROW_RATE = 0.28 // change in a per second
const COLS = 6
const ROWS = 4

const PALETTE = ['#818CF8', '#60A5FA', '#A78BFA', '#F472B6', '#22D3EE', '#10B981', '#F59E0B']

type Galaxy = { gx: number; gy: number; hue: string; rad: number; tilt: number }

// Galaxies sit at fixed COMOVING coordinates on a grid (with a little scatter).
// They never move through the grid — the grid itself stretches as a(t) grows.
function makeGalaxies(): Galaxy[] {
  const gs: Galaxy[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const gx = c - (COLS - 1) / 2 + (Math.random() - 0.5) * 0.4
      const gy = r - (ROWS - 1) / 2 + (Math.random() - 0.5) * 0.4
      gs.push({
        gx,
        gy,
        hue: PALETTE[(r * COLS + c) % PALETTE.length],
        rad: 3 + Math.random() * 2.4,
        tilt: Math.random() * Math.PI,
      })
    }
  }
  return gs
}

export function ExpandingUniverseAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        aRef.current = 1.7
        draw()
        return
      }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number | null>(null)
  const aRef = useRef(A_MIN)
  const galaxiesRef = useRef<Galaxy[]>([])
  if (galaxiesRef.current.length === 0) galaxiesRef.current = makeGalaxies()

  const [running, setRunning] = useState(false)
  // Default "home" = the galaxy nearest the comoving origin.
  const [home, setHome] = useState(() => {
    const gs = galaxiesRef.current
    let best = 0
    let bestD = Infinity
    gs.forEach((g, i) => {
      const d = g.gx * g.gx + g.gy * g.gy
      if (d < bestD) { bestD = d; best = i }
    })
    return best
  })

  // Screen position of galaxy i, with the chosen home pinned to canvas centre.
  const screenOf = useCallback((i: number, a: number, homeIdx: number) => {
    const gs = galaxiesRef.current
    const h = gs[homeIdx]
    const g = gs[i]
    return {
      x: CX + a * (g.gx - h.gx) * PX,
      y: CY + a * (g.gy - h.gy) * PX,
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const gs = galaxiesRef.current
    const h = gs[home]
    const a = aRef.current
    ctx.clearRect(0, 0, W, H)

    // The stretching comoving grid — space itself, expanding by the factor a.
    ctx.strokeStyle = 'rgba(129,140,248,0.13)'
    ctx.lineWidth = 1
    for (let cx = -4; cx <= 4; cx++) {
      const x = CX + a * (cx - h.gx) * PX
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    }
    for (let cy = -3; cy <= 3; cy++) {
      const y = CY + a * (cy - h.gy) * PX
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }

    // Recession arrows: length is proportional to distance from home, so this
    // IS Hubble's law drawn — twice as far, twice as fast — from this vantage.
    for (let i = 0; i < gs.length; i++) {
      if (i === home) continue
      const p = screenOf(i, a, home)
      const dx = p.x - CX
      const dy = p.y - CY
      const d = Math.hypot(dx, dy)
      if (d < 6) continue
      const ux = dx / d
      const uy = dy / d
      const len = Math.min(d * 0.34, 90)
      const ax = p.x + ux * len
      const ay = p.y + uy * len
      const op = 0.2 + Math.min(0.6, d / 320)
      ctx.strokeStyle = `rgba(129,140,248,${op.toFixed(2)})`
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ax, ay); ctx.stroke()
      // arrowhead
      const wing = 4.5
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(ax - ux * 7 - uy * wing, ay - uy * 7 + ux * wing)
      ctx.lineTo(ax - ux * 7 + uy * wing, ay - uy * 7 - ux * wing)
      ctx.closePath()
      ctx.fillStyle = `rgba(129,140,248,${op.toFixed(2)})`
      ctx.fill()
    }

    // Galaxies as little tilted discs.
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i]
      const p = screenOf(i, a, home)
      if (p.x < -12 || p.x > W + 12 || p.y < -12 || p.y > H + 12) continue
      const isHome = i === home
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, g.rad * 3.2)
      glow.addColorStop(0, isHome ? 'rgba(245,158,11,0.55)' : `${g.hue}55`)
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(p.x, p.y, g.rad * 3.2, 0, Math.PI * 2); ctx.fill()

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(g.tilt)
      ctx.beginPath()
      ctx.ellipse(0, 0, g.rad, g.rad * 0.55, 0, 0, Math.PI * 2)
      ctx.fillStyle = isHome ? '#F59E0B' : g.hue
      ctx.fill()
      ctx.restore()

      if (isHome) {
        ctx.strokeStyle = '#F59E0B'
        ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(p.x, p.y, g.rad + 6, 0, Math.PI * 2); ctx.stroke()
      }
    }

    // Home label
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,158,11,0.9)'
    ctx.fillText('your galaxy — you see everything recede', 14, 22)
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('click any galaxy to move home', 14, H - 14)
    ctx.fillStyle = 'rgba(129,140,248,0.9)'
    const scaleLabel = `a(t) = ${a.toFixed(2)}`
    ctx.fillText(scaleLabel, W - 14 - ctx.measureText(scaleLabel).width, 22)
  }, [home, screenOf])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { lastRef.current = null; cancelAnimationFrame(rafRef.current); return }
    const loop = (now: number) => {
      if (lastRef.current === null) lastRef.current = now
      const dt = Math.min(64, now - lastRef.current) / 1000
      lastRef.current = now
      aRef.current = Math.min(A_MAX, aRef.current + GROW_RATE * dt)
      draw()
      if (aRef.current >= A_MAX) { setRunning(false); return }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (W / rect.width)
    const my = (e.clientY - rect.top) * (H / rect.height)
    const gs = galaxiesRef.current
    const a = aRef.current
    let best = -1
    let bestD = 18 * 18
    for (let i = 0; i < gs.length; i++) {
      const p = screenOf(i, a, home)
      const d2 = (p.x - mx) ** 2 + (p.y - my) ** 2
      if (d2 < bestD) { bestD = d2; best = i }
    }
    if (best >= 0) setHome(best)
  }

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    aRef.current = A_MIN
    lastRef.current = null
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Expansion has no centre</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onClick={handleClick}
          className="w-full rounded-lg cursor-pointer"
          style={{ background: '#0F0D0A' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (aRef.current >= A_MAX) aRef.current = A_MIN
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-indigo text-bg-base text-xs font-medium hover:bg-accent-indigo/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Expand</>}
        </button>
        <span className="ml-auto text-xs text-text-secondary">
          Every arrow points <strong className="text-accent-indigo">away from home</strong>, and the far galaxies carry the long ones — the same Hubble law from any vantage.
        </span>
      </div>
    </div>
  )
}
