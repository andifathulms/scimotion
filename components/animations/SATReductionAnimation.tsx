'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Play } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 620
const H = 320
const MS_PER_OP = 60 // both sides advance at exactly the same speed
const MAX_RUN_MS = 25000

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const GREEN = '#10B981'

const N_MIN = 4
const N_MAX = 20

type Literal = { v: number; neg: boolean }

// Deterministic 3-SAT instance built around a hidden satisfying assignment,
// so verification always succeeds and the two panels compare like for like.
function buildInstance(n: number): { solution: boolean[]; clauses: Literal[][] } {
  let seed = n * 2654435761 + 12345
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const solution = Array.from({ length: n }, () => rnd() < 0.5)
  const m = 3 * n
  const clauses: Literal[][] = []
  for (let i = 0; i < m; i++) {
    const vars: number[] = []
    while (vars.length < 3) {
      const v = Math.floor(rnd() * n)
      if (!vars.includes(v)) vars.push(v)
    }
    const lits = vars.map(v => ({ v, neg: rnd() < 0.5 }))
    // force at least one literal true under the hidden solution
    const sat = lits.some(l => (solution[l.v] ? !l.neg : l.neg))
    if (!sat) {
      const k = Math.floor(rnd() * 3)
      lits[k].neg = !solution[lits[k].v]
    }
    clauses.push(lits)
  }
  return { solution, clauses }
}

function fmtCount(x: number): string {
  if (x < 1e6) return Math.round(x).toLocaleString('en-US')
  return `10^${Math.log10(x).toFixed(1)}`
}

function fmtSeconds(l10sec: number): string {
  if (l10sec < 200) {
    const s = Math.pow(10, l10sec)
    if (s < 1e-6) return `${(s * 1e9).toFixed(0)} ns`
    if (s < 1e-3) return `${(s * 1e6).toFixed(1)} µs`
    if (s < 1) return `${(s * 1e3).toFixed(1)} ms`
    if (s < 60) return `${s.toFixed(1)} s`
    if (s < 3600) return `${(s / 60).toFixed(0)} minutes`
    if (s < 86400) return `${(s / 3600).toFixed(0)} hours`
    if (s < 3.156e7) return `${(s / 86400).toFixed(0)} days`
    const years = s / 3.156e7
    if (years < 1e6) return `${years.toFixed(0)} years`
    return `10^${Math.log10(years).toFixed(1)} years`
  }
  return `10^${(l10sec - Math.log10(3.156e7)).toFixed(1)} years`
}

function litText(l: Literal): string {
  return `${l.neg ? '¬' : ''}x${l.v + 1}`
}

