'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 360
const BG = '#0F0D0A'

// plot box for the blackbody curve
const LEFT = 54
const RIGHT = 190 // leaves room for the anisotropy inset on the right
const TOP = 30
const BOTTOM = 300
const PLOT_W = W - LEFT - RIGHT
const PLOT_H = BOTTOM - TOP

const INDIGO = '#818CF8'
const GOLD = '#F59E0B'

// physical constants (SI)
const H_PLANCK = 6.626e-34
const C_LIGHT = 2.998e8
const K_B = 1.381e-23
const WIEN = 2.898e-3 // m·K

// temperature runs from the ~3000 K glow at recombination down to the
// 2.725 K we measure today. z is fixed by 1 + z = T_emit / T_obs.
const T_EMIT = 3000
const T_NOW = 2.725

// wavelength window: 100 nm → 3 cm, on a log axis (peaks slide across it).
const LAM_MIN = 1e-7
const LAM_MAX = 3e-2
const LOG_MIN = Math.log10(LAM_MIN)
const LOG_MAX = Math.log10(LAM_MAX)

const tempAt = (p: number) => T_EMIT * Math.pow(T_NOW / T_EMIT, p) // log-uniform
const xOfLam = (lam: number) => LEFT + ((Math.log10(lam) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * PLOT_W

// Planck spectral radiance (per wavelength), un-normalised.
const planck = (lam: number, T: number) => {
  const a = (2 * H_PLANCK * C_LIGHT * C_LIGHT) / Math.pow(lam, 5)
  const x = (H_PLANCK * C_LIGHT) / (lam * K_B * T)
  return a / (Math.exp(x) - 1)
}

// A fixed anisotropy speckle map (client-only, so Math.random is fine).
const N_CELLS = 12
const anisotropy: number[] = Array.from({ length: N_CELLS * N_CELLS }, () => Math.random() * 2 - 1)

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  pDisplay: { default: 0, min: 0, max: 1, step: 0.001 },
}

export function CMBSpectrumAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const pRef = useRef(0)
  const playingRef = useRef(false)

  const { params, set, permalink, isDefault, restored } = useWidgetParams('c-m-b-spectrum', SPEC)
  const { pDisplay } = params
  const [playing, setPlaying] = useState(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const p = pRef.current
    const T = tempAt(p)
    const z = T_EMIT / T - 1
    const lamPeak = WIEN / T

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    // axes
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(LEFT, TOP); ctx.lineTo(LEFT, BOTTOM); ctx.lineTo(LEFT + PLOT_W, BOTTOM)
    ctx.stroke()

    // visible-light band (380–700 nm) tinted, so the reader can see the peak
    // start near visible/near-IR and slide out to the microwaves.
    const vx0 = xOfLam(3.8e-7)
    const vx1 = xOfLam(7e-7)
    ctx.fillStyle = 'rgba(129,140,248,0.10)'
    ctx.fillRect(vx0, TOP, vx1 - vx0, PLOT_H)
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('visible', (vx0 + vx1) / 2, TOP - 4)
    // microwave region label
    ctx.fillText('microwave', xOfLam(2e-3), TOP - 4)

    // decade wavelength ticks
    const ticks: [number, string][] = [
      [1e-7, '100nm'], [1e-6, '1µm'], [1e-5, '10µm'], [1e-4, '100µm'],
      [1e-3, '1mm'], [1e-2, '1cm'],
    ]
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.font = '9px monospace'
    for (const [lam, label] of ticks) {
      const x = xOfLam(lam)
      ctx.strokeStyle = 'rgba(255,245,235,0.05)'
      ctx.beginPath(); ctx.moveTo(x, TOP); ctx.lineTo(x, BOTTOM); ctx.stroke()
      ctx.fillText(label, x, BOTTOM + 14)
    }
    ctx.fillText('wavelength (log)', LEFT + PLOT_W - 4, BOTTOM + 28)

    // ghost of the original 3000 K curve for reference
    const drawCurve = (temp: number, color: string, width: number, alpha: number) => {
      // normalise each curve to its own peak so the shape stays visible
      const peak = planck(WIEN / temp, temp)
      ctx.strokeStyle = color
      ctx.globalAlpha = alpha
      ctx.lineWidth = width
      ctx.beginPath()
      let started = false
      for (let i = 0; i <= 240; i++) {
        const logLam = LOG_MIN + (i / 240) * (LOG_MAX - LOG_MIN)
        const lam = Math.pow(10, logLam)
        const yFrac = planck(lam, temp) / peak
        const x = LEFT + (i / 240) * PLOT_W
        const y = BOTTOM - yFrac * PLOT_H * 0.9
        if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    drawCurve(T_EMIT, 'rgba(245,158,11,0.35)', 1.5, 1) // the hot glow, fixed
    drawCurve(T, INDIGO, 2.5, 1) // the current, redshifted curve

    // peak marker on the live curve
    const px = xOfLam(lamPeak)
    ctx.strokeStyle = 'rgba(129,140,248,0.5)'
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(px, TOP); ctx.lineTo(px, BOTTOM); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = INDIGO
    ctx.beginPath(); ctx.arc(px, BOTTOM - PLOT_H * 0.9, 4, 0, Math.PI * 2); ctx.fill()

    // readouts
    ctx.textAlign = 'left'
    ctx.fillStyle = INDIGO
    ctx.font = 'bold 16px monospace'
    ctx.fillText(`T = ${T >= 10 ? Math.round(T) : T.toFixed(3)} K`, LEFT + 6, TOP + 16)
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.font = '10px monospace'
    ctx.fillText(`peak λ ≈ ${lamPeak < 1e-4 ? (lamPeak * 1e9).toFixed(0) + ' nm' : (lamPeak * 1e3).toFixed(2) + ' mm'}`, LEFT + 6, TOP + 32)
    ctx.fillStyle = GOLD
    ctx.fillText(`redshift z ≈ ${z < 10 ? z.toFixed(2) : Math.round(z)}`, LEFT + 6, TOP + 46)

    // --- anisotropy inset on the right: the tiny ripples, ~1 part in 100,000 ---
    const IX = LEFT + PLOT_W + 40
    const IY = 70
    const ISIZE = 132
    const cell = ISIZE / N_CELLS
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.font = '9px monospace'
    ctx.fillText('temperature ripples', IX, IY - 18)
    ctx.fillText('ΔT/T ~ 10⁻⁵', IX, IY - 6)
    for (let r = 0; r < N_CELLS; r++) {
      for (let cc = 0; cc < N_CELLS; cc++) {
        const v = anisotropy[r * N_CELLS + cc]
        // warmer = redder/pink, cooler = bluer, all around the same mean
        const col = v >= 0
          ? `rgba(244,114,182,${(0.25 + Math.abs(v) * 0.6).toFixed(3)})`
          : `rgba(96,165,250,${(0.25 + Math.abs(v) * 0.6).toFixed(3)})`
        ctx.fillStyle = col
        ctx.fillRect(IX + cc * cell, IY + r * cell, cell - 0.6, cell - 0.6)
      }
    }
    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.lineWidth = 1
    ctx.strokeRect(IX, IY, ISIZE, ISIZE)
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.font = '8px monospace'
    ctx.fillText('the seeds of galaxies', IX, IY + ISIZE + 14)
  }, [])

  useEffect(() => {
    const loop = () => {
      if (playingRef.current) {
        pRef.current = Math.min(1, pRef.current + 0.004)
        set('pDisplay', pRef.current)
        if (pRef.current >= 1) { playingRef.current = false; setPlaying(false) }
      }
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, set])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { pRef.current = 1; set('pDisplay', 1); return }
      pRef.current = 0
      set('pDisplay', 0)
      playingRef.current = true
      setPlaying(true)
    },
  })

  const toggle = () => {
    if (pRef.current >= 1) { pRef.current = 0; set('pDisplay', 0) }
    playingRef.current = !playingRef.current
    setPlaying(playingRef.current)
  }

  const resetAll = () => {
    playingRef.current = false
    setPlaying(false)
    pRef.current = 0
    set('pDisplay', 0)
    triggerReset()
  }

  const liveT = tempAt(pDisplay)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Run expansion and watch the spectrum cool</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: BG }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={toggle}
          className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:bg-bg-hover transition-colors"
        >
          {playing ? 'Pause' : pDisplay >= 1 ? 'Replay' : 'Expand ▸'}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>then</span>
          <input
            type="range" min={SPEC.pDisplay.min} max={SPEC.pDisplay.max} step={SPEC.pDisplay.step} value={pDisplay}
            onChange={e => {
              playingRef.current = false
              setPlaying(false)
              pRef.current = +e.target.value
              set('pDisplay', pRef.current)
            }}
            className="w-44 accent-accent-indigo"
          />
          <span>now</span>
        </label>
        <span className="ml-auto font-mono text-xs text-text-muted">
          T = <strong className="text-accent-indigo">{liveT >= 10 ? Math.round(liveT) : liveT.toFixed(3)} K</strong>
        </span>
      </div>
    </div>
  )
}
