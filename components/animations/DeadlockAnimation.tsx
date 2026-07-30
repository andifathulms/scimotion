'use client'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Play, RotateCcw, StepForward } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

// Two threads, two locks. Deadlock needs a CIRCULAR WAIT: T1 holds A and wants
// B, while T2 holds B and wants A. Neither will ever release, so both block
// forever. Enforcing a single global lock order (always A before B) breaks the
// cycle: one thread simply waits for the other to finish, then proceeds.

const BLUE = '#60A5FA' // field accent
const GOLD = '#F59E0B'
const GREEN = '#10B981'
const RED = '#EF4444'
const MUTE = 'rgba(245,240,232,0.45)'

type Owner = 0 | 1 | 2 // 0 = free

type Step = {
  holdA: Owner
  holdB: Owner
  wantA: Owner // thread blocked waiting for A (0 = none)
  wantB: Owner
  deadlock: boolean
  done: boolean
  message: string
}

// Inconsistent order → circular wait → deadlock.
const INCONSISTENT: Step[] = [
  { holdA: 0, holdB: 0, wantA: 0, wantB: 0, deadlock: false, done: false, message: 'Two threads start. T1 will take A then B; T2 will take B then A (opposite order).' },
  { holdA: 1, holdB: 0, wantA: 0, wantB: 0, deadlock: false, done: false, message: 'T1 acquires Lock A.' },
  { holdA: 1, holdB: 2, wantA: 0, wantB: 0, deadlock: false, done: false, message: 'T2 acquires Lock B.' },
  { holdA: 1, holdB: 2, wantA: 0, wantB: 1, deadlock: false, done: false, message: 'T1 now wants Lock B — but T2 holds it. T1 blocks.' },
  { holdA: 1, holdB: 2, wantA: 2, wantB: 1, deadlock: false, done: false, message: 'T2 now wants Lock A — but T1 holds it. T2 blocks.' },
  { holdA: 1, holdB: 2, wantA: 2, wantB: 1, deadlock: true, done: false, message: 'DEADLOCK. Wait-for cycle T1 → B → T2 → A → T1. Neither thread can ever proceed.' },
]

// Consistent global order (A before B) → no cycle → progress.
const CONSISTENT: Step[] = [
  { holdA: 0, holdB: 0, wantA: 0, wantB: 0, deadlock: false, done: false, message: 'Both threads follow one global order: acquire A, then B.' },
  { holdA: 1, holdB: 0, wantA: 0, wantB: 0, deadlock: false, done: false, message: 'T1 acquires Lock A first.' },
  { holdA: 1, holdB: 0, wantA: 2, wantB: 0, deadlock: false, done: false, message: 'T2 also wants A first — it is taken, so T2 simply waits (no cycle: T1 owes nothing to T2).' },
  { holdA: 1, holdB: 1, wantA: 2, wantB: 0, deadlock: false, done: false, message: 'T1 acquires Lock B and runs its critical section.' },
  { holdA: 0, holdB: 0, wantA: 2, wantB: 0, deadlock: false, done: false, message: 'T1 releases B and A. The waiting thread can now advance.' },
  { holdA: 2, holdB: 0, wantA: 0, wantB: 0, deadlock: false, done: false, message: 'T2 acquires A, then B, and runs.' },
  { holdA: 0, holdB: 0, wantA: 0, wantB: 0, deadlock: false, done: true, message: 'T2 releases both locks. Both threads finished — no deadlock.' },
]

