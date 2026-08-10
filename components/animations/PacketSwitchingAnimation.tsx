'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Scissors } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

// Mesh: node 0 is the source (S), node 11 the destination (D); 1..10 are routers.
type Pt = { x: number; y: number }
const NODES: Pt[] = [
  { x: 48, y: 170 },  // 0  S
  { x: 150, y: 80 },  // 1
  { x: 150, y: 170 }, // 2
  { x: 150, y: 260 }, // 3
  { x: 300, y: 55 },  // 4
  { x: 300, y: 140 }, // 5
  { x: 300, y: 200 }, // 6
  { x: 300, y: 285 }, // 7
  { x: 450, y: 80 },  // 8
  { x: 450, y: 170 }, // 9
  { x: 450, y: 260 }, // 10
  { x: 552, y: 170 }, // 11 D
]
const SRC = 0
const DST = 11

const EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 3],
  [1, 2], [2, 3],
  [1, 4], [1, 5], [2, 5], [2, 6], [3, 6], [3, 7],
  [4, 5], [5, 6], [6, 7],
  [4, 8], [5, 8], [5, 9], [6, 9], [6, 10], [7, 10],
  [8, 9], [9, 10],
  [8, 11], [9, 11], [10, 11],
]

const ekey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)

const COL = {
  accent: '#F87171', // red — packets / the internet
  gold: '#F59E0B',   // reserved circuit
  blue: '#60A5FA',
  violet: '#A78BFA',
  green: '#10B981',  // delivered
  cyan: '#22D3EE',
  cut: '#F87171',
  mute: 'rgba(255,245,235,0.5)',
  faint: 'rgba(255,245,235,0.12)',
}

// Packet colours cycle so numbered packets are visually distinct.
const PCOL = [COL.accent, COL.gold, COL.blue, COL.violet, COL.cyan, COL.green]

const MSG_LEN = 8       // packets in one message
const LEG_MS = 520      // virtual ms to cross one hop
const EMIT_MS = 380     // gap between emitting successive packets

type Packet = {
  seq: number
  route: number[]
  leg: number
  t: number
  color: string
  bg: boolean
  state: 'flight' | 'done' | 'lost'
}

type CircuitState = 'connecting' | 'active' | 'dropped'

type Sim = {
  mode: 'circuit' | 'packet'
  cut: Set<string>
  clock: number
  // packet mode
  packets: Packet[]
  emitTimer: number
  nextSeq: number
  delivered: boolean[]
  bgTimer: number
  cycleTimer: number
  // circuit mode
  circuitPath: number[] | null
  circuitState: CircuitState
  token: number      // 0..(path length-1) position of the reserved-stream pulse
  tokenDir: number
  retry: number
  note: string
}

function neighbors(cut: Set<string>): number[][] {
  const adj: number[][] = Array.from({ length: NODES.length }, () => [])
  for (const [a, b] of EDGES) {
    if (cut.has(ekey(a, b))) continue
    adj[a].push(b)
    adj[b].push(a)
  }
  return adj
}

// Shortest path (fewest hops) from s to d avoiding cut edges; [] if none.
function bfsPath(s: number, d: number, cut: Set<string>): number[] {
  const adj = neighbors(cut)
  const prev = new Array<number>(NODES.length).fill(-2)
  prev[s] = -1
  const q = [s]
  while (q.length) {
    const u = q.shift() as number
    if (u === d) break
    for (const v of adj[u]) {
      if (prev[v] === -2) {
        prev[v] = u
        q.push(v)
      }
    }
  }
  if (prev[d] === -2) return []
  const path: number[] = []
  for (let u = d; u !== -1; u = prev[u]) path.unshift(u)
  return path
}

function makeSim(mode: 'circuit' | 'packet'): Sim {
  const sim: Sim = {
    mode,
    cut: new Set(),
    clock: 0,
    packets: [],
    emitTimer: 0,
    nextSeq: 0,
    delivered: Array.from({ length: MSG_LEN }, () => false),
    bgTimer: 0,
    cycleTimer: 0,
    circuitPath: null,
    circuitState: 'connecting',
    token: 0,
    tokenDir: 1,
    retry: 0,
    note: '',
  }
  if (mode === 'circuit') dial(sim)
  else sim.note = 'message split into 8 numbered packets — sharing the mesh'
  return sim
}

