'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 260
const PAD = { left: 44, right: 16, top: 16, bottom: 34 }
const N_MAX = 64
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(0)} billion`
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} million`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)},000`
  return `${n}`
}

export function BinarySearchGrowthAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setN(N_MAX); return }
      setN(1)
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [n, setN] = useState(N_MAX)
  const [running, setRunning] = useState(false)

  const x = useCallback((v: number) => PAD.left + (v / N_MAX) * PLOT_W, [])
  const y = useCallback((v: number) => PAD.top + PLOT_H - (v / N_MAX) * PLOT_H, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // axes
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '10px monospace'
    ctx.fillText('comparisons', PAD.left - 2, PAD.top - 4)
    ctx.fillText('n (list size)', PAD.left + PLOT_W - 64, PAD.top + PLOT_H + 22)

    // linear curve: y = n
    ctx.strokeStyle = '#F472B6'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x(0), y(0))
    ctx.lineTo(x(N_MAX), y(N_MAX))
    ctx.stroke()

    // binary curve: y = log2(n)
    ctx.strokeStyle = '#60A5FA'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    for (let v = 1; v <= N_MAX; v++) {
      const yy = y(Math.log2(v))
      if (v === 1) ctx.moveTo(x(v), yy)
      else ctx.lineTo(x(v), yy)
    }
    ctx.stroke()

    // markers at current n
    const linY = y(n)
    const binY = y(Math.log2(n))
    const nx = x(n)
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(nx, PAD.top + PLOT_H)
    ctx.lineTo(nx, PAD.top)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = '#F472B6'
    ctx.beginPath(); ctx.arc(nx, linY, 4, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#60A5FA'
    ctx.beginPath(); ctx.arc(nx, binY, 4, 0, Math.PI * 2); ctx.fill()

    // labels
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = '#F472B6'
    ctx.fillText(`linear: ${n}`, Math.min(nx + 8, W - 90), Math.max(linY, PAD.top + 12))
    ctx.fillStyle = '#60A5FA'
    ctx.fillText(`binary: ${Math.ceil(Math.log2(Math.max(2, n)))}`, Math.min(nx + 8, W - 90), binY + 16)
  }, [n, x, y])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    let raf = 0
    const step = () => {
      setN(prev => {
        if (prev >= N_MAX) { setRunning(false); return N_MAX }
        return prev + 1
      })
      raf = requestAnimationFrame(() => setTimeout(step, 45))
    }
    raf = requestAnimationFrame(() => setTimeout(step, 45))
    return () => cancelAnimationFrame(raf)
  }, [running])

  const reset = () => {
    triggerReset()
    setRunning(false)
    setN(N_MAX)
  }

  // extrapolated readout for huge n
  const big = [1e6, 1e9]

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Linear vs Binary growth</span>
        <button onClick={reset} className="text-xs text-text-muted hover:text-text-secondary transition-colors">Reset</button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>n:</span>
          <input
            type="range" min={1} max={N_MAX} value={n}
            onChange={e => { setN(+e.target.value); setRunning(false) }}
            className="w-40 accent-accent-blue"
          />
          <span className="text-text-secondary font-medium">{n}</span>
        </label>
        <div className="ml-auto flex gap-4 text-xs">
          {big.map(b => (
            <span key={b} className="text-text-secondary">
              {fmt(b)} → <strong className="text-accent-blue">{Math.ceil(Math.log2(b))}</strong>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
