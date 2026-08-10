'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 620
const H = 420
const BG = '#0F0D0A'
const INDIGO = '#818CF8'

const LEFT = 66
const RIGHT = 18
const TOP = 26
const BOTTOM = 344
const PLOT_W = W - LEFT - RIGHT
const PLOT_H = BOTTOM - TOP

// Temperature axis is REVERSED: hot left, cool right.
const LOG_T_HOT = Math.log10(42000)
const LOG_T_COOL = Math.log10(2600)
const LOG_L_MIN = -4.5
const LOG_L_MAX = 6.2

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const xOfT = (t: number) =>
  LEFT + ((LOG_T_HOT - Math.log10(clamp(t, 2600, 42000))) / (LOG_T_HOT - LOG_T_COOL)) * PLOT_W
const yOfL = (l: number) =>
  BOTTOM - ((Math.log10(clamp(l, 1e-4, 1e6)) - LOG_L_MIN) / (LOG_L_MAX - LOG_L_MIN)) * PLOT_H

const ANCHORS: [number, [number, number, number]][] = [
  [40000, [148, 176, 255]],
  [20000, [170, 191, 255]],
  [10000, [202, 216, 255]],
  [7500, [248, 247, 255]],
  [6000, [255, 244, 232]],
  [5200, [255, 232, 170]],
  [4200, [255, 200, 120]],
  [3500, [255, 150, 90]],
  [2800, [255, 110, 71]],
]
const tempColor = (t: number): string => {
  if (t >= ANCHORS[0][0]) return `rgb(${ANCHORS[0][1].join(',')})`
  const last = ANCHORS[ANCHORS.length - 1]
  if (t <= last[0]) return `rgb(${last[1].join(',')})`
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [t0, c0] = ANCHORS[i]
    const [t1, c1] = ANCHORS[i + 1]
    if (t <= t0 && t >= t1) {
      const f = (t - t1) / (t0 - t1)
      const r = Math.round(c1[0] + (c0[0] - c1[0]) * f)
      const g = Math.round(c1[1] + (c0[1] - c1[1]) * f)
      const b = Math.round(c1[2] + (c0[2] - c1[2]) * f)
      return `rgb(${r},${g},${b})`
    }
  }
  return '#fff'
}

type WP = { t: number; l: number; phase: string }

const TRACKS: Record<string, WP[]> = {
  low: [
    { t: 5800, l: 1, phase: 'Main sequence (type G)' },
    { t: 5400, l: 2, phase: 'Core hydrogen exhausted' },
    { t: 4600, l: 40, phase: 'Red-giant branch' },
    { t: 3400, l: 2200, phase: 'RGB tip — helium flash' },
    { t: 4900, l: 55, phase: 'Helium-core burning' },
    { t: 3300, l: 3000, phase: 'Asymptotic giant branch' },
    { t: 42000, l: 8, phase: 'Planetary nebula — hot core' },
    { t: 11000, l: 0.002, phase: 'White dwarf (cooling forever)' },
  ],
  high: [
    { t: 33000, l: 12000, phase: 'Main sequence (type O)' },
    { t: 24000, l: 18000, phase: 'Core hydrogen exhausted' },
    { t: 11000, l: 45000, phase: 'Expanding and cooling' },
    { t: 6000, l: 70000, phase: 'Crossing the diagram' },
    { t: 3900, l: 110000, phase: 'Red supergiant' },
    { t: 3600, l: 170000, phase: 'Iron core — burning ends' },
    { t: 3600, l: 400000, phase: 'SUPERNOVA' },
    { t: 40000, l: 0.02, phase: 'Neutron star (surface off-scale hot)' },
  ],
}

