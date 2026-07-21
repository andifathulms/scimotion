'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 400

// --- cloud panel (cross-section through the xz plane) ----------------
const PANEL_X = 18
const PANEL_Y = 74
const PANEL_S = 286 // square side
const CX = PANEL_X + PANEL_S / 2
const CY = PANEL_Y + PANEL_S / 2
const HALF = PANEL_S / 2 - 6

// --- radial distribution plot ----------------------------------------
const PL = 356
const PR = 584
const PT = 216
const PB = 350

const MAX_DOTS = 5200
const DOTS_PER_FRAME = 90

// Hydrogenic radial wavefunctions R_{n,l}(r), r in Bohr radii, Z = 1.
// Normalisation constants are irrelevant here (everything is rescaled for
// display), but they are included so the shapes are literally the real ones.
const SQRT2 = Math.SQRT2
function radial(n: number, l: number, r: number): number {
  if (n === 1) return 2 * Math.exp(-r)
  if (n === 2 && l === 0) return (1 / (2 * SQRT2)) * (2 - r) * Math.exp(-r / 2)
  if (n === 2 && l === 1) return (1 / (2 * Math.sqrt(6))) * r * Math.exp(-r / 2)
  if (n === 3 && l === 0)
    return (2 / (81 * Math.sqrt(3))) * (27 - 18 * r + 2 * r * r) * Math.exp(-r / 3)
  if (n === 3 && l === 1) return (4 / (81 * Math.sqrt(6))) * r * (6 - r) * Math.exp(-r / 3)
  if (n === 3 && l === 2) return (4 / (81 * Math.sqrt(30))) * r * r * Math.exp(-r / 3)
  if (n === 4 && l === 0) {
    const p = r / 2 // rho = 2r / (n a0)
    return (1 / 96) * (24 - 36 * p + 12 * p * p - p * p * p) * Math.exp(-p / 2)
  }
  return 0
}

// |Y(theta)|^2 in the plotted plane, up to a constant.
// l = 0 : spherical.  l = 1 : p_z, lobes along the vertical axis.
// l = 2 : d_xz, the classic four-lobed cloverleaf.
function angular(l: number, cosT: number): number {
  if (l === 0) return 1
  if (l === 1) return cosT * cosT
  const sinT2 = 1 - cosT * cosT
  return 4 * sinT2 * cosT * cosT
}

type Orbital = {
  key: string
  n: number
  l: number
  rMax: number // Bohr radii shown across the half-width
  shape: string
}

const ORBITALS: Orbital[] = [
  { key: '1s', n: 1, l: 0, rMax: 5, shape: 'sphere' },
  { key: '2s', n: 2, l: 0, rMax: 16, shape: 'sphere (one radial node)' },
  { key: '2p', n: 2, l: 1, rMax: 14, shape: 'two lobes, nodal plane between' },
  { key: '3s', n: 3, l: 0, rMax: 30, shape: 'sphere (two radial nodes)' },
  { key: '3p', n: 3, l: 1, rMax: 30, shape: 'two lobes + one radial node' },
  { key: '3d', n: 3, l: 2, rMax: 30, shape: 'four lobes, two nodal planes' },
  { key: '4s', n: 4, l: 0, rMax: 40, shape: 'sphere (three radial nodes)' },
]

const ORANGE = '#FB923C'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

type Dot = { x: number; y: number }

// Radial nodes: interior zeros of R_{n,l}, found by scanning for sign changes.
function radialNodes(n: number, l: number, rMax: number): number[] {
  const out: number[] = []
  const steps = 4000
  let prev = radial(n, l, 1e-6)
  for (let i = 1; i <= steps; i++) {
    const r = (i / steps) * rMax
    const v = radial(n, l, r)
    if (prev !== 0 && v !== 0 && Math.sign(v) !== Math.sign(prev)) {
      const rPrev = ((i - 1) / steps) * rMax
      out.push((rPrev + r) / 2)
    }
    prev = v
  }
  return out
}

