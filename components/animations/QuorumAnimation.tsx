'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw, Shuffle } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GOLD = '#F59E0B'
const GREEN = '#10B981'
const PINK = '#F472B6'

const X0 = 44
const XW = 512
const ROW_Y = 132
const ROW_H = 34
const BAND_H = 26
const A_Y = ROW_Y - 46
const B_Y = ROW_Y + ROW_H + 20

const majority = (n: number) => Math.floor(n / 2) + 1
const tolerance = (n: number) => Math.floor((n - 1) / 2)

function firstK(n: number, k: number) {
  return Array.from({ length: n }, (_, i) => i < k)
}

function lastK(n: number, k: number) {
  return Array.from({ length: n }, (_, i) => i >= n - k)
}

export function QuorumAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [n, setN] = useState(5)
  const [qa, setQa] = useState<boolean[]>(() => firstK(5, 3))
  const [qb, setQb] = useState<boolean[]>(() => lastK(5, 3))
  const [pulse, setPulse] = useState(0)
  const pulseRef = useRef(0)

  const sizeA = qa.filter(Boolean).length
  const sizeB = qb.filter(Boolean).length
  const overlap = qa.reduce((acc, v, i) => acc + (v && qb[i] ? 1 : 0), 0)
  const bound = sizeA + sizeB - n
  const bothMajority = sizeA >= majority(n) && sizeB >= majority(n)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const p = pulseRef.current
    const cw = XW / n

    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,245,235,0.35)'
    ctx.fillText(`cluster of N = ${n}`, X0, 22)

    // Quorum A band.
    ctx.fillStyle = BLUE
    ctx.font = '9px monospace'
    ctx.fillText(`quorum A · ${sizeA}`, X0, A_Y - 8)
    ctx.fillStyle = VIOLET
    ctx.fillText(`quorum B · ${sizeB}`, X0, B_Y + BAND_H + 15)

    for (let i = 0; i < n; i++) {
      const x = X0 + i * cw
      const shared = qa[i] && qb[i]

      // Shared column highlight, running the full height of both bands.
      if (shared) {
        ctx.fillStyle = `rgba(245,158,11,${0.09 + 0.06 * p})`
        ctx.fillRect(x + 1, A_Y - 4, cw - 2, B_Y + BAND_H + 4 - (A_Y - 4))
      }

      if (qa[i]) {
        ctx.fillStyle = shared ? 'rgba(245,158,11,0.24)' : 'rgba(96,165,250,0.20)'
        ctx.fillRect(x + 3, A_Y, cw - 6, BAND_H)
        ctx.strokeStyle = shared ? GOLD : BLUE
        ctx.lineWidth = 1.2
        ctx.strokeRect(x + 3, A_Y, cw - 6, BAND_H)
      } else {
        ctx.strokeStyle = 'rgba(255,245,235,0.07)'
        ctx.lineWidth = 1
        ctx.strokeRect(x + 3, A_Y, cw - 6, BAND_H)
      }

      if (qb[i]) {
        ctx.fillStyle = shared ? 'rgba(245,158,11,0.24)' : 'rgba(167,139,250,0.20)'
        ctx.fillRect(x + 3, B_Y, cw - 6, BAND_H)
        ctx.strokeStyle = shared ? GOLD : VIOLET
        ctx.lineWidth = 1.2
        ctx.strokeRect(x + 3, B_Y, cw - 6, BAND_H)
      } else {
        ctx.strokeStyle = 'rgba(255,245,235,0.07)'
        ctx.lineWidth = 1
        ctx.strokeRect(x + 3, B_Y, cw - 6, BAND_H)
      }

      // The server itself.
      const cx = x + cw / 2
      const cy = ROW_Y + ROW_H / 2
      const r = Math.min(15, cw / 2 - 5)
      if (shared) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r + 12 + p * 4)
        g.addColorStop(0, 'rgba(245,158,11,0.45)')
        g.addColorStop(1, 'rgba(245,158,11,0)')
        ctx.beginPath()
        ctx.arc(cx, cy, r + 12 + p * 4, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      const col = shared ? GOLD : qa[i] ? BLUE : qb[i] ? VIOLET : 'rgba(255,245,235,0.25)'
      ctx.fillStyle = shared ? 'rgba(245,158,11,0.18)' : 'rgba(26,23,18,0.9)'
      ctx.fill()
      ctx.strokeStyle = col
      ctx.lineWidth = shared ? 2.2 : 1.4
      ctx.stroke()
      ctx.fillStyle = col
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(String(i), cx, cy + 3.5)
    }

    // Arithmetic readout.
    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    const line1 = `|A| + |B| − N  =  ${sizeA} + ${sizeB} − ${n}  =  ${bound}`
    ctx.fillStyle = 'rgba(255,245,235,0.55)'
    ctx.fillText(line1, X0, H - 44)

    ctx.fillStyle = overlap > 0 ? GOLD : PINK
    ctx.fillText(
      overlap > 0
        ? `shared servers: ${overlap}   (forced minimum ${Math.max(0, bound)})`
        : 'shared servers: 0 — these two quorums are disjoint',
      X0, H - 27
    )

    ctx.fillStyle = bothMajority ? GREEN : PINK
    ctx.font = '10px monospace'
    ctx.fillText(
      bothMajority
        ? `both are majorities (≥ ${majority(n)}) → overlap is guaranteed, conflicting decisions impossible`
        : `not both majorities (need ≥ ${majority(n)}) → two quorums can miss each other and decide differently`,
      X0, H - 10
    )

    // Failure-tolerance strip, top right.
    ctx.textAlign = 'right'
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.35)'
    ctx.fillText(`majority = ⌊N/2⌋+1 = ${majority(n)}`, X0 + XW, 22)
    ctx.fillStyle = n % 2 === 0 ? PINK : GREEN
    ctx.fillText(
      n % 2 === 0
        ? `tolerates f = ${tolerance(n)} failures — same as N = ${n - 1}`
        : `tolerates f = ${tolerance(n)} failures  (N = 2f+1)`,
      X0 + XW, 36
    )
  }, [n, qa, qb, sizeA, sizeB, overlap, bound, bothMajority])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (pulse === 0) {
      pulseRef.current = 0
      draw()
      return
    }
    let t = 0
    const loop = () => {
      t += 0.05
      pulseRef.current = (Math.sin(t) + 1) / 2
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [pulse, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setPulse(1)
    },
  })

  const setSize = (next: number) => {
    setN(next)
    setQa(firstK(next, majority(next)))
    setQb(lastK(next, majority(next)))
  }

  const toggle = (which: 'a' | 'b', i: number) => {
    const set = which === 'a' ? setQa : setQb
    set(prev => prev.map((v, k) => (k === i ? !v : v)))
  }

  const randomize = () => {
    const pick = () => {
      const k = majority(n) + Math.floor(Math.random() * (n - majority(n) + 1))
      const idx = Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - 0.5).slice(0, k)
      return Array.from({ length: n }, (_, i) => idx.includes(i))
    }
    setQa(pick())
    setQb(pick())
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setPulse(0)
    setSize(5)
    triggerReset()
  }

  const chip = (which: 'a' | 'b', on: boolean, i: number) => (
    <button
      key={`${which}${i}`}
      onClick={() => toggle(which, i)}
      className={`w-7 h-7 rounded text-xs font-mono border transition-colors ${
        on
          ? which === 'a'
            ? 'border-accent-blue text-accent-blue bg-accent-blue/10'
            : 'border-accent-violet text-accent-violet bg-accent-violet/10'
          : 'border-border text-text-muted hover:bg-bg-hover'
      }`}
    >
      {i}
    </button>
  )

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Quorum Intersection</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-accent-blue w-16">A</span>
          {qa.map((v, i) => chip('a', v, i))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-accent-violet w-16">B</span>
          {qb.map((v, i) => chip('b', v, i))}
        </div>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>N:</span>
          <input type="range" min={3} max={9} step={1} value={n}
            onChange={e => setSize(+e.target.value)}
            className="w-24 accent-accent-gold" />
          <span className="font-mono text-text-secondary">{n}</span>
        </label>
        <button onClick={randomize}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors">
          <Shuffle size={12} /> Random quorums
        </button>
        <span className="ml-auto text-xs font-mono text-text-secondary">
          overlap {overlap} · tolerates f = {tolerance(n)}
        </span>
      </div>
    </div>
  )
}
