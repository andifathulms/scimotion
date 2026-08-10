'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360
const BG = '#0F0D0A'
const INDIGO = '#818CF8'
const GOLD = '#F59E0B'
const TEAL = '#10B981'

// Physics. A double star with a fixed on-sky separation; we vary the aperture D
// and watch the diffraction (Airy) disks shrink until the pair is resolved.
const LAMBDA = 550e-9 // m, mid-visible light
const RAD_TO_ARCSEC = 206265
const SEP_ARCSEC = 1.0 // fixed separation of the two point sources
const D_MIN = 0.04 // m
const D_MAX = 1.0 // m

// θ_airy (first null / Rayleigh radius) in arcsec for a given aperture.
const airyArcsec = (D: number) => (1.22 * LAMBDA / D) * RAD_TO_ARCSEC

// Screen mapping: pixels per arcsec so the fixed separation is a comfortable gap.
const SEP_PX = 74
const PX_PER_ARCSEC = SEP_PX / SEP_ARCSEC

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function TelescopeResolutionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const dRef = useRef(D_MIN)
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
    const thetaAiry = airyArcsec(D) // arcsec, radius of the Airy disk
    const resolved = SEP_ARCSEC >= thetaAiry
    const airyPix = thetaAiry * PX_PER_ARCSEC

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    // ---- sky scene with the two Airy disks ----
    const sceneY = 44
    const sceneH = 176
    const cy = sceneY + sceneH / 2
    const cx = W / 2
    const x1 = cx - SEP_PX / 2
    const x2 = cx + SEP_PX / 2

    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.textAlign = 'center'
    ctx.fillText('double star through the telescope', cx, 30)

    // frame
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.lineWidth = 1
    ctx.strokeRect(70, sceneY, W - 140, sceneH)

    // each source rendered as an Airy blob; additive blending merges them when
    // the disks are large (small D) and separates them when D is large.
    const drawBlob = (xc: number) => {
      const rad = clamp(airyPix, 3, 240)
      const g = ctx.createRadialGradient(xc, cy, 0, xc, cy, rad)
      g.addColorStop(0, 'rgba(200,210,255,0.95)')
      g.addColorStop(0.18, 'rgba(150,165,255,0.55)')
      g.addColorStop(0.5, 'rgba(129,140,248,0.16)')
      g.addColorStop(1, 'rgba(129,140,248,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(xc, cy, rad, 0, Math.PI * 2); ctx.fill()
      // faint first diffraction ring for the larger disks
      if (rad > 14) {
        ctx.strokeStyle = 'rgba(129,140,248,0.14)'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(xc, cy, rad * 0.62, 0, Math.PI * 2); ctx.stroke()
      }
    }

    ctx.save()
    ctx.beginPath(); ctx.rect(71, sceneY + 1, W - 142, sceneH - 2); ctx.clip()
    ctx.globalCompositeOperation = 'lighter'
    drawBlob(x1)
    drawBlob(x2)
    ctx.restore()

    // tick marks under the two true source positions
    ctx.strokeStyle = 'rgba(245,240,232,0.25)'
    ctx.lineWidth = 1
    for (const xx of [x1, x2]) {
      ctx.beginPath(); ctx.moveTo(xx, sceneY + sceneH - 6); ctx.lineTo(xx, sceneY + sceneH - 1); ctx.stroke()
    }

    // ---- intensity cross-section: two peaks with a dip when resolved ----
    const profY0 = sceneY + sceneH + 66
    const profH = 54
    const sigma = clamp(airyPix, 3, 240) * 0.42
    const gauss = (x: number, mu: number) => Math.exp(-((x - mu) * (x - mu)) / (2 * sigma * sigma))
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.font = '10px monospace'
    ctx.fillText('combined intensity', 74, profY0 - profH - 6)

    // baseline
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.beginPath(); ctx.moveTo(70, profY0); ctx.lineTo(W - 70, profY0); ctx.stroke()

    // sample the summed profile across the scene width
    let maxI = 0
    const xs: number[] = []
    const is: number[] = []
    for (let px = 72; px <= W - 72; px += 2) {
      const I = gauss(px, x1) + gauss(px, x2)
      xs.push(px); is.push(I)
      if (I > maxI) maxI = I
    }
    ctx.strokeStyle = resolved ? TEAL : GOLD
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < xs.length; i++) {
      const y = profY0 - (is[i] / maxI) * profH
      if (i === 0) ctx.moveTo(xs[i], y); else ctx.lineTo(xs[i], y)
    }
    ctx.stroke()

    // ---- verdict + numbers ----
    ctx.textAlign = 'center'
    ctx.font = 'bold 14px monospace'
    ctx.fillStyle = resolved ? TEAL : GOLD
    ctx.fillText(resolved ? '✓ RESOLVED — two stars' : '✗ BLURRED — one blob', cx, sceneY + sceneH + 24)

    ctx.font = '11px monospace'
    ctx.fillStyle = INDIGO
    ctx.textAlign = 'left'
    ctx.fillText(`D = ${D >= 1 ? D.toFixed(2) : (D * 100).toFixed(0) + ' cm'}`, 74, H - 10)
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.textAlign = 'right'
    ctx.fillText(`θ ≈ 1.22 λ/D = ${thetaAiry.toFixed(2)}″   (separation ${SEP_ARCSEC.toFixed(1)}″)`, W - 74, H - 10)
  }, [])

  useEffect(() => {
    const loop = () => {
      if (playingRef.current) {
        // sweep aperture up on a gentle log ramp: blurred → resolved
        dRef.current = Math.min(D_MAX, dRef.current * 1.012 + 0.0015)
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
        // static final frame: large aperture, pair cleanly resolved
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

  const thetaAiry = airyArcsec(dDisplay)
  const resolved = SEP_ARCSEC >= thetaAiry

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Widen the aperture to split a double star</span>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: BG, aspectRatio: `${W} / ${H}` }}
        />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>Rayleigh: <strong style={{ color: INDIGO }}>θ ≈ 1.22 λ/D</strong></span>
        <span>λ = 550 nm</span>
        <span>aperture <strong style={{ color: INDIGO }}>D = {dDisplay >= 1 ? dDisplay.toFixed(2) + ' m' : (dDisplay * 100).toFixed(0) + ' cm'}</strong></span>
        <span>θ = <strong className="text-accent-gold">{thetaAiry.toFixed(2)}″</strong> vs sep {SEP_ARCSEC.toFixed(1)}″</span>
        <span className={resolved ? 'text-accent-teal' : 'text-accent-gold'}>{resolved ? 'resolved' : 'blurred'}</span>
        {!triggered && <span className="text-text-muted">scroll to start</span>}
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={togglePlay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={13} /> {playing ? 'Pause' : dDisplay >= D_MAX ? 'Replay' : 'Play'}
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <RotateCcw size={13} /> Reset
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>D</span>
          <input
            type="range" min={D_MIN} max={D_MAX} step={0.005} value={dDisplay}
            onChange={e => {
              playingRef.current = false
              setPlaying(false)
              dRef.current = +e.target.value
              setDDisplay(dRef.current)
            }}
            className="w-44 accent-accent-indigo"
          />
        </label>
      </div>
    </div>
  )
}
