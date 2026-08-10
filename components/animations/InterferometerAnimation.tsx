'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 340

// Schematic L-shaped interferometer. A laser hits a beam splitter, runs down two
// perpendicular arms, reflects off end mirrors, recombines, and lands on a
// photodetector. A passing gravitational wave lengthens one arm while shortening
// the other; that differential change shifts the interference and shows up as a
// signal. This is a cartoon of the geometry, NOT a precise optical simulation.
const BS_X = 210 // beam splitter
const BS_Y = 150
const XM_X = 500 // x-arm end mirror (nominal)
const YM_Y = 40 // y-arm end mirror (nominal)
const LASER_X = 60
const DET_Y = 288 // photodetector

const ARM_KM = 4 // real LIGO arm length
const BASE_STRAIN = 1e-21 // representative strain of a strong event
const DISP = 13 // px of mirror motion drawn per unit normalized strain (exaggerated)

const OMEGA = 2.4 // rad/s of the injected wave on screen

const ACCENT = '#818CF8' // indigo
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const GREEN = '#10B981'
const PINK = '#F472B6'
const CYAN = '#22D3EE'

const HISTORY_MAX = 210
const TX0 = 300
const TX1 = 560
const DXT = (TX1 - TX0) / HISTORY_MAX

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  amp: { default: 3, min: 0, max: 5, step: 0.5 },
}

