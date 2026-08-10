'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 320
const LX = 300 // lens (foreground mass) centre
const LY = 160

// Schematic point-mass lens. Rays are shot back from the image plane through a
// deflection field of strength θ_E² / r; a point lights up if it maps back onto
// the background source. This reproduces the geometry — two images, tangential
// arcs, and an Einstein ring at alignment — but it is NOT a full ray-trace, so
// the arcs are illustrative rather than photometrically exact.
const THETA_E_MAX = 66 // Einstein radius (px) at full lens mass
const SRC_R = 13       // background-source radius (px)

const ACCENT = '#818CF8' // indigo — lens / Einstein ring
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'   // background galaxy (source + its lensed images)
const VIOLET = '#A78BFA'
const INK = 'rgba(245,240,232,0.5)'

// Einstein radius grows as sqrt(mass): mass slider is 0..1.
const thetaE = (massFrac: number) => THETA_E_MAX * Math.sqrt(massFrac)

export function GravitationalLensingAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0)
  const lastRef = useRef<number | null>(null)
  const massRef = useRef(0.55)

  const [running, setRunning] = useState(false)
  const [mass, setMass] = useState(0.55) // 0..1 fraction of full lens mass

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => { if (!reduced) setRunning(true) },
  })

  useEffect(() => { massRef.current = mass }, [mass])

  const draw = useCallback((phase: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const tE = thetaE(massRef.current)
    const tE2 = tE * tE

    // Background source drifts slowly on a small path so the arcs morph.
    const sx = LX + 6 + 26 * Math.cos(phase)
    const sy = LY + 20 * Math.sin(phase)

    ctx.clearRect(0, 0, W, H)

    // Starfield backdrop (fixed literal positions — this is a client-only widget).
    ctx.fillStyle = 'rgba(245,240,232,0.16)'
    const stars = [
      [40, 40], [90, 210], [140, 70], [200, 260], [260, 30], [520, 60],
      [560, 210], [480, 280], [70, 130], [30, 280], [420, 40], [350, 300],
      [150, 300], [560, 120], [500, 160], [110, 250], [250, 110], [400, 250],
    ]
    for (const [x, y] of stars) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill() }

    // True (unlensed) position of the source, drawn faint for reference.
    const trueGlow = ctx.createRadialGradient(sx, sy, 0, sx, sy, SRC_R + 4)
    trueGlow.addColorStop(0, 'rgba(96,165,250,0.18)')
    trueGlow.addColorStop(1, 'rgba(96,165,250,0)')
    ctx.fillStyle = trueGlow
    ctx.beginPath(); ctx.arc(sx, sy, SRC_R + 4, 0, Math.PI * 2); ctx.fill()

    // Ray-shoot the image plane: light points that map back onto the source.
    const step = 3
    let ringLike = false
    for (let x = LX - 120; x <= LX + 120; x += step) {
      for (let y = LY - 100; y <= LY + 100; y += step) {
        const dx = x - LX
        const dy = y - LY
        const r2 = dx * dx + dy * dy
        if (r2 < 4) continue
        // Deflect: image position -> source position.
        const bx = x - (tE2 * dx) / r2
        const by = y - (tE2 * dy) / r2
        const d = Math.hypot(bx - sx, by - sy)
        if (d < SRC_R) {
          const a = 0.85 * (1 - d / SRC_R)
          ctx.fillStyle = `rgba(96,165,250,${a})`
          ctx.fillRect(x - step / 2, y - step / 2, step, step)
        }
      }
    }

    // Detect a near-Einstein-ring: source close to the optical axis with real mass.
    ringLike = tE > 20 && Math.hypot(sx - LX, sy - LY) < 12

    // Einstein-ring guide (dashed) — the scale the mass sets.
    if (tE > 2) {
      ctx.strokeStyle = 'rgba(129,140,248,0.5)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.arc(LX, LY, tE, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
    }

    // The foreground lens: mostly invisible mass. A faint halo that grows with
    // mass, plus a small marker so the reader knows something is there.
    const haloR = 14 + massRef.current * 30
    const lg = ctx.createRadialGradient(LX, LY, 2, LX, LY, haloR)
    lg.addColorStop(0, `rgba(167,139,250,${0.10 + massRef.current * 0.14})`)
    lg.addColorStop(1, 'rgba(167,139,250,0)')
    ctx.fillStyle = lg
    ctx.beginPath(); ctx.arc(LX, LY, haloR, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(167,139,250,0.55)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 3])
    ctx.beginPath(); ctx.arc(LX, LY, 6, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = VIOLET
    ctx.beginPath(); ctx.arc(LX, LY, 2, 0, Math.PI * 2); ctx.fill()

    // Labels.
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(167,139,250,0.85)'
    ctx.textAlign = 'center'
    ctx.fillText('unseen foreground mass', LX, LY + haloR + 14)
    ctx.fillStyle = 'rgba(96,165,250,0.8)'
    ctx.fillText('background galaxy (lensed)', LX, 22)
    ctx.textAlign = 'left'

    // Outcome badge.
    ctx.font = 'bold 12px monospace'
    if (tE < 3) {
      ctx.fillStyle = INK
      ctx.fillText('no mass — light travels straight, one image', 16, H - 16)
    } else if (ringLike) {
      ctx.fillStyle = GOLD
      ctx.fillText('aligned — an Einstein ring', 16, H - 16)
    } else {
      ctx.fillStyle = BLUE
      ctx.fillText('mass bends light into arcs & multiple images', 16, H - 16)
    }
  }, [])

  useEffect(() => { draw(phaseRef.current) }, [draw, mass])

  useEffect(() => {
    if (!running) { lastRef.current = null; cancelAnimationFrame(rafRef.current); return }
    const loop = (now: number) => {
      if (lastRef.current === null) lastRef.current = now
      const dt = Math.min(64, now - lastRef.current)
      lastRef.current = now
      phaseRef.current += dt / 2600 // slow drift
      draw(phaseRef.current)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setMass(0.55)
    massRef.current = 0.55
    phaseRef.current = 0
    lastRef.current = null
    draw(0)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Weighing mass by the light it bends</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: ACCENT, color: '#0F0D0A' }}
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>lens mass:</span>
          <input
            type="range" min={0} max={100} step={1} value={Math.round(mass * 100)}
            onChange={e => setMass(+e.target.value / 100)}
            className="w-36" style={{ accentColor: ACCENT }}
          />
          <span className="font-mono text-text-secondary">{Math.round(mass * 100)}%</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          Einstein radius ∝ <strong className="font-mono" style={{ color: ACCENT }}>√mass</strong>
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        The foreground mass (violet, mostly invisible) bends the light of the blue background galaxy behind it. With little mass the light travels
        nearly straight; turn the mass up and the image stretches into arcs, splits into multiple images, and — when the two align — wraps into an
        Einstein ring. The more the light bends, the more mass must be there, so lensing weighs matter whether or not it shines. This is a schematic
        of the geometry, not a full gravitational ray-trace.
      </p>
    </div>
  )
}
