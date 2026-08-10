'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 320
const CX = 300
const CY = 160

// Schematic scale: the event-horizon radius drawn on screen (px) for the current
// mass. This is a cartoon, NOT a geodesic integrator — deflection is modelled as a
// smooth pull that grows as a ray passes closer, tuned so the qualitative regimes
// (gentle bend / photon-sphere loop / capture) read correctly. Real light bending
// comes from integrating null geodesics in the Schwarzschild metric.
const R_MIN = 26
const R_MAX = 64

// Solar masses -> a real Schwarzschild radius r_s = 2GM/c^2. One solar mass ~ 2.95 km.
const RS_PER_SOLAR_KM = 2.95

const ACCENT = '#818CF8' // indigo
const GOLD = '#F59E0B'
const PINK = '#F472B6'
const GREEN = '#10B981'
const CYAN = '#22D3EE'

// A single photon path, integrated left-to-right with a schematic transverse pull
// toward the hole. Returns the polyline points plus whether the ray was captured.
function tracePath(impact: number, rEvent: number) {
  const rPhoton = 1.5 * rEvent // photon sphere sits at 1.5 r_s
  const pts: [number, number][] = []
  let x = 20
  let y = CY - impact // impact parameter = vertical offset of the incoming ray
  let vx = 1
  let vy = 0
  let captured = false
  const step = 2

  for (let i = 0; i < 700; i++) {
    const dx = CX - x
    const dy = CY - y
    const r = Math.hypot(dx, dy)

    if (r < rEvent) {
      captured = true
      pts.push([x, y])
      break
    }

    // Schematic acceleration toward the hole, softened near the centre. Strength
    // chosen so rays near the photon sphere wind around before escaping.
    const soft = Math.max(r, rEvent * 0.9)
    const a = (1.9 * rEvent * rEvent) / (soft * soft * soft)
    vx += (dx / r) * a * step
    vy += (dy / r) * a * step
    const sp = Math.hypot(vx, vy) || 1
    vx /= sp
    vy /= sp

    x += vx * step
    y += vy * step
    pts.push([x, y])

    if (x < -40 || x > W + 40 || y < -80 || y > H + 80) break
  }

  return { pts, captured, rPhoton }
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  impact: { default: 70, min: 4, max: 160, step: 1 },
  massSolar: { default: 10, min: 1, max: 30, step: 1 },
}

