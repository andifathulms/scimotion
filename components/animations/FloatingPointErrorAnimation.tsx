'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 240

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const TEAL = '#2DD4BF'
const ORANGE = '#FB923C'
const PINK = '#F472B6'
const DIM = 'rgba(245,240,232,0.42)'
const FAINT = 'rgba(255,245,235,0.12)'

// Everything below is REAL IEEE-754 double arithmetic — deterministic, the same
// on every machine, every run. No randomness, no time.
const A = 0.1
const B = 0.2
const SUM = A + B // 0.30000000000000004
const C = 0.3 // the nearest representable double to the real 0.3

// exact gap to the next representable double above x (one ulp)
function ulp(x: number): number {
  const dv = new DataView(new ArrayBuffer(8))
  dv.setFloat64(0, x)
  let hi = dv.getUint32(0)
  let lo = dv.getUint32(4)
  lo = (lo + 1) >>> 0
  if (lo === 0) hi = (hi + 1) >>> 0
  dv.setUint32(0, hi)
  dv.setUint32(4, lo)
  return dv.getFloat64(0) - x
}

const U = ulp(C) // ≈ 5.551e-17, the spacing between doubles near 0.3

const STEPS = [
  'Enter the decimal 0.1 — it cannot be stored exactly',
  'Enter the decimal 0.2 — it cannot be stored exactly either',
  'Add the two stored values: the result rounds to 0.30000000000000004',
  'Compare with the double nearest 0.3 — they differ by exactly one ulp',
] as const

export function FloatingPointErrorAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [step, setStep] = useState(STEPS.length - 1)
  const [playing, setPlaying] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setStep(STEPS.length - 1)
        return
      }
      setStep(0)
      setPlaying(true)
    },
  })

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let frames = 0
    const loop = () => {
      frames += 1
      if (frames % 70 === 0) {
        setStep(prev => {
          if (prev >= STEPS.length - 1) {
            setPlaying(false)
            return prev
          }
          return prev + 1
        })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'

    // caption
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = BLUE
    ctx.fillText(`Step ${step + 1}/${STEPS.length}`, 16, 22)
    ctx.fillStyle = DIM
    ctx.font = '11px monospace'
    ctx.fillText(STEPS[step], 66, 22)

    // ---- rows for 0.1, 0.2, sum ----
    const rowY = (r: number) => 54 + r * 30
    const drawRow = (
      r: number,
      label: string,
      requested: string,
      stored: string,
      color: string,
      show: boolean
    ) => {
      if (!show) return
      ctx.font = '12px monospace'
      ctx.fillStyle = color
      ctx.fillText(label, 16, rowY(r) + 4)
      ctx.fillStyle = DIM
      ctx.fillText(requested, 70, rowY(r) + 4)
      ctx.fillStyle = 'rgba(245,240,232,0.7)'
      ctx.fillText('→ stored as', 150, rowY(r) + 4)
      ctx.fillStyle = color
      ctx.fillText(stored, 250, rowY(r) + 4)
    }

    drawRow(0, '0.1', 'asked', A.toPrecision(18), TEAL, step >= 0)
    drawRow(1, '0.2', 'asked', B.toPrecision(18), GOLD, step >= 1)
    if (step >= 2) {
      ctx.font = '12px monospace'
      ctx.fillStyle = ORANGE
      ctx.fillText('0.1+0.2', 16, rowY(2) + 4)
      ctx.fillStyle = DIM
      ctx.fillText('=', 70, rowY(2) + 4)
      ctx.fillStyle = ORANGE
      ctx.fillText(SUM.toString(), 90, rowY(2) + 4)
    }
    if (step >= 3) {
      ctx.font = '12px monospace'
      ctx.fillStyle = PINK
      ctx.fillText('0.3', 16, rowY(3) + 4)
      ctx.fillStyle = DIM
      ctx.fillText('stored as', 70, rowY(3) + 4)
      ctx.fillStyle = PINK
      ctx.fillText(C.toString(), 150, rowY(3) + 4)
    }

    // ---- number-line zoom around 0.3 ----
    const axisY = 190
    const x0 = 40
    const x1 = W - 40
    // window spans C ± 2.5 ulp so a few representable ticks fit
    const half = 2.5 * U
    const lo = C - half
    const px = (v: number) => x0 + ((v - lo) / (2 * half)) * (x1 - x0)

    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x0, axisY)
    ctx.lineTo(x1, axisY)
    ctx.stroke()

    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = BLUE
    ctx.textAlign = 'left'
    ctx.fillText('representable doubles near 0.3 (ticks 1 ulp apart)', x0, axisY - 46)

    // representable ticks (C + k·ulp)
    for (let k = -2; k <= 2; k++) {
      const v = C + k * U
      const xx = px(v)
      ctx.strokeStyle = 'rgba(96,165,250,0.4)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(xx, axisY - 8)
      ctx.lineTo(xx, axisY + 8)
      ctx.stroke()
    }

    // marker: nearest double to 0.3 (== C, at k=0)
    const cx = px(C)
    ctx.strokeStyle = PINK
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx, axisY - 26)
    ctx.lineTo(cx, axisY + 6)
    ctx.stroke()
    ctx.fillStyle = PINK
    ctx.beginPath()
    ctx.arc(cx, axisY - 26, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.font = '10px monospace'
    ctx.fillText('0.3', cx, axisY + 22)

    if (step >= 2) {
      // marker: computed 0.1+0.2 (== C + 1 ulp)
      const sx = px(SUM)
      ctx.strokeStyle = ORANGE
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(sx, axisY - 26)
      ctx.lineTo(sx, axisY + 6)
      ctx.stroke()
      ctx.fillStyle = ORANGE
      ctx.beginPath()
      ctx.arc(sx, axisY - 26, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = ORANGE
      ctx.textAlign = 'center'
      ctx.fillText('0.1+0.2', sx, axisY + 22)
    }

    if (step >= 3) {
      // bracket showing the one-ulp gap between the two markers
      const sx = px(SUM)
      const gy = axisY - 38
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(cx, gy)
      ctx.lineTo(sx, gy)
      ctx.stroke()
      ctx.fillStyle = GOLD
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('1 ulp gap  → 0.1+0.2 ≠ 0.3', (cx + sx) / 2, gy - 5)
    }
    ctx.textAlign = 'left'
  }, [step])

  useEffect(() => {
    draw()
  }, [draw])

  const reset = () => {
    triggerReset()
    setPlaying(false)
    setStep(0)
  }

  const next = () => {
    setPlaying(false)
    setStep(s => Math.min(STEPS.length - 1, s + 1))
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Why 0.1 + 0.2 ≠ 0.3
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} style={{ width: W, maxWidth: '100%', height: H, background: '#0F0D0A', borderRadius: 8 }} />
      </div>

      {/* readout row */}
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          0.1 + 0.2 === 0.3 → <strong className="text-accent-orange">{String(SUM === C)}</strong>
        </span>
        <span className="text-text-muted">
          (0.1+0.2) − 0.3 = <strong className="text-accent-gold">{(SUM - C).toExponential(3)}</strong> = 1 ulp
        </span>
        <span className="text-text-muted">ulp near 0.3 ≈ {U.toExponential(3)}</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (step >= STEPS.length - 1) setStep(0)
            setPlaying(p => !p)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {playing ? 'Playing…' : 'Play'}
        </button>
        <button
          onClick={next}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors"
        >
          <ChevronRight size={12} /> Step
        </button>
        <span className="text-text-secondary font-medium text-xs self-center">
          {step + 1}/{STEPS.length}
        </span>
      </div>
    </div>
  )
}
