'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, StepForward } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const BLUE = '#60A5FA'

const CAP = 3
// A fixed access stream chosen so LRU and FIFO diverge clearly on the same input.
const SEQUENCE = ['A', 'B', 'C', 'A', 'B', 'D', 'A', 'B', 'C', 'D']

type Policy = 'LRU' | 'FIFO'

type Step = {
  item: string
  hit: boolean
  accessedSlot: number
  evictedItem: string | null
  evictedSlot: number | null
  slots: (string | null)[]
  note: string
}

// Deterministic simulation. Both policies evict the slot with the smallest
// "stamp"; the only difference is what the stamp means: for LRU it is the time
// of the LAST access (hits refresh it); for FIFO it is the insertion time
// (hits do NOT refresh it).
function simulate(seq: string[], cap: number, policy: Policy): Step[] {
  const slots: (string | null)[] = Array(cap).fill(null)
  const stamps: number[] = Array(cap).fill(0)
  let clock = 0
  const steps: Step[] = []

  for (const item of seq) {
    clock++
    const found = slots.indexOf(item)
    if (found >= 0) {
      if (policy === 'LRU') stamps[found] = clock // refresh recency
      steps.push({
        item,
        hit: true,
        accessedSlot: found,
        evictedItem: null,
        evictedSlot: null,
        slots: [...slots],
        note: `hit — ${item} already cached`,
      })
      continue
    }

    // Miss: fill an empty slot if one exists, else evict the victim.
    let target = slots.indexOf(null)
    let evictedItem: string | null = null
    let evictedSlot: number | null = null
    if (target < 0) {
      target = 0
      for (let i = 1; i < cap; i++) if (stamps[i] < stamps[target]) target = i
      evictedSlot = target
      evictedItem = slots[target]
    }
    slots[target] = item
    stamps[target] = clock
    steps.push({
      item,
      hit: false,
      accessedSlot: target,
      evictedItem,
      evictedSlot,
      slots: [...slots],
      note: evictedItem
        ? `miss — evict ${policy === 'LRU' ? 'least-recently-used' : 'oldest-loaded'} (${evictedItem}), load ${item}`
        : `miss — load ${item} into empty slot`,
    })
  }
  return steps
}

