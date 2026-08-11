'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 640
const H = 340

const PLOT = { x: 52, y: 26, w: 512, h: 250 }

const K_B = 1.380649e-23 // J/K
const AMU = 1.66053907e-27 // kg
const V_MAX = 5000 // m/s — right edge of the speed axis

const T_MIN = 100
const T_MAX = 600
const T_REF = 300

const ACCENT = '#FB923C' // orange — the selected gas
const GOLD = '#F59E0B' // most-probable speed
const BLUE = '#60A5FA' // mean speed
const VIOLET = '#A78BFA' // rms speed
const FAINT = 'rgba(245,240,232,0.16)'

type Gas = { id: string; label: string; mass: number }

// Real molecular masses (atomic mass units).
const GASES: Gas[] = [
  { id: 'H2', label: 'H₂', mass: 2.016 },
  { id: 'He', label: 'He', mass: 4.003 },
  { id: 'N2', label: 'N₂', mass: 28.014 },
  { id: 'O2', label: 'O₂', mass: 31.998 },
  { id: 'CO2', label: 'CO₂', mass: 44.009 },
]

// Maxwell-Boltzmann speed density, f(v), in SI units (per m/s).
function mb(v: number, massAmu: number, T: number): number {
  const m = massAmu * AMU
  const a = m / (2 * Math.PI * K_B * T)
  return 4 * Math.PI * Math.pow(a, 1.5) * v * v * Math.exp((-m * v * v) / (2 * K_B * T))
}

// Characteristic speeds, all in m/s.
function speeds(massAmu: number, T: number) {
  const m = massAmu * AMU
  return {
    vp: Math.sqrt((2 * K_B * T) / m), // most probable
    vmean: Math.sqrt((8 * K_B * T) / (Math.PI * m)), // mean
    vrms: Math.sqrt((3 * K_B * T) / m), // root-mean-square
  }
}

