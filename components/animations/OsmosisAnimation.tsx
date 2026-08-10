'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 330

const LIME = '#A3E635' // solute particles (cannot cross the membrane)
const WATER = '#60A5FA' // water molecules (cross freely both ways)
const GOLD = '#F59E0B' // membrane / equilibrium accents

// Vessel interior.
const VX0 = 60
const VX1 = 540
const VTOP = 46
const VBOT = 300
const MEM_X = 300 // semipermeable membrane, dead centre
const MEM_HW = 4

// Surface levels pivot around a common base as water migrates to the right side.
const BASE_Y = 108

// Three submerged pores let water through; solute always bounces off the band.
const PORES = [178, 222, 266]
const PORE_HW = 9

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

type Dot = { x: number; y: number; vx: number; vy: number }

// How high the right (concentrated) column ultimately rises, per delta-C:
// the hydrostatic head that finally balances the osmotic pressure.
function riseEqFor(deltaC: number) {
  return 10 + (deltaC / 100) * 46
}

function inPore(y: number) {
  return PORES.some(py => Math.abs(y - py) < PORE_HW)
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  delta: { default: 55, min: 0, max: 100 },
}

export function OsmosisAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const waterRef = useRef<Dot[]>([])
  const soluteLRef = useRef<Dot[]>([])
  const soluteRRef = useRef<Dot[]>([])
  const riseRef = useRef(0)
  const deltaRef = useRef(55)

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('osmosis', SPEC)
  const { delta } = params
  const [readout, setReadout] = useState({ left: 0, right: 0, eq: false })

  // Seed water (fixed) and solute (right count scales with the difference).
  const seed = useCallback((deltaC: number) => {
    const rng = mulberry32(1337 + deltaC)
    const surLo = BASE_Y - 60
    const water: Dot[] = []
    for (let i = 0; i < 34; i++) {
      const left = i < 22 // start most water on the dilute left so it flows right
      water.push({
        x: left
          ? VX0 + 10 + rng() * (MEM_X - MEM_HW - VX0 - 16)
          : MEM_X + MEM_HW + 8 + rng() * (VX1 - MEM_X - MEM_HW - 16),
        y: surLo + 8 + rng() * (VBOT - surLo - 14),
        vx: (rng() - 0.5) * 1.8,
        vy: (rng() - 0.5) * 1.8,
      })
    }
    waterRef.current = water

    const nLeft = 3
    const nRight = 3 + Math.round((deltaC / 100) * 15)
    const mkSolute = (n: number, x0: number, x1: number): Dot[] => {
      const out: Dot[] = []
      for (let i = 0; i < n; i++) {
        out.push({
          x: x0 + 8 + rng() * (x1 - x0 - 16),
          y: surLo + 12 + rng() * (VBOT - surLo - 22),
          vx: (rng() - 0.5) * 1.4,
          vy: (rng() - 0.5) * 1.4,
        })
      }
      return out
    }
    soluteLRef.current = mkSolute(nLeft, VX0, MEM_X - MEM_HW)
    soluteRRef.current = mkSolute(nRight, MEM_X + MEM_HW, VX1)
    riseRef.current = 0
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rise = riseRef.current
    const leftSurf = BASE_Y + rise
    const rightSurf = BASE_Y - rise

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    // Liquid columns.
    ctx.fillStyle = 'rgba(96,165,250,0.10)'
    ctx.fillRect(VX0, leftSurf, MEM_X - MEM_HW - VX0, VBOT - leftSurf)
    ctx.fillStyle = 'rgba(96,165,250,0.15)'
    ctx.fillRect(MEM_X + MEM_HW, rightSurf, VX1 - MEM_X - MEM_HW, VBOT - rightSurf)

    // Surface lines.
    ctx.strokeStyle = 'rgba(96,165,250,0.65)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(VX0, leftSurf)
    ctx.lineTo(MEM_X - MEM_HW, leftSurf)
    ctx.moveTo(MEM_X + MEM_HW, rightSurf)
    ctx.lineTo(VX1, rightSurf)
    ctx.stroke()

    // Vessel walls.
    ctx.strokeStyle = 'rgba(245,240,232,0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(VX0, VTOP)
    ctx.lineTo(VX0, VBOT)
    ctx.lineTo(VX1, VBOT)
    ctx.lineTo(VX1, VTOP)
    ctx.stroke()

    // Semipermeable membrane: a dashed band with punched-out pores.
    ctx.fillStyle = 'rgba(245,158,11,0.14)'
    ctx.fillRect(MEM_X - MEM_HW, VTOP, MEM_HW * 2, VBOT - VTOP)
    ctx.strokeStyle = `${GOLD}bb`
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    for (const edge of [MEM_X - MEM_HW, MEM_X + MEM_HW]) {
      ctx.beginPath()
      ctx.moveTo(edge, VTOP)
      ctx.lineTo(edge, VBOT)
      ctx.stroke()
    }
    ctx.setLineDash([])
    for (const py of PORES) {
      ctx.fillStyle = '#0F0D0A'
      ctx.fillRect(MEM_X - MEM_HW - 1, py - PORE_HW, MEM_HW * 2 + 2, PORE_HW * 2)
      ctx.fillStyle = 'rgba(96,165,250,0.16)'
      ctx.fillRect(MEM_X - MEM_HW - 1, py - PORE_HW, MEM_HW * 2 + 2, PORE_HW * 2)
    }

    // Solute particles — big, bounce off the membrane, never cross.
    for (const list of [soluteLRef.current, soluteRRef.current]) {
      for (const s of list) {
        ctx.beginPath()
        ctx.arc(s.x, s.y, 5, 0, Math.PI * 2)
        ctx.fillStyle = LIME
        ctx.fill()
        ctx.strokeStyle = 'rgba(15,13,10,0.7)'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }

    // Water molecules — small, cross both ways through the pores.
    for (const w of waterRef.current) {
      ctx.beginPath()
      ctx.arc(w.x, w.y, 2.3, 0, Math.PI * 2)
      ctx.fillStyle = WATER
      ctx.fill()
    }

    // Labels.
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.fillText('dilute (low solute)', (VX0 + MEM_X) / 2, VTOP - 14)
    ctx.fillStyle = LIME
    ctx.fillText('concentrated (high solute)', (MEM_X + VX1) / 2, VTOP - 14)
    ctx.font = '9px monospace'
    ctx.fillStyle = `${GOLD}cc`
    ctx.fillText('semipermeable', MEM_X, VBOT + 16)
    ctx.fillText('membrane', MEM_X, VBOT + 27)

    // Net-flow arrow across the membrane while off equilibrium.
    const eqNear =
      deltaRef.current === 0 || riseRef.current >= riseEqFor(deltaRef.current) - 0.6
    ctx.textAlign = 'center'
    if (!eqNear) {
      const ay = 130
      ctx.strokeStyle = `${WATER}dd`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(MEM_X - 26, ay)
      ctx.lineTo(MEM_X + 26, ay)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(MEM_X + 26, ay)
      ctx.lineTo(MEM_X + 18, ay - 6)
      ctx.lineTo(MEM_X + 18, ay + 6)
      ctx.closePath()
      ctx.fillStyle = `${WATER}dd`
      ctx.fill()
      ctx.font = 'bold 9px monospace'
      ctx.fillText('net water', MEM_X, ay - 12)
    } else {
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = `${GOLD}dd`
      ctx.fillText('osmotic pressure balances the column', MEM_X, 130)
    }
  }, [])

  const step = useCallback(() => {
    const deltaC = deltaRef.current
    const riseEq = riseEqFor(deltaC)
    // The concentrated column rises until hydrostatic head balances osmosis.
    riseRef.current += (riseEq - riseRef.current) * 0.02
    const p = riseEq > 0 ? Math.min(1, riseRef.current / riseEq) : 1

    const leftSurf = BASE_Y + riseRef.current
    const rightSurf = BASE_Y - riseRef.current
    const rng = mulberry32(((riseRef.current * 1000) | 0) + 7)

    // Water: brownian walk; crosses freely L->R, and back only as equilibrium
    // approaches (dynamic equilibrium). Net drift is toward the concentrated side.
    for (const w of waterRef.current) {
      w.vx += (rng() - 0.5) * 0.5
      w.vy += (rng() - 0.5) * 0.5
      w.vx = Math.max(-1.9, Math.min(1.9, w.vx))
      w.vy = Math.max(-1.9, Math.min(1.9, w.vy))
      let nx = w.x + w.vx
      let ny = w.y + w.vy

      const crossing = (w.x - MEM_X) * (nx - MEM_X) < 0
      if (crossing) {
        const goingRight = nx > w.x
        const allowed = inPore(ny) && (goingRight || rng() < 0.12 + 0.88 * p)
        if (!allowed) {
          w.vx = -w.vx
          nx = w.x + w.vx
        }
      }

      const onRight = nx > MEM_X
      const surf = onRight ? rightSurf : leftSurf
      const loX = onRight ? MEM_X + MEM_HW + 4 : VX0 + 4
      const hiX = onRight ? VX1 - 4 : MEM_X - MEM_HW - 4
      if (nx < loX) { nx = loX; w.vx = Math.abs(w.vx) }
      if (nx > hiX) { nx = hiX; w.vx = -Math.abs(w.vx) }
      if (ny < surf + 4) { ny = surf + 4; w.vy = Math.abs(w.vy) }
      if (ny > VBOT - 4) { ny = VBOT - 4; w.vy = -Math.abs(w.vy) }
      w.x = nx
      w.y = ny
    }

    // Solute: confined to its own chamber, bounces off the membrane band.
    const moveSolute = (list: Dot[], onRight: boolean) => {
      const surf = onRight ? rightSurf : leftSurf
      const loX = onRight ? MEM_X + MEM_HW + 6 : VX0 + 6
      const hiX = onRight ? VX1 - 6 : MEM_X - MEM_HW - 6
      for (const s of list) {
        s.vx += (rng() - 0.5) * 0.3
        s.vy += (rng() - 0.5) * 0.3
        s.vx = Math.max(-1.3, Math.min(1.3, s.vx))
        s.vy = Math.max(-1.3, Math.min(1.3, s.vy))
        let nx = s.x + s.vx
        let ny = s.y + s.vy
        if (nx < loX) { nx = loX; s.vx = Math.abs(s.vx) }
        if (nx > hiX) { nx = hiX; s.vx = -Math.abs(s.vx) }
        if (ny < surf + 6) { ny = surf + 6; s.vy = Math.abs(s.vy) }
        if (ny > VBOT - 6) { ny = VBOT - 6; s.vy = -Math.abs(s.vy) }
        s.x = nx
        s.y = ny
      }
    }
    moveSolute(soluteLRef.current, false)
    moveSolute(soluteRRef.current, true)
  }, [])

  const refreshReadout = useCallback(() => {
    const rise = riseRef.current
    const leftVol = VBOT - (BASE_Y + rise)
    const rightVol = VBOT - (BASE_Y - rise)
    const k = 90
    const left = (soluteLRef.current.length / leftVol) * k
    const right = (soluteRRef.current.length / rightVol) * k
    const riseEq = riseEqFor(deltaRef.current)
    setReadout({ left, right, eq: deltaRef.current === 0 || rise >= riseEq - 0.6 })
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Draw a single static final frame at osmotic equilibrium.
        riseRef.current = riseEqFor(deltaRef.current)
        draw()
        refreshReadout()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    seed(deltaRef.current)
    draw()
    refreshReadout()
  }, [seed, draw, refreshReadout])

  useEffect(() => {
    if (!running) return
    let frame = 0
    const tick = () => {
      step()
      draw()
      if (frame % 8 === 0) refreshReadout()
      frame++
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw, refreshReadout])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const onDelta = (v: number) => {
    set('delta', v)
    deltaRef.current = v
    seed(v)
    if (!running) {
      draw()
      refreshReadout()
    }
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    seed(deltaRef.current)
    draw()
    refreshReadout()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Water crosses; solute cannot
        </span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button
            onClick={reset}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          left conc: <strong style={{ color: WATER }}>{readout.left.toFixed(2)} M</strong>
        </span>
        <span>
          right conc: <strong style={{ color: LIME }}>{readout.right.toFixed(2)} M</strong>
        </span>
        <span>
          net water:{' '}
          <strong style={{ color: readout.eq ? GOLD : WATER }}>
            {readout.eq ? 'balanced (equilibrium)' : 'toward concentrated side →'}
          </strong>
        </span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-lime text-bg-base text-xs font-medium hover:bg-accent-lime/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          Solute difference
          <input
            type="range"
            min={SPEC.delta.min}
            max={SPEC.delta.max}
            value={delta}
            onChange={e => onDelta(Number(e.target.value))}
            className="w-32"
            style={{ accentColor: LIME }}
          />
          <span className="font-mono text-text-muted">{delta}%</span>
        </label>
      </div>
    </div>
  )
}
