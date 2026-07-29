'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360
const BG = '#0F0D0A'
const INDIGO = '#818CF8'
const GOLD = '#F59E0B'

// Aperture diameter in metres. The range spans a small backyard scope up to
// something JWST-sized so the D² scaling is dramatic across the slider.
const D_MIN = 0.5
const D_MAX = 8
const D_REF = D_MIN // light-gathering is quoted relative to the smallest aperture

// A fixed, deterministic set of photon positions inside the unit disc, laid out
// on a golden-angle (sunflower) spiral. We reveal the first N of them, where N
// is proportional to the aperture AREA, so photons collected ∝ D².
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const N_PHOTONS = 460
const photons = Array.from({ length: N_PHOTONS }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / N_PHOTONS)
  const a = i * GOLDEN
  return { x: r * Math.cos(a), y: r * Math.sin(a), phase: (i * 2.399) % (Math.PI * 2) }
})

// Fixed faint background stars (deterministic — no Math.random at runtime).
const STARS = Array.from({ length: 40 }, (_, i) => ({
  x: ((i * 73) % 100) / 100,
  y: ((i * 149) % 100) / 100,
  mag: ((i * 37) % 100) / 100, // 0 = faint, 1 = relatively bright
}))

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function ApertureLightGatheringAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const dRef = useRef(D_MIN)
  const tRef = useRef(0)
  const playingRef = useRef(false)

  const [dDisplay, setDDisplay] = useState(D_MIN)
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

    const D = dRef.current
    const area = Math.PI * (D / 2) * (D / 2)
    const ratio = (D / D_REF) * (D / D_REF) // light collected vs the smallest aperture
    const t = tRef.current

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)
    ctx.font = '11px monospace'

    // ---- LEFT: the aperture disc filling with collected photons ----
    const cx = 158
    const cy = 190
    const rMax = 118 // pixels for the largest aperture
    const rPix = (D / D_MAX) * rMax

    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.textAlign = 'center'
    ctx.fillText('collecting aperture', cx, 44)

    // ghost outline of the maximum aperture, for scale
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.arc(cx, cy, rMax, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])

    // faint glow of gathered light — brighter for bigger apertures
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, rPix)
    glow.addColorStop(0, `rgba(129,140,248,${clamp(0.10 + ratio * 0.004, 0.1, 0.55)})`)
    glow.addColorStop(1, 'rgba(129,140,248,0.02)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(cx, cy, rPix, 0, Math.PI * 2); ctx.fill()

    // rim of the mirror
    ctx.strokeStyle = INDIGO
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(cx, cy, rPix, 0, Math.PI * 2); ctx.stroke()

    // photons: reveal a count ∝ AREA so the disc packs in 4× the light when D doubles
    const nShown = Math.round((area / (Math.PI * (D_MAX / 2) * (D_MAX / 2))) * N_PHOTONS)
    for (let i = 0; i < nShown; i++) {
      const p = photons[i]
      const px = cx + p.x * rPix * 0.94
      const py = cy + p.y * rPix * 0.94
      const twinkle = 0.55 + 0.45 * Math.sin(t * 3 + p.phase)
      ctx.fillStyle = `rgba(196,205,255,${(0.5 * twinkle).toFixed(3)})`
      ctx.fillRect(px - 0.75, py - 0.75, 1.5, 1.5)
    }

    // ---- RIGHT: the faint target that emerges as more light is gathered ----
    const vx = 300
    const vy = 60
    const vw = 264
    const vh = 232
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.fillText('what the eyepiece sees', vx + vw / 2, 44)
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.lineWidth = 1
    ctx.strokeRect(vx, vy, vw, vh)

    ctx.save()
    ctx.beginPath(); ctx.rect(vx, vy, vw, vh); ctx.clip()

    // faint field stars: a star shows once the gathered light passes its faintness
    const lightScale = clamp(ratio / 60, 0, 1) // 0..1 sensitivity proxy
    for (const s of STARS) {
      const sx = vx + s.x * vw
      const sy = vy + s.y * vh
      const vis = clamp((lightScale - (1 - s.mag) * 0.85) * 4, 0, 1)
      if (vis <= 0) continue
      ctx.fillStyle = `rgba(245,240,232,${(vis * (0.4 + s.mag * 0.5)).toFixed(3)})`
      const rad = 0.6 + s.mag * 1.2
      ctx.beginPath(); ctx.arc(sx, sy, rad, 0, Math.PI * 2); ctx.fill()
    }

    // a faint galaxy in the centre whose brightness tracks the light gathered
    const gx = vx + vw * 0.5
    const gy = vy + vh * 0.52
    const gAlpha = clamp(lightScale * 0.9, 0, 0.9)
    const gal = ctx.createRadialGradient(gx, gy, 0, gx, gy, 60)
    gal.addColorStop(0, `rgba(200,210,255,${(gAlpha).toFixed(3)})`)
    gal.addColorStop(0.4, `rgba(150,165,255,${(gAlpha * 0.4).toFixed(3)})`)
    gal.addColorStop(1, 'rgba(129,140,248,0)')
    ctx.save()
    ctx.translate(gx, gy); ctx.rotate(-0.5); ctx.scale(1.6, 0.7)
    ctx.fillStyle = gal
    ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.fill()
    ctx.restore()

    if (gAlpha < 0.12) {
      ctx.fillStyle = 'rgba(245,240,232,0.28)'
      ctx.font = '10px monospace'
      ctx.fillText('faint galaxy — below the light threshold', gx, gy)
    }
    ctx.restore()

    // ---- on-canvas headline numbers ----
    ctx.textAlign = 'left'
    ctx.fillStyle = INDIGO
    ctx.font = 'bold 15px monospace'
    ctx.fillText(`D = ${D.toFixed(2)} m`, cx - 52, cy + rMax + 24)
    ctx.fillStyle = GOLD
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`light × ${ratio >= 100 ? Math.round(ratio) : ratio.toFixed(1)} vs ${D_REF} m`, cx, cy + rMax + 40)

    // flag when the aperture reaches JWST scale
    if (D >= 6.4 && D <= 6.6) {
      ctx.fillStyle = 'rgba(129,140,248,0.85)'
      ctx.font = '10px monospace'
      ctx.fillText('≈ JWST (6.5 m mirror)', cx, cy + rMax + 54)
    }
  }, [])

  useEffect(() => {
    const loop = () => {
      tRef.current += 0.016
      if (playingRef.current) {
        dRef.current = Math.min(D_MAX, dRef.current + 0.045)
        setDDisplay(dRef.current)
        if (dRef.current >= D_MAX) { playingRef.current = false; setPlaying(false) }
      }
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const { ref, triggered } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // one static final frame: a large aperture with the target fully revealed
        dRef.current = D_MAX
        setDDisplay(D_MAX)
        return
      }
      dRef.current = D_MIN
      setDDisplay(D_MIN)
      playingRef.current = true
      setPlaying(true)
    },
  })

  const togglePlay = () => {
    if (dRef.current >= D_MAX) { dRef.current = D_MIN; setDDisplay(D_MIN) }
    playingRef.current = !playingRef.current
    setPlaying(playingRef.current)
  }

  const resetAll = () => {
    playingRef.current = false
    setPlaying(false)
    dRef.current = D_MIN
    setDDisplay(D_MIN)
  }

  const area = Math.PI * (dDisplay / 2) * (dDisplay / 2)
  const ratio = (dDisplay / D_REF) * (dDisplay / D_REF)

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Grow the aperture and watch faint light appear</span>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: BG, aspectRatio: `${W} / ${H}` }}
        />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>aperture <strong style={{ color: INDIGO }}>D = {dDisplay.toFixed(2)} m</strong></span>
        <span>collecting area = π(D/2)² = <strong className="text-accent-gold">{area.toFixed(2)} m²</strong></span>
        <span>aperture ×2 → light ×4</span>
        <span>light gathered <strong style={{ color: INDIGO }}>×{ratio >= 100 ? Math.round(ratio) : ratio.toFixed(1)}</strong> vs {D_REF} m</span>
        {!triggered && <span className="text-text-muted">scroll to start</span>}
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={togglePlay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={13} /> {playing ? 'Pause' : dDisplay >= D_MAX ? 'Replay' : 'Grow aperture'}
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <RotateCcw size={13} /> Reset
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>D</span>
          <input
            type="range" min={D_MIN} max={D_MAX} step={0.05} value={dDisplay}
            onChange={e => {
              playingRef.current = false
              setPlaying(false)
              dRef.current = +e.target.value
              setDDisplay(dRef.current)
            }}
            className="w-44 accent-accent-indigo"
          />
        </div>
      </div>
    </div>
  )
}
