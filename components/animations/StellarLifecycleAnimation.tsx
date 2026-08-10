'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 320
const PAD = { left: 52, right: 18, top: 20, bottom: 40 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

// Axis ranges (log). Temperature is reversed: hot on the LEFT, as astronomers draw it.
const T_HOT = 50000 // K, left edge
const T_COOL = 2500 // K, right edge
const L_MIN = 1e-4 // L_sun, bottom
const L_MAX = 1e6 // L_sun, top

const INDIGO = '#818CF8'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const CYAN = '#22D3EE'

// Main-sequence surface temperature (K) anchored to real spectral types.
const MS_TEMP: [number, number][] = [
  [0.1, 2900], [0.3, 3400], [0.5, 3800], [0.8, 5000], [1.0, 5772],
  [1.5, 7300], [2.0, 9000], [3.0, 11500], [5.0, 17000], [10, 24000],
  [20, 35000], [40, 42000],
]

function tempOf(M: number): number {
  if (M <= MS_TEMP[0][0]) return MS_TEMP[0][1]
  const last = MS_TEMP[MS_TEMP.length - 1]
  if (M >= last[0]) return last[1]
  for (let i = 1; i < MS_TEMP.length; i++) {
    const [m1, t1] = MS_TEMP[i]
    if (M <= m1) {
      const [m0, t0] = MS_TEMP[i - 1]
      const f = (Math.log10(M) - Math.log10(m0)) / (Math.log10(m1) - Math.log10(m0))
      return t0 + f * (t1 - t0)
    }
  }
  return last[1]
}

const lumOf = (M: number) => Math.pow(M, 3.5) // mass-luminosity relation, L in solar units
const msLifeGyr = (M: number) => 10 * Math.pow(M, -2.5) // main-sequence lifetime

type Pt = { T: number; L: number }

// The idealized evolutionary track: born on the main sequence, drift along it,
// swell into a giant, then collapse to a mass-determined remnant.
function trackOf(M: number) {
  const zams: Pt = { T: tempOf(M), L: lumOf(M) }
  const tams: Pt = { T: tempOf(M) * 0.88, L: lumOf(M) * 2.2 }
  const giant: Pt = {
    T: 3300 + 220 * Math.log10(M + 1),
    L: Math.min(3e5, Math.max(1000, lumOf(M) * 120)),
  }
  let endpoint: Pt
  let remnant: string
  if (M < 8) { endpoint = { T: 22000, L: 0.008 }; remnant = 'White dwarf' }
  else if (M < 25) { endpoint = { T: 60000, L: 1.4e-4 }; remnant = 'Neutron star' }
  else { endpoint = { T: 40000, L: 1.1e-4 }; remnant = 'Black hole' }
  return { zams, tams, giant, endpoint, remnant }
}

function starColor(T: number): string {
  if (T >= 10000) return BLUE
  if (T >= 7300) return VIOLET
  if (T >= 5200) return GOLD
  if (T >= 3900) return '#FB923C'
  return PINK
}

// Log-space interpolation between two H-R points.
function lerpPt(a: Pt, b: Pt, f: number): Pt {
  const lt = Math.log10(a.T) + f * (Math.log10(b.T) - Math.log10(a.T))
  const ll = Math.log10(a.L) + f * (Math.log10(b.L) - Math.log10(a.L))
  return { T: Math.pow(10, lt), L: Math.pow(10, ll) }
}

const SEG_MS = 0.86 // fraction of on-screen life spent on the main sequence
const SEG_RG = 0.95 // ... to the red-giant tip

function fmtAge(gyr: number): string {
  if (gyr >= 1) return `${gyr.toFixed(1)} Gyr`
  if (gyr >= 1e-3) return `${(gyr * 1000).toFixed(0)} Myr`
  return `${(gyr * 1e6).toFixed(0)} kyr`
}

export function StellarLifecycleAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => { if (!reduced) setRunning(true) },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const elapsedRef = useRef(0)
  const lastRef = useRef<number | null>(null)

  const [mass, setMass] = useState(1)
  const [running, setRunning] = useState(false)
  const [readout, setReadout] = useState({ phase: 'Main sequence', age: '0 Myr', T: 5772, L: 1 })

  const xT = useCallback(
    (T: number) => PAD.left + ((Math.log10(T_HOT) - Math.log10(T)) / (Math.log10(T_HOT) - Math.log10(T_COOL))) * PLOT_W,
    []
  )
  const yL = useCallback((L: number) => {
    const c = Math.max(L_MIN, Math.min(L_MAX, L))
    return PAD.top + PLOT_H - ((Math.log10(c) - Math.log10(L_MIN)) / (Math.log10(L_MAX) - Math.log10(L_MIN))) * PLOT_H
  }, [])

  const draw = useCallback((p: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // Faint grid
    ctx.strokeStyle = 'rgba(255,245,235,0.04)'
    ctx.lineWidth = 1
    for (let e = -4; e <= 6; e += 2) {
      const y = yL(Math.pow(10, e))
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + PLOT_W, y); ctx.stroke()
    }
    for (const T of [40000, 20000, 10000, 5000, 3000]) {
      const x = xT(T)
      ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + PLOT_H); ctx.stroke()
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()

    // Axis labels
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '10px monospace'
    ctx.fillText('luminosity (L / L☉)', PAD.left - 4, PAD.top - 7)
    ctx.textAlign = 'right'
    for (const e of [6, 4, 2, 0, -2, -4]) {
      ctx.fillText(`10^${e}`, PAD.left - 6, yL(Math.pow(10, e)) + 3)
    }
    ctx.textAlign = 'center'
    for (const T of [40000, 20000, 10000, 5000, 3000]) {
      ctx.fillText(`${(T / 1000).toFixed(0)}k`, xT(T), PAD.top + PLOT_H + 15)
    }
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('← hotter    surface temperature (K)    cooler →', PAD.left + PLOT_W / 2, PAD.top + PLOT_H + 30)
    ctx.textAlign = 'left'

    // Main-sequence band (the diagonal)
    ctx.strokeStyle = 'rgba(129,140,248,0.55)'
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.beginPath()
    let started = false
    for (let lm = -1; lm <= 1.602; lm += 0.05) {
      const M = Math.pow(10, lm)
      const x = xT(tempOf(M)), y = yL(lumOf(M))
      if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.lineCap = 'butt'
    ctx.fillStyle = 'rgba(129,140,248,0.75)'
    ctx.font = 'italic 10px monospace'
    ctx.fillText('main sequence', xT(6500) - 10, yL(0.9) + 26)
    ctx.fillStyle = 'rgba(244,114,182,0.6)'
    ctx.fillText('giant branch', xT(4200) - 20, yL(2500) - 6)
    ctx.font = '10px monospace'

    const tr = trackOf(mass)

    // The evolutionary track path (drawn faint, full)
    const key: [Pt, Pt, number, number][] = [
      [tr.zams, tr.tams, 0, SEG_MS],
      [tr.tams, tr.giant, SEG_MS, SEG_RG],
      [tr.giant, tr.endpoint, SEG_RG, 1],
    ]
    ctx.strokeStyle = 'rgba(245,240,232,0.16)'
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1.25
    ctx.beginPath()
    ctx.moveTo(xT(tr.zams.T), yL(tr.zams.L))
    for (const [a, b] of key) {
      for (let i = 1; i <= 24; i++) { const q = lerpPt(a, b, i / 24); ctx.lineTo(xT(q.T), yL(q.L)) }
    }
    ctx.stroke()
    ctx.setLineDash([])

    // Current position + travelled trail
    let cur: Pt = tr.zams
    let phase = 'Main sequence'
    const life = msLifeGyr(mass) / SEG_MS
    ctx.strokeStyle = starColor(tr.zams.T)
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(xT(tr.zams.T), yL(tr.zams.L))
    for (const [a, b, s0, s1] of key) {
      const local = Math.max(0, Math.min(1, (p - s0) / (s1 - s0)))
      if (local > 0) {
        const steps = Math.max(1, Math.round(local * 24))
        for (let i = 1; i <= steps; i++) {
          const q = lerpPt(a, b, (i / steps) * local)
          ctx.lineTo(xT(q.T), yL(q.L))
        }
      }
      if (p >= s0 && p <= s1) cur = lerpPt(a, b, local)
      else if (p > s1) cur = b
    }
    ctx.stroke()

    if (p < SEG_MS) phase = 'Main sequence'
    else if (p < SEG_RG) phase = mass >= 8 ? 'Supergiant' : 'Red giant'
    else if (p < 0.995) phase = mass >= 8 ? 'Supernova' : 'Planetary nebula'
    else phase = tr.remnant

    // Endpoint marker once reached
    if (p >= 0.995) {
      const ex = xT(tr.endpoint.T), ey = yL(tr.endpoint.L)
      if (tr.remnant === 'Black hole') {
        const g = ctx.createRadialGradient(ex, ey, 1, ex, ey, 14)
        g.addColorStop(0, 'rgba(129,140,248,0.5)'); g.addColorStop(1, 'rgba(129,140,248,0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, 14, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = INDIGO; ctx.lineWidth = 1.5; ctx.stroke()
      } else {
        ctx.fillStyle = tr.remnant === 'Neutron star' ? CYAN : BLUE
        ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill()
      }
      ctx.fillStyle = 'rgba(245,240,232,0.75)'
      ctx.fillText(tr.remnant, ex + 8, ey + 4)
    }

    // The star itself
    const col = starColor(cur.T)
    const rad = 4 + 3 * Math.min(1, Math.max(0, (Math.log10(cur.L) + 1) / 6))
    const cx = xT(cur.T), cy = yL(cur.L)
    if (phase === 'Supernova') {
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 22)
      g.addColorStop(0, 'rgba(245,158,11,0.85)'); g.addColorStop(1, 'rgba(245,158,11,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill()
    } else {
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, rad + 6)
      g.addColorStop(0, col + 'cc'); g.addColorStop(1, col + '00')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad + 6, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = col
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill()

    setReadout({ phase, age: fmtAge(p * life), T: cur.T, L: cur.L })
  }, [mass, xT, yL])

  useEffect(() => { draw(elapsedRef.current === 0 ? 0 : Math.min(1, elapsedRef.current)) }, [draw])

  useEffect(() => {
    if (!running) { lastRef.current = null; cancelAnimationFrame(rafRef.current); return }
    // Wall-clock duration scales with log(lifetime): a massive star races, a red dwarf crawls.
    const loglife = Math.log10(msLifeGyr(mass))
    const wallMs = Math.max(4000, Math.min(16000, 4000 + ((loglife + 3) / 6.5) * 12000))
    const loop = (t: number) => {
      if (lastRef.current === null) lastRef.current = t
      const dt = Math.min(64, t - lastRef.current)
      lastRef.current = t
      elapsedRef.current = Math.min(1, elapsedRef.current + dt / wallMs)
      draw(elapsedRef.current)
      if (elapsedRef.current >= 1) { setRunning(false); return }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, mass, draw])

  const restart = () => { elapsedRef.current = 0; lastRef.current = null; setRunning(true) }
  const resetAll = () => {
    triggerReset(); setRunning(false)
    elapsedRef.current = 0; lastRef.current = null
    setMass(1); draw(0)
  }

  const life = msLifeGyr(mass)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The H–R diagram &amp; a star&apos;s track</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: The H–R diagram &amp; a star&apos;s track. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => (elapsedRef.current >= 1 ? restart() : setRunning(r => !r))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-bg-base text-xs font-medium transition-colors"
          style={{ background: INDIGO }}
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> {elapsedRef.current >= 1 ? 'Replay' : 'Play'}</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Mass:</span>
          <input
            type="range" min={-1} max={1.602} step={0.01} value={Math.log10(mass)}
            onChange={ev => { setMass(Math.pow(10, +ev.target.value)); elapsedRef.current = 0; lastRef.current = null }}
            className="w-36"
            style={{ accentColor: INDIGO }}
          />
          <span className="text-text-secondary font-medium">{mass < 1 ? mass.toFixed(2) : mass.toFixed(1)} M☉</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary">
          MS life ≈ <strong style={{ color: INDIGO }}>{fmtAge(life)}</strong>
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Phase: <strong className="text-text-secondary font-mono">{readout.phase}</strong> ·
        age <strong style={{ color: GOLD }} className="font-mono">{readout.age}</strong> ·
        T ≈ <strong className="font-mono" style={{ color: starColor(readout.T) }}>{Math.round(readout.T / 100) * 100} K</strong> ·
        L ≈ <strong className="font-mono" style={{ color: INDIGO }}>{readout.L >= 1 ? Math.round(readout.L).toLocaleString() : readout.L.toExponential(1)} L☉</strong>
      </p>
    </div>
  )
}
