'use client'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 320

const VIOLET = '#A78BFA'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const PINK = '#F472B6'
const GREEN = '#10B981'

const LEAF_Y = 246
const LEVEL = 32
const TREE_X0 = 26
const TREE_X1 = 372
const PANEL_X = 396

type Preset = { name: string; freqs: number[] }

const SYMS = ['A', 'B', 'C', 'D', 'E', 'F']

const PRESETS: Preset[] = [
  { name: 'text-like', freqs: [45, 16, 13, 12, 9, 5] },
  { name: 'very skewed', freqs: [70, 12, 8, 5, 3, 2] },
  { name: 'near-uniform', freqs: [18, 17, 17, 16, 16, 16] },
]

type HNode = {
  id: number
  sym: string | null
  w: number
  left: number
  right: number
  created: number // -1 for leaves, otherwise the merge step that made it
}

type Built = {
  nodes: HNode[]
  root: number
  merges: number
  order: number[] // leaf ids left-to-right in the final tree
  codes: string[] // codeword per symbol index
}

// Standard Huffman construction: repeatedly merge the two lightest nodes.
// Ties break on insertion order so the result is deterministic.
function buildHuffman(freqs: number[]): Built {
  const nodes: HNode[] = freqs.map((w, i) => ({
    id: i,
    sym: SYMS[i],
    w,
    left: -1,
    right: -1,
    created: -1,
  }))
  const live = nodes.map(n => n.id)
  let step = 0

  while (live.length > 1) {
    live.sort((a, b) => nodes[a].w - nodes[b].w || a - b)
    const a = live.shift() as number
    const b = live.shift() as number
    const parent: HNode = {
      id: nodes.length,
      sym: null,
      w: nodes[a].w + nodes[b].w,
      left: a,
      right: b,
      created: step,
    }
    nodes.push(parent)
    live.push(parent.id)
    step++
  }

  const root = live[0]
  const order: number[] = []
  const codes: string[] = SYMS.map(() => '')

  const walk = (id: number, code: string) => {
    const n = nodes[id]
    if (n.sym !== null) {
      order.push(id)
      codes[id] = code === '' ? '0' : code
      return
    }
    walk(n.left, code + '0')
    walk(n.right, code + '1')
  }
  walk(root, '')

  return { nodes, root, merges: step, order, codes }
}

function entropyBits(freqs: number[]): number {
  const total = freqs.reduce((a, b) => a + b, 0)
  return freqs.reduce((acc, f) => {
    if (f <= 0) return acc
    const p = f / total
    return acc - p * Math.log2(p)
  }, 0)
}

function avgBits(freqs: number[], codes: string[]): number {
  const total = freqs.reduce((a, b) => a + b, 0)
  return freqs.reduce((acc, f, i) => acc + (f / total) * codes[i].length, 0)
}

