'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'

const W = 600
const H = 340
const BG = '#0F0D0A'
const GREEN = '#10B981'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'

// Physical model of a rotating platform carrying two point masses on arms.
// Angular momentum L = I·ω is held FIXED (no external torque). The slider sets
// how far the masses sit from the axis, which changes the moment of inertia
// I = I_body + 2·m·r². Because L is conserved, ω = L/I rises as the arms pull in.
const I_BODY = 1.2 // kg·m² of the platform + body, independent of arm position
const M_ARM = 2.0 // kg, each of the two masses on the arms
const R_MIN = 0.2 // m, arms fully tucked
const R_MAX = 0.9 // m, arms fully extended
const L0 = 12.0 // kg·m²/s, the conserved angular momentum

const inertia = (r: number) => I_BODY + 2 * M_ARM * r * r
const I_MAX = inertia(R_MAX)
const OMEGA_MAX = L0 / inertia(R_MIN)
const KE_MAX = 0.5 * L0 * OMEGA_MAX

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
// Map arm extension fraction (0 tucked … 1 extended) to radius in metres.
const radiusFor = (ext: number) => R_MIN + ext * (R_MAX - R_MIN)

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  ext: { default: 1, min: 0, max: 1, step: 0.01 },
}

export function SpinningSkaterAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const extRef = useRef(1) // arm extension fraction
  const angleRef = useRef(0) // current spin phase
  const playingRef = useRef(false)

  const { params, set } = useWidgetParams('spinning-skater', SPEC)
  const { ext } = params
  const [playing, setPlaying] = useState(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const r = radiusFor(extRef.current)
    const I = inertia(r)
    const omega = L0 / I
    const ke = 0.5 * I * omega * omega
    const angle = angleRef.current

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    // ---- LEFT: top-down view of the spinning platform ----
    const cx = 190
    const cy = 178
    const rPix = 34 + extRef.current * 118 // arm length in pixels

    // ghost of the fully-extended reach, for scale
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.arc(cx, cy, 34 + 118, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])

    // circular platform
    ctx.fillStyle = 'rgba(96,165,250,0.06)'
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(96,165,250,0.5)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.stroke()

    // two arms with a mass at each end, 180° apart
    for (const base of [angle, angle + Math.PI]) {
      const mx = cx + rPix * Math.cos(base)
      const my = cy + rPix * Math.sin(base)
      ctx.strokeStyle = 'rgba(245,240,232,0.45)'
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(mx, my); ctx.stroke()

      const grad = ctx.createRadialGradient(mx - 3, my - 3, 1, mx, my, 12)
      grad.addColorStop(0, '#34D399')
      grad.addColorStop(1, GREEN)
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(mx, my, 12, 0, Math.PI * 2); ctx.fill()
    }

    // hub
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill()

    // curved arrow whose sweep hints at the spin rate ω
    const arcR = rPix + 20
    ctx.strokeStyle = 'rgba(245,158,11,0.7)'
    ctx.lineWidth = 2
    ctx.beginPath()
    const sweep = clamp(omega / OMEGA_MAX, 0.2, 1) * Math.PI * 0.7
    ctx.arc(cx, cy, arcR, angle, angle + sweep)
    ctx.stroke()
    const ax = cx + arcR * Math.cos(angle + sweep)
    const ay = cy + arcR * Math.sin(angle + sweep)
    const tang = angle + sweep + Math.PI / 2
    ctx.fillStyle = GOLD
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(ax + 8 * Math.cos(tang - 0.4), ay + 8 * Math.sin(tang - 0.4))
    ctx.lineTo(ax + 8 * Math.cos(tang + 0.4), ay + 8 * Math.sin(tang + 0.4))
    ctx.closePath(); ctx.fill()

    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('top-down view', cx, H - 14)

    // ---- RIGHT: bar chart making conservation of L obvious ----
    const bx = 400
    const bTop = 60
    const bBot = 270
    const bH = bBot - bTop
    const barW = 30
    const gap = 46

    const bars = [
      { label: 'I', value: I, norm: I / I_MAX, unit: 'kg·m²', color: BLUE, disp: I.toFixed(2) },
      { label: 'ω', value: omega, norm: omega / OMEGA_MAX, unit: 'rad/s', color: GOLD, disp: omega.toFixed(2) },
      { label: 'L', value: L0, norm: 1, unit: 'kg·m²/s', color: GREEN, disp: L0.toFixed(1) },
      { label: 'KE', value: ke, norm: ke / KE_MAX, unit: 'J', color: VIOLET, disp: ke.toFixed(1) },
    ]

    ctx.textAlign = 'center'
    bars.forEach((b, i) => {
      const x = bx + i * gap
      // track
      ctx.fillStyle = 'rgba(255,245,235,0.06)'
      ctx.fillRect(x, bTop, barW, bH)
      // filled portion
      const h = clamp(b.norm, 0, 1) * bH
      ctx.fillStyle = b.color
      ctx.fillRect(x, bBot - h, barW, h)
      // value + label
      ctx.fillStyle = b.color
      ctx.font = 'bold 11px monospace'
      ctx.fillText(b.disp, x + barW / 2, bBot - h - 6)
      ctx.fillStyle = 'rgba(245,240,232,0.7)'
      ctx.font = '11px monospace'
      ctx.fillText(b.label, x + barW / 2, bBot + 16)
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.font = '9px monospace'
      ctx.fillText(b.unit, x + barW / 2, bBot + 28)
    })

    // dashed line marking that L stays pinned at the top of its track
    const lx = bx + 2 * gap
    ctx.strokeStyle = 'rgba(16,185,129,0.5)'
    ctx.setLineDash([5, 4])
    ctx.beginPath(); ctx.moveTo(bx - 8, bTop); ctx.lineTo(lx + barW + 8, bTop); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = GREEN
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('L = I·ω  conserved', bx - 8, bTop - 8)
  }, [])

  useEffect(() => {
    const loop = () => {
      const r = radiusFor(extRef.current)
      const omega = L0 / inertia(r)
      if (playingRef.current) angleRef.current += omega * 0.016
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const { ref, triggered } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // static final frame: arms tucked in, spinning fast — L unchanged
        extRef.current = 0
        set('ext', 0)
        return
      }
      playingRef.current = true
      setPlaying(true)
    },
  })

  const togglePlay = () => {
    playingRef.current = !playingRef.current
    setPlaying(playingRef.current)
  }

  const resetAll = () => {
    playingRef.current = false
    setPlaying(false)
    angleRef.current = 0
    extRef.current = 1
    set('ext', 1)
  }

  const r = radiusFor(ext)
  const I = inertia(r)
  const omega = L0 / I
  const ke = 0.5 * I * omega * omega

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Pull the arms in and watch ω rise while L holds
        </span>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: BG, aspectRatio: `${W} / ${H}` }}
        />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>I = <strong style={{ color: BLUE }}>{I.toFixed(2)} kg·m²</strong></span>
        <span>ω = <strong className="text-accent-gold">{omega.toFixed(2)} rad/s</strong></span>
        <span>L = I·ω = <strong style={{ color: GREEN }}>{L0.toFixed(1)} kg·m²/s</strong> (fixed)</span>
        <span>KE = ½I·ω² = <strong style={{ color: VIOLET }}>{ke.toFixed(1)} J</strong></span>
        {!triggered && <span className="text-text-muted">scroll to start</span>}
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={togglePlay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={13} /> {playing ? 'Pause' : 'Spin'}
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <RotateCcw size={13} /> Reset
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>arms</span>
          <input
            type="range" min={SPEC.ext.min} max={SPEC.ext.max} step={SPEC.ext.step} value={ext}
            onChange={e => {
              extRef.current = +e.target.value
              set('ext', extRef.current)
            }}
            className="w-44"
            style={{ accentColor: GREEN }}
          />
          <span>{ext > 0.5 ? 'out' : 'in'}</span>
        </label>
      </div>
    </div>
  )
}