export function CacheEvictionAnimation() {
  const [policy, setPolicy] = useState<Policy>('LRU')
  const [idx, setIdx] = useState(-1) // -1 = nothing processed yet
  const [running, setRunning] = useState(false)
  const timerRef = useRef<number | null>(null)

  const steps = useMemo(() => simulate(SEQUENCE, CAP, policy), [policy])

  const cur = idx >= 0 && idx < steps.length ? steps[idx] : null
  const slots = cur ? cur.slots : Array(CAP).fill(null)

  const hits = idx >= 0 ? steps.slice(0, idx + 1).filter(s => s.hit).length : 0
  const total = idx + 1
  const misses = total - hits
  const hitRate = total > 0 ? hits / total : 0

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // Auto-advance loop while running (setTimeout chain; deterministic, no rAF needed for DOM).
  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setIdx(steps.length - 1) // static final frame
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    if (!running || !visible) return
    if (idx >= steps.length - 1) {
      setRunning(false)
      return
    }
    timerRef.current = window.setTimeout(() => setIdx(i => Math.min(i + 1, steps.length - 1)), 900)
    return clearTimer
  }, [running, idx, steps.length, visible])


  const play = useCallback(() => {
    if (idx >= steps.length - 1) setIdx(-1)
    setRunning(r => !r)
  }, [idx, steps.length])

  const step = useCallback(() => {
    setRunning(false)
    setIdx(i => Math.min(i + 1, steps.length - 1))
  }, [steps.length])

  const reset = useCallback(() => {
    clearTimer()
    setRunning(false)
    setIdx(-1)
    triggerReset()
  }, [triggerReset])

  const changePolicy = (p: Policy) => {
    clearTimer()
    setRunning(false)
    setPolicy(p)
    setIdx(-1)
  }

  useEffect(() => clearTimer, [])

  const slotColor = (i: number): string => {
    if (!cur) return 'bg-bg-hover border-border text-text-secondary'
    if (cur.hit && i === cur.accessedSlot) return 'border-accent-teal text-accent-teal bg-accent-teal/15'
    if (!cur.hit && i === cur.accessedSlot) return 'border-accent-orange text-accent-orange bg-accent-orange/15'
    return 'bg-bg-hover border-border text-text-secondary'
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label" style={{ color: BLUE }}><Play size={13} /> Interactive · Cache Eviction</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas" style={{ background: 'var(--color-canvas)' }}>
        {/* Policy toggle */}
        <div className="flex items-center gap-1 mb-4">
          <span className="text-xs text-text-muted mr-2">Eviction policy:</span>
          {(['LRU', 'FIFO'] as Policy[]).map(p => (
            <button
              key={p}
              onClick={() => changePolicy(p)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
                policy === p
                  ? 'text-bg-base border-transparent'
                  : 'bg-bg-surface border-border text-text-secondary hover:bg-bg-hover'
              }`}
              style={policy === p ? { background: BLUE } : undefined}
            >
              {p}
            </button>
          ))}
          <span className="text-[10px] text-text-muted ml-2">
            {policy === 'LRU' ? 'evict least-recently-used' : 'evict oldest-loaded'}
          </span>
        </div>

        {/* Access sequence */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {SEQUENCE.map((s, i) => {
            const done = i <= idx
            const isCur = i === idx
            return (
              <div
                key={i}
                className={`flex items-center justify-center rounded-md border text-xs font-mono font-bold transition-all duration-300 ${
                  isCur
                    ? 'scale-110 border-accent-gold text-accent-gold bg-accent-gold/15'
                    : done
                    ? 'border-border text-text-muted opacity-50'
                    : 'border-border text-text-secondary'
                }`}
                style={{ width: 30, height: 30 }}
              >
                {s}
              </div>
            )
          })}
        </div>

        {/* Cache slots */}
        <div className="flex items-end gap-3 mb-3">
          {slots.map((v, i) => {
            const justEvicted = cur && !cur.hit && cur.evictedSlot === i
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <span className="text-[9px] text-text-muted font-mono">slot {i}</span>
                <div
                  className={`flex items-center justify-center rounded-lg border-2 text-lg font-mono font-bold transition-all duration-300 ${slotColor(i)}`}
                  style={{ width: 56, height: 56 }}
                >
                  {v ?? <span className="text-text-muted text-xs">—</span>}
                </div>
                <span className="text-[9px] font-mono h-3" style={{ color: justEvicted ? '#F87171' : 'transparent' }}>
                  evicted
                </span>
              </div>
            )
          })}
        </div>

        {/* Current action note */}
        <div className="text-xs font-mono h-4" style={{ color: cur ? (cur.hit ? '#10B981' : '#F87171') : 'rgba(255,245,235,0.5)' }}>
          {cur ? `${cur.item} → ${cur.note}` : 'press Play or Step to run the access stream'}
        </div>
      </div>

      {/* Readout */}
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>policy = <strong style={{ color: BLUE }}>{policy}</strong></span>
        <span>hits = <strong className="text-accent-teal">{hits}</strong></span>
        <span>misses = <strong className="text-accent-orange">{misses}</strong></span>
        <span>accesses = {total}</span>
        <span>hit rate = <strong style={{ color: BLUE }}>{(hitRate * 100).toFixed(0)}%</strong></span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button onClick={play}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button onClick={step}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors">
          <StepForward size={12} /> Step
        </button>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          Access <strong className="text-accent-gold">{Math.max(0, idx + 1)}</strong> / {steps.length}
        </WidgetStatus>
      </div>
    </div>
  )
}
