'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const ACCENT = '#F87171' // red — the selected AS-path
const GOLD = '#F59E0B'   // the travelling packet
const BLUE = '#60A5FA'   // the source AS
const GREEN = '#10B981'  // the origin AS that owns the prefix
const VIOLET = '#A78BFA' // an AS that has just learned the route
const CYAN = '#22D3EE'

type AS = { id: number; x: number; y: number; asn: string }

// A small internet of Autonomous Systems. AS0 is the source (your ISP); the
// prefix 203.0.113.0/24 is originated by AS8 on the far side. Realistic-looking
// AS numbers; several disjoint paths so policy can change the choice.
const ASES: AS[] = [
  { id: 0, x: 60,  y: 170, asn: 'AS64500' },
  { id: 1, x: 175, y: 85,  asn: 'AS64510' },
  { id: 2, x: 175, y: 255, asn: 'AS64520' },
  { id: 3, x: 310, y: 55,  asn: 'AS64530' },
  { id: 4, x: 310, y: 172, asn: 'AS64540' },
  { id: 5, x: 310, y: 288, asn: 'AS64550' },
  { id: 6, x: 445, y: 105, asn: 'AS64560' },
  { id: 7, x: 445, y: 248, asn: 'AS64570' },
  { id: 8, x: 548, y: 170, asn: 'AS15169' },
]

const SOURCE = 0
const ORIGIN = 8
const PREFIX = '203.0.113.0/24'

// Each link has a hop of 1 and a relationship "cost" (cheaper = customer link,
// dearer = provider link). Shortest-path policy minimises hops; cheapest-policy
// minimises total cost — and on this graph they pick visibly different paths.
type Edge = { a: number; b: number; cost: number }
const EDGES: Edge[] = [
  { a: 0, b: 1, cost: 1 },
  { a: 0, b: 2, cost: 1 },
  { a: 1, b: 3, cost: 3 },
  { a: 1, b: 4, cost: 3 },
  { a: 2, b: 4, cost: 1 },
  { a: 2, b: 5, cost: 1 },
  { a: 3, b: 6, cost: 1 },
  { a: 4, b: 6, cost: 3 },
  { a: 4, b: 7, cost: 1 },
  { a: 5, b: 7, cost: 1 },
  { a: 6, b: 8, cost: 1 },
  { a: 7, b: 8, cost: 3 },
]

type Policy = 'short' | 'cheap'

const ekey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)

function buildAdj(cut: Set<string>): { to: number; cost: number }[][] {
  const adj: { to: number; cost: number }[][] = ASES.map(() => [])
  for (const e of EDGES) {
    if (cut.has(ekey(e.a, e.b))) continue
    adj[e.a].push({ to: e.b, cost: e.cost })
    adj[e.b].push({ to: e.a, cost: e.cost })
  }
  return adj
}

// Minimum-hop path (advertisement with the shortest AS-path).
function shortestHopPath(adj: { to: number; cost: number }[][], from: number, to: number): number[] | null {
  const prev = new Array<number>(ASES.length).fill(-2)
  prev[from] = -1
  const q = [from]
  while (q.length) {
    const cur = q.shift()!
    if (cur === to) break
    for (const nb of adj[cur]) {
      if (prev[nb.to] === -2) {
        prev[nb.to] = cur
        q.push(nb.to)
      }
    }
  }
  if (prev[to] === -2) return null
  const path: number[] = []
  let c = to
  while (c !== -1) { path.push(c); c = prev[c] }
  return path.reverse()
}

