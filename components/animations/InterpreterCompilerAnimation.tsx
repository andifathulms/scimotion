'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

// Two execution models on the SAME three-line program, side by side.
//   COMPILER:    one up-front build (translate every line to machine code), then a fast run.
//   INTERPRETER: no build — walk statement by statement, translating+running each as it goes.
// A "cost" meter tracks build time (orange) vs run time (green) so the tradeoff is visible.

const BLUE = '#60A5FA'
const TEAL = '#2DD4BF'
const ORANGE = '#FB923C'
const MUTE = 'rgba(245,240,232,0.45)'
const DIM = 'rgba(245,240,232,0.78)'

const PROGRAM = ['a = 5', 'b = a + 2', 'print(b * 3)']

// A shared timeline of TOTAL frames; both columns finish together.
const TOTAL = 300
const BUILD_END = 150 // compiler spends the first half building all 3 lines
// Compiler: build lines 0..2 across [0, BUILD_END], then run lines fast across [BUILD_END, TOTAL].
// Interpreter: no build; interpret line k across equal thirds of [0, TOTAL].

type ColState = {
  activeLine: number // -1 = none
  doneLines: number
  phase: string
  buildUnits: number // 0..1 fraction of the meter that is "build" cost
  runUnits: number // 0..1 fraction that is "run" cost
}

function compilerState(f: number): ColState {
  if (f < BUILD_END) {
    const line = Math.min(2, Math.floor((f / BUILD_END) * 3))
    return {
      activeLine: line,
      doneLines: line,
      phase: `Building: translating line ${line + 1} → machine code`,
      buildUnits: (f / TOTAL),
      runUnits: 0,
    }
  }
  const rf = f - BUILD_END
  const span = TOTAL - BUILD_END
  const line = Math.min(2, Math.floor((rf / span) * 3))
  const finished = f >= TOTAL
  return {
    activeLine: finished ? -1 : line,
    doneLines: finished ? 3 : line,
    phase: finished ? 'Done — ran the pre-built machine code fast' : `Running compiled line ${line + 1}`,
    buildUnits: BUILD_END / TOTAL,
    runUnits: (rf / TOTAL),
  }
}

function interpreterState(f: number): ColState {
  const line = Math.min(2, Math.floor((f / TOTAL) * 3))
  const finished = f >= TOTAL
  return {
    activeLine: finished ? -1 : line,
    doneLines: finished ? 3 : line,
    phase: finished ? 'Done — no machine code was ever saved' : `Interpreting line ${line + 1}: read → run, right now`,
    buildUnits: 0,
    runUnits: f / TOTAL,
  }
}

const W = 600
const H = 300

export function InterpreterCompilerAnimation() {
  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setFrame(TOTAL)
      } else {
        setRunning(true)
      }
    },
  })
  const [frame, setFrame] = useState(0)
  const [running, setRunning] = useState(false)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!running || !visible) return
    const tick = () => {
      setFrame(f => {
        if (f >= TOTAL) {
          setRunning(false)
          return TOTAL
        }
        return f + 1
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    }
  }, [running, visible])

  const play = useCallback(() => {
    if (frame >= TOTAL) setFrame(0)
    setRunning(true)
  }, [frame])

  const reset = useCallback(() => {
    setRunning(false)
    setFrame(0)
    triggerReset()
  }, [triggerReset])

  const comp = compilerState(frame)
  const interp = interpreterState(frame)

  const colX = { comp: 24, interp: 316 }
  const colW = 260

  const renderColumn = (
    key: string,
    title: string,
    accent: string,
    st: ColState,
  ) => {
    const x = key === 'comp' ? colX.comp : colX.interp
    return (
      <g>
        <rect x={x} y={16} width={colW} height={252} rx={8} fill="rgba(255,255,255,0.02)" stroke="rgba(255,245,235,0.12)" strokeWidth={1} />
        <text x={x + 14} y={40} fontSize={14} fontFamily="monospace" fill={accent}>
          {title}
        </text>

        {/* program listing */}
        {PROGRAM.map((line, i) => {
          const active = i === st.activeLine
          const done = i < st.doneLines
          const col = active ? accent : done ? TEAL : MUTE
          return (
            <g key={`${key}-line-${i}`}>
              <rect
                x={x + 12}
                y={58 + i * 30}
                width={colW - 24}
                height={26}
                rx={5}
                fill={active ? 'rgba(96,165,250,0.14)' : 'transparent'}
                stroke={active ? accent : 'transparent'}
                strokeWidth={1.4}
              />
              <text x={x + 22} y={76 + i * 30} fontSize={13} fontFamily="monospace" fill={col}>
                {line}
              </text>
              {done && (
                <text x={x + colW - 24} y={76 + i * 30} textAnchor="end" fontSize={11} fontFamily="monospace" fill={TEAL}>
                  ✓
                </text>
              )}
            </g>
          )
        })}

        {/* cost meter */}
        <text x={x + 12} y={176} fontSize={10} fontFamily="monospace" fill={MUTE}>
          cost meter
        </text>
        <rect x={x + 12} y={182} width={colW - 24} height={16} rx={4} fill="rgba(255,255,255,0.05)" />
        <rect x={x + 12} y={182} width={(colW - 24) * st.buildUnits} height={16} rx={4} fill={ORANGE} />
        <rect
          x={x + 12 + (colW - 24) * st.buildUnits}
          y={182}
          width={(colW - 24) * st.runUnits}
          height={16}
          rx={4}
          fill={TEAL}
        />

        {/* legend */}
        <rect x={x + 12} y={210} width={9} height={9} fill={ORANGE} />
        <text x={x + 25} y={218} fontSize={9} fontFamily="monospace" fill={MUTE}>
          build
        </text>
        <rect x={x + 72} y={210} width={9} height={9} fill={TEAL} />
        <text x={x + 85} y={218} fontSize={9} fontFamily="monospace" fill={MUTE}>
          run
        </text>

        {/* phase */}
        <text x={x + 12} y={246} fontSize={10} fontFamily="monospace" fill={DIM}>
          {st.phase.length > 34 ? st.phase.slice(0, 33) + '…' : st.phase}
        </text>
      </g>
    )
  }

  return (
    <div ref={ref} className="animation-block">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }}>
        {renderColumn('comp', 'COMPILER', BLUE, comp)}
        {renderColumn('interp', 'INTERPRETER', ORANGE, interp)}
      </svg>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span style={{ color: BLUE }}>Compiler: {comp.phase}</span>
        <span style={{ color: ORANGE }}>Interpreter: {interp.phase}</span>
        <span className="text-text-muted">Tradeoff: build once, run fast — vs — no build, but pay to translate on every run.</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={play}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Playing…' : 'Play'}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border text-text-secondary hover:bg-bg-hover"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
    </div>
  )
}