export function InterferometerAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number | null>(null)
  const tRef = useRef(0)
  const inHistRef = useRef<number[]>([])
  const outHistRef = useRef<number[]>([])

  const [running, setRunning] = useState(false)
  const [waveOn, setWaveOn] = useState(true)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('interferometer', SPEC)
  const { amp } = params
  const [sNow, setSNow] = useState(0)

  const waveRef = useRef(waveOn)
  const ampRef = useRef(amp)
  useEffect(() => { waveRef.current = waveOn }, [waveOn])
  useEffect(() => { ampRef.current = amp }, [amp])

  const push = (arr: number[], v: number) => { arr.push(v); if (arr.length > HISTORY_MAX) arr.shift() }

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    const t = tRef.current
    // Normalized strain of the passing wave in [-ampNorm, ampNorm].
    const ampNorm = waveRef.current ? ampRef.current / 5 : 0
    const s = ampNorm * Math.sin(OMEGA * t)

    // Differential arm displacement: x-arm gets longer, y-arm shorter (and back).
    const xmX = XM_X + DISP * s
    const ymY = YM_Y - DISP * s

    // laser beam dashes (animated)
    const dash = (t * 60) % 12
    ctx.setLineDash([6, 6])
    ctx.lineDashOffset = -dash

    // incoming laser -> beam splitter
    ctx.strokeStyle = GREEN; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(LASER_X + 18, BS_Y); ctx.lineTo(BS_X, BS_Y); ctx.stroke()
    // x-arm
    ctx.strokeStyle = ACCENT
    ctx.beginPath(); ctx.moveTo(BS_X, BS_Y); ctx.lineTo(xmX, BS_Y); ctx.stroke()
    // y-arm
    ctx.strokeStyle = BLUE
    ctx.beginPath(); ctx.moveTo(BS_X, BS_Y); ctx.lineTo(BS_X, ymY); ctx.stroke()
    // recombined -> detector
    ctx.strokeStyle = GOLD
    ctx.beginPath(); ctx.moveTo(BS_X, BS_Y); ctx.lineTo(BS_X, DET_Y); ctx.stroke()
    ctx.setLineDash([]); ctx.lineDashOffset = 0

    // laser source
    ctx.fillStyle = GREEN
    ctx.fillRect(LASER_X - 16, BS_Y - 9, 30, 18)
    ctx.fillStyle = '#0F0D0A'
    ctx.font = 'bold 9px monospace'
    ctx.fillText('LASER', LASER_X - 13, BS_Y + 3)
    ctx.font = '10px monospace'

    // beam splitter (45° square)
    ctx.save()
    ctx.translate(BS_X, BS_Y); ctx.rotate(Math.PI / 4)
    ctx.fillStyle = 'rgba(245,240,232,0.25)'
    ctx.fillRect(-9, -2, 18, 4)
    ctx.strokeStyle = 'rgba(245,240,232,0.6)'; ctx.lineWidth = 1
    ctx.strokeRect(-9, -2, 18, 4)
    ctx.restore()
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('beam splitter', BS_X - 74, BS_Y - 8)

    // end mirrors
    const mirror = (x: number, y: number, vertical: boolean, col: string) => {
      ctx.strokeStyle = col; ctx.lineWidth = 3
      ctx.beginPath()
      if (vertical) { ctx.moveTo(x + 6, y - 12); ctx.lineTo(x + 6, y + 12) }
      else { ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12) }
      ctx.stroke()
    }
    mirror(xmX, BS_Y, true, ACCENT)
    mirror(BS_X, ymY, false, BLUE)

    // nominal (rest) mirror positions, faint dashed — so the shift is visible
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1; ctx.setLineDash([2, 3])
    ctx.beginPath(); ctx.moveTo(XM_X + 6, BS_Y - 14); ctx.lineTo(XM_X + 6, BS_Y + 14); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(BS_X - 14, YM_Y); ctx.lineTo(BS_X + 14, YM_Y); ctx.stroke()
    ctx.setLineDash([])

    // arm labels
    ctx.fillStyle = ACCENT
    ctx.fillText(`x-arm  ${ARM_KM} km`, 300, BS_Y - 8)
    ctx.save(); ctx.translate(BS_X - 12, 100); ctx.rotate(-Math.PI / 2)
    ctx.fillStyle = BLUE; ctx.fillText(`y-arm  ${ARM_KM} km`, 0, 0); ctx.restore()

    // photodetector + brightness (interference output)
    const bright = 0.5 * (1 - Math.cos(Math.PI * 0.5 + 6 * s)) // schematic fringe response
    ctx.fillStyle = `rgba(244,114,182,${(0.25 + 0.7 * bright).toFixed(3)})`
    ctx.beginPath(); ctx.arc(BS_X, DET_Y, 13, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = PINK; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(BS_X, DET_Y, 13, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('photodetector', BS_X - 38, DET_Y + 26)

    // ---- traces: injected wave (in) vs detector signal (out) ----
    const gx0 = TX0, gy0 = 214, gh = 108
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'; ctx.lineWidth = 1
    ctx.strokeRect(gx0 + 0.5, gy0 + 0.5, TX1 - TX0, gh)
    const midIn = gy0 + 28
    const midOut = gy0 + 82
    for (const my of [midIn, midOut]) {
      ctx.strokeStyle = 'rgba(255,245,235,0.14)'
      ctx.beginPath(); ctx.moveTo(gx0, my); ctx.lineTo(TX1, my); ctx.stroke()
    }

    const drawTrace = (arr: number[], mid: number, col: string) => {
      ctx.strokeStyle = col; ctx.lineWidth = 1.75
      ctx.beginPath()
      arr.forEach((v, i) => {
        const x = TX0 + i * DXT
        const y = mid - v * 20
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
    drawTrace(inHistRef.current, midIn, CYAN)
    drawTrace(outHistRef.current, midOut, GOLD)
    ctx.fillStyle = CYAN; ctx.fillText('passing wave h(t)', gx0 + 6, gy0 + 12)
    ctx.fillStyle = GOLD; ctx.fillText('detector signal', gx0 + 6, gy0 + 66)

    setSNow(s)
  }, [])

  const advance = useCallback((dt: number) => {
    tRef.current += dt
    const ampNorm = waveRef.current ? ampRef.current / 5 : 0
    const s = ampNorm * Math.sin(OMEGA * tRef.current)
    push(inHistRef.current, s)
    // Detector output tracks the differential arm change (linear regime).
    push(outHistRef.current, 2 * s)
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
    onTrigger: reduced => { if (!reduced) setRunning(true) },
  })

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setWaveOn(true)
    set('amp', 3)
    tRef.current = 0
    inHistRef.current = []
    outHistRef.current = []
    lastRef.current = null
    render()
  }

  // Real differential length change: ΔL = strain × arm length.
  const deltaL = BASE_STRAIN * (amp / 5) * ARM_KM * 1000 // metres

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Measuring the strain with two arms</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
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
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={() => setWaveOn(w => !w)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: waveOn ? GOLD : 'rgba(255,245,235,0.12)', color: waveOn ? '#0F0D0A' : 'inherit' }}
        >
          {waveOn ? 'Wave injected' : 'Inject wave'}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>strain:</span>
          <input type="range" min={SPEC.amp.min} max={SPEC.amp.max} step={SPEC.amp.step} value={amp}
            onChange={e => set('amp', +e.target.value)}
            className="w-28" style={{ accentColor: ACCENT }} />
          <span className="font-mono text-text-secondary">{(amp * 0.2).toFixed(1)}×10⁻²¹</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary">
          differential shift <strong className="font-mono" style={{ color: sNow >= 0 ? ACCENT : BLUE }}>{sNow >= 0 ? '+' : '−'}</strong>
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        The laser is split down two perpendicular {ARM_KM}-km arms and recombined at the detector. Inject a wave and watch
        one arm lengthen while the other shortens — the recombined light shifts and the detector reads out a signal that
        tracks that <strong>differential</strong> arm change. For a strain of {(amp * 0.2).toFixed(1)}×10⁻²¹ the real arm
        actually moves <strong className="font-mono" style={{ color: GOLD }}>ΔL ≈ {deltaL.toExponential(1)} m</strong> —
        far less than the width of a proton. The mirror motion here is wildly exaggerated to be visible; this is a schematic,
        not a precise optical simulation.
      </p>
    </div>
  )
}
