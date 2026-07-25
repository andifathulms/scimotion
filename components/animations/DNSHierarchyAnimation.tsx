'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 320
const PAD = { top: 34, bottom: 40, left: 20, right: 20 }

const RED = '#F87171'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

// A small slice of the namespace. `zone` marks a node that is the apex of its
// own delegated zone (its parent handed authority to it). Leaf hosts are plain
// records inside their nearest ancestor zone.
type Spec = { id: string; label: string; zone?: boolean; children?: Spec[] }

const TREE: Spec = {
  id: 'root',
  label: '.',
  children: [
    {
      id: 'com',
      label: 'com',
      zone: true,
      children: [
        {
          id: 'example',
          label: 'example',
          zone: true,
          children: [
            { id: 'www-ex', label: 'www' },
            { id: 'mail-ex', label: 'mail' },
          ],
        },
        {
          id: 'wikipedia',
          label: 'wikipedia',
          zone: true,
          children: [{ id: 'www-wp', label: 'www' }],
        },
      ],
    },
    {
      id: 'org',
      label: 'org',
      zone: true,
      children: [{ id: 'ietf', label: 'ietf', zone: true, children: [{ id: 'www-ietf', label: 'www' }] }],
    },
    {
      id: 'id',
      label: 'id',
      zone: true,
      children: [
        {
          id: 'go',
          label: 'go',
          zone: true,
          children: [
            { id: 'lapor', label: 'lapor' },
            { id: 'pajak', label: 'pajak' },
          ],
        },
      ],
    },
  ],
}

type Node = {
  id: string
  label: string
  zone: boolean
  depth: number
  parent: string | null
  children: string[]
  leaf: boolean
}

// Flatten the spec into a lookup, recording parent / depth / children.
const NODES: Record<string, Node> = (() => {
  const map: Record<string, Node> = {}
  const walk = (s: Spec, depth: number, parent: string | null) => {
    map[s.id] = {
      id: s.id,
      label: s.label,
      zone: !!s.zone || s.id === 'root',
      depth,
      parent,
      children: (s.children ?? []).map(c => c.id),
      leaf: !s.children || s.children.length === 0,
    }
    for (const c of s.children ?? []) walk(c, depth + 1, s.id)
  }
  walk(TREE, 0, null)
  return map
})()

const LEAVES = Object.values(NODES).filter(n => n.leaf)

// Full domain name of a node, read leaf-first up to (not including) root.
function fqdn(id: string): string {
  const parts: string[] = []
  let cur: string | null = id
  while (cur && cur !== 'root') {
    parts.push(NODES[cur].label)
    cur = NODES[cur].parent
  }
  return parts.join('.')
}

// Nearest ancestor (inclusive) that is a zone apex — the authoritative zone.
function authorityZone(id: string): string {
  let cur: string | null = id
  while (cur) {
    if (NODES[cur].zone) return cur
    cur = NODES[cur].parent
  }
  return 'root'
}

function pathToRoot(id: string): string[] {
  const path: string[] = []
  let cur: string | null = id
  while (cur) {
    path.push(cur)
    cur = NODES[cur].parent
  }
  return path.reverse()
}