export function BlackHoleAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('black-hole', SPEC)
  const { impact, massSolar } = params
  const [sweep, setSweep] = useState(false)
  const sweepRef = useRef(0)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { set('impact', 46); setSweep(false); return }
      setSweep(true)
    },
  })

  // Map mass (1–30 solar) to an on-screen horizon radius.
  const rEvent = useCallback(
    (m: number) => R_MIN + ((m - 1) / 29) * (R_MAX - R_MIN),
    []
  )

  const draw = useCallback(
    (imp: number, m: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, W, H)

      const rE = rEvent(m)
      const rP = 1.5 * rE

      // Faint accretion glow around the hole.
      const glow = ctx.createRadialGradient(CX, CY, rE, CX, CY, rP + 40)
      glow.addColorStop(0, 'rgba(129,140,248,0.20)')
      glow.addColorStop(1, 'rgba(129,140,248,0)')
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(CX, CY, rP + 40, 0, Math.PI * 2); ctx.fill()

      // Photon sphere (dashed cyan) — where light can orbit.
      ctx.strokeStyle = 'rgba(34,211,238,0.55)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.arc(CX, CY, rP, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])

      // Event horizon — the black disk with a gold rim.
      ctx.fillStyle = '#000000'
      ctx.beginPath(); ctx.arc(CX, CY, rE, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(CX, CY, rE, 0, Math.PI * 2); ctx.stroke()

      // A fan of faint reference rays so the reader sees the whole field of bending.
      const fan = [18, 34, 52, 78, 108, 140]
      for (const b of fan) {
        for (const s of [1, -1]) {
          const { pts, captured } = tracePath(s * b, rE)
          ctx.strokeStyle = captured ? 'rgba(244,114,182,0.18)' : 'rgba(96,165,250,0.16)'
          ctx.lineWidth = 1
          ctx.beginPath()
          pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
          ctx.stroke()
        }
      }

      // The reader-controlled ray, drawn bright.
      const { pts, captured } = tracePath(imp, rE)
      const rayColor = captured ? PINK : Math.abs(imp - rP) < 6 ? GREEN : ACCENT
      ctx.strokeStyle = rayColor
      ctx.lineWidth = 2.5
      ctx.beginPath()
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
      ctx.stroke()

      // Photon head marker.
      if (pts.length) {
        const [hx, hy] = pts[pts.length - 1]
        ctx.fillStyle = rayColor
        ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill()
        const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 11)
        hg.addColorStop(0, captured ? 'rgba(244,114,182,0.5)' : 'rgba(129,140,248,0.5)')
        hg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = hg
        ctx.beginPath(); ctx.arc(hx, hy, 11, 0, Math.PI * 2); ctx.fill()
      }

      // Incoming-ray start marker + impact-parameter guide.
      ctx.strokeStyle = 'rgba(255,245,235,0.18)'
      ctx.lineWidth = 1
      ctx.setLineDash([2, 3])
      ctx.beginPath(); ctx.moveTo(20, CY); ctx.lineTo(20, CY - imp); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255,245,235,0.5)'
      ctx.font = '10px monospace'
      ctx.fillText('impact b', 26, CY - imp - 4)

      // Labels.
      ctx.fillStyle = 'rgba(34,211,238,0.8)'
      ctx.fillText('photon sphere (1.5 rₛ)', CX - 62, CY - rP - 8)
      ctx.fillStyle = GOLD
      ctx.textAlign = 'center'
      ctx.fillText('event horizon', CX, CY + rE + 16)
      ctx.textAlign = 'left'

      // Outcome badge.
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = rayColor
      const label = captured ? 'CAPTURED — cannot escape' : Math.abs(imp - rP) < 6 ? 'grazing the photon sphere' : 'deflected — escapes'
      ctx.fillText(label, 20, 26)
    },
    [rEvent]
  )

  useEffect(() => { draw(impact, massSolar) }, [draw, impact, massSolar])

  // Sweep the impact parameter down from far to capture, then stop.
  useEffect(() => {
    if (!sweep) return
    sweepRef.current = 150
    set('impact', 150)
    let raf = 0
    const step = () => {
      sweepRef.current -= 1.1
      if (sweepRef.current <= 8) {
        set('impact', 8)
        setSweep(false)
        return
      }
      set('impact', +sweepRef.current.toFixed(1))
      raf = requestAnimationFrame(() => setTimeout(step, 24))
    }
    raf = requestAnimationFrame(() => setTimeout(step, 24))
    return () => cancelAnimationFrame(raf)
  }, [sweep, set])

  const reset = () => {
    triggerReset()
    setSweep(false)
    set('impact', 70)
    set('massSolar', 10)
  }

  const rsKm = (massSolar * RS_PER_SOLAR_KM).toFixed(1)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Light bending near a black hole</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setSweep(s => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: ACCENT, color: '#0F0D0A' }}>
          <Play size={12} /> Sweep b → capture
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>impact b:</span>
          <input type="range" min={SPEC.impact.min} max={SPEC.impact.max} step={SPEC.impact.step} value={impact}
            onChange={e => { set('impact', +e.target.value); setSweep(false) }}
            className="w-32" style={{ accentColor: ACCENT }} />
          <span className="font-mono text-text-secondary">{impact.toFixed(0)}px</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>mass:</span>
          <input type="range" min={SPEC.massSolar.min} max={SPEC.massSolar.max} step={SPEC.massSolar.step} value={massSolar}
            onChange={e => { set('massSolar', +e.target.value); setSweep(false) }}
            className="w-24" style={{ accentColor: GOLD }} />
          <span className="font-mono text-text-secondary">{massSolar} M☉</span>
        </label>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Event horizon <strong className="font-mono" style={{ color: GOLD }}>rₛ ≈ {rsKm} km</strong> for {massSolar} solar masses ·
        photon sphere at <strong className="font-mono" style={{ color: CYAN }}>1.5 rₛ</strong>.
        Rays that pass wide bend gently; rays near the photon sphere whip around; rays inside the horizon never come back.
        This is a schematic pull, not a geodesic solver — the regimes are right, the exact angles are not.
      </p>
    </div>
  )
}