export function DeadlockAnimation() {
  const [ordered, setOrdered] = useState(false) // false = inconsistent (deadlocks)
  const [step, setStep] = useState(0)
  const [running, setRunning] = useState(false)
  const rafRef = useRef<number>(0)

  const steps = useMemo(() => (ordered ? CONSISTENT : INCONSISTENT), [ordered])

  useEffect(() => {
    setStep(0)
    setRunning(false)
  }, [ordered])

  const onTrigger = useCallback((reduced: boolean) => {
    if (reduced) setStep(999) // one static final frame, no loop
    else setRunning(true)
  }, [])
  const { ref } = useAnimationTrigger({ onTrigger })

  useEffect(() => {
    if (!running) return
    let last = 0
    const tick = (t: number) => {
      if (!last) last = t
      if (t - last >= 1100) {
        last = t
        setStep(s => {
          if (s >= steps.length - 1) {
            setRunning(false)
            return s
          }
          return s + 1
        })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, steps])

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    setStep(0)
  }, [])

  const idx = Math.min(step, steps.length - 1)
  const cur = steps[idx]

  // Node coordinates: threads on the left, locks on the right.
  const W = 600
  const H = 260
  const T1 = { x: 90, y: 70 }
  const T2 = { x: 90, y: 190 }
  const LA = { x: 490, y: 70 }
  const LB = { x: 490, y: 190 }
  const box = 46

  const threadColor = (t: 1 | 2) => (t === 1 ? BLUE : GOLD)

  // A hold edge: thread → lock (solid). A wait edge: thread → lock (dashed).
  const edge = (from: { x: number; y: number }, to: { x: number; y: number }, color: string, dashed: boolean, key: string) => {
    // Trim endpoints to the node boxes.
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const sx = from.x + ux * (box / 2 + 6)
    const sy = from.y + uy * (box / 2 + 6)
    const ex = to.x - ux * (box / 2 + 12)
    const ey = to.y - uy * (box / 2 + 12)
    return (
      <g key={key}>
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth={dashed ? 2 : 2.5}
          strokeDasharray={dashed ? '6 5' : undefined} markerEnd={`url(#arrow-${dashed ? 'd' : 's'}-${key})`} />
        <defs>
          <marker id={`arrow-${dashed ? 'd' : 's'}-${key}`} markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={color} />
          </marker>
        </defs>
      </g>
    )
  }

  const node = (p: { x: number; y: number }, label: string, sub: string, color: string, filled: boolean) => (
    <g>
      <rect x={p.x - box / 2} y={p.y - box / 2} width={box} height={box} rx={10}
        fill={filled ? `${color}22` : 'rgba(255,255,255,0.02)'} stroke={color} strokeWidth={filled ? 2.4 : 1.3} />
      <text x={p.x} y={p.y - 2} textAnchor="middle" fontSize={14} fill={color} fontFamily="monospace" fontWeight={700}>{label}</text>
      <text x={p.x} y={p.y + 14} textAnchor="middle" fontSize={9} fill={MUTE} fontFamily="monospace">{sub}</text>
    </g>
  )

  const holderName = (o: Owner) => (o === 0 ? 'free' : `T${o}`)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Deadlock &amp; Lock Ordering</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg" style={{ background: '#0F0D0A' }}>
          {/* Hold edges (thread holds lock): solid, thread-colored */}
          {cur.holdA !== 0 && edge(cur.holdA === 1 ? T1 : T2, LA, threadColor(cur.holdA), false, 'hA')}
          {cur.holdB !== 0 && edge(cur.holdB === 1 ? T1 : T2, LB, threadColor(cur.holdB), false, 'hB')}
          {/* Wait edges (thread wants lock): dashed. Red when part of a deadlock cycle. */}
          {cur.wantA !== 0 && edge(cur.wantA === 1 ? T1 : T2, LA, cur.deadlock ? RED : MUTE, true, 'wA')}
          {cur.wantB !== 0 && edge(cur.wantB === 1 ? T1 : T2, LB, cur.deadlock ? RED : MUTE, true, 'wB')}

          {node(T1, 'T1', cur.done ? 'done' : cur.deadlock ? 'stuck' : 'run', threadColor(1),
            cur.holdA === 1 || cur.holdB === 1)}
          {node(T2, 'T2', cur.done ? 'done' : cur.deadlock ? 'stuck' : (cur.wantA === 2 || cur.wantB === 2) ? 'wait' : 'run', threadColor(2),
            cur.holdA === 2 || cur.holdB === 2)}
          {node(LA, 'A', holderName(cur.holdA), cur.holdA ? threadColor(cur.holdA) : GREEN, cur.holdA !== 0)}
          {node(LB, 'B', holderName(cur.holdB), cur.holdB ? threadColor(cur.holdB) : GREEN, cur.holdB !== 0)}

          {/* Legend */}
          <text x={300} y={244} textAnchor="middle" fontSize={10} fill={MUTE} fontFamily="monospace">
            solid = holds · dashed = waiting for
          </text>

          {cur.deadlock && (
            <text x={300} y={24} textAnchor="middle" fontSize={13} fill={RED} fontFamily="monospace" fontWeight={700}>
              circular wait — DEADLOCK
            </text>
          )}
          {cur.done && (
            <text x={300} y={24} textAnchor="middle" fontSize={13} fill={GREEN} fontFamily="monospace" fontWeight={700}>
              both threads completed
            </text>
          )}
        </svg>
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span style={{ color: BLUE }}>T1 holds: {cur.holdA === 1 ? 'A' : ''}{cur.holdB === 1 ? 'B' : ''}{cur.holdA !== 1 && cur.holdB !== 1 ? '—' : ''}</span>
        <span style={{ color: GOLD }}>T2 holds: {cur.holdA === 2 ? 'A' : ''}{cur.holdB === 2 ? 'B' : ''}{cur.holdA !== 2 && cur.holdB !== 2 ? '—' : ''}</span>
        <span>Lock A: {holderName(cur.holdA)}</span>
        <span>Lock B: {holderName(cur.holdB)}</span>
        <span className={cur.deadlock ? 'text-accent-orange' : cur.done ? 'text-accent-teal' : 'text-text-muted'}>
          state: {cur.deadlock ? 'DEADLOCK' : cur.done ? 'completed' : 'running'}
        </span>
        <span className="text-accent-gold ml-auto">Step {idx}/{steps.length - 1}</span>
      </div>

      <div className="px-3 py-2 text-xs font-mono text-text-secondary border-t border-border">
        {cur.message}
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => { if (idx >= steps.length - 1) setStep(0); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base">
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <button onClick={() => { setRunning(false); setStep(s => Math.min(s + 1, steps.length - 1)) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors">
          <StepForward size={12} /> Step
        </button>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          <button onClick={() => setOrdered(false)}
            className={`px-3 py-1.5 font-mono transition-colors ${!ordered ? 'text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}
            style={!ordered ? { background: RED } : undefined}>
            inconsistent order
          </button>
          <button onClick={() => setOrdered(true)}
            className={`px-3 py-1.5 font-mono transition-colors ${ordered ? 'bg-accent-teal text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
            global lock order
          </button>
        </div>
      </div>
    </div>
  )
}
