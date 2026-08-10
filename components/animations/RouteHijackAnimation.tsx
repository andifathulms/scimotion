'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, RotateCcw, ShieldCheck } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const ACCENT = '#F87171' // red — the rogue AS and hijacked routes
const GOLD = '#F59E0B'   // travelling traffic
const BLUE = '#60A5FA'   // user ASes sending traffic
const GREEN = '#10B981'  // the legitimate owner of the prefix
const VIOLET = '#A78BFA'

const PREFIX = '203.0.113.0/24'

type AS = { id: number; x: number; y: number; asn: string; role: 'user' | 'transit' | 'legit' | 'rogue' }

// A legitimate owner (AS64500) on the far right, a rogue AS (AS64666) planted
// among the users on the left. Both announce the SAME prefix.
const ASES: AS[] = [
  { id: 0, x: 60,  y: 70,  asn: 'AS64510', role: 'user' },
  { id: 1, x: 60,  y: 270, asn: 'AS64520', role: 'user' },
  { id: 2, x: 190, y: 170, asn: 'AS64530', role: 'transit' },
  { id: 3, x: 340, y: 90,  asn: 'AS64540', role: 'transit' },
  { id: 4, x: 340, y: 250, asn: 'AS64550', role: 'transit' },
  { id: 5, x: 540, y: 120, asn: 'AS64500', role: 'legit' },
  { id: 6, x: 235, y: 292, asn: 'AS64666', role: 'rogue' },
]

const LEGIT = 5
const ROGUE = 6
const USERS = [0, 1]

type Edge = [number, number]
const EDGES: Edge[] = [
  [0, 2], [1, 2],
  [2, 3], [2, 4],
  [3, 5], [4, 5],
  [1, 6], [2, 6],
]

const adj: number[][] = ASES.map(() => [])
for (const [a, b] of EDGES) { adj[a].push(b); adj[b].push(a) }

// Min-hop distance from a source over the graph, optionally treating the rogue
// as unreachable (when route filtering / RPKI rejects its announcement).
function bfsDist(from: number, rogueRejected: boolean): number[] {
  const dist = new Array<number>(ASES.length).fill(-1)
  dist[from] = 0
  const q = [from]
  while (q.length) {
    const cur = q.shift()!
    for (const nb of adj[cur]) {
      if (rogueRejected && nb === ROGUE) continue
      if (dist[nb] === -1) { dist[nb] = dist[cur] + 1; q.push(nb) }
    }
  }
  return dist
}

function bfsPath(from: number, to: number, rogueRejected: boolean): number[] | null {
  const prev = new Array<number>(ASES.length).fill(-2)
  prev[from] = -1
  const q = [from]
  while (q.length) {
    const cur = q.shift()!
    if (cur === to) break
    for (const nb of adj[cur]) {
      if (rogueRejected && nb === ROGUE) continue
      if (prev[nb] === -2) { prev[nb] = cur; q.push(nb) }
    }
  }
  if (prev[to] === -2) return null
  const path: number[] = []
  let c = to
  while (c !== -1) { path.push(c); c = prev[c] }
  return path.reverse()
}

// Which origin an AS believes: the nearer of the two announcements. The rogue
// wins only when it is strictly closer; a tie (or protection) keeps the legit.
function believedOrigin(asId: number, hijack: boolean, protectedOn: boolean): number {
  const distLegit = bfsDist(LEGIT, false)[asId]
  if (!hijack || protectedOn) return LEGIT
  const distRogue = bfsDist(ROGUE, false)[asId]
  if (distRogue >= 0 && (distLegit < 0 || distRogue < distLegit)) return ROGUE
  return LEGIT
}

const ekey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)

