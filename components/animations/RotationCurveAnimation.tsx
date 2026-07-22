'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 320

// Plot region (left panel: rotation curve).
const PL = 50   // left
const PR = 384  // right
const PT = 28   // top
const PB = 286  // bottom
const RMAX = 30 // radius axis in kpc
const VMAX = 260 // speed axis in km/s

// Galaxy inset (right panel: two stars orbiting).
const GX = 498
const GY = 158

// --- Physics model (tuned, order-of-magnitude realistic) -------------------
// Visible mass gives v_vis = sqrt(G M(<r)/r) with an enclosed mass that
// saturates, so the curve rises then falls off as ~1/sqrt(r): the Keplerian
// prediction. A pseudo-isothermal dark halo adds v_halo that flattens to a
// constant. Total predicted speed is the quadrature sum. The "observed" curve
// is the total at the full halo, so dialling the halo to 100% lands the
// prediction exactly on the observation.
const A_VIS = 475   // sets the visible peak (~170 km/s)
const B_VIS = 3     // visible scale radius (kpc)
const RC_HALO = 8   // halo core radius (kpc)
const VH_FULL = 200 // flat asymptotic halo speed (km/s)

const vVis = (r: number) => (A_VIS * r) / Math.pow(r * r + B_VIS * B_VIS, 0.75)
const vHalo = (r: number, vh: number) => (vh * r) / Math.sqrt(r * r + RC_HALO * RC_HALO)
const vPred = (r: number, vh: number) => Math.hypot(vVis(r), vHalo(r, vh))
const vObs = (r: number) => Math.hypot(vVis(r), vHalo(r, VH_FULL))

const ACCENT = '#818CF8' // indigo — predicted total (moves with the halo)
const GOLD = '#F59E0B'   // observed flat curve
const BLUE = '#60A5FA'   // visible-mass-only prediction
const VIOLET = '#A78BFA'
const INK = 'rgba(245,240,232,0.5)'

const R_INNER = 6   // inset inner star radius (kpc)
const R_OUTER = 24  // inset outer stars radius (kpc) — out in the flat region
const OMEGA_K = 1.18e-4 // rad per ms per (km/s / kpc)

const xMap = (r: number) => PL + (r / RMAX) * (PR - PL)
const yMap = (v: number) => PB - (v / VMAX) * (PB - PT)

function curvePoints(fn: (r: number) => number): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= 120; i++) {
    const r = (i / 120) * RMAX
    pts.push([xMap(r), yMap(fn(r))])
  }
  return pts
}

function stroke(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string, width: number, dash: number[] = []) {
  ctx.setLineDash(dash)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.stroke()
  ctx.setLineDash([])
}

