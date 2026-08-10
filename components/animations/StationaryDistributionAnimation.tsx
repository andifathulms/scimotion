'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 290

const NAMES = ['Sunny', 'Cloudy', 'Rainy']
const SHORT = ['S', 'C', 'R']
const COLORS = ['#F59E0B', '#60A5FA', '#A78BFA']

// Fixed ergodic weather chain (rows sum to 1).
const P = [
  [0.7, 0.2, 0.1],
  [0.35, 0.3, 0.35],
  [0.15, 0.35, 0.5],
]

function stationary(): number[] {
  let v = [1 / 3, 1 / 3, 1 / 3]
  for (let it = 0; it < 500; it++) {
    const n = [0, 0, 0]
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) n[j] += v[i] * P[i][j]
    v = n
  }
  const s = v[0] + v[1] + v[2]
  return v.map(x => x / s)
}

const PI = stationary()

type Preset = 'sunny' | 'rainy' | 'uniform' | 'skewed'
const PRESETS: Record<Preset, { label: string; v: number[] }> = {
  sunny: { label: 'All Sunny', v: [1, 0, 0] },
  rainy: { label: 'All Rainy', v: [0, 0, 1] },
  uniform: { label: 'Uniform', v: [1 / 3, 1 / 3, 1 / 3] },
  skewed: { label: 'Mostly Cloudy', v: [0.05, 0.9, 0.05] },
}

const MAX_STEPS = 24
const FRAMES_PER_STEP = 26

// Bar panel
const BX = 56
const BY = 34
const BW = 258
const BH = 176

// Convergence-trace panel (log scale)
const CX = 368
const CY = 34
const CW = 200
const CH = 176
const LOG_FLOOR = -5

function step(v: number[]): number[] {
  const n = [0, 0, 0]
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) n[j] += v[i] * P[i][j]
  return n
}

function tv(v: number[]): number {
  return 0.5 * (Math.abs(v[0] - PI[0]) + Math.abs(v[1] - PI[1]) + Math.abs(v[2] - PI[2]))
}

function logY(d: number): number {
  const l = Math.log10(Math.max(d, 1e-6))
  const frac = Math.min(1, Math.max(0, l / LOG_FLOOR))
  return CY + frac * CH
}

