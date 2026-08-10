'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 360
const BG = '#0F0D0A'

// Plasma box on the left, gauges on the right.
const BOX_L = 24
const BOX_T = 30
const BOX_W = 372
const BOX_H = 300

const INDIGO = '#818CF8'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const PINK = '#F472B6'
const GREEN = '#10B981'

// Temperature sweeps from a hot, fully ionised plasma down through
// recombination (~3000 K) to a cool, neutral, transparent gas.
const T_HOT = 4200
const T_COLD = 2000
const T_REC = 3000

const tempAt = (p: number) => T_HOT + (T_COLD - T_HOT) * p

// Ionised fraction: ~1 when hot (free electrons everywhere → opaque),
// ~0 when cool (electrons bound into atoms → transparent). A smooth
// crossover around 3000 K stands in for the Saha transition.
const ionizedFrac = (T: number) => 1 / (1 + Math.exp(-(T - T_REC) / 130))

// A representative cosmic time in years for the readout (recombination
// at p = 0.5 lands on ~380,000 yr).
const timeAt = (p: number) => Math.round(100000 + p * 560000)

type Photon = { x: number; y: number; ang: number; tx: number; ty: number }
type Site = { x: number; y: number; phase: number }

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  pDisplay: { default: 0, min: 0, max: 1, step: 0.001 },
}

