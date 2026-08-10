'use client'
import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 260

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  beta: { default: 0.6, min: 0.1, max: 0.99, step: 0.01 },
}

export function TimeDilationAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(0)
  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('time-dilation', SPEC)
  const { beta } = params
  const [tProper, setTProper] = useState(0)
  const [tCoordinate, setTCoordinate] = useState(0)

  const gamma = (b: number) => 1 / Math.sqrt(1 - b * b)

  const draw = (t: number, b: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const g = gamma(b)

    // === Left panel: stationary light clock ===
    const lx = 80
    const ly = 30
    const lh = 140
    const lw = 60

    // Clock box
    ctx.strokeStyle = 'rgba(255,245,235,0.3)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(lx - lw / 2, ly, lw, lh)

    // Mirror lines
    ctx.strokeStyle = '#F59E0B'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(lx - lw / 2 + 5, ly + 5); ctx.lineTo(lx + lw / 2 - 5, ly + 5); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(lx - lw / 2 + 5, ly + lh - 5); ctx.lineTo(lx + lw / 2 - 5, ly + lh - 5); ctx.stroke()

    // Light bounce (period = 2lh steps)
    const period = 2 * lh
    const tMod = (t * 80) % period
    const bounceY = tMod < lh ? ly + 5 + tMod : ly + lh - 5 - (tMod - lh)
    ctx.beginPath()
    ctx.arc(lx, bounceY, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#60A5FA'
    ctx.fill()
    // Glow
    const grd = ctx.createRadialGradient(lx, bounceY, 0, lx, bounceY, 12)
    grd.addColorStop(0, 'rgba(96,165,250,0.4)')
    grd.addColorStop(1, 'rgba(96,165,250,0)')
    ctx.beginPath()
    ctx.arc(lx, bounceY, 12, 0, Math.PI * 2)
    ctx.fillStyle = grd
    ctx.fill()

    ctx.fillStyle = 'rgba(255,245,235,0.6)'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('Stationary', lx, ly + lh + 18)
    ctx.fillText('τ (proper)', lx, ly + lh + 32)

    // === Right panel: moving light clock ===
    const shift = (t * 80 * b * 30) % (W * 0.6)
    const rx = 350 + shift % 80 - 40
    const rly = 30
    const rlh = 140

    // Moving clock box (wider = length contraction in transverse doesn't apply, but clock visually dilated)
    ctx.strokeStyle = 'rgba(96,165,250,0.5)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(rx - lw / 2, rly, lw, rlh)

    // Mirrors
    ctx.strokeStyle = '#A78BFA'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(rx - lw / 2 + 5, rly + 5); ctx.lineTo(rx + lw / 2 - 5, rly + 5); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(rx - lw / 2 + 5, rly + rlh - 5); ctx.lineTo(rx + lw / 2 - 5, rly + rlh - 5); ctx.stroke()

    // Light bounces slower by factor gamma
    const periodMoving = 2 * rlh * g
    const tModM = (t * 80) % periodMoving
    const frac = tModM / periodMoving
    const bounceYM = frac < 0.5
      ? rly + 5 + (frac / 0.5) * (rlh - 10)
      : rly + rlh - 5 - ((frac - 0.5) / 0.5) * (rlh - 10)
    ctx.beginPath()
    ctx.arc(rx, bounceYM, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#A78BFA'
    ctx.fill()
    const grd2 = ctx.createRadialGradient(rx, bounceYM, 0, rx, bounceYM, 12)
    grd2.addColorStop(0, 'rgba(167,139,250,0.4)')
    grd2.addColorStop(1, 'rgba(167,139,250,0)')
    ctx.beginPath()
    ctx.arc(rx, bounceYM, 12, 0, Math.PI * 2)
    ctx.fillStyle = grd2
    ctx.fill()

    // Diagonal light path hint
    ctx.strokeStyle = 'rgba(167,139,250,0.2)'
    ctx.setLineDash([2, 4])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(rx - lw / 2 + 5, rly + 5)
    ctx.lineTo(rx + lw / 2 - 5, rly + rlh - 5)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(rx + lw / 2 - 5, rly + 5)
    ctx.lineTo(rx - lw / 2 + 5, rly + rlh - 5)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = 'rgba(255,245,235,0.6)'
    ctx.textAlign = 'center'
    ctx.fillText(`v = ${(b * 100).toFixed(0)}% c`, rx, rly + rlh + 18)
    ctx.fillText(`γ = ${g.toFixed(3)}`, rx, rly + rlh + 32)

    // === Bottom: time counters ===
    const proper = t
    const coordinate = t * g
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'

    // Bar backgrounds
    ctx.fillStyle = 'rgba(96,165,250,0.08)'
    ctx.fillRect(20, 200, 260, 40)
    ctx.fillStyle = 'rgba(167,139,250,0.08)'
    ctx.fillRect(310, 200, 270, 40)

    // Proper time bar
    const propFrac = Math.min((proper % 8) / 8, 1)
    ctx.fillStyle = 'rgba(96,165,250,0.4)'
    ctx.fillRect(20, 200, propFrac * 260, 40)
    ctx.fillStyle = '#60A5FA'
    ctx.font = 'bold 11px monospace'
    ctx.fillText(`Proper time τ:  ${proper.toFixed(2)} s`, 28, 225)

    // Coordinate time bar
    const coordFrac = Math.min((coordinate % 8) / 8, 1)
    ctx.fillStyle = 'rgba(167,139,250,0.4)'
    ctx.fillRect(310, 200, coordFrac * 270, 40)
    ctx.fillStyle = '#A78BFA'
    ctx.fillText(`Coordinate t:  ${coordinate.toFixed(2)} s`, 318, 225)

    // Arrow between
    ctx.strokeStyle = 'rgba(251,146,60,0.5)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(283, 220)
    ctx.lineTo(306, 220)
    ctx.stroke()
    ctx.fillStyle = '#FB923C'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('×γ', 295, 215)
    ctx.textAlign = 'left'
  }

  useEffect(() => {
    if (!running) { draw(tRef.current, beta); return }
    const tick = () => {
      tRef.current += 0.016
      setTProper(+tRef.current.toFixed(2))
      setTCoordinate(+(tRef.current * gamma(beta)).toFixed(2))
      draw(tRef.current, beta)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, beta]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { draw(tRef.current, beta) }, [beta]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (triggered && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) setRunning(true)
  }, [triggered])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    tRef.current = 0
    setRunning(false)
    setTProper(0)
    setTCoordinate(0)
    triggerReset()
    draw(0, beta)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Time Dilation</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>v/c:</span>
          <input type="range" min={SPEC.beta.min} max={SPEC.beta.max} step={SPEC.beta.step} value={beta}
            onChange={e => set('beta', +e.target.value)}
            className="w-28 accent-accent-gold" />
          <span className="font-mono">{(beta * 100).toFixed(0)}%</span>
        </label>
        <span className="ml-auto text-xs font-mono text-text-secondary">
          γ = <strong className="text-accent-gold">{gamma(beta).toFixed(4)}</strong>
          &nbsp;·&nbsp; τ={tProper}s &nbsp;→&nbsp; t={tCoordinate}s
        </span>
      </div>
    </div>
  )
}
