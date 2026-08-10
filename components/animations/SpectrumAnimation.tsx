'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const X0 = 40                    // left edge of the log scale (long wavelengths)
const BAR_W = 528
const BAR_Y = 118
const BAR_H = 34

const EXP_HI = 3                 // 10^3 m — long radio
const EXP_LO = -13               // 10^-13 m — hard gamma
const DECADES = EXP_HI - EXP_LO  // 16

const ZOOM_X = 200
const ZOOM_W = 300
const ZOOM_Y = 218
const ZOOM_H = 32

const C = 2.99792458e8           // m/s
const HC_EV_M = 1.23984193e-6    // eV·m

// Default sits in the middle of the visible band.
const DEFAULT_P = (EXP_HI - Math.log10(5.5e-7)) / DECADES

const expOfP = (p: number) => EXP_HI - p * DECADES
const xOfExp = (e: number) => X0 + ((EXP_HI - e) / DECADES) * BAR_W

type Band = { name: string; hi: number; color: string }

// hi = the longest wavelength (metres) still inside the band.
const BANDS: Band[] = [
  { name: 'Radio', hi: 1e4, color: '#60A5FA' },
  { name: 'Microwave', hi: 1e-1, color: '#10B981' },
  { name: 'Infrared', hi: 1e-3, color: '#F59E0B' },
  { name: 'Visible', hi: 7.0e-7, color: '#F5F0E8' },
  { name: 'Ultraviolet', hi: 3.8e-7, color: '#A78BFA' },
  { name: 'X-ray', hi: 1e-8, color: '#F472B6' },
  { name: 'Gamma', hi: 1e-11, color: '#FDE68A' },
]

// BANDS runs long-to-short, so the last band whose upper edge still contains
// lam is the one it belongs to.
const bandOf = (lam: number): Band => {
  let found = BANDS[0]
  for (const b of BANDS) { if (lam <= b.hi) found = b }
  return found
}

const SCALES: { m: number; label: string }[] = [
  { m: 1e3, label: 'a kilometre of road' },
  { m: 1e2, label: 'a football pitch' },
  { m: 1e1, label: 'a house' },
  { m: 1.7, label: 'a person' },
  { m: 1e-1, label: 'a hand' },
  { m: 1e-2, label: 'a fingernail' },
  { m: 1e-3, label: 'a grain of sand' },
  { m: 1e-4, label: 'a human hair' },
  { m: 1e-5, label: 'a red blood cell' },
  { m: 1e-6, label: 'a bacterium' },
  { m: 1e-7, label: 'a virus' },
  { m: 1e-9, label: 'the width of a DNA helix' },
  { m: 1e-10, label: 'an atom' },
  { m: 1e-12, label: 'a hundredth of an atom' },
  { m: 1e-14, label: 'an atomic nucleus' },
]

const scaleOf = (lam: number) => {
  let best = SCALES[0]
  let bestD = Infinity
  for (const s of SCALES) {
    const d = Math.abs(Math.log10(lam) - Math.log10(s.m))
    if (d < bestD) { bestD = d; best = s }
  }
  return best
}

const FREQ_UNITS = ['Hz', 'kHz', 'MHz', 'GHz', 'THz', 'PHz', 'EHz', 'ZHz']

const fmtLambda = (lam: number) => {
  if (lam >= 1e3) return `${(lam / 1e3).toFixed(2)} km`
  if (lam >= 1) return `${lam.toFixed(2)} m`
  if (lam >= 1e-2) return `${(lam * 1e2).toFixed(2)} cm`
  if (lam >= 1e-3) return `${(lam * 1e3).toFixed(2)} mm`
  if (lam >= 1e-6) return `${(lam * 1e6).toFixed(2)} µm`
  if (lam >= 1e-9) return `${(lam * 1e9).toFixed(1)} nm`
  if (lam >= 1e-12) return `${(lam * 1e12).toFixed(2)} pm`
  return `${(lam * 1e15).toFixed(2)} fm`
}

