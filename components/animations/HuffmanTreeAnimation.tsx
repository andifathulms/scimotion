'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const ACCENT = '#60A5FA'

// Fixed, deterministic sample. Frequencies of letters in "abracadabra".
const SOURCE = 'abracadabra'

type HNode = {
  id: number
  freq: number
  sym: string | null
  left: HNode | null
  right: HNode | null
  order: number // tie-break key, stable & deterministic
}

type Forest = HNode[]

// Snapshot of one merge step: the forest BEFORE the merge and the two ids merged.
type Step = { forest: Forest; mergeA: number; mergeB: number }

function countFreqs(s: string): { sym: string; freq: number }[] {
  const map = new Map<string, number>()
  for (const ch of s) map.set(ch, (map.get(ch) ?? 0) + 1)
  // Deterministic order: by first appearance in the source string.
  const seen: string[] = []
  for (const ch of s) if (!seen.includes(ch)) seen.push(ch)
  return seen.map(sym => ({ sym, freq: map.get(sym)! }))
}

// Pick index of the smallest node by (freq, order) — fully deterministic.
function pickSmallest(forest: Forest, exclude = -1): number {
  let best = -1
  for (let i = 0; i < forest.length; i++) {
    if (i === exclude) continue
    if (best === -1) { best = i; continue }
    const a = forest[i], b = forest[best]
    if (a.freq < b.freq || (a.freq === b.freq && a.order < b.order)) best = i
  }
  return best
}

function cloneForest(forest: Forest): Forest {
  return forest.map(n => ({ ...n }))
}

function buildHuffman(freqs: { sym: string; freq: number }[]) {
  let nextId = 0
  let forest: Forest = freqs.map((f, i) => ({
    id: nextId++, freq: f.freq, sym: f.sym, left: null, right: null, order: i,
  }))
  let nextOrder = forest.length
  const steps: Step[] = []

  while (forest.length > 1) {
    const iA = pickSmallest(forest)
    const iB = pickSmallest(forest, iA)
    // snapshot the forest state before this merge (deep-ish clone of the row cards)
    steps.push({ forest: cloneForest(forest), mergeA: forest[iA].id, mergeB: forest[iB].id })

    const a = forest[iA], b = forest[iB]
    // smaller freq goes left (0); ties keep lower order on the left
    const [left, right] = (a.freq < b.freq || (a.freq === b.freq && a.order < b.order))
      ? [a, b] : [b, a]
    const parent: HNode = {
      id: nextId++, freq: a.freq + b.freq, sym: null, left, right, order: nextOrder++,
    }
    forest = forest.filter((_, i) => i !== iA && i !== iB)
    forest.push(parent)
  }
  return { root: forest[0], steps }
}

// Assign prefix-free codes by walking the finished tree.
function assignCodes(root: HNode): Map<string, string> {
  const codes = new Map<string, string>()
  const walk = (n: HNode, code: string) => {
    if (n.sym !== null) { codes.set(n.sym, code === '' ? '0' : code); return }
    if (n.left) walk(n.left, code + '0')
    if (n.right) walk(n.right, code + '1')
  }
  walk(root, '')
  return codes
}

// Layout the finished tree for SVG rendering.
type Placed = { node: HNode; x: number; y: number; edge: string }
function layoutTree(root: HNode) {
  const leaves: HNode[] = []
  const collect = (n: HNode) => {
    if (n.sym !== null) { leaves.push(n); return }
    if (n.left) collect(n.left)
    if (n.right) collect(n.right)
  }
  collect(root)
  const leafX = new Map<number, number>()
  leaves.forEach((l, i) => leafX.set(l.id, i))

  let maxDepth = 0
  const placed: Placed[] = []
  const links: { x1: number; y1: number; x2: number; y2: number; bit: string }[] = []
  const walk = (n: HNode, depth: number, edge: string): number => {
    maxDepth = Math.max(maxDepth, depth)
    let x: number
    if (n.sym !== null) {
      x = leafX.get(n.id)!
    } else {
      const lx = n.left ? walk(n.left, depth + 1, '0') : 0
      const rx = n.right ? walk(n.right, depth + 1, '1') : 0
      x = (lx + rx) / 2
    }
    placed.push({ node: n, x, y: depth, edge })
    return x
  }
  walk(root, 0, '')
  // record links after positions known
  const posOf = new Map<number, { x: number; y: number }>()
  placed.forEach(p => posOf.set(p.node.id, { x: p.x, y: p.y }))
  const linkWalk = (n: HNode) => {
    const p = posOf.get(n.id)!
    if (n.left) {
      const c = posOf.get(n.left.id)!
      links.push({ x1: p.x, y1: p.y, x2: c.x, y2: c.y, bit: '0' })
      linkWalk(n.left)
    }
    if (n.right) {
      const c = posOf.get(n.right.id)!
      links.push({ x1: p.x, y1: p.y, x2: c.x, y2: c.y, bit: '1' })
      linkWalk(n.right)
    }
  }
  linkWalk(root)
  return { placed, links, leafCount: leaves.length, maxDepth }
}