// Minimum-cost path (policy: prefer the cheaper business relationship).
function cheapestPath(adj: { to: number; cost: number }[][], from: number, to: number): number[] | null {
  const dist = new Array<number>(ASES.length).fill(Infinity)
  const prev = new Array<number>(ASES.length).fill(-1)
  const done = new Array<boolean>(ASES.length).fill(false)
  dist[from] = 0
  for (let iter = 0; iter < ASES.length; iter++) {
    let u = -1
    let best = Infinity
    for (let i = 0; i < ASES.length; i++) {
      if (!done[i] && dist[i] < best) { best = dist[i]; u = i }
    }
    if (u === -1) break
    done[u] = true
    for (const nb of adj[u]) {
      const nd = dist[u] + nb.cost
      if (nd < dist[nb.to]) { dist[nb.to] = nd; prev[nb.to] = u }
    }
  }
  if (!Number.isFinite(dist[to])) return null
  const path: number[] = []
  let c = to
  while (c !== -1) { path.push(c); c = prev[c] }
  return path.reverse()
}

function selectPath(policy: Policy, adj: { to: number; cost: number }[][]): number[] | null {
  return policy === 'short'
    ? shortestHopPath(adj, SOURCE, ORIGIN)
    : cheapestPath(adj, SOURCE, ORIGIN)
}

// BFS distance of every AS from the origin — used to stage advertisement rings.
function ringsFromOrigin(adj: { to: number; cost: number }[][]): number[] {
  const dist = new Array<number>(ASES.length).fill(-1)
  dist[ORIGIN] = 0
  const q = [ORIGIN]
  while (q.length) {
    const cur = q.shift()!
    for (const nb of adj[cur]) {
      if (dist[nb.to] === -1) { dist[nb.to] = dist[cur] + 1; q.push(nb.to) }
    }
  }
  return dist
}

