'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 300

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

const CX = 402 // Earth centre x (Sun is off to the left)
const CY = 150
const R_E = 19 // Earth radius, px
const TAIL_HALF = 92 // magnetotail half-width, px
const N_PART = 96

const hex = (c: string, a: number) =>
  `${c}${Math.max(0, Math.min(255, Math.round(a * 255)))
    .toString(16)
    .padStart(2, '0')}`

type Mode = 'wind' | 'funnel'
type Particle = { x: number; y: number; vx: number; vy: number; mode: Mode; pole: number }

// Dayside standoff distance shrinks as the solar wind strengthens (a storm
// squeezes the magnetosphere in). Real standoff ~10 Earth radii, ~6-7 in a storm.
const standoffOf = (w: number) => Math.max(96, Math.min(322, 150 / w + 78))

// Half-thickness of the magnetopause cavity at horizontal position x.
const cavityHW = (x: number, xn: number) => {
  const rel = x - xn
  if (rel <= 0) return 0
  return Math.min(TAIL_HALF, 13 + TAIL_HALF * Math.sqrt(Math.min(1, rel / 150)))
}

export function MagnetosphereAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const lastRef = useRef<number | null>(null)
  const frameRef = useRef(0)

  const [wind, setWind] = useState(1) // solar-wind strength, 0.4..1.8
  const [running, setRunning] = useState(false)

  const windRef = useRef(wind)
  useEffect(() => {
    windRef.current = wind
  }, [wind])

  const partsRef = useRef<Particle[]>([])
  const auroraRef = useRef({ top: 0, bottom: 0 })

  const spawn = useCallback((p: Particle) => {
    p.x = -Math.random() * 120
    p.y = 16 + Math.random() * (H - 32)
    p.vx = 1
    p.vy = 0
    p.mode = 'wind'
    p.pole = 0
  }, [])

  const ensure = useCallback(() => {
    if (partsRef.current.length) return
    partsRef.current = Array.from({ length: N_PART }, () => {
      const p: Particle = { x: 0, y: 0, vx: 1, vy: 0, mode: 'wind', pole: 0 }
      spawn(p)
      p.x = Math.random() * W // pre-scatter so a static frame looks alive
      return p
    })
  }, [spawn])

  const update = useCallback(
    (steps: number) => {
      const w = windRef.current
      const xn = CX - standoffOf(w)
      const speed = (1.4 + w * 1.9) * steps
      const aur = auroraRef.current
      aur.top *= Math.pow(0.94, steps)
      aur.bottom *= Math.pow(0.94, steps)

      for (const p of partsRef.current) {
        if (p.mode === 'funnel') {
          const tx = CX - 5
          const ty = CY + p.pole * (R_E + 3)
          const dx = tx - p.x
          const dy = ty - p.y
          const d = Math.hypot(dx, dy) || 1
          p.x += (dx / d) * speed * 1.1
          p.y += (dy / d) * speed * 1.1
          if (d < 5) {
            if (p.pole > 0) aur.bottom = Math.min(1, aur.bottom + 0.5)
            else aur.top = Math.min(1, aur.top + 0.5)
            spawn(p)
          }
          continue
        }

        p.x += p.vx * speed
        p.y += p.vy * speed

        const hw = cavityHW(p.x, xn)
        if (p.x > xn - 4 && Math.abs(p.y - CY) < hw) {
          const sgn = p.y >= CY ? 1 : -1
          // a few particles at the dayside cusp funnel down to a pole
          if (p.x < xn + 46 && Math.random() < 0.02 * (0.5 + w)) {
            p.mode = 'funnel'
            p.pole = sgn
            continue
          }
          p.y = CY + sgn * hw
          const slope = cavityHW(p.x + 2, xn) - cavityHW(p.x - 2, xn)
          const mag = Math.hypot(2, slope) || 1
          p.vx = (2 / mag) * 0.9
          p.vy = ((sgn * Math.abs(slope)) / mag) * 0.9
        }

        if (p.x > W + 10 || p.y < -10 || p.y > H + 10) spawn(p)
      }
    },
    [spawn]
  )

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ensure()

    const w = windRef.current
    const xn = CX - standoffOf(w)
    const f = frameRef.current

    ctx.clearRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(255,245,235,0.035)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }

    // ---- bow shock ----
    const bn = xn - 34
    ctx.strokeStyle = hex(GOLD, 0.28)
    ctx.setLineDash([5, 5])
    ctx.lineWidth = 1.2
    for (const s of [1, -1]) {
      ctx.beginPath()
      ctx.moveTo(bn, CY)
      ctx.quadraticCurveTo(bn + 40, CY + s * 150, W, CY + s * 150)
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.fillStyle = hex(GOLD, 0.5)
    ctx.font = '8px monospace'
    ctx.fillText('bow shock', bn - 6, CY - 118)

    // ---- magnetopause cavity ----
    ctx.beginPath()
    ctx.moveTo(xn, CY)
    for (let x = xn; x <= W; x += 6) ctx.lineTo(x, CY - cavityHW(x, xn))
    ctx.lineTo(W, CY + cavityHW(W, xn))
    for (let x = W; x >= xn; x -= 6) ctx.lineTo(x, CY + cavityHW(x, xn))
    ctx.closePath()
    ctx.fillStyle = hex(CYAN, 0.06)
    ctx.fill()
    ctx.strokeStyle = hex(CYAN, 0.55)
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = hex(CYAN, 0.6)
    ctx.fillText('magnetopause', xn + 4, CY - cavityHW(xn + 60, xn) - 6)
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('magnetotail →', W - 92, CY - 6)

    // ---- closed dipole field loops hugging the Earth ----
    for (const L of [30, 44, 60]) {
      for (const s of [1, -1]) {
        ctx.beginPath()
        ctx.moveTo(CX, CY - R_E)
        ctx.quadraticCurveTo(CX - s * L * 1.4, CY, CX, CY + R_E)
        ctx.strokeStyle = hex(CYAN, 0.3)
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
    // polar cusp funnels (open field lines) to each pole
    for (const s of [1, -1]) {
      ctx.beginPath()
      ctx.moveTo(CX - 4, CY + s * (R_E + 1))
      ctx.quadraticCurveTo(CX - 60, CY + s * 42, xn + 20, CY + s * 70)
      ctx.strokeStyle = hex(BLUE, 0.35)
      ctx.setLineDash([3, 4])
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.setLineDash([])
    }

    // ---- solar-wind stream label + arrows on the left ----
    ctx.fillStyle = hex(GOLD, 0.7)
    ctx.font = '9px monospace'
    ctx.fillText('solar wind →', 12, 20)
    ctx.fillText(`~${Math.round(400 * (0.6 + w * 0.6))} km/s`, 12, 32)

    // ---- particles ----
    for (const p of partsRef.current) {
      const col = p.mode === 'funnel' ? GREEN : GOLD
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.mode === 'funnel' ? 1.8 : 1.4, 0, Math.PI * 2)
      ctx.fillStyle = hex(col, p.mode === 'funnel' ? 0.95 : 0.7)
      ctx.fill()
    }

    // ---- Earth ----
    ctx.beginPath()
    ctx.arc(CX, CY, R_E, 0, Math.PI * 2)
    const eg = ctx.createLinearGradient(CX - R_E, CY, CX + R_E, CY)
    eg.addColorStop(0, hex(BLUE, 0.9))
    eg.addColorStop(1, hex(GREEN, 0.55))
    ctx.fillStyle = eg
    ctx.fill()
    ctx.strokeStyle = 'rgba(245,240,232,0.5)'
    ctx.lineWidth = 1
    ctx.stroke()

    // ---- auroral caps (brighten with funnelled flux + wind) ----
    const aur = auroraRef.current
    const flick = 0.85 + 0.15 * Math.sin(f * 0.2)
    for (const [s, g] of [
      [-1, aur.top],
      [1, aur.bottom],
    ] as [number, number][]) {
      const b = Math.min(1, 0.18 * w + g) * flick
      if (b < 0.03) continue
      const px = CX
      const py = CY + s * (R_E - 2)
      const grd = ctx.createRadialGradient(px, py, 1, px, py, 16)
      grd.addColorStop(0, hex(GREEN, 0.85 * b))
      grd.addColorStop(0.6, hex(GREEN, 0.35 * b))
      grd.addColorStop(1, hex(VIOLET, 0))
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(px, py, 16, 0, Math.PI * 2)
      ctx.fill()
    }

    // ---- heading ----
    ctx.font = '11px monospace'
    ctx.fillStyle = CYAN
    ctx.fillText('Magnetosphere · the field deflects the solar wind', 12, H - 26)
    ctx.font = '8px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('schematic — not a plasma simulation', 12, H - 12)
  }, [ensure])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        ensure()
        auroraRef.current.top = 0.4
        auroraRef.current.bottom = 0.4
        render()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    render()
  }, [render, wind])

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
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, update, render])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    lastRef.current = null
    frameRef.current = 0
    partsRef.current = []
    auroraRef.current = { top: 0, bottom: 0 }
    setWind(1)
    windRef.current = 1
    ensure()
    render()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Solar wind, magnetosphere, and aurora
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: Solar wind, magnetosphere, and aurora. Values are reported below the diagram."
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
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
          <span>Solar wind:</span>
          <input
            type="range"
            min={40}
            max={180}
            step={1}
            value={Math.round(wind * 100)}
            onChange={e => setWind(+e.target.value / 100)}
            className="w-32 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">
            {wind < 0.75 ? 'calm' : wind > 1.35 ? 'storm' : 'normal'}
          </span>
        </label>
      </div>
      <div className="animation-controls flex-wrap gap-3 text-xs text-text-muted">
        <span>
          dayside is compressed, nightside drawn into a tail; some particles funnel to the poles
        </span>
        <WidgetStatus className="ml-auto font-mono">
          standoff ≈ {(standoffOf(wind) / 15).toFixed(1)} R<sub>E</sub>
        </WidgetStatus>
      </div>
    </div>
  )
}
