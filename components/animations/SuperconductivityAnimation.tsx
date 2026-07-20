'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 620
const H = 330

const TMAX = 20 // kelvin
const TC = 9.3 // critical temperature (niobium-like)

// Lattice geometry
const COLS = 9
const ROWS = 4
const ION_X0 = 45
const ION_DX = 62
const ION_Y0 = 45
const ION_DY = 35

// Resistance plot geometry
const PX0 = 52
const PX1 = 602
const PY0 = 312 // R = 0
const PY1 = 208 // R = 1 (normalised)

type Electron = { x: number; y: number; lane: number; vy: number }

const LANES = [58, 80, 102, 124, 146, 166]

function makeElectrons(): Electron[] {
  return Array.from({ length: 12 }, (_, i) => {
    const lane = LANES[i % LANES.length]
    return {
      x: 20 + (i * 47) % 560,
      y: lane,
      lane,
      vy: 0,
    }
  })
}

// Two-fluid model: the superfluid (paired) fraction of the electrons.
function pairedFraction(T: number): number {
  if (T >= TC) return 0
  const r = T / TC
  return 1 - r * r * r * r
}

// Normalised resistance. Above Tc a metal has residual + phonon-scattering
// resistance; below Tc it is exactly zero — not small, zero.
function resistance(T: number): number {
  if (T < TC) return 0
  return 0.18 + (T / TMAX) * 0.82
}

const tx = (T: number) => PX0 + (T / TMAX) * (PX1 - PX0)
const ry = (R: number) => PY0 - R * (PY0 - PY1)

