'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const CYAN = '#22D3EE' // field accent
const GOLD = '#F59E0B' // solar wind
const BLUE = '#60A5FA'
const GREEN = '#10B981' // aurora glow
const VIOLET = '#A78BFA'
const MUTE = 'rgba(245,240,232,0.5)'

// Deterministic PRNG — fixed seed, no Math.random / Date.now anywhere.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hex = (c: string, a: number) =>
  `${c}${Math.max(0, Math.min(255, Math.round(a * 255)))
    .toString(16)
    .padStart(2, '0')}`

// Geometry: Sun off the left edge, Earth on the right.
const SUN_X = 30
const EX = 430 // Earth centre x
const EY = 170 // Earth centre y
const R_E = 40 // Earth radius px

// The two polar entry points where field lines dive in.
const POLES = [
  { x: EX, y: EY - R_E, sign: -1 }, // north (top)
  { x: EX, y: EY + R_E, sign: 1 }, // south (bottom)
]

type Phase = 'emit' | 'guide' | 'collide' | 'emitlight'
const PHASES: { key: Phase; label: string; color: string; note: string }[] = [
  { key: 'emit', label: '1 · Solar wind', color: GOLD, note: 'The Sun blows off a stream of charged particles — the solar wind — racing outward at hundreds of km/s.' },
  { key: 'guide', label: '2 · Guided by the field', color: CYAN, note: "Earth's magnetic field catches the particles and steers them along field lines down toward both poles." },
  { key: 'collide', label: '3 · Collision', color: BLUE, note: 'High in the atmosphere the particles slam into oxygen and nitrogen atoms, exciting them.' },
  { key: 'emitlight', label: '4 · The sky emits light', color: GREEN, note: 'The excited atoms relax and emit their own light — an aurora curtain glowing at the poles.' },
]

type P = {
  x: number
  y: number
  born: number
  pole: number // index into POLES
  seed: number
  landed: number // frame it reached the pole (0 = not yet)
}

