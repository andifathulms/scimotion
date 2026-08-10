'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340
const CX = 190
const CY = 170

const ACCENT = '#818CF8' // indigo
const GOLD = '#F59E0B'
const RED = '#F87171'
const GREEN = '#10B981'
const MOON_COL = '#CBD5E1'
const MUTED = 'rgba(255,245,235,0.45)'

const PLANET_R = 42
const ROCHE_R = 168 // drawn Roche-limit radius (centre-to-centre) in px
const MOON_R = 15
const START_D = 360 // starting centre distance (off the right edge, migrating in)

const N = 46 // debris fragments

// Deterministic per-fragment layout — seeded from the index, never Math.random.
type Frag = { ang: number; ring: number; size: number; spin: number }
const FRAGS: Frag[] = Array.from({ length: N }, (_, i) => {
  const s = ((i * 2654435761) % 1000) / 1000 // integer-hash → [0,1)
  return {
    ang: (i / N) * Math.PI * 2,
    ring: ROCHE_R + (s - 0.5) * 34,
    size: 1.6 + s * 1.8,
    spin: 0.004 + s * 0.004,
  }
})

export function RocheLimitAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<'intact' | 'disrupted'>('intact')
  const [running, setRunning] = useState(false)

  const dRef = useRef(START_D) // current centre-to-centre distance (px)
  const spreadRef = useRef(0) // 0 = still a moon, 1 = fully in the ring
  const shredDRef = useRef(0) // distance at which shredding began
  const rotRef = useRef(0)
  const rafRef = useRef(0)
  const disruptedRef = useRef(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Static final frame: moon torn into a debris ring at the Roche limit.
        dRef.current = ROCHE_R
        shredDRef.current = ROCHE_R
        spreadRef.current = 1
        disruptedRef.current = true
        setStatus('disrupted')
        return
      }
      setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    const d = dRef.current
    const spread = spreadRef.current
    const disrupted = disruptedRef.current

    // Roche-limit circle (dashed).
    ctx.strokeStyle = 'rgba(248,113,113,0.55)'
    ctx.lineWidth = 1.2
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.arc(CX, CY, ROCHE_R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(248,113,113,0.8)'
    ctx.font = '10px monospace'
    ctx.fillText('Roche limit  r ≈ 2.44 R (ρ_p/ρ_m)^⅓', CX - 6, CY - ROCHE_R - 8)

    // Planet.
    const g = ctx.createRadialGradient(CX - 12, CY - 12, 6, CX, CY, PLANET_R)
    g.addColorStop(0, 'rgba(129,140,248,0.6)')
    g.addColorStop(1, 'rgba(79,70,229,0.35)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(CX, CY, PLANET_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(129,140,248,0.75)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.arc(CX, CY, PLANET_R, 0, Math.PI * 2)
    ctx.stroke()

    if (!disrupted) {
      // A cohesive moon migrating inward along +x.
      const mx = CX + d
      const my = CY
      ctx.fillStyle = MOON_COL
      ctx.beginPath()
      ctx.arc(mx, my, MOON_R, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(203,213,225,0.9)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(mx, my, MOON_R, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = MUTED
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('moon (cohesive)', mx, my - MOON_R - 6)
      ctx.textAlign = 'left'
    } else {
      // The debris: fragments interpolate from the moon's break-up point out to a
      // full ring at the Roche radius, then orbit the planet.
      const startX = CX + shredDRef.current
      for (const fr of FRAGS) {
        const a = fr.ang + rotRef.current * fr.spin * 60
        const ringX = CX + Math.cos(a) * fr.ring
        const ringY = CY + Math.sin(a) * fr.ring
        const fx = startX * (1 - spread) + ringX * spread
        const fy = CY * (1 - spread) + ringY * spread
        ctx.fillStyle = MOON_COL
        ctx.beginPath()
        ctx.arc(fx, fy, fr.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = MUTED
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('debris ring', CX, CY - ROCHE_R + 16)
      ctx.textAlign = 'left'
    }

    // Status badge.
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = disrupted ? RED : GREEN
    ctx.fillText(disrupted ? 'DISRUPTED — tidal force > self-gravity' : 'INTACT — self-gravity holds it together', 16, 26)
  }, [])

  // Migration + shredding loop.
  useEffect(() => {
    if (!running) return
    const step = () => {
      rotRef.current += 1
      if (!disruptedRef.current) {
        dRef.current -= 1.1
        if (dRef.current <= ROCHE_R) {
          dRef.current = ROCHE_R
          shredDRef.current = ROCHE_R
          disruptedRef.current = true
          setStatus('disrupted')
        }
      } else if (spreadRef.current < 1) {
        spreadRef.current = Math.min(1, spreadRef.current + 0.012)
      }
      draw()
      if (disruptedRef.current && spreadRef.current >= 1) {
        // Keep the ring gently rotating for a moment, then settle.
        rafRef.current = requestAnimationFrame(step)
        return
      }
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => {
    draw()
  }, [draw, status])

  const reset = () => {
    triggerReset()
    setRunning(false)
    dRef.current = START_D
    spreadRef.current = 0
    shredDRef.current = 0
    rotRef.current = 0
    disruptedRef.current = false
    setStatus('intact')
    draw()
  }

  // Readout numbers. Tidal force ∝ 1/d³, self-gravity is constant; they balance at
  // the Roche limit, so the ratio is simply (Roche/d)³.
  const dNow = status === 'disrupted' ? shredDRef.current : dRef.current
  const ratio = Math.pow(ROCHE_R / Math.max(dNow, 1), 3)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label" style={{ color: ACCENT }}>
          <Play size={13} /> Interactive · The Roche limit
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
        <div className="mt-3 px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            distance d = <strong style={{ color: ACCENT }}>{(dNow / ROCHE_R).toFixed(2)} r_Roche</strong>
          </span>
          <span>
            tidal / self-gravity ={' '}
            <strong style={{ color: ratio >= 1 ? RED : GREEN }}>×{ratio.toFixed(2)}</strong>
          </span>
          <span className="text-text-muted">balance at d = r_Roche</span>
        </div>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(true)}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          style={{ background: ACCENT, color: '#0F0D0A' }}
        >
          <Play size={12} /> Play — migrate inward
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary border border-border"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Far out, the moon&apos;s own gravity easily holds it together. As it migrates inward the tidal stretch grows as
        1/d³ until, at the <strong style={{ color: RED }}>Roche limit</strong>, it overwhelms self-gravity and the body
        shears into a <strong style={{ color: GOLD }}>debris ring</strong> — the likely origin of Saturn&apos;s rings.
        Rigid moons held by material strength (and small ones) can survive closer.
      </p>
    </div>
  )
}