export function RotationCurveAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const timeRef = useRef(0)      // accumulated ms for orbital phase
  const lastRef = useRef<number | null>(null)
  const haloRef = useRef(0)

  const [running, setRunning] = useState(false)
  const [halo, setHalo] = useState(0) // 0..1 fraction of the full halo

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => { if (!reduced) setRunning(true) },
  })

  useEffect(() => { haloRef.current = halo }, [halo])

  const draw = useCallback((t: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const vh = haloRef.current * VH_FULL

    ctx.clearRect(0, 0, W, H)

    // Faint grid over the plot region.
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    ctx.lineWidth = 1
    for (let r = 5; r < RMAX; r += 5) { ctx.beginPath(); ctx.moveTo(xMap(r), PT); ctx.lineTo(xMap(r), PB); ctx.stroke() }
    for (let v = 50; v < VMAX; v += 50) { ctx.beginPath(); ctx.moveTo(PL, yMap(v)); ctx.lineTo(PR, yMap(v)); ctx.stroke() }

    // Axes.
    ctx.strokeStyle = 'rgba(245,240,232,0.35)'
    ctx.lineWidth = 1.25
    ctx.beginPath(); ctx.moveTo(PL, PT); ctx.lineTo(PL, PB); ctx.lineTo(PR, PB); ctx.stroke()
    ctx.fillStyle = INK
    ctx.font = '10px monospace'
    ctx.save()
    ctx.translate(14, (PT + PB) / 2); ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'; ctx.fillText('orbital speed  v (km/s)', 0, 0)
    ctx.restore()
    ctx.textAlign = 'center'
    ctx.fillText('radius  r (kpc)', (PL + PR) / 2, H - 8)
    ctx.textAlign = 'left'

    // Shade the dark-matter gap: between visible-only prediction and observed.
    const obs = curvePoints(vObs)
    const vis = curvePoints(vVis)
    ctx.beginPath()
    obs.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    for (let i = vis.length - 1; i >= 0; i--) ctx.lineTo(vis[i][0], vis[i][1])
    ctx.closePath()
    ctx.fillStyle = 'rgba(129,140,248,0.10)'
    ctx.fill()

    // Curves.
    stroke(ctx, vis, BLUE, 2, [6, 4])                                 // visible-only (Keplerian) prediction
    stroke(ctx, obs, GOLD, 2.5)                                       // observed flat curve
    stroke(ctx, curvePoints(r => vPred(r, vh)), ACCENT, 2.5)          // predicted total (with current halo)

    // Marker line at the inset radius R_OUTER.
    const xo = xMap(R_OUTER)
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.setLineDash([2, 3])
    ctx.beginPath(); ctx.moveTo(xo, PT); ctx.lineTo(xo, PB); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = GOLD
    ctx.beginPath(); ctx.arc(xo, yMap(vObs(R_OUTER)), 3.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = BLUE
    ctx.beginPath(); ctx.arc(xo, yMap(vVis(R_OUTER)), 3.5, 0, Math.PI * 2); ctx.fill()

    // Legend.
    ctx.font = '10px monospace'
    const leg: [string, string][] = [
      ['observed (flat)', GOLD],
      ['visible mass only (∝1/√r)', BLUE],
      ['prediction + dark halo', ACCENT],
    ]
    leg.forEach(([label, color], i) => {
      const ly = PT + 6 + i * 15
      ctx.strokeStyle = color; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(PL + 8, ly); ctx.lineTo(PL + 26, ly); ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.7)'
      ctx.fillText(label, PL + 32, ly + 3.5)
    })

    // --- Galaxy inset: two outer stars + one inner star orbiting -----------
    // Halo glow (grows with the dialled halo mass).
    const haloR = 34 + haloRef.current * 40
    const hg = ctx.createRadialGradient(GX, GY, 20, GX, GY, haloR)
    hg.addColorStop(0, `rgba(129,140,248,${0.06 + haloRef.current * 0.16})`)
    hg.addColorStop(1, 'rgba(129,140,248,0)')
    ctx.fillStyle = hg
    ctx.beginPath(); ctx.arc(GX, GY, haloR, 0, Math.PI * 2); ctx.fill()

    // Central bulge glow.
    const bg = ctx.createRadialGradient(GX, GY, 1, GX, GY, 16)
    bg.addColorStop(0, 'rgba(245,240,232,0.9)')
    bg.addColorStop(1, 'rgba(245,240,232,0)')
    ctx.fillStyle = bg
    ctx.beginPath(); ctx.arc(GX, GY, 16, 0, Math.PI * 2); ctx.fill()

    // Orbit rings.
    const rIn = 20
    const rOut = 52
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(GX, GY, rIn, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(GX, GY, rOut, 0, Math.PI * 2); ctx.stroke()

    // Angular speeds (rad/ms). Observed outer star keeps pace; visible-only lags.
    const wInner = (vObs(R_INNER) / R_INNER) * OMEGA_K
    const wOuterObs = (vObs(R_OUTER) / R_OUTER) * OMEGA_K
    const wOuterVis = (vVis(R_OUTER) / R_OUTER) * OMEGA_K

    const star = (angle: number, orbitR: number, color: string, size: number) => {
      const x = GX + orbitR * Math.cos(angle)
      const y = GY + orbitR * Math.sin(angle)
      const g = ctx.createRadialGradient(x, y, 0, x, y, size + 5)
      g.addColorStop(0, color)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(x, y, size + 5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = color
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill()
    }

    star(t * wInner, rIn, VIOLET, 3)              // inner star — races
    star(t * wOuterVis + 0.6, rOut, BLUE, 3.5)    // outer star at Keplerian speed — lags
    star(t * wOuterObs + 0.6, rOut, GOLD, 3.5)    // outer star at observed speed — keeps up

    ctx.font = '9px monospace'
    ctx.fillStyle = INK
    ctx.textAlign = 'center'
    ctx.fillText('same outer orbit,', GX, GY + 74)
    ctx.fillText('two speeds', GX, GY + 85)
    ctx.textAlign = 'left'
  }, [])

  // Redraw when the halo slider changes (even while paused).
  useEffect(() => { draw(timeRef.current) }, [draw, halo])

  useEffect(() => {
    if (!running) { lastRef.current = null; cancelAnimationFrame(rafRef.current); return }
    const loop = (now: number) => {
      if (lastRef.current === null) lastRef.current = now
      const dt = Math.min(64, now - lastRef.current)
      lastRef.current = now
      timeRef.current += dt
      draw(timeRef.current)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setHalo(0)
    haloRef.current = 0
    timeRef.current = 0
    lastRef.current = null
    draw(0)
  }

  const outerPred = Math.round(vPred(R_OUTER, halo * VH_FULL))
  const outerObs = Math.round(vObs(R_OUTER))
  const match = Math.abs(outerPred - outerObs) <= 4

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · A galaxy&apos;s rotation curve</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: GOLD, color: '#0F0D0A' }}
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>dark-matter halo mass:</span>
          <input
            type="range" min={0} max={100} step={1} value={Math.round(halo * 100)}
            onChange={e => setHalo(+e.target.value / 100)}
            className="w-36" style={{ accentColor: ACCENT }}
          />
          <span className="font-mono text-text-secondary">{Math.round(halo * 100)}%</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          predicted outer v = <strong className="font-mono" style={{ color: match ? GOLD : ACCENT }}>{outerPred}</strong> ·
          observed = <strong className="font-mono" style={{ color: GOLD }}>{outerObs}</strong> km/s
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        With no halo, the prediction from visible mass alone (blue) rolls over into the Keplerian <span className="font-mono">1/√r</span> decline,
        while the real galaxy (gold) stays flat — the shaded gap is the dark matter. Dial the halo mass up and the prediction (indigo) flattens to
        meet the observation. In the galaxy at right, the gold outer star orbits at the observed speed and refuses to fall behind the slow blue one.
      </p>
    </div>
  )
}
