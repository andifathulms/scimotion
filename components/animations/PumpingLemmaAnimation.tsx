'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 620
const H = 344

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'

const DIM = 'rgba(245,240,232,0.42)'
const FAINT_LINE = 'rgba(255,245,235,0.12)'

// A concrete 5-state machine reading only 'a'. Transition on 'a':
//   s0 -> s1 -> s2 -> s3 -> s4 -> s2 (back to s2) ...
// A short tail (s0,s1) then an unavoidable 3-cycle (s2,s3,s4). Any machine with
// k states must loop like this once it reads more than k symbols — that is the
// pigeonhole principle, and this is one concrete instance of it.
const K = 5
const TR = [1, 2, 3, 4, 2]
const NODE_X = [70, 185, 300, 415, 530]
const NODE_Y = 96
const R = 28

function walk(n: number): number[] {
  const v = [0]
  for (let i = 0; i < n; i++) v.push(TR[v[v.length - 1]])
  return v
}

// First pigeonhole collision: smallest j with visited[j] === visited[i], i < j.
function collision(v: number[]): { i: number; j: number; state: number } | null {
  const seen = new Map<number, number>()
  for (let j = 0; j < v.length; j++) {
    const s = v[j]
    if (seen.has(s)) return { i: seen.get(s)!, j, state: s }
    seen.set(s, j)
  }
  return null
}

const MIN_N = 3
const MAX_N = 12
const AUTOPLAY_MS = 620

