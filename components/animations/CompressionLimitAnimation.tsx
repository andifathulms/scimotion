'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const ACCENT = '#60A5FA'
const N = 3 // input length in bits

// All 2^N inputs of length N.
function allInputs(n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < (1 << n); i++) out.push(i.toString(2).padStart(n, '0'))
  return out
}

// Every bit-string strictly shorter than N: lengths 0..N-1. Count = 2^N - 1.
function shorterStrings(n: number): string[] {
  const out: string[] = ['λ'] // the empty string
  for (let len = 1; len < n; len++) {
    for (let i = 0; i < (1 << len); i++) out.push(i.toString(2).padStart(len, '0'))
  }
  return out
}

// Deterministic example payloads (no randomness).
const STRUCTURED = '000000000000000000000000' // 24 bits, all identical → highly redundant
const RANDOMISH = '011010011100101101001110' // 24 fixed "high-entropy" bits

export function CompressionLimitAnimation() {
  const inputs = useMemo(() => allInputs(N), [])
  const slots = useMemo(() => shorterStrings(N), [])
  const slotCount = slots.length // 2^N - 1

  const [mode, setMode] = useState<'structured' | 'random'>('structured')
  // assignIdx: how many inputs have been routed so far (0..inputs.length)
  const [assignIdx, setAssignIdx] = useState(0)
  const [running, setRunning] = useState(false)
  const rafRef = useRef<number>(0)
  const lastTickRef = useRef<number>(0)

  const { ref, triggered, visible } = useAnimationTrigger({
    onTrigger: (reduced) => {
      if (reduced) setAssignIdx(inputs.length) // static final frame
      else setRunning(true)
    },
  })

  const done = assignIdx >= inputs.length

  useEffect(() => {
    if (!running || !visible) return
    const tick = (t: number) => {
      if (lastTickRef.current === 0) lastTickRef.current = t
      if (t - lastTickRef.current >= 650) {
        lastTickRef.current = t
        setAssignIdx(i => {
          if (i >= inputs.length) { setRunning(false); return i }
          return i + 1
        })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, inputs.length, visible])

  useEffect(() => {
    if (assignIdx >= inputs.length) setRunning(false)
  }, [assignIdx, inputs.length])

  const reset = useCallback(() => {
    setRunning(false)
    lastTickRef.current = 0
    setAssignIdx(0)
  }, [])

  const play = () => {
    if (done) { setAssignIdx(0); lastTickRef.current = 0; setRunning(true); return }
    lastTickRef.current = 0
    setRunning(r => !r)
  }

  const stepOnce = () => {
    setRunning(false)
    setAssignIdx(i => Math.min(inputs.length, i + 1))
  }

  // Example-string comparison driven by the toggle.
  const example = mode === 'structured' ? STRUCTURED : RANDOMISH
  const origBits = example.length
  const compBits = mode === 'structured' ? 8 : origBits + 1
  const verdict = mode === 'structured'
    ? 'Exploits redundancy → shrinks a lot'
    : 'No structure to exploit → cannot shrink'

  // How many inputs got a short slot vs. how many overflow.
  const routed = Math.min(assignIdx, inputs.length)
  const overflowCount = Math.max(0, routed - slotCount)

  return (
    <div ref={ref} className="animation-block">
      {/* Pigeonhole panel */}
      <div className="rounded-lg bg-bg-surface border border-border p-3 mb-2">
        <div className="text-[11px] text-text-muted mb-3">
          A lossless compressor must send every distinct input to a distinct output.
          There are <span style={{ color: ACCENT }}>{inputs.length}</span> inputs of length {N},
          but only <span className="text-accent-orange">{slotCount}</span> strings shorter than {N}.
        </div>
        <div className="flex items-start justify-between gap-2" style={{ minHeight: 170 }}>
          {/* inputs column */}
          <div className="flex flex-col gap-1">
            <div className="text-[10px] text-text-muted mb-0.5">{N}-bit inputs</div>
            {inputs.map((inp, i) => {
              const isRouted = i < routed
              const overflow = isRouted && i >= slotCount
              return (
                <div
                  key={inp}
                  className="font-mono text-xs rounded px-2 py-0.5 border transition-colors"
                  style={{
                    borderColor: overflow ? '#F59E0B' : isRouted ? ACCENT : 'var(--border,#2a2723)',
                    background: overflow ? 'rgba(245,158,11,0.12)' : isRouted ? 'rgba(96,165,250,0.10)' : 'transparent',
                    color: overflow ? '#F59E0B' : isRouted ? ACCENT : undefined,
                  }}
                >
                  {inp}
                </div>
              )
            })}
          </div>

          {/* arrow */}
          <div className="flex flex-col items-center justify-center self-center text-text-muted">
            <span className="text-[10px] mb-1">compress</span>
            <span style={{ fontSize: 20 }}>→</span>
          </div>

          {/* slots column */}
          <div className="flex flex-col gap-1">
            <div className="text-[10px] text-text-muted mb-0.5">shorter outputs</div>
            {slots.map((s, i) => {
              const filled = i < Math.min(routed, slotCount)
              return (
                <div
                  key={s}
                  className="font-mono text-xs rounded px-2 py-0.5 border transition-colors"
                  style={{
                    borderColor: filled ? ACCENT : 'var(--border,#2a2723)',
                    background: filled ? 'rgba(96,165,250,0.10)' : 'transparent',
                    color: filled ? ACCENT : 'var(--text-muted,#8a857d)',
                  }}
                >
                  {s}
                </div>
              )
            })}
            {overflowCount > 0 && (
              <div
                className="font-mono text-xs rounded px-2 py-0.5 border"
                style={{ borderColor: '#F59E0B', background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}
              >
                ≥{N} bits!
              </div>
            )}
          </div>
        </div>
        {overflowCount > 0 && (
          <div className="text-[11px] text-accent-orange mt-2">
            Pigeonhole: {overflowCount} input{overflowCount !== 1 ? 's have' : ' has'} no short slot left — it must map to an
            equal-or-longer output. No scheme shrinks <em>every</em> file.
          </div>
        )}
      </div>

      {/* Structured vs random example */}
      <div className="rounded-lg bg-bg-surface border border-border p-3 mb-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] text-text-muted">Try compressing:</span>
          <button
            onClick={() => setMode('structured')}
            className="px-2 py-0.5 rounded text-[11px] font-medium border transition-colors"
            style={mode === 'structured'
              ? { borderColor: ACCENT, color: ACCENT, background: 'rgba(96,165,250,0.12)' }
              : { borderColor: 'var(--border,#2a2723)' }}
          >
            structured
          </button>
          <button
            onClick={() => setMode('random')}
            className="px-2 py-0.5 rounded text-[11px] font-medium border transition-colors"
            style={mode === 'random'
              ? { borderColor: ACCENT, color: ACCENT, background: 'rgba(96,165,250,0.12)' }
              : { borderColor: 'var(--border,#2a2723)' }}
          >
            random
          </button>
        </div>
        <div className="font-mono text-[11px] break-all text-text-secondary mb-2">{example}</div>
        <div className="flex items-center gap-2 text-[10px] text-text-muted">
          <span className="w-14">original</span>
          <div className="h-2.5 rounded bg-bg-hover" style={{ width: 220 }}>
            <div className="h-2.5 rounded" style={{ width: 220, background: 'rgba(245,240,232,0.35)' }} />
          </div>
          <span>{origBits} bits</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-text-muted mt-1">
          <span className="w-14">compressed</span>
          <div className="h-2.5 rounded bg-bg-hover" style={{ width: 220 }}>
            <div
              className="h-2.5 rounded transition-all"
              style={{ width: Math.min(220, (compBits / origBits) * 220), background: mode === 'structured' ? ACCENT : '#F59E0B' }}
            />
          </div>
          <span style={{ color: mode === 'structured' ? ACCENT : '#F59E0B' }}>{compBits} bits</span>
        </div>
      </div>

      {/* Readout */}
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>Original: <span className="text-text-secondary">{origBits}</span> bits</span>
        <span>Compressed: <span style={{ color: mode === 'structured' ? ACCENT : '#F59E0B' }}>{compBits}</span> bits</span>
        <span>Verdict: <span style={{ color: mode === 'structured' ? ACCENT : '#F59E0B' }}>{verdict}</span></span>
        <WidgetStatus className="ml-auto">Routed {routed} / {inputs.length}</WidgetStatus>
      </div>

      {/* Controls */}
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={play}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {done ? 'Replay' : running ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={stepOnce}
          disabled={done}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border text-text-secondary hover:bg-bg-hover disabled:opacity-40"
        >
          Step
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border text-text-secondary hover:bg-bg-hover"
        >
          <RotateCcw size={12} /> Reset
        </button>
        {!triggered && <span className="text-[11px] text-text-muted self-center">Scroll into view to start</span>}
      </div>
    </div>
  )
}
