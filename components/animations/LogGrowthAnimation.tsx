'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

// Layout ---------------------------------------------------------------------
const W = 620
const H = 320
const PAD = { left: 44, right: 20, top: 24, bottom: 40 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

// n runs 1..16 on the x-axis. The y-axis is deliberately scaled to Y_MAX so the
// exponential curve shoots off the top almost immediately (conveying "explodes"),
// the linear curve rises steadily to the top-right, and the logarithm crawls.
const N_MAX = 16
const Y_MAX = 16

const VIOLET = '#A78BFA' // field accent — logarithmic
const PINK = '#F472B6' // linear
const ORANGE = '#FB923C' // exponential

function fmtBig(v: number): string {
  if (v >= 1e6) return v.toExponential(1)
  return v.toLocaleString('en-US')
}

export function LogGrowthAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const [n, setN] = useState(N_MAX)
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setN(N_MAX)
        return
      }
      setN(1)
      setRunning(true)
    },
  })

  const xOf = useCallback((nn: number) => PAD.left + ((nn - 0) / N_MAX) * PLOT_W, [])
  const yOf = useCallback((v: number) => PAD.top + PLOT_H - (Math.min(v, Y_MAX) / Y_MAX) * PLOT_H, [])

  const draw = useCallback(
    (curN: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr
        canvas.height = H * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      ctx.fillStyle = '#0F0D0A'
      ctx.fillRect(0, 0, W, H)
      ctx.font = '10px monospace'

      // Gridlines + y labels
      for (let g = 0; g <= Y_MAX; g += 4) {
        const gy = yOf(g)
        ctx.strokeStyle = 'rgba(245,240,232,0.06)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(PAD.left, gy)
        ctx.lineTo(PAD.left + PLOT_W, gy)
        ctx.stroke()
        ctx.fillStyle = 'rgba(245,240,232,0.3)'
        ctx.textAlign = 'right'
        ctx.fillText(`${g}`, PAD.left - 8, gy + 3)
      }

      // Axes
      ctx.strokeStyle = 'rgba(255,245,235,0.15)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PAD.left, PAD.top)
      ctx.lineTo(PAD.left, PAD.top + PLOT_H)
      ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.textAlign = 'left'
      ctx.fillText('value', PAD.left - 36, PAD.top - 8)
      ctx.textAlign = 'right'
      ctx.fillText('n →', PAD.left + PLOT_W, PAD.top + PLOT_H + 24)

      // x ticks at doublings
      ctx.textAlign = 'center'
      for (const t of [1, 2, 4, 8, 16]) {
        ctx.fillStyle = 'rgba(245,240,232,0.3)'
        ctx.fillText(`${t}`, xOf(t), PAD.top + PLOT_H + 16)
      }

      // Curve helper
      const curve = (f: (nn: number) => number, color: string, width: number) => {
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.lineJoin = 'round'
        ctx.beginPath()
        let started = false
        for (let nn = 1; nn <= N_MAX + 0.001; nn += 0.05) {
          const v = f(nn)
          const px = xOf(nn)
          const py = yOf(v)
          if (!started) {
            ctx.moveTo(px, py)
            started = true
          } else {
            ctx.lineTo(px, py)
          }
          if (v > Y_MAX) break // clip once it leaves the top — it "shoots off"
        }
        ctx.stroke()
      }

      curve(nn => Math.log2(nn), VIOLET, 3) // logarithmic — crawls
      curve(nn => nn, PINK, 2) // linear
      curve(nn => Math.pow(2, nn), ORANGE, 2.5) // exponential — explodes

      // Equal-step markers on the log curve at n = 1,2,4,8,16 → 0,1,2,3,4.
      // Doubling n only adds ONE to log2(n).
      for (const t of [1, 2, 4, 8, 16]) {
        const py = yOf(Math.log2(t))
        ctx.beginPath()
        ctx.arc(xOf(t), py, 3, 0, Math.PI * 2)
        ctx.fillStyle = VIOLET
        ctx.fill()
      }

      // "off the top" marker for the exponential
      ctx.fillStyle = ORANGE
      ctx.textAlign = 'left'
      ctx.font = 'bold 10px monospace'
      ctx.fillText('2ⁿ ↑ off the top', xOf(4.4), PAD.top + 12)
      ctx.fillStyle = PINK
      ctx.fillText('n (linear)', xOf(13.2), yOf(13) - 6)
      ctx.fillStyle = VIOLET
      ctx.fillText('log₂ n (crawls)', xOf(9), yOf(Math.log2(9)) + 16)

      // Advancing marker: vertical line at current n + dots on each curve.
      const mx = xOf(curN)
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = 'rgba(255,245,235,0.25)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(mx, PAD.top)
      ctx.lineTo(mx, PAD.top + PLOT_H)
      ctx.stroke()
      ctx.setLineDash([])

      const dot = (v: number, color: string) => {
        ctx.beginPath()
        ctx.arc(mx, yOf(v), 4.5, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
      }
      dot(Math.log2(curN), VIOLET)
      dot(curN, PINK)
      if (Math.pow(2, curN) <= Y_MAX) dot(Math.pow(2, curN), ORANGE)
      else {
        // arrow at the top edge indicating it left the plot
        ctx.beginPath()
        ctx.moveTo(mx, PAD.top + 2)
        ctx.lineTo(mx - 4, PAD.top + 9)
        ctx.lineTo(mx + 4, PAD.top + 9)
        ctx.closePath()
        ctx.fillStyle = ORANGE
        ctx.fill()
      }
    },
    [xOf, yOf]
  )

  useEffect(() => {
    draw(n)
  }, [draw, n])

  useEffect(() => {
    if (!running) return
    let last = 0
    const tick = (t: number) => {
      if (!last) last = t
      if (t - last > 260) {
        last = t
        setN(prev => {
          if (prev >= N_MAX) {
            setRunning(false)
            return N_MAX
          }
          return prev + 1
        })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    triggerReset()
    setRunning(false)
    setN(N_MAX)
    draw(N_MAX)
  }

  return (
    <div ref={ref} className="animation-block">
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          n <span className="text-text-secondary font-bold">{n}</span>
        </span>
        <span>
          log₂ n <span style={{ color: VIOLET }}>{Math.log2(n).toFixed(2)}</span>
        </span>
        <span>
          2ⁿ <span style={{ color: ORANGE }}>{fmtBig(Math.pow(2, n))}</span>
        </span>
        <span className="text-text-muted">binary search: {Math.ceil(Math.log2(n)) || 0} steps to search {n} items</span>
      </div>

      <div className="mt-3">
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: '#0F0D0A', aspectRatio: `${W} / ${H}` }}
        />
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (n >= N_MAX) setN(1)
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>n:</span>
          <input
            type="range"
            min={1}
            max={N_MAX}
            value={n}
            onChange={e => {
              setN(+e.target.value)
              setRunning(false)
            }}
            className="w-40"
            style={{ accentColor: VIOLET }}
          />
        </div>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <span className="text-xs text-text-muted">
          Double n and log₂ n rises by just 1 — that slow crawl is exactly why binary search is fast.
        </span>
      </div>
    </div>
  )
}