export function HuffmanCodingAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [presetIdx, setPresetIdx] = useState(0)
  const [step, setStep] = useState(0)
  const [running, setRunning] = useState(false)

  const freqs = PRESETS[presetIdx].freqs
  const built = useMemo(() => buildHuffman(PRESETS[presetIdx].freqs), [presetIdx])
  const done = step >= built.merges

  const hVal = entropyBits(freqs)
  const avg = avgBits(freqs, built.codes)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setStep(built.merges)
        return
      }
      setStep(0)
      setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const { nodes, order, codes, merges } = built
    const total = freqs.reduce((a, b) => a + b, 0)

    // Horizontal slot per leaf, in final-tree order (keeps edges uncrossed).
    const slotW = (TREE_X1 - TREE_X0) / order.length
    const px: number[] = new Array(nodes.length).fill(0)
    const py: number[] = new Array(nodes.length).fill(0)
    order.forEach((id, i) => {
      px[id] = TREE_X0 + (i + 0.5) * slotW
      py[id] = LEAF_Y
    })
    nodes.forEach(n => {
      if (n.created >= 0) {
        px[n.id] = (px[n.left] + px[n.right]) / 2
        py[n.id] = LEAF_Y - (n.created + 1) * LEVEL
      }
    })

    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText(
      done ? 'HUFFMAN TREE · COMPLETE' : `MERGE ${step} OF ${merges}`,
      24,
      24
    )

    // Which two nodes get merged next (highlighted before the merge happens)
    let pendingA = -1
    let pendingB = -1
    if (!done) {
      const alive = nodes
        .filter(n => n.created < step && !nodes.some(m => m.created >= 0 && m.created < step && (m.left === n.id || m.right === n.id)))
        .map(n => n.id)
      alive.sort((a, b) => nodes[a].w - nodes[b].w || a - b)
      pendingA = alive[0]
      pendingB = alive[1]
    }

    // Edges for merges that have already happened
    nodes.forEach(n => {
      if (n.created < 0 || n.created >= step) return
      ;[n.left, n.right].forEach((childId, k) => {
        ctx.strokeStyle = 'rgba(167,139,250,0.55)'
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(px[n.id], py[n.id])
        ctx.lineTo(px[childId], py[childId])
        ctx.stroke()
        // 0 / 1 bit label on the edge
        ctx.fillStyle = 'rgba(245,240,232,0.4)'
        ctx.font = '8px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(
          k === 0 ? '0' : '1',
          (px[n.id] + px[childId]) / 2 + (k === 0 ? -6 : 6),
          (py[n.id] + py[childId]) / 2
        )
        ctx.textAlign = 'left'
      })
    })

    // Nodes
    nodes.forEach(n => {
      if (n.created >= step) return
      const isLeaf = n.sym !== null
      const highlighted = n.id === pendingA || n.id === pendingB
      const r = isLeaf ? 13 : 11
      ctx.beginPath()
      ctx.arc(px[n.id], py[n.id], r, 0, Math.PI * 2)
      ctx.fillStyle = isLeaf ? 'rgba(96,165,250,0.20)' : 'rgba(167,139,250,0.18)'
      ctx.fill()
      ctx.strokeStyle = highlighted ? GOLD : isLeaf ? BLUE : VIOLET
      ctx.lineWidth = highlighted ? 2 : 1.2
      ctx.stroke()

      ctx.textAlign = 'center'
      ctx.fillStyle = isLeaf ? BLUE : 'rgba(245,240,232,0.75)'
      ctx.font = isLeaf ? 'bold 11px monospace' : '10px monospace'
      ctx.fillText(isLeaf ? (n.sym as string) : `${n.w}`, px[n.id], py[n.id] + 4)
      if (isLeaf) {
        ctx.fillStyle = 'rgba(245,240,232,0.4)'
        ctx.font = '9px monospace'
        ctx.fillText(`${n.w}`, px[n.id], LEAF_Y + 26)
      }
      ctx.textAlign = 'left'
    })

    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('frequencies (out of ' + total + ')', 24, LEAF_Y + 44)
    if (!done && pendingA >= 0 && pendingB >= 0) {
      ctx.fillStyle = GOLD
      ctx.fillText(
        `next: merge the two rarest → ${nodes[pendingA].w} + ${nodes[pendingB].w} = ${nodes[pendingA].w + nodes[pendingB].w}`,
        24,
        LEAF_Y + 58
      )
    } else {
      ctx.fillStyle = GREEN
      ctx.fillText('every symbol now has a prefix-free codeword', 24, LEAF_Y + 58)
    }

    // ---- Right panel: codebook + cost --------------------------------
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '10px monospace'
    ctx.fillText('CODEBOOK', PANEL_X, 24)

    SYMS.forEach((s, i) => {
      const y = 46 + i * 20
      ctx.fillStyle = BLUE
      ctx.font = 'bold 11px monospace'
      ctx.fillText(s, PANEL_X, y)
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.font = '9px monospace'
      ctx.fillText(`${(freqs[i] / total).toFixed(2)}`, PANEL_X + 16, y)
      if (done) {
        ctx.fillStyle = GOLD
        ctx.font = 'bold 11px monospace'
        ctx.fillText(codes[i], PANEL_X + 56, y)
        ctx.fillStyle = 'rgba(245,240,232,0.3)'
        ctx.font = '9px monospace'
        ctx.fillText(`${codes[i].length}b`, PANEL_X + 138, y)
      } else {
        ctx.fillStyle = 'rgba(245,240,232,0.18)'
        ctx.font = '11px monospace'
        ctx.fillText('· · ·', PANEL_X + 56, y)
      }
    })

    // Cost comparison bars: entropy floor vs Huffman vs fixed-length
    const barX = PANEL_X
    const barW = 172
    const maxScale = 3.2
    const rows: Array<[string, number, string]> = [
      ['entropy H', hVal, GREEN],
      ['Huffman', done ? avg : 0, GOLD],
      ['fixed 3-bit', 3, PINK],
    ]
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '10px monospace'
    ctx.fillText('BITS PER SYMBOL', barX, 186)
    rows.forEach(([label, v, color], i) => {
      const y = 200 + i * 28
      ctx.fillStyle = 'rgba(245,240,232,0.45)'
      ctx.font = '9px monospace'
      ctx.fillText(label, barX, y)
      ctx.fillStyle = 'rgba(255,245,235,0.06)'
      ctx.fillRect(barX, y + 4, barW, 8)
      ctx.fillStyle = color
      ctx.fillRect(barX, y + 4, barW * Math.min(1, v / maxScale), 8)
      ctx.fillStyle = color
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(v > 0 ? v.toFixed(3) : '—', barX + barW, y)
      ctx.textAlign = 'left'
    })

    if (done) {
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.font = '9px monospace'
      ctx.fillText(`+${(avg - hVal).toFixed(3)} over the floor`, barX, LEAF_Y + 58)
    }
  }, [built, freqs, step, done, hVal, avg])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      setStep(prev => {
        if (prev >= built.merges) {
          setRunning(false)
          return built.merges
        }
        return prev + 1
      })
      timer = setTimeout(tick, 900)
    }
    timer = setTimeout(tick, 900)
    return () => clearTimeout(timer)
  }, [running, built.merges])

  const reset = () => {
    triggerReset()
    setRunning(false)
    setStep(0)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Building a Huffman code</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-x-4 gap-y-2">
        <button
          onClick={() => { setRunning(false); setStep(s => Math.min(built.merges, s + 1)) }}
          disabled={done}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover disabled:opacity-35 transition-colors"
        >
          Step
        </button>
        <button
          onClick={() => { setStep(0); setRunning(true) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          <Play size={12} /> Auto-build
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Frequencies</span>
          <select
            value={presetIdx}
            onChange={e => { setRunning(false); setStep(0); setPresetIdx(+e.target.value) }}
            className="px-2 py-1 rounded border border-border bg-bg-surface text-xs text-text-secondary"
          >
            {PRESETS.map((p, i) => (
              <option key={p.name} value={i}>{p.name}</option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-xs font-mono" style={{ color: done ? GOLD : VIOLET }}>
          {done ? `${avg.toFixed(3)} bits/symbol vs H = ${hVal.toFixed(3)}` : `merge ${step} / ${built.merges}`}
        </span>
      </div>
    </div>
  )
}
