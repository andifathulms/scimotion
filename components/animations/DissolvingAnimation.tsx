'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

// Field accent (orange) is the cation; the anion and water are cool tones.
const CATION = '#FB923C' // Na+ (polar/ionic solute)
const ANION = '#34D399' // Cl-
const WATER = '#7FB4D8' // polar water molecules (small dipoles)
const OIL = '#CA8A04' // nonpolar solute blob

// Beaker interior.
const BX0 = 34
const BX1 = 566
const BTOP = 54
const BBOT = 300

// 5x5 lattice, centred low-left so dispersed ions have room to spread right.
const GRID = 5
const SPACING = 24
const LAT_CX = 150
const LAT_CY = 178
const TOTAL = GRID * GRID

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Ion = {
  gx: number
  gy: number
  cation: boolean
  lx: number // lattice home
  ly: number
  detachAt: number // dissolution progress at which it leaves the crystal
  detached: boolean
  x: number
  y: number
  vx: number
  vy: number
}

// Ring base thresholds: outer shell of the crystal dissolves first.
const RING_BASE = [0.72, 0.4, 0.08]
const RING_SPAN = 0.26

function buildIons(): Ion[] {
  const rng = mulberry32(90210)
  const ions: Ion[] = []
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const ring = Math.max(Math.abs(gx - 2), Math.abs(gy - 2))
      const lx = LAT_CX + (gx - 2) * SPACING
      const ly = LAT_CY + (gy - 2) * SPACING
      ions.push({
        gx,
        gy,
        cation: (gx + gy) % 2 === 0,
        lx,
        ly,
        detachAt: RING_BASE[ring] + rng() * RING_SPAN,
        detached: false,
        x: lx,
        y: ly,
        vx: 0,
        vy: 0,
      })
    }
  }
  return ions
}

function easeOut(t: number) {
  return 1 - (1 - t) * (1 - t)
}

