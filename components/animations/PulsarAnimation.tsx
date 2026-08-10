'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

// The lighthouse model. A neutron star spins about a vertical axis; its magnetic
// axis is tilted by `alpha` from the spin axis, so the two radio beams (one per
// magnetic pole) trace cones on the sky as the star turns. Earth is a FIXED
// detector; we register a pulse only when a beam sweeps across our line of sight.
// Crucially, the beams glow steadily — the star never blinks. We see pulses
// because the beam sweeps past us, once per rotation, so the pulse period is the
// rotation period.

const CX = 178 // star centre (screen)
const CY = 150
const S = 96 // sweep scale — beam length on the unit sphere, in px
const VIEW_T = 0.4 // oblique view tilt (rad) so the sweep reads as an ellipse
const COS_T = Math.cos(VIEW_T)
const SIN_T = Math.sin(VIEW_T)

// Earth's line of sight: a fixed direction 55° from the spin axis.
const THETA_E = (55 * Math.PI) / 180
const D: [number, number, number] = [Math.sin(THETA_E), 0, Math.cos(THETA_E)]

const RHO = (16 * Math.PI) / 180 // beam half-width (radians)
const SIGMA = RHO / 1.35 // gaussian width of the beam intensity

// Bottom strip: the timing trace of what Earth's detector sees.
const TX0 = 40
const TX1 = 560
const TBASE = 320
const TAMP = 46
const HISTORY_MAX = 260
const DX_HIST = (TX1 - TX0) / HISTORY_MAX

const ACCENT = '#818CF8' // indigo
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const PINK = '#F472B6'

// Project a 3D direction (spin axis = z, up) to the screen with an oblique view.
function proj(x: number, y: number, z: number): [number, number] {
  return [CX + S * x, CY - S * (z * COS_T) + S * (y * SIN_T)]
}

const dot = (a: [number, number, number], b: [number, number, number]) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// Map the real spin rate (Hz) to a comfortable on-screen rotation rate. Real
// pulsars turn up to hundreds of times a second — impossible to watch — so the
// rotation is slowed for visibility while the readout shows the true numbers.
function visRevPerSec(hz: number): number {
  const f = (Math.log10(hz) - Math.log10(0.5)) / (Math.log10(700) - Math.log10(0.5))
  return 0.28 + f * 1.7
}

// Beam intensity seen at Earth for a magnetic-axis phase `phi` and tilt `alpha`.
function earthIntensity(phi: number, alpha: number): number {
  const sa = Math.sin(alpha)
  const ca = Math.cos(alpha)
  const m: [number, number, number] = [sa * Math.cos(phi), sa * Math.sin(phi), ca]
  const a1 = Math.acos(clamp(dot(m, D), -1, 1))
  const a2 = Math.acos(clamp(-dot(m, D), -1, 1))
  const a = Math.min(a1, a2)
  return Math.exp(-(a * a) / (2 * SIGMA * SIGMA))
}