function dial(sim: Sim) {
  const path = bfsPath(SRC, DST, sim.cut)
  if (path.length === 0) {
    sim.circuitPath = null
    sim.circuitState = 'dropped'
    sim.note = 'no free path — call cannot be set up'
    return
  }
  sim.circuitPath = path
  sim.circuitState = 'active'
  sim.token = 0
  sim.tokenDir = 1
  sim.note = `circuit reserved end-to-end over ${path.length - 1} links — held for the whole call`
}

function reservedEdges(sim: Sim): Set<string> {
  const s = new Set<string>()
  const p = sim.circuitPath
  if (!p || sim.circuitState !== 'active') return s
  for (let i = 0; i < p.length - 1; i++) s.add(ekey(p[i], p[i + 1]))
  return s
}

function emitPacket(sim: Sim, seq: number, from: number, to: number, color: string, bg: boolean) {
  const route = bfsPath(from, to, sim.cut)
  if (route.length < 2) return
  sim.packets.push({ seq, route, leg: 0, t: 0, color, bg, state: 'flight' })
}

function tickPacket(sim: Sim, dt: number) {
  sim.clock += dt

  // Emit the message's packets one at a time.
  if (sim.nextSeq < MSG_LEN) {
    sim.emitTimer -= dt
    if (sim.emitTimer <= 0) {
      sim.emitTimer = EMIT_MS
      emitPacket(sim, sim.nextSeq, SRC, DST, PCOL[sim.nextSeq % PCOL.length], false)
      sim.nextSeq += 1
    }
  }

  // Background traffic from other senders — the shared network.
  sim.bgTimer -= dt
  if (sim.bgTimer <= 0) {
    sim.bgTimer = 300
    const a = 1 + Math.floor(Math.random() * 10)
    let b = 1 + Math.floor(Math.random() * 10)
    if (b === a) b = ((b + 3) % 10) + 1
    emitPacket(sim, -1, a, b, COL.mute, true)
  }

  for (const p of sim.packets) {
    if (p.state !== 'flight') continue
    p.t += dt / LEG_MS
    while (p.t >= 1 && p.state === 'flight') {
      p.t -= 1
      p.leg += 1
      const at = p.route[p.leg]
      if (at === p.route[p.route.length - 1]) {
        p.state = 'done'
        if (!p.bg && p.seq >= 0 && p.seq < MSG_LEN) sim.delivered[p.seq] = true
        break
      }
      // Store-and-forward: at each router, if the next link is now cut, reroute.
      const next = p.route[p.leg + 1]
      if (sim.cut.has(ekey(at, next))) {
        const dest = p.route[p.route.length - 1]
        const re = bfsPath(at, dest, sim.cut)
        if (re.length < 2) {
          p.state = 'lost'
        } else {
          p.route = re
          p.leg = 0
          p.t = 0
        }
      }
    }
  }

  // Drop finished and lost packets from the render list.
  sim.packets = sim.packets.filter(p => p.state === 'flight')

  // When the whole message has arrived, pause then resend so the widget loops.
  if (sim.nextSeq >= MSG_LEN && sim.delivered.every(Boolean) && sim.packets.every(p => p.bg)) {
    sim.cycleTimer += dt
    sim.note = 'all 8 packets delivered and reassembled — resending'
    if (sim.cycleTimer > 1400) {
      sim.cycleTimer = 0
      sim.nextSeq = 0
      sim.emitTimer = 0
      sim.delivered = sim.delivered.map(() => false)
      sim.note = 'message split into 8 numbered packets — sharing the mesh'
    }
  }
}

function tickCircuit(sim: Sim, dt: number) {
  sim.clock += dt
  const p = sim.circuitPath

  if (sim.circuitState === 'active' && p) {
    // Any reserved link cut => the call drops instantly.
    for (let i = 0; i < p.length - 1; i++) {
      if (sim.cut.has(ekey(p[i], p[i + 1]))) {
        sim.circuitState = 'dropped'
        sim.circuitPath = null
        sim.note = 'a reserved link was cut — the call DROPS (no reroute)'
        sim.retry = 1600
        return
      }
    }
    // Pulse travelling the held path, representing the continuous reserved stream.
    sim.token += (dt / LEG_MS) * sim.tokenDir
    if (sim.token >= p.length - 1) {
      sim.token = p.length - 1
      sim.tokenDir = -1
    } else if (sim.token <= 0) {
      sim.token = 0
      sim.tokenDir = 1
    }
    return
  }

  if (sim.circuitState === 'dropped') {
    sim.retry -= dt
    if (sim.retry <= 0) {
      sim.note = 'redialling — must reserve a whole new path'
      dial(sim)
    }
  }
}

