'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 280
const PAD = { left: 46, right: 18, top: 22, bottom: 46 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
const MAX_STEPS = 40

const VIOLET = '#A78BFA'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const PINK = '#F472B6'
const GREEN = '#10B981'

// Ground truth: the patient really does have the disease, so evidence should
// eventually drag any non-dogmatic prior up toward 1.

type Step = { positive: boolean; p: number }

function toOdds(p: number) { return p / (1 - p) }
function toProb(o: number) { return o / (1 + o) }

export function BayesUpdateAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastRef = useRef(0)
  const stepsRef = useRef<Step[]>([])
  const [running, setRunning] = useState(false)
  const [count, setCount] = useState(0)
  const [prior, setPrior] = useState(0.05)
  const [lr, setLr] = useState(4)   // likelihood ratio of a positive result

  // A symmetric test whose positive likelihood ratio is exactly `lr`:
  // sens = spec = lr / (1 + lr), so LR+ = sens / (1 - spec) = lr and LR- = 1 / lr.
  const sens = lr / (1 + lr)
  const spec = sens

  const draw = useCallback((steps: Step[], p0: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const x = (i: number) => PAD.left + (i / MAX_STEPS) * PLOT_W
    const y = (p: number) => PAD.top + PLOT_H - p * PLOT_H

    // grid + axis
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.font = '9px monospace'
    ctx.textAlign = 'right'
    for (let g = 0; g <= 4; g++) {
      const p = g / 4
      const gy = y(p)
      ctx.beginPath()
      ctx.moveTo(PAD.left, gy)
      ctx.lineTo(PAD.left + PLOT_W, gy)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.3)'
      ctx.fillText(`${(p * 100).toFixed(0)}%`, PAD.left - 6, gy + 3)
    }
    ctx.textAlign = 'left'
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('belief P(disease)', PAD.left, PAD.top - 8)
    ctx.fillText('observations →', PAD.left + PLOT_W - 84, PAD.top + PLOT_H + 30)

    // truth line
    ctx.strokeStyle = 'rgba(16,185,129,0.35)'
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(PAD.left, y(1))
    ctx.lineTo(PAD.left + PLOT_W, y(1))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = GREEN
    ctx.fillText('truth', PAD.left + PLOT_W - 34, y(1) + 12)

    // prior marker
    ctx.fillStyle = 'rgba(245,240,232,0.25)'
    ctx.fillRect(PAD.left - 4, y(p0) - 1, 8, 2)

    // belief path
    ctx.strokeStyle = VIOLET
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x(0), y(p0))
    steps.forEach((s, i) => ctx.lineTo(x(i + 1), y(s.p)))
    ctx.stroke()

    // evidence ticks along the bottom
    steps.forEach((s, i) => {
      ctx.fillStyle = s.positive ? GOLD : BLUE
      ctx.fillRect(x(i + 1) - 2.5, PAD.top + PLOT_H + 6, 5, 10)
      ctx.beginPath()
      ctx.arc(x(i + 1), y(s.p), 2.5, 0, Math.PI * 2)
      ctx.fill()
    })

    // current-belief bar on the right edge of the plot
    const cur = steps.length ? steps[steps.length - 1].p : p0
    const bx = PAD.left + PLOT_W + 4
    ctx.fillStyle = 'rgba(255,245,235,0.06)'
    ctx.fillRect(bx, PAD.top, 8, PLOT_H)
    ctx.fillStyle = VIOLET
    ctx.fillRect(bx, y(cur), 8, PAD.top + PLOT_H - y(cur))

    // readout
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = cur > 0.5 ? GREEN : PINK
    ctx.textAlign = 'left'
    ctx.fillText(`${(cur * 100).toFixed(1)}%`, PAD.left + 6, PAD.top + 14)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText(
      `prior ${(p0 * 100).toFixed(1)}%  ·  LR+ ${(sens / (1 - spec)).toFixed(1)}×  ·  ${steps.length} observations`,
      PAD.left + 60,
      PAD.top + 13
    )

    // legend
    ctx.fillStyle = GOLD
    ctx.fillRect(PAD.left, PAD.top + PLOT_H + 28, 6, 6)
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('positive', PAD.left + 11, PAD.top + PLOT_H + 34)
    ctx.fillStyle = BLUE
    ctx.fillRect(PAD.left + 62, PAD.top + PLOT_H + 28, 6, 6)
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('negative', PAD.left + 73, PAD.top + PLOT_H + 34)
  }, [sens, spec])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) return
      setRunning(true)
    },
  })

  // Reset the walk whenever the prior or the evidence strength changes.
  useEffect(() => {
    stepsRef.current = []
    setCount(0)
    draw([], prior)
  }, [prior, lr, draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(rafRef.current); return }
    const tick = (t: number) => {
      if (t - lastRef.current > 260) {
        lastRef.current = t
        const steps = stepsRef.current
        if (steps.length >= MAX_STEPS) {
          setRunning(false)
          return
        }
        const cur = steps.length ? steps[steps.length - 1].p : prior
        // draw an observation from the true state, then update
        const positive = Math.random() < sens
        const ratio = positive ? sens / (1 - spec) : (1 - sens) / spec
        const next = Math.min(0.9995, Math.max(0.0005, toProb(toOdds(cur) * ratio)))
        stepsRef.current = [...steps, { positive, p: next }]
        setCount(stepsRef.current.length)
        draw(stepsRef.current, prior)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, prior, sens, spec, draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    triggerReset()
    setRunning(false)
    stepsRef.current = []
    setCount(0)
    draw([], prior)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Sequential belief updating</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Sequential belief updating. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-x-5 gap-y-2">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-violet text-bg-base text-xs font-medium hover:bg-accent-violet/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Observe</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Prior</span>
          <input type="range" min={1} max={95} step={1} value={Math.round(prior * 100)}
            onChange={e => setPrior(+e.target.value / 100)}
            className="w-24 accent-accent-violet" />
          <span className="font-mono text-text-secondary w-10">{(prior * 100).toFixed(0)}%</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Evidence strength</span>
          <input type="range" min={1.1} max={9} step={0.1} value={lr}
            onChange={e => setLr(+e.target.value)}
            className="w-24 accent-accent-gold" />
          <span className="font-mono text-text-secondary w-12">{lr.toFixed(1)}×</span>
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary font-mono">{count}/{MAX_STEPS}</WidgetStatus>
      </div>
    </div>
  )
}
