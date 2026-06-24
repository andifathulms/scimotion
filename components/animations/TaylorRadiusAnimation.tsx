'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 260
const PAD = { left: 44, right: 16, top: 16, bottom: 34 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const N_MAX = 20
// x-domain spans past the radius of convergence so divergence is visible
const X_MIN = -1.6
const X_MAX = 2
const Y_MIN = -3
const Y_MAX = 3

const ACCENT = '#A78BFA' // violet — polynomial
const TRUE = 'rgba(245,240,232,0.45)' // muted — true ln(1+x)

function partialSum(x: number, n: number): number {
  let sum = 0
  for (let k = 1; k <= n; k++) {
    sum += (Math.pow(-1, k + 1) * Math.pow(x, k)) / k
  }
  return sum
}

export function TaylorRadiusAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setN(8); return }
      setN(1)
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [n, setN] = useState(8)
  const [running, setRunning] = useState(false)

  const px = useCallback(
    (v: number) => PAD.left + ((v - X_MIN) / (X_MAX - X_MIN)) * PLOT_W,
    [],
  )
  const py = useCallback(
    (v: number) => PAD.top + PLOT_H - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * PLOT_H,
    [],
  )
  const clampY = useCallback(
    (v: number) => Math.max(Y_MIN, Math.min(Y_MAX, v)),
    [],
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // convergence interval (-1, 1] shading
    const ix0 = px(-1)
    const ix1 = px(1)
    ctx.fillStyle = 'rgba(167,139,250,0.08)'
    ctx.fillRect(ix0, PAD.top, ix1 - ix0, PLOT_H)

    // axes
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()
    // x-axis line (y = 0)
    const zeroY = py(0)
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.beginPath()
    ctx.moveTo(PAD.left, zeroY)
    ctx.lineTo(PAD.left + PLOT_W, zeroY)
    ctx.stroke()

    // singularity at x = -1 (ln(0) → -∞)
    const sx = px(-1)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = '#F472B6'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(sx, PAD.top)
    ctx.lineTo(sx, PAD.top + PLOT_H)
    ctx.stroke()
    // radius boundary at x = 1
    ctx.strokeStyle = 'rgba(167,139,250,0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(ix1, PAD.top)
    ctx.lineTo(ix1, PAD.top + PLOT_H)
    ctx.stroke()
    ctx.setLineDash([])

    // true curve: ln(1+x), only where defined (x > -1)
    ctx.strokeStyle = TRUE
    ctx.lineWidth = 2
    ctx.beginPath()
    let started = false
    for (let sxp = 0; sxp <= PLOT_W; sxp++) {
      const x = X_MIN + (sxp / PLOT_W) * (X_MAX - X_MIN)
      if (x <= -1) { started = false; continue }
      const y = Math.log(1 + x)
      const yy = py(clampY(y))
      const ppx = PAD.left + sxp
      if (!started) { ctx.moveTo(ppx, yy); started = true }
      else ctx.lineTo(ppx, yy)
    }
    ctx.stroke()

    // partial-sum polynomial up to N terms
    ctx.strokeStyle = ACCENT
    ctx.lineWidth = 2.5
    ctx.beginPath()
    let pStarted = false
    for (let sxp = 0; sxp <= PLOT_W; sxp++) {
      const x = X_MIN + (sxp / PLOT_W) * (X_MAX - X_MIN)
      const y = partialSum(x, n)
      const ppx = PAD.left + sxp
      if (y < Y_MIN || y > Y_MAX) {
        // off canvas — lift the pen so the wild swings read as divergence
        ctx.lineTo(ppx, py(clampY(y)))
        pStarted = false
        continue
      }
      const yy = py(y)
      if (!pStarted) { ctx.moveTo(ppx, yy); pStarted = true }
      else ctx.lineTo(ppx, yy)
    }
    ctx.stroke()

    // axis labels / ticks
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '10px monospace'
    ctx.fillText('ln(1+x)', PAD.left + 4, PAD.top + 10)
    for (const tick of [-1, 0, 1, 2]) {
      ctx.fillText(String(tick), px(tick) - 4, PAD.top + PLOT_H + 16)
    }

    // annotations
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = '#F472B6'
    ctx.fillText('x = −1 singularity', sx + 4, PAD.top + PLOT_H + 30 > H ? H - 4 : PAD.top + 24)
    ctx.fillStyle = ACCENT
    ctx.fillText('converges on (−1, 1]', ix0 + 4, PAD.top + PLOT_H - 6)
  }, [n, px, py, clampY])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    let raf = 0
    const step = () => {
      setN(prev => {
        if (prev >= N_MAX) { setRunning(false); return N_MAX }
        return prev + 1
      })
      raf = requestAnimationFrame(() => setTimeout(step, 320))
    }
    raf = requestAnimationFrame(() => setTimeout(step, 320))
    return () => cancelAnimationFrame(raf)
  }, [running])

  const reset = () => {
    triggerReset()
    setRunning(false)
    setN(8)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Radius of convergence</span>
        <button onClick={reset} className="text-xs text-text-muted hover:text-text-secondary transition-colors">Reset</button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Terms (N):</span>
          <input
            type="range" min={1} max={N_MAX} value={n}
            onChange={e => { setN(+e.target.value); setRunning(false) }}
            className="w-40"
            style={{ accentColor: ACCENT }}
          />
          <span className="text-text-secondary font-medium w-6">{n}</span>
        </div>
        <span className="ml-auto text-xs text-text-muted">
          More terms tighten the fit only inside (−1, 1]
        </span>
      </div>
    </div>
  )
}
