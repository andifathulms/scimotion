'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360
const BY = H * 0.5 // boundary y
const CX = W / 2 // hit point x
const RAY = 210 // ray length in px

const GREEN = '#10B981' // field accent
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const MUTED = 'rgba(245,240,232,0.5)'

const DEG = 180 / Math.PI
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

const DEFAULT_ANGLE = 40 // degrees
const DEFAULT_N2 = 1.0
const N1 = 1.5 // top medium fixed (glass/water)

export function RefractionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)

  const [angleDeg, setAngleDeg] = useState(DEFAULT_ANGLE)
  const [n2, setN2] = useState(DEFAULT_N2)
  const [running, setRunning] = useState(false)

  const inputsRef = useRef({ angleDeg: DEFAULT_ANGLE, n2: DEFAULT_N2 })
  useEffect(() => {
    inputsRef.current = { angleDeg, n2 }
  }, [angleDeg, n2])

  const phaseRef = useRef(0)

  // Snell's law result for current inputs.
  const solve = useCallback((deg: number, n2v: number) => {
    const t1 = (deg * Math.PI) / 180
    const s2 = (N1 * Math.sin(t1)) / n2v
    const tir = s2 > 1
    const t2 = tir ? 0 : Math.asin(s2)
    // critical angle only exists when n2 < n1
    const crit = n2v < N1 ? Math.asin(n2v / N1) * DEG : null
    return { t1, t2, tir, crit }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { angleDeg: deg, n2: n2v } = inputsRef.current
    const { t1, t2, tir } = solve(deg, n2v)

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    // ---- media tints (denser = brighter blue) ----
    const tint1 = clamp((N1 - 1) / 1.5, 0, 1)
    const tint2 = clamp((n2v - 1) / 1.5, 0, 1)
    ctx.fillStyle = `rgba(96,165,250,${0.05 + tint1 * 0.12})`
    ctx.fillRect(0, 0, W, BY)
    ctx.fillStyle = `rgba(96,165,250,${0.05 + tint2 * 0.12})`
    ctx.fillRect(0, BY, W, H - BY)

    // ---- boundary + normal ----
    ctx.strokeStyle = 'rgba(255,245,235,0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, BY)
    ctx.lineTo(W, BY)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(255,245,235,0.22)'
    ctx.lineWidth = 1
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.moveTo(CX, 40)
    ctx.lineTo(CX, H - 40)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.font = '11px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = MUTED
    ctx.fillText(`medium 1 · n₁ = ${N1.toFixed(2)}  (slow)`, 14, 22)
    ctx.fillText(
      `medium 2 · n₂ = ${n2v.toFixed(2)}  (${n2v > N1 ? 'slower' : 'faster'})`,
      14,
      H - 14
    )
    ctx.fillStyle = 'rgba(255,245,235,0.3)'
    ctx.textAlign = 'right'
    ctx.fillText('normal', CX - 8, 52)
    ctx.textAlign = 'left'

    const P = { x: CX, y: BY }
    const phase = phaseRef.current

    // Incident ray direction (propagating toward P): down-right.
    const inc = { x: Math.sin(t1), y: Math.cos(t1) }

    // draw a ray with moving wavefront crests perpendicular to it.
    const drawRay = (
      from: { x: number; y: number },
      dir: { x: number; y: number },
      len: number,
      color: string,
      wavelen: number,
      width: number,
      fromBoundary: boolean
    ) => {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(from.x + dir.x * len, from.y + dir.y * len)
      ctx.stroke()
      // arrowhead at the leading end
      const tip = { x: from.x + dir.x * len, y: from.y + dir.y * len }
      const perp = { x: -dir.y, y: dir.x }
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(tip.x, tip.y)
      ctx.lineTo(tip.x - dir.x * 10 + perp.x * 5, tip.y - dir.y * 10 + perp.y * 5)
      ctx.lineTo(tip.x - dir.x * 10 - perp.x * 5, tip.y - dir.y * 10 - perp.y * 5)
      ctx.closePath()
      ctx.fill()
      // wavefront crests (short ticks perpendicular to the ray)
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.55
      const off = (phase * wavelen) % wavelen
      for (let d = off; d < len; d += wavelen) {
        // for the boundary-anchored rays draw crests moving outward from P
        const cx = from.x + dir.x * d
        const cy = from.y + dir.y * d
        ctx.beginPath()
        ctx.moveTo(cx - perp.x * 7, cy - perp.y * 7)
        ctx.lineTo(cx + perp.x * 7, cy + perp.y * 7)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      void fromBoundary
    }

    // Wavelength in px scales as 1/n (slower medium => shorter wavelength).
    const base = 34
    const wl1 = base / N1
    const wl2 = base / n2v

    // Incident: crests move toward the boundary. Anchor at P, draw backward.
    drawRay(P, { x: -inc.x, y: -inc.y }, RAY, BLUE, wl1, 2.4, true)

    // Reflected ray (up-right): always present, bright on TIR.
    const refl = { x: inc.x, y: -inc.y }
    drawRay(P, refl, tir ? RAY : RAY * 0.7, tir ? GOLD : 'rgba(245,159,11,0.4)', wl1, tir ? 1.6 : 1.2, true)

    // Refracted ray (into medium 2) unless TIR.
    if (!tir) {
      const rfr = { x: Math.sin(t2), y: Math.cos(t2) }
      drawRay(P, rfr, RAY, GREEN, wl2, 2.4, true)
    }

    // angle arcs
    const arc = (a: number, color: string, side: 1 | -1, up: boolean) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 1.2
      ctx.beginPath()
      const start = up ? -Math.PI / 2 : Math.PI / 2
      const end = up ? -Math.PI / 2 + side * a : Math.PI / 2 - side * a
      ctx.arc(CX, BY, 30, Math.min(start, end), Math.max(start, end))
      ctx.stroke()
    }
    // incident angle (upper side, opening left of normal)
    arc(t1, BLUE, -1, true)
    if (!tir) arc(t2, GREEN, 1, false)

    // labels near hit point
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = BLUE
    ctx.fillText(`θ₁ ${deg.toFixed(0)}°`, CX - 92, BY - 30)
    if (tir) {
      ctx.fillStyle = GOLD
      ctx.fillText('TOTAL INTERNAL REFLECTION', CX + 40, BY - 18)
    } else {
      ctx.fillStyle = GREEN
      ctx.fillText(`θ₂ ${(t2 * DEG).toFixed(0)}°`, CX + 44, BY + 40)
    }

    // hit point dot
    ctx.fillStyle = '#F5F0E8'
    ctx.beginPath()
    ctx.arc(CX, BY, 3, 0, Math.PI * 2)
    ctx.fill()
  }, [solve])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        phaseRef.current = 0
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = W * dpr
      canvas.height = H * dpr
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    draw()
  }, [draw])

  useEffect(() => {
    if (!running) return
    let last = 0
    const tick = (t: number) => {
      if (last === 0) last = t
      const dt = clamp((t - last) / 1000, 0, 0.05)
      last = t
      phaseRef.current -= dt * 1.4 // crests flow along the rays
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  // redraw when inputs change while paused
  useEffect(() => {
    if (!running) draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angleDeg, n2])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    setAngleDeg(DEFAULT_ANGLE)
    setN2(DEFAULT_N2)
    inputsRef.current = { angleDeg: DEFAULT_ANGLE, n2: DEFAULT_N2 }
    phaseRef.current = 0
    draw()
  }

  const { t2, tir, crit } = solve(angleDeg, n2)

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Refraction &amp; Snell&apos;s law
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          n<sub>1</sub> = {N1.toFixed(2)}
        </span>
        <span>
          n<sub>2</sub> = {n2.toFixed(2)}
        </span>
        <span style={{ color: BLUE }}>θ₁ = {angleDeg.toFixed(0)}°</span>
        <span style={{ color: tir ? GOLD : GREEN }}>
          {tir ? 'θ₂ = — (no exit)' : `θ₂ = ${(t2 * DEG).toFixed(1)}°`}
        </span>
        <span>{crit !== null ? `θc = ${crit.toFixed(1)}°` : 'n₂>n₁: no TIR'}</span>
        <span style={{ color: tir ? GOLD : MUTED }}>
          {tir ? 'TIR ✓' : 'refracting'}
        </span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Play
            </>
          )}
        </button>

        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>θ₁</span>
          <input
            type="range"
            min={0}
            max={88}
            step={1}
            value={angleDeg}
            onChange={e => setAngleDeg(+e.target.value)}
            className="w-28 accent-accent-blue"
          />
          <span className="text-text-secondary font-mono">{angleDeg}°</span>
        </label>

        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>n₂</span>
          <input
            type="range"
            min={1}
            max={2.4}
            step={0.05}
            value={n2}
            onChange={e => setN2(+e.target.value)}
            className="w-28"
            style={{ accentColor: GREEN }}
          />
          <span className="text-text-secondary font-mono">{n2.toFixed(2)}</span>
        </label>
      </div>
    </div>
  )
}