export function BGPRoutingAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [policy, setPolicy] = useState<Policy>('short')
  const [cut, setCut] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [phaseLabel, setPhaseLabel] = useState('advertising')

  const adjRef = useRef(buildAdj(new Set()))
  const pathRef = useRef<number[] | null>(selectPath('short', adjRef.current))
  const ringsRef = useRef<number[]>(ringsFromOrigin(adjRef.current))
  const informedRef = useRef(0)      // how many advertisement rings have spread
  const progressRef = useRef(0)      // packet position along the path (hops)
  const phaseRef = useRef<'advertise' | 'forward'>('advertise')
  const rafRef = useRef<number | undefined>(undefined)
  const lastTsRef = useRef<number | undefined>(undefined)

  const recompute = useCallback((p: Policy, c: Set<string>) => {
    adjRef.current = buildAdj(c)
    pathRef.current = selectPath(p, adjRef.current)
    ringsRef.current = ringsFromOrigin(adjRef.current)
    informedRef.current = 0
    progressRef.current = 0
    phaseRef.current = 'advertise'
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const path = pathRef.current
    const onPath = new Set(path ?? [])
    const pathEdges = new Set<string>()
    if (path) for (let i = 0; i < path.length - 1; i++) pathEdges.add(ekey(path[i], path[i + 1]))

    const rings = ringsRef.current
    const maxRing = informedRef.current

    // Edges
    for (const e of EDGES) {
      const na = ASES[e.a]
      const nb = ASES[e.b]
      const k = ekey(e.a, e.b)
      const isCut = cut.has(k)
      const isRoute = pathEdges.has(k)
      ctx.beginPath()
      ctx.moveTo(na.x, na.y)
      ctx.lineTo(nb.x, nb.y)
      if (isCut) {
        ctx.strokeStyle = 'rgba(248,113,113,0.3)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
      } else if (isRoute && phaseRef.current === 'forward') {
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 3
        ctx.setLineDash([])
      } else if (isRoute) {
        ctx.strokeStyle = 'rgba(248,113,113,0.6)'
        ctx.lineWidth = 2
        ctx.setLineDash([])
      } else {
        ctx.strokeStyle = 'rgba(255,245,235,0.12)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([])
      }
      ctx.stroke()
      ctx.setLineDash([])
      // cost tag on the link
      if (!isCut) {
        const mx = (na.x + nb.x) / 2
        const my = (na.y + nb.y) / 2
        ctx.fillStyle = 'rgba(245,240,232,0.35)'
        ctx.font = '8px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`$${e.cost}`, mx, my)
      }
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

    // AS nodes
    for (const as of ASES) {
      const isSrc = as.id === SOURCE
      const isOrig = as.id === ORIGIN
      const informed = rings[as.id] >= 0 && rings[as.id] <= maxRing
      const justLearned = informed && rings[as.id] === maxRing && phaseRef.current === 'advertise'

      let stroke = 'rgba(255,245,235,0.28)'
      let fill = '#1A1712'
      if (informed) { stroke = 'rgba(96,165,250,0.6)'; fill = 'rgba(96,165,250,0.08)' }
      if (onPath.has(as.id)) { stroke = ACCENT; fill = 'rgba(248,113,113,0.12)' }
      if (justLearned && !isOrig) { stroke = VIOLET; fill = 'rgba(167,139,250,0.16)' }
      if (isSrc) { stroke = BLUE; fill = 'rgba(96,165,250,0.16)' }
      if (isOrig) { stroke = GREEN; fill = 'rgba(16,185,129,0.16)' }

      if (justLearned && !isOrig && !isSrc) {
        const g = ctx.createRadialGradient(as.x, as.y, 0, as.x, as.y, 40)
        g.addColorStop(0, 'rgba(167,139,250,0.30)')
        g.addColorStop(1, 'rgba(167,139,250,0)')
        ctx.beginPath(); ctx.arc(as.x, as.y, 40, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      }
      // AS "cloud" — a rounded node
      ctx.beginPath()
      ctx.arc(as.x, as.y, 23, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = stroke
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = stroke
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(as.asn, as.x, as.y)
    }

    // Source / origin labels
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = BLUE
    ctx.fillText('source', ASES[SOURCE].x, ASES[SOURCE].y - 32)
    ctx.fillStyle = GREEN
    ctx.fillText(PREFIX, ASES[ORIGIN].x, ASES[ORIGIN].y - 32)

    // Packet gliding along the selected AS-path (forward phase)
    if (phaseRef.current === 'forward' && path && path.length > 1) {
      const prog = Math.min(progressRef.current, path.length - 1)
      const seg = Math.min(Math.floor(prog), path.length - 2)
      const t = prog - seg
      const a = ASES[path[seg]]
      const b = ASES[path[seg + 1]]
      const px = a.x + (b.x - a.x) * t
      const py = a.y + (b.y - a.y) * t
      const g = ctx.createRadialGradient(px, py, 0, px, py, 15)
      g.addColorStop(0, 'rgba(245,158,11,0.55)')
      g.addColorStop(1, 'rgba(245,158,11,0)')
      ctx.beginPath(); ctx.arc(px, py, 15, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fillStyle = GOLD; ctx.fill()
    }

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }, [cut])

  const tick = useCallback((ts: number) => {
    if (lastTsRef.current === undefined) lastTsRef.current = ts
    const dt = (ts - lastTsRef.current) / 1000
    lastTsRef.current = ts
    const path = pathRef.current
    const maxRing = Math.max(0, ...ringsRef.current)

    if (phaseRef.current === 'advertise') {
      informedRef.current += dt * 2.2 // rings per second
      const shown = Math.floor(informedRef.current)
      if (shown >= maxRing) {
        informedRef.current = maxRing
        // hold on full advertisement, then start forwarding
        draw()
        phaseRef.current = 'forward'
        progressRef.current = 0
        setPhaseLabel('forwarding')
        lastTsRef.current = undefined
        window.setTimeout(() => {
          if (rafRef.current === undefined) return
          lastTsRef.current = undefined
          rafRef.current = requestAnimationFrame(tick)
        }, 650)
        rafRef.current = undefined
        return
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    // forward phase
    if (!path || path.length < 2) { draw(); setRunning(false); return }
    progressRef.current += dt * 1.4 // hops per second
    if (progressRef.current >= path.length - 1) {
      progressRef.current = path.length - 1
      draw()
      // pause on arrival, then loop the whole cycle
      window.setTimeout(() => {
        if (rafRef.current === undefined) return
        informedRef.current = 0
        progressRef.current = 0
        phaseRef.current = 'advertise'
        setPhaseLabel('advertising')
        lastTsRef.current = undefined
        rafRef.current = requestAnimationFrame(tick)
      }, 1100)
      rafRef.current = undefined
      return
    }
    draw()
    rafRef.current = requestAnimationFrame(tick)
  }, [draw])

  const stop = useCallback(() => {
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    rafRef.current = undefined
    lastTsRef.current = undefined
  }, [])

  const start = useCallback(() => {
    stop()
    informedRef.current = 0
    progressRef.current = 0
    phaseRef.current = 'advertise'
    setPhaseLabel('advertising')
    lastTsRef.current = undefined
    setRunning(true)
    rafRef.current = requestAnimationFrame(tick)
  }, [stop, tick])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        informedRef.current = Math.max(0, ...ringsRef.current)
        phaseRef.current = 'forward'
        progressRef.current = pathRef.current ? pathRef.current.length - 1 : 0
        setPhaseLabel('forwarding')
        draw()
      } else {
        start()
      }
    },
  })

  useEffect(() => { draw() }, [draw])
  useEffect(() => () => stop(), [stop])

  // Recompute route whenever policy or cuts change; keep animating.
  useEffect(() => {
    recompute(policy, cut)
    if (running) start()
    else draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policy, cut])

  const toggleRun = () => {
    if (running) { stop(); setRunning(false); draw() }
    else start()
  }

  const reset = () => {
    stop()
    setRunning(false)
    setCut(new Set())
    setPolicy('short')
    recompute('short', new Set())
    triggerReset()
    draw()
  }

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * W
    const my = ((e.clientY - rect.top) / rect.height) * H
    let best = -1
    let bestD = 12
    EDGES.forEach((edge, i) => {
      const na = ASES[edge.a]
      const nb = ASES[edge.b]
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
      const k = ekey(EDGES[best].a, EDGES[best].b)
      setCut(prev => {
        const nextSet = new Set(prev)
        if (nextSet.has(k)) nextSet.delete(k)
        else nextSet.add(k)
        return nextSet
      })
    }
  }

  const path = pathRef.current
  const asPathStr = path ? path.map(i => ASES[i].asn).join(' → ') : null
  const pathCost = path
    ? path.slice(1).reduce((sum, node, i) => {
        const prevNode = path[i]
        const e = EDGES.find(ed => ekey(ed.a, ed.b) === ekey(prevNode, node))
        return sum + (e ? e.cost : 0)
      }, 0)
    : 0

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · BGP route advertisement</span>
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
          style={{ background: '#0F0D0A' }}
        />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary">
        {asPathStr ? (
          <>
            <span style={{ color: CYAN }}>{phaseLabel}</span> · selected AS-path for {PREFIX}:{' '}
            <span style={{ color: ACCENT }}>{asPathStr}</span>{' '}
            <span className="text-text-muted">({path!.length - 1} AS hops, cost {pathCost})</span>
          </>
        ) : (
          <span style={{ color: ACCENT }}>{PREFIX} is unreachable — you cut every path. With no route advertised, the prefix simply disappears.</span>
        )}
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="font-mono">policy:</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setPolicy('short')}
              className="px-2.5 py-1 font-mono text-xs transition-colors"
              style={policy === 'short' ? { background: ACCENT, color: '#0F0D0A' } : { color: 'rgba(245,240,232,0.6)' }}
            >
              shortest AS-path
            </button>
            <button
              onClick={() => setPolicy('cheap')}
              className="px-2.5 py-1 font-mono text-xs transition-colors"
              style={policy === 'cheap' ? { background: GREEN, color: '#0F0D0A' } : { color: 'rgba(245,240,232,0.6)' }}
            >
              cheapest relationship
            </button>
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
