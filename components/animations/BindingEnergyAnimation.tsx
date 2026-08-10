'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 260
const PAD = { left: 46, right: 16, top: 20, bottom: 34 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const A_MAX = 240
const BE_MAX = 9.2
const PEAK_A = 56
const PEAK_BE = 8.79 // iron-56, MeV per nucleon

const GREEN = '#10B981'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'

// Real binding-energy-per-nucleon anchors (MeV), including the low-A zig-zag
// (the He-4 spike) and the broad peak at iron. Curve is linearly interpolated
// between these, which is plenty smooth at this scale.
const ANCHORS: [number, number][] = [
  [1, 0], [2, 1.112], [3, 2.827], [4, 7.074], [6, 5.332], [7, 5.606],
  [9, 6.463], [12, 7.680], [16, 7.976], [20, 8.032], [24, 8.261],
  [28, 8.448], [32, 8.493], [40, 8.551], [48, 8.666], [56, 8.790],
  [62, 8.795], [75, 8.705], [92, 8.517], [120, 8.505], [141, 8.326],
  [165, 8.120], [197, 7.906], [209, 7.848], [235, 7.591], [238, 7.570],
]

function beOf(A: number): number {
  if (A <= ANCHORS[0][0]) return ANCHORS[0][1]
  const last = ANCHORS[ANCHORS.length - 1]
  if (A >= last[0]) return last[1]
  for (let i = 1; i < ANCHORS.length; i++) {
    const [a1, b1] = ANCHORS[i]
    if (A <= a1) {
      const [a0, b0] = ANCHORS[i - 1]
      const t = (A - a0) / (a1 - a0)
      return b0 + t * (b1 - b0)
    }
  }
  return last[1]
}

type Nucleus = { sym: string; name: string; A: number; be: number; color: string }

// be values are the interpolated curve height so the marker sits exactly on the line.
const NUCLEI: Nucleus[] = [
  { sym: '²H', name: 'Deuterium', A: 2, be: beOf(2), color: BLUE },
  { sym: '⁴He', name: 'Helium-4', A: 4, be: beOf(4), color: BLUE },
  { sym: '¹²C', name: 'Carbon-12', A: 12, be: beOf(12), color: VIOLET },
  { sym: '⁵⁶Fe', name: 'Iron-56', A: 56, be: beOf(56), color: GOLD },
  { sym: '⁹²Kr', name: 'Krypton-92', A: 92, be: beOf(92), color: PINK },
  { sym: '²³⁵U', name: 'Uranium-235', A: 235, be: beOf(235), color: PINK },
]

export function BindingEnergyAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      setSel(5)
      if (reduced) { setT(1); setRunning(false); return }
      setT(0); setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [sel, setSel] = useState(5) // uranium-235
  const [t, setT] = useState(1) // 0 = at nucleus, 1 = arrived at iron
  const [running, setRunning] = useState(false)

  const xA = useCallback((A: number) => PAD.left + (A / A_MAX) * PLOT_W, [])
  const yBE = useCallback((be: number) => PAD.top + PLOT_H - (be / BE_MAX) * PLOT_H, [])

  const nuc = NUCLEI[sel]
  const isPeak = nuc.A === PEAK_A
  const process = isPeak ? 'peak' : nuc.A < PEAK_A ? 'fusion' : 'fission'
  const dBePerNucleon = PEAK_BE - nuc.be
  const energyToIron = dBePerNucleon * nuc.A // MeV per nucleus, idealized ceiling

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // axes
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()

    // iron peak baseline
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(245,158,11,0.4)'
    ctx.beginPath()
    ctx.moveTo(PAD.left, yBE(PEAK_BE))
    ctx.lineTo(PAD.left + PLOT_W, yBE(PEAK_BE))
    ctx.stroke()
    ctx.setLineDash([])

    // axis labels
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '10px monospace'
    ctx.fillText('binding energy / nucleon (MeV)', PAD.left - 2, PAD.top - 7)
    ctx.fillText('mass number A →', PAD.left + PLOT_W - 108, PAD.top + PLOT_H + 24)
    ctx.textAlign = 'right'
    ctx.fillText('9', PAD.left - 6, yBE(9) + 3)
    ctx.fillText('8', PAD.left - 6, yBE(8) + 3)
    ctx.fillText('4', PAD.left - 6, yBE(4) + 3)
    ctx.fillText('0', PAD.left - 6, yBE(0) + 3)
    ctx.textAlign = 'left'
    for (const a of [50, 100, 150, 200]) {
      ctx.fillStyle = 'rgba(245,240,232,0.28)'
      ctx.fillText(`${a}`, xA(a) - 7, PAD.top + PLOT_H + 14)
    }

    // the curve
    ctx.strokeStyle = GREEN
    ctx.lineWidth = 2.5
    ctx.beginPath()
    let started = false
    for (let A = 1; A <= A_MAX; A += 1) {
      const px = xA(A), py = yBE(beOf(A))
      if (!started) { ctx.moveTo(px, py); started = true }
      else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // iron peak marker + label
    ctx.fillStyle = GOLD
    ctx.beginPath(); ctx.arc(xA(PEAK_A), yBE(PEAK_BE), 4, 0, Math.PI * 2); ctx.fill()
    ctx.font = 'bold 10px monospace'
    ctx.fillText('⁵⁶Fe — most stable', xA(PEAK_A) + 8, yBE(PEAK_BE) - 6)

    // selected nucleus point
    const sx = xA(nuc.A), sy = yBE(nuc.be)
    ctx.fillStyle = nuc.color
    ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(255,245,235,0.25)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, PAD.top + PLOT_H); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = nuc.color
    ctx.font = 'bold 11px monospace'
    const labelX = nuc.A > 180 ? sx - 30 : sx + 8
    ctx.fillText(nuc.sym, labelX, sy + 16)

    // travelling marker climbing the curve toward iron (the energy release)
    if (!isPeak) {
      const curA = nuc.A + (PEAK_A - nuc.A) * t
      const mx = xA(curA), my = yBE(beOf(curA))
      // trail along the curve from nucleus to current position
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 3
      ctx.beginPath()
      let s2 = false
      const step = nuc.A < PEAK_A ? 0.5 : -0.5
      for (let A = nuc.A; step > 0 ? A <= curA : A >= curA; A += step) {
        const px = xA(A), py = yBE(beOf(A)) - 1
        if (!s2) { ctx.moveTo(px, py); s2 = true } else ctx.lineTo(px, py)
      }
      ctx.stroke()
      const grd = ctx.createRadialGradient(mx, my, 0, mx, my, 13)
      grd.addColorStop(0, 'rgba(245,158,11,0.5)')
      grd.addColorStop(1, 'rgba(245,158,11,0)')
      ctx.beginPath(); ctx.arc(mx, my, 13, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill()
      ctx.fillStyle = GOLD
      ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill()
    }
  }, [nuc, t, isPeak, xA, yBE])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    let raf = 0
    const step = () => {
      setT(prev => {
        if (prev >= 1) { setRunning(false); return 1 }
        return Math.min(prev + 0.02, 1)
      })
      raf = requestAnimationFrame(() => setTimeout(step, 30))
    }
    raf = requestAnimationFrame(() => setTimeout(step, 30))
    return () => cancelAnimationFrame(raf)
  }, [running])

  const pick = (i: number) => {
    setSel(i)
    setT(0)
    setRunning(NUCLEI[i].A !== PEAK_A)
  }

  const reset = () => {
    triggerReset()
    setRunning(false)
    setSel(5)
    setT(1)
  }

  const label =
    process === 'peak'
      ? 'Iron-56 sits at the summit — nothing to gain by splitting or fusing.'
      : process === 'fusion'
        ? 'Light nucleus → fusing toward iron climbs the curve and releases energy.'
        : 'Heavy nucleus → splitting toward iron climbs the curve and releases energy.'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Binding energy per nucleon</span>
        <button onClick={reset} className="text-xs text-text-muted hover:text-text-secondary transition-colors">Reset</button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {NUCLEI.map((n, i) => (
            <button key={n.sym} onClick={() => pick(i)}
              className={`px-2.5 py-1.5 font-mono transition-colors ${sel === i ? 'bg-accent-teal text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {n.sym}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        <strong className="text-text-secondary font-mono">{nuc.name}</strong> ·
        BE/A = <strong className="text-accent-teal font-mono">{nuc.be.toFixed(2)}</strong> MeV. {label}
        {!isPeak && (
          <>
            {' '}Climbing to iron-56 frees up to{' '}
            <strong className="text-accent-gold font-mono">{Math.round(energyToIron)}</strong> MeV per nucleus
            (<strong className="text-accent-gold font-mono">{dBePerNucleon.toFixed(2)}</strong> MeV × {nuc.A} nucleons).
          </>
        )}
      </p>
    </div>
  )
}