const fmtFreq = (f: number) => {
  let i = 0
  let x = f
  while (x >= 1000 && i < FREQ_UNITS.length - 1) { x /= 1000; i++ }
  return `${x < 10 ? x.toFixed(2) : x.toFixed(0)} ${FREQ_UNITS[i]}`
}
const fmtEnergy = (ev: number) => {
  if (ev >= 1e6) return `${(ev / 1e6).toFixed(2)} MeV`
  if (ev >= 1e3) return `${(ev / 1e3).toFixed(2)} keV`
  if (ev >= 1) return `${ev.toFixed(2)} eV`
  if (ev >= 1e-3) return `${(ev * 1e3).toFixed(2)} meV`
  if (ev >= 1e-6) return `${(ev * 1e6).toFixed(2)} µeV`
  return `${(ev * 1e9).toFixed(2)} neV`
}

// Approximate visible-spectrum colour for a wavelength in nm.
function spectrumColor(nm: number): string {
  let r = 0, g = 0, b = 0
  if (nm < 440) { r = (440 - nm) / 60; b = 1 }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1 }
  else if (nm < 510) { g = 1; b = (510 - nm) / 20 }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1 }
  else if (nm < 645) { r = 1; g = (645 - nm) / 65 }
  else { r = 1 }
  let fade = 1
  if (nm < 420) fade = 0.3 + (0.7 * (nm - 380)) / 40
  else if (nm > 700) fade = 0.3 + (0.7 * (750 - nm)) / 50
  const ch = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v)) * fade)
  return `rgb(${ch(r)},${ch(g)},${ch(b)})`
}

