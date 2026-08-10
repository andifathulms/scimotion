'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300
const CX = 300
const CY = 150

const LIME = '#A3E635' // the cell / its membrane
const BLUE = '#60A5FA' // water
const VIOLET = '#A78BFA' // external solute
const GOLD = '#F59E0B' // internal solute
const PINK = '#F472B6' // burst / warning

type Tonicity = 'hypo' | 'iso' | 'hyper'

// Isotonic reference radius. Inside holds a fixed amount of solute; the target
// radius is set so the internal concentration matches the external one:
//   Cin = S / (π r²)  ⇒  r_target = R0 / √(Cout/Cin0)
const R0 = 58
const R_BURST = 90

// External solute concentration relative to the cell's internal (isotonic = 1).
const OUT_CONC: Record<Tonicity, number> = { hypo: 0.4, iso: 1, hyper: 2.1 }
const N_OUT_SOLUTE: Record<Tonicity, number> = { hypo: 10, iso: 24, hyper: 46 }
const N_IN_SOLUTE = 22
const N_WATER = 60

const LABEL: Record<Tonicity, string> = {
  hypo: 'Hypotonic — more solute inside → net water flows IN → cell swells (may burst / lyse)',
  iso: 'Isotonic — solute balanced → no net water flow → cell holds its shape',
  hyper: 'Hypertonic — more solute outside → net water flows OUT → cell shrivels (crenation)',
}

// Deterministic PRNG so every render is identical (no Math.random / Date).
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Polar = { ang: number; frac: number } // inside solute: radius = r * frac
type Pt = { x: number; y: number }
type Water = { x: number; y: number; vx: number; vy: number }

