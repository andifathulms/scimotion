'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw, Snowflake, Flame } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 620
const H = 340

const TMAX = 20
const TC = 9.3

// Sample slab
const SX0 = 130
const SX1 = 490
const STOP = 232
const SBOT = 300

const MAG_CX = 310
const MAG_W = 88
const MAG_H = 20
const LIFT = 74 // px the magnet rises once the field is fully expelled

// Inset plot (field strength vs depth)
const IX = 500
const IY = 46
const IW = 100
const IH = 74

type Pt = { x: number; y: number }

// Superfluid fraction — 1 well below Tc, 0 at and above it.
function expulsion(T: number): number {
  if (T >= TC) return 0
  const r = T / TC
  return 1 - r * r * r * r
}

// London penetration depth diverges as T approaches Tc from below.
function lambdaPx(f: number): number {
  if (f <= 0.0001) return SBOT - STOP
  return Math.min(SBOT - STOP, 5 / Math.sqrt(f))
}

export function MeissnerEffectAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tempRef = useRef(16)
  const targetRef = useRef(16)
  const phaseRef = useRef(0)
  const [temp, setTemp] = useState(16)
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        tempRef.current = 2
        targetRef.current = 2
        setTemp(2)
      } else {
        setRunning(true)
        targetRef.current = 2
      }
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const T = tempRef.current
    const f = expulsion(T)
    const lam = lambdaPx(f)
    const cold = T < TC
    const magCy = 220 - LIFT * f
    const phase = phaseRef.current

    ctx.clearRect(0, 0, W, H)

    // --- Field lines: loops around the bar magnet, deformed by the sample ---
    // Inside the superconductor the field is pushed out to a thin surface
    // layer of thickness lambda; that displacement is what "expulsion" means.
    const deform = (p: Pt): Pt => {
      if (p.x < SX0 - 4 || p.x > SX1 + 4 || p.y < STOP) return p
      const targetY = STOP + lam * 0.6
      return { x: p.x, y: p.y + f * (targetY - p.y) }
    }

    for (let k = 1; k <= 5; k++) {
      const a = 26 + k * 34
      const b = 20 + k * 19
      const pts: Pt[] = []
      for (let s = 0; s <= 72; s++) {
        const th = (s / 72) * Math.PI * 2
        pts.push(
          deform({
            x: MAG_CX + Math.cos(th) * a,
            y: magCy + Math.sin(th) * b,
          })
        )
      }
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let s = 1; s < pts.length; s++) ctx.lineTo(pts[s].x, pts[s].y)
      ctx.closePath()
      ctx.strokeStyle = cold
        ? `rgba(16,185,129,${0.55 - k * 0.055})`
        : `rgba(96,165,250,${0.55 - k * 0.055})`
      ctx.lineWidth = 1.4
      ctx.stroke()

      // A travelling dot per loop makes the field direction readable.
      const s = Math.floor(((phase * 0.06 + k * 0.13) % 1) * 72)
      const d = pts[s]
      ctx.beginPath()
      ctx.arc(d.x, d.y, 2.2, 0, Math.PI * 2)
      ctx.fillStyle = cold ? '#10B981' : '#60A5FA'
      ctx.fill()
    }

    // --- Sample slab ---------------------------------------------------
    ctx.fillStyle = cold ? 'rgba(16,185,129,0.08)' : 'rgba(96,165,250,0.06)'
    ctx.fillRect(SX0, STOP, SX1 - SX0, SBOT - STOP)
    ctx.strokeStyle = cold ? 'rgba(16,185,129,0.6)' : 'rgba(96,165,250,0.45)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(SX0, STOP, SX1 - SX0, SBOT - STOP)

    // Penetration layer: B decays as exp(-x / lambda) below the surface.
    if (f > 0) {
      for (let d = 0; d < SBOT - STOP; d++) {
        const amp = Math.exp(-d / lam)
        if (amp < 0.02) break
        ctx.fillStyle = `rgba(16,185,129,${0.3 * amp * f})`
        ctx.fillRect(SX0, STOP + d, SX1 - SX0, 1)
      }
      ctx.strokeStyle = 'rgba(167,139,250,0.7)'
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(SX0, STOP + lam)
      ctx.lineTo(SX1, STOP + lam)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.font = '9px monospace'
      ctx.fillStyle = '#A78BFA'
      ctx.fillText(`λ ≈ ${lam.toFixed(1)} px`, SX0 + 6, STOP + lam + 12)
    }

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('superconducting sample', SX0 + 6, SBOT - 8)

    // --- Magnet --------------------------------------------------------
    const my = magCy - MAG_H / 2
    ctx.fillStyle = '#F472B6'
    ctx.fillRect(MAG_CX - MAG_W / 2, my, MAG_W / 2, MAG_H)
    ctx.fillStyle = '#F59E0B'
    ctx.fillRect(MAG_CX, my, MAG_W / 2, MAG_H)
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = '#0F0D0A'
    ctx.fillText('N', MAG_CX - MAG_W / 2 + 16, my + 14)
    ctx.fillText('S', MAG_CX + MAG_W / 2 - 24, my + 14)

    // Levitation gap
    if (f > 0.05) {
      ctx.strokeStyle = 'rgba(245,158,11,0.5)'
      ctx.setLineDash([2, 3])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(MAG_CX + MAG_W / 2 + 14, magCy + MAG_H / 2)
      ctx.lineTo(MAG_CX + MAG_W / 2 + 14, STOP)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.font = '9px monospace'
      ctx.fillStyle = '#F59E0B'
      ctx.fillText('levitation gap', MAG_CX + MAG_W / 2 + 20, (magCy + STOP) / 2)
    }

    // --- Labels --------------------------------------------------------
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = cold ? '#10B981' : '#60A5FA'
    ctx.fillText(cold ? 'B EXPELLED  (B = 0 inside)' : 'B THREADS THE SAMPLE', 14, 24)
    ctx.font = '11px monospace'
    ctx.fillStyle = '#F59E0B'
    ctx.fillText(`T = ${T.toFixed(1)} K   ·   Tc = ${TC} K`, 14, 42)

    // --- Inset: B(x)/B0 vs depth ---------------------------------------
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(IX, IY)
    ctx.lineTo(IX, IY + IH)
    ctx.lineTo(IX + IW, IY + IH)
    ctx.stroke()
    ctx.font = '8px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('B/B₀', IX + 2, IY - 4)
    ctx.fillText('depth →', IX + IW - 40, IY + IH + 11)

    ctx.strokeStyle = f > 0 ? '#10B981' : '#60A5FA'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    for (let px = 0; px <= IW; px++) {
      const depth = (px / IW) * 60
      const amp = f > 0 ? Math.exp(-depth / lam) : 1
      const y = IY + IH - amp * IH
      if (px === 0) ctx.moveTo(IX, y)
      else ctx.lineTo(IX + px, y)
    }
    ctx.stroke()

    if (f > 0 && lam < 60) {
      const lx = IX + (lam / 60) * IW
      ctx.strokeStyle = 'rgba(167,139,250,0.7)'
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(lx, IY)
      ctx.lineTo(lx, IY + IH)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#A78BFA'
      ctx.fillText('λ', lx + 3, IY + 9)
    }
  }, [])

  useEffect(() => {
    if (!running) return
    let frame = 0
    const tick = () => {
      const d = targetRef.current - tempRef.current
      tempRef.current = Math.abs(d) < 0.03 ? targetRef.current : tempRef.current + d * 0.05
      phaseRef.current += 1
      draw()
      frame += 1
      if (frame % 5 === 0) setTemp(tempRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => {
    if (!running) draw()
  }, [temp, running, draw])

  const setBoth = (v: number) => {
    tempRef.current = v
    targetRef.current = v
    setTemp(v)
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    phaseRef.current = 0
    setBoth(16)
    draw()
  }

  const f = expulsion(temp)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The Meissner effect</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: The Meissner effect. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { setRunning(true); targetRef.current = 2 }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-teal text-bg-base text-xs font-medium hover:bg-accent-teal/90 transition-colors"
        >
          <Snowflake size={12} /> Cool
        </button>
        <button
          onClick={() => { setRunning(true); targetRef.current = 18 }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs font-medium hover:bg-bg-hover transition-colors"
        >
          <Flame size={12} /> Warm
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Temperature:</span>
          <input
            type="range" min={0} max={TMAX} step={0.1} value={temp}
            onChange={e => { setRunning(false); setBoth(+e.target.value) }}
            className="w-32 accent-accent-teal"
          />
          <span className="font-mono text-text-secondary">{temp.toFixed(1)} K</span>
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary font-mono">
          {f > 0 ? `expelled ${Math.round(f * 100)}% · λ = ${lambdaPx(f).toFixed(1)}` : 'field penetrates'}
        </WidgetStatus>
      </div>
    </div>
  )
}
