'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 640
const H = 360

// Molecule box. The left, top and bottom walls are fixed; the right wall is a
// movable piston that sets the volume.
const BX0 = 16
const BY0 = 52
const BY1 = 300
const R = 3.6

// The piston spans this range of x as the volume slider runs 40 -> 100 %.
const PIST_MIN = 196
const PIST_MAX = 396

// Right-hand readout panel.
const PANEL_X = 430

const N = 68 // molecules — one species, so every mass is identical
const T_REF = 300

// A comfortable pixel speed for the reference temperature. Speeds scale as
// sqrt(T), so mean kinetic energy scales linearly with T.
const SPEED0 = 1.7

// Display scaling: pressure and volume are in arbitrary units whose product is
// exactly the kinetic-theory value, so P·V and N·kᵦ·T read on the same scale.
const S = 7000

const ACCENT = '#FB923C' // orange — the gas
const GOLD = '#F59E0B' // fast molecules / latent readouts
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

type Molecule = { x: number; y: number; vx: number; vy: number }

// Box-Muller standard normal.
function gauss(): number {
  let u = 0
  while (u === 0) u = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random())
}

// The 2-D Maxwell-Boltzmann velocity: each component is normal with variance
// sigma², giving a spread of speeds rather than one shared speed.
function makeMolecules(T: number, pistonX: number): Molecule[] {
  const vrms = SPEED0 * Math.sqrt(T / T_REF)
  const sigma = vrms / Math.SQRT2
  return Array.from({ length: N }, () => ({
    x: BX0 + R + Math.random() * (pistonX - BX0 - 2 * R),
    y: BY0 + R + Math.random() * (BY1 - BY0 - 2 * R),
    vx: gauss() * sigma,
    vy: gauss() * sigma,
  }))
}