export function PacketSwitchingAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const simRef = useRef<Sim>(makeSim('packet'))
  const [running, setRunning] = useState(false)
  const [mode, setMode] = useState<'circuit' | 'packet'>('packet')
  const [, force] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sim = simRef.current
    ctx.clearRect(0, 0, W, H)

    const reserved = reservedEdges(sim)

    // Edges.
    for (const [a, b] of EDGES) {
      const k = ekey(a, b)
      const isCut = sim.cut.has(k)
      const isRes = reserved.has(k)
      ctx.beginPath()
      ctx.moveTo(NODES[a].x, NODES[a].y)
      ctx.lineTo(NODES[b].x, NODES[b].y)
      if (isCut) {
        ctx.setLineDash([5, 5])
        ctx.strokeStyle = 'rgba(248,113,113,0.35)'
        ctx.lineWidth = 1.5
      } else if (isRes) {
        ctx.setLineDash([])
        ctx.strokeStyle = COL.gold
        ctx.lineWidth = 3.5
      } else {
        ctx.setLineDash([])
        ctx.strokeStyle = COL.faint
        ctx.lineWidth = 1.5
      }
      ctx.stroke()
      ctx.setLineDash([])

      // Draw a small scissor mark at the midpoint of a cut link.
      if (isCut) {
        const mx = (NODES[a].x + NODES[b].x) / 2
        const my = (NODES[a].y + NODES[b].y) / 2
        ctx.fillStyle = COL.cut
        ctx.font = 'bold 12px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('✂', mx, my)
      }
    }

    // Circuit pulse.
    if (sim.mode === 'circuit' && sim.circuitState === 'active' && sim.circuitPath) {
      const p = sim.circuitPath
      const i = Math.min(Math.floor(sim.token), p.length - 2)
      const f = sim.token - i
      const a = NODES[p[i]]
      const b = NODES[p[i + 1]]
      const x = a.x + (b.x - a.x) * f
      const y = a.y + (b.y - a.y) * f
      ctx.beginPath()
      ctx.arc(x, y, 6, 0, Math.PI * 2)
      ctx.fillStyle = COL.gold
      ctx.fill()
    }

    // Packets.
    if (sim.mode === 'packet') {
      for (const pk of sim.packets) {
        if (pk.state !== 'flight') continue
        const a = NODES[pk.route[pk.leg]]
        const b = NODES[pk.route[pk.leg + 1]]
        if (!a || !b) continue
        const x = a.x + (b.x - a.x) * pk.t
        const y = a.y + (b.y - a.y) * pk.t
        if (pk.bg) {
          ctx.beginPath()
          ctx.arc(x, y, 2.5, 0, Math.PI * 2)
          ctx.fillStyle = pk.color
          ctx.globalAlpha = 0.5
          ctx.fill()
          ctx.globalAlpha = 1
        } else {
          ctx.beginPath()
          ctx.arc(x, y, 8, 0, Math.PI * 2)
          ctx.fillStyle = pk.color
          ctx.fill()
          ctx.fillStyle = '#0F0D0A'
          ctx.font = 'bold 10px monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(pk.seq + 1), x, y)
        }
      }
    }

    // Nodes.
    NODES.forEach((n, i) => {
      const endpoint = i === SRC || i === DST
      ctx.beginPath()
      ctx.arc(n.x, n.y, endpoint ? 16 : 9, 0, Math.PI * 2)
      ctx.fillStyle = endpoint ? 'rgba(96,165,250,0.18)' : 'rgba(26,23,18,0.9)'
      ctx.fill()
      ctx.strokeStyle = endpoint ? COL.blue : 'rgba(255,245,235,0.35)'
      ctx.lineWidth = endpoint ? 2 : 1.25
      ctx.stroke()
      if (endpoint) {
        ctx.fillStyle = COL.blue
        ctx.font = 'bold 12px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(i === SRC ? 'S' : 'D', n.x, n.y)
      }
    })

    // Message-reassembly strip (packet mode only).
    if (sim.mode === 'packet') {
      const x0 = 40
      const y0 = 322
      const cw = 26
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = COL.mute
      ctx.font = '9px monospace'
      ctx.fillText('message', x0, y0 - 6)
      for (let i = 0; i < MSG_LEN; i++) {
        const x = x0 + 62 + i * (cw + 4)
        const got = sim.delivered[i]
        ctx.fillStyle = got ? 'rgba(16,185,129,0.28)' : 'rgba(255,255,255,0.03)'
        ctx.fillRect(x, y0 - 16, cw, 20)
        ctx.strokeStyle = got ? COL.green : COL.faint
        ctx.lineWidth = 1
        ctx.strokeRect(x, y0 - 16, cw, 20)
        ctx.fillStyle = got ? COL.green : COL.mute
        ctx.font = '10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), x + cw / 2, y0 - 2)
      }
      ctx.textAlign = 'left'
    }

    // Status note.
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '10px monospace'
    ctx.fillStyle = sim.mode === 'circuit' && sim.circuitState === 'dropped' ? COL.cut : 'rgba(255,245,235,0.65)'
    ctx.fillText(`› ${sim.note}`, 16, 22)
  }, [])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const loop = () => {
      const sim = simRef.current
      if (sim.mode === 'packet') tickPacket(sim, 16)
      else tickCircuit(sim, 16)
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
      else draw()
    },
  })

  useEffect(() => {
    draw()
  }, [draw])

  const switchMode = (m: 'circuit' | 'packet') => {
    simRef.current = makeSim(m)
    setMode(m)
    draw()
  }

  // Click a link to cut / restore it.
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scale = W / rect.width
    const px = (e.clientX - rect.left) * scale
    const py = (e.clientY - rect.top) * scale
    let best = -1
    let bestD = 12
    EDGES.forEach(([a, b], idx) => {
      const A = NODES[a]
      const B = NODES[b]
      const dx = B.x - A.x
      const dy = B.y - A.y
      const len2 = dx * dx + dy * dy
      let t = len2 === 0 ? 0 : ((px - A.x) * dx + (py - A.y) * dy) / len2
      t = Math.max(0, Math.min(1, t))
      const cx = A.x + dx * t
      const cy = A.y + dy * t
      const d = Math.hypot(px - cx, py - cy)
      if (d < bestD) {
        bestD = d
        best = idx
      }
    })
    if (best < 0) return
    const sim = simRef.current
    const [a, b] = EDGES[best]
    const k = ekey(a, b)
    if (sim.cut.has(k)) sim.cut.delete(k)
    else sim.cut.add(k)
    if (sim.mode === 'circuit' && sim.circuitState === 'dropped' && !sim.cut.has(k)) {
      // Restoring a link may let a redial succeed sooner.
      sim.retry = Math.min(sim.retry, 400)
    }
    draw()
    force(x => x + 1)
  }

  // Convenience: sever a link on the currently active route.
  const cutActiveLink = () => {
    const sim = simRef.current
    let path: number[] = []
    if (sim.mode === 'circuit') path = sim.circuitPath ?? []
    else {
      const msg = sim.packets.find(p => !p.bg && p.state === 'flight')
      path = msg ? msg.route : bfsPath(SRC, DST, sim.cut)
    }
    for (let i = 0; i < path.length - 1; i++) {
      const k = ekey(path[i], path[i + 1])
      if (!sim.cut.has(k)) {
        sim.cut.add(k)
        break
      }
    }
    draw()
    force(x => x + 1)
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    simRef.current = makeSim(mode)
    setRunning(false)
    triggerReset()
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Circuit vs Packet Switching</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onClick={onCanvasClick}
          className="w-full rounded-lg cursor-pointer"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(['circuit', 'packet'] as const).map(m => (
            <button key={m} onClick={() => switchMode(m)}
              className={`px-4 py-1.5 uppercase font-mono tracking-wide transition-colors ${mode === m ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {m}
            </button>
          ))}
        </div>
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <button onClick={cutActiveLink}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors">
          <Scissors size={12} /> Cut a link on the path
        </button>
        <span className="text-xs text-text-muted">or click any link to cut / restore it</span>
      </div>
    </div>
  )
}
