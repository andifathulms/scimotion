'use client'
import { useState, useEffect, useCallback } from 'react'
import { Play, Pause, RotateCcw, Shuffle } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

type StepState = { lo: number; hi: number; mid: number; found: boolean; notFound: boolean }

function makeArray(size: number): number[] {
  const arr = Array.from({ length: size }, (_, i) => (i + 1) * Math.floor(100 / size) + Math.floor(Math.random() * 4))
  arr.sort((a, b) => a - b)
  const seen = new Set<number>()
  return arr.map(v => { while (seen.has(v)) v++; seen.add(v); return v })
}

function binarySearchSteps(arr: number[], target: number): StepState[] {
  const steps: StepState[] = []
  let lo = 0, hi = arr.length - 1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (arr[mid] === target) {
      steps.push({ lo, hi, mid, found: true, notFound: false })
      return steps
    }
    steps.push({ lo, hi, mid, found: false, notFound: false })
    if (arr[mid] < target) lo = mid + 1
    else hi = mid - 1
  }
  steps.push({ lo, hi, mid: -1, found: false, notFound: true })
  return steps
}

export function BinarySearchAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const [arr, setArr] = useState<number[]>(() => makeArray(18))
  const [target, setTarget] = useState<number>(0)
  const [steps, setSteps] = useState<StepState[]>([])
  const [stepIdx, setStepIdx] = useState(-1)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(700)
  const [comparisons, setComparisons] = useState(0)

  useEffect(() => {
    const mid = arr[Math.floor(arr.length / 2)]
    setTarget(mid)
  }, [arr])

  const buildSteps = useCallback((a: number[], t: number) => {
    const s = binarySearchSteps(a, t)
    setSteps(s)
    setStepIdx(-1)
    setComparisons(0)
    setRunning(false)
  }, [])

  useEffect(() => { buildSteps(arr, target) }, [arr, target, buildSteps])

  useEffect(() => {
    if (triggered && stepIdx === -1) {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setRunning(true)
    }
  }, [triggered]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setStepIdx(i => {
        const next = i + 1
        if (next >= steps.length) { setRunning(false); return i }
        setComparisons(c => c + 1)
        return next
      })
    }, speed)
    return () => clearInterval(id)
  }, [running, steps, speed])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setStepIdx(-1)
    setComparisons(0)
  }

  const shuffle = () => {
    const a = makeArray(18)
    setArr(a)
  }

  const cur = stepIdx >= 0 && stepIdx < steps.length ? steps[stepIdx] : null

  const getCellClass = (i: number) => {
    if (!cur) return 'bg-bg-hover border-border text-text-secondary'
    if (cur.found && i === cur.mid) return 'bg-accent-teal/20 border-accent-teal text-accent-teal font-bold scale-110'
    if (cur.notFound) return 'bg-transparent border-border/30 text-text-muted opacity-40'
    if (i === cur.mid) return 'bg-accent-orange/20 border-accent-orange text-accent-orange font-bold'
    if (i < cur.lo || i > cur.hi) return 'bg-transparent border-border/30 text-text-muted opacity-30'
    if (i === cur.lo || i === cur.hi) return 'bg-accent-violet/10 border-accent-violet/40 text-accent-violet'
    return 'bg-bg-hover border-border text-text-secondary'
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Binary Search</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: 160 }}>
        {/* Target display */}
        <div className="flex items-center gap-3 mb-4 text-sm">
          <span className="text-text-muted">Searching for</span>
          <span className="px-3 py-1 rounded-lg font-mono font-bold text-accent-gold border border-accent-gold/30 bg-accent-gold/10 text-base">{target}</span>
          {cur?.found && <span className="text-accent-teal text-xs font-medium">✓ Found at index {cur.mid} in {comparisons} step{comparisons !== 1 ? 's' : ''}!</span>}
          {cur?.notFound && <span className="text-accent-orange text-xs font-medium">✗ Not in array after {comparisons} steps</span>}
        </div>

        {/* Array cells */}
        <div className="flex flex-wrap gap-1.5">
          {arr.map((v, i) => (
            <div
              key={i}
              className={`flex flex-col items-center justify-center rounded-lg border text-xs font-mono transition-all duration-300 ${getCellClass(i)}`}
              style={{ width: 36, height: 36 }}
            >
              <span className="font-bold leading-none">{v}</span>
            </div>
          ))}
        </div>

        {/* Index row */}
        <div className="flex flex-wrap gap-1.5 mt-1">
          {arr.map((_, i) => (
            <div key={i} className="flex items-center justify-center text-[9px] text-text-muted font-mono" style={{ width: 36 }}>
              {i}
            </div>
          ))}
        </div>

        {/* Pointer labels */}
        {cur && !cur.notFound && (
          <div className="flex gap-3 mt-3 text-xs flex-wrap">
            <span className="text-accent-violet">lo={cur.lo}</span>
            <span className="text-accent-orange">mid={cur.mid}</span>
            <span className="text-accent-violet">hi={cur.hi}</span>
            {!cur.found && stepIdx >= 0 && (
              <span className="text-text-muted ml-2">
                {arr[cur.mid] < target ? `${arr[cur.mid]} < ${target} → search right` : `${arr[cur.mid]} > ${target} → search left`}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { if (stepIdx >= steps.length - 1) resetAll(); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button onClick={shuffle} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors">
          <Shuffle size={12} /> New array
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Target:</span>
          <select
            value={target}
            onChange={e => { setTarget(+e.target.value); setStepIdx(-1); setRunning(false) }}
            className="px-2 py-1 rounded border border-border bg-bg-surface text-xs text-text-secondary"
          >
            {arr.map(v => <option key={v} value={v}>{v}</option>)}
            <option value={arr[arr.length - 1] + 7}>
              {arr[arr.length - 1] + 7} (not in array)
            </option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Speed:</span>
          <input type="range" min={200} max={1500} step={100} value={1700 - speed}
            onChange={e => setSpeed(1700 - +e.target.value)}
            className="w-20 accent-accent-gold"
          />
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          Step <strong className="text-accent-gold">{Math.max(0, stepIdx + 1)}</strong> / {steps.length}
        </span>
      </div>
    </div>
  )
}