export function RecombinationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const pRef = useRef(0)
  const playingRef = useRef(false)
  const photonsRef = useRef<Photon[]>([])
  const sitesRef = useRef<Site[]>([])

  const { params, set, permalink, isDefault, restored } = useWidgetParams('recombination', SPEC)
  const { pDisplay } = params
  const [playing, setPlaying] = useState(false)

  // Build the particle field once (client-only widget, so Math.random is fine).
  if (photonsRef.current.length === 0) {
    photonsRef.current = Array.from({ length: 70 }, () => {
      const x = rand(BOX_L + 12, BOX_L + BOX_W - 12)
      const y = rand(BOX_T + 12, BOX_T + BOX_H - 12)
      return { x, y, ang: rand(0, Math.PI * 2), tx: x, ty: y }
    })
    sitesRef.current = Array.from({ length: 30 }, () => ({
      x: rand(BOX_L + 18, BOX_L + BOX_W - 18),
      y: rand(BOX_T + 18, BOX_T + BOX_H - 18),
      phase: rand(0, Math.PI * 2),
    }))
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const p = pRef.current
    const T = tempAt(p)
    const ion = ionizedFrac(T)
    const speed = 1.4 + (1 - ion) * 1.8 // photons stream faster once free

    ctx.clearRect(0, 0, W, H)

    // --- plasma glow: reddish fog when ionised, clearing as it recombines ---
    ctx.fillStyle = `rgba(245,158,11,${(ion * 0.14).toFixed(3)})`
    ctx.fillRect(BOX_L, BOX_T, BOX_W, BOX_H)
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.strokeRect(BOX_L + 0.5, BOX_T + 0.5, BOX_W - 1, BOX_H - 1)

    // --- matter: proton + electron at each site; the electron falls onto the
    // proton (binds into a neutral atom) as the gas recombines. ---
    const bound = 1 - ion
    for (const s of sitesRef.current) {
      s.phase += 0.05
      const off = 3 + ion * 11
      const ex = s.x + Math.cos(s.phase) * off
      const ey = s.y + Math.sin(s.phase) * off
      // proton
      ctx.fillStyle = PINK
      ctx.globalAlpha = 0.9
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.4, 0, Math.PI * 2); ctx.fill()
      // bound electron shell (grows in as it recombines)
      if (bound > 0.15) {
        ctx.strokeStyle = `rgba(96,165,250,${(bound * 0.6).toFixed(3)})`
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(s.x, s.y, 5.5, 0, Math.PI * 2); ctx.stroke()
      }
      // free electron (drifts away while ionised, snaps home while neutral)
      ctx.fillStyle = BLUE
      ctx.globalAlpha = 0.55 + ion * 0.45
      ctx.beginPath(); ctx.arc(ex, ey, 1.8, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1
    }

    // --- photons: zig-zag trapped while free electrons abound, then stream
    // in straight lines once the fog clears. ---
    for (const ph of photonsRef.current) {
      if (Math.random() < ion * 0.22) ph.ang = rand(0, Math.PI * 2) // scatter
      const nx = ph.x + Math.cos(ph.ang) * speed
      const ny = ph.y + Math.sin(ph.ang) * speed
      // reflect off the walls
      if (nx < BOX_L + 4 || nx > BOX_L + BOX_W - 4) ph.ang = Math.PI - ph.ang
      else ph.x = nx
      if (ny < BOX_T + 4 || ny > BOX_T + BOX_H - 4) ph.ang = -ph.ang
      else ph.y = ny
      ph.x = Math.max(BOX_L + 4, Math.min(BOX_L + BOX_W - 4, ph.x))
      ph.y = Math.max(BOX_T + 4, Math.min(BOX_T + BOX_H - 4, ph.y))
      // tail length grows as photons travel freely
      const tail = 3 + (1 - ion) * 9
      ctx.strokeStyle = `rgba(245,158,11,${(0.35 + (1 - ion) * 0.5).toFixed(3)})`
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(ph.x, ph.y)
      ctx.lineTo(ph.x - Math.cos(ph.ang) * tail, ph.y - Math.sin(ph.ang) * tail)
      ctx.stroke()
      ctx.fillStyle = GOLD
      ctx.beginPath(); ctx.arc(ph.x, ph.y, 1.6, 0, Math.PI * 2); ctx.fill()
    }

    // --- release arrows: light streaming out in every direction once free ---
    const release = Math.max(0, 1 - ion - 0.25)
    if (release > 0.02) {
      ctx.strokeStyle = `rgba(129,140,248,${(release * 0.9).toFixed(3)})`
      ctx.lineWidth = 1.6
      const cx = BOX_L + BOX_W / 2
      const cy = BOX_T + BOX_H / 2
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        const r0 = BOX_H / 2 - 6
        const r1 = r0 + 14 * release
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
        ctx.stroke()
      }
    }

    // --- status caption under the box ---
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = ion > 0.55 ? GOLD : GREEN
    ctx.fillText(
      ion > 0.55 ? 'OPAQUE — photons scatter off free electrons' : 'TRANSPARENT — light streams free in all directions',
      BOX_L, BOX_T + BOX_H + 18
    )

    // --- right-hand temperature gauge ---
    const GX = 448
    const GTOP = 44
    const GBOT = 300
    const yOfT = (t: number) => GBOT - ((t - T_COLD) / (T_HOT - T_COLD)) * (GBOT - GTOP)
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 6
    ctx.beginPath(); ctx.moveTo(GX, GTOP); ctx.lineTo(GX, GBOT); ctx.stroke()
    // hot(top)→cool(bottom) tint
    ctx.strokeStyle = 'rgba(245,158,11,0.35)'
    ctx.lineWidth = 6
    ctx.beginPath(); ctx.moveTo(GX, GTOP); ctx.lineTo(GX, yOfT(T)); ctx.stroke()
    // recombination reference line at 3000 K
    const yRec = yOfT(T_REC)
    ctx.strokeStyle = 'rgba(255,245,235,0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(GX - 18, yRec); ctx.lineTo(GX + 120, yRec); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.7)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('recombination', GX + 14, yRec - 14)
    ctx.fillText('~3000 K · ~380,000 yr', GX + 14, yRec - 4)
    // current-temperature marker
    const yNow = yOfT(T)
    ctx.fillStyle = INDIGO
    ctx.beginPath(); ctx.arc(GX, yNow, 5, 0, Math.PI * 2); ctx.fill()

    // --- numeric readouts ---
    ctx.textAlign = 'left'
    ctx.fillStyle = INDIGO
    ctx.font = 'bold 20px monospace'
    ctx.fillText(`${Math.round(T)} K`, GX + 14, GTOP + 8)
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.font = '10px monospace'
    ctx.fillText(`t ≈ ${timeAt(p).toLocaleString()} yr`, GX + 14, GTOP + 24)
    ctx.fillText(`ionised: ${Math.round(ion * 100)}%`, GX + 14, GBOT - 6)
  }, [])

  // One persistent loop animates the particles and, while playing, cools.
  useEffect(() => {
    const loop = () => {
      if (playingRef.current) {
        pRef.current = Math.min(1, pRef.current + 0.0035)
        set('pDisplay', pRef.current)
        if (pRef.current >= 1) { playingRef.current = false; setPlaying(false) }
      }
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, set])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        pRef.current = 1
        set('pDisplay', 1)
        return
      }
      pRef.current = 0
      set('pDisplay', 0)
      playingRef.current = true
      setPlaying(true)
    },
  })

  const toggle = () => {
    if (pRef.current >= 1) { pRef.current = 0; set('pDisplay', 0) }
    playingRef.current = !playingRef.current
    setPlaying(playingRef.current)
  }

  const resetAll = () => {
    playingRef.current = false
    setPlaying(false)
    pRef.current = 0
    set('pDisplay', 0)
    triggerReset()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Cool the universe until the fog clears</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Cool the universe until the fog clears. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: BG }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={toggle}
          className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:bg-bg-hover transition-colors"
        >
          {playing ? 'Pause' : pDisplay >= 1 ? 'Replay' : 'Cool ▸'}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>hot</span>
          <input
            type="range" min={SPEC.pDisplay.min} max={SPEC.pDisplay.max} step={SPEC.pDisplay.step} value={pDisplay}
            onChange={e => {
              playingRef.current = false
              setPlaying(false)
              pRef.current = +e.target.value
              set('pDisplay', pRef.current)
            }}
            className="w-44 accent-accent-indigo"
          />
          <span>cool</span>
        </label>
        <span className="ml-auto font-mono text-xs text-text-muted">
          T = <strong className="text-accent-indigo">{Math.round(tempAt(pDisplay))} K</strong>
        </span>
      </div>
    </div>
  )
}
