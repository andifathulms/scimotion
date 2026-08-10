'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340
const COLS = 7
const ROWS = 5
const PX = 74 // screen px per comoving unit at scale factor a = 1
const OMEGA_M = 0.3
const OMEGA_L = 0.7
const A_START = 0.08
const A_MAX = 2.3
const HUBBLE_TIME_GYR = 14.0 // 1/H0 in Gyr, for the time readout
const PLAY_SPEED = 46 // table indices advanced per second while playing

// Deterministic scatter offsets for the galaxy grid — never Math.random().
const SCATTER = [
  0.18, -0.12, 0.09, -0.2, 0.14, -0.06, 0.21, -0.16, 0.05, 0.17,
  -0.19, 0.11, -0.08, 0.2, -0.14, 0.07, 0.16, -0.1, 0.13, -0.17,
  0.1, -0.21, 0.06, 0.19, -0.09, 0.15, -0.13, 0.08, -0.18, 0.12,
  -0.05, 0.2, -0.11, 0.14, -0.07,
]
const PALETTE = ['#818CF8', '#60A5FA', '#A78BFA', '#22D3EE', '#10B981', '#F472B6', '#93C5FD']

type Galaxy = { gx: number; gy: number; hue: string; rad: number; tilt: number }

function makeGalaxies(): Galaxy[] {
  const gs: Galaxy[] = []
  let k = 0
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const sx = SCATTER[k % SCATTER.length]
      const sy = SCATTER[(k + 11) % SCATTER.length]
      gs.push({
        gx: c - (COLS - 1) / 2 + sx * 0.5,
        gy: r - (ROWS - 1) / 2 + sy * 0.5,
        hue: PALETTE[k % PALETTE.length],
        rad: 2.6 + (k % 5) * 0.5,
        tilt: (k % 7) * 0.44,
      })
      k++
    }
  }
  return gs
}

// Friedmann growth: da/dt = sqrt(Omega_m/a + Omega_L*a^2), with H0 = 1.
// Pre-integrate a(t) once so the scrubber can index it deterministically.
function buildScaleTable() {
  const ts: number[] = []
  const as: number[] = []
  let a = A_START
  let t = 0
  const dt = 0.003
  ts.push(t)
  as.push(a)
  while (a < A_MAX && ts.length < 4000) {
    const dadt = Math.sqrt(OMEGA_M / a + OMEGA_L * a * a)
    a += dadt * dt
    t += dt
    ts.push(t)
    as.push(a)
  }
  return { ts, as }
}

// Sign of the acceleration d^2a/dt^2 = -0.5*Omega_m/a^2 + Omega_L*a.
function isAccelerating(a: number) {
  return -0.5 * OMEGA_M / (a * a) + OMEGA_L * a >= 0
}