export function RouteHijackAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hijack, setHijack] = useState(true)
  const [protectedOn, setProtectedOn] = useState(false)
  const [running, setRunning] = useState(false)

  const pathsRef = useRef<{ path: number[]; toRogue: boolean }[]>([])
  const progressRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)
  const lastTsRef = useRef<number | undefined>(undefined)

  const recompute = useCallback((h: boolean, p: boolean) => {
    pathsRef.current = USERS.map(u => {
      const origin = believedOrigin(u, h, p)
      const path = bfsPath(u, origin, false)
      return { path: path ?? [u], toRogue: origin === ROGUE }
    })
    progressRef.current = 0
  }, [])

  const draw = useCallback((h: boolean, p: boolean) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const paths = pathsRef.current
    const activeEdges = new Map<string, boolean>() // key -> toRogue
    for (const { path, toRogue } of paths) {
      for (let i = 0; i < path.length - 1; i++) {
        const k = ekey(path[i], path[i + 1])
        // prefer marking rogue-bound if any user uses it that way
        activeEdges.set(k, activeEdges.get(k) || toRogue)
      }
    }
    const pathEdgeSet = new Set(activeEdges.keys())

    // Edges
    for (const [a, b] of EDGES) {
      const na = ASES[a]
      const nb = ASES[b]
      const k = ekey(a, b)
      const isRogueEdge = a === ROGUE || b === ROGUE
      const rejected = isRogueEdge && (!h || p)
      const active = pathEdgeSet.has(k)
      ctx.beginPath()
      ctx.moveTo(na.x, na.y)
      ctx.lineTo(nb.x, nb.y)
      if (rejected) {
        ctx.strokeStyle = 'rgba(248,113,113,0.28)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
      } else if (active) {
        ctx.strokeStyle = activeEdges.get(k) ? ACCENT : GREEN
        ctx.lineWidth = 3
        ctx.setLineDash([])
      } else {
        ctx.strokeStyle = 'rgba(255,245,235,0.12)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([])
      }
      ctx.stroke()
      ctx.setLineDash([])
      if (rejected) {
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
      const believes = believedOrigin(as.id, h, p)
      let stroke = 'rgba(255,245,235,0.28)'
      let fill = '#1A1712'
      const label = as.asn

      if (as.role === 'transit' || as.role === 'user') {
        if (believes === ROGUE) { stroke = ACCENT; fill = 'rgba(248,113,113,0.12)' }
        else { stroke = 'rgba(255,245,235,0.4)'; fill = '#1A1712' }
      }
      if (as.role === 'user') { stroke = BLUE; fill = 'rgba(96,165,250,0.14)' }
      if (as.role === 'legit') { stroke = GREEN; fill = 'rgba(16,185,129,0.16)' }
      if (as.role === 'rogue') {
        const rejected = !h || p
        stroke = rejected ? 'rgba(248,113,113,0.4)' : ACCENT
        fill = rejected ? 'rgba(248,113,113,0.05)' : 'rgba(248,113,113,0.18)'
      }

      // captured transit ASes get a subtle red halo
      if ((as.role === 'transit') && believes === ROGUE) {
        const g = ctx.createRadialGradient(as.x, as.y, 0, as.x, as.y, 40)
        g.addColorStop(0, 'rgba(248,113,113,0.25)')
        g.addColorStop(1, 'rgba(248,113,113,0)')
        ctx.beginPath(); ctx.arc(as.x, as.y, 40, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(as.x, as.y, 23, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = stroke
      ctx.lineWidth = as.role === 'rogue' || as.role === 'legit' ? 2.5 : 2
      ctx.stroke()
      ctx.fillStyle = stroke
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, as.x, as.y)
    }

    // Role tags
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = GREEN
    ctx.fillText(`owns ${PREFIX}`, ASES[LEGIT].x, ASES[LEGIT].y - 32)
    const rogueRejected = !h || p
    ctx.fillStyle = rogueRejected ? 'rgba(248,113,113,0.5)' : ACCENT
    ctx.fillText(rogueRejected ? 'rogue: rejected' : `hijacks ${PREFIX}`, ASES[ROGUE].x, ASES[ROGUE].y + 34)

    // Traffic packets
    const paths2 = pathsRef.current
    for (const { path, toRogue } of paths2) {
      if (path.length < 2) continue
      const prog = Math.min(progressRef.current, path.length - 1)
      const seg = Math.min(Math.floor(prog), path.length - 2)
      const t = prog - seg
      const a = ASES[path[seg]]
      const b = ASES[path[seg + 1]]
      const px = a.x + (b.x - a.x) * t
      const py = a.y + (b.y - a.y) * t
      const arrived = progressRef.current >= path.length - 1
      const color = toRogue ? ACCENT : GOLD
      const g = ctx.createRadialGradient(px, py, 0, px, py, 15)
      g.addColorStop(0, toRogue ? 'rgba(248,113,113,0.5)' : 'rgba(245,158,11,0.55)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.beginPath(); ctx.arc(px, py, 15, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()

      // Outcome marker at the destination once arrived
      if (arrived) {
        const dest = ASES[path[path.length - 1]]
        if (toRogue) {
          // black hole: dark disc + red cross
          ctx.beginPath(); ctx.arc(dest.x, dest.y, 12, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(15,13,10,0.85)'; ctx.fill()
          ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.moveTo(dest.x - 6, dest.y - 6); ctx.lineTo(dest.x + 6, dest.y + 6)
          ctx.moveTo(dest.x + 6, dest.y - 6); ctx.lineTo(dest.x - 6, dest.y + 6)
          ctx.stroke()
        } else {
          // delivered: green check glow
          const gg = ctx.createRadialGradient(dest.x, dest.y, 0, dest.x, dest.y, 22)
          gg.addColorStop(0, 'rgba(16,185,129,0.4)')
          gg.addColorStop(1, 'rgba(16,185,129,0)')
          ctx.beginPath(); ctx.arc(dest.x, dest.y, 22, 0, Math.PI * 2); ctx.fillStyle = gg; ctx.fill()
          ctx.strokeStyle = GREEN; ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.moveTo(dest.x - 6, dest.y); ctx.lineTo(dest.x - 1, dest.y + 5); ctx.lineTo(dest.x + 7, dest.y - 5)
          ctx.stroke()
        }
      }
    }

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }, [])

  const tick = useCallback((ts: number) => {
    if (lastTsRef.current === undefined) lastTsRef.current = ts
    const dt = (ts - lastTsRef.current) / 1000
    lastTsRef.current = ts
    const maxLen = Math.max(2, ...pathsRef.current.map(p => p.path.length))
    progressRef.current += dt * 1.3
    if (progressRef.current >= maxLen - 1) {
      progressRef.current = maxLen - 1
      draw(hijack, protectedOn)
      window.setTimeout(() => {
        if (rafRef.current === undefined) return
        progressRef.current = 0
        lastTsRef.current = undefined
        rafRef.current = requestAnimationFrame(tick)
      }, 1300)
      rafRef.current = undefined
      return
    }
    draw(hijack, protectedOn)
    rafRef.current = requestAnimationFrame(tick)
  }, [draw, hijack, protectedOn])

  const stop = useCallback(() => {
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    rafRef.current = undefined
    lastTsRef.current = undefined
  }, [])

  const start = useCallback(() => {
    stop()
    progressRef.current = 0
    lastTsRef.current = undefined
    setRunning(true)
    rafRef.current = requestAnimationFrame(tick)
  }, [stop, tick])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        const maxLen = Math.max(2, ...pathsRef.current.map(pp => pp.path.length))
        progressRef.current = maxLen - 1
        draw(hijack, protectedOn)
      } else {
        start()
      }
    },
  })

  useEffect(() => { draw(hijack, protectedOn) }, [draw, hijack, protectedOn])
  useEffect(() => () => stop(), [stop])

  useEffect(() => {
    recompute(hijack, protectedOn)
    if (running) start()
    else draw(hijack, protectedOn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hijack, protectedOn])

  const toggleRun = () => {
    if (running) { stop(); setRunning(false); draw(hijack, protectedOn) }
    else start()
  }

  const reset = () => {
    stop()
    setRunning(false)
    setHijack(true)
    setProtectedOn(false)
    recompute(true, false)
    triggerReset()
    draw(true, false)
  }

  const capturedCount = ASES.filter(a => (a.role === 'user' || a.role === 'transit') && believedOrigin(a.id, hijack, protectedOn) === ROGUE).length

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Prefix hijack &amp; defence</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: Prefix hijack &amp; defence. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary">
        {!hijack ? (
          <>No hijack: every AS routes {PREFIX} to its rightful owner <span style={{ color: GREEN }}>AS64500</span>. Traffic delivered.</>
        ) : protectedOn ? (
          <><span style={{ color: GREEN }}>RPKI / route filtering on</span>: the rogue announcement fails origin validation and is dropped. Traffic restored to <span style={{ color: GREEN }}>AS64500</span>.</>
        ) : (
          <><span style={{ color: ACCENT }}>Hijack live, unprotected</span>: {capturedCount} network{capturedCount === 1 ? '' : 's'} believe <span style={{ color: ACCENT }}>AS64666</span> and black-hole their traffic.</>
        )}
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setHijack(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border"
          style={hijack
            ? { background: 'rgba(248,113,113,0.12)', borderColor: ACCENT, color: ACCENT }
            : { borderColor: 'var(--border, rgba(255,245,235,0.12))', color: 'rgba(245,240,232,0.6)' }}
        >
          rogue announcement: {hijack ? 'on' : 'off'}
        </button>
        <button
          onClick={() => setProtectedOn(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border"
          style={protectedOn
            ? { background: 'rgba(16,185,129,0.12)', borderColor: GREEN, color: GREEN }
            : { borderColor: 'var(--border, rgba(255,245,235,0.12))', color: 'rgba(245,240,232,0.6)' }}
        >
          <ShieldCheck size={12} /> RPKI / filtering: {protectedOn ? 'on' : 'off'}
        </button>
        <button
          onClick={toggleRun}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: VIOLET, color: '#0F0D0A' }}
        >
          {running ? <Pause size={12} /> : <Play size={12} />} {running ? 'Pause' : 'Play'}
        </button>
      </div>
    </div>
  )
}
