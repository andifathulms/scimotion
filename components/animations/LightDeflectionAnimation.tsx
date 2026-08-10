'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360
const MX = 300 // deflecting mass, centre
const MY = 180
const BG = '#0F0D0A'
const GREEN = '#10B981' // field accent — the light rays
const GOLD = '#F59E0B'

const SOFT = 22 // softening so grazing rays stay finite
// Impact parameters (vertical offset of each incoming parallel ray from MY).
const IMPACTS = [-140, -104, -70, -42, -20, 20, 42, 70, 104, 140]
const DX = 2 // integration step in x (px)

type Ray = { pts: Array<[number, number]>; len: number }

// Integrate one horizontal ray of light past the mass. Light moves in +x at
// unit x-speed; a transverse acceleration toward the mass bends it — massless
// light still follows the curved geometry. Returns the polyline + its length.
function traceRay(y0: number, massFrac: number): Ray {
  let y = MY + y0
  let slope = 0 // dy/dx
  const pts: Array<[number, number]> = [[0, y]]
  let len = 0
  let prevX = 0
  let prevY = y
  for (let x = DX; x <= W; x += DX) {
    const dy = MY - y
    const dxm = MX - x
    const r2 = dxm * dxm + dy * dy + SOFT * SOFT
    const r = Math.sqrt(r2)
    const acc = (massFrac * 5400) / r2
    slope += (dy / r) * acc * DX * 0.02
    y += slope * DX
    pts.push([x, y])
    len += Math.hypot(x - prevX, y - prevY)
    prevX = x
    prevY = y
  }
  return { pts, len }
}

