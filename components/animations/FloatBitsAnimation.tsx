'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

// A 32-bit IEEE-754 single-precision float is used here for clarity:
// 1 sign bit + 8 exponent bits (bias 127) + 23 mantissa bits.
// The same ideas scale to the 64-bit double (1 + 11 + 52, bias 1023).
const W = 600
const H = 180

const BLUE = '#60A5FA' // mantissa
const TEAL = '#2DD4BF' // exponent
const ORANGE = '#FB923C' // sign
const GOLD = '#F59E0B'
const DIM = 'rgba(245,240,232,0.42)'
const FAINT = 'rgba(255,245,235,0.12)'

const BIAS = 127
const MANT_BITS = 23

type Bits = number[] // length 32, each 0 or 1

function encodeFloat(value: number): Bits {
  const dv = new DataView(new ArrayBuffer(4))
  dv.setFloat32(0, value)
  const u = dv.getUint32(0) >>> 0
  return Array.from({ length: 32 }, (_, i) => (u >>> (31 - i)) & 1)
}

function bitsToUint(bits: Bits): number {
  return bits.reduce((acc, b) => (((acc << 1) >>> 0) | b) >>> 0, 0) >>> 0
}

type Decoded = {
  value: number
  sign: number
  expField: number // raw 0..255
  E: number // unbiased exponent used in value
  mantInt: number // raw 23-bit integer
  mantFrac: number // 0..1 fraction (m)
  implicit: number // 1 for normal, 0 for subnormal
  ulp: number // gap to next representable value
  kind: 'normal' | 'subnormal' | 'zero' | 'inf' | 'nan'
}

function decode(bits: Bits): Decoded {
  const u = bitsToUint(bits)
  const dv = new DataView(new ArrayBuffer(4))
  dv.setUint32(0, u)
  const value = dv.getFloat32(0)

  const sign = bits[0]
  const expField = bits.slice(1, 9).reduce((a, b) => a * 2 + b, 0)
  const mantInt = bits.slice(9, 32).reduce((a, b) => a * 2 + b, 0)
  const mantFrac = mantInt / 2 ** MANT_BITS

  // gap to the next representable value (increment the raw bit pattern)
  dv.setUint32(0, (u + 1) >>> 0)
  const next = dv.getFloat32(0)
  const ulp = Math.abs(next - value)

  let kind: Decoded['kind']
  let E: number
  let implicit: number
  if (expField === 255) {
    kind = mantInt === 0 ? 'inf' : 'nan'
    E = 128
    implicit = 1
  } else if (expField === 0) {
    // subnormal (or zero): no implicit leading 1, exponent fixed at 1-bias
    kind = mantInt === 0 ? 'zero' : 'subnormal'
    E = 1 - BIAS
    implicit = 0
  } else {
    kind = 'normal'
    E = expField - BIAS
    implicit = 1
  }

  return { value, sign, expField, E, mantInt, mantFrac, implicit, ulp, kind }
}

// clamp the visual exponent so the number line stays legible
function clampE(E: number): number {
  return Math.max(-6, Math.min(8, E))
}

