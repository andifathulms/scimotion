'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const ACCENT = '#F87171' // red — the active route
const GOLD = '#F59E0B'   // the travelling packet
const BLUE = '#60A5FA'   // the source host
const GREEN = '#10B981'  // the destination
const VIOLET = '#A78BFA' // router making the current local decision

type Router = { id: number; x: number; y: number; label: string; net: string }

// A small internetwork. R0 is the gateway next to the source host; several
// selectable destinations sit on the far side, reachable by more than one route.
const ROUTERS: Router[] = [
  { id: 0, x: 70,  y: 170, label: 'R0', net: '10.0.0.0/24' },
  { id: 1, x: 185, y: 85,  label: 'R1', net: '10.0.1.0/24' },
  { id: 2, x: 185, y: 255, label: 'R2', net: '10.0.2.0/24' },
  { id: 3, x: 315, y: 55,  label: 'R3', net: '198.51.100.0/24' },
  { id: 4, x: 315, y: 170, label: 'R4', net: '10.0.4.0/24' },
  { id: 5, x: 315, y: 285, label: 'R5', net: '192.0.2.0/24' },
  { id: 6, x: 445, y: 110, label: 'R6', net: '203.0.113.0/24' },
  { id: 7, x: 445, y: 240, label: 'R7', net: '198.18.0.0/24' },
  { id: 8, x: 545, y: 170, label: 'R8', net: '172.16.5.0/24' },
]

type Edge = [number, number]
const EDGES: Edge[] = [
  [0, 1], [0, 2],
  [1, 3], [1, 4],
  [2, 4], [2, 5],
  [3, 6],
  [4, 6], [4, 7],
  [5, 7],
  [6, 8], [7, 8],
]

// Selectable destinations (the far-side networks a host might address).
const DESTS = [8, 6, 5, 3]

const SOURCE = 0

const ekey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)

function buildAdj(cut: Set<string>): number[][] {
  const adj: number[][] = ROUTERS.map(() => [])
  for (const [a, b] of EDGES) {
    if (cut.has(ekey(a, b))) continue
    adj[a].push(b)
    adj[b].push(a)
  }
  return adj
}

// Shortest hop path from `from` to `to` over the un-cut graph, or null.
function bfsPath(adj: number[][], from: number, to: number): number[] | null {
  const prev = new Array<number>(ROUTERS.length).fill(-2)
  prev[from] = -1
  const q = [from]
  while (q.length) {
    const cur = q.shift()!
    if (cur === to) break
    for (const nb of adj[cur]) {
      if (prev[nb] === -2) {
        prev[nb] = cur
        q.push(nb)
      }
    }
  }
  if (prev[to] === -2) return null
  const path: number[] = []
  let c = to
  while (c !== -1) {
    path.push(c)
    c = prev[c]
  }
  return path.reverse()
}

// The next hop `router` would pick toward each destination — its local table.
function nextHop(adj: number[][], router: number, dest: number): number | null {
  if (router === dest) return dest
  const p = bfsPath(adj, router, dest)
  return p && p.length > 1 ? p[1] : null
}

