'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, RotateCcw, StepForward } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

type Node = { id: number; x: number; y: number; label: string }
type Edge = [number, number]
type NodeState = 'unvisited' | 'queued' | 'visited' | 'current'

const NODES: Node[] = [
  { id: 0, x: 300, y: 40,  label: 'A' },
  { id: 1, x: 160, y: 110, label: 'B' },
  { id: 2, x: 440, y: 110, label: 'C' },
  { id: 3, x: 80,  y: 200, label: 'D' },
  { id: 4, x: 230, y: 200, label: 'E' },
  { id: 5, x: 370, y: 200, label: 'F' },
  { id: 6, x: 520, y: 200, label: 'G' },
  { id: 7, x: 140, y: 290, label: 'H' },
  { id: 8, x: 300, y: 290, label: 'I' },
]
const EDGES: Edge[] = [
  [0,1],[0,2],[1,3],[1,4],[2,5],[2,6],[3,7],[4,8],[5,8]
]

const ADJ: number[][] = Array.from({ length: NODES.length }, () => [])
EDGES.forEach(([a, b]) => { ADJ[a].push(b); ADJ[b].push(a) })

type Mode = 'bfs' | 'dfs'

function computeSteps(mode: Mode): { states: NodeState[]; frontier: number[]; visited: number[]; message: string }[] {
  const steps: { states: NodeState[]; frontier: number[]; visited: number[]; message: string }[] = []
  const visited = new Set<number>()
  const order: number[] = []

  const baseState = (): NodeState[] => NODES.map(() => 'unvisited')

  const snap = (curr: number, frontier: number[], msg: string) => {
    const s = baseState()
    order.forEach(n => { s[n] = 'visited' })
    frontier.forEach(n => { if (s[n] !== 'visited') s[n] = 'queued' })
    if (curr >= 0) s[curr] = 'current'
    steps.push({ states: s, frontier: [...frontier], visited: [...order], message: msg })
  }

  snap(-1, [], 'Start: select a node to begin')

  if (mode === 'bfs') {
    const queue = [0]
    visited.add(0)
    snap(0, queue, `Enqueue A (start)`)
    while (queue.length) {
      const curr = queue.shift()!
      order.push(curr)
      snap(curr, queue, `Visit ${NODES[curr].label}`)
      for (const nb of ADJ[curr]) {
        if (!visited.has(nb)) {
          visited.add(nb)
          queue.push(nb)
          snap(curr, queue, `Enqueue ${NODES[nb].label} (neighbor of ${NODES[curr].label})`)
        }
      }
    }
  } else {
    const stack = [0]
    const inStack = new Set([0])
    snap(0, stack, `Push A (start)`)
    while (stack.length) {
      const curr = stack.pop()!
      if (visited.has(curr)) continue
      visited.add(curr)
      order.push(curr)
      snap(curr, stack, `Visit ${NODES[curr].label}`)
      for (const nb of [...ADJ[curr]].reverse()) {
        if (!visited.has(nb) && !inStack.has(nb)) {
          inStack.add(nb)
          stack.push(nb)
          snap(curr, stack, `Push ${NODES[nb].label} (neighbor of ${NODES[curr].label})`)
        }
      }
    }
  }

  snap(-1, [], `Done — visited ${order.map(n => NODES[n].label).join(' → ')}`)
  return steps
}

const NODE_COLORS: Record<NodeState, { fill: string; stroke: string; text: string }> = {
  unvisited: { fill: '#1A1712', stroke: 'rgba(255,245,235,0.2)', text: 'rgba(255,245,235,0.5)' },
  queued:    { fill: 'rgba(251,146,60,0.15)', stroke: '#FB923C', text: '#FB923C' },
  current:   { fill: 'rgba(245,158,11,0.3)', stroke: '#F59E0B', text: '#F59E0B' },
  visited:   { fill: 'rgba(16,185,129,0.15)', stroke: '#10B981', text: '#10B981' },
}

