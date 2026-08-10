'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 280
const PAD = { left: 48, right: 20, top: 18, bottom: 38 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
const PO2_MAX = 100 // mmHg on the x-axis

const PINK = '#F472B6'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const GREEN = '#10B981'

const N_HILL = 2.7 // cooperativity exponent
const P50_NORMAL = 26 // mmHg
const P50_BOHR = 36 // mmHg — right-shifted by CO2 / low pH

// Hill equation: fractional saturation of hemoglobin at a given pO2.
const sat = (pO2: number, p50: number) => {
  const x = Math.pow(Math.max(0, pO2), N_HILL)
  return x / (Math.pow(p50, N_HILL) + x)
}

const LUNG_PO2 = 100 // alveolar / arterial
const TISSUE_PO2 = 40 // resting tissue

export function HemoglobinAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pO2, setPO2] = useState(LUNG_PO2)
  const [bohr, setBohr] = useState(false)
  const [running, setRunning] = useState(false)
  const runRef = useRef(false)
  useEffect(() => { runRef.current = running })

  const p50 = bohr ? P50_BOHR : P50_NORMAL

  const x = useCallback((v: number) => PAD.left + (v / PO2_MAX) * PLOT_W, [])
  const y = useCallback((s: number) => PAD.top + PLOT_H - s * PLOT_H, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const curP50 = bohr ? P50_BOHR : P50_NORMAL
    ctx.clearRect(0, 0, W, H)

    // grid + axes
    ctx.strokeStyle = 'rgba(255,245,235,0.06)'
    ctx.lineWidth = 1
    for (let s = 0; s <= 100; s += 20) {
      const yy = y(s / 100)
      ctx.beginPath(); ctx.moveTo(PAD.left, yy); ctx.lineTo(PAD.left + PLOT_W, yy); ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    for (let s = 0; s <= 100; s += 20) ctx.fillText(`${s}`, PAD.left - 6, y(s / 100) + 3)
    ctx.textAlign = 'center'
    for (let p = 0; p <= 100; p += 20) ctx.fillText(`${p}`, x(p), PAD.top + PLOT_H + 16)
    ctx.fillText('blood pO₂ (mmHg)', PAD.left + PLOT_W / 2, PAD.top + PLOT_H + 32)
    ctx.save()
    ctx.translate(14, PAD.top + PLOT_H / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('Hb saturation (%)', 0, 0)
    ctx.restore()

    // faint reference: the un-shifted normal curve, when Bohr is on
    if (bohr) {
      ctx.strokeStyle = 'rgba(244,114,182,0.28)'
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let p = 0; p <= PO2_MAX; p++) {
        const yy = y(sat(p, P50_NORMAL))
        if (p === 0) ctx.moveTo(x(p), yy); else ctx.lineTo(x(p), yy)
      }
      ctx.stroke()
      ctx.setLineDash([])
    }

    // the S-shaped dissociation curve
    ctx.strokeStyle = bohr ? GOLD : PINK
    ctx.lineWidth = 2.5
    ctx.beginPath()
    for (let p = 0; p <= PO2_MAX; p++) {
      const yy = y(sat(p, curP50))
      if (p === 0) ctx.moveTo(x(p), yy); else ctx.lineTo(x(p), yy)
    }
    ctx.stroke()

    // P50 marker (50% saturation)
    const p50x = x(curP50)
    const p50y = y(0.5)
    ctx.strokeStyle = 'rgba(245,240,232,0.25)'
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(p50x, y(0)); ctx.lineTo(p50x, p50y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(PAD.left, p50y); ctx.lineTo(p50x, p50y); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.textAlign = 'left'
    ctx.fillText(`P₅₀ ${Math.round(curP50)}`, p50x + 5, p50y - 5)

    // lung (load) and tissue (unload) operating points
    const points: [number, string, string][] = [
      [LUNG_PO2, GREEN, 'lungs'],
      [TISSUE_PO2, BLUE, 'tissue'],
    ]
    for (const [p, col, label] of points) {
      const s = sat(p, curP50)
      ctx.fillStyle = col
      ctx.beginPath(); ctx.arc(x(p), y(s), 4, 0, Math.PI * 2); ctx.fill()
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`${label} ${Math.round(s * 100)}%`, x(p), y(s) - 9)
    }

    // the "unloaded" gap between lungs and tissue
    const sLung = sat(LUNG_PO2, curP50)
    const sTissue = sat(TISSUE_PO2, curP50)
    ctx.strokeStyle = 'rgba(96,165,250,0.5)'
    ctx.setLineDash([2, 3])
    ctx.beginPath(); ctx.moveTo(x(TISSUE_PO2), y(sLung)); ctx.lineTo(x(TISSUE_PO2), y(sTissue)); ctx.stroke()
    ctx.setLineDash([])

    // current draggable point
    const sCur = sat(pO2, curP50)
    ctx.strokeStyle = 'rgba(245,240,232,0.3)'
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(x(pO2), y(0)); ctx.lineTo(x(pO2), y(sCur)); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = bohr ? GOLD : PINK
    ctx.beginPath(); ctx.arc(x(pO2), y(sCur), 6, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#0F0D0A'
    ctx.beginPath(); ctx.arc(x(pO2), y(sCur), 2.5, 0, Math.PI * 2); ctx.fill()

    ctx.fillStyle = bohr ? GOLD : PINK
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`${Math.round(sCur * 100)}% at ${Math.round(pO2)} mmHg`, x(pO2) + 10, Math.max(PAD.top + 12, y(sCur) - 8))
  }, [pO2, bohr, x, y])

  useEffect(() => { draw() }, [draw])

  // on trigger, sweep the point from the lungs down to the tissues once
  useEffect(() => {
    if (!running) return
    let raf = 0
    const step = () => {
      setPO2(prev => {
        if (prev <= TISSUE_PO2) { setRunning(false); return TISSUE_PO2 }
        return prev - 1
      })
      raf = requestAnimationFrame(() => setTimeout(step, 30))
    }
    raf = requestAnimationFrame(() => setTimeout(step, 30))
    return () => cancelAnimationFrame(raf)
  }, [running])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setPO2(TISSUE_PO2); return }
      setPO2(LUNG_PO2)
      setRunning(true)
    },
  })

  const reset = () => {
    triggerReset()
    setRunning(false)
    setBohr(false)
    setPO2(LUNG_PO2)
  }

  const delivered = Math.round((sat(LUNG_PO2, p50) - sat(TISSUE_PO2, p50)) * 100)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Oxygen–hemoglobin dissociation curve
        </span>
        <button
          onClick={reset}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>pO₂:</span>
          <input
            type="range" min={0} max={PO2_MAX} step={1} value={pO2}
            onChange={e => { setPO2(+e.target.value); setRunning(false) }}
            className="w-40 accent-accent-pink"
          />
          <span className="text-text-secondary font-mono">{pO2}</span>
        </label>
        <button
          onClick={() => setBohr(b => !b)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            bohr ? 'bg-accent-pink text-bg-base' : 'bg-white/5 text-text-secondary hover:bg-white/10'
          }`}
        >
          Bohr shift: {bohr ? 'on' : 'off'}
        </button>
        <span className="ml-auto text-xs text-text-secondary">
          delivered lungs→tissue <strong style={{ color: bohr ? GOLD : PINK }}>{delivered}%</strong>
        </span>
      </div>
    </div>
  )
}