// Net deflection angle (degrees) of a ray from its final slope.
function deflectionOf(ray: Ray): number {
  const n = ray.pts.length
  const [x1, y1] = ray.pts[n - 2]
  const [x2, y2] = ray.pts[n - 1]
  return Math.abs((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI)
}

export function LightDeflectionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number | null>(null)
  const massRef = useRef(0.45)
  const phaseRef = useRef(0) // 0..1 photon position along each ray
  const raysRef = useRef<Ray[]>([])

  const [running, setRunning] = useState(false)
  const [mass, setMass] = useState(0.45) // 0..1
  const [defl, setDefl] = useState(0) // deg, grazing (innermost) ray

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      rebuildRays()
      if (reduced) { phaseRef.current = 0.6; drawScene() }
      else setRunning(true)
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

  const rebuildRays = useCallback(() => {
    const m = massRef.current
    raysRef.current = IMPACTS.map(y0 => traceRay(y0, m))
    // Grazing ray = smallest |impact|.
    const inner = raysRef.current[Math.floor(IMPACTS.length / 2) - 1]
    setDefl(Math.round(deflectionOf(inner)))
  }, [])

  const drawScene = useCallback(() => {
    const ctx = setupCtx()
    if (!ctx) return
    const m = massRef.current
    const rays = raysRef.current

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    // Fixed starfield backdrop (literal positions — deterministic).
    ctx.fillStyle = 'rgba(245,240,232,0.16)'
    const stars = [
      [50, 40], [110, 300], [160, 90], [220, 250], [70, 160], [30, 260],
      [520, 60], [560, 210], [480, 300], [420, 40], [350, 330], [140, 210],
      [560, 130], [500, 160], [90, 250], [250, 40], [400, 250], [300, 330],
    ]
    for (const [sx, sy] of stars) { ctx.beginPath(); ctx.arc(sx, sy, 1, 0, Math.PI * 2); ctx.fill() }

    // Light rays following the curved geometry.
    for (const ray of rays) {
      ctx.strokeStyle = 'rgba(16,185,129,0.5)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(ray.pts[0][0], ray.pts[0][1])
      for (let i = 1; i < ray.pts.length; i++) ctx.lineTo(ray.pts[i][0], ray.pts[i][1])
      ctx.stroke()

      // A photon travelling along the ray (phase 0..1 of its length).
      const target = phaseRef.current * ray.len
      let acc = 0
      let cx = ray.pts[0][0]
      let cy = ray.pts[0][1]
      for (let i = 1; i < ray.pts.length; i++) {
        const seg = Math.hypot(ray.pts[i][0] - ray.pts[i - 1][0], ray.pts[i][1] - ray.pts[i - 1][1])
        if (acc + seg >= target) {
          const f = seg > 0 ? (target - acc) / seg : 0
          cx = ray.pts[i - 1][0] + (ray.pts[i][0] - ray.pts[i - 1][0]) * f
          cy = ray.pts[i - 1][1] + (ray.pts[i][1] - ray.pts[i - 1][1]) * f
          break
        }
        acc += seg
      }
      ctx.fillStyle = GREEN
      ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, Math.PI * 2); ctx.fill()
    }

    // Einstein ring guide — the scale of strong lensing, grows with mass.
    const ringR = 8 + m * 90
    if (m > 0.15) {
      ctx.strokeStyle = `rgba(129,140,248,${0.15 + m * 0.35})`
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.arc(MX, MY, ringR, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
    }

    // The deflecting mass.
    const haloR = 14 + m * 30
    const g = ctx.createRadialGradient(MX, MY, 2, MX, MY, haloR)
    g.addColorStop(0, `rgba(245,158,11,${0.3 + m * 0.2})`)
    g.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(MX, MY, haloR, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = GOLD
    ctx.beginPath(); ctx.arc(MX, MY, 6 + m * 3, 0, Math.PI * 2); ctx.fill()

    // Labels.
    ctx.font = '11px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(16,185,129,0.85)'
    ctx.fillText('parallel starlight →', 12, 22)
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(245,158,11,0.85)'
    ctx.fillText('massive object', MX, MY + haloR + 14)
    ctx.fillStyle = m > 0.55 ? '#A78BFA' : 'rgba(245,240,232,0.55)'
    ctx.fillText(
      m > 0.55 ? 'strong lensing — multiple images / Einstein ring' : 'light bends toward the mass — star appears shifted',
      W / 2, H - 12,
    )
    ctx.textAlign = 'left'
  }, [setupCtx])

  useEffect(() => { rebuildRays(); drawScene() }, [rebuildRays, drawScene, mass])

  useEffect(() => {
    if (!running) { lastRef.current = null; cancelAnimationFrame(rafRef.current); return }
    const loop = (now: number) => {
      if (lastRef.current === null) lastRef.current = now
      const dt = Math.min(0.032, (now - lastRef.current) / 1000)
      lastRef.current = now
      phaseRef.current += dt * 0.4
      if (phaseRef.current > 1) phaseRef.current -= 1
      drawScene()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, drawScene])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setMass(0.45)
    massRef.current = 0.45
    phaseRef.current = 0
    lastRef.current = null
    rebuildRays()
    drawScene()
  }

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Light deflection. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: BG }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>mass: <span style={{ color: GOLD }}>{Math.round(mass * 100)}%</span></span>
        <span>grazing-ray deflection: <span style={{ color: GREEN }}>{defl}°</span></span>
        <span className="text-text-muted">even massless light follows the curved geometry</span>
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
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>mass:</span>
          <input
            type="range" min={0} max={100} step={1} value={Math.round(mass * 100)}
            onChange={e => setMass(+e.target.value / 100)}
            className="w-36" style={{ accentColor: GREEN }}
          />
          <span className="font-mono text-text-secondary">{Math.round(mass * 100)}%</span>
        </label>
      </div>

      <p className="mt-2 text-xs text-text-muted">
        Parallel rays of starlight (green) stream past a massive object (gold). Each ray bends toward the mass — the closer it grazes, the more it
        deflects — so a background star appears shifted from its true position. Turn the mass up and the bending grows until light arrives from several
        directions at once: multiple images, or a full Einstein ring (dashed). Light has no mass for a force to pull on; it bends purely because it is
        following the curved spacetime. This is a schematic of the geometry, not a full ray-trace.
      </p>
    </div>
  )
}