export function AuroraFormationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const lastRef = useRef<number | null>(null)
  const frameRef = useRef(0)

  const [intensity, setIntensity] = useState(1) // 0.4 .. 1.8
  const [running, setRunning] = useState(false)
  const [phaseIdx, setPhaseIdx] = useState(0)

  const intensityRef = useRef(intensity)
  useEffect(() => {
    intensityRef.current = intensity
  }, [intensity])

  const partsRef = useRef<P[]>([])
  const glowRef = useRef({ top: 0, bottom: 0 })
  const spawnCtr = useRef(0)
  const rand = useRef(mulberry32(0x51ce))

  const resetParticles = useCallback(() => {
    partsRef.current = []
    glowRef.current = { top: 0, bottom: 0 }
    spawnCtr.current = 0
    rand.current = mulberry32(0x51ce)
  }, [])

  const spawn = useCallback(() => {
    const r = rand.current
    const pole = spawnCtr.current % 2 // alternate poles deterministically
    spawnCtr.current += 1
    partsRef.current.push({
      x: SUN_X + 8,
      y: 40 + r() * (H - 80),
      born: frameRef.current,
      pole,
      seed: r() * 1000,
      landed: 0,
    })
  }, [])

  // Which phase is the leading edge of the flow in? Drives the readout.
  const leadPhase = useCallback((): number => {
    const g = glowRef.current
    if (g.top > 0.08 || g.bottom > 0.08) return 3
    let anyGuided = false
    for (const p of partsRef.current) {
      if (p.x > EX - 150) anyGuided = true
      if (p.x > EX - R_E - 30) return 2
    }
    return anyGuided ? 1 : 0
  }, [])

  const update = useCallback(
    (steps: number) => {
      const w = intensityRef.current
      const g = glowRef.current
      g.top *= Math.pow(0.965, steps)
      g.bottom *= Math.pow(0.965, steps)

      // Emit particles at a rate that grows with storm intensity.
      const rate = 0.18 * w
      if (rand.current() < rate * steps && partsRef.current.length < 220) spawn()

      const speed = (1.6 + w * 1.3) * steps
      const kept: P[] = []
      for (const p of partsRef.current) {
        const pole = POLES[p.pole]
        // Distance to this particle's target pole.
        const dxp = pole.x - p.x
        const dyp = pole.y - p.y
        const dist = Math.hypot(dxp, dyp) || 1

        if (dist < 6) {
          // Reached the pole: dump energy into the auroral glow, then retire.
          if (pole.sign < 0) g.top = Math.min(1, g.top + 0.16)
          else g.bottom = Math.min(1, g.bottom + 0.16)
          continue
        }

        // Far from Earth the particle streams roughly straight (solar wind).
        // As it nears the magnetosphere it curves onto the field line to a pole.
        const capture = Math.max(0, Math.min(1, (p.x - (EX - 210)) / 200))
        // straight component
        const vxs = 1
        const vys = 0.04 * Math.sin(p.seed + frameRef.current * 0.03)
        // guided component toward the pole
        const vxg = dxp / dist
        const vyg = dyp / dist
        p.x += (vxs * (1 - capture) + vxg * capture) * speed
        p.y += (vys * (1 - capture) + vyg * capture) * speed
        if (p.x > W + 20) continue
        kept.push(p)
      }
      partsRef.current = kept
    },
    [spawn]
  )

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = intensityRef.current
    const f = frameRef.current
    const g = glowRef.current

    // background
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    // faint vertical grid
    ctx.strokeStyle = 'rgba(255,245,235,0.03)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }

    // ---- Sun on the left ----
    const sg = ctx.createRadialGradient(SUN_X, EY, 4, SUN_X, EY, 70)
    sg.addColorStop(0, hex(GOLD, 0.95))
    sg.addColorStop(0.5, hex(GOLD, 0.4))
    sg.addColorStop(1, hex(GOLD, 0))
    ctx.fillStyle = sg
    ctx.beginPath()
    ctx.arc(SUN_X, EY, 70, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = hex(GOLD, 0.9)
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('Sun', SUN_X - 8, EY + 58)
    ctx.fillStyle = MUTE
    ctx.font = '9px monospace'
    ctx.fillText(`solar wind → ~${Math.round(400 * (0.6 + w * 0.6))} km/s`, 12, 22)

    // ---- Earth's magnetic field lines (dipole arcs) ----
    for (const L of [60, 95, 135, 180]) {
      // dayside loop (facing the Sun, left)
      ctx.beginPath()
      ctx.moveTo(EX, EY - R_E + 2)
      ctx.quadraticCurveTo(EX - L, EY, EX, EY + R_E - 2)
      ctx.strokeStyle = hex(CYAN, 0.22)
      ctx.lineWidth = 1
      ctx.stroke()
      // nightside loop (right) for a fuller dipole look
      ctx.beginPath()
      ctx.moveTo(EX, EY - R_E + 2)
      ctx.quadraticCurveTo(EX + L * 0.7, EY, EX, EY + R_E - 2)
      ctx.strokeStyle = hex(CYAN, 0.12)
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.fillStyle = hex(CYAN, 0.7)
    ctx.font = '9px monospace'
    ctx.fillText('magnetic field', EX - 150, 22)

    // ---- particles ----
    for (const p of partsRef.current) {
      const capture = Math.max(0, Math.min(1, (p.x - (EX - 210)) / 200))
      const col = capture > 0.5 ? CYAN : GOLD
      const r = 1.6
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fillStyle = hex(col, 0.85)
      ctx.fill()
      // short trailing streak
      ctx.strokeStyle = hex(col, 0.25)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - 6, p.y)
      ctx.stroke()
    }

    // ---- Earth ----
    const eg = ctx.createLinearGradient(EX - R_E, EY, EX + R_E, EY)
    eg.addColorStop(0, hex(BLUE, 0.95))
    eg.addColorStop(1, hex(GREEN, 0.55))
    ctx.beginPath()
    ctx.arc(EX, EY, R_E, 0, Math.PI * 2)
    ctx.fillStyle = eg
    ctx.fill()
    ctx.strokeStyle = 'rgba(245,240,232,0.4)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.85)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('Earth', EX, EY + 3)

    // ---- auroral glow curtains at the poles ----
    const flick = 0.82 + 0.18 * Math.sin(f * 0.18)
    for (const pole of POLES) {
      const base = pole.sign < 0 ? g.top : g.bottom
      const b = Math.min(1, base + 0.06 * (w - 0.4)) * flick
      if (b < 0.03) continue
      // curtain = vertical fan of light lines above/below the pole
      const dir = pole.sign // -1 up, +1 down
      const cx = pole.x
      const cy = pole.y + dir * 4
      const grd = ctx.createRadialGradient(cx, cy, 1, cx, cy, 34)
      grd.addColorStop(0, hex(GREEN, 0.9 * b))
      grd.addColorStop(0.55, hex(GREEN, 0.35 * b))
      grd.addColorStop(1, hex(VIOLET, 0))
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(cx, cy, 34, 0, Math.PI * 2)
      ctx.fill()
      // rays
      for (let i = -3; i <= 3; i++) {
        const rx = cx + i * 7
        ctx.strokeStyle = hex(i % 2 === 0 ? GREEN : VIOLET, 0.4 * b)
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(rx, cy)
        ctx.lineTo(rx + i * 2, cy + dir * (16 + 10 * Math.abs(Math.sin(f * 0.1 + i))))
        ctx.stroke()
      }
    }

    ctx.textAlign = 'left'
  }, [])

  const applyPhaseState = useCallback(() => {
    setPhaseIdx(leadPhase())
  }, [leadPhase])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // One static final frame: a fully lit aurora, no loop.
        resetParticles()
        glowRef.current = { top: 0.75, bottom: 0.75 }
        frameRef.current = 30
        // seed a few in-flight particles for context
        for (let i = 0; i < 24; i++) spawn()
        render()
        setPhaseIdx(3)
      } else {
        setRunning(true)
      }
    },
  })

  // devicePixelRatio-aware backing store, sized once on mount.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.height = `${H}px`
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    render()
  }, [render])

  useEffect(() => {
    render()
  }, [render, intensity])

  useEffect(() => {
    if (!running) {
      lastRef.current = null
      cancelAnimationFrame(rafRef.current)
      return
    }
    const loop = (t: number) => {
      if (lastRef.current === null) lastRef.current = t
      const dt = Math.min(64, t - lastRef.current)
      lastRef.current = t
      const steps = dt / 16.7
      frameRef.current += steps
      update(steps)
      render()
      applyPhaseState()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, update, render, applyPhaseState])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    lastRef.current = null
    frameRef.current = 0
    resetParticles()
    setIntensity(1)
    intensityRef.current = 1
    setPhaseIdx(0)
    render()
  }

  const phase = PHASES[Math.max(0, Math.min(PHASES.length - 1, phaseIdx))]
  const stormLabel = intensity < 0.75 ? 'calm' : intensity > 1.35 ? 'storm' : 'normal'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Sun → field → collision → glow
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: '#0F0D0A' }}
        />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span style={{ color: phase.color }}>{phase.label}</span>
        <span className="text-text-muted">{phase.note}</span>
        <span className="ml-auto" style={{ color: CYAN }}>
          solar wind: {stormLabel}
        </span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Solar-wind intensity:</span>
          <input
            type="range"
            min={40}
            max={180}
            step={1}
            value={Math.round(intensity * 100)}
            onChange={e => setIntensity(+e.target.value / 100)}
            className="w-32"
            style={{ accentColor: CYAN }}
          />
          <span className="font-mono text-text-secondary">{stormLabel}</span>
        </div>
        <span className="ml-auto text-xs text-text-muted">
          stronger storm → brighter, more particles funneled to the poles
        </span>
      </div>
    </div>
  )
}