export function AtomicOrbitalAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const dotsRef = useRef<Dot[]>([])

  const [orbKey, setOrbKey] = useState('2p')
  const [running, setRunning] = useState(false)
  const [showNodes, setShowNodes] = useState(true)
  const [count, setCount] = useState(0)

  const orb = useMemo(
    () => ORBITALS.find(o => o.key === orbKey) ?? ORBITALS[0],
    [orbKey]
  )

  const nodes = useMemo(() => radialNodes(orb.n, orb.l, orb.rMax), [orb])

  // Peak of the 2-D density in the plotted plane, for rejection sampling.
  const peak = useMemo(() => {
    let m = 0
    for (let i = 1; i <= 260; i++) {
      const r = (i / 260) * orb.rMax
      const R = radial(orb.n, orb.l, r)
      const rad = R * R
      for (let j = 0; j <= 40; j++) {
        const cosT = -1 + (2 * j) / 40
        const p = rad * angular(orb.l, cosT)
        if (p > m) m = p
      }
    }
    return m
  }, [orb])

  // Radial distribution P(r) = r^2 R(r)^2, sampled once per orbital.
  const radialCurve = useMemo(() => {
    const pts: number[] = []
    let m = 0
    for (let i = 0; i <= 300; i++) {
      const r = (i / 300) * orb.rMax
      const R = radial(orb.n, orb.l, r)
      const p = r * r * R * R
      pts.push(p)
      if (p > m) m = p
    }
    return { pts, max: m || 1 }
  }, [orb])

  const sampleDot = useCallback((): Dot | null => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = (Math.random() * 2 - 1) * orb.rMax
      const z = (Math.random() * 2 - 1) * orb.rMax
      const r = Math.hypot(x, z)
      if (r < 1e-6 || r > orb.rMax) continue
      const R = radial(orb.n, orb.l, r)
      const p = R * R * angular(orb.l, z / r)
      if (Math.random() * peak < p) return { x, y: z }
    }
    return null
  }, [orb, peak])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const scale = HALF / orb.rMax

    // ---- header ----
    ctx.font = '12px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = ORANGE
    ctx.fillText(`${orb.key} orbital  ·  n = ${orb.n}, l = ${orb.l}`, PANEL_X, 26)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.45)'
    ctx.fillText('each dot is one "where was the electron?" measurement', PANEL_X, 44)

    // ---- cloud panel ----
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.lineWidth = 1
    ctx.strokeRect(PANEL_X, PANEL_Y, PANEL_S, PANEL_S)

    // Nodal surfaces
    if (showNodes) {
      ctx.save()
      ctx.setLineDash([3, 4])
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(96,165,250,0.55)'
      for (const rn of nodes) {
        ctx.beginPath()
        ctx.arc(CX, CY, rn * scale, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(167,139,250,0.55)'
      if (orb.l >= 1) {
        ctx.beginPath()
        ctx.moveTo(PANEL_X + 4, CY)
        ctx.lineTo(PANEL_X + PANEL_S - 4, CY)
        ctx.stroke()
      }
      if (orb.l >= 2) {
        ctx.beginPath()
        ctx.moveTo(CX, PANEL_Y + 4)
        ctx.lineTo(CX, PANEL_Y + PANEL_S - 4)
        ctx.stroke()
      }
      ctx.restore()
    }

    // Dots
    const dots = dotsRef.current
    ctx.fillStyle = 'rgba(251,146,60,0.55)'
    for (let i = 0; i < dots.length; i++) {
      const px = CX + dots[i].x * scale
      const py = CY - dots[i].y * scale
      ctx.fillRect(px, py, 1.7, 1.7)
    }

    // Nucleus
    ctx.beginPath()
    ctx.arc(CX, CY, 3, 0, Math.PI * 2)
    ctx.fillStyle = GOLD
    ctx.fill()

    // Scale bar
    ctx.strokeStyle = 'rgba(255,245,235,0.3)'
    ctx.lineWidth = 1
    const barLen = Math.min(HALF, 5 * scale)
    const by = PANEL_Y + PANEL_S - 14
    ctx.beginPath()
    ctx.moveTo(PANEL_X + 14, by)
    ctx.lineTo(PANEL_X + 14 + barLen, by)
    ctx.stroke()
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.textAlign = 'left'
    ctx.fillText('5 a₀', PANEL_X + 18 + barLen, by + 3)

    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,245,235,0.35)'
    ctx.font = '10px monospace'
    ctx.fillText('cross-section through the nucleus', CX, PANEL_Y + PANEL_S + 16)

    // ---- info block ----
    const ix = 356
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.75)'
    ctx.fillText(orb.shape, ix, 92)
    ctx.font = '10px monospace'
    ctx.fillStyle = BLUE
    ctx.fillText(`radial nodes  n − l − 1 = ${orb.n - orb.l - 1}`, ix, 116)
    ctx.fillStyle = VIOLET
    ctx.fillText(`angular nodes  l = ${orb.l}`, ix, 134)
    ctx.fillStyle = 'rgba(255,245,235,0.5)'
    ctx.fillText(`total nodes  n − 1 = ${orb.n - 1}`, ix, 152)
    ctx.fillStyle = GOLD
    ctx.fillText(`E = −13.6 / ${orb.n}² = ${(-13.6 / (orb.n * orb.n)).toFixed(2)} eV`, ix, 176)

    // ---- radial distribution plot ----
    ctx.strokeStyle = 'rgba(255,245,235,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PL, PT)
    ctx.lineTo(PL, PB)
    ctx.lineTo(PR, PB)
    ctx.stroke()

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.textAlign = 'left'
    ctx.fillText('P(r) = r² R(r)²', PL, PT - 8)
    ctx.textAlign = 'right'
    ctx.fillText(`r →  ${orb.rMax} a₀`, PR, PB + 16)

    const rToX = (r: number) => PL + (r / orb.rMax) * (PR - PL)

    if (showNodes) {
      ctx.save()
      ctx.setLineDash([3, 4])
      ctx.strokeStyle = 'rgba(96,165,250,0.6)'
      ctx.lineWidth = 1
      for (const rn of nodes) {
        ctx.beginPath()
        ctx.moveTo(rToX(rn), PT)
        ctx.lineTo(rToX(rn), PB)
        ctx.stroke()
      }
      ctx.restore()
    }

    ctx.beginPath()
    for (let i = 0; i <= 300; i++) {
      const r = (i / 300) * orb.rMax
      const y = PB - (radialCurve.pts[i] / radialCurve.max) * (PB - PT - 8)
      if (i === 0) ctx.moveTo(rToX(r), y)
      else ctx.lineTo(rToX(r), y)
    }
    ctx.strokeStyle = ORANGE
    ctx.lineWidth = 2
    ctx.stroke()

    // Most probable radius
    let best = 0
    for (let i = 1; i <= 300; i++) if (radialCurve.pts[i] > radialCurve.pts[best]) best = i
    const rBest = (best / 300) * orb.rMax
    ctx.beginPath()
    ctx.arc(rToX(rBest), PB - (radialCurve.pts[best] / radialCurve.max) * (PB - PT - 8), 3.5, 0, Math.PI * 2)
    ctx.fillStyle = GREEN
    ctx.fill()
    ctx.font = '9px monospace'
    ctx.fillStyle = GREEN
    ctx.textAlign = 'center'
    ctx.fillText(`most likely r ≈ ${rBest.toFixed(1)} a₀`, Math.min(PR - 52, rToX(rBest) + 6), PB - (radialCurve.pts[best] / radialCurve.max) * (PB - PT - 8) - 10)

    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,245,235,0.35)'
    ctx.font = '9px monospace'
    ctx.fillText(
      nodes.length ? 'dashed blue = radial node: P(r) touches exactly zero' : 'no radial nodes for this orbital',
      PL,
      PB + 30
    )
  }, [orb, nodes, radialCurve, showNodes])

  // Reset the cloud whenever the orbital changes.
  useEffect(() => {
    dotsRef.current = []
    setCount(0)
  }, [orbKey])

  const fillAll = useCallback(() => {
    const out: Dot[] = []
    while (out.length < MAX_DOTS) {
      const d = sampleDot()
      if (d) out.push(d)
    }
    dotsRef.current = out
    setCount(out.length)
  }, [sampleDot])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        fillAll()
        return
      }
      setRunning(true)
    },
  })

  useEffect(() => {
    if (!running) return
    const tick = () => {
      if (dotsRef.current.length < MAX_DOTS) {
        const next = dotsRef.current.slice()
        for (let i = 0; i < DOTS_PER_FRAME; i++) {
          const d = sampleDot()
          if (d) next.push(d)
        }
        dotsRef.current = next
        setCount(next.length)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, sampleDot, draw])

  useEffect(() => {
    if (!running) draw()
  }, [running, draw, count])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    dotsRef.current = []
    setCount(0)
    triggerReset()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Orbitals are probability clouds</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: '#0F0D0A' }}
        />
      </div>
      <div className="animation-controls">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {ORBITALS.map(o => (
            <button
              key={o.key}
              onClick={() => { setOrbKey(o.key); setRunning(true) }}
              className={`px-2.5 py-1.5 font-mono transition-colors ${orbKey === o.key ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {o.key}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowNodes(s => !s)}
          className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:bg-bg-hover transition-colors">
          {showNodes ? 'Hide nodes' : 'Show nodes'}
        </button>
        <span className="ml-auto font-mono text-xs text-text-muted">{count} samples</span>
      </div>
    </div>
  )
}
