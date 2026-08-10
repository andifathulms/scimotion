'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300
const LEFT = 62
const RIGHT = 20
const TOP = 24
const BOTTOM = 250
const PLOT_W = W - LEFT - RIGHT
const PLOT_H = BOTTOM - TOP

const D_MAX = 600 // Mpc
const V_MAX = 45000 // km/s

const H0_MIN = 67
const H0_MAX = 73
const DEFAULT_H0 = 70

// 1/H0 as an age. Converting km/s/Mpc to an inverse time: 1 Mpc = 3.086e19 km,
// 1 Gyr = 3.156e16 s, so t_H (Gyr) = 3.086e19 / (H0 * 3.156e16) = 977.8 / H0.
const hubbleTimeGyr = (h0: number) => 977.8 / h0

// A faithful reproduction of the Hubble relation: fixed galaxy distances with
// fixed peculiar-velocity scatter (km/s). This is NOT a live feed — the numbers
// are baked in so the picture is the same every time you open it.
const GALAXIES: { d: number; scatter: number }[] = [
  { d: 45, scatter: 620 },
  { d: 88, scatter: -940 },
  { d: 132, scatter: 1180 },
  { d: 170, scatter: -560 },
  { d: 214, scatter: 300 },
  { d: 256, scatter: -1320 },
  { d: 300, scatter: 880 },
  { d: 348, scatter: -420 },
  { d: 392, scatter: 1440 },
  { d: 436, scatter: -780 },
  { d: 478, scatter: 540 },
  { d: 520, scatter: -1100 },
  { d: 560, scatter: 960 },
]

export function HubbleDiagramAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setH0(DEFAULT_H0); return }
      setSweeping(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [h0, setH0] = useState(DEFAULT_H0)
  const [sweeping, setSweeping] = useState(false)

  const xOfD = useCallback((d: number) => LEFT + (d / D_MAX) * PLOT_W, [])
  const yOfV = useCallback((v: number) => BOTTOM - (Math.min(V_MAX, v) / V_MAX) * PLOT_H, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(LEFT, TOP); ctx.lineTo(LEFT, BOTTOM); ctx.lineTo(LEFT + PLOT_W, BOTTOM)
    ctx.stroke()

    // Gridlines + ticks
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    for (let d = 0; d <= D_MAX; d += 100) {
      const x = xOfD(d)
      ctx.strokeStyle = 'rgba(255,245,235,0.05)'
      ctx.beginPath(); ctx.moveTo(x, TOP); ctx.lineTo(x, BOTTOM); ctx.stroke()
      ctx.fillText(String(d), x - 8, BOTTOM + 14)
    }
    for (let v = 0; v <= V_MAX; v += 10000) {
      const y = yOfV(v)
      ctx.strokeStyle = 'rgba(255,245,235,0.05)'
      ctx.beginPath(); ctx.moveTo(LEFT, y); ctx.lineTo(LEFT + PLOT_W, y); ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.fillText(String(v / 1000) + 'k', LEFT - 34, y + 3)
    }
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('distance  (Mpc) →', LEFT + PLOT_W - 108, BOTTOM + 28)
    ctx.save()
    ctx.translate(16, TOP + 96)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('recession velocity (km/s) →', 0, 0)
    ctx.restore()

    // The Hubble line v = H0 d — its slope IS H0.
    ctx.strokeStyle = '#818CF8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(xOfD(0), yOfV(0))
    ctx.lineTo(xOfD(D_MAX), yOfV(h0 * D_MAX))
    ctx.stroke()

    // Galaxies scattered about it.
    for (const g of GALAXIES) {
      const v = h0 * g.d + g.scatter
      const x = xOfD(g.d)
      const y = yOfV(v)
      // residual whisker from the line to the point
      ctx.strokeStyle = 'rgba(245,240,232,0.18)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x, yOfV(h0 * g.d)); ctx.lineTo(x, y); ctx.stroke()
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#F59E0B'
      ctx.fill()
    }

    // Slope readout at the top of the line
    ctx.fillStyle = '#818CF8'
    ctx.fillText(`slope = H₀ = ${h0} km/s/Mpc`, xOfD(D_MAX) - 176, yOfV(h0 * D_MAX) + 16)
  }, [h0, xOfD, yOfV])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!sweeping) return
    let dir = 1
    const step = () => {
      setH0(prev => {
        let next = Math.round((prev + dir * 0.1) * 10) / 10
        if (next >= H0_MAX) { next = H0_MAX; dir = -1 }
        if (next <= H0_MIN) { next = H0_MIN; setSweeping(false) }
        return next
      })
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [sweeping])

  const resetAll = () => {
    triggerReset()
    setSweeping(false)
    setH0(DEFAULT_H0)
  }

  const age = hubbleTimeGyr(h0)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Slope sets the age</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>H₀:</span>
          <input
            type="range" min={H0_MIN} max={H0_MAX} step={0.1} value={h0}
            onChange={e => { setH0(Math.round(+e.target.value * 10) / 10); setSweeping(false) }}
            className="w-40 accent-accent-indigo"
          />
          <span className="text-text-secondary font-medium">{h0.toFixed(1)} km/s/Mpc</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          Hubble time 1/H₀ ≈ <strong className="text-accent-gold">{age.toFixed(1)} Gyr</strong>
        </span>
      </div>
    </div>
  )
}