export function PulsarAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number | null>(null)

  const phiRef = useRef(0) // rotation phase (rad)
  const historyRef = useRef<number[]>([])
  const seenRef = useRef(false) // any pulse this rotation?
  const peakRef = useRef(0)

  const spinRef = useRef(1.4)
  const alphaRef = useRef((52 * Math.PI) / 180)

  const [spinHz, setSpinHz] = useState(1.4)
  const [alphaDeg, setAlphaDeg] = useState(52)
  const [running, setRunning] = useState(false)
  const [seen, setSeen] = useState(true)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    const phi = phiRef.current
    const alpha = alphaRef.current
    const sa = Math.sin(alpha)
    const ca = Math.cos(alpha)
    const m: [number, number, number] = [sa * Math.cos(phi), sa * Math.sin(phi), ca]

    // ---- swept-cone guide: the ellipse each beam tip traces over one rotation ----
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.setLineDash([3, 4])
    ctx.lineWidth = 1
    for (const sign of [1, -1]) {
      ctx.beginPath()
      for (let k = 0; k <= 72; k++) {
        const a = (k / 72) * Math.PI * 2
        const [px, py] = proj(sign * sa * Math.cos(a), sign * sa * Math.sin(a), sign * ca)
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }
    ctx.setLineDash([])

    // ---- spin axis ----
    const [axTx, axTy] = proj(0, 0, 1.25)
    const [axBx, axBy] = proj(0, 0, -1.25)
    ctx.strokeStyle = 'rgba(255,245,235,0.22)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(axTx, axTy); ctx.lineTo(axBx, axBy); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('spin axis', axTx + 6, axTy + 4)

    // ---- the two beams (drawn steadily — the star never blinks) ----
    // Far beam first (the one pointing away from the viewer) so the near beam sits on top.
    const drawBeam = (dir: [number, number, number]) => {
      const [tx, ty] = proj(dir[0] * 1.02, dir[1] * 1.02, dir[2] * 1.02)
      const dx = tx - CX
      const dy = ty - CY
      const len = Math.hypot(dx, dy) || 1
      const half = 15 // cone half-width at the tip (px)
      const px = (-dy / len) * half
      const py = (dx / len) * half
      const near = dir[1] >= 0 // beam pointing toward the viewer glows brighter
      const grad = ctx.createLinearGradient(CX, CY, tx, ty)
      grad.addColorStop(0, near ? 'rgba(129,140,248,0.55)' : 'rgba(129,140,248,0.28)')
      grad.addColorStop(1, 'rgba(129,140,248,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      ctx.lineTo(tx + px, ty + py)
      ctx.lineTo(tx - px, ty - py)
      ctx.closePath()
      ctx.fill()
      // bright core line
      ctx.strokeStyle = near ? 'rgba(167,139,250,0.9)' : 'rgba(167,139,250,0.4)'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(tx, ty); ctx.stroke()
    }
    // order by depth (y): draw the more-distant beam first
    if (m[1] >= 0) {
      drawBeam([-m[0], -m[1], -m[2]])
      drawBeam(m)
    } else {
      drawBeam(m)
      drawBeam([-m[0], -m[1], -m[2]])
    }

    // ---- the neutron star ----
    const glow = ctx.createRadialGradient(CX, CY, 2, CX, CY, 34)
    glow.addColorStop(0, 'rgba(129,140,248,0.55)')
    glow.addColorStop(1, 'rgba(129,140,248,0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(CX, CY, 34, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#EDEBFF'
    ctx.beginPath(); ctx.arc(CX, CY, 15, 0, Math.PI * 2); ctx.fill()
    // rotation ticks on the surface to show it is spinning
    ctx.strokeStyle = 'rgba(129,140,248,0.85)'
    ctx.lineWidth = 1.5
    for (let k = 0; k < 4; k++) {
      const a = phi + (k / 4) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(CX + 15 * Math.cos(a), CY + 4 * Math.sin(a))
      ctx.lineTo(CX + 9 * Math.cos(a), CY + 2.4 * Math.sin(a))
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.textAlign = 'center'
    ctx.fillText('neutron star', CX, CY + 52)
    ctx.textAlign = 'left'

    // ---- Earth: the fixed detector ----
    const intensity = earthIntensity(phi, alpha)
    const [ex, ey] = proj(D[0], D[1], D[2])
    // line of sight
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(ex, ey); ctx.stroke()
    if (intensity > 0.04) {
      const fg = ctx.createRadialGradient(ex, ey, 1, ex, ey, 18)
      fg.addColorStop(0, `rgba(245,158,11,${(0.7 * intensity).toFixed(3)})`)
      fg.addColorStop(1, 'rgba(245,158,11,0)')
      ctx.fillStyle = fg
      ctx.beginPath(); ctx.arc(ex, ey, 18, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = intensity > 0.35 ? GOLD : BLUE
    ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(245,240,232,0.7)'
    ctx.fillText('Earth', ex + 10, ey + 4)
    ctx.fillStyle = intensity > 0.35 ? GOLD : 'rgba(245,240,232,0.45)'
    ctx.fillText(intensity > 0.35 ? 'beam on us — pulse!' : 'beam elsewhere', ex - 6, ey + 20)

    // ---- the timing trace (what the detector records) ----
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(TX0, TBASE); ctx.lineTo(TX1, TBASE); ctx.stroke()

    const hist = historyRef.current
    ctx.strokeStyle = ACCENT
    ctx.lineWidth = 2
    ctx.beginPath()
    hist.forEach((v, i) => {
      const x = TX0 + i * DX_HIST
      const y = TBASE - v * TAMP
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    if (hist.length) {
      const x = TX0 + (hist.length - 1) * DX_HIST
      const y = TBASE - hist[hist.length - 1] * TAMP
      ctx.fillStyle = PINK
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('detector signal — one pulse per rotation (pulse period = rotation period)', TX0, TBASE + 26)

    // ---- header labels ----
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('The beams glow steadily; only their direction turns', 40, 24)
  }, [])

  const advance = useCallback((dt: number) => {
    const omega = 2 * Math.PI * visRevPerSec(spinRef.current)
    const prev = phiRef.current
    phiRef.current = prev + omega * dt
    const intensity = earthIntensity(phiRef.current, alphaRef.current)
    peakRef.current = Math.max(peakRef.current, intensity)
    if (intensity > 0.4) seenRef.current = true
    // Detect completion of a rotation to latch the "seen" readout.
    if (Math.floor(phiRef.current / (Math.PI * 2)) > Math.floor(prev / (Math.PI * 2))) {
      setSeen(seenRef.current)
      seenRef.current = false
    }
    const h = historyRef.current
    h.push(intensity)
    if (h.length > HISTORY_MAX) h.shift()
  }, [])

  useEffect(() => { render() }, [render])

  useEffect(() => {
    if (!running) { lastRef.current = null; cancelAnimationFrame(rafRef.current); return }
    const loop = (now: number) => {
      if (lastRef.current === null) lastRef.current = now
      const dt = Math.min(48, now - lastRef.current) / 1000
      lastRef.current = now
      advance(dt)
      render()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, advance, render])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Seed a static frame with the beam sweeping across Earth and a trace of pulses.
        phiRef.current = 0
        historyRef.current = []
        for (let i = 0; i < HISTORY_MAX; i++) {
          const p = (i / HISTORY_MAX) * Math.PI * 6
          historyRef.current.push(earthIntensity(p, alphaRef.current))
        }
        render()
        return
      }
      setRunning(true)
    },
  })

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    phiRef.current = 0
    historyRef.current = []
    seenRef.current = false
    peakRef.current = 0
    lastRef.current = null
    spinRef.current = 1.4
    alphaRef.current = (52 * Math.PI) / 180
    setSpinHz(1.4)
    setAlphaDeg(52)
    setSeen(true)
    render()
  }

  const periodMs = 1000 / spinHz

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The lighthouse model of a pulsar</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: ACCENT, color: '#0F0D0A' }}
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Spin it</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Spin:</span>
          <input
            type="range" min={Math.log10(0.5)} max={Math.log10(700)} step={0.01}
            value={Math.log10(spinHz)}
            onChange={ev => { const v = Math.pow(10, +ev.target.value); spinRef.current = v; setSpinHz(v) }}
            className="w-28"
            style={{ accentColor: ACCENT }}
          />
          <span className="font-mono text-text-secondary">{spinHz < 10 ? spinHz.toFixed(1) : Math.round(spinHz)} Hz</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Beam tilt:</span>
          <input
            type="range" min={5} max={85} step={1} value={alphaDeg}
            onChange={ev => { const d = +ev.target.value; alphaRef.current = (d * Math.PI) / 180; setAlphaDeg(d) }}
            className="w-24"
            style={{ accentColor: GOLD }}
          />
          <span className="font-mono text-text-secondary">{alphaDeg}°</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary">
          Period <strong className="font-mono" style={{ color: ACCENT }}>{periodMs >= 1 ? periodMs.toFixed(1) : periodMs.toFixed(2)} ms</strong>
          {' · '}
          <strong className="font-mono" style={{ color: seen ? GOLD : PINK }}>{seen ? 'pulses seen' : 'beam misses us'}</strong>
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        The two beams shine <strong>continuously</strong> — the star does not switch on and off. As it rotates, the
        beams sweep around like a lighthouse, and the detector on the right registers a pulse each time a beam crosses
        Earth. The spacing of those pulses <em>is</em> the rotation period. Turn the <strong>spin</strong> up toward
        hundreds of hertz and the ticks crowd together; tilt the <strong>beam</strong> away from our line of sight and
        the cone can miss Earth entirely — a real pulsar we would never see.
      </p>
    </div>
  )
}
