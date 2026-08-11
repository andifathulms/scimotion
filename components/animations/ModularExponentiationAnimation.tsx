'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 330

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const GREEN = '#10B981'
const DIM = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.22)'

const PL = 54
const PR = W - 20
const PT = 52
const PB = H - 62

const PRIMES = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97]

// values[x] = g^x mod p for x = 1 .. p-1
function buildValues(g: number, p: number): number[] {
  const out: number[] = []
  let v = 1
  for (let x = 1; x <= p - 1; x++) {
    v = (v * g) % p
    out.push(v)
  }
  return out
}

// The modulus is stored as an index into PRIMES, not as the prime itself.
// A hash is editable text and the spec can only clamp a numeric range, so
// pinning p directly would let "?modexp.p=24" through — a composite modulus,
// which makes the discrete log the article is about quietly ill-defined. An
// index cannot express a value that is not on the list.
//
// g and y have ranges that depend on p (2..p−2 and 0..p−2), which a static spec
// cannot express either. Their bounds are the widest any prime allows and the
// existing Math.min guards do the per-p clamping, exactly as they did for the
// select.
const SPEC = {
  pIdx: { default: PRIMES.indexOf(23), min: 0, max: PRIMES.length - 1, step: 1 },
  g: { default: 5, min: 2, max: PRIMES[PRIMES.length - 1] - 2, step: 1, symbol: 'g' },
  targetIdx: { default: 6, min: 0, max: PRIMES[PRIMES.length - 1] - 2, step: 1, symbol: 'x' },
}