export function SuperconductivityAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const electronsRef = useRef<Electron[]>(makeElectrons())
  const phaseRef = useRef(0)
  const tempRef = useRef(16)
  const [temp, setTemp] = useState(16)
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  const ionPos = useCallback((i: number, j: number, T: number, phase: number) => {
    const amp = 0.8 + 5.6 * (T / TMAX)
    const bx = ION_X0 + i * ION_DX
    const by = ION_Y0 + j * ION_DY
    return {
      x: bx + Math.sin(phase * 2.1 + i * 1.7 + j * 0.9) * amp,
      y: by + Math.cos(phase * 1.7 + i * 0.8 + j * 2.3) * amp,
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const T = tempRef.current
    const phase = phaseRef.current
    const f = pairedFraction(T)
    const cold = T < TC

    ctx.clearRect(0, 0, W, H)

    // --- Lattice ------------------------------------------------------
    const pts: { x: number; y: number }[][] = []
    for (let i = 0; i < COLS; i++) {
      const col: { x: number; y: number }[] = []
      for (let j = 0; j < ROWS; j++) col.push(ionPos(i, j, T, phase))
      pts.push(col)
    }

    ctx.strokeStyle = `rgba(245,158,11,${0.1 + 0.16 * (T / TMAX)})`
    ctx.lineWidth = 1
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const p = pts[i][j]
        if (i + 1 < COLS) {
          const q = pts[i + 1][j]
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(q.x, q.y)
          ctx.stroke()
        }
        if (j + 1 < ROWS) {
          const q = pts[i][j + 1]
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(q.x, q.y)
          ctx.stroke()
        }
      }
    }

    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const p = pts[i][j]
        ctx.beginPath()
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(245,158,11,${0.3 + 0.45 * (T / TMAX)})`
        ctx.fill()
      }
    }

    // --- Electrons ----------------------------------------------------
    const pairsN = Math.round(LANES.length * f)
    const es = electronsRef.current
    for (let i = 0; i < es.length; i += 2) {
      const paired = i / 2 < pairsN
      const a = es[i]
      const b = es[i + 1]
      if (paired) {
        // Cooper pair: two electrons bound across the lattice, drawn tethered.
        ctx.strokeStyle = 'rgba(167,139,250,0.55)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 9, b.x, b.y)
        ctx.stroke()
      }
      for (const e of [a, b]) {
        ctx.beginPath()
        ctx.arc(e.x, e.y, 3.4, 0, Math.PI * 2)
        ctx.fillStyle = paired ? '#10B981' : '#60A5FA'
        ctx.fill()
        if (paired) {
          ctx.beginPath()
          ctx.arc(e.x, e.y, 6.5, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(16,185,129,0.28)'
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }
    }

    // --- Phase label --------------------------------------------------
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = cold ? '#10B981' : '#60A5FA'
    ctx.fillText(cold ? 'SUPERCONDUCTING' : 'NORMAL METAL', 14, 24)
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText(
      cold
        ? `paired electrons: ${Math.round(f * 100)}%  ·  no scattering`
        : 'electrons scatter off a vibrating lattice',
      14,
      190
    )

    // --- Resistance vs temperature plot -------------------------------
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PX0, PY1 - 6)
    ctx.lineTo(PX0, PY0)
    ctx.lineTo(PX1, PY0)
    ctx.stroke()

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('R', PX0 - 22, PY1 + 4)
    ctx.fillText('0', PX0 - 16, PY0 + 4)
    ctx.fillText('0', PX0 - 3, PY0 + 14)
    ctx.fillText(`${TMAX} K`, PX1 - 22, PY0 + 14)

    // Tc marker
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(245,158,11,0.45)'
    ctx.beginPath()
    ctx.moveTo(tx(TC), PY0)
    ctx.lineTo(tx(TC), PY1 - 4)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#F59E0B'
    ctx.fillText('Tc', tx(TC) - 6, PY1 - 8)

    // R(T): flat zero up to Tc, vertical jump, then the normal-metal branch.
    ctx.strokeStyle = '#10B981'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(tx(0), ry(0))
    ctx.lineTo(tx(TC), ry(0))
    ctx.stroke()

    ctx.strokeStyle = '#60A5FA'
    ctx.beginPath()
    ctx.moveTo(tx(TC), ry(0))
    ctx.lineTo(tx(TC), ry(resistance(TC)))
    for (let t = TC; t <= TMAX; t += 0.25) ctx.lineTo(tx(t), ry(resistance(t)))
    ctx.stroke()

    // Live marker at the current temperature
    const R = resistance(T)
    ctx.beginPath()
    ctx.arc(tx(T), ry(R), 4.5, 0, Math.PI * 2)
    ctx.fillStyle = '#F59E0B'
    ctx.fill()

    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = '#F59E0B'
    ctx.fillText(`T = ${T.toFixed(1)} K`, PX0 + 8, PY1 - 8)
    ctx.fillStyle = cold ? '#10B981' : '#60A5FA'
    ctx.fillText(
      cold ? 'R = 0.000  (exactly)' : `R = ${R.toFixed(3)} R₀`,
      PX0 + 108,
      PY1 - 8
    )
  }, [ionPos])

  const step = useCallback(() => {
    const T = tempRef.current
    const f = pairedFraction(T)
    const pairsN = Math.round(LANES.length * f)
    const phase = phaseRef.current
    const es = electronsRef.current

    for (let i = 0; i < es.length; i++) {
      const e = es[i]
      const paired = Math.floor(i / 2) < pairsN
      if (paired) {
        // A condensed pair cannot shed momentum in small pieces: it glides.
        e.x += 3.4
        e.y += (e.lane + (i % 2 === 0 ? -6 : 6) - e.y) * 0.15
        e.vy = 0
      } else {
        e.x += 1.15
        e.y += e.vy
        e.vy *= 0.94
        // Scatter off any nearby (thermally displaced) ion.
        for (let ci = 0; ci < COLS; ci++) {
          for (let rj = 0; rj < ROWS; rj++) {
            const p = ionPos(ci, rj, T, phase)
            if (Math.abs(e.x - p.x) < 7 && Math.abs(e.y - p.y) < 8) {
              e.vy = (Math.random() - 0.5) * 5
              e.x -= 3
            }
          }
        }
        if (e.y < 40) { e.y = 40; e.vy = Math.abs(e.vy) }
        if (e.y > 175) { e.y = 175; e.vy = -Math.abs(e.vy) }
      }
      if (e.x > W - 12) {
        e.x = 12
        e.y = e.lane
        e.vy = 0
      }
    }
    phaseRef.current += 0.05
  }, [ionPos])

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

  // Redraw on temperature change (and for the paused / reduced-motion case).
  useEffect(() => {
    tempRef.current = temp
    if (!running) draw()
  }, [temp, running, draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    electronsRef.current = makeElectrons()
    phaseRef.current = 0
    tempRef.current = 16
    setTemp(16)
    draw()
  }

  const f = pairedFraction(temp)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Cooling through the critical temperature</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-teal text-bg-base text-xs font-medium hover:bg-accent-teal/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Temperature:</span>
          <input
            type="range" min={0} max={TMAX} step={0.1} value={temp}
            onChange={e => setTemp(+e.target.value)}
            className="w-36 accent-accent-teal"
          />
          <span className="font-mono text-text-secondary">{temp.toFixed(1)} K</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          {temp < TC ? `paired ${Math.round(f * 100)}% · R = 0` : `R = ${resistance(temp).toFixed(3)}`}
        </span>
      </div>
    </div>
  )
}