export function SATReductionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [n, setN] = useState(12)
  const [playing, setPlaying] = useState(false)
  const [verified, setVerified] = useState(0)
  const [tried, setTried] = useState(0)

  const { solution, clauses } = useMemo(() => buildInstance(n), [n])
  const m = clauses.length
  const total = Math.pow(2, n)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setVerified(m); setTried(Math.min(total, 260)); return }
      setVerified(0)
      setTried(0)
      setPlaying(true)
    },
  })

  useEffect(() => {
    setVerified(0)
    setTried(0)
  }, [n])

  useEffect(() => {
    if (!playing) return
    const start = performance.now()
    let raf = 0
    const tick = () => {
      const elapsed = performance.now() - start
      const ops = Math.floor(elapsed / MS_PER_OP)
      const v = Math.min(m, ops)
      const t = Math.min(total, ops)
      setVerified(v)
      setTried(t)
      if ((v >= m && t >= total) || elapsed > MAX_RUN_MS) { setPlaying(false); return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, m, total])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const LX = 16
    const RX = 330
    const PANEL_W = 274

    // panel frames
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.lineWidth = 1
    ctx.strokeRect(LX - 6, 10, PANEL_W + 12, H - 22)
    ctx.strokeRect(RX - 6, 10, PANEL_W + 12, H - 22)

    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = GREEN
    ctx.fillText('VERIFY  ·  assignment is given', LX, 28)
    ctx.fillStyle = PINK
    ctx.fillText('SEARCH  ·  no assignment given', RX, 28)

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('check every clause once', LX, 42)
    ctx.fillText('try every assignment', RX, 42)

    // ---- left: certificate chips ----
    const chipW = Math.min(13, Math.floor(PANEL_W / n))
    for (let i = 0; i < n; i++) {
      const cx = LX + i * chipW
      const on = solution[i]
      ctx.fillStyle = on ? `${BLUE}33` : 'rgba(255,245,235,0.05)'
      ctx.fillRect(cx, 52, chipW - 2, 14)
      ctx.strokeStyle = on ? BLUE : 'rgba(255,245,235,0.15)'
      ctx.strokeRect(cx + 0.5, 52.5, chipW - 3, 13)
      ctx.fillStyle = on ? BLUE : 'rgba(245,240,232,0.35)'
      ctx.font = '8px monospace'
      ctx.fillText(on ? 'T' : 'F', cx + chipW / 2 - 2.5, 62)
    }
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText(`certificate: ${n} bits`, LX, 80)

    // ---- left: clause grid ----
    const cols = 10
    const cell = 22
    const gy0 = 90
    for (let i = 0; i < m; i++) {
      const gx = LX + (i % cols) * (cell + 4)
      const gy = gy0 + Math.floor(i / cols) * (cell + 4)
      const state = i < verified ? 'done' : i === verified ? 'now' : 'todo'
      ctx.fillStyle = state === 'done' ? `${GREEN}33` : state === 'now' ? GOLD : 'rgba(255,245,235,0.04)'
      ctx.fillRect(gx, gy, cell, cell)
      ctx.strokeStyle = state === 'done' ? GREEN : state === 'now' ? GOLD : 'rgba(255,245,235,0.12)'
      ctx.strokeRect(gx + 0.5, gy + 0.5, cell - 1, cell - 1)
      if (state === 'done') {
        ctx.fillStyle = GREEN
        ctx.font = '11px monospace'
        ctx.fillText('✓', gx + 7, gy + 15)
      }
    }

    const rows = Math.ceil(m / cols)
    const belowGrid = gy0 + rows * (cell + 4) + 16

    // current clause, spelled out
    const ci = Math.min(verified, m - 1)
    const cl = clauses[ci]
    ctx.font = '11px monospace'
    ctx.fillStyle = verified >= m ? GREEN : GOLD
    ctx.fillText(`c${ci + 1}: (${cl.map(litText).join(' ∨ ')})`, LX, belowGrid)

    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = GREEN
    ctx.fillText(`${verified} / ${m} clauses checked`, LX, belowGrid + 22)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText(verified >= m ? 'SATISFIED — verified in 3n steps' : 'cost grows linearly with n', LX, belowGrid + 38)

    // ---- right: binary counter ----
    const bw = Math.min(13, Math.floor(PANEL_W / n))
    for (let i = 0; i < n; i++) {
      const bit = Math.floor(tried / Math.pow(2, n - 1 - i)) % 2
      const bx = RX + i * bw
      ctx.fillStyle = bit ? `${VIOLET}44` : 'rgba(255,245,235,0.05)'
      ctx.fillRect(bx, 52, bw - 2, 14)
      ctx.strokeStyle = bit ? VIOLET : 'rgba(255,245,235,0.15)'
      ctx.strokeRect(bx + 0.5, 52.5, bw - 3, 13)
      ctx.fillStyle = bit ? VIOLET : 'rgba(245,240,232,0.3)'
      ctx.font = '8px monospace'
      ctx.fillText(String(bit), bx + bw / 2 - 2.5, 62)
    }
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('candidate assignment (counting up)', RX, 80)

    // progress bar
    const barY = 96
    const frac = tried / total
    ctx.fillStyle = 'rgba(255,245,235,0.06)'
    ctx.fillRect(RX, barY, PANEL_W, 16)
    ctx.fillStyle = PINK
    ctx.fillRect(RX, barY, Math.max(1, PANEL_W * frac), 16)
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.strokeRect(RX + 0.5, barY + 0.5, PANEL_W - 1, 15)

    const pct = frac * 100
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText(pct >= 0.01 ? `${pct.toFixed(2)}% of the space` : `${pct.toExponential(1)}% of the space`, RX, barY + 30)

    // search-tree fan: depth n, doubling each level
    const treeTop = barY + 44
    const treeH = 84
    const levels = Math.min(n, 7)
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    for (let d = 0; d < levels; d++) {
      const yTop = treeTop + (d / levels) * treeH
      const yBot = treeTop + ((d + 1) / levels) * treeH
      const count = Math.pow(2, d)
      for (let k = 0; k < count; k++) {
        const px = RX + PANEL_W * ((k + 0.5) / count)
        ctx.beginPath()
        ctx.moveTo(px, yTop)
        ctx.lineTo(RX + PANEL_W * ((2 * k + 0.5) / (2 * count)), yBot)
        ctx.moveTo(px, yTop)
        ctx.lineTo(RX + PANEL_W * ((2 * k + 1.5) / (2 * count)), yBot)
        ctx.stroke()
      }
    }
    if (n > levels) {
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.font = '9px monospace'
      ctx.fillText(`… ${n - levels} more levels`, RX, treeTop + treeH + 12)
    }

    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = PINK
    ctx.fillText(`${fmtCount(tried)} / ${fmtCount(total)} tried`, RX, treeTop + treeH + 30)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('cost doubles with every extra variable', RX, treeTop + treeH + 44)
  }, [n, m, total, verified, tried, solution, clauses])

  useEffect(() => { draw() }, [draw])

  const restart = () => {
    triggerReset()
    setVerified(0)
    setTried(0)
    setPlaying(true)
  }

  const l10verify = Math.log10(m) - 9
  const l10search = n * Math.log10(2) - 9
  const extrapolate = [40, 64, 100]

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Verifying vs searching (3-SAT)</span>
        <button onClick={restart} className="text-xs text-text-muted hover:text-text-secondary transition-colors">Reset</button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Verifying vs searching (3-SAT). Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg px-2.5 py-1.5 border" style={{ borderColor: `${GREEN}33`, background: `${GREEN}0F` }}>
          <div className="font-medium" style={{ color: GREEN }}>verify · {m} clause checks</div>
          <div className="text-text-muted">at 10⁹ ops/s: {fmtSeconds(l10verify)}</div>
        </div>
        <div className="rounded-lg px-2.5 py-1.5 border" style={{ borderColor: `${PINK}33`, background: `${PINK}0F` }}>
          <div className="font-medium" style={{ color: PINK }}>brute-force search · 2^{n} = {fmtCount(total)}</div>
          <div className="text-text-muted">at 10⁹ ops/s: {fmtSeconds(l10search)}</div>
        </div>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>variables n:</span>
          <input
            type="range" min={N_MIN} max={N_MAX} value={n}
            onChange={e => { setN(+e.target.value); setPlaying(false) }}
            className="w-40 accent-accent-blue"
          />
          <span className="text-text-secondary font-medium">{n}</span>
        </label>
        <span className="ml-auto text-xs text-text-muted">
          brute force at 10⁹/s:{' '}
          {extrapolate.map((k, i) => (
            <span key={k}>
              {i > 0 && ' · '}
              n={k} → <strong className="text-text-secondary">{fmtSeconds(k * Math.log10(2) - 9)}</strong>
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}