export function PumpingLemmaAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [n, setN] = useState(7) // number of a's read (target string is aⁿbⁿ)
  const [step, setStep] = useState(0) // walk position 0..n
  const [playing, setPlaying] = useState(false)

  const visited = useMemo(() => walk(n), [n])
  const col = useMemo(() => collision(visited), [visited])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setStep(n); return }
      setStep(0)
      setPlaying(true)
    },
  })

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      setStep(prev => {
        if (prev >= n) { setPlaying(false); return prev }
        return prev + 1
      })
    }, AUTOPLAY_MS)
    return () => window.clearInterval(id)
  }, [playing, n])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // ---- heading ----
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = BLUE
    ctx.fillText(`Why aⁿbⁿ is impossible for a ${K}-state machine`, 16, 22)
    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('Read the a’s one by one. Only 5 states exist — a long enough run must revisit one.', 16, 38)

    const revealed = visited.slice(0, step + 1)
    const active = visited[step]
    const collided = col !== null && step >= col.j

    // ---- transitions along the row ----
    for (let s = 0; s < K; s++) {
      const t = TR[s]
      const from = NODE_X[s]
      const to = NODE_X[t]
      if (t === s + 1) {
        // straight forward edge
        ctx.strokeStyle = `${BLUE}77`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(from + R, NODE_Y)
        ctx.lineTo(to - R, NODE_Y)
        ctx.stroke()
        ctx.fillStyle = `${BLUE}77`
        ctx.beginPath()
        ctx.moveTo(to - R, NODE_Y)
        ctx.lineTo(to - R - 8, NODE_Y - 4)
        ctx.lineTo(to - R - 8, NODE_Y + 4)
        ctx.closePath()
        ctx.fill()
      } else {
        // the back-edge s4 -> s2: the loop
        const lit = collided
        ctx.strokeStyle = lit ? GOLD : `${VIOLET}88`
        ctx.lineWidth = lit ? 3 : 1.75
        ctx.beginPath()
        ctx.moveTo(from - 6, NODE_Y + R)
        ctx.bezierCurveTo(from - 40, NODE_Y + 96, to + 40, NODE_Y + 96, to + 6, NODE_Y + R)
        ctx.stroke()
        ctx.fillStyle = lit ? GOLD : `${VIOLET}88`
        ctx.beginPath()
        ctx.moveTo(to + 6, NODE_Y + R)
        ctx.lineTo(to + 2, NODE_Y + R + 10)
        ctx.lineTo(to + 14, NODE_Y + R + 6)
        ctx.closePath()
        ctx.fill()
        ctx.font = 'bold 10px monospace'
        ctx.fillStyle = lit ? GOLD : VIOLET
        ctx.textAlign = 'center'
        ctx.fillText('loop on a', (from + to) / 2, NODE_Y + R + 78)
        ctx.textAlign = 'left'
      }
    }

    // ---- state nodes ----
    for (let s = 0; s < K; s++) {
      const x = NODE_X[s]
      const isActive = s === active
      const inLoop = collided && col !== null && (s === 2 || s === 3 || s === 4)
      const col2 = isActive ? GOLD : inLoop ? VIOLET : BLUE
      if (isActive) {
        const g = ctx.createRadialGradient(x, NODE_Y, 0, x, NODE_Y, 44)
        g.addColorStop(0, `${GOLD}44`)
        g.addColorStop(1, `${GOLD}00`)
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(x, NODE_Y, 44, 0, Math.PI * 2); ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(x, NODE_Y, R, 0, Math.PI * 2)
      ctx.fillStyle = isActive ? `${GOLD}22` : 'rgba(26,23,18,0.9)'
      ctx.fill()
      ctx.strokeStyle = col2
      ctx.lineWidth = isActive ? 3 : 2
      ctx.stroke()
      ctx.font = 'bold 13px monospace'
      ctx.fillStyle = col2
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`s${s}`, x, NODE_Y)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }

    // start arrow
    ctx.strokeStyle = DIM
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(NODE_X[0] - 56, NODE_Y); ctx.lineTo(NODE_X[0] - R - 4, NODE_Y); ctx.stroke()
    ctx.fillStyle = DIM
    ctx.beginPath()
    ctx.moveTo(NODE_X[0] - R - 4, NODE_Y)
    ctx.lineTo(NODE_X[0] - R - 12, NODE_Y - 4)
    ctx.lineTo(NODE_X[0] - R - 12, NODE_Y + 4)
    ctx.closePath(); ctx.fill()

    // ---- position → state strip (the pigeonhole made visible) ----
    const stripY = 224
    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('position:', 16, stripY - 14)
    const slots = visited.length
    const x0 = 78
    const dx = Math.min(44, (W - x0 - 24) / Math.max(1, slots - 1))
    for (let p = 0; p < slots; p++) {
      const x = x0 + p * dx
      const on = p <= step
      const isColl = col !== null && (p === col.i || p === col.j) && step >= col.j
      ctx.fillStyle = isColl ? GOLD : on ? `${BLUE}` : DIM
      ctx.beginPath()
      ctx.arc(x, stripY, isColl ? 8 : 6, 0, Math.PI * 2)
      ctx.fillStyle = isColl ? `${GOLD}33` : on ? `${BLUE}22` : 'rgba(255,245,235,0.03)'
      ctx.fill()
      ctx.strokeStyle = isColl ? GOLD : on ? BLUE : FAINT_LINE
      ctx.lineWidth = isColl ? 2 : 1
      ctx.stroke()
      ctx.font = '9px monospace'
      ctx.fillStyle = isColl ? GOLD : on ? 'rgba(245,240,232,0.7)' : DIM
      ctx.textAlign = 'center'
      ctx.fillText(`s${visited[p]}`, x, stripY + 3.5)
      ctx.fillStyle = DIM
      ctx.fillText(String(p), x, stripY - 14)
      ctx.textAlign = 'left'
    }
    // collision arc linking the two equal states
    if (col !== null && step >= col.j) {
      const xi = x0 + col.i * dx
      const xj = x0 + col.j * dx
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(xi, stripY + 10)
      ctx.quadraticCurveTo((xi + xj) / 2, stripY + 40, xj, stripY + 10)
      ctx.stroke()
      ctx.font = 'bold 9px monospace'
      ctx.fillStyle = GOLD
      ctx.textAlign = 'center'
      ctx.fillText(`same state s${col.state} → loop`, (xi + xj) / 2, stripY + 42)
      ctx.textAlign = 'left'
    }

    // ---- verdict / decomposition panel ----
    const py = 276
    ctx.strokeStyle = FAINT_LINE
    ctx.lineWidth = 1
    ctx.strokeRect(16, py, W - 32, 58)

    ctx.font = '10px monospace'
    if (col === null || step < col.j) {
      ctx.fillStyle = DIM
      ctx.fillText(`Read ${step} of ${n} a’s.  ${step + 1} positions visited, using ${new Set(revealed).size} distinct states.`, 28, py + 22)
      ctx.fillStyle = n < K ? PINK : GOLD
      ctx.fillText(
        n < K
          ? `Only ${n} a’s — fewer than ${K} states, so no repeat is forced yet. Raise n above ${K - 1}.`
          : 'Keep stepping — the run is about to revisit a state.',
        28, py + 40,
      )
    } else {
      const i = col.i, j = col.j, loopLen = j - i
      ctx.fillStyle = GOLD
      ctx.fillText(`Pigeonhole: ${n + 1} positions but only ${K} states → position ${i} and ${j} are both s${col.state}.`, 28, py + 18)
      ctx.fillStyle = 'rgba(245,240,232,0.75)'
      ctx.fillText(`Split aⁿ = x·y·z:  x=a^${i}  y=a^${loopLen} (the loop)  z=a^${n - j}.  Pump y twice:`, 28, py + 34)
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = PINK
      ctx.fillText(`x·y²·z·bⁿ = a^${n + loopLen} b^${n}  — accepted, but ${n + loopLen} ≠ ${n}. Contradiction.`, 28, py + 50)
    }
  }, [visited, col, step, n])

  useEffect(() => { draw() }, [draw])

  const setNSafe = (v: number) => {
    setPlaying(false)
    setN(v)
    setStep(0)
  }

  const reset = () => {
    triggerReset()
    setPlaying(false)
    setStep(0)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The pumping lemma</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: The pumping lemma. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span className="font-mono">n (a’s):</span>
          <input
            type="range"
            min={MIN_N}
            max={MAX_N}
            value={n}
            onChange={e => setNSafe(Number(e.target.value))}
            className="w-40 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono font-medium">
            aⁿbⁿ, n = {n}
          </span>
        </label>

        <div className="flex items-center gap-2 text-xs text-text-muted ml-auto">
          <button
            onClick={() => { setPlaying(false); setStep(s => Math.max(0, s - 1)) }}
            disabled={step === 0}
            className="rounded border border-white/10 px-2 py-1 hover:text-text-secondary disabled:opacity-40 transition-colors"
          >
            ← prev
          </button>
          <button
            onClick={() => { setPlaying(false); setStep(s => Math.min(n, s + 1)) }}
            disabled={step >= n}
            className="rounded border border-white/10 px-2 py-1 hover:text-text-secondary disabled:opacity-40 transition-colors"
          >
            step →
          </button>
          <button
            onClick={() => { if (step >= n) setStep(0); setPlaying(p => !p) }}
            className="rounded border border-white/10 px-2 py-1 hover:text-text-secondary transition-colors"
          >
            {playing ? 'pause' : 'play'}
          </button>
          <span className="text-text-secondary font-medium">{step}/{n}</span>
        </div>
      </div>
    </div>
  )
}