export function DissolvingAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const ionsRef = useRef<Ion[]>(buildIons())
  const progRef = useRef(0)
  const frameRef = useRef(0)
  const polarRef = useRef(true) // true = ionic salt, false = nonpolar oil
  const oilRef = useRef({ x: LAT_CX, y: LAT_CY, vx: 0, vy: 0 })

  const [running, setRunning] = useState(false)
  const [polar, setPolar] = useState(true)
  const [readout, setReadout] = useState({ crystal: TOTAL, dissolved: 0, polar: true })

  const seed = useCallback((isPolar: boolean) => {
    ionsRef.current = buildIons()
    progRef.current = 0
    frameRef.current = 0
    oilRef.current = { x: LAT_CX, y: LAT_CY, vx: 0, vy: 0 }
    polarRef.current = isPolar
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    // Water body + beaker.
    ctx.fillStyle = 'rgba(127,180,216,0.07)'
    ctx.fillRect(BX0, BTOP, BX1 - BX0, BBOT - BTOP)
    ctx.strokeStyle = 'rgba(245,240,232,0.32)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(BX0, BTOP)
    ctx.lineTo(BX0, BBOT)
    ctx.lineTo(BX1, BBOT)
    ctx.lineTo(BX1, BTOP)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(127,180,216,0.45)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(BX0, BTOP)
    ctx.lineTo(BX1, BTOP)
    ctx.stroke()
    ctx.font = '11px monospace'
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(127,180,216,0.7)'
    ctx.fillText('water (polar solvent)', BX1 - 8, BTOP - 8)

    // Background water dipoles jiggling everywhere.
    const bg = mulberry32(4242)
    const jitter = mulberry32(700 + (frameRef.current % 90))
    for (let i = 0; i < 46; i++) {
      const bx = BX0 + 10 + bg() * (BX1 - BX0 - 20)
      const by = BTOP + 10 + bg() * (BBOT - BTOP - 20)
      const wx = bx + (jitter() - 0.5) * 6
      const wy = by + (jitter() - 0.5) * 6
      ctx.strokeStyle = 'rgba(127,180,216,0.5)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(wx - 3, wy + 1.5)
      ctx.lineTo(wx + 3, wy - 1.5)
      ctx.stroke()
      ctx.fillStyle = 'rgba(127,180,216,0.55)'
      ctx.beginPath()
      ctx.arc(wx - 3, wy + 1.5, 1.4, 0, Math.PI * 2)
      ctx.fill()
    }

    if (!polarRef.current) {
      // Nonpolar oil: an intact blob that water cannot pull apart.
      const o = oilRef.current
      ctx.beginPath()
      ctx.ellipse(o.x, o.y, 58, 44, 0, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(202,138,4,0.28)'
      ctx.fill()
      ctx.strokeStyle = OIL
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = OIL
      const ob = mulberry32(55)
      for (let i = 0; i < 14; i++) {
        const a = ob() * Math.PI * 2
        const r = ob() * 40
        ctx.beginPath()
        ctx.arc(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r * 0.75, 4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = OIL
      ctx.fillText('oil (nonpolar) — not pulled apart', o.x, o.y + 66)
      ctx.font = '10px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.6)'
      ctx.fillText('like dissolves like: water repels it', o.x, o.y - 58)
      return
    }

    const ions = ionsRef.current

    // Bonds between adjacent ions still in the crystal.
    ctx.strokeStyle = 'rgba(245,240,232,0.22)'
    ctx.lineWidth = 1
    for (const a of ions) {
      if (a.detached) continue
      for (const b of ions) {
        if (b.detached) continue
        if ((b.gx === a.gx + 1 && b.gy === a.gy) || (b.gy === a.gy + 1 && b.gx === a.gx)) {
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }
    }

    for (const ion of ions) {
      // Hydration shell around dissolved (dispersed) ions.
      if (ion.detached) {
        ctx.strokeStyle = 'rgba(127,180,216,0.7)'
        ctx.fillStyle = 'rgba(127,180,216,0.7)'
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + frameRef.current * 0.03
          const hx = ion.x + Math.cos(a) * 11
          const hy = ion.y + Math.sin(a) * 11
          ctx.lineWidth = 1.3
          ctx.beginPath()
          ctx.moveTo(hx - 2.4, hy + 1.2)
          ctx.lineTo(hx + 2.4, hy - 1.2)
          ctx.stroke()
        }
      }
      ctx.beginPath()
      ctx.arc(ion.x, ion.y, 8, 0, Math.PI * 2)
      ctx.fillStyle = ion.cation ? CATION : ANION
      ctx.fill()
      ctx.strokeStyle = 'rgba(15,13,10,0.7)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = '#0F0D0A'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(ion.cation ? '+' : '−', ion.x, ion.y + 0.5)
    }
    ctx.textBaseline = 'alphabetic'

    // Labels for the two ion types.
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = CATION
    ctx.fillText('● Na⁺', BX0 + 10, BBOT - 22)
    ctx.fillStyle = ANION
    ctx.fillText('● Cl⁻', BX0 + 66, BBOT - 22)
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('crystal → hydrated ions (still all there)', BX0 + 10, BBOT - 8)
  }, [])

  const step = useCallback(() => {
    frameRef.current++
    const rng = mulberry32(frameRef.current * 2654435761)

    if (!polarRef.current) {
      // Oil blob drifts gently and buoys upward, staying intact.
      const o = oilRef.current
      o.vx += (rng() - 0.5) * 0.14
      o.vy += (rng() - 0.5) * 0.14 - 0.01
      o.vx = Math.max(-0.7, Math.min(0.7, o.vx))
      o.vy = Math.max(-0.7, Math.min(0.7, o.vy))
      o.x = Math.max(BX0 + 62, Math.min(BX1 - 62, o.x + o.vx))
      o.y = Math.max(BTOP + 48, Math.min(BBOT - 48, o.y + o.vy))
      return
    }

    if (progRef.current < 1) progRef.current = Math.min(1, progRef.current + 0.004)
    const p = progRef.current

    for (const ion of ionsRef.current) {
      if (!ion.detached && p >= ion.detachAt) {
        ion.detached = true
        const s = mulberry32(ion.gx * 131 + ion.gy * 17 + 3)
        ion.vx = (s() - 0.5) * 2.2 + 0.6 // net drift into the solvent to the right
        ion.vy = (s() - 0.5) * 2.2
      }
      if (ion.detached) {
        ion.vx += (rng() - 0.5) * 0.4
        ion.vy += (rng() - 0.5) * 0.4
        ion.vx = Math.max(-1.8, Math.min(1.8, ion.vx))
        ion.vy = Math.max(-1.8, Math.min(1.8, ion.vy))
        let nx = ion.x + ion.vx
        let ny = ion.y + ion.vy
        if (nx < BX0 + 12) { nx = BX0 + 12; ion.vx = Math.abs(ion.vx) }
        if (nx > BX1 - 12) { nx = BX1 - 12; ion.vx = -Math.abs(ion.vx) }
        if (ny < BTOP + 12) { ny = BTOP + 12; ion.vy = Math.abs(ion.vy) }
        if (ny > BBOT - 12) { ny = BBOT - 12; ion.vy = -Math.abs(ion.vy) }
        ion.x = nx
        ion.y = ny
      } else {
        // Vibrate in place, and ease outward slightly as its turn approaches.
        const near = easeOut(Math.max(0, (p - (ion.detachAt - 0.12)) / 0.12))
        const wob = mulberry32(frameRef.current + ion.gx * 7 + ion.gy * 31)
        ion.x = ion.lx + (wob() - 0.5) * 2 + (ion.lx - LAT_CX) * 0.02 * near
        ion.y = ion.ly + (wob() - 0.5) * 2 + (ion.ly - LAT_CY) * 0.02 * near
      }
    }
  }, [])

  const refreshReadout = useCallback(() => {
    if (!polarRef.current) {
      setReadout({ crystal: TOTAL, dissolved: 0, polar: false })
      return
    }
    const dissolved = ionsRef.current.filter(i => i.detached).length
    setReadout({ crystal: TOTAL - dissolved, dissolved, polar: true })
  }, [])

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        if (polarRef.current) {
          progRef.current = 1
          for (const ion of ionsRef.current) {
            ion.detached = true
            const s = mulberry32(ion.gx * 131 + ion.gy * 17 + 99)
            ion.x = BX0 + 20 + s() * (BX1 - BX0 - 40)
            ion.y = BTOP + 20 + s() * (BBOT - BTOP - 40)
          }
        }
        draw()
        refreshReadout()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    draw()
    refreshReadout()
  }, [draw, refreshReadout])

  useEffect(() => {
    if (!running || !visible) return
    let f = 0
    const tick = () => {
      step()
      draw()
      if (f % 6 === 0) refreshReadout()
      f++
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw, refreshReadout, visible])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const onPolar = (isPolar: boolean) => {
    setPolar(isPolar)
    seed(isPolar)
    draw()
    refreshReadout()
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    seed(polarRef.current)
    draw()
    refreshReadout()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Dissolving disperses — it does not destroy
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
          aria-label="Animated diagram: Dissolving disperses — it does not destroy. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          in crystal:{' '}
          <strong style={{ color: CATION }}>{readout.polar ? readout.crystal : TOTAL}</strong>
        </span>
        <span>
          dispersed (hydrated):{' '}
          <strong style={{ color: WATER }}>{readout.polar ? readout.dissolved : 0}</strong>
        </span>
        <span>
          total particles: <strong style={{ color: '#FB923C' }}>{TOTAL}</strong>
        </span>
        <span>
          mass:{' '}
          <strong style={{ color: ANION }}>
            {readout.polar ? 'conserved — nothing destroyed' : 'unchanged — oil stays whole'}
          </strong>
        </span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          <button
            onClick={() => onPolar(true)}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
            style={
              polar
                ? { background: '#FB923C', color: '#0F0D0A' }
                : { color: 'var(--text-muted)' }
            }
          >
            Salt (ionic)
          </button>
          <button
            onClick={() => onPolar(false)}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
            style={
              !polar
                ? { background: OIL, color: '#0F0D0A' }
                : { color: 'var(--text-muted)' }
            }
          >
            Oil (nonpolar)
          </button>
        </div>
      </div>
    </div>
  )
}