export function FloatBitsAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // default: 0.15625 = 1.25 × 2^-3, a clean terminating binary fraction
  const [bits, setBits] = useState<Bits>(() => encodeFloat(0.15625))
  const [playing, setPlaying] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) return
      setBits(encodeFloat(0.15625))
      setPlaying(true)
    },
  })

  const d = decode(bits)

  const toggleBit = (i: number) => {
    setPlaying(false)
    setBits(prev => prev.map((b, j) => (j === i ? (b ? 0 : 1) : b)))
  }

  const setPreset = (v: number) => {
    setPlaying(false)
    setBits(encodeFloat(v))
  }

  // Play: sweep the exponent field upward so the value marches through
  // successive binades — you can watch the representable grid grow sparser.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let frames = 0
    const step = () => {
      frames += 1
      if (frames % 34 === 0) {
        setBits(prev => {
          const cur = prev.slice(1, 9).reduce((a, b) => a * 2 + b, 0)
          const nextExp = cur >= 134 ? 122 : cur + 1
          const eb = Array.from({ length: 8 }, (_, k) => (nextExp >> (7 - k)) & 1)
          return [prev[0], ...eb, ...prev.slice(9)]
        })
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
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
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = BLUE
    ctx.fillText('Representable values — spaced ulp apart, sparser as magnitude grows', 16, 22)

    const pad = 40
    const axisY = 118
    const x0 = pad
    const x1 = W - pad

    if (d.kind === 'inf' || d.kind === 'nan') {
      ctx.fillStyle = GOLD
      ctx.font = 'bold 15px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(
        d.kind === 'inf' ? (d.sign ? '−∞  (special value)' : '+∞  (special value)') : 'NaN  (not a number)',
        W / 2,
        axisY - 10
      )
      ctx.textAlign = 'left'
      ctx.fillStyle = DIM
      ctx.font = '11px monospace'
      ctx.fillText('exponent field = 255 is reserved for infinities and NaN', 16, 152)
      return
    }

    const E = clampE(d.kind === 'zero' ? -3 : d.E)
    const axisMax = 2 ** (E + 2)

    // baseline axis
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x0, axisY)
    ctx.lineTo(x1, axisY)
    ctx.stroke()

    const px = (val: number) => x0 + (val / axisMax) * (x1 - x0)

    // Draw a fixed number of representable "ticks" per binade. Each binade holds
    // the same count of representable values, so wider (larger-magnitude) binades
    // spread those ticks farther apart — the grid visibly thins toward the right.
    const TICKS_PER_BINADE = 6
    for (let b = E - 2; b <= E + 1; b++) {
      const lo = 2 ** b
      if (lo > axisMax) continue
      const hi = 2 ** (b + 1)
      for (let k = 0; k < TICKS_PER_BINADE; k++) {
        const val = lo + (k / TICKS_PER_BINADE) * (hi - lo)
        if (val > axisMax) break
        const xx = px(val)
        ctx.strokeStyle = 'rgba(96,165,250,0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(xx, axisY - 6)
        ctx.lineTo(xx, axisY + 6)
        ctx.stroke()
      }
      // binade boundary (power of two) — brighter
      const bx = px(lo)
      ctx.strokeStyle = 'rgba(45,212,191,0.5)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(bx, axisY - 10)
      ctx.lineTo(bx, axisY + 10)
      ctx.stroke()
      ctx.fillStyle = TEAL
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`2^${b}`, bx, axisY + 24)
      ctx.textAlign = 'left'
    }

    // marker for the current value
    const av = Math.abs(d.value)
    if (av <= axisMax && isFinite(av)) {
      const mx = px(av)
      ctx.strokeStyle = ORANGE
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(mx, axisY - 22)
      ctx.lineTo(mx, axisY + 8)
      ctx.stroke()
      ctx.fillStyle = ORANGE
      ctx.beginPath()
      ctx.arc(mx, axisY - 22, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      const label = (d.sign ? '−' : '') + av.toPrecision(4)
      ctx.fillText(label, Math.max(x0 + 20, Math.min(x1 - 20, mx)), axisY - 30)
      ctx.textAlign = 'left'
    }

    // "denser  ←→  sparser" annotation
    ctx.fillStyle = DIM
    ctx.font = '10px monospace'
    ctx.fillText('denser near 0', x0, 152)
    ctx.textAlign = 'right'
    ctx.fillText('sparser at large magnitude →', x1, 152)
    ctx.textAlign = 'left'
  }, [d])

  useEffect(() => {
    draw()
  }, [draw])

  const reset = () => {
    triggerReset()
    setPlaying(false)
    setBits(encodeFloat(0.15625))
  }

  // formatted breakdown pieces
  const signStr = d.sign ? '−' : '+'
  const valueStr =
    d.kind === 'inf'
      ? d.sign
        ? '−Infinity'
        : 'Infinity'
      : d.kind === 'nan'
        ? 'NaN'
        : d.value === 0
          ? Object.is(d.value, -0)
            ? '−0'
            : '0'
          : d.value.toPrecision(9).replace(/\.?0+$/, '')

  const bitCell = (i: number, color: string) => (
    <button
      key={i}
      onClick={() => toggleBit(i)}
      className="h-6 w-4 rounded-sm text-[10px] font-mono leading-6 text-center transition-colors"
      style={{
        color: bits[i] ? color : DIM,
        background: bits[i] ? `${color}22` : 'rgba(255,255,255,0.03)',
        border: `1px solid ${bits[i] ? color : FAINT}`,
      }}
      aria-label={`bit ${i}`}
    >
      {bits[i]}
    </button>
  )

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · 32-bit float (1 sign · 8 exponent · 23 mantissa)
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <div className="flex flex-col gap-2 w-full">
          {/* bit layout */}
          <div className="flex items-end justify-center gap-4 flex-wrap py-1">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-mono" style={{ color: ORANGE }}>
                sign
              </span>
              <div className="flex gap-0.5">{bitCell(0, ORANGE)}</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-mono" style={{ color: TEAL }}>
                exponent (bias 127)
              </span>
              <div className="flex gap-0.5">{Array.from({ length: 8 }, (_, k) => bitCell(1 + k, TEAL))}</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-mono" style={{ color: BLUE }}>
                mantissa (fraction)
              </span>
              <div className="flex gap-0.5 flex-wrap justify-center">
                {Array.from({ length: 23 }, (_, k) => bitCell(9 + k, BLUE))}
              </div>
            </div>
          </div>
          <canvas ref={canvasRef} style={{ width: W, maxWidth: '100%', height: H, background: '#0F0D0A', borderRadius: 8 }} />
        </div>
      </div>

      {/* readout row */}
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          value = <strong className="text-accent-orange">{valueStr}</strong>
        </span>
        {d.kind === 'normal' && (
          <span className="text-text-muted">
            {`= (−1)^${d.sign} × 1.${d.mantFrac.toFixed(6).slice(2)} × 2^(${d.expField}−127)`}
          </span>
        )}
        {d.kind === 'subnormal' && (
          <span className="text-text-muted">{`= (−1)^${d.sign} × 0.m × 2^(1−127)  [subnormal — no implicit 1]`}</span>
        )}
        <span className="text-text-muted">
          {`sign ${signStr}`} · exp {d.expField} · mant {d.mantInt}
        </span>
        {(d.kind === 'normal' || d.kind === 'subnormal') && (
          <span>
            gap to next ≈ <strong className="text-accent-gold">{d.ulp.toExponential(3)}</strong>
          </span>
        )}
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setPlaying(p => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {playing ? 'Sweeping…' : 'Sweep exponent'}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted ml-auto flex-wrap">
          <span className="font-mono">presets:</span>
          {[
            ['0.15625', 0.15625],
            ['1.0', 1],
            ['0.1', 0.1],
            ['−2.5', -2.5],
            ['∞', Infinity],
          ].map(([label, v]) => (
            <button
              key={String(label)}
              onClick={() => setPreset(v as number)}
              className="rounded border border-white/10 px-2 py-1 font-mono hover:text-text-secondary transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
