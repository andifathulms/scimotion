'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300
const N = 64 // grid is N x N
const CELL = 3.5
const SIZE = N * CELL // 224
const KX = 44
const KY = 42
const IX = 332
const IY = 42

const PINK = '#F472B6'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const DIM = 'rgba(245,240,232,0.35)'
const FAINT = 'rgba(255,245,235,0.10)'

type Mode = 'scan' | 'centre' | 'edges'

// ---------------------------------------------------------------------------
// A synthetic head-like phantom: bright skull rim, uniform brain, two dark
// ventricles, one bright lesion, and a fine comb that only survives if the
// outer lines of k-space are kept.
// ---------------------------------------------------------------------------
function makePhantom(): Float64Array {
  const p = new Float64Array(N * N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x - N / 2 + 0.5) / 25
      const v = (y - N / 2 + 0.5) / 28
      const r = Math.sqrt(u * u + v * v)
      let val = 0
      if (r < 1) val = r > 0.88 ? 0.95 : 0.42
      const dx1 = x - 25
      const dy1 = y - 27
      if (dx1 * dx1 + dy1 * dy1 < 30) val = 0.1
      const dx2 = x - 39
      const dy2 = y - 27
      if (dx2 * dx2 + dy2 * dy2 < 30) val = 0.1
      const dx3 = x - 36
      const dy3 = y - 42
      if (dx3 * dx3 + dy3 * dy3 < 11) val = 0.9
      if (y >= 14 && y <= 20 && x >= 22 && x <= 42 && x % 2 === 0) val = 0.85
      p[y * N + x] = val
    }
  }
  return p
}

// Twiddle tables: cos/sin of 2*pi*k*n/N.
const COS = new Float64Array(N * N)
const SIN = new Float64Array(N * N)
for (let k = 0; k < N; k++) {
  for (let n = 0; n < N; n++) {
    COS[k * N + n] = Math.cos((2 * Math.PI * k * n) / N)
    SIN[k * N + n] = Math.sin((2 * Math.PI * k * n) / N)
  }
}

// Separable 2-D DFT (rows then columns). sign = -1 forward, +1 inverse.
function dft2(re: Float64Array, im: Float64Array, sign: number) {
  const tr = new Float64Array(N * N)
  const ti = new Float64Array(N * N)

  for (let y = 0; y < N; y++) {
    const off = y * N
    for (let k = 0; k < N; k++) {
      let sr = 0
      let si = 0
      for (let n = 0; n < N; n++) {
        const c = COS[k * N + n]
        const s = sign * SIN[k * N + n]
        const a = re[off + n]
        const b = im[off + n]
        sr += a * c - b * s
        si += a * s + b * c
      }
      tr[off + k] = sr
      ti[off + k] = si
    }
  }

  const or_ = new Float64Array(N * N)
  const oi = new Float64Array(N * N)
  for (let x = 0; x < N; x++) {
    for (let k = 0; k < N; k++) {
      let sr = 0
      let si = 0
      for (let n = 0; n < N; n++) {
        const c = COS[k * N + n]
        const s = sign * SIN[k * N + n]
        const a = tr[n * N + x]
        const b = ti[n * N + x]
        sr += a * c - b * s
        si += a * s + b * c
      }
      or_[k * N + x] = sr
      oi[k * N + x] = si
    }
  }

  if (sign > 0) {
    const inv = 1 / (N * N)
    for (let i = 0; i < N * N; i++) {
      or_[i] *= inv
      oi[i] *= inv
    }
  }
  return { re: or_, im: oi }
}

// Frequency index -32..31 for an unshifted DFT row/column index.
const centred = (k: number) => (k < N / 2 ? k : k - N)
// Acquisition order: display row 0 (top) first, so the centre fills mid-scan.
const shifted = (r: number) => (r + N / 2) % N

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  keep: { default: 16, min: 2, max: 62, step: 2 },
}

