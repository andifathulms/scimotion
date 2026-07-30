'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360
const CX = 300 // mass centre
const CY = 190
const BG = '#0F0D0A'
const GREEN = '#10B981' // field accent — the geodesic / test particle

// Grid geometry (top-down "sheet" of spacetime).
const GRID = 26 // spacing in px between grid lines
const SOFT = 34 // softening length so nothing blows up at the centre

// Radially pinch a grid point toward the mass. Deflection depth scales with
// the mass fraction; clamped so points never cross the centre. Purely visual.
function warp(x: number, y: number, massFrac: number): [number, number] {
  const dx = x - CX
  const dy = y - CY
  const r = Math.hypot(dx, dy)
  if (r < 0.5) return [x, y]
  const pull = (massFrac * 5200) / (r + SOFT)
  const d = Math.min(pull, r * 0.6)
  return [x - (dx / r) * d, y - (dy / r) * d]
}

// Fixed launch: particle enters from the left with an upward impact parameter.
const START_X = 30
const START_Y = 300
const V0 = 150 // px per second, initial rightward speed
const VY0 = -26

export function SpacetimeCurvatureAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number | null>(null)
  const massRef = useRef(0.5)

  // Particle state (kept in refs so the rAF loop stays deterministic).
  const px = useRef(START_X)
  const py = useRef(START_Y)
  const vx = useRef(V0)
  const vy = useRef(VY0)
  const trail = useRef<Array<[number, number]>>([])
  const deflRef = useRef(0)

  const [running, setRunning] = useState(false)
  const [mass, setMass] = useState(0.5) // 0..1
  const [defl, setDefl] = useState(0) // degrees, for the readout

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Draw one static final frame: an already-curved trajectory.
        runToCompletion()
        drawStatic()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => { massRef.current = mass }, [mass])

  const setupCtx = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return ctx
  }, [])

  const drawScene = useCallback(() => {
    const ctx = setupCtx()
    if (!ctx) return
    const m = massRef.current

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    // Warped grid — this is "spacetime". Draw warped verticals then horizontals.
    ctx.lineWidth = 1
    for (let gx = 0; gx <= W; gx += GRID) {
      ctx.beginPath()
      for (let gy = 0; gy <= H; gy += 6) {
        const [wx, wy] = warp(gx, gy, m)
        if (gy === 0) ctx.moveTo(wx, wy)
        else ctx.lineTo(wx, wy)
      }
      ctx.strokeStyle = 'rgba(245,240,232,0.14)'
      ctx.stroke()
    }
    for (let gy = 0; gy <= H; gy += GRID) {
      ctx.beginPath()
      for (let gx = 0; gx <= W; gx += 6) {
        const [wx, wy] = warp(gx, gy, m)
        if (gx === 0) ctx.moveTo(wx, wy)
        else ctx.lineTo(wx, wy)
      }
      ctx.strokeStyle = 'rgba(245,240,232,0.14)'
      ctx.stroke()
    }

    // The mass: a soft well marker at the centre.
    const haloR = 16 + m * 34
    const g = ctx.createRadialGradient(CX, CY, 2, CX, CY, haloR)
    g.addColorStop(0, `rgba(245,158,11,${0.28 + m * 0.22})`)
    g.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(CX, CY, haloR, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#F59E0B'
    ctx.beginPath(); ctx.arc(CX, CY, 5 + m * 4, 0, Math.PI * 2); ctx.fill()

    // Particle trail — the geodesic it has traced.
    const tr = trail.current
    if (tr.length > 1) {
      ctx.lineWidth = 2
      ctx.strokeStyle = GREEN
      ctx.beginPath()
      ctx.moveTo(tr[0][0], tr[0][1])
      for (let i = 1; i < tr.length; i++) ctx.lineTo(tr[i][0], tr[i][1])
      ctx.stroke()
    }

    // The test particle.
    ctx.fillStyle = GREEN
    ctx.beginPath(); ctx.arc(px.current, py.current, 5, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(16,185,129,0.35)'
    ctx.lineWidth = 6
    ctx.beginPath(); ctx.arc(px.current, py.current, 5, 0, Math.PI * 2); ctx.stroke()

    // Labels.
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(245,158,11,0.85)'
    ctx.fillText('mass warps spacetime', CX, CY + haloR + 16)
    ctx.fillStyle = 'rgba(16,185,129,0.9)'
    ctx.fillText('the particle goes straight — the grid is curved', W / 2, H - 12)
    ctx.textAlign = 'left'
  }, [setupCtx])

  // Advance the particle one physics step. Acceleration mimics curved-space
  // free fall toward the mass; softened so the centre is finite.
  const step = useCallback((dt: number) => {
    const m = massRef.current
    const dx = CX - px.current
    const dy = CY - py.current
    const r2 = dx * dx + dy * dy + SOFT * SOFT
    const r = Math.sqrt(r2)
    const acc = (m * 46000) / r2
    vx.current += (dx / r) * acc * dt
    vy.current += (dy / r) * acc * dt
    px.current += vx.current * dt
    py.current += vy.current * dt

    trail.current.push([px.current, py.current])
    if (trail.current.length > 900) trail.current.shift()

    // Deflection = angle between current heading and the initial heading.
    const a0 = Math.atan2(VY0, V0)
    const a1 = Math.atan2(vy.current, vx.current)
    let d = ((a1 - a0) * 180) / Math.PI
    while (d > 180) d -= 360
    while (d < -180) d += 360
    deflRef.current = Math.abs(d)
  }, [])

  // Fast-forward a whole flight (used for the reduced-motion static frame).
  const runToCompletion = useCallback(() => {
    resetParticle()
    const dt = 1 / 60
    for (let i = 0; i < 900; i++) {
      step(dt)
      const off = px.current < -20 || px.current > W + 20 || py.current < -20 || py.current > H + 20
      if (off) break
    }
    setDefl(Math.round(deflRef.current))
  }, [step])

  const drawStatic = useCallback(() => { drawScene() }, [drawScene])

  // Redraw when mass changes while paused.
  useEffect(() => { drawScene() }, [drawScene, mass])

  useEffect(() => {
    if (!running) { lastRef.current = null; cancelAnimationFrame(rafRef.current); return }
    const loop = (now: number) => {
      if (lastRef.current === null) lastRef.current = now
      const dt = Math.min(0.032, (now - lastRef.current) / 1000)
      lastRef.current = now
      step(dt)
      setDefl(Math.round(deflRef.current))

      // Relaunch once the particle leaves the frame.
      const off = px.current < -20 || px.current > W + 20 || py.current < -20 || py.current > H + 20
      if (off) resetParticle()

      drawScene()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, drawScene])

  function resetParticle() {
    px.current = START_X
    py.current = START_Y
    vx.current = V0
    vy.current = VY0
    trail.current = [[START_X, START_Y]]
    deflRef.current = 0
  }

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setMass(0.5)
    massRef.current = 0.5
    resetParticle()
    setDefl(0)
    drawScene()
  }

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: BG }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>mass: <span style={{ color: '#F59E0B' }}>{Math.round(mass * 100)}%</span></span>
        <span>path deflection: <span style={{ color: GREEN }}>{defl}°</span></span>
        <span className="text-text-muted">geodesic = straightest path through curved spacetime</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>mass:</span>
          <input
            type="range" min={5} max={100} step={1} value={Math.round(mass * 100)}
            onChange={e => setMass(+e.target.value / 100)}
            className="w-36" style={{ accentColor: GREEN }}
          />
          <span className="font-mono text-text-secondary">{Math.round(mass * 100)}%</span>
        </div>
      </div>

      <p className="mt-2 text-xs text-text-muted">
        The mass (gold) warps the grid — denser curvature nearby, gentle far away. The green test particle is launched straight across and bends
        toward the mass, or settles into an orbit, not because anything tethers it but because the grid it travels straight across is itself curved.
        Raise the mass to deepen the curvature and the bending grows. Like the &ldquo;bowling ball on a rubber sheet,&rdquo; this top-down sheet is only an
        analogy: it shows curved space but not the curvature of time, which dominates everyday falling.
      </p>
    </div>
  )
}
