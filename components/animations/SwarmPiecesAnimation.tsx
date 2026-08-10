'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 380

const RED = '#F87171'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const CYAN = '#22D3EE'
const MUTE = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.28)'

const NUM_PIECES = 6
const NUM_NODES = 6 // node 0 is the seed, 1..5 are peers
const PIECE_COLORS = [RED, GOLD, BLUE, VIOLET, GREEN, CYAN]
const PEER_LABELS = ['SEED', 'peer A', 'peer B', 'peer C', 'peer D', 'peer E']

const BOX_W = 96
const BOX_H = 34
const MAX_INFLIGHT = 3
const SPAWN_MS = 520
const FLIGHT_MS = 700

type Node = {
  id: number
  owned: boolean[]
  x: number // box centre
  y: number
}

type Packet = { from: number; to: number; piece: number; t: number }

type Sim = {
  nodes: Node[]
  packets: Packet[]
  spawn: number
  transfers: number
  lastRarest: number // piece index of the most recent rarest-first pick, -1 = none
}

// Ring layout: seed at the top, peers around it.
function nodeCentre(i: number) {
  const cx = 300
  const cy = 186
  const r = 122
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / NUM_NODES
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

function makeSim(): Sim {
  const nodes: Node[] = []
  for (let i = 0; i < NUM_NODES; i++) {
    const c = nodeCentre(i)
    if (i === 0) {
      nodes.push({ id: i, owned: Array(NUM_PIECES).fill(true), x: c.x, y: c.y })
    } else {
      // each peer starts holding just one or two random pieces
      const owned = Array(NUM_PIECES).fill(false)
      const start = 1 + Math.floor(Math.random() * 2)
      let placed = 0
      while (placed < start) {
        const p = Math.floor(Math.random() * NUM_PIECES)
        if (!owned[p]) {
          owned[p] = true
          placed++
        }
      }
      nodes.push({ id: i, owned, x: c.x, y: c.y })
    }
  }
  return { nodes, packets: [], spawn: 200, transfers: 0, lastRarest: -1 }
}

function isComplete(n: Node) {
  return n.owned.every(Boolean)
}

// How many nodes currently hold each piece (rarity).
function pieceCounts(sim: Sim) {
  const counts = Array(NUM_PIECES).fill(0)
  for (const n of sim.nodes) for (let p = 0; p < NUM_PIECES; p++) if (n.owned[p]) counts[p]++
  return counts
}

function inFlightTo(sim: Sim, to: number, piece: number) {
  return sim.packets.some(pk => pk.to === to && pk.piece === piece)
}

// Rarest-first: pick a needy peer, hand it the rarest piece it still lacks
// that some other node can supply, from a source that already has it.
function spawnTransfer(sim: Sim) {
  if (sim.packets.length >= MAX_INFLIGHT) return
  const counts = pieceCounts(sim)
  const needy = sim.nodes.filter(n => n.id !== 0 && !isComplete(n))
  if (needy.length === 0) return
  // shuffle needy so the same peer isn't always served first
  const requester = needy[Math.floor(Math.random() * needy.length)]

  let bestPiece = -1
  let bestCount = Infinity
  for (let p = 0; p < NUM_PIECES; p++) {
    if (requester.owned[p]) continue
    if (inFlightTo(sim, requester.id, p)) continue
    if (counts[p] === 0) continue // nobody has it (can't happen: seed has all)
    if (counts[p] < bestCount) {
      bestCount = counts[p]
      bestPiece = p
    }
  }
  if (bestPiece < 0) return

  // choose a source that owns the piece — prefer another peer over the seed,
  // so the swarm visibly assembles the file from many sources
  const owners = sim.nodes.filter(n => n.id !== requester.id && n.owned[bestPiece])
  const peerOwners = owners.filter(n => n.id !== 0)
  const pool = peerOwners.length > 0 ? peerOwners : owners
  const source = pool[Math.floor(Math.random() * pool.length)]

  sim.packets.push({ from: source.id, to: requester.id, piece: bestPiece, t: 0 })
  sim.lastRarest = bestPiece
}

function tick(sim: Sim, dt: number) {
  sim.spawn -= dt
  if (sim.spawn <= 0) {
    sim.spawn = SPAWN_MS
    spawnTransfer(sim)
  }
  const keep: Packet[] = []
  for (const pk of sim.packets) {
    pk.t += dt / FLIGHT_MS
    if (pk.t >= 1) {
      sim.nodes[pk.to].owned[pk.piece] = true
      sim.transfers++
    } else {
      keep.push(pk)
    }
  }
  sim.packets = keep
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export function SwarmPiecesAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const simRef = useRef<Sim>(makeSim())
  const [running, setRunning] = useState(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sim = simRef.current
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    // ---- header ----
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText('One file, split into 6 numbered pieces. Peers trade pieces they have for the ones they lack.', 20, 20)

    // ---- edges between nodes (faint mesh) ----
    for (let i = 0; i < NUM_NODES; i++) {
      for (let j = i + 1; j < NUM_NODES; j++) {
        ctx.strokeStyle = 'rgba(245,240,232,0.06)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(sim.nodes[i].x, sim.nodes[i].y)
        ctx.lineTo(sim.nodes[j].x, sim.nodes[j].y)
        ctx.stroke()
      }
    }

    // ---- travelling piece packets ----
    for (const pk of sim.packets) {
      const a = sim.nodes[pk.from]
      const b = sim.nodes[pk.to]
      const x = a.x + (b.x - a.x) * pk.t
      const y = a.y + (b.y - a.y) * pk.t
      const col = PIECE_COLORS[pk.piece]
      ctx.beginPath()
      ctx.arc(x, y, 8, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
      ctx.fillStyle = '#0F0D0A'
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(String(pk.piece + 1), x, y + 3)
    }

    // ---- nodes ----
    for (const n of sim.nodes) {
      const bx = n.x - BOX_W / 2
      const by = n.y - BOX_H / 2
      const complete = isComplete(n)
      const isSeed = n.id === 0
      const frame = complete ? GREEN : isSeed ? GOLD : MUTE

      roundRect(ctx, bx, by, BOX_W, BOX_H, 6)
      ctx.fillStyle = complete ? `${GREEN}18` : isSeed ? `${GOLD}14` : 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = frame
      ctx.lineWidth = complete || isSeed ? 1.6 : 1
      ctx.fill()
      ctx.stroke()

      // label
      ctx.textAlign = 'left'
      ctx.font = 'bold 8px monospace'
      ctx.fillStyle = complete ? GREEN : isSeed ? GOLD : MUTE
      ctx.fillText(PEER_LABELS[n.id], bx + 6, by + 11)
      if (complete && !isSeed) {
        ctx.textAlign = 'right'
        ctx.fillStyle = GREEN
        ctx.fillText('complete', bx + BOX_W - 6, by + 11)
      }

      // piece cells
      const cw = 12
      const gap = 2
      const totalW = NUM_PIECES * cw + (NUM_PIECES - 1) * gap
      const startX = n.x - totalW / 2
      const cy = by + 18
      for (let p = 0; p < NUM_PIECES; p++) {
        const cx = startX + p * (cw + gap)
        const has = n.owned[p]
        roundRect(ctx, cx, cy, cw, cw, 2)
        ctx.fillStyle = has ? PIECE_COLORS[p] : 'rgba(255,255,255,0.04)'
        ctx.strokeStyle = has ? PIECE_COLORS[p] : FAINT
        ctx.lineWidth = 1
        ctx.fill()
        ctx.stroke()
        if (has) {
          ctx.fillStyle = '#0F0D0A'
          ctx.font = 'bold 8px monospace'
          ctx.textAlign = 'center'
          ctx.fillText(String(p + 1), cx + cw / 2, cy + cw - 3)
        }
      }
    }

    // ---- rarity legend / status ----
    const counts = pieceCounts(sim)
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = MUTE
    ctx.fillText('copies of each piece in the swarm (rarest gets traded first):', 20, H - 30)
    for (let p = 0; p < NUM_PIECES; p++) {
      const cx = 40 + p * 44
      const rare = counts[p] === Math.min(...counts)
      ctx.fillStyle = PIECE_COLORS[p]
      ctx.beginPath()
      ctx.roundRect(cx, H - 24, 10, 10, 2)
      ctx.fill()
      ctx.fillStyle = rare ? GOLD : MUTE
      ctx.font = rare ? 'bold 9px monospace' : '9px monospace'
      ctx.fillText(`×${counts[p]}`, cx + 14, H - 15)
    }

    const done = sim.nodes.filter(n => n.id !== 0 && isComplete(n)).length
    ctx.textAlign = 'right'
    ctx.font = '9px monospace'
    ctx.fillStyle = done === NUM_NODES - 1 ? GREEN : MUTE
    ctx.fillText(`peers complete ${done}/${NUM_NODES - 1}   ·   transfers ${sim.transfers}`, W - 20, H - 15)
  }, [])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const loop = () => {
      tick(simRef.current, 16 * 2.2)
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) {
        setRunning(true)
      } else {
        // reduced motion: show the finished swarm, no animation
        for (const n of simRef.current.nodes) n.owned = Array(NUM_PIECES).fill(true)
        simRef.current.packets = []
        draw()
      }
    },
  })

  useEffect(() => {
    draw()
  }, [draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    simRef.current = makeSim()
    setRunning(false)
    triggerReset()
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Piece Exchange</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: Piece Exchange. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <span className="text-xs text-text-muted">
          Each peer assembles the whole file from many partial sources — and shares a piece the moment it arrives.
        </span>
      </div>
    </div>
  )
}