export function MaxwellBoltzmannAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tempRef = useRef(T_REF)
  const dirRef = useRef(1)
  const speciesRef = useRef('N2')

  const [temp, setTemp] = useState(T_REF)
  const [species, setSpecies] = useState('N2')
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const T = tempRef.current
    const sel = speciesRef.current
    ctx.clearRect(0, 0, W, H)

    const px = (v: number) => PLOT.x + (v / V_MAX) * PLOT.w
    const SAMPLES = 160

    // Shared vertical scale: normalise to the tallest peak across all gases at
    // this temperature, so relative heights are physically honest.
    let peak = 0
    GASES.forEach(g => {
      const vp = Math.sqrt((2 * K_B * T) / (g.mass * AMU))
      peak = Math.max(peak, mb(vp, g.mass, T))
    })
    const yScale = (PLOT.h * 0.86) / peak
    const py = (f: number) => PLOT.y + PLOT.h - f * yScale

    // Axes.
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PLOT.x, PLOT.y - 4)
    ctx.lineTo(PLOT.x, PLOT.y + PLOT.h)
    ctx.lineTo(PLOT.x + PLOT.w, PLOT.y + PLOT.h)
    ctx.stroke()

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    for (let v = 1000; v <= 4000; v += 1000) {
      ctx.strokeStyle = 'rgba(255,245,235,0.06)'
      ctx.beginPath()
      ctx.moveTo(px(v), PLOT.y - 4)
      ctx.lineTo(px(v), PLOT.y + PLOT.h)
      ctx.stroke()
      ctx.fillText(`${v}`, px(v) - 10, PLOT.y + PLOT.h + 14)
    }
    ctx.fillText('molecular speed  (m/s)', PLOT.x + PLOT.w - 150, PLOT.y + PLOT.h + 26)
    ctx.save()
    ctx.translate(PLOT.x - 40, PLOT.y + 90)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('fraction of molecules', 0, 0)
    ctx.restore()

    // Faint curves for every gas — the family the selected one belongs to.
    GASES.forEach(g => {
      if (g.id === sel) return
      ctx.beginPath()
      for (let i = 0; i <= SAMPLES; i++) {
        const v = (i / SAMPLES) * V_MAX
        const X = px(v)
        const Y = py(mb(v, g.mass, T))
        if (i === 0) ctx.moveTo(X, Y)
        else ctx.lineTo(X, Y)
      }
      ctx.strokeStyle = FAINT
      ctx.lineWidth = 1
      ctx.stroke()
    })

    // The selected gas: filled accent curve.
    const gas = GASES.find(g => g.id === sel) as Gas
    ctx.beginPath()
    ctx.moveTo(px(0), PLOT.y + PLOT.h)
    for (let i = 0; i <= SAMPLES; i++) {
      const v = (i / SAMPLES) * V_MAX
      ctx.lineTo(px(v), py(mb(v, gas.mass, T)))
    }
    ctx.lineTo(px(V_MAX), PLOT.y + PLOT.h)
    ctx.closePath()
    ctx.fillStyle = 'rgba(251,146,60,0.14)'
    ctx.fill()
    ctx.beginPath()
    for (let i = 0; i <= SAMPLES; i++) {
      const v = (i / SAMPLES) * V_MAX
      const X = px(v)
      const Y = py(mb(v, gas.mass, T))
      if (i === 0) ctx.moveTo(X, Y)
      else ctx.lineTo(X, Y)
    }
    ctx.strokeStyle = ACCENT
    ctx.lineWidth = 2.4
    ctx.stroke()

    // The three characteristic speeds, marked on the selected curve.
    const { vp, vmean, vrms } = speeds(gas.mass, T)
    const marks: [number, string, string][] = [
      [vp, GOLD, 'vₚ'],
      [vmean, BLUE, 'v̄'],
      [vrms, VIOLET, 'v_rms'],
    ]
    marks.forEach(([v, col, lab], k) => {
      const X = px(v)
      ctx.strokeStyle = col
      ctx.lineWidth = 1.25
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(X, py(mb(v, gas.mass, T)))
      ctx.lineTo(X, PLOT.y + PLOT.h)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = col
      ctx.fillText(lab, X - 6, PLOT.y + 12 + k * 14)
      ctx.font = '9px monospace'
      ctx.fillText(`${Math.round(v)}`, X - 10, PLOT.y + 22 + k * 14)
    })

    // Header readout.
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = ACCENT
    ctx.fillText(`${gas.label}`, PLOT.x + 4, PLOT.y + 12)
    ctx.font = '11px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText(`T = ${Math.round(T)} K`, PLOT.x + 44, PLOT.y + 12)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('vₚ < v̄ < v_rms  ·  lighter gas → faster', PLOT.x + 44, PLOT.y + 26)

    return T
  }, [])

  useEffect(() => {
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!running || !visible) return
    let frame = 0
    const tick = () => {
      // Sweep temperature up and down so the curve visibly broadens and shifts.
      let t = tempRef.current + dirRef.current * 1.6
      if (t >= T_MAX) {
        t = T_MAX
        dirRef.current = -1
      } else if (t <= T_MIN) {
        t = T_MIN
        dirRef.current = 1
      }
      tempRef.current = t
      draw()
      frame += 1
      if (frame % 6 === 0) setTemp(Math.round(t))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw, visible])

  useEffect(() => {
    if (!running) draw()
  }, [running, draw])

  const onTemp = (next: number) => {
    tempRef.current = next
    setTemp(next)
    setRunning(false)
    draw()
  }

  const onSpecies = (id: string) => {
    speciesRef.current = id
    setSpecies(id)
    draw()
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    tempRef.current = T_REF
    dirRef.current = 1
    speciesRef.current = 'N2'
    setTemp(T_REF)
    setSpecies('N2')
    draw()
  }

  const sel = GASES.find(g => g.id === species) as Gas
  const cur = speeds(sel.mass, temp)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · The Maxwell–Boltzmann speed distribution
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
          aria-label="Animated diagram: The Maxwell–Boltzmann speed distribution. Values are reported below the diagram."
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-teal text-bg-base text-xs font-medium hover:bg-accent-teal/90 transition-colors"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Heat
            </>
          )}
        </button>
        <div className="flex items-center gap-1.5">
          {GASES.map(g => (
            <button
              key={g.id}
              onClick={() => onSpecies(g.id)}
              className={`px-2 py-1 rounded-md text-xs font-mono transition-colors ${
                species === g.id
                  ? 'bg-accent-teal/20 text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Temp:</span>
          <input
            type="range"
            min={T_MIN}
            max={T_MAX}
            step={10}
            value={temp}
            onChange={e => onTemp(+e.target.value)}
            className="w-24 accent-accent-teal"
          />
          <span className="font-mono text-text-secondary">{temp} K</span>
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary font-mono">
          v_rms {Math.round(cur.vrms)} m/s
        </WidgetStatus>
      </div>
    </div>
  )
}
