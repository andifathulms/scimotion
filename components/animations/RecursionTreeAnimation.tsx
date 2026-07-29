'use client'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

// The recursion tree of naive Fibonacci. Without memoization every fib(k) is
// recomputed in many branches and the tree grows exponentially. Flip memoization
// on and repeated subproblems become cache hits — computed once, reused — so the
// tree collapses to a linear number of real computations.

const BLUE = '#60A5FA'
const GREEN = '#10B981'
const MUTE = 'rgba(245,240,232,0.4)'

type TreeNode = {
  k: number
  children: TreeNode[]
  cached: boolean // a memo hit — returned instantly, never expanded
  base: boolean // k <= 1
  x: number
  y: number
  order: number // reveal order (DFS pre-order)
}

function buildNaive(k: number): TreeNode {
  const base = k <= 1
  return {
    k,
    base,
    cached: false,
    children: base ? [] : [buildNaive(k - 1), buildNaive(k - 2)],
    x: 0,
    y: 0,
    order: 0,
  }
}

function buildMemo(k: number, seen: Set<number>): TreeNode {
  if (k <= 1) {
    return { k, base: true, cached: false, children: [], x: 0, y: 0, order: 0 }
  }
  if (seen.has(k)) {
    // Already computed in an earlier branch — this call is a cache hit.
    return { k, base: false, cached: true, children: [], x: 0, y: 0, order: 0 }
  }
  const left = buildMemo(k - 1, seen)
  const right = buildMemo(k - 2, seen)
  seen.add(k) // store the result once both children resolve
  return { k, base: false, cached: false, children: [left, right], x: 0, y: 0, order: 0 }
}

type Layout = { nodes: TreeNode[]; edges: [TreeNode, TreeNode][]; maxDepth: number; leaves: number }

function layout(root: TreeNode): Layout {
  const nodes: TreeNode[] = []
  const edges: [TreeNode, TreeNode][] = []
  let leafX = 0
  let maxDepth = 0
  let order = 0

  const place = (node: TreeNode, depth: number) => {
    node.y = depth
    node.order = order++
    maxDepth = Math.max(maxDepth, depth)
    nodes.push(node)
    if (node.children.length === 0) {
      node.x = leafX++
    } else {
      for (const c of node.children) {
        edges.push([node, c])
        place(c, depth + 1)
      }
      node.x = (node.children[0].x + node.children[node.children.length - 1].x) / 2
    }
  }

  place(root, 0)
  return { nodes, edges, maxDepth, leaves: leafX }
}

// Total number of calls a naive fib(n) makes = 2·fib(n+1) − 1.
function naiveCalls(n: number): number {
  let a = 0
  let b = 1
  for (let i = 0; i < n + 1; i++) {
    const t = a + b
    a = b
    b = t
  }
  return 2 * a - 1
}

const INPUTS = [4, 5, 6, 7]

export function RecursionTreeAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const [n, setN] = useState(6)
  const [memo, setMemo] = useState(false)
  const [visible, setVisible] = useState(0)
  const rafRef = useRef<number | undefined>(undefined)
  const startRef = useRef<number>(0)

  const tree = useMemo<Layout>(() => {
    const root = memo ? buildMemo(n, new Set<number>()) : buildNaive(n)
    return layout(root)
  }, [n, memo])

  const total = tree.nodes.length
  const realComputations = tree.nodes.filter(nd => !nd.cached).length
  const naiveTotal = naiveCalls(n)

  const runReveal = useCallback(() => {
    cancelAnimationFrame(rafRef.current ?? 0)
    startRef.current = 0
    const perNode = 55 // ms between node reveals
    const tick = (t: number) => {
      if (!startRef.current) startRef.current = t
      const count = Math.min(total, Math.floor((t - startRef.current) / perNode) + 1)
      setVisible(count)
      if (count < total) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [total])

  // Re-reveal whenever the tree changes (n or memo toggle).
  useEffect(() => {
    setVisible(0)
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(total)
      return
    }
    runReveal()
    return () => cancelAnimationFrame(rafRef.current ?? 0)
  }, [tree, total, runReveal])

  useEffect(() => {
    if (triggered && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      runReveal()
    }
  }, [triggered, runReveal])

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current ?? 0)
    triggerReset()
    setVisible(0)
    runReveal()
  }, [triggerReset, runReveal])

  // Map tree coordinates into the SVG viewBox.
  const W = 600
  const H = 300
  const padX = 26
  const padTop = 26
  const padBottom = 30
  const spanX = tree.leaves > 1 ? tree.leaves - 1 : 1
  const spanY = tree.maxDepth > 0 ? tree.maxDepth : 1
  const px = (x: number) => padX + (x / spanX) * (W - 2 * padX)
  const py = (y: number) => padTop + (y / spanY) * (H - padTop - padBottom)
  const nodeR = tree.leaves > 16 ? 9 : 11

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Recursion Tree & Memoization</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg" style={{ background: '#0F0D0A' }}>
          {tree.edges.map(([a, b], i) => {
            if (b.order >= visible) return null
            return (
              <line
                key={i}
                x1={px(a.x)}
                y1={py(a.y)}
                x2={px(b.x)}
                y2={py(b.y)}
                stroke={b.cached ? 'rgba(16,185,129,0.35)' : 'rgba(255,245,235,0.14)'}
                strokeWidth={1.25}
              />
            )
          })}
          {tree.nodes.map((nd, i) => {
            if (nd.order >= visible) return null
            const color = nd.cached ? GREEN : nd.base ? MUTE : BLUE
            const fill = nd.cached
              ? 'rgba(16,185,129,0.18)'
              : nd.base
                ? 'rgba(245,240,232,0.06)'
                : 'rgba(96,165,250,0.14)'
            return (
              <g key={i}>
                <circle cx={px(nd.x)} cy={py(nd.y)} r={nodeR} fill={fill} stroke={color} strokeWidth={nd.cached ? 2 : 1.4} />
                <text
                  x={px(nd.x)}
                  y={py(nd.y) + 3.5}
                  textAnchor="middle"
                  fontSize={tree.leaves > 16 ? 8 : 9}
                  fill={color}
                  fontFamily="monospace"
                >
                  {nd.k}
                </text>
                {nd.cached && (
                  <text x={px(nd.x)} y={py(nd.y) - nodeR - 3} textAnchor="middle" fontSize={7.5} fill={GREEN} fontFamily="monospace">
                    hit
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Readout */}
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          fib(<span className="text-accent-blue">{n}</span>)
        </span>
        <span>
          naive calls: <strong className="text-accent-orange">{naiveTotal}</strong>
        </span>
        <span>
          {memo ? (
            <>real computations: <strong className="text-accent-teal">{realComputations}</strong></>
          ) : (
            <>tree nodes: <strong className="text-accent-blue">{total}</strong></>
          )}
        </span>
        {memo && (
          <span className="text-accent-teal">
            {naiveTotal}→{realComputations}: exponential collapsed to linear
          </span>
        )}
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setMemo(m => !m)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            memo ? 'bg-accent-teal text-bg-base' : 'bg-accent-gold text-bg-base'
          }`}
        >
          Memoize: {memo ? 'ON' : 'OFF'}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="font-mono">n =</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {INPUTS.map(v => (
              <button
                key={v}
                onClick={() => setN(v)}
                className={`px-3 py-1.5 font-mono transition-colors ${n === v ? 'bg-accent-blue text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <span className="text-xs text-text-muted">
          <span className="text-accent-teal">green</span> = cache hit (computed once, reused)
        </span>
      </div>
    </div>
  )
}
