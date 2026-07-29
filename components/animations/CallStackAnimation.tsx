'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, RotateCcw, StepForward } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

// The call stack made concrete: computing factorial(n) by descending into
// factorial(n-1), factorial(n-2), … until the base case, then unwinding as each
// frame returns its value and the results multiply back up.
//
//   factorial(n):
//     if n <= 1: return 1        // base case — stops the descent
//     return n * factorial(n-1)  // recursive case — one frame deeper

type Phase = 'push' | 'base' | 'pop' | 'idle'
type Frame = { arg: number; value: number | null }
type Step = { frames: Frame[]; message: string; highlight: 'top' | 'base' | null; phase: Phase }

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const GREEN = '#10B981'
const MUTE = 'rgba(245,240,232,0.45)'

function buildSteps(n: number): Step[] {
  const steps: Step[] = []
  const frames: Frame[] = []
  const clone = () => frames.map(f => ({ ...f }))

  steps.push({ frames: [], message: `Ready — call factorial(${n}) to start the descent.`, highlight: null, phase: 'idle' })

  // Descent: push a frame for each call, from n down to the base case.
  for (let k = n; k >= 1; k--) {
    frames.push({ arg: k, value: null })
    if (k > 1) {
      steps.push({
        frames: clone(),
        message: `factorial(${k}): since ${k} > 1, it must wait for factorial(${k - 1}). Push a new frame.`,
        highlight: 'top',
        phase: 'push',
      })
    } else {
      steps.push({
        frames: clone(),
        message: `factorial(1): base case reached — return 1 immediately, no deeper call.`,
        highlight: 'base',
        phase: 'base',
      })
      frames[frames.length - 1].value = 1
    }
  }

  // Unwind: pop the base frame, then combine each returning value on the way up.
  let carried = 1
  frames.pop()
  steps.push({
    frames: clone(),
    message: `factorial(1) returns 1 to factorial(2). Pop the base frame.`,
    highlight: 'top',
    phase: 'pop',
  })

  for (let k = 2; k <= n; k++) {
    const top = frames[frames.length - 1]
    top.value = k * carried
    steps.push({
      frames: clone(),
      message: `factorial(${k}) = ${k} × ${carried} = ${top.value}.`,
      highlight: 'top',
      phase: 'pop',
    })
    carried = top.value
    frames.pop()
    steps.push({
      frames: clone(),
      message:
        k < n
          ? `factorial(${k}) returns ${carried} to factorial(${k + 1}). Pop its frame.`
          : `factorial(${n}) returns ${carried} — the stack is empty.`,
      highlight: k < n ? 'top' : null,
      phase: 'pop',
    })
  }

  steps.push({
    frames: [],
    message: `Done — factorial(${n}) = ${carried}. Every frame was pushed on the way down and popped on the way up.`,
    highlight: null,
    phase: 'idle',
  })

  return steps
}

const INPUTS = [3, 4, 5, 6, 7]

export function CallStackAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const [n, setN] = useState(5)
  const [steps, setSteps] = useState(() => buildSteps(5))
  const [step, setStep] = useState(0)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => {
    const s = buildSteps(n)
    setSteps(s)
    setStep(0)
    setRunning(false)
    clearInterval(intervalRef.current)
  }, [n])

  useEffect(() => {
    if (!running) {
      clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      setStep(s => {
        if (s >= steps.length - 1) {
          setRunning(false)
          return s
        }
        return s + 1
      })
    }, 900)
    return () => clearInterval(intervalRef.current)
  }, [running, steps])

  useEffect(() => {
    if (triggered && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRunning(true)
    }
  }, [triggered])

  const reset = useCallback(() => {
    clearInterval(intervalRef.current)
    setRunning(false)
    setStep(0)
    triggerReset()
  }, [triggerReset])

  const current = steps[Math.min(step, steps.length - 1)]
  const frames = current.frames

  // Layout: stack grows upward. Frame 0 (factorial(n)) sits at the bottom;
  // the deepest call is at the top.
  const W = 600
  const H = 300
  const frameH = 30
  const gap = 6
  const baseY = 264
  const cx = 300

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The Call Stack</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg" style={{ background: '#0F0D0A' }}>
          {/* Stack baseline */}
          <line x1={cx - 130} y1={baseY + 3} x2={cx + 130} y2={baseY + 3} stroke="rgba(255,245,235,0.18)" strokeWidth={1.5} />
          <text x={cx} y={baseY + 20} textAnchor="middle" fontSize={11} fill={MUTE} fontFamily="monospace">
            call stack (grows upward)
          </text>

          {frames.length === 0 && (
            <text x={cx} y={150} textAnchor="middle" fontSize={13} fill={MUTE} fontFamily="monospace">
              stack empty
            </text>
          )}

          {frames.map((f, i) => {
            const y = baseY - (i + 1) * (frameH + gap)
            const isTop = i === frames.length - 1
            const isBase = f.arg === 1
            const highlighted =
              (current.highlight === 'top' && isTop) || (current.highlight === 'base' && isBase)
            const returned = f.value !== null
            const stroke = isBase ? GOLD : returned ? GREEN : BLUE
            const fill = isBase ? 'rgba(245,158,11,0.14)' : returned ? 'rgba(16,185,129,0.14)' : 'rgba(96,165,250,0.12)'
            return (
              <g key={`${i}-${f.arg}`}>
                <rect
                  x={cx - 120}
                  y={y}
                  width={240}
                  height={frameH}
                  rx={5}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={highlighted ? 2.5 : 1.25}
                />
                <text x={cx - 108} y={y + 20} fontSize={13} fill={stroke} fontFamily="monospace">
                  factorial({f.arg})
                </text>
                <text x={cx + 108} y={y + 20} textAnchor="end" fontSize={12} fill={returned ? GREEN : MUTE} fontFamily="monospace">
                  {returned ? `→ ${f.value}` : '…'}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Step message */}
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary">
        <span className="text-accent-gold mr-2">Step {step}/{steps.length - 1}</span>
        {current.message}
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <button onClick={() => { setRunning(false); setStep(s => Math.min(s + 1, steps.length - 1)) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors">
          <StepForward size={12} /> Step
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="font-mono">n =</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {INPUTS.map(v => (
              <button key={v} onClick={() => setN(v)}
                className={`px-3 py-1.5 font-mono transition-colors ${n === v ? 'bg-accent-blue text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