export function StationaryDistributionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [running, setRunning] = useState(false)
  const [preset, setPreset] = useState<Preset>('sunny')
  const [stepCount, setStepCount] = useState(0)

  const prevRef = useRef<number[]>(PRESETS.sunny.v)
  const curRef = useRef<number[]>(PRESETS.sunny.v)
  const blendRef = useRef(1)
  const historyRef = useRef<number[]>([tv(PRESETS.sunny.v)])
  const kRef = useRef(0)
  const frameRef = useRef(0)

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
    ctx.clearRect(0, 0, W, H)

    const b = blendRef.current
    const shown = [0, 1, 2].map(i => prevRef.current[i] + (curRef.current[i] - prevRef.current[i]) * b)

    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,245,235,0.35)'
    ctx.fillText(`Distribution μ${kRef.current} = μ0 · P^${kRef.current}`, BX - 40, 20)
    ctx.fillText('Distance to π (log scale)', CX, 20)

    // Divider
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(340, 14)
    ctx.lineTo(340, H - 16)
    ctx.stroke()

    // --- Bars ---
    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.beginPath()
    ctx.moveTo(BX, BY)
    ctx.lineTo(BX, BY + BH)
    ctx.lineTo(BX + BW, BY + BH)
    ctx.stroke()

    ctx.fillStyle = 'rgba(255,245,235,0.25)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'right'
    ;[0, 0.5, 1].forEach(v => {
      const y = BY + BH - v * BH
      ctx.fillText(v.toFixed(1), BX - 6, y + 3)
      ctx.strokeStyle = 'rgba(255,245,235,0.06)'
      ctx.beginPath()
      ctx.moveTo(BX, y)
      ctx.lineTo(BX + BW, y)
      ctx.stroke()
    })

    const barW = BW / 3
    for (let i = 0; i < 3; i++) {
      const x = BX + i * barW
      const h = shown[i] * BH
      const grad = ctx.createLinearGradient(x, BY + BH - h, x, BY + BH)
      grad.addColorStop(0, `${COLORS[i]}D9`)
      grad.addColorStop(1, `${COLORS[i]}40`)
      ctx.fillStyle = grad
      ctx.fillRect(x + 16, BY + BH - h, barW - 32, h)

      // Stationary target outline
      const py = BY + BH - PI[i] * BH
      ctx.strokeStyle = '#10B981'
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 3])
      ctx.beginPath()
      ctx.moveTo(x + 10, py)
      ctx.lineTo(x + barW - 10, py)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.textAlign = 'center'
      ctx.fillStyle = COLORS[i]
      ctx.font = '9px monospace'
      ctx.fillText(shown[i].toFixed(3), x + barW / 2, BY + BH - h - 6)
      ctx.fillStyle = 'rgba(255,245,235,0.45)'
      ctx.fillText(SHORT[i], x + barW / 2, BY + BH + 14)
      ctx.fillStyle = 'rgba(255,245,235,0.25)'
      ctx.fillText(NAMES[i], x + barW / 2, BY + BH + 26)
    }

    ctx.textAlign = 'left'
    ctx.fillStyle = '#10B981'
    ctx.font = '9px monospace'
    ctx.fillText(`--- π = (${PI.map(v => v.toFixed(3)).join(', ')})`, BX - 40, H - 12)

    // --- Convergence trace ---
    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(CX, CY)
    ctx.lineTo(CX, CY + CH)
    ctx.lineTo(CX + CW, CY + CH)
    ctx.stroke()

    ctx.font = '8px monospace'
    for (let e = 0; e >= LOG_FLOOR; e--) {
      const y = logY(Math.pow(10, e))
      ctx.strokeStyle = 'rgba(255,245,235,0.06)'
      ctx.beginPath()
      ctx.moveTo(CX, y)
      ctx.lineTo(CX + CW, y)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,245,235,0.25)'
      ctx.textAlign = 'right'
      ctx.fillText(e === 0 ? '1' : `1e${e}`, CX - 4, y + 3)
    }

    const hist = historyRef.current
    if (hist.length > 1) {
      ctx.strokeStyle = '#A78BFA'
      ctx.lineWidth = 2
      ctx.beginPath()
      hist.forEach((d, i) => {
        const x = CX + (i / MAX_STEPS) * CW
        const y = logY(d)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      hist.forEach((d, i) => {
        ctx.beginPath()
        ctx.arc(CX + (i / MAX_STEPS) * CW, logY(d), 2.2, 0, Math.PI * 2)
        ctx.fillStyle = '#A78BFA'
        ctx.fill()
      })
    }

    ctx.fillStyle = 'rgba(255,245,235,0.25)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('steps', CX + CW / 2, CY + CH + 16)

    const d = hist[hist.length - 1]
    const ratio = hist.length > 3 ? hist[hist.length - 1] / Math.max(hist[hist.length - 2], 1e-12) : NaN
    ctx.textAlign = 'left'
    ctx.fillStyle = '#A78BFA'
    ctx.fillText(
      `TV = ${d < 1e-4 ? d.toExponential(1) : d.toFixed(5)}${Number.isFinite(ratio) ? `   ratio ≈ ${ratio.toFixed(3)}` : ''}`,
      CX, H - 12
    )
  }, [])

  const restart = useCallback((p: Preset) => {
    const v = PRESETS[p].v.slice()
    prevRef.current = v
    curRef.current = v
    blendRef.current = 1
    historyRef.current = [tv(v)]
    kRef.current = 0
    frameRef.current = 0
    setStepCount(0)
  }, [])

  useEffect(() => {
    restart(preset)
    draw()
  }, [preset, restart, draw])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const tick = () => {
      if (kRef.current < MAX_STEPS) {
        frameRef.current += 1
        blendRef.current = Math.min(1, frameRef.current / FRAMES_PER_STEP)
        if (frameRef.current >= FRAMES_PER_STEP) {
          frameRef.current = 0
          blendRef.current = 0
          prevRef.current = curRef.current
          curRef.current = step(curRef.current)
          kRef.current += 1
          historyRef.current.push(tv(curRef.current))
          setStepCount(kRef.current)
        }
      } else {
        blendRef.current = 1
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    restart(preset)
    triggerReset()
    draw()
  }

  const stepOnce = () => {
    if (kRef.current >= MAX_STEPS) return
    setRunning(false)
    cancelAnimationFrame(rafRef.current)
    prevRef.current = curRef.current
    curRef.current = step(curRef.current)
    blendRef.current = 1
    frameRef.current = 0
    kRef.current += 1
    historyRef.current.push(tv(curRef.current))
    setStepCount(kRef.current)
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Convergence to π</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: Convergence to π. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Iterate</>}
        </button>
        <button onClick={stepOnce}
          className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:bg-bg-hover transition-colors">
          Step ×P
        </button>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(Object.keys(PRESETS) as Preset[]).map(p => (
            <button key={p} onClick={() => setPreset(p)}
              className={`px-3 py-1.5 transition-colors ${preset === p ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {PRESETS[p].label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-text-secondary font-mono">step {stepCount}/{MAX_STEPS}</span>
      </div>
    </div>
  )
}