export function HuffmanTreeAnimation() {
  const freqs = useMemo(() => countFreqs(SOURCE), [])
  const { root, steps } = useMemo(() => buildHuffman(freqs), [freqs])
  const codes = useMemo(() => assignCodes(root), [root])
  const tree = useMemo(() => layoutTree(root), [root])

  const totalSyms = SOURCE.length
  const alphabet = freqs.length
  const fixedBitsPer = Math.max(1, Math.ceil(Math.log2(alphabet)))
  const fixedTotal = totalSyms * fixedBitsPer
  const huffTotal = freqs.reduce((sum, f) => sum + f.freq * codes.get(f.sym)!.length, 0)
  const saved = fixedTotal - huffTotal

  // stepIdx: -1 = nothing merged yet; steps.length = done (show final tree)
  const [stepIdx, setStepIdx] = useState(-1)
  const [running, setRunning] = useState(false)
  const rafRef = useRef<number>(0)
  const lastTickRef = useRef<number>(0)

  const { ref, triggered, visible } = useAnimationTrigger({
    onTrigger: (reduced) => {
      if (reduced) setStepIdx(steps.length) // static final frame
      else setRunning(true)
    },
  })

  const done = stepIdx >= steps.length

  // RAF-driven stepping (deterministic 900ms cadence via timestamps).
  useEffect(() => {
    if (!running || !visible) return
    const tick = (t: number) => {
      if (lastTickRef.current === 0) lastTickRef.current = t
      if (t - lastTickRef.current >= 900) {
        lastTickRef.current = t
        setStepIdx(i => {
          if (i >= steps.length) { setRunning(false); return i }
          return i + 1
        })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, steps.length, visible])

  useEffect(() => {
    if (stepIdx >= steps.length) setRunning(false)
  }, [stepIdx, steps.length])

  const reset = useCallback(() => {
    setRunning(false)
    lastTickRef.current = 0
    setStepIdx(-1)
  }, [])

  const play = () => {
    if (done) { setStepIdx(-1); lastTickRef.current = 0; setRunning(true); return }
    lastTickRef.current = 0
    setRunning(r => !r)
  }

  const stepOnce = () => {
    setRunning(false)
    setStepIdx(i => Math.min(steps.length, i + 1))
  }

  // Current forest to display: before-merge snapshot, or the finished single tree.
  const curStep = stepIdx >= 0 && stepIdx < steps.length ? steps[stepIdx] : null
  const displayForest: Forest = curStep
    ? curStep.forest
    : stepIdx <= -1
      ? steps[0].forest // initial leaves
      : [root]

  // SVG dims for the final tree
  const W = 460, H = 240
  const padX = 30, padTop = 20, padBot = 30
  const colW = tree.leafCount > 1 ? (W - 2 * padX) / (tree.leafCount - 1) : 0
  const rowH = tree.maxDepth > 0 ? (H - padTop - padBot) / tree.maxDepth : 0
  const tx = (x: number) => padX + x * colW
  const ty = (y: number) => padTop + y * rowH

  return (
    <div ref={ref} className="animation-block">
      <div className="text-xs text-text-muted mb-2 font-mono">
        Source string: <span className="text-accent-blue">&quot;{SOURCE}&quot;</span> ({totalSyms} symbols, {alphabet}-letter alphabet)
      </div>

      {/* Forest / merge row OR final tree */}
      <div
        className="rounded-lg bg-bg-surface border border-border p-3 mb-2"
        style={{ minHeight: 180 }}
      >
        {!done ? (
          <div>
            <div className="text-[11px] text-text-muted mb-2">
              {curStep
                ? 'Merge the two lowest-frequency nodes (highlighted) into one parent:'
                : 'Start: one node per symbol, weighted by frequency.'}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {displayForest.map(n => {
                const isMerge = curStep && (n.id === curStep.mergeA || n.id === curStep.mergeB)
                return (
                  <div
                    key={n.id}
                    className="flex flex-col items-center justify-center rounded-lg border px-3 py-2 transition-colors"
                    style={{
                      minWidth: 46,
                      borderColor: isMerge ? ACCENT : 'var(--border, #2a2723)',
                      background: isMerge ? 'rgba(96,165,250,0.12)' : 'transparent',
                    }}
                  >
                    <span
                      className="font-mono text-sm font-bold leading-none"
                      style={{ color: isMerge ? ACCENT : undefined }}
                    >
                      {n.sym !== null ? n.sym : '•'}
                    </span>
                    <span className="font-mono text-[11px] text-text-muted mt-1">{n.freq}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 240 }}>
            {tree.links.map((l, i) => (
              <g key={i}>
                <line
                  x1={tx(l.x1)} y1={ty(l.y1)} x2={tx(l.x2)} y2={ty(l.y2)}
                  stroke="rgba(245,240,232,0.25)" strokeWidth={1.5}
                />
                <text
                  x={(tx(l.x1) + tx(l.x2)) / 2 + (l.bit === '0' ? -8 : 8)}
                  y={(ty(l.y1) + ty(l.y2)) / 2 + 3}
                  fontSize={11} fontFamily="monospace" fill={ACCENT} textAnchor="middle"
                >
                  {l.bit}
                </text>
              </g>
            ))}
            {tree.placed.map(p => (
              <g key={p.node.id}>
                <circle
                  cx={tx(p.x)} cy={ty(p.y)} r={p.node.sym !== null ? 15 : 11}
                  fill={p.node.sym !== null ? 'rgba(96,165,250,0.15)' : '#0F0D0A'}
                  stroke={p.node.sym !== null ? ACCENT : 'rgba(245,240,232,0.3)'}
                  strokeWidth={1.5}
                />
                <text
                  x={tx(p.x)} y={ty(p.y) + 4} fontSize={p.node.sym !== null ? 12 : 10}
                  fontFamily="monospace"
                  fontWeight={p.node.sym !== null ? 700 : 400}
                  fill={p.node.sym !== null ? ACCENT : 'rgba(245,240,232,0.55)'}
                  textAnchor="middle"
                >
                  {p.node.sym !== null ? p.node.sym : p.node.freq}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>

      {/* Code table (shown once tree is complete) */}
      {done && (
        <div className="rounded-lg bg-bg-surface border border-border p-3 mb-2">
          <div className="text-[11px] text-text-muted mb-2">Prefix-free codes (frequent symbols → shorter codes):</div>
          <div className="flex flex-wrap gap-2">
            {freqs.slice().sort((a, b) => b.freq - a.freq).map(f => (
              <div key={f.sym} className="flex items-center gap-1.5 rounded border border-border px-2 py-1 font-mono text-xs">
                <span className="font-bold" style={{ color: ACCENT }}>{f.sym}</span>
                <span className="text-text-muted">×{f.freq}</span>
                <span className="text-text-secondary">{codes.get(f.sym)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Readout */}
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>Fixed-length: <span className="text-accent-orange">{fixedTotal}</span> bits ({fixedBitsPer}/sym)</span>
        <span>Huffman: <span className="text-accent-teal">{done ? huffTotal : '…'}</span> bits</span>
        <span>Saved: <span style={{ color: ACCENT }}>{done ? `${saved} bits (${Math.round((saved / fixedTotal) * 100)}%)` : '…'}</span></span>
        <WidgetStatus className="ml-auto">Merge {Math.min(stepIdx + 1, steps.length)} / {steps.length}</WidgetStatus>
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