export function TonicityAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const rngRef = useRef(mulberry32(20260730))
  const rRef = useRef(R0)
  const burstRef = useRef(false)
  const burstTRef = useRef(0)
  const tonRef = useRef<Tonicity>('iso')
  const inSoluteRef = useRef<Polar[]>([])
  const outSoluteRef = useRef<Pt[]>([])
  const waterRef = useRef<Water[]>([])

  const [running, setRunning] = useState(false)
  const [tonicity, setTonicity] = useState<Tonicity>('hypo')

  useEffect(() => {
    tonRef.current = tonicity
  }, [tonicity])

  const seedSolutes = useCallback((ton: Tonicity) => {
    const rng = rngRef.current
    // Internal solute in polar coords so it tracks the changing radius.
    inSoluteRef.current = Array.from({ length: N_IN_SOLUTE }, () => ({
      ang: rng() * Math.PI * 2,
      frac: Math.sqrt(rng()) * 0.82,
    }))
    // External solute scattered across the bath, kept clear of the cell.
    const out: Pt[] = []
    let guard = 0
    while (out.length < N_OUT_SOLUTE[ton] && guard < 2000) {
      guard++
      const x = 16 + rng() * (W - 32)
      const y = 16 + rng() * (H - 32)
      if (Math.hypot(x - CX, y - CY) > R_BURST + 12) out.push({ x, y })
    }
    outSoluteRef.current = out
  }, [])

  const seed = useCallback(() => {
    rngRef.current = mulberry32(20260730)
    const rng = rngRef.current
    const ton = tonRef.current
    rRef.current = R0
    burstRef.current = false
    burstTRef.current = 0
    seedSolutes(ton)
    waterRef.current = Array.from({ length: N_WATER }, () => ({
      x: 12 + rng() * (W - 24),
      y: 12 + rng() * (H - 24),
      vx: (rng() - 0.5) * 1.6,
      vy: (rng() - 0.5) * 1.6,
    }))
  }, [seedSolutes])

  const targetRadius = (ton: Tonicity) => R0 / Math.sqrt(OUT_CONC[ton])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    const r = rRef.current
    const burst = burstRef.current

    // Bath background.
    ctx.fillStyle = 'rgba(167,139,250,0.05)'
    ctx.fillRect(0, 0, W, H)

    // Net-flux label.
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.fillText('solution (bath)', 12, 20)

    // Water molecules.
    for (const w of waterRef.current) {
      ctx.beginPath()
      ctx.arc(w.x, w.y, 1.7, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(96,165,250,0.75)'
      ctx.fill()
    }

    // External solute (cannot cross the membrane).
    for (const s of outSoluteRef.current) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, 3.4, 0, Math.PI * 2)
      ctx.fillStyle = VIOLET
      ctx.fill()
    }

    if (!burst) {
      // Cell body. Hypertonic shrinkage crenates the rim into scalloped lobes.
      const shrink = Math.max(0, Math.min(1, (R0 - r) / (R0 - targetRadius('hyper'))))
      ctx.beginPath()
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2
        const cren = shrink > 0.15 ? Math.cos(a * 9) * shrink * 5 : 0
        const rr = r + cren
        const x = CX + rr * Math.cos(a)
        const y = CY + rr * Math.sin(a)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fillStyle = 'rgba(163,230,53,0.07)'
      ctx.fill()
      // Membrane — thickens toward warning as it stretches.
      const stretch = Math.max(0, Math.min(1, (r - R0) / (R_BURST - R0)))
      ctx.lineWidth = 2 + stretch * 1.5
      ctx.strokeStyle = stretch > 0.7 ? `${PINK}dd` : `${LIME}dd`
      ctx.stroke()

      // Internal solute.
      for (const s of inSoluteRef.current) {
        const rr = r * s.frac
        ctx.beginPath()
        ctx.arc(CX + rr * Math.cos(s.ang), CY + rr * Math.sin(s.ang), 3, 0, Math.PI * 2)
        ctx.fillStyle = GOLD
        ctx.fill()
      }

      ctx.fillStyle = 'rgba(163,230,53,0.7)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('red blood cell', CX, CY - Math.max(r, 30) - 6)
    } else {
      // Burst: a ragged ring and dispersing internal solute.
      const t = burstTRef.current
      ctx.strokeStyle = `${PINK}${t > 1 ? '55' : 'aa'}`
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2
        const jag = R_BURST + (i % 2 === 0 ? 6 : -6) + t * 20
        const x = CX + jag * Math.cos(a)
        const y = CY + jag * Math.sin(a)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      for (const s of inSoluteRef.current) {
        const rr = (R_BURST + t * 90) * s.frac
        ctx.beginPath()
        ctx.arc(CX + rr * Math.cos(s.ang), CY + rr * Math.sin(s.ang), 3, 0, Math.PI * 2)
        ctx.fillStyle = GOLD
        ctx.fill()
      }
      ctx.fillStyle = PINK
      ctx.font = 'bold 13px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('LYSIS — cell burst', CX, CY + 4)
    }

    // Net water-flow arrow (direction of net osmotic flow).
    const ton = tonRef.current
    const cin = (R0 * R0) / (r * r) // current internal conc (isotonic ref = 1)
    const dir = OUT_CONC[ton] - cin // >0 outside saltier → water leaves
    if (!burst && Math.abs(dir) > 0.02) {
      const inward = dir < 0
      ctx.strokeStyle = inward ? `${BLUE}cc` : `${GOLD}cc`
      ctx.lineWidth = 2
      const ax = CX + (r + 16)
      const y = CY
      ctx.beginPath()
      if (inward) {
        ctx.moveTo(ax + 26, y)
        ctx.lineTo(ax, y)
        ctx.moveTo(ax + 7, y - 5)
        ctx.lineTo(ax, y)
        ctx.lineTo(ax + 7, y + 5)
      } else {
        ctx.moveTo(ax, y)
        ctx.lineTo(ax + 26, y)
        ctx.moveTo(ax + 19, y - 5)
        ctx.lineTo(ax + 26, y)
        ctx.lineTo(ax + 19, y + 5)
      }
      ctx.stroke()
      ctx.fillStyle = inward ? `${BLUE}cc` : `${GOLD}cc`
      ctx.font = '9px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(inward ? 'net H₂O in' : 'net H₂O out', ax + 32, y + 3)
    }

    // Legend.
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    const legend: [string, string][] = [
      [BLUE, 'water'], [VIOLET, 'outside solute'], [GOLD, 'inside solute'],
    ]
    let lx = 12
    for (const [col, lab] of legend) {
      ctx.beginPath()
      ctx.arc(lx + 4, H - 13, 3.2, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
      ctx.fillStyle = 'rgba(245,240,232,0.6)'
      ctx.fillText(lab, lx + 12, H - 10)
      lx += 22 + ctx.measureText(lab).width + 12
    }
  }, [])

  const step = useCallback(() => {
    const rng = rngRef.current
    const ton = tonRef.current

    // Animate radius toward the osmotic target (unless already burst).
    if (!burstRef.current) {
      const target = targetRadius(ton)
      rRef.current += (target - rRef.current) * 0.05
      if (rRef.current >= R_BURST) {
        rRef.current = R_BURST
        burstRef.current = true
        burstTRef.current = 0
      }
    } else {
      burstTRef.current = Math.min(2, burstTRef.current + 0.02)
    }

    // Water random-walks; it may cross the membrane, biased toward the saltier
    // side (net osmosis). Solutes never move across it.
    const r = rRef.current
    const cin = (R0 * R0) / (r * r)
    const bias = OUT_CONC[ton] - cin // >0 → net outward, <0 → net inward
    for (const w of waterRef.current) {
      w.vx += (rng() - 0.5) * 0.32
      w.vy += (rng() - 0.5) * 0.32
      // radial bias toward higher-solute side
      const dx = w.x - CX
      const dy = w.y - CY
      const d = Math.hypot(dx, dy) || 1
      const pull = bias * 0.06 // outward if positive
      w.vx += (dx / d) * pull
      w.vy += (dy / d) * pull
      w.vx = Math.max(-1.3, Math.min(1.3, w.vx))
      w.vy = Math.max(-1.3, Math.min(1.3, w.vy))
      w.x += w.vx
      w.y += w.vy
      if (w.x < 8) { w.x = 8; w.vx = Math.abs(w.vx) }
      if (w.x > W - 8) { w.x = W - 8; w.vx = -Math.abs(w.vx) }
      if (w.y < 8) { w.y = 8; w.vy = Math.abs(w.vy) }
      if (w.y > H - 8) { w.y = H - 8; w.vy = -Math.abs(w.vy) }
    }
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Draw a single static final frame at the osmotic target radius.
        rRef.current = Math.min(R_BURST, targetRadius(tonRef.current))
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    seed()
    draw()
  }, [seed, draw])

  // Re-seed the external solute + reset the cell whenever the tonicity changes.
  useEffect(() => {
    tonRef.current = tonicity
    rngRef.current = mulberry32(20260730)
    rRef.current = R0
    burstRef.current = false
    burstTRef.current = 0
    seedSolutes(tonicity)
    draw()
  }, [tonicity, seedSolutes, draw])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      step()
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    setTonicity('hypo')
    tonRef.current = 'hypo'
    seed()
    draw()
  }

  const btn = (t: Tonicity, label: string) => (
    <button
      onClick={() => setTonicity(t)}
      className="px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors"
      style={
        tonicity === t
          ? { color: LIME, borderColor: `${LIME}66`, background: `${LIME}16` }
          : { color: 'rgba(245,240,232,0.55)', borderColor: 'rgba(245,240,232,0.16)', background: 'transparent' }
      }
    >
      {label}
    </button>
  )

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Tonicity and cell volume
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: Tonicity and cell volume. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-2">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-lime text-bg-base text-xs font-medium hover:bg-accent-lime/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        {btn('hypo', 'Hypotonic')}
        {btn('iso', 'Isotonic')}
        {btn('hyper', 'Hypertonic')}
      </div>
      <p className="mt-2 text-xs text-text-muted">{LABEL[tonicity]}</p>
    </div>
  )
}