export function AcceleratingExpansionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number | null>(null)
  const tableRef = useRef<{ ts: number[]; as: number[] } | null>(null)
  if (tableRef.current === null) tableRef.current = buildScaleTable()
  const galaxiesRef = useRef<Galaxy[]>([])
  if (galaxiesRef.current.length === 0) galaxiesRef.current = makeGalaxies()
  const idxRef = useRef(0)

  const [running, setRunning] = useState(false)
  const [idx, setIdx] = useState(0)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      const tbl = tableRef.current!
      if (reduced) {
        // Single static final frame — an accelerating, dark-energy-dominated era.
        idxRef.current = tbl.ts.length - 1
        setIdx(idxRef.current)
        return
      }
      setRunning(true)
    },
  })

  const setupCanvas = useCallback((ctx: CanvasRenderingContext2D) => {
    const canvas = canvasRef.current!
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const bw = Math.round(W * dpr)
    const bh = Math.round(H * dpr)
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw
      canvas.height = bh
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [])

  const draw = useCallback((i: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const tbl = tableRef.current!
    const a = tbl.as[i]
    const tGyr = tbl.ts[i] * HUBBLE_TIME_GYR
    const accel = isAccelerating(a)
    const gs = galaxiesRef.current

    setupCanvas(ctx)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    const cx = W / 2
    const cy = H / 2 + 14
    const home = gs[Math.floor(gs.length / 2)]

    // The comoving grid — space itself — stretching by the factor a.
    ctx.strokeStyle = 'rgba(129,140,248,0.12)'
    ctx.lineWidth = 1
    for (let c = -4; c <= 4; c++) {
      const x = cx + a * (c - home.gx) * PX
      ctx.beginPath(); ctx.moveTo(x, 44); ctx.lineTo(x, H); ctx.stroke()
    }
    for (let r = -3; r <= 3; r++) {
      const y = cy + a * (r - home.gy) * PX
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }

    // Recession arrows: length grows with distance from home (Hubble's law),
    // and the whole picture opens faster once dark energy takes over.
    const arrowColor = accel ? '129,140,248' : '96,165,250'
    for (let k = 0; k < gs.length; k++) {
      if (k === Math.floor(gs.length / 2)) continue
      const g = gs[k]
      const x = cx + a * (g.gx - home.gx) * PX
      const y = cy + a * (g.gy - home.gy) * PX
      if (x < -20 || x > W + 20 || y < 30 || y > H + 20) continue
      const dx = x - cx
      const dy = y - cy
      const d = Math.hypot(dx, dy)
      if (d < 8) continue
      const ux = dx / d
      const uy = dy / d
      const len = Math.min(d * 0.3, 64)
      const ax = x + ux * len
      const ay = y + uy * len
      const op = (0.18 + Math.min(0.55, d / 340)).toFixed(2)
      ctx.strokeStyle = `rgba(${arrowColor},${op})`
      ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ax, ay); ctx.stroke()
      const wing = 4
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(ax - ux * 6 - uy * wing, ay - uy * 6 + ux * wing)
      ctx.lineTo(ax - ux * 6 + uy * wing, ay - uy * 6 - ux * wing)
      ctx.closePath()
      ctx.fillStyle = `rgba(${arrowColor},${op})`
      ctx.fill()
    }

    // Galaxies pinned to their comoving coordinates.
    for (let k = 0; k < gs.length; k++) {
      const g = gs[k]
      const x = cx + a * (g.gx - home.gx) * PX
      const y = cy + a * (g.gy - home.gy) * PX
      if (x < -14 || x > W + 14 || y < 26 || y > H + 14) continue
      const isHome = k === Math.floor(gs.length / 2)
      const glow = ctx.createRadialGradient(x, y, 0, x, y, g.rad * 3)
      glow.addColorStop(0, isHome ? 'rgba(245,158,11,0.5)' : `${g.hue}55`)
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(x, y, g.rad * 3, 0, Math.PI * 2); ctx.fill()
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(g.tilt)
      ctx.beginPath()
      ctx.ellipse(0, 0, g.rad, g.rad * 0.55, 0, 0, Math.PI * 2)
      ctx.fillStyle = isHome ? '#F59E0B' : g.hue
      ctx.fill()
      ctx.restore()
      if (isHome) {
        ctx.strokeStyle = '#F59E0B'
        ctx.lineWidth = 1.4
        ctx.beginPath(); ctx.arc(x, y, g.rad + 5, 0, Math.PI * 2); ctx.stroke()
      }
    }

    // Inset a(t) curve — the shape shows braking then speeding up.
    const bx = 14, by = 40, bw = 150, bh = 78
    ctx.fillStyle = 'rgba(15,13,10,0.72)'
    ctx.fillRect(bx, by, bw, bh)
    ctx.strokeStyle = 'rgba(245,240,232,0.18)'
    ctx.lineWidth = 1
    ctx.strokeRect(bx, by, bw, bh)
    const tMax = tbl.ts[tbl.ts.length - 1]
    ctx.strokeStyle = 'rgba(129,140,248,0.85)'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    for (let j = 0; j < tbl.ts.length; j += 6) {
      const px = bx + (tbl.ts[j] / tMax) * bw
      const py = by + bh - (tbl.as[j] / A_MAX) * bh
      if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
    const mpx = bx + (tbl.ts[i] / tMax) * bw
    const mpy = by + bh - (a / A_MAX) * bh
    ctx.fillStyle = '#F59E0B'
    ctx.beginPath(); ctx.arc(mpx, mpy, 3, 0, Math.PI * 2); ctx.fill()
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('scale factor a(t)', bx + 6, by + 12)

    // Titles
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,158,11,0.9)'
    ctx.fillText('home galaxy — space stretches equally in every direction', 176, 24)

    // Phase banner
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = accel ? '#818CF8' : '#60A5FA'
    const phase = accel ? 'ACCELERATING · dark energy dominates' : 'DECELERATING · matter gravity dominates'
    ctx.fillText(phase, W - 14 - ctx.measureText(phase).width, 24)

    // eslint wants tGyr used — draw it too
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    const tlabel = `t ≈ ${tGyr.toFixed(1)} Gyr`
    ctx.fillText(tlabel, W - 14 - ctx.measureText(tlabel).width, 38)
  }, [setupCanvas])

  useEffect(() => { draw(idx) }, [draw, idx])

  useEffect(() => {
    const tbl = tableRef.current!
    if (!running) { lastRef.current = null; cancelAnimationFrame(rafRef.current); return }
    const loop = (now: number) => {
      if (lastRef.current === null) lastRef.current = now
      const dt = Math.min(64, now - lastRef.current) / 1000
      lastRef.current = now
      let next = idxRef.current + PLAY_SPEED * dt
      if (next >= tbl.ts.length - 1) {
        next = tbl.ts.length - 1
        idxRef.current = next
        setIdx(Math.round(next))
        setRunning(false)
        return
      }
      idxRef.current = next
      setIdx(Math.round(next))
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running])

  const togglePlay = () => {
    const tbl = tableRef.current!
    if (idxRef.current >= tbl.ts.length - 1) {
      idxRef.current = 0
      setIdx(0)
    }
    setRunning(r => !r)
  }

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRunning(false)
    const v = Number(e.target.value)
    idxRef.current = v
    setIdx(v)
  }

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    idxRef.current = 0
    lastRef.current = null
    setIdx(0)
  }

  const tbl = tableRef.current!
  const a = tbl.as[idx]
  const tGyr = tbl.ts[idx] * HUBBLE_TIME_GYR
  const accel = isAccelerating(a)

  return (
    <div className="animation-block" ref={ref}>
      <div
        className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1"
      >
        <span>cosmic time: <span className="text-text-secondary">{tGyr.toFixed(1)} Gyr</span></span>
        <span>scale factor a(t): <span style={{ color: '#818CF8' }}>{a.toFixed(2)}</span></span>
        <span>
          phase:{' '}
          <span style={{ color: accel ? '#818CF8' : '#60A5FA' }}>
            {accel ? 'accelerating (pushed apart)' : 'decelerating (gravity braking)'}
          </span>
        </span>
      </div>

      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: Accelerating expansion. Values are reported below the diagram."
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)', aspectRatio: `${W} / ${H}` }}
        />
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={togglePlay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <input
          type="range"
          min={0}
          max={tbl.ts.length - 1}
          value={idx}
          onChange={onScrub}
          aria-label="Scrub cosmic time"
          className="flex-1 min-w-[140px] accent-accent-gold"
        />
      </div>
    </div>
  )
}