export function SpectrumAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setP(DEFAULT_P); return }
      setP(0)
      setSweeping(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [p, setP] = useState(DEFAULT_P)
  const [sweeping, setSweeping] = useState(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    const lam = Math.pow(10, expOfP(p))
    const band = bandOf(lam)

    // ---- the log bar, painted column by column ----
    for (let px = 0; px < BAR_W; px++) {
      const l = Math.pow(10, expOfP(px / BAR_W))
      const b = bandOf(l)
      ctx.fillStyle = b.name === 'Visible' ? spectrumColor(l * 1e9) : b.color
      ctx.globalAlpha = b.name === 'Visible' ? 1 : 0.72
      ctx.fillRect(X0 + px, BAR_Y, 1, BAR_H)
    }
    ctx.globalAlpha = 1
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(X0 + 0.5, BAR_Y + 0.5, BAR_W - 1, BAR_H - 1)

    // Band names above the bar
    ctx.textAlign = 'center'
    for (let i = 0; i < BANDS.length; i++) {
      const b = BANDS[i]
      const loEdge = i + 1 < BANDS.length ? BANDS[i + 1].hi : Math.pow(10, EXP_LO - 1)
      const xa = xOfExp(Math.min(EXP_HI, Math.log10(b.hi)))
      const xb = xOfExp(Math.max(EXP_LO, Math.log10(loEdge)))
      if (xb - xa < 34) continue
      ctx.fillStyle = b.color
      ctx.globalAlpha = 0.85
      ctx.fillText(b.name, (xa + xb) / 2, BAR_Y - 8)
      ctx.globalAlpha = 1
      if (i > 0) {
        ctx.strokeStyle = 'rgba(15,13,10,0.7)'
        ctx.beginPath(); ctx.moveTo(xa, BAR_Y); ctx.lineTo(xa, BAR_Y + BAR_H); ctx.stroke()
      }
    }

    // Decade ticks below
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    for (let e = EXP_HI; e >= EXP_LO; e -= 2) {
      const x = xOfExp(e)
      ctx.strokeStyle = 'rgba(255,245,235,0.18)'
      ctx.beginPath(); ctx.moveTo(x, BAR_Y + BAR_H); ctx.lineTo(x, BAR_Y + BAR_H + 5); ctx.stroke()
      ctx.fillText(`10^${e} m`, x, BAR_Y + BAR_H + 16)
    }
    ctx.textAlign = 'left'

    // ---- the visible sliver, blown up ----
    const vx0 = xOfExp(Math.log10(7.0e-7))
    const vx1 = xOfExp(Math.log10(3.8e-7))
    ctx.strokeStyle = 'rgba(245,240,232,0.35)'
    ctx.beginPath()
    ctx.moveTo(vx0, BAR_Y + BAR_H); ctx.lineTo(ZOOM_X, ZOOM_Y)
    ctx.moveTo(vx1, BAR_Y + BAR_H); ctx.lineTo(ZOOM_X + ZOOM_W, ZOOM_Y)
    ctx.stroke()

    for (let px = 0; px < ZOOM_W; px++) {
      const nm = 700 - (px / ZOOM_W) * (700 - 380)
      ctx.fillStyle = spectrumColor(nm)
      ctx.fillRect(ZOOM_X + px, ZOOM_Y, 1, ZOOM_H)
    }
    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.strokeRect(ZOOM_X + 0.5, ZOOM_Y + 0.5, ZOOM_W - 1, ZOOM_H - 1)
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('700 nm', ZOOM_X, ZOOM_Y + ZOOM_H + 14)
    ctx.fillText('380 nm', ZOOM_X + ZOOM_W - 44, ZOOM_Y + ZOOM_H + 14)
    ctx.fillText('everything you have ever seen, magnified out of one 8-pixel sliver', ZOOM_X - 128, ZOOM_Y - 10)

    // ---- marker ----
    const mx = xOfExp(expOfP(p))
    ctx.strokeStyle = '#F59E0B'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(mx, BAR_Y - 22); ctx.lineTo(mx, BAR_Y + BAR_H + 6); ctx.stroke()
    ctx.fillStyle = '#F59E0B'
    ctx.beginPath()
    ctx.moveTo(mx, BAR_Y - 4); ctx.lineTo(mx - 5, BAR_Y - 13); ctx.lineTo(mx + 5, BAR_Y - 13)
    ctx.closePath(); ctx.fill()

    // ---- readout ----
    const f = C / lam
    const ev = HC_EV_M / lam
    const s = scaleOf(lam)

    ctx.fillStyle = 'rgba(255,245,235,0.04)'
    ctx.fillRect(X0, 14, BAR_W, 74)
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.lineWidth = 1
    ctx.strokeRect(X0 + 0.5, 14.5, BAR_W - 1, 73)

    ctx.font = 'bold 16px monospace'
    ctx.fillStyle = band.color
    ctx.fillText(band.name, X0 + 14, 38)

    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('wavelength', X0 + 14, 58)
    ctx.fillText('frequency', X0 + 148, 58)
    ctx.fillText('photon energy', X0 + 292, 58)
    ctx.fillStyle = '#F5F0E8'
    ctx.fillText(fmtLambda(lam), X0 + 14, 74)
    ctx.fillText(fmtFreq(f), X0 + 148, 74)
    ctx.fillText(fmtEnergy(ev), X0 + 292, 74)

    ctx.fillStyle = 'rgba(167,139,250,0.95)'
    ctx.fillText(`≈ ${s.label}`, X0 + 292, 38)
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('one crest to the next is about the size of…', X0 + 292, 24)

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('same equations, same speed, same phenomenon — only λ changes', X0, H - 8)
  }, [p])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!sweeping) return
    const step = () => {
      setP(prev => {
        if (prev >= 1) { setSweeping(false); return 1 }
        return Math.min(1, Math.round((prev + 0.004) * 1000) / 1000)
      })
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [sweeping])

  const resetAll = () => {
    triggerReset()
    setSweeping(false)
    setP(DEFAULT_P)
  }

  const lam = Math.pow(10, expOfP(p))

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · One phenomenon, sixteen decades</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: One phenomenon, sixteen decades. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Wavelength:</span>
          <input
            type="range" min={0} max={1} step={0.002} value={p}
            onChange={e => { setP(+e.target.value); setSweeping(false) }}
            className="w-48 accent-accent-gold"
          />
          <span className="text-text-secondary font-medium">{fmtLambda(lam)}</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary">
          band: <strong className="text-accent-gold">{bandOf(lam).name}</strong>
          {'  ·  '}
          <strong className="text-accent-violet">{fmtEnergy(HC_EV_M / lam)}</strong> per photon
        </span>
      </div>
    </div>
  )
}
