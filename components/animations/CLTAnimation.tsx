'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 270
const BINS = 30
const CHART_X = 40
const CHART_Y = 20
const CHART_W = W - 80
const CHART_H = H - 80

type Distribution = 'uniform' | 'exponential' | 'bimodal'
const DIST_LABELS: Record<Distribution, string> = {
  uniform: 'Uniform',
  exponential: 'Exponential',
  bimodal: 'Bimodal',
}

function sample(dist: Distribution): number {
  switch (dist) {
    case 'uniform': return Math.random()
    case 'exponential': return -Math.log(1 - Math.random()) / 3
    case 'bimodal': return Math.random() < 0.5
      ? 0.2 + Math.random() * 0.2
      : 0.6 + Math.random() * 0.2
  }
}

function sampleMean(dist: Distribution, n: number): number {
  let s = 0
  for (let i = 0; i < n; i++) s += sample(dist)
  return s / n
}

export function CLTAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [running, setRunning] = useState(false)
  const [dist, setDist] = useState<Distribution>('uniform')
  const [n, setN] = useState(10)
  const [, setMeans] = useState<number[]>([])
  const [total, setTotal] = useState(0)
  const meansRef = useRef<number[]>([])
  const totalRef = useRef(0)

  const draw = useCallback((m: number[]) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // Histogram bins
    const bins = new Array(BINS).fill(0)
    if (m.length > 0) {
      m.forEach(v => {
        const b = Math.max(0, Math.min(BINS - 1, Math.floor(v * BINS)))
        bins[b]++
      })
    }
    const maxBin = Math.max(...bins, 1)

    // Chart area background
    ctx.fillStyle = 'rgba(255,245,235,0.02)'
    ctx.fillRect(CHART_X, CHART_Y, CHART_W, CHART_H)

    // Draw bars
    const barW = CHART_W / BINS
    bins.forEach((count, i) => {
      const h = (count / maxBin) * CHART_H
      const x = CHART_X + i * barW
      const y = CHART_Y + CHART_H - h

      // Bar gradient gold → orange
      const grad = ctx.createLinearGradient(x, y, x, y + h)
      grad.addColorStop(0, 'rgba(245,158,11,0.85)')
      grad.addColorStop(1, 'rgba(251,146,60,0.4)')
      ctx.fillStyle = grad
      ctx.fillRect(x + 1, y, barW - 2, h)
    })

    // Bell curve overlay (normal distribution)
    if (m.length > 30) {
      const mu = m.reduce((a, b) => a + b, 0) / m.length
      const variance = m.reduce((a, b) => a + (b - mu) ** 2, 0) / m.length
      const sigma = Math.sqrt(variance)

      if (sigma > 0.001) {
        ctx.beginPath()
        ctx.strokeStyle = '#10B981'
        ctx.lineWidth = 2
        for (let px = 0; px < CHART_W; px++) {
          const x = px / CHART_W
          const z = (x - mu) / sigma
          const pdf = Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI))
          const normalizedH = (pdf * (1 / BINS) * m.length / maxBin) * CHART_H
          const py = CHART_Y + CHART_H - normalizedH
          if (px === 0) ctx.moveTo(CHART_X + px, py)
          else ctx.lineTo(CHART_X + px, py)
        }
        ctx.stroke()

        // Sigma markers
        ;[-2, -1, 0, 1, 2].forEach(k => {
          const markX = CHART_X + (mu + k * sigma) * CHART_W
          if (markX < CHART_X || markX > CHART_X + CHART_W) return
          ctx.strokeStyle = k === 0 ? 'rgba(16,185,129,0.8)' : 'rgba(16,185,129,0.3)'
          ctx.lineWidth = k === 0 ? 1.5 : 1
          ctx.setLineDash(k === 0 ? [] : [3, 3])
          ctx.beginPath()
          ctx.moveTo(markX, CHART_Y)
          ctx.lineTo(markX, CHART_Y + CHART_H)
          ctx.stroke()
          ctx.setLineDash([])
          if (k !== 0) {
            ctx.fillStyle = 'rgba(16,185,129,0.5)'
            ctx.font = '9px monospace'
            ctx.textAlign = 'center'
            ctx.fillText(`${k > 0 ? '+' : ''}${k}σ`, markX, CHART_Y + CHART_H + 14)
          }
        })

        // Stats
        ctx.fillStyle = 'rgba(255,245,235,0.6)'
        ctx.font = '10px monospace'
        ctx.textAlign = 'left'
        ctx.fillText(`μ = ${mu.toFixed(3)}   σ = ${sigma.toFixed(3)}   n=${n}   samples=${m.length}`, CHART_X, H - 10)
      }
    } else {
      ctx.fillStyle = 'rgba(255,245,235,0.3)'
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`Drawing samples... (${m.length}/30 to show normal fit)`, W / 2, H / 2)
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.lineWidth = 1
    ctx.textAlign = 'left'
    ctx.beginPath()
    ctx.moveTo(CHART_X, CHART_Y)
    ctx.lineTo(CHART_X, CHART_Y + CHART_H)
    ctx.lineTo(CHART_X + CHART_W, CHART_Y + CHART_H)
    ctx.stroke()

    ctx.fillStyle = 'rgba(255,245,235,0.25)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('0', CHART_X, CHART_Y + CHART_H + 14)
    ctx.fillText('0.5', CHART_X + CHART_W / 2, CHART_Y + CHART_H + 14)
    ctx.fillText('1', CHART_X + CHART_W, CHART_Y + CHART_H + 14)
    ctx.textAlign = 'left'
  }, [n])

  useEffect(() => {
    meansRef.current = []
    totalRef.current = 0
    setMeans([])
    setTotal(0)
    setRunning(false)
    cancelAnimationFrame(rafRef.current)
    draw([])
  }, [dist, n, draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(rafRef.current); draw(meansRef.current); return }
    const tick = () => {
      for (let i = 0; i < 5; i++) {
        meansRef.current.push(sampleMean(dist, n))
        totalRef.current++
      }
      if (meansRef.current.length > 2000) meansRef.current = meansRef.current.slice(-2000)
      if (totalRef.current % 10 === 0) setTotal(totalRef.current)
      draw(meansRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, dist, n, draw])

  useEffect(() => {
    if (triggered && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) setRunning(true)
  }, [triggered])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    meansRef.current = []
    totalRef.current = 0
    setRunning(false)
    setMeans([])
    setTotal(0)
    triggerReset()
    draw([])
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Central Limit Theorem</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Sample</>}
        </button>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(Object.keys(DIST_LABELS) as Distribution[]).map(d => (
            <button key={d} onClick={() => setDist(d)}
              className={`px-3 py-1.5 transition-colors ${dist === d ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {DIST_LABELS[d]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>n =</span>
          <input type="range" min={1} max={50} step={1} value={n}
            onChange={e => setN(+e.target.value)}
            className="w-20 accent-accent-gold" />
          <span className="font-mono">{n}</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary font-mono">{total} samples drawn</span>
      </div>
    </div>
  )
}
