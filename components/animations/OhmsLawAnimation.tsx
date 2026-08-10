'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300

const GREEN = '#10B981'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const PINK = '#F472B6'

// --- Circuit geometry (a rectangular loop) --------------------------------
const LX = 110 // left rail (battery)
const RX = 470 // right rail (resistor)
const TY = 66 // top wire
const BY = 214 // bottom wire

// Clockwise loop, starting top-left. Conventional current leaves the + terminal
// (top-left), runs across the top, down through the resistor, back along the
// bottom, and into the − terminal — the same current the whole way around.
const LOOP: [number, number][] = [
  [LX, TY],
  [RX, TY],
  [RX, BY],
  [LX, BY],
  [LX, TY],
]
const SEG = LOOP.slice(1).map((p, i) => Math.hypot(p[0] - LOOP[i][0], p[1] - LOOP[i][1]))
const LEN = SEG.reduce((a, b) => a + b, 0)

function loopPoint(d: number): { x: number; y: number } {
  let rest = ((d % LEN) + LEN) % LEN
  for (let i = 0; i < SEG.length; i++) {
    if (rest <= SEG[i]) {
      const t = rest / SEG[i]
      const a = LOOP[i]
      const b = LOOP[i + 1]
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t }
    }
    rest -= SEG[i]
  }
  const last = LOOP[LOOP.length - 1]
  return { x: last[0], y: last[1] }
}

const N_DOTS = 18
const LAMP_X = (LX + RX) / 2

const DEFAULT_V = 9
const DEFAULT_R = 180

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  volts: { default: DEFAULT_V, min: 1, max: 12, step: 0.5 },
  ohms: { default: DEFAULT_R, min: 30, max: 600, step: 10 },
}

