'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Play } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300
const PAD = { top: 34, bottom: 26, left: 14, right: 14 }
const N_MIN = 4
const N_MAX = 11

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const GREEN = '#10B981'
const PINK = '#F472B6'

type Node = {
  n: number
  depth: number
  x: number
  y: number
  parent: number
  hit: boolean // resolved from the memo cache instead of recursing
}

// Builds the recursion tree for fib(n) in call order. With `memo` on, a call
// whose value is already cached returns immediately and spawns no children.
function buildTree(n: number, memo: boolean): { nodes: Node[]; leaves: number } {
  const nodes: Node[] = []
  const cache = new Set<number>()
  let leafSlot = 0

  const visit = (k: number, depth: number, parent: number): number => {
    const hit = memo && cache.has(k)
    const id = nodes.length
    nodes.push({ n: k, depth, x: 0, y: 0, parent, hit })

    if (hit || k <= 1) {
      nodes[id].x = leafSlot++
      if (!hit) cache.add(k)
      return nodes[id].x
    }
    const a = visit(k - 1, depth + 1, id)
    const b = visit(k - 2, depth + 1, id)
    cache.add(k)
    nodes[id].x = (a + b) / 2
    return nodes[id].x
  }

  visit(n, 0, -1)
  return { nodes, leaves: Math.max(1, leafSlot) }
}

export function MemoizationTreeAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setRevealed(Number.MAX_SAFE_INTEGER); return }
      setRevealed(0)
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [n, setN] = useState(8)
  const [memo, setMemo] = useState(false)
  const [revealed, setRevealed] = useState(Number.MAX_SAFE_INTEGER)
  const [running, setRunning] = useState(false)

  const { nodes, leaves } = useMemo(() => buildTree(n, memo), [n, memo])
  const naiveCalls = useMemo(() => buildTree(n, false).nodes.length, [n])
  const memoCalls = useMemo(() => buildTree(n, true).nodes.length, [n])

  const shown = Math.min(revealed, nodes.length)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const plotW = W - PAD.left - PAD.right
    const plotH = H - PAD.top - PAD.bottom
    const maxDepth = Math.max(1, ...nodes.map(d => d.depth))
    const levelH = plotH / maxDepth
    const px = (slot: number) => PAD.left + ((slot + 0.5) / leaves) * plotW
    const py = (depth: number) => PAD.top + depth * levelH
    const r = Math.max(2.5, Math.min(11, plotW / leaves / 2.4))

    // edges
    ctx.lineWidth = 1
    for (let i = 1; i < shown; i++) {
      const node = nodes[i]
      const parent = nodes[node.parent]
      ctx.strokeStyle = node.hit ? `${GREEN}55` : 'rgba(255,245,235,0.13)'
      ctx.beginPath()
      ctx.moveTo(px(parent.x), py(parent.depth))
      ctx.lineTo(px(node.x), py(node.depth))
      ctx.stroke()
    }

    // nodes
    for (let i = 0; i < shown; i++) {
      const node = nodes[i]
      const x = px(node.x)
      const y = py(node.depth)
      const color = node.hit ? GREEN : i === 0 ? GOLD : node.n <= 1 ? 'rgba(245,240,232,0.4)' : BLUE
      ctx.fillStyle = node.hit ? `${GREEN}33` : i === 0 ? `${GOLD}44` : `${color}26`
      ctx.strokeStyle = color
      ctx.lineWidth = i === 0 ? 2 : 1.2
      ctx.beginPath()
      ctx.arc(x, y, node.hit ? r * 0.7 : r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      if (r >= 8) {
        ctx.fillStyle = color
        ctx.font = `${Math.round(r)}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(node.n), x, y)
      }
    }

    // header
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = memo ? GREEN : PINK
    ctx.fillText(`fib(${n}) — memo ${memo ? 'ON' : 'OFF'} — ${shown} call${shown === 1 ? '' : 's'}`, PAD.left, 20)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText(`depth ${maxDepth}`, W - PAD.right - 54, 20)

    if (memo) {
      ctx.fillStyle = GREEN
      ctx.font = '10px monospace'
      ctx.textAlign = 'left'
      ctx.fillText('● cache hit — subtree never explored', PAD.left, H - 8)
    } else {
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.font = '10px monospace'
      ctx.fillText('every node is a real call — identical subtrees recomputed over and over', PAD.left, H - 8)
    }
  }, [nodes, leaves, shown, memo, n])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setRevealed(v => {
        if (v >= nodes.length) { setRunning(false); return nodes.length }
        return v + Math.max(1, Math.round(nodes.length / 90))
      })
    }, 28)
    return () => clearInterval(id)
  }, [running, nodes.length])

  const replay = useCallback(() => {
    setRevealed(0)
    setRunning(true)
  }, [])

  const reset = () => {
    triggerReset()
    setRunning(false)
    setRevealed(Number.MAX_SAFE_INTEGER)
  }

  const speedup = memoCalls > 0 ? naiveCalls / memoCalls : 1

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Recursion tree with memoization</span>
        <button onClick={reset} className="text-xs text-text-muted hover:text-text-secondary transition-colors">Reset</button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Recursion tree with memoization. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={memo}
            onChange={e => { setMemo(e.target.checked); replay() }}
            className="accent-accent-gold"
          />
          Memoize
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>n:</span>
          <input
            type="range" min={N_MIN} max={N_MAX} value={n}
            onChange={e => { setN(+e.target.value); replay() }}
            className="w-32 accent-accent-blue"
          />
          <span className="text-text-secondary font-medium">{n}</span>
        </label>
        <div className="ml-auto flex gap-4 text-xs">
          <span style={{ color: PINK }}>naive: <strong>{naiveCalls}</strong> calls</span>
          <span style={{ color: GREEN }}>memo: <strong>{memoCalls}</strong> calls</span>
          <span className="text-text-secondary">{speedup.toFixed(1)}× fewer</span>
        </div>
      </div>
    </div>
  )
}