export function RoutingAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dest, setDest] = useState(8)
  const [cut, setCut] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [currentRouter, setCurrentRouter] = useState(SOURCE)

  const adjRef = useRef<number[][]>(buildAdj(new Set()))
  const pathRef = useRef<number[] | null>(bfsPath(adjRef.current, SOURCE, 8))
  const progressRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)
  const lastTsRef = useRef<number | undefined>(undefined)
  const lastIdxRef = useRef(0)

  const recompute = useCallback((d: number, c: Set<string>) => {
    adjRef.current = buildAdj(c)
    pathRef.current = bfsPath(adjRef.current, SOURCE, d)
    progressRef.current = 0
    lastIdxRef.current = 0
    setCurrentRouter(SOURCE)
  }, [])

  const draw = useCallback((d: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const path = pathRef.current
    const onPath = new Set(path ?? [])
    const pathEdges = new Set<string>()
    if (path) for (let i = 0; i < path.length - 1; i++) pathEdges.add(ekey(path[i], path[i + 1]))

    // Edges
    for (const [a, b] of EDGES) {
      const na = ROUTERS[a]
      const nb = ROUTERS[b]
      const k = ekey(a, b)
      const isCut = cut.has(k)
      const isRoute = pathEdges.has(k)
      ctx.beginPath()
      ctx.moveTo(na.x, na.y)
      ctx.lineTo(nb.x, nb.y)
      if (isCut) {
        ctx.strokeStyle = 'rgba(248,113,113,0.35)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
      } else if (isRoute) {
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 3
        ctx.setLineDash([])
      } else {
        ctx.strokeStyle = 'rgba(255,245,235,0.12)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([])
      }
      ctx.stroke()
      ctx.setLineDash([])
      // Cross out cut links
      if (isCut) {
        const mx = (na.x + nb.x) / 2
        const my = (na.y + nb.y) / 2
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(mx - 5, my - 5); ctx.lineTo(mx + 5, my + 5)
        ctx.moveTo(mx + 5, my - 5); ctx.lineTo(mx - 5, my + 5)
        ctx.stroke()
      }
    }

    // Routers
    for (const r of ROUTERS) {
      const isSrc = r.id === SOURCE
      const isDst = r.id === d
      const isCur = r.id === currentRouter && running
      let stroke = 'rgba(255,245,235,0.28)'
      let fill = '#1A1712'
      if (onPath.has(r.id)) { stroke = ACCENT; fill = 'rgba(248,113,113,0.12)' }
      if (isSrc) { stroke = BLUE; fill = 'rgba(96,165,250,0.15)' }
      if (isDst) { stroke = GREEN; fill = 'rgba(16,185,129,0.15)' }
      if (isCur && !isSrc && !isDst) { stroke = VIOLET; fill = 'rgba(167,139,250,0.18)' }

      if (isCur) {
        const g = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, 32)
        g.addColorStop(0, 'rgba(167,139,250,0.30)')
        g.addColorStop(1, 'rgba(167,139,250,0)')
        ctx.beginPath(); ctx.arc(r.x, r.y, 32, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(r.x, r.y, 19, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = stroke
      ctx.lineWidth = isCur ? 3 : 2
      ctx.stroke()
      ctx.fillStyle = stroke
      ctx.font = 'bold 12px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(r.label, r.x, r.y)
    }

    // Source host tag & destination tag
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = BLUE
    ctx.fillText('host A', ROUTERS[SOURCE].x, ROUTERS[SOURCE].y - 30)
    ctx.fillStyle = GREEN
    ctx.fillText('dest', ROUTERS[d].x, ROUTERS[d].y - 30)

    // Packet
    if (path && path.length > 1) {
      const prog = Math.min(progressRef.current, path.length - 1)
      const seg = Math.min(Math.floor(prog), path.length - 2)
      const t = prog - seg
      const a = ROUTERS[path[seg]]
      const b = ROUTERS[path[seg + 1]]
      const px = a.x + (b.x - a.x) * t
      const py = a.y + (b.y - a.y) * t
      const g = ctx.createRadialGradient(px, py, 0, px, py, 14)
      g.addColorStop(0, 'rgba(245,158,11,0.55)')
      g.addColorStop(1, 'rgba(245,158,11,0)')
      ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fillStyle = GOLD; ctx.fill()
    }

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }, [cut, currentRouter, running])

  // rAF packet glide, one hop at a time.
  const tick = useCallback((ts: number) => {
    const path = pathRef.current
    if (!path || path.length < 2) { setRunning(false); return }
    if (lastTsRef.current === undefined) lastTsRef.current = ts
    const dt = (ts - lastTsRef.current) / 1000
    lastTsRef.current = ts
    progressRef.current += dt * 1.1 // hops per second

    const idx = Math.min(Math.floor(progressRef.current), path.length - 1)
    if (idx !== lastIdxRef.current) {
      lastIdxRef.current = idx
      setCurrentRouter(path[idx])
    }
    if (progressRef.current >= path.length - 1) {
      progressRef.current = path.length - 1
      setCurrentRouter(path[path.length - 1])
      draw(dest)
      // pause on arrival, then loop
      window.setTimeout(() => {
        if (rafRef.current === undefined) return
        progressRef.current = 0
        lastIdxRef.current = 0
        lastTsRef.current = undefined
        setCurrentRouter(SOURCE)
        rafRef.current = requestAnimationFrame(tick)
      }, 900)
      rafRef.current = undefined
      return
    }
    draw(dest)
    rafRef.current = requestAnimationFrame(tick)
  }, [dest, draw])

  const stop = useCallback(() => {
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    rafRef.current = undefined
    lastTsRef.current = undefined
  }, [])

  const start = useCallback(() => {
    stop()
    lastTsRef.current = undefined
    setRunning(true)
    rafRef.current = requestAnimationFrame(tick)
  }, [stop, tick])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        const p = pathRef.current
        progressRef.current = p ? p.length - 1 : 0
        setCurrentRouter(p ? p[p.length - 1] : SOURCE)
      } else {
        start()
      }
    },
  })

  useEffect(() => { draw(dest) }, [dest, draw])
  useEffect(() => () => stop(), [stop])

  // Recompute route whenever destination or cuts change; keep animating.
  useEffect(() => {
    recompute(dest, cut)
    if (running) start()
    else draw(dest)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dest, cut])

  const toggleRun = () => {
    if (running) { stop(); setRunning(false); draw(dest) }
    else start()
  }

  const reset = () => {
    stop()
    setRunning(false)
    setCut(new Set())
    setDest(8)
    recompute(8, new Set())
    triggerReset()
    draw(8)
  }

  // Click an edge to cut / restore it.
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * W
    const my = ((e.clientY - rect.top) / rect.height) * H
    let best = -1
    let bestD = 12
    EDGES.forEach(([a, b], i) => {
      const na = ROUTERS[a]
      const nb = ROUTERS[b]
      const vx = nb.x - na.x
      const vy = nb.y - na.y
      const len2 = vx * vx + vy * vy
      let t = len2 ? ((mx - na.x) * vx + (my - na.y) * vy) / len2 : 0
      t = Math.max(0, Math.min(1, t))
      const cx = na.x + vx * t
      const cy = na.y + vy * t
      const dd = Math.hypot(mx - cx, my - cy)
      if (dd < bestD) { bestD = dd; best = i }
    })
    if (best >= 0) {
      const [a, b] = EDGES[best]
      const k = ekey(a, b)
      setCut(prev => {
        const nextSet = new Set(prev)
        if (nextSet.has(k)) nextSet.delete(k)
        else nextSet.add(k)
        return nextSet
      })
    }
  }

  const path = pathRef.current
  const adj = adjRef.current
  // Local routing table for the router the packet is currently at.
  const tableRows = DESTS.map(dn => ({
    dest: ROUTERS[dn].label,
    via: (() => {
      const nh = nextHop(adj, currentRouter, dn)
      return nh === null ? '—' : nh === currentRouter ? 'local' : ROUTERS[nh].label
    })(),
    active: dn === dest,
  }))

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Hop-by-hop routing</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onClick={onCanvasClick}
          className="w-full rounded-lg cursor-pointer"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary">
        {path
          ? <>At <span style={{ color: VIOLET }}>{ROUTERS[currentRouter].label}</span>: destination {ROUTERS[dest].label} → next hop{' '}
              <span style={{ color: ACCENT }}>
                {currentRouter === dest ? 'delivered (local)' : (() => { const nh = nextHop(adj, currentRouter, dest); return nh === null ? '—' : ROUTERS[nh].label })()}
              </span>. No router knows the whole path.</>
          : <span style={{ color: ACCENT }}>{ROUTERS[dest].label} is unreachable — you cut every route. IP just drops the packet.</span>}
      </div>

      {/* Local routing table of the current router */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-text-muted">{ROUTERS[currentRouter].label} table:</span>
        {tableRows.map(row => (
          <span
            key={row.dest}
            className="px-2 py-0.5 rounded font-mono border"
            style={{
              borderColor: row.active ? ACCENT : 'var(--border, rgba(255,245,235,0.12))',
              color: row.active ? ACCENT : 'rgba(245,240,232,0.55)',
              background: row.active ? 'rgba(248,113,113,0.08)' : 'transparent',
            }}
          >
            {row.dest} → {row.via}
          </span>
        ))}
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="font-mono">dest:</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {DESTS.map(dn => (
              <button
                key={dn}
                onClick={() => setDest(dn)}
                className="px-2.5 py-1 font-mono text-xs transition-colors"
                style={dest === dn
                  ? { background: GREEN, color: '#0F0D0A' }
                  : { color: 'rgba(245,240,232,0.6)' }}
              >
                {ROUTERS[dn].label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={toggleRun}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: ACCENT, color: '#0F0D0A' }}
        >
          {running ? <Pause size={12} /> : <Play size={12} />} {running ? 'Pause' : 'Play'}
        </button>
        <span className="ml-auto text-xs text-text-muted">Click a link to cut or restore it</span>
      </div>
    </div>
  )
}
