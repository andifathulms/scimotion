'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

// Layout ---------------------------------------------------------------------
const W = 620
const H = 300
const PAD = { left: 24, right: 24, top: 54, bottom: 34 }
const PLOT_W = W - PAD.left - PAD.right

// The same set of values spanning nine orders of magnitude. On a linear axis
// everything below a million is crushed against the origin; on a log axis each
// ×10 is an equal step, so all of them are readable and evenly spaced.
const VALUES = [1, 10, 100, 1000, 100000, 1000000000]
const V_MAX = VALUES[VALUES.length - 1] // 1e9
const LOG_MAX = Math.log10(V_MAX) // 9

const VIOLET = '#A78BFA' // field accent
const GOLD = '#F59E0B'

function fmt(v: number): string {
  if (v >= 1e9) return `${v / 1e9} billion`
  if (v >= 1e6) return `${v / 1e6} million`
  if (v >= 1e3) return `${(v / 1e3).toLocaleString('en-US')},000`
  return `${v}`
}

export function LogScaleAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const progRef = useRef(1) // eased 0..1 morph between linear (0) and log (1)

  const [logMode, setLogMode] = useState(true)
  const [running, setRunning] = useState(false)
  const [sel, setSel] = useState(VALUES.length - 1) // highlighted value index

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setLogMode(true)
        progRef.current = 1
        setSel(VALUES.length - 1)
        return
      }
      setRunning(true)
    },
  })

  // x position of a value under the current linear<->log morph.
  const xOf = useCallback((v: number, prog: number) => {
    const lin = v / V_MAX
    const log = Math.log10(v) / LOG_MAX
    const frac = lin + (log - lin) * prog
    return PAD.left + frac * PLOT_W
  }, [])

  const draw = useCallback(() => {
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
    ctx.textAlign = 'left'

    const prog = progRef.current
    const axisY = H - PAD.bottom - 60
    const isLog = prog > 0.5

    // Title of the current axis
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.font = 'bold 11px monospace'
    ctx.fillText(isLog ? 'LOGARITHMIC axis — each step ×10' : 'LINEAR axis — each step +constant', PAD.left, PAD.top - 26)

    // Log decade gridlines (fade in with the morph)
    if (prog > 0.02) {
      ctx.font = '9px monospace'
      for (let d = 0; d <= 9; d++) {
        const v = Math.pow(10, d)
        const gx = xOf(v, prog)
        ctx.strokeStyle = `rgba(167,139,250,${0.12 * prog})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(gx, PAD.top)
        ctx.lineTo(gx, axisY)
        ctx.stroke()
        ctx.fillStyle = `rgba(167,139,250,${0.4 * prog})`
        ctx.textAlign = 'center'
        ctx.fillText(`10^${d}`, gx, axisY + 26)
      }
    }

    // The axis line
    ctx.strokeStyle = 'rgba(255,245,235,0.25)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(PAD.left, axisY)
    ctx.lineTo(PAD.left + PLOT_W, axisY)
    ctx.stroke()

    // Equal-spacing / equal-ratio annotation on the log axis, between 10^1 and 10^2
    if (prog > 0.6) {
      const a = xOf(10, prog)
      const b = xOf(100, prog)
      ctx.strokeStyle = `rgba(96,165,250,${(prog - 0.6) * 2.5})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(a, PAD.top + 8)
      ctx.lineTo(b, PAD.top + 8)
      ctx.stroke()
      ctx.fillStyle = `rgba(96,165,250,${(prog - 0.6) * 2.5})`
      ctx.textAlign = 'center'
      ctx.font = '9px monospace'
      ctx.fillText('equal spacing = equal ratio (×10)', (a + b) / 2, PAD.top + 2)
    }

    // Plot each value as a tick + dot on the axis.
    VALUES.forEach((v, i) => {
      const px = Math.min(xOf(v, prog), PAD.left + PLOT_W + 40)
      const off = px > PAD.left + PLOT_W + 2 // ran off the right edge (linear)
      const selected = i === sel
      const col = selected ? VIOLET : off ? 'rgba(244,114,182,0.9)' : GOLD

      // tick
      ctx.strokeStyle = col
      ctx.lineWidth = selected ? 2.5 : 1.5
      ctx.beginPath()
      ctx.moveTo(px, axisY - 9)
      ctx.lineTo(px, axisY + 9)
      ctx.stroke()

      // dot
      ctx.beginPath()
      ctx.arc(px, axisY, selected ? 5 : 3.5, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()

      // label above, staggered to reduce overlap in linear pile-up
      ctx.textAlign = 'center'
      ctx.font = selected ? 'bold 10px monospace' : '9px monospace'
      ctx.fillStyle = selected ? VIOLET : 'rgba(245,240,232,0.6)'
      const labelY = axisY - 16 - (i % 2) * 13
      if (off) {
        ctx.fillStyle = 'rgba(244,114,182,0.9)'
        ctx.textAlign = 'right'
        ctx.fillText(`${fmt(v)} →`, PAD.left + PLOT_W - 2, axisY - 16)
      } else {
        ctx.fillText(fmt(v), px, labelY)
      }
    })

    // Note about the linear pile-up
    if (prog < 0.5) {
      ctx.fillStyle = 'rgba(244,114,182,0.75)'
      ctx.textAlign = 'left'
      ctx.font = '9px monospace'
      ctx.fillText('small values pile up at the origin; a billion runs off →', PAD.left, axisY + 40)
    }
  }, [xOf, sel])

  useEffect(() => {
    draw()
  }, [draw])

  // Animation loop: ease the morph toward the current mode, then scan the
  // highlighted value through the set.
  useEffect(() => {
    if (!running || !visible) return
    let frame = 0
    const tick = () => {
      const target = logMode ? 1 : 0
      progRef.current += (target - progRef.current) * 0.09
      if (Math.abs(target - progRef.current) < 0.002) progRef.current = target

      frame += 1
      if (frame % 40 === 0) {
        setSel(s => (s + 1) % VALUES.length)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, logMode, draw, visible])

  const toggleMode = () => {
    setLogMode(m => !m)
    if (!running) {
      // animate the single morph even while paused
      setRunning(true)
      window.setTimeout(() => setRunning(false), 900)
    }
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    triggerReset()
    setRunning(false)
    setLogMode(true)
    progRef.current = 1
    setSel(VALUES.length - 1)
    draw()
  }

  const selVal = VALUES[sel]

  return (
    <div ref={ref} className="animation-block">
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          value <span style={{ color: VIOLET }}>{fmt(selVal)}</span>
        </span>
        <span>
          log₁₀(value) <span className="text-accent-blue">{Math.log10(selVal).toFixed(0)}</span>
        </span>
        <span className="text-text-muted">×10 on the value → +1 on the log axis</span>
      </div>

      <div className="mt-3">
        <canvas
          role="img"
          aria-label="Animated diagram: Log scale. Values are reported below the diagram."
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)', aspectRatio: `${W} / ${H}` }}
        />
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={toggleMode}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: logMode ? VIOLET : 'rgba(255,245,235,0.08)',
            color: logMode ? '#1A1712' : 'rgba(245,240,232,0.7)',
          }}
        >
          Axis: {logMode ? 'LOG' : 'LINEAR'}
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <span className="text-xs text-text-muted">
          Toggle the axis: on LOG, equal spacing means equal ratio, so atoms and galaxies fit side by side.
        </span>
      </div>
    </div>
  )
}