export function ModularExponentiationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('modexp', SPEC)
  const p = PRIMES[params.pIdx]
  // Clamped on read: a link may carry a g or y that was valid under a larger
  // modulus than the one it also carries.
  const g = Math.min(params.g, p - 2)
  const targetIdx = Math.min(params.targetIdx, p - 2)
  const [idx, setIdx] = useState(-1)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(150)

  const values = useMemo(() => buildValues(g, p), [g, p])
  const totalRef = useRef(values.length)
  useEffect(() => { totalRef.current = values.length }, [values.length])

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setIdx(totalRef.current - 1); return }
      setIdx(-1)
      setRunning(true)
    },
  })

  const distinct = useMemo(() => new Set(values).size, [values])
  const target = values[Math.min(targetIdx, values.length - 1)] ?? 1
  const preimages = useMemo(
    () => values.map((v, i) => (v === target ? i + 1 : -1)).filter(i => i > 0),
    [values, target]
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const n = values.length
    const sx = (x: number) => PL + ((x - 1) / Math.max(1, n - 1)) * (PR - PL)
    const sy = (v: number) => PB - (v / (p - 1)) * (PB - PT)

    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    // ---- header ----
    ctx.font = '11px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('plotting', 14, 16)
    ctx.fillStyle = BLUE
    ctx.fillText(`y = ${g}^x mod ${p}`, 74, 16)
    ctx.fillStyle = DIM
    ctx.fillText(`for x = 1 … ${p - 1}`, 190, 16)
    ctx.fillStyle = distinct === p - 1 ? GREEN : GOLD
    ctx.fillText(
      distinct === p - 1
        ? `g = ${g} is a primitive root — it hits all ${p - 1} nonzero values`
        : `g = ${g} cycles through only ${distinct} of ${p - 1} values`,
      14, 34
    )

    // ---- axes ----
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PL, PT - 8)
    ctx.lineTo(PL, PB)
    ctx.lineTo(PR, PB)
    ctx.stroke()

    ctx.font = '9px monospace'
    ctx.fillStyle = FAINT
    ctx.textAlign = 'right'
    for (let k = 0; k <= 4; k++) {
      const v = Math.round(((p - 1) * k) / 4)
      const y = sy(v)
      ctx.fillText(String(v), PL - 6, y)
      if (k > 0) {
        ctx.strokeStyle = 'rgba(255,245,235,0.05)'
        ctx.beginPath()
        ctx.moveTo(PL, y)
        ctx.lineTo(PR, y)
        ctx.stroke()
      }
    }
    ctx.textAlign = 'center'
    ctx.fillText('x = 1', PL, PB + 14)
    ctx.fillText(`x = ${p - 1}`, PR - 10, PB + 14)
    ctx.textAlign = 'left'
    ctx.fillStyle = FAINT
    ctx.fillText('g^x mod p', 12, PT - 20)

    // ---- target band (the "backward" question) ----
    const ty = sy(target)
    ctx.strokeStyle = `${PINK}55`
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(PL, ty)
    ctx.lineTo(PR, ty)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = '10px monospace'
    ctx.fillStyle = PINK
    ctx.textAlign = 'right'
    ctx.fillText(`y = ${target}`, PR, ty - 10)
    ctx.textAlign = 'left'

    // ---- the walk: faint connectors between consecutive x ----
    const last = Math.min(idx, n - 1)
    if (last >= 1) {
      ctx.strokeStyle = `${VIOLET}33`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(sx(1), sy(values[0]))
      for (let i = 1; i <= last; i++) ctx.lineTo(sx(i + 1), sy(values[i]))
      ctx.stroke()
    }

    // ---- points ----
    for (let i = 0; i <= last; i++) {
      const x = sx(i + 1)
      const y = sy(values[i])
      const isTarget = values[i] === target
      const isCurrent = i === last
      ctx.fillStyle = isCurrent ? GOLD : isTarget ? GREEN : BLUE
      ctx.beginPath()
      ctx.arc(x, y, isCurrent ? 4.5 : isTarget ? 4 : 2.6, 0, Math.PI * 2)
      ctx.fill()
      if (isTarget && !isCurrent) {
        ctx.strokeStyle = `${GREEN}88`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, PB)
        ctx.stroke()
      }
    }

    // ---- current readout ----
    ctx.font = '11px monospace'
    if (last >= 0) {
      const xv = last + 1
      ctx.fillStyle = GOLD
      ctx.fillText(`forward (easy):  ${g}^${xv} mod ${p} = ${values[last]}`, 14, PB + 34)
    } else {
      ctx.fillStyle = FAINT
      ctx.fillText('Press Play — x marches 1, 2, 3 … while the output jumps at random', 14, PB + 34)
    }

    ctx.fillStyle = last >= n - 1 ? GREEN : DIM
    if (last >= n - 1 && preimages.length > 0) {
      ctx.fillText(
        `backward (hard):  ${g}^x ≡ ${target} (mod ${p})  →  x = ${preimages.join(', ')} — found only by trying all ${n}`,
        14, PB + 52
      )
    } else {
      ctx.fillStyle = PINK
      ctx.fillText(`backward (hard):  which x satisfies ${g}^x ≡ ${target} (mod ${p})?`, 14, PB + 52)
    }
  }, [values, idx, p, g, target, preimages, distinct])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running || !visible) return
    const id = setInterval(() => {
      setIdx(i => {
        if (i >= values.length - 1) { setRunning(false); return i }
        return i + 1
      })
    }, speed)
    return () => clearInterval(id)
  }, [running, speed, values.length, visible])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setIdx(-1)
  }

  const changeP = (np: number) => {
    setRunning(false)
    setIdx(-1)
    // g and y are clamped against p at read time, so switching the modulus no
    // longer has to write them back down.
    set('pIdx', PRIMES.indexOf(np))
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Why the discrete log is hard
        </span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Why the discrete log is hard. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { if (idx >= values.length - 1) setIdx(-1); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Prime p:</span>
          <select
            value={p}
            onChange={e => changeP(+e.target.value)}
            className="px-2 py-1 rounded border border-border bg-bg-surface text-xs text-text-secondary"
          >
            {PRIMES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Base g:</span>
          <input
            type="range" min={SPEC.g.min} max={p - 2} step={SPEC.g.step} value={g}
            onChange={e => { setRunning(false); setIdx(-1); set('g', +e.target.value) }}
            className="w-20 accent-accent-blue"
          />
          <span className="text-text-secondary font-medium">{g}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Target y:</span>
          <input
            type="range" min={SPEC.targetIdx.min} max={p - 2} step={SPEC.targetIdx.step} value={targetIdx}
            onChange={e => set('targetIdx', +e.target.value)}
            className="w-20 accent-accent-gold"
          />
          <span className="text-text-secondary font-medium">{target}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Speed:</span>
          <input
            type="range" min={30} max={300} step={30} value={330 - speed}
            onChange={e => setSpeed(330 - +e.target.value)}
            className="w-20 accent-accent-gold"
          />
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          Plotted <strong className="text-accent-gold">{Math.max(0, Math.min(idx + 1, values.length))}</strong> / {values.length}
        </WidgetStatus>
      </div>
    </div>
  )
}
