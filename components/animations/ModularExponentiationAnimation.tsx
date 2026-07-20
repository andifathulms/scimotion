'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

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

export function ModularExponentiationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [p, setP] = useState(23)
  const [g, setG] = useState(5)
  const [idx, setIdx] = useState(-1)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(150)
  const [targetIdx, setTargetIdx] = useState(6)

  const values = useMemo(() => buildValues(g, p), [g, p])
  const totalRef = useRef(values.length)
  useEffect(() => { totalRef.current = values.length }, [values.length])

  const { ref, reset: triggerReset } = useAnimationTrigger({
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
    if (!running) return
    const id = setInterval(() => {
      setIdx(i => {
        if (i >= values.length - 1) { setRunning(false); return i }
        return i + 1
      })
    }, speed)
    return () => clearInterval(id)
  }, [running, speed, values.length])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setIdx(-1)
  }

  const changeP = (np: number) => {
    setRunning(false)
    setIdx(-1)
    setP(np)
    if (g > np - 2) setG(np - 2)
    if (targetIdx > np - 2) setTargetIdx(np - 2)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Why the discrete log is hard
        </span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
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
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Base g:</span>
          <input
            type="range" min={2} max={p - 2} step={1} value={Math.min(g, p - 2)}
            onChange={e => { setRunning(false); setIdx(-1); setG(+e.target.value) }}
            className="w-20 accent-accent-blue"
          />
          <span className="text-text-secondary font-medium">{g}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Target y:</span>
          <input
            type="range" min={0} max={p - 2} step={1} value={Math.min(targetIdx, p - 2)}
            onChange={e => setTargetIdx(+e.target.value)}
            className="w-20 accent-accent-gold"
          />
          <span className="text-text-secondary font-medium">{target}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Speed:</span>
          <input
            type="range" min={30} max={300} step={30} value={330 - speed}
            onChange={e => setSpeed(330 - +e.target.value)}
            className="w-20 accent-accent-gold"
          />
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          Plotted <strong className="text-accent-gold">{Math.max(0, Math.min(idx + 1, values.length))}</strong> / {values.length}
        </span>
      </div>
    </div>
  )
}