// position at fractional progress p in [0,1] across the waypoint polyline, log-interp
const posAt = (wps: WP[], p: number): { t: number; l: number; idx: number; local: number } => {
  const seg = clamp(p, 0, 1) * (wps.length - 1)
  const idx = Math.min(wps.length - 2, Math.floor(seg))
  const local = seg - idx
  const a = wps[idx]
  const b = wps[idx + 1]
  const logT = Math.log10(a.t) + (Math.log10(b.t) - Math.log10(a.t)) * local
  const logL = Math.log10(a.l) + (Math.log10(b.l) - Math.log10(a.l)) * local
  return { t: Math.pow(10, logT), l: Math.pow(10, logL), idx, local }
}

// Faint reference main-sequence band.
const MS_REF: [number, number][] = [
  [38000, 130000], [13000, 700], [7200, 5], [5800, 1], [4200, 0.1], [3000, 0.006],
]

export function StellarEvolutionTrackAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const pRef = useRef(0)
  const playingRef = useRef(false)
  const massRef = useRef<'low' | 'high'>('low')

  const [mass, setMass] = useState<'low' | 'high'>('low')
  const [playing, setPlaying] = useState(false)
  const [pDisplay, setPDisplay] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    // ---- grid + axes ----
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    const tTicks = [40000, 20000, 10000, 7000, 5000, 3500, 3000]
    for (const t of tTicks) {
      const x = xOfT(t)
      ctx.strokeStyle = 'rgba(255,245,235,0.05)'
      ctx.beginPath()
      ctx.moveTo(x, TOP)
      ctx.lineTo(x, BOTTOM)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.45)'
      ctx.fillText(`${(t / 1000).toFixed(0)}k`, x, BOTTOM + 14)
    }
    ctx.textAlign = 'right'
    for (let e = -4; e <= 6; e += 2) {
      const y = yOfL(Math.pow(10, e))
      ctx.strokeStyle = 'rgba(255,245,235,0.05)'
      ctx.beginPath()
      ctx.moveTo(LEFT, y)
      ctx.lineTo(LEFT + PLOT_W, y)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.45)'
      ctx.fillText(e === 0 ? '1' : `10${sup(e)}`, LEFT - 8, y + 3)
    }
    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.lineWidth = 1
    ctx.strokeRect(LEFT, TOP, PLOT_W, PLOT_H)

    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('surface temperature (K) — hot ◂ left · right ▸ cool', LEFT + PLOT_W / 2, BOTTOM + 30)
    ctx.save()
    ctx.translate(16, TOP + PLOT_H / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('luminosity (L / L☉, log)', 0, 0)
    ctx.restore()

    // faint main-sequence reference
    ctx.strokeStyle = 'rgba(245,240,232,0.14)'
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.beginPath()
    MS_REF.forEach(([t, l], i) => {
      const x = xOfT(t)
      const y = yOfL(l)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    ctx.lineCap = 'butt'

    const wps = TRACKS[massRef.current]
    const p = pRef.current

    // ---- the trail: sample the path from start to current p ----
    const STEPS = 260
    const upto = Math.round(p * STEPS)
    ctx.lineWidth = 2.5
    ctx.strokeStyle = 'rgba(129,140,248,0.85)'
    ctx.beginPath()
    for (let i = 0; i <= upto; i++) {
      const pos = posAt(wps, i / STEPS)
      const x = xOfT(pos.t)
      const y = yOfL(pos.l)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // waypoint markers already reached
    const cur = posAt(wps, p)
    for (let i = 0; i < wps.length; i++) {
      const reached = p * (wps.length - 1) >= i - 0.01
      if (!reached) continue
      const x = xOfT(wps[i].t)
      const y = yOfL(wps[i].l)
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.beginPath()
      ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // ---- supernova flash (high mass, near the SUPERNOVA waypoint) ----
    if (massRef.current === 'high') {
      const snIdx = wps.findIndex(w => w.phase === 'SUPERNOVA')
      const snP = snIdx / (wps.length - 1)
      const window = 0.14
      if (p >= snP && p <= snP + window) {
        const f = (p - snP) / window // 0..1
        const x = xOfT(wps[snIdx].t)
        const y = yOfL(wps[snIdx].l)
        const rad = 8 + f * 90
        ctx.globalAlpha = 1 - f
        const grad = ctx.createRadialGradient(x, y, 2, x, y, rad)
        grad.addColorStop(0, 'rgba(255,244,220,0.9)')
        grad.addColorStop(0.4, 'rgba(255,158,60,0.5)')
        grad.addColorStop(1, 'rgba(255,90,60,0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(x, y, rad, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    // ---- the moving star head ----
    const hx = xOfT(cur.t)
    const hy = yOfL(cur.l)
    const col = tempColor(cur.t)
    ctx.globalAlpha = 0.3
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(hx, hy, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(hx, hy, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = INDIGO
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(hx, hy, 8, 0, Math.PI * 2)
    ctx.stroke()

    // start-of-track label
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    const startX = xOfT(wps[0].t)
    const startY = yOfL(wps[0].l)
    ctx.fillText('born here', startX + 8, startY + 3)
  }, [])

  useEffect(() => {
    const loop = () => {
      if (playingRef.current) {
        pRef.current = Math.min(1, pRef.current + 0.0032)
        setPDisplay(pRef.current)
        if (pRef.current >= 1) {
          playingRef.current = false
          setPlaying(false)
        }
      }
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        pRef.current = 1
        setPDisplay(1)
        playingRef.current = false
        draw()
        return
      }
      pRef.current = 0
      setPDisplay(0)
      playingRef.current = true
      setPlaying(true)
    },
  })

  const play = () => {
    if (pRef.current >= 1) {
      pRef.current = 0
      setPDisplay(0)
    }
    playingRef.current = true
    setPlaying(true)
  }

  const resetAll = () => {
    playingRef.current = false
    setPlaying(false)
    pRef.current = 0
    setPDisplay(0)
    triggerReset()
    draw()
  }

  const chooseMass = (m: 'low' | 'high') => {
    massRef.current = m
    setMass(m)
    playingRef.current = false
    setPlaying(false)
    pRef.current = 0
    setPDisplay(0)
    draw()
  }

  const wps = TRACKS[mass]
  const cur = posAt(wps, pDisplay)
  const phase = wps[Math.min(wps.length - 1, Math.round(pDisplay * (wps.length - 1)))].phase

  return (
    <div className="animation-block" ref={ref}>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span style={{ color: INDIGO }}>{mass === 'low' ? '1 M☉' : '10 M☉'} star</span>
        <span>phase: {phase}</span>
        <span>T ≈ {Math.round(cur.t).toLocaleString()} K</span>
        <span>L ≈ {cur.l >= 1 ? cur.l.toFixed(cur.l >= 100 ? 0 : 1) : cur.l.toExponential(1)} L☉</span>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: Stellar evolution track. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: BG }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={play}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={13} /> {playing ? 'Playing…' : pDisplay >= 1 ? 'Replay' : 'Play'}
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border text-text-secondary hover:bg-bg-hover"
        >
          <RotateCcw size={13} /> Reset
        </button>
        <div className="flex items-center gap-1.5 ml-2">
          <button
            onClick={() => chooseMass('low')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border"
            style={mass === 'low' ? { background: INDIGO, color: BG, borderColor: INDIGO } : undefined}
          >
            1 M☉
          </button>
          <button
            onClick={() => chooseMass('high')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border"
            style={mass === 'high' ? { background: INDIGO, color: BG, borderColor: INDIGO } : undefined}
          >
            10 M☉
          </button>
        </div>
        <WidgetStatus className="ml-auto text-xs text-text-muted">
          {mass === 'low' ? 'ends as a white dwarf' : 'ends in supernova → neutron star'}
        </WidgetStatus>
      </div>
    </div>
  )
}

function sup(n: number): string {
  const map: Record<string, string> = {
    '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
  }
  return String(n)
    .split('')
    .map(c => map[c] ?? c)
    .join('')
}
