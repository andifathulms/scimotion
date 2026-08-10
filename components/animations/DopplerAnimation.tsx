'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300
const X0 = 30           // source launch x
const SRC_Y = 108       // the source travels along this line
const OBS_X = 500       // stationary observer
const OBS_Y = 248
const WAVE_SPEED = 150  // px per second — the "speed of sound" here
const EMIT = 0.34       // seconds between emitted crests
const MAX_R = 820       // retire a wavefront once it is this big
const DEFAULT_MACH = 0.6

// Start the clock so the source sits mid-canvas: a static (reduced-motion)
// first frame is already an informative picture.
const seedTime = (mach: number) => (300 - X0) / (mach * WAVE_SPEED)

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  mach: { default: DEFAULT_MACH, min: 0.25, max: 1.6, step: 0.05 },
}

export function DopplerAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => { if (!reduced) setRunning(true) },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(seedTime(DEFAULT_MACH))
  const lastRef = useRef<number | null>(null)

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('doppler', SPEC)
  const { mach } = params
  const [readout, setReadout] = useState<{ ratio: number | null; label: string }>({
    ratio: 1, label: 'approaching',
  })

  const draw = useCallback((t: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const S = mach * WAVE_SPEED
    const sx = X0 + S * t

    ctx.clearRect(0, 0, W, H)

    // Faint grid
    ctx.strokeStyle = 'rgba(255,245,235,0.04)'
    ctx.lineWidth = 1
    for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke() }
    for (let gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke() }

    // Path of the source
    ctx.beginPath()
    ctx.setLineDash([4, 5])
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.moveTo(0, SRC_Y); ctx.lineTo(W, SRC_Y); ctx.stroke()
    ctx.setLineDash([])

    // Every crest still alive: emitted at k*EMIT from where the source then was,
    // expanding at the wave speed ever since. Centres are left behind; the source
    // is not, and that alone is the whole Doppler effect.
    const kMax = Math.floor(t / EMIT)
    for (let k = 0; k <= kMax; k++) {
      const age = t - k * EMIT
      const r = age * WAVE_SPEED
      if (r > MAX_R || r < 0.5) continue
      const cx = X0 + S * k * EMIT
      const fade = 1 - r / MAX_R
      ctx.beginPath()
      ctx.arc(cx, SRC_Y, r, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(96,165,250,${(0.10 + 0.55 * fade).toFixed(3)})`
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, SRC_Y, 1.5, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(96,165,250,${(0.25 * fade).toFixed(3)})`
      ctx.fill()
    }

    // Mach cone once the source outruns its own sound
    const supersonic = mach > 1
    const mu = supersonic ? Math.asin(1 / mach) : 0
    if (supersonic) {
      const L = 900
      ctx.strokeStyle = 'rgba(244,114,182,0.75)'
      ctx.lineWidth = 2
      for (const sign of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(sx, SRC_Y)
        ctx.lineTo(sx - L * Math.cos(mu), SRC_Y + sign * L * Math.sin(mu))
        ctx.stroke()
      }
      ctx.font = '10px monospace'
      ctx.fillStyle = 'rgba(244,114,182,0.9)'
      ctx.fillText(`shock cone  μ = ${(mu * 180 / Math.PI).toFixed(0)}°`, 14, 24)
    }

    // Labels for the compressed / stretched sides
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('stretched  ← behind', 14, H - 14)
    const aheadLabel = 'ahead →  compressed'
    ctx.fillText(aheadLabel, W - 14 - ctx.measureText(aheadLabel).width, H - 14)

    // Observer
    const dx = OBS_X - sx
    const dy = OBS_Y - SRC_Y
    const d = Math.hypot(dx, dy) || 1
    const ur = dx / d                       // source velocity component toward observer
    const denom = 1 - mach * ur
    const audible = supersonic ? -ur >= Math.cos(mu) : denom > 0.02
    const ratio = audible && denom > 0.02 ? 1 / denom : null

    ctx.beginPath()
    ctx.setLineDash([3, 4])
    ctx.strokeStyle = 'rgba(245,240,232,0.18)'
    ctx.moveTo(sx, SRC_Y); ctx.lineTo(OBS_X, OBS_Y); ctx.stroke()
    ctx.setLineDash([])

    ctx.beginPath()
    ctx.arc(OBS_X, OBS_Y, 8, 0, Math.PI * 2)
    ctx.fillStyle = audible ? '#10B981' : 'rgba(16,185,129,0.25)'
    ctx.fill()
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('observer', OBS_X + 14, OBS_Y + 4)
    ctx.fillStyle = ratio === null ? 'rgba(244,114,182,0.9)' : '#10B981'
    ctx.fillText(
      ratio === null ? "silent — ahead of the shock" : `f′/f = ${ratio.toFixed(2)}`,
      OBS_X - 96, OBS_Y - 16
    )

    // Source: a gold dot with a velocity arrow
    const glow = ctx.createRadialGradient(sx, SRC_Y, 1, sx, SRC_Y, 18)
    glow.addColorStop(0, 'rgba(245,158,11,0.5)')
    glow.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(sx, SRC_Y, 18, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(sx, SRC_Y, 6, 0, Math.PI * 2)
    ctx.fillStyle = '#F59E0B'
    ctx.fill()

    const arrow = 14 + 26 * mach
    ctx.beginPath()
    ctx.moveTo(sx + 8, SRC_Y); ctx.lineTo(sx + arrow, SRC_Y)
    ctx.strokeStyle = '#F59E0B'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(sx + arrow, SRC_Y)
    ctx.lineTo(sx + arrow - 6, SRC_Y - 4)
    ctx.lineTo(sx + arrow - 6, SRC_Y + 4)
    ctx.closePath()
    ctx.fillStyle = '#F59E0B'
    ctx.fill()

    setReadout({
      ratio,
      label: ratio === null
        ? 'no signal yet'
        : ur > 0 ? 'approaching' : 'receding',
    })
  }, [mach])

  useEffect(() => { draw(tRef.current) }, [draw])

  useEffect(() => {
    if (!running) {
      lastRef.current = null
      cancelAnimationFrame(rafRef.current)
      return
    }
    const loop = (now: number) => {
      if (lastRef.current === null) lastRef.current = now
      const dt = Math.min(64, now - lastRef.current) / 1000
      lastRef.current = now
      const next = tRef.current + dt
      const sx = X0 + mach * WAVE_SPEED * next
      tRef.current = sx > W - 16 ? 0 : next
      draw(tRef.current)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, mach, draw])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    tRef.current = seedTime(mach)
    lastRef.current = null
    draw(tRef.current)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Moving source, bunched wavefronts</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Source speed:</span>
          <input
            type="range" min={SPEC.mach.min} max={SPEC.mach.max} step={SPEC.mach.step} value={mach}
            onChange={ev => {
              const m = +ev.target.value
              set('mach', m)
              tRef.current = seedTime(m)
              lastRef.current = null
            }}
            className="w-36 accent-accent-gold"
          />
          <span className="text-text-secondary font-medium">{mach.toFixed(2)}× wave speed</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          {readout.ratio === null
            ? <strong className="text-accent-pink">ahead of the shock — silent</strong>
            : <>heard at <strong className="text-accent-gold">{readout.ratio.toFixed(2)}×</strong> the emitted pitch ({readout.label})</>}
        </span>
      </div>
    </div>
  )
}
