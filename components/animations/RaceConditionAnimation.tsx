'use client'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Play, RotateCcw, StepForward, Lock, Unlock } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

// Two threads each run `count++` on a shared variable. `count++` is NOT atomic:
// it is really LOAD (read count into a register), ADD (register + 1), STORE
// (write the register back). If the two threads interleave those micro-ops,
// both can LOAD the same stale value and one increment is lost.
//
//   load  r ← count      // read
//   add   r ← r + 1      // modify
//   store count ← r      // write

const BLUE = '#60A5FA' // field accent
const GOLD = '#F59E0B'
const GREEN = '#10B981'
const RED = '#EF4444'
const MUTE = 'rgba(245,240,232,0.45)'

type Kind = 'load' | 'add' | 'store'
type Op = { t: 1 | 2; kind: Kind }

type Step = {
  count: number
  r1: number | null
  r2: number | null
  active: 1 | 2 | null
  kind: Kind | null
  message: string
  lostFlag: boolean
}

// A "serial" order: thread 1 fully completes its read-modify-write, then thread 2.
// Result is always 2 — the correct answer.
const SERIAL: Op[] = [
  { t: 1, kind: 'load' }, { t: 1, kind: 'add' }, { t: 1, kind: 'store' },
  { t: 2, kind: 'load' }, { t: 2, kind: 'add' }, { t: 2, kind: 'store' },
]

// A "race" order: both threads LOAD 0 before either STOREs. The second store
// overwrites the first with the same value 1 — a lost update. Result is 1.
const RACE: Op[] = [
  { t: 1, kind: 'load' }, { t: 2, kind: 'load' },
  { t: 1, kind: 'add' }, { t: 2, kind: 'add' },
  { t: 1, kind: 'store' }, { t: 2, kind: 'store' },
]

function opLabel(kind: Kind): string {
  if (kind === 'load') return 'load  r ← count'
  if (kind === 'add') return 'add   r ← r + 1'
  return 'store count ← r'
}

function buildSteps(order: Op[], locked: boolean): Step[] {
  // When a lock guards the critical section, the second thread cannot begin its
  // read-modify-write until the first thread finishes — this forces serial order.
  const seq = locked ? SERIAL : order
  const steps: Step[] = []
  let count = 0
  let r1: number | null = null
  let r2: number | null = null

  steps.push({
    count, r1, r2, active: null, kind: null, lostFlag: false,
    message: locked
      ? 'Lock held per critical section — the second thread must wait. Play to run.'
      : 'Both threads want to run count++. Play to step through the interleaving.',
  })

  for (const op of seq) {
    const reg: number | null = op.t === 1 ? r1 : r2
    let msg = ''
    let lost = false
    if (op.kind === 'load') {
      if (op.t === 1) r1 = count
      else r2 = count
      msg = `T${op.t} LOAD: reads count (=${count}) into its register.`
    } else if (op.kind === 'add') {
      const nv: number = (reg ?? 0) + 1
      if (op.t === 1) r1 = nv
      else r2 = nv
      msg = `T${op.t} ADD: register ${reg} + 1 = ${nv} (still private).`
    } else {
      const prev = count
      count = reg ?? 0
      // A store that writes back a value no larger than the current count means
      // an increment performed by the other thread has just been clobbered.
      lost = !locked && count <= prev
      msg = lost
        ? `T${op.t} STORE: writes ${count} over ${prev} — the other thread's increment is LOST.`
        : `T${op.t} STORE: writes register back, count = ${count}.`
    }
    steps.push({ count, r1, r2, active: op.t, kind: op.kind, message: msg, lostFlag: lost })
  }

  const final = count
  steps.push({
    count, r1, r2, active: null, kind: null, lostFlag: final !== 2,
    message:
      final === 2
        ? 'Done: count = 2 = expected. Every increment survived.'
        : `Done: count = ${final}, but expected 2. An update was lost to the data race.`,
  })
  return steps
}