export function KSpaceAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [mode, setMode] = useState<Mode>('scan')
  const [rows, setRows] = useState(0)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('k-space', SPEC)
  const { keep } = params

  const phantom = useMemo(() => makePhantom(), [])
  const spectrum = useMemo(() => {
    const re = Float64Array.from(phantom)
    const im = new Float64Array(N * N)
    return dft2(re, im, -1)
  }, [phantom])

  const kMag = useMemo(() => {
    const m = new Float64Array(N * N)
    for (let i = 0; i < N * N; i++) m[i] = Math.hypot(spectrum.re[i], spectrum.im[i])
    return m
  }, [spectrum])
  const kMaxLog = useMemo(() => {
    let mx = 0
    for (let i = 0; i < N * N; i++) mx = Math.max(mx, kMag[i])
    return Math.log(1 + mx)
  }, [kMag])

  // Which k-space lines (rows, i.e. phase-encode steps) are currently kept.
  const keptRow = useCallback(
    (ky: number) => {
      const cy = Math.abs(centred(ky))
      if (mode === 'centre') return cy < keep / 2
      if (mode === 'edges') return cy >= keep / 2
      // scanning: display rows 0..rows-1 have been acquired
      for (let r = 0; r < rows; r++) if (shifted(r) === ky) return true
      return false
    },
    [mode, keep, rows]
  )

  const recon = useMemo(() => {
    const re = new Float64Array(N * N)
    const im = new Float64Array(N * N)
    for (let ky = 0; ky < N; ky++) {
      if (!keptRow(ky)) continue
      for (let kx = 0; kx < N; kx++) {
        re[ky * N + kx] = spectrum.re[ky * N + kx]
        im[ky * N + kx] = spectrum.im[ky * N + kx]
      }
    }
    const out = dft2(re, im, 1)
    const mag = new Float64Array(N * N)
    let mx = 1e-9
    for (let i = 0; i < N * N; i++) {
      mag[i] = Math.hypot(out.re[i], out.im[i])
      if (mag[i] > mx) mx = mag[i]
    }
    for (let i = 0; i < N * N; i++) mag[i] /= mx
    return mag
  }, [spectrum, keptRow])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: (reduced) => {
      if (reduced) setRows(N)
      else setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'

    // ---- k-space --------------------------------------------------------
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.fillRect(KX, KY, SIZE, SIZE)
    for (let r = 0; r < N; r++) {
      const ky = shifted(r)
      const on = keptRow(ky)
      if (!on) continue
      for (let c = 0; c < N; c++) {
        const kx = shifted(c)
        const v = Math.log(1 + kMag[ky * N + kx]) / kMaxLog
        const a = Math.min(1, Math.pow(v, 1.6) * 1.15)
        ctx.fillStyle = `rgba(244,114,182,${a.toFixed(3)})`
        ctx.fillRect(KX + c * CELL, KY + r * CELL, CELL + 0.4, CELL + 0.4)
      }
    }

    // current acquisition line
    if (mode === 'scan' && rows > 0 && rows <= N) {
      const y = KY + (rows - 1) * CELL
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 1.25
      ctx.beginPath()
      ctx.moveTo(KX, y + CELL / 2)
      ctx.lineTo(KX + SIZE, y + CELL / 2)
      ctx.stroke()
    }

    // centre marker
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.strokeRect(KX, KY, SIZE, SIZE)
    ctx.setLineDash([2, 3])
    ctx.strokeStyle = 'rgba(96,165,250,0.35)'
    ctx.beginPath()
    ctx.moveTo(KX, KY + SIZE / 2)
    ctx.lineTo(KX + SIZE, KY + SIZE / 2)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = DIM
    ctx.fillText('k-space (raw signal)', KX, KY - 10)
    ctx.fillStyle = BLUE
    ctx.fillText('k = 0 · contrast', KX + 2, KY + SIZE / 2 - 4)
    ctx.fillStyle = DIM
    ctx.fillText('periphery · fine detail', KX + 2, KY + 12)

    // ---- reconstructed image --------------------------------------------
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const v = Math.min(1, Math.pow(recon[y * N + x], 0.85))
        const g = Math.round(v * 235)
        ctx.fillStyle = `rgb(${g},${Math.round(g * 0.97)},${Math.round(g * 0.93)})`
        ctx.fillRect(IX + x * CELL, IY + y * CELL, CELL + 0.4, CELL + 0.4)
      }
    }
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.strokeRect(IX, IY, SIZE, SIZE)
    ctx.fillStyle = DIM
    ctx.fillText('image (inverse Fourier transform)', IX, IY - 10)

    // ---- arrow between them ---------------------------------------------
    const ay = IY + SIZE / 2
    ctx.strokeStyle = 'rgba(245,240,232,0.30)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(KX + SIZE + 12, ay)
    ctx.lineTo(IX - 14, ay)
    ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.30)'
    ctx.beginPath()
    ctx.moveTo(IX - 10, ay)
    ctx.lineTo(IX - 18, ay - 4)
    ctx.lineTo(IX - 18, ay + 4)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = DIM
    ctx.fillText('ℱ⁻¹', KX + SIZE + 22, ay - 8)

    // ---- caption ---------------------------------------------------------
    const kept = Array.from({ length: N }, (_, ky) => ky).filter(keptRow).length
    const caption =
      mode === 'scan'
        ? rows >= N
          ? 'All 64 lines acquired — the full image.'
          : `Acquiring line ${Math.min(rows, N)} of ${N}. The image sharpens as the scan proceeds.`
        : mode === 'centre'
          ? `Only the ${kept} central lines: blurred, but every tissue still has the right brightness.`
          : `Only the ${kept} outer lines: edges survive, contrast is gone.`
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(caption, KX, H - 14)
  }, [keptRow, kMag, kMaxLog, recon, mode, rows])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!running || mode !== 'scan') {
      cancelAnimationFrame(animRef.current)
      return
    }
    let frames = 0
    const loop = () => {
      frames++
      if (frames % 4 === 0) {
        setRows(r => {
          if (r >= N) {
            setRunning(false)
            return N
          }
          return r + 1
        })
      }
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running, mode])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setMode('scan')
    setRows(0)
    set('keep', 16)
  }

  const pick = (m: Mode) => {
    setRunning(false)
    setMode(m)
    if (m === 'scan') setRows(N)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · k-Space to Image</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: K-Space to Image. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (mode !== 'scan') {
              setMode('scan')
              setRows(0)
            } else if (rows >= N) {
              setRows(0)
            }
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Scan</>}
        </button>
        <div className="flex items-center gap-1.5">
          {(['scan', 'centre', 'edges'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => pick(m)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === m ? 'bg-white/15 text-text-primary' : 'bg-white/5 text-text-muted hover:text-text-secondary'
              }`}
            >
              {m === 'scan' ? 'Full scan' : m === 'centre' ? 'Centre only' : 'Edges only'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Lines kept:</span>
          <input type="range" min={SPEC.keep.min} max={SPEC.keep.max} step={SPEC.keep.step} value={keep}
            disabled={mode === 'scan'}
            onChange={e => set('keep', +e.target.value)}
            className="w-28 accent-accent-gold disabled:opacity-30"
          />
          <span>{keep}</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary">
          <strong style={{ color: PINK }}>{N}×{N}</strong> real 2-D DFT
        </span>
      </div>
    </div>
  )
}
