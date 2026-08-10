'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

// A tiny source line flowing through the four classic compiler stages:
//   x = 2 + 3 * y   →  tokens  →  AST (with * binding tighter than +)  →  machine code
// Each stage is highlighted in turn and its output revealed below.

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const TEAL = '#2DD4BF'
const ORANGE = '#FB923C'
const MUTE = 'rgba(245,240,232,0.45)'
const DIM = 'rgba(245,240,232,0.75)'

const STAGES = [
  { name: 'SOURCE TEXT', desc: 'the raw characters you typed — meaningless to the CPU' },
  { name: 'LEXER', desc: 'scans the text into a stream of tokens' },
  { name: 'PARSER', desc: 'assembles tokens into an abstract syntax tree' },
  { name: 'CODE GEN', desc: 'emits machine-like instructions the CPU can run' },
] as const

const TOKENS = [
  { text: 'x', kind: 'ident' },
  { text: '=', kind: 'op' },
  { text: '2', kind: 'num' },
  { text: '+', kind: 'op' },
  { text: '3', kind: 'num' },
  { text: '*', kind: 'op' },
  { text: 'y', kind: 'ident' },
]

const KIND_COLOR: Record<string, string> = { ident: BLUE, op: GOLD, num: TEAL }

// AST nodes: assignment with (2 + (3 * y)); * is deeper than +, so it binds tighter.
type Node = { id: string; label: string; x: number; y: number; color: string }
const NODES: Node[] = [
  { id: 'assign', label: '=', x: 300, y: 44, color: GOLD },
  { id: 'x', label: 'x', x: 190, y: 108, color: BLUE },
  { id: 'plus', label: '+', x: 400, y: 108, color: GOLD },
  { id: 'two', label: '2', x: 330, y: 172, color: TEAL },
  { id: 'star', label: '*', x: 470, y: 172, color: GOLD },
  { id: 'three', label: '3', x: 410, y: 236, color: TEAL },
  { id: 'y', label: 'y', x: 530, y: 236, color: BLUE },
]
const EDGES: [string, string][] = [
  ['assign', 'x'],
  ['assign', 'plus'],
  ['plus', 'two'],
  ['plus', 'star'],
  ['star', 'three'],
  ['star', 'y'],
]
const NODE_BY_ID = Object.fromEntries(NODES.map(n => [n.id, n]))

const CODE = [
  'LOAD  R1, 3',
  'LOAD  R2, y',
  'MUL   R1, R1, R2   ; 3 * y',
  'LOAD  R2, 2',
  'ADD   R1, R2, R1   ; 2 + (3*y)',
  'STORE x,  R1',
]

const W = 600
const H = 300
const FRAMES_PER_STAGE = 78

export function CompilerPipelineAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setStage(STAGES.length - 1)
      } else {
        setRunning(true)
      }
    },
  })
  const [stage, setStage] = useState(0)
  const [running, setRunning] = useState(false)
  const rafRef = useRef<number | undefined>(undefined)
  const frameRef = useRef(0)

  useEffect(() => {
    if (!running) return
    const tick = () => {
      frameRef.current += 1
      if (frameRef.current >= FRAMES_PER_STAGE) {
        frameRef.current = 0
        setStage(s => {
          if (s >= STAGES.length - 1) {
            setRunning(false)
            return s
          }
          return s + 1
        })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    }
  }, [running])

  const play = useCallback(() => {
    if (stage >= STAGES.length - 1) {
      setStage(0)
      frameRef.current = 0
    }
    setRunning(true)
  }, [stage])

  const stepFwd = useCallback(() => {
    setRunning(false)
    frameRef.current = 0
    setStage(s => Math.min(s + 1, STAGES.length - 1))
  }, [])

  const reset = useCallback(() => {
    setRunning(false)
    frameRef.current = 0
    setStage(0)
    triggerReset()
  }, [triggerReset])

  const current = STAGES[stage]

  return (
    <div ref={ref} className="animation-block">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }}>
        {/* Pipeline bar */}
        {STAGES.map((s, i) => {
          const bw = 132
          const gap = 12
          const x = 18 + i * (bw + gap)
          const active = i === stage
          const done = i < stage
          const col = active ? BLUE : done ? TEAL : MUTE
          return (
            <g key={s.name}>
              <rect
                x={x}
                y={16}
                width={bw}
                height={30}
                rx={6}
                fill={active ? 'rgba(96,165,250,0.16)' : 'transparent'}
                stroke={col}
                strokeWidth={active ? 2 : 1}
              />
              <text x={x + bw / 2} y={35} textAnchor="middle" fontSize={12} fontFamily="monospace" fill={col}>
                {s.name}
              </text>
              {i < STAGES.length - 1 && (
                <text x={x + bw + gap / 2} y={35} textAnchor="middle" fontSize={13} fill={i < stage ? TEAL : MUTE}>
                  →
                </text>
              )}
            </g>
          )
        })}

        {/* Stage output area */}
        <text x={W / 2} y={78} textAnchor="middle" fontSize={11} fontFamily="monospace" fill={MUTE}>
          {current.desc}
        </text>

        {/* Stage 0: source text */}
        {stage === 0 && (
          <text x={W / 2} y={170} textAnchor="middle" fontSize={26} fontFamily="monospace" fill={DIM}>
            x = 2 + 3 * y
          </text>
        )}

        {/* Stage 1: token stream */}
        {stage === 1 &&
          (() => {
            let cx = 40
            return TOKENS.map(t => {
              const tw = 20 + t.text.length * 11
              const el = (
                <g key={`tok-${cx}`}>
                  <rect x={cx} y={140} width={tw} height={44} rx={6} fill="rgba(255,255,255,0.04)" stroke={KIND_COLOR[t.kind]} strokeWidth={1.4} />
                  <text x={cx + tw / 2} y={162} textAnchor="middle" fontSize={16} fontFamily="monospace" fill={KIND_COLOR[t.kind]}>
                    {t.text}
                  </text>
                  <text x={cx + tw / 2} y={177} textAnchor="middle" fontSize={8} fontFamily="monospace" fill={MUTE}>
                    {t.kind}
                  </text>
                </g>
              )
              cx += tw + 10
              return el
            })
          })()}

        {/* Stage 2: AST */}
        {stage === 2 && (
          <g>
            {EDGES.map(([a, b]) => {
              const na = NODE_BY_ID[a]
              const nb = NODE_BY_ID[b]
              return <line key={`${a}-${b}`} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} stroke="rgba(255,245,235,0.25)" strokeWidth={1.5} />
            })}
            {NODES.map(n => (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r={16} fill="#0F0D0A" stroke={n.color} strokeWidth={1.8} />
                <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize={15} fontFamily="monospace" fill={n.color}>
                  {n.label}
                </text>
              </g>
            ))}
            <text x={498} y={172} fontSize={9} fontFamily="monospace" fill={MUTE}>
              * is deeper → binds tighter
            </text>
          </g>
        )}

        {/* Stage 3: generated code */}
        {stage === 3 &&
          CODE.map((line, i) => (
            <text key={line} x={90} y={110 + i * 26} fontSize={14} fontFamily="monospace" fill={i < 5 ? ORANGE : GOLD}>
              {line}
            </text>
          ))}
      </svg>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span style={{ color: BLUE }}>
          Stage {stage + 1}/4: {current.name}
        </span>
        <span>{current.desc}</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={play}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Playing…' : 'Play'}
        </button>
        <button
          onClick={stepFwd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border text-text-secondary hover:bg-bg-hover"
        >
          <Play size={12} /> Step
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