export function DNSHierarchyAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState<string>('www-ex')
  const hitRef = useRef<{ id: string; x: number; y: number; r: number }[]>([])

  const path = useMemo(() => pathToRoot(target), [target])
  const pathSet = useMemo(() => new Set(path), [path])
  const authZone = useMemo(() => authorityZone(target), [target])

  // Visible nodes: skip anything under a collapsed ancestor.
  const visible = useMemo(() => {
    const out: string[] = []
    const walk = (id: string) => {
      out.push(id)
      if (!collapsed.has(id)) for (const c of NODES[id].children) walk(c)
    }
    walk('root')
    return out
  }, [collapsed])

  // Layout: assign each visible leaf a slot; internal x = mean of child slots.
  const layout = useMemo(() => {
    const slot: Record<string, number> = {}
    let next = 0
    const assign = (id: string): number => {
      const kids = collapsed.has(id) ? [] : NODES[id].children
      if (kids.length === 0) {
        slot[id] = next++
        return slot[id]
      }
      const xs = kids.map(assign)
      slot[id] = (xs[0] + xs[xs.length - 1]) / 2
      return slot[id]
    }
    assign('root')
    return { slot, leaves: Math.max(1, next) }
  }, [collapsed])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const plotW = W - PAD.left - PAD.right
    const plotH = H - PAD.top - PAD.bottom
    const maxDepth = Math.max(...visible.map(id => NODES[id].depth), 1)
    const px = (s: number) => PAD.left + ((s + 0.5) / layout.leaves) * plotW
    const py = (d: number) => PAD.top + (maxDepth === 0 ? 0 : (d / maxDepth) * plotH)

    // ---- edges ----
    for (const id of visible) {
      const n = NODES[id]
      if (!n.parent || !visible.includes(n.parent)) continue
      const onPath = pathSet.has(id) && pathSet.has(n.parent)
      const delegation = n.zone // parent delegated authority to this node
      ctx.strokeStyle = onPath ? RED : delegation ? 'rgba(245,159,11,0.35)' : 'rgba(255,245,235,0.14)'
      ctx.lineWidth = onPath ? 2 : 1
      ctx.setLineDash(delegation && !onPath ? [4, 3] : [])
      ctx.beginPath()
      ctx.moveTo(px(layout.slot[n.parent]), py(NODES[n.parent].depth))
      ctx.lineTo(px(layout.slot[id]), py(n.depth))
      ctx.stroke()
      ctx.setLineDash([])

      // delegation handoff marker at the edge midpoint
      if (delegation) {
        const mx = (px(layout.slot[n.parent]) + px(layout.slot[id])) / 2
        const my = (py(NODES[n.parent].depth) + py(n.depth)) / 2
        ctx.fillStyle = onPath ? GOLD : 'rgba(245,159,11,0.5)'
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('⇩', mx, my)
      }
    }

    // ---- nodes ----
    const hits: { id: string; x: number; y: number; r: number }[] = []
    for (const id of visible) {
      const n = NODES[id]
      const x = px(layout.slot[id])
      const y = py(n.depth)
      const isCollapsed = collapsed.has(id) && n.children.length > 0
      const onPath = pathSet.has(id)
      const isTarget = id === target
      const isAuth = id === authZone
      const r = n.id === 'root' ? 13 : n.leaf ? 9 : 11

      let col = n.zone ? GOLD : BLUE
      if (n.leaf) col = VIOLET
      if (onPath) col = RED
      if (isTarget) col = GREEN

      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = isTarget ? `${GREEN}33` : onPath ? `${RED}26` : `${col}1F`
      ctx.strokeStyle = col
      ctx.lineWidth = onPath ? 2 : 1.2
      ctx.fill()
      ctx.stroke()

      // authoritative ring
      if (isAuth) {
        ctx.beginPath()
        ctx.arc(x, y, r + 4, 0, Math.PI * 2)
        ctx.strokeStyle = GREEN
        ctx.setLineDash([3, 3])
        ctx.lineWidth = 1.2
        ctx.stroke()
        ctx.setLineDash([])
      }

      // collapsed marker
      if (isCollapsed) {
        ctx.fillStyle = col
        ctx.font = 'bold 12px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('+', x, y + 0.5)
      }

      // label
      ctx.fillStyle = onPath || isTarget ? '#F5F0E8' : 'rgba(245,240,232,0.65)'
      ctx.font = `${onPath ? 'bold ' : ''}10px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(n.label, x, y + r + 3)

      hits.push({ id, x, y, r: r + 5 })
    }
    hitRef.current = hits

    // ---- header + legend ----
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = RED
    ctx.fillText(fqdn(target), PAD.left, 18)
    ctx.font = '10px monospace'
    ctx.fillStyle = GREEN
    ctx.fillText(`authoritative zone: ${fqdn(authZone) || '. (root)'}`, PAD.left + 150, 18)

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('⇩ = delegation (authority handed to a different owner)   ·   click a branch to collapse/expand', PAD.left, H - 12)
  }, [visible, layout, collapsed, pathSet, target, authZone])

  useEffect(() => {
    draw()
  }, [draw])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scale = canvas.width / rect.width
    const mx = (e.clientX - rect.left) * scale
    const my = (e.clientY - rect.top) * scale
    for (const h of hitRef.current) {
      if ((mx - h.x) ** 2 + (my - h.y) ** 2 <= (h.r + 4) ** 2) {
        const node = NODES[h.id]
        if (node.children.length > 0) {
          setCollapsed(prev => {
            const nextSet = new Set(prev)
            if (nextSet.has(h.id)) nextSet.delete(h.id)
            else nextSet.add(h.id)
            return nextSet
          })
        } else {
          setTarget(h.id)
        }
        return
      }
    }
  }

  const selectTarget = (id: string) => {
    // make sure every ancestor is expanded so the target is visible
    setCollapsed(prev => {
      const nextSet = new Set(prev)
      for (const a of pathToRoot(id)) nextSet.delete(a)
      return nextSet
    })
    setTarget(id)
  }

  const reset = () => {
    triggerReset()
    setCollapsed(new Set())
    setTarget('www-ex')
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · The namespace tree &amp; who is authoritative
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onClick={handleClick}
          className="w-full rounded-lg cursor-pointer"
          style={{ background: '#0F0D0A' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Resolve:</span>
          <select
            value={target}
            onChange={e => selectTarget(e.target.value)}
            className="px-2 py-1 rounded border border-border bg-bg-surface text-xs text-text-secondary"
          >
            {LEAVES.map(l => (
              <option key={l.id} value={l.id}>
                {fqdn(l.id)}
              </option>
            ))}
          </select>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          delegation hops from root: <strong style={{ color: GOLD }}>{path.filter(id => NODES[id].zone && id !== 'root').length}</strong>
        </span>
      </div>
    </div>
  )
}