export function OhmsLawAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const offsetRef = useRef(0)

  const { params, set, permalink, isDefault, restored } = useWidgetParams('ohms-law', SPEC)
  const { volts, ohms } = params
  const [running, setRunning] = useState(false)

  const vRef = useRef(DEFAULT_V)
  const rRef = useRef(DEFAULT_R)

  useEffect(() => {
    vRef.current = volts
  }, [volts])
  useEffect(() => {
    rRef.current = ohms
  }, [ohms])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const V = vRef.current
    const R = rRef.current
    const I = V / R // amps
    const P = V * I // watts
    const glow = clamp(Math.sqrt(P / 3), 0, 1)

    ctx.clearRect(0, 0, W, H)

    // --- Wires -------------------------------------------------------------
    ctx.strokeStyle = 'rgba(245,240,232,0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(LOOP[0][0], LOOP[0][1])
    for (let i = 1; i < LOOP.length; i++) ctx.lineTo(LOOP[i][0], LOOP[i][1])
    ctx.stroke()

    // --- Battery (left rail) ----------------------------------------------
    const by = (TY + BY) / 2
    ctx.strokeStyle = 'rgba(245,240,232,0.7)'
    // clear a gap in the rail for the cell
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(LX - 16, by - 22, 32, 44)
    // long plate (+) then short plate (−)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(LX - 14, by - 12)
    ctx.lineTo(LX + 14, by - 12)
    ctx.moveTo(LX - 7, by + 12)
    ctx.lineTo(LX + 7, by + 12)
    ctx.stroke()
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText('+', LX + 18, by - 8)
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('−', LX + 18, by + 16)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('battery', LX - 20, BY + 22)
    ctx.fillText(`${V.toFixed(1)} V`, LX - 16, by + 38)

    // --- Resistor (right rail, zig-zag) -----------------------------------
    const rTop = by - 30
    const rBot = by + 30
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(RX - 10, rTop, 20, rBot - rTop)
    ctx.strokeStyle = GREEN
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(RX, rTop)
    const zig = 8
    const teeth = 6
    for (let i = 0; i < teeth; i++) {
      const y = rTop + ((rBot - rTop) * (i + 0.5)) / teeth
      ctx.lineTo(RX + (i % 2 === 0 ? zig : -zig), y)
    }
    ctx.lineTo(RX, rBot)
    ctx.stroke()
    ctx.font = '9px monospace'
    ctx.fillStyle = GREEN
    ctx.fillText('resistor', RX + 14, by - 6)
    ctx.fillText(`${Math.round(R)} Ω`, RX + 14, by + 8)

    // --- Lamp on the top wire (shows energy being consumed) ----------------
    ctx.beginPath()
    ctx.arc(LAMP_X, TY, 12 + 12 * glow, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(245,158,11,${0.04 + 0.24 * glow})`
    ctx.fill()
    ctx.beginPath()
    ctx.arc(LAMP_X, TY, 9, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(245,158,11,${0.14 + 0.82 * glow})`
    ctx.fill()
    ctx.strokeStyle = 'rgba(245,240,232,0.5)'
    ctx.lineWidth = 1.4
    ctx.stroke()
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('lamp — consumes energy, not charge', LAMP_X - 92, TY - 20)

    // --- Charge carriers, evenly spaced all the way around -----------------
    for (let i = 0; i < N_DOTS; i++) {
      const p = loopPoint((i / N_DOTS) * LEN + offsetRef.current)
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2)
      ctx.fillStyle = BLUE
      ctx.fill()
    }

    // direction arrow on the top wire
    ctx.strokeStyle = 'rgba(96,165,250,0.8)'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(LAMP_X - 60, TY - 34)
    ctx.lineTo(LAMP_X - 40, TY - 34)
    ctx.lineTo(LAMP_X - 45, TY - 38)
    ctx.moveTo(LAMP_X - 40, TY - 34)
    ctx.lineTo(LAMP_X - 45, TY - 30)
    ctx.stroke()
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(96,165,250,0.8)'
    ctx.fillText('conventional current I', LAMP_X - 60, TY - 42)

    // --- Readout panel -----------------------------------------------------
    const px = 26
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = GREEN
    ctx.fillText('V = I R', px, 236)
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.75)'
    ctx.fillText(`V = ${V.toFixed(1)} V`, px, 258)
    ctx.fillText(`R = ${Math.round(R)} Ω`, px + 110, 258)
    ctx.fillStyle = GOLD
    ctx.fillText(`I = ${(I * 1000).toFixed(0)} mA`, px + 230, 258)
    ctx.fillStyle = PINK
    ctx.fillText(`P = V I = ${P.toFixed(2)} W`, px + 350, 258)

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText(
      'water analogy:  voltage ≈ pressure   ·   current ≈ flow rate   ·   resistance ≈ narrow pipe',
      px,
      282
    )
  }, [])

  const step = useCallback(() => {
    const I = vRef.current / rRef.current
    offsetRef.current += clamp(I * 90, 0.3, 11)
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) draw()
      else setRunning(true)
    },
  })

  useEffect(() => {
    draw()
  }, [draw])

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

  useEffect(() => {
    if (!running) draw()
  }, [volts, ohms, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    set('volts', DEFAULT_V)
    set('ohms', DEFAULT_R)
    vRef.current = DEFAULT_V
    rRef.current = DEFAULT_R
    offsetRef.current = 0
    draw()
  }

  const I = volts / ohms
  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Ohm&apos;s law in one loop
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
      <div className="animation-canvas">
        <canvas
          role="img"
          aria-label="Animated diagram: Ohm&apos;s law in one loop. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-bg-base transition-colors"
          style={{ background: GREEN }}
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
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Voltage:</span>
          <input
            type="range"
            min={SPEC.volts.min}
            max={SPEC.volts.max}
            step={SPEC.volts.step}
            value={volts}
            onChange={e => set('volts', +e.target.value)}
            className="w-32"
            style={{ accentColor: GOLD }}
          />
          <span className="text-text-secondary font-mono">{volts.toFixed(1)} V</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Resistance:</span>
          <input
            type="range"
            min={SPEC.ohms.min}
            max={SPEC.ohms.max}
            step={SPEC.ohms.step}
            value={ohms}
            onChange={e => set('ohms', +e.target.value)}
            className="w-32"
            style={{ accentColor: GREEN }}
          />
          <span className="text-text-secondary font-mono">{Math.round(ohms)} Ω</span>
        </label>
        <span className="ml-auto text-xs font-mono" style={{ color: GOLD }}>
          I = {(I * 1000).toFixed(0)} mA
        </span>
      </div>
    </div>
  )
}