export function GraphTraversalAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<Mode>('bfs')
  const [steps, setSteps] = useState(() => computeSteps('bfs'))
  const [step, setStep] = useState(0)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const drawStep = useCallback((s: number, stps: typeof steps) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, 600, 340)

    const current = stps[Math.min(s, stps.length - 1)]

    // Edges
    EDGES.forEach(([a, b]) => {
      const na = NODES[a]; const nb = NODES[b]
      const aVis = current.states[a] === 'visited' || current.states[a] === 'current'
      const bVis = current.states[b] === 'visited' || current.states[b] === 'current'
      ctx.beginPath()
      ctx.moveTo(na.x, na.y)
      ctx.lineTo(nb.x, nb.y)
      ctx.strokeStyle = aVis && bVis ? 'rgba(16,185,129,0.5)' : 'rgba(255,245,235,0.1)'
      ctx.lineWidth = aVis && bVis ? 2 : 1.5
      ctx.stroke()
    })

    // Nodes
    NODES.forEach(n => {
      const st = current.states[n.id]
      const col = NODE_COLORS[st]
      ctx.beginPath()
      ctx.arc(n.x, n.y, 22, 0, Math.PI * 2)
      ctx.fillStyle = col.fill
      ctx.fill()
      ctx.strokeStyle = col.stroke
      ctx.lineWidth = st === 'current' ? 3 : 2
      ctx.stroke()
      if (st === 'current') {
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 34)
        g.addColorStop(0, 'rgba(245,158,11,0.25)')
        g.addColorStop(1, 'rgba(245,158,11,0)')
        ctx.beginPath(); ctx.arc(n.x, n.y, 34, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      }
      ctx.fillStyle = col.text
      ctx.font = 'bold 13px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(n.label, n.x, n.y)
    })

    // Visit order badges
    current.visited.forEach((nId, i) => {
      const n = NODES[nId]
      ctx.fillStyle = '#0F0D0A'
      ctx.beginPath(); ctx.arc(n.x + 16, n.y - 16, 9, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#10B981'
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), n.x + 16, n.y - 16)
    })

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }, [])

  useEffect(() => {
    const s = computeSteps(mode)
    setSteps(s)
    setStep(0)
    setRunning(false)
    clearInterval(intervalRef.current)
    drawStep(0, s)
  }, [mode, drawStep])

  useEffect(() => { drawStep(step, steps) }, [step, steps, drawStep])

  useEffect(() => {
    if (!running) { clearInterval(intervalRef.current); return }
    intervalRef.current = setInterval(() => {
      setStep(s => {
        if (s >= steps.length - 1) { setRunning(false); return s }
        return s + 1
      })
    }, 800)
    return () => clearInterval(intervalRef.current)
  }, [running, steps])

  useEffect(() => {
    if (triggered && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) setRunning(true)
  }, [triggered])

  const reset = () => {
    clearInterval(intervalRef.current)
    setRunning(false)
    setStep(0)
    triggerReset()
  }

  const current = steps[Math.min(step, steps.length - 1)]

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Graph Traversal</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: Graph Traversal. Values are reported below the diagram." ref={canvasRef} width={600} height={340} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      {/* Step message */}
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary">
        <span className="text-accent-gold mr-2">Step {step}/{steps.length - 1}</span>
        {current?.message}
      </div>

      {/* Frontier display */}
      {current?.frontier.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="text-accent-orange font-mono">{mode === 'bfs' ? 'Queue' : 'Stack'}:</span>
          <div className="flex gap-1">
            {current.frontier.map((n, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-bg-hover border border-accent-orange/30 text-accent-orange font-mono">
                {NODES[n].label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="animation-controls flex-wrap gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(['bfs', 'dfs'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-4 py-1.5 uppercase font-mono tracking-wide transition-colors ${mode === m ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {m}
            </button>
          ))}
        </div>
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <button onClick={() => { setRunning(false); setStep(s => Math.min(s + 1, steps.length - 1)) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors">
          <StepForward size={12} /> Step
        </button>
      </div>
    </div>
  )
}