export function KineticTheoryAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const molRef = useRef<Molecule[]>([])
  const tempRef = useRef(T_REF)
  const volRef = useRef(80)
  const pistonRef = useRef(PIST_MIN + ((80 - 40) / 60) * (PIST_MAX - PIST_MIN))
  const pMeasRef = useRef(0) // smoothed measured pressure (px units)

  const [temp, setTemp] = useState(T_REF)
  const [vol, setVol] = useState(80)
  const [running, setRunning] = useState(false)
  const [readout, setReadout] = useState({ P: 0, V: 0, T: T_REF, PV: 0, NkT: 0 })

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const mols = molRef.current
    const T = tempRef.current
    const pistonX = pistonRef.current
    const vrms = SPEED0 * Math.sqrt(T / T_REF)

    ctx.clearRect(0, 0, W, H)

    // --- Box walls -----------------------------------------------------
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(pistonX, BY0)
    ctx.lineTo(BX0, BY0)
    ctx.lineTo(BX0, BY1)
    ctx.lineTo(pistonX, BY1)
    ctx.stroke()

    // Piston (movable right wall) with a grab handle.
    ctx.strokeStyle = 'rgba(245,240,232,0.5)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(pistonX, BY0 - 6)
    ctx.lineTo(pistonX, BY1 + 6)
    ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillRect(pistonX, (BY0 + BY1) / 2 - 12, 8, 24)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('piston', pistonX - 4, BY1 + 18)

    // --- Molecules -----------------------------------------------------
    let msq = 0
    mols.forEach(m => {
      const sp2 = m.vx * m.vx + m.vy * m.vy
      msq += sp2
      // Colour by speed: the fast tail is gold, reinforcing the spread.
      ctx.beginPath()
      ctx.arc(m.x, m.y, R, 0, Math.PI * 2)
      ctx.fillStyle = sp2 > 1.7 * vrms * vrms ? GOLD : ACCENT
      ctx.fill()
    })
    msq /= mols.length || 1

    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = ACCENT
    ctx.fillText('molecules in a box', BX0, 26)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.42)'
    ctx.fillText('speed ∝ √T · point particles · elastic walls', BX0, 42)

    // --- Readout panel -------------------------------------------------
    const width = pistonX - BX0
    const height = BY1 - BY0
    const area = width * height

    const Pdisp = pMeasRef.current * S
    const Vdisp = area / S
    const NkT = 0.5 * N * msq
    const PV = pMeasRef.current * area // = Pdisp * Vdisp, kept in px units

    let y = BY0 + 4
    const line = (label: string, value: string, col: string) => {
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.45)'
      ctx.fillText(label, PANEL_X, y)
      ctx.font = 'bold 13px monospace'
      ctx.fillStyle = col
      ctx.fillText(value, PANEL_X + 96, y)
      y += 20
    }

    line('temperature', `${Math.round(T)} K`, GOLD)
    // Temperature bar
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(PANEL_X, y - 6, 170, 7)
    ctx.fillStyle = GOLD
    ctx.fillRect(PANEL_X, y - 6, 170 * ((T - 100) / 600), 7)
    y += 22

    line('volume', `${Vdisp.toFixed(1)}`, BLUE)
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.strokeRect(PANEL_X, y - 6, 170, 7)
    ctx.fillStyle = BLUE
    ctx.fillRect(PANEL_X, y - 6, 170 * (width / PIST_MAX), 7)
    y += 22

    line('pressure', `${Pdisp.toFixed(1)}`, ACCENT)
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.strokeRect(PANEL_X, y - 6, 170, 7)
    ctx.fillStyle = ACCENT
    ctx.fillRect(PANEL_X, y - 6, Math.min(170, 170 * (Pdisp / 40)), 7)
    y += 14
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('measured from wall impacts', PANEL_X, y)
    y += 22

    // The emergent law: two independent computations that agree.
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.beginPath()
    ctx.moveTo(PANEL_X, y - 8)
    ctx.lineTo(PANEL_X + 190, y - 8)
    ctx.stroke()

    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = GREEN
    ctx.fillText(`P · V   = ${PV.toFixed(0)}`, PANEL_X, y + 10)
    ctx.fillStyle = VIOLET
    ctx.fillText(`N·kᵦ·T = ${NkT.toFixed(0)}`, PANEL_X, y + 30)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('the two agree — that is  PV = NkᵦT', PANEL_X, y + 48)
    ctx.fillText('kᵦT = ½ m⟨v²⟩  (temperature IS motion)', PANEL_X, y + 62)

    return { Pdisp, Vdisp, T, PV, NkT }
  }, [])

  const step = useCallback(() => {
    const mols = molRef.current
    const pistonX = pistonRef.current
    let impulse = 0
    mols.forEach(m => {
      // A small random rotation stands in for molecule–molecule collisions;
      // it changes direction but preserves speed, so temperature is conserved.
      const a = (Math.random() - 0.5) * 0.22
      const nvx = m.vx * Math.cos(a) - m.vy * Math.sin(a)
      const nvy = m.vx * Math.sin(a) + m.vy * Math.cos(a)
      m.vx = nvx
      m.vy = nvy
      m.x += m.vx
      m.y += m.vy
      // Elastic bounces. Each impact transfers 2·m·|v⊥| of momentum (m = 1).
      if (m.x < BX0 + R) {
        m.x = BX0 + R
        m.vx = Math.abs(m.vx)
        impulse += 2 * Math.abs(m.vx)
      }
      if (m.x > pistonX - R) {
        m.x = pistonX - R
        m.vx = -Math.abs(m.vx)
        impulse += 2 * Math.abs(m.vx)
      }
      if (m.y < BY0 + R) {
        m.y = BY0 + R
        m.vy = Math.abs(m.vy)
        impulse += 2 * Math.abs(m.vy)
      }
      if (m.y > BY1 - R) {
        m.y = BY1 - R
        m.vy = -Math.abs(m.vy)
        impulse += 2 * Math.abs(m.vy)
      }
    })
    const perim = 2 * (pistonX - BX0 + (BY1 - BY0))
    const instP = impulse / perim
    // Exponential smoothing tames the shot noise of individual impacts.
    pMeasRef.current = pMeasRef.current * 0.96 + instP * 0.04
  }, [])

  const init = useCallback(() => {
    molRef.current = makeMolecules(tempRef.current, pistonRef.current)
    // Warm the pressure estimate so the bar is not empty on first paint.
    pMeasRef.current = 0
    for (let i = 0; i < 200; i++) step()
    draw()
  }, [draw, step])

  useEffect(() => {
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!running) return
    let frame = 0
    const tick = () => {
      step()
      const r = draw()
      frame += 1
      if (r && frame % 6 === 0) {
        setReadout({ P: r.Pdisp, V: r.Vdisp, T: r.T, PV: r.PV, NkT: r.NkT })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  useEffect(() => {
    if (!running) draw()
  }, [running, draw])

  // Temperature change: rescale every velocity, preserving direction and the
  // shape of the speed distribution.
  const onTemp = (next: number) => {
    const factor = Math.sqrt(next / tempRef.current)
    molRef.current.forEach(m => {
      m.vx *= factor
      m.vy *= factor
    })
    tempRef.current = next
    setTemp(next)
    if (!running) {
      for (let i = 0; i < 60; i++) step()
      draw()
    }
  }

  // Volume change: move the piston, then clamp any molecule left outside it.
  const onVol = (next: number) => {
    const pistonX = PIST_MIN + ((next - 40) / 60) * (PIST_MAX - PIST_MIN)
    pistonRef.current = pistonX
    molRef.current.forEach(m => {
      if (m.x > pistonX - R) m.x = pistonX - R
    })
    volRef.current = next
    setVol(next)
    if (!running) {
      for (let i = 0; i < 60; i++) step()
      draw()
    }
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    tempRef.current = T_REF
    volRef.current = 80
    pistonRef.current = PIST_MIN + ((80 - 40) / 60) * (PIST_MAX - PIST_MIN)
    setTemp(T_REF)
    setVol(80)
    init()
    setReadout({ P: 0, V: 0, T: T_REF, PV: 0, NkT: 0 })
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Pressure from molecular collisions
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
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: '#0F0D0A' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-teal text-bg-base text-xs font-medium hover:bg-accent-teal/90 transition-colors"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Play
            </>
          )}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Temp:</span>
          <input
            type="range"
            min={100}
            max={700}
            step={10}
            value={temp}
            onChange={e => onTemp(+e.target.value)}
            className="w-24 accent-accent-teal"
          />
          <span className="font-mono text-text-secondary">{temp} K</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Volume:</span>
          <input
            type="range"
            min={40}
            max={100}
            step={2}
            value={vol}
            onChange={e => onVol(+e.target.value)}
            className="w-24 accent-accent-teal"
          />
        </div>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          P·V {readout.PV.toFixed(0)} · NkᵦT {readout.NkT.toFixed(0)}
        </span>
      </div>
    </div>
  )
}