export function RaceConditionAnimation() {
  const [locked, setLocked] = useState(false)
  const [mode, setMode] = useState<'serial' | 'race'>('race')
  const [step, setStep] = useState(0)
  const [running, setRunning] = useState(false)
  const rafRef = useRef<number>(0)

  const steps = useMemo(
    () => buildSteps(mode === 'serial' ? SERIAL : RACE, locked),
    [mode, locked],
  )

  // Reset the walkthrough whenever the interleaving or lock changes.
  useEffect(() => {
    setStep(0)
    setRunning(false)
  }, [mode, locked])

  const onTrigger = useCallback((reduced: boolean) => {
    if (reduced) setStep(999) // one static final frame, no loop
    else setRunning(true)
  }, [])
  const { ref } = useAnimationTrigger({ onTrigger })

  // rAF stepping loop (no setInterval): advance roughly once per 1000ms.
  useEffect(() => {
    if (!running) return
    let last = 0
    const tick = (t: number) => {
      if (!last) last = t
      if (t - last >= 1000) {
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
  const expected = 2
  const isLoss = cur.count < expected && idx === steps.length - 1

  // Layout for the two threads and shared memory.
  const W = 600
  const H = 260

  const thread = (t: 1 | 2, x: number) => {
    const reg = t === 1 ? cur.r1 : cur.r2
    const on = cur.active === t
    const color = t === 1 ? BLUE : GOLD
    return (
      <g>
        <rect x={x} y={30} width={200} height={150} rx={8}
          fill="rgba(255,255,255,0.02)" stroke={on ? color : 'rgba(255,245,235,0.15)'} strokeWidth={on ? 2 : 1} />
        <text x={x + 14} y={54} fontSize={13} fill={color} fontFamily="monospace" fontWeight={600}>
          Thread {t}
        </text>
        {(['load', 'add', 'store'] as Kind[]).map((k, i) => {
          const activeLine = on && cur.kind === k
          return (
            <text key={k} x={x + 14} y={82 + i * 24} fontSize={11.5}
              fill={activeLine ? color : MUTE} fontFamily="monospace" fontWeight={activeLine ? 600 : 400}>
              {opLabel(k)}
            </text>
          )
        })}
        <text x={x + 14} y={166} fontSize={12} fill={reg === null ? MUTE : GREEN} fontFamily="monospace">
          register r = {reg === null ? '—' : reg}
        </text>
      </g>
    )
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Race Condition on count++</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }}>
          {thread(1, 30)}
          {thread(2, 370)}

          {/* Shared memory in the middle */}
          <rect x={250} y={80} width={100} height={64} rx={8}
            fill={isLoss ? 'rgba(239,68,68,0.12)' : 'rgba(96,165,250,0.10)'}
            stroke={isLoss ? RED : BLUE} strokeWidth={cur.lostFlag ? 2.5 : 1.5} />
          <text x={300} y={102} textAnchor="middle" fontSize={11} fill={MUTE} fontFamily="monospace">shared</text>
          <text x={300} y={128} textAnchor="middle" fontSize={22} fill={isLoss ? RED : BLUE} fontFamily="monospace" fontWeight={700}>
            {cur.count}
          </text>
          <text x={300} y={168} textAnchor="middle" fontSize={11} fill={MUTE} fontFamily="monospace">count</text>

          {cur.lostFlag && (
            <text x={300} y={205} textAnchor="middle" fontSize={12} fill={RED} fontFamily="monospace" fontWeight={600}>
              lost update!
            </text>
          )}
        </svg>
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span style={{ color: BLUE }}>T1.r = {cur.r1 === null ? '—' : cur.r1}</span>
        <span style={{ color: GOLD }}>T2.r = {cur.r2 === null ? '—' : cur.r2}</span>
        <span>count = {cur.count}</span>
        <span>expected = {expected}</span>
        <span className={cur.count === expected ? 'text-accent-teal' : 'text-text-muted'}>
          result: {idx === steps.length - 1 ? (cur.count === expected ? 'correct' : 'WRONG — update lost') : '…running'}
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
        <button onClick={() => setLocked(l => !l)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${locked ? 'border-accent-teal text-accent-teal' : 'border-border text-text-secondary hover:bg-bg-hover'}`}>
          {locked ? <Lock size={12} /> : <Unlock size={12} />} {locked ? 'Lock: on' : 'Lock: off'}
        </button>
        {!locked && (
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            <button onClick={() => setMode('race')}
              className={`px-3 py-1.5 font-mono transition-colors ${mode === 'race' ? 'text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}
              style={mode === 'race' ? { background: BLUE } : undefined}>
              bad interleaving
            </button>
            <button onClick={() => setMode('serial')}
              className={`px-3 py-1.5 font-mono transition-colors ${mode === 'serial' ? 'bg-accent-teal text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              safe interleaving
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
