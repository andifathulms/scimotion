'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Zap, Split, HeartPulse } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 380

const N = 5
const MAJORITY = 3

// Virtual-millisecond timings. The whole simulation runs on its own clock so the
// speed control just changes how much clock time each animation frame buys.
const FLIGHT = 380
const HEARTBEAT = 420
const PROPOSE = 1500
const ELECTION_MIN = 1500
const ELECTION_MAX = 3000
const MAX_LOG = 12

// Ring geometry. Node 0 sits at the top; the rest run clockwise. The partition
// line is the vertical x = 273, which puts {3, 4} on the minority side.
const CX = 300
const CY = 128
const RING = 92
const NODE_R = 24
const PARTITION_X = 273

const POS = Array.from({ length: N }, (_, i) => {
  const a = (-90 + i * (360 / N)) * (Math.PI / 180)
  return { x: CX + Math.cos(a) * RING, y: CY + Math.sin(a) * RING }
})

const COL = {
  leader: '#F59E0B',
  candidate: '#A78BFA',
  follower: '#60A5FA',
  dead: 'rgba(255,245,235,0.22)',
  commit: '#10B981',
  drop: '#F472B6',
}

type Role = 'follower' | 'candidate' | 'leader' | 'dead'
type Entry = { term: number; value: string }

type Node = {
  id: number
  role: Role
  term: number
  votedFor: number | null
  base: number
  log: Entry[]
  commit: number
  timer: number
  window: number
  votes: number[]
  match: number[]
  flash: number
}

type Kind = 'vote-req' | 'vote-ok' | 'append' | 'ack'

type Msg = {
  from: number
  to: number
  kind: Kind
  term: number
  t: number
  dropAt: number
  base: number
  entries: Entry[]
  commit: number
  ok: boolean
  match: number
  logLen: number
}

type Sim = {
  clock: number
  nodes: Node[]
  msgs: Msg[]
  heartbeat: number
  propose: number
  nextValue: number
  partition: boolean
  events: string[]
}

const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
const side = (id: number) => (POS[id].x < PARTITION_X ? 1 : 0)

function makeNode(id: number): Node {
  const window = rnd(ELECTION_MIN, ELECTION_MAX)
  return {
    id,
    role: 'follower',
    term: 0,
    votedFor: null,
    base: 0,
    log: [],
    commit: 0,
    timer: window,
    window,
    votes: [],
    match: Array.from({ length: N }, () => 0),
    flash: 0,
  }
}

function makeSim(): Sim {
  return {
    clock: 0,
    nodes: Array.from({ length: N }, (_, i) => makeNode(i)),
    msgs: [],
    heartbeat: HEARTBEAT,
    propose: PROPOSE,
    nextValue: 0,
    partition: false,
    events: ['cluster booted — all five followers waiting on their election timers'],
  }
}

function log(sim: Sim, text: string) {
  sim.events.unshift(text)
  if (sim.events.length > 4) sim.events.pop()
}

function resetTimer(n: Node) {
  n.window = rnd(ELECTION_MIN, ELECTION_MAX)
  n.timer = n.window
}

function send(sim: Sim, m: Omit<Msg, 't' | 'dropAt'>) {
  const a = POS[m.from]
  const b = POS[m.to]
  let dropAt = 1
  if (sim.partition && side(m.from) !== side(m.to)) {
    const dx = b.x - a.x
    dropAt = Math.abs(dx) < 1 ? 0.5 : Math.min(0.92, Math.max(0.08, (PARTITION_X - a.x) / dx))
  }
  sim.msgs.push({ ...m, t: 0, dropAt })
}

const blank = {
  base: 0,
  entries: [] as Entry[],
  commit: 0,
  ok: false,
  match: 0,
  logLen: 0,
}

function startElection(sim: Sim, n: Node) {
  n.term += 1
  n.role = 'candidate'
  n.votedFor = n.id
  n.votes = [n.id]
  n.flash = 260
  resetTimer(n)
  log(sim, `S${n.id} timed out first → candidate for term ${n.term}`)
  for (let j = 0; j < N; j++) {
    if (j === n.id) continue
    send(sim, { ...blank, from: n.id, to: j, kind: 'vote-req', term: n.term, logLen: n.base + n.log.length })
  }
}

function becomeLeader(sim: Sim, n: Node) {
  n.role = 'leader'
  n.flash = 320
  n.match = Array.from({ length: N }, (_, i) => (i === n.id ? n.base + n.log.length : 0))
  sim.heartbeat = 0
  log(sim, `S${n.id} won ${n.votes.length}/${N} votes → leader of term ${n.term}`)
}

function stepDown(n: Node, term: number) {
  n.term = term
  n.role = 'follower'
  n.votedFor = null
  n.votes = []
  resetTimer(n)
}

function advanceCommit(sim: Sim, l: Node) {
  l.match[l.id] = l.base + l.log.length
  const sorted = [...l.match].sort((a, b) => b - a)
  const candidate = sorted[MAJORITY - 1]
  const local = l.log[candidate - l.base - 1]
  // Raft only commits an entry from the current term; older entries then follow.
  if (candidate > l.commit && local && local.term === l.term) {
    l.commit = candidate
    log(sim, `entry ${candidate} acknowledged by ${MAJORITY}/${N} → committed`)
  }
}

function deliver(sim: Sim, m: Msg) {
  const to = sim.nodes[m.to]
  if (to.role === 'dead') return

  if (m.kind === 'vote-req') {
    if (m.term > to.term) stepDown(to, m.term)
    const grant =
      m.term === to.term &&
      (to.votedFor === null || to.votedFor === m.from) &&
      m.logLen >= to.base + to.log.length
    if (grant) {
      to.votedFor = m.from
      resetTimer(to)
    }
    send(sim, { ...blank, from: to.id, to: m.from, kind: 'vote-ok', term: to.term, ok: grant })
    return
  }

  if (m.kind === 'vote-ok') {
    if (m.term > to.term) {
      stepDown(to, m.term)
      return
    }
    if (to.role !== 'candidate' || m.term !== to.term || !m.ok) return
    if (!to.votes.includes(m.from)) to.votes.push(m.from)
    if (to.votes.length >= MAJORITY) becomeLeader(sim, to)
    return
  }

  if (m.kind === 'append') {
    if (m.term < to.term) {
      send(sim, { ...blank, from: to.id, to: m.from, kind: 'ack', term: to.term, ok: false })
      return
    }
    if (m.term > to.term) stepDown(to, m.term)
    to.role = 'follower'
    to.votedFor = m.from
    resetTimer(to)
    to.base = m.base
    to.log = m.entries.map(e => ({ ...e }))
    to.commit = Math.min(m.commit, to.base + to.log.length)
    to.flash = 140
    send(sim, {
      ...blank,
      from: to.id,
      to: m.from,
      kind: 'ack',
      term: to.term,
      ok: true,
      match: to.base + to.log.length,
    })
    return
  }

  // ack
  if (m.term > to.term) {
    stepDown(to, m.term)
    log(sim, `S${to.id} saw a higher term (${m.term}) and stepped down`)
    return
  }
  if (to.role !== 'leader' || !m.ok) return
  to.match[m.from] = Math.max(to.match[m.from], m.match)
  advanceCommit(sim, to)
}

function tick(sim: Sim, dt: number) {
  sim.clock += dt

  for (const n of sim.nodes) {
    if (n.flash > 0) n.flash = Math.max(0, n.flash - dt)
    if (n.role === 'dead' || n.role === 'leader') continue
    n.timer -= dt
    if (n.timer <= 0) startElection(sim, n)
  }

  const leader = sim.nodes.find(n => n.role === 'leader')

  if (leader) {
    sim.heartbeat -= dt
    if (sim.heartbeat <= 0) {
      sim.heartbeat = HEARTBEAT
      leader.match[leader.id] = leader.base + leader.log.length
      for (let j = 0; j < N; j++) {
        if (j === leader.id) continue
        send(sim, {
          ...blank,
          from: leader.id,
          to: j,
          kind: 'append',
          term: leader.term,
          base: leader.base,
          entries: leader.log.map(e => ({ ...e })),
          commit: leader.commit,
        })
      }
    }
    sim.propose -= dt
    if (sim.propose <= 0) {
      sim.propose = PROPOSE
      if (leader.log.length >= MAX_LOG) {
        // Snapshot: once the whole visible window is committed it is discarded
        // and the index window scrolls forward, so the widget never freezes.
        if (leader.commit >= leader.base + MAX_LOG) {
          leader.base += MAX_LOG
          leader.log = []
          leader.match[leader.id] = leader.base
          log(sim, `snapshot taken through index ${leader.base} — window scrolls`)
        }
      } else {
        const value = String.fromCharCode(97 + (sim.nextValue % 26))
        sim.nextValue += 1
        leader.log.push({ term: leader.term, value })
        leader.match[leader.id] = leader.base + leader.log.length
      }
    }
  }

  const keep: Msg[] = []
  for (const m of sim.msgs) {
    m.t += dt / FLIGHT
    if (m.t >= m.dropAt) {
      if (m.dropAt >= 1) deliver(sim, m)
      continue
    }
    keep.push(m)
  }
  sim.msgs = keep
}

function roleColor(n: Node) {
  if (n.role === 'dead') return COL.dead
  if (n.role === 'leader') return COL.leader
  if (n.role === 'candidate') return COL.candidate
  return COL.follower
}

const MSG_COLOR: Record<Kind, string> = {
  'vote-req': '#A78BFA',
  'vote-ok': '#10B981',
  append: '#60A5FA',
  ack: 'rgba(16,185,129,0.75)',
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  speed: { default: 3, min: 1, max: 6, step: 1 },
}

export function ConsensusAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const simRef = useRef<Sim>(makeSim())
  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('consensus', SPEC)
  const { speed } = params
  const [partition, setPartition] = useState(false)
  const [downCount, setDownCount] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sim = simRef.current
    ctx.clearRect(0, 0, W, H)

    // Fully-connected mesh, drawn faintly behind everything.
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const cut = sim.partition && side(i) !== side(j)
        ctx.beginPath()
        ctx.moveTo(POS[i].x, POS[i].y)
        ctx.lineTo(POS[j].x, POS[j].y)
        ctx.strokeStyle = cut ? 'rgba(244,114,182,0.10)' : 'rgba(255,245,235,0.09)'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }

    if (sim.partition) {
      ctx.save()
      ctx.setLineDash([6, 5])
      ctx.strokeStyle = COL.drop
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(PARTITION_X, 14)
      ctx.lineTo(PARTITION_X, 248)
      ctx.stroke()
      ctx.restore()
      ctx.fillStyle = COL.drop
      ctx.font = '9px monospace'
      ctx.textAlign = 'right'
      ctx.fillText('minority · 2', PARTITION_X - 8, 24)
      ctx.textAlign = 'left'
      ctx.fillText('majority · 3', PARTITION_X + 8, 24)
    }

    // In-flight messages.
    for (const m of sim.msgs) {
      const a = POS[m.from]
      const b = POS[m.to]
      const t = Math.min(m.t, m.dropAt)
      const x = a.x + (b.x - a.x) * t
      const y = a.y + (b.y - a.y) * t
      const dying = m.dropAt < 1 && m.t > m.dropAt * 0.82
      ctx.beginPath()
      ctx.arc(x, y, m.kind === 'append' ? 4 : 3.2, 0, Math.PI * 2)
      ctx.fillStyle = dying ? COL.drop : MSG_COLOR[m.kind]
      ctx.globalAlpha = dying ? 0.5 : 1
      ctx.fill()
      ctx.globalAlpha = 1
    }

    // Nodes.
    for (const n of sim.nodes) {
      const p = POS[n.id]
      const col = roleColor(n)

      if (n.flash > 0) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, NODE_R + 16)
        g.addColorStop(0, `${col}55`)
        g.addColorStop(1, `${col}00`)
        ctx.beginPath()
        ctx.arc(p.x, p.y, NODE_R + 16, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.fill()
      }

      // Election-timeout ring: how much of this node's randomised window is left.
      if (n.role === 'follower' || n.role === 'candidate') {
        const frac = Math.max(0, Math.min(1, n.timer / n.window))
        ctx.beginPath()
        ctx.arc(p.x, p.y, NODE_R + 6, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,245,235,0.3)'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      ctx.beginPath()
      ctx.arc(p.x, p.y, NODE_R, 0, Math.PI * 2)
      ctx.fillStyle = n.role === 'dead' ? 'rgba(26,23,18,0.9)' : `${col}22`
      ctx.fill()
      ctx.strokeStyle = col
      ctx.lineWidth = n.role === 'leader' ? 3 : 1.6
      ctx.stroke()

      ctx.textAlign = 'center'
      ctx.fillStyle = col
      ctx.font = 'bold 12px monospace'
      ctx.fillText(`S${n.id}`, p.x, p.y - 1)
      ctx.font = '9px monospace'
      ctx.fillStyle = n.role === 'dead' ? COL.dead : 'rgba(255,245,235,0.55)'
      ctx.fillText(n.role === 'dead' ? 'down' : `t${n.term}`, p.x, p.y + 11)

      if (n.role === 'leader') {
        ctx.fillStyle = COL.leader
        ctx.font = 'bold 8px monospace'
        ctx.fillText('LEADER', p.x, p.y - NODE_R - 7)
      } else if (n.role === 'candidate') {
        ctx.fillStyle = COL.candidate
        ctx.font = 'bold 8px monospace'
        ctx.fillText(`VOTES ${n.votes.length}`, p.x, p.y - NODE_R - 7)
      }
    }

    // Log matrix — one row per server, one column per index.
    const slotW = 22
    const x0 = 92
    const y0 = 276
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,245,235,0.35)'
    ctx.font = '9px monospace'
    const windowBase = Math.max(...sim.nodes.map(nd => nd.base))
    ctx.fillText(
      `replicated log — gold = stored, green = committed${windowBase > 0 ? `  (from index ${windowBase + 1})` : ''}`,
      x0, 267
    )

    for (const n of sim.nodes) {
      const y = y0 + n.id * 18
      ctx.fillStyle = n.role === 'dead' ? COL.dead : 'rgba(255,245,235,0.45)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`S${n.id}${n.role === 'leader' ? ' ★' : ''}`, 58, y + 11)

      for (let k = 0; k < MAX_LOG; k++) {
        const x = x0 + k * slotW
        const e = n.log[k]
        if (!e) {
          ctx.strokeStyle = 'rgba(255,245,235,0.06)'
          ctx.lineWidth = 1
          ctx.strokeRect(x, y, slotW - 3, 15)
          continue
        }
        const committed = n.base + k < n.commit
        ctx.fillStyle = committed ? 'rgba(16,185,129,0.28)' : 'rgba(245,158,11,0.16)'
        ctx.fillRect(x, y, slotW - 3, 15)
        ctx.strokeStyle = committed ? COL.commit : COL.leader
        ctx.lineWidth = 1
        ctx.strokeRect(x, y, slotW - 3, 15)
        ctx.fillStyle = committed ? COL.commit : COL.leader
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(`${e.value}${e.term}`, x + (slotW - 3) / 2, y + 11)
      }
    }

    // Status column on the right of the log matrix.
    const leader = sim.nodes.find(n => n.role === 'leader')
    const maxTerm = Math.max(...sim.nodes.map(n => n.term))
    const alive = sim.nodes.filter(n => n.role !== 'dead').length
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.35)'
    ctx.fillText(`term  ${maxTerm}`, 372, y0 + 11)
    ctx.fillStyle = leader ? COL.leader : COL.drop
    ctx.fillText(leader ? `leader  S${leader.id}` : 'leader  none', 372, y0 + 29)
    ctx.fillStyle = COL.commit
    ctx.fillText(`committed  ${leader ? leader.commit : Math.max(...sim.nodes.map(n => n.commit))}`, 372, y0 + 47)
    ctx.fillStyle = alive >= MAJORITY ? 'rgba(255,245,235,0.35)' : COL.drop
    ctx.fillText(`alive  ${alive}/${N}  (need ${MAJORITY})`, 372, y0 + 65)

    // Most recent event, as a single full-width line above the log panel.
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.6)'
    ctx.fillText(`› ${sim.events[0]}`, 16, 256)
  }, [])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const loop = () => {
      tick(simRef.current, 16 * speed)
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, speed, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
      else draw()
    },
  })

  useEffect(() => {
    draw()
  }, [draw])

  const killLeader = () => {
    const sim = simRef.current
    const leader = sim.nodes.find(n => n.role === 'leader')
    const target = leader ?? sim.nodes.find(n => n.role !== 'dead')
    if (!target) return
    target.role = 'dead'
    target.votes = []
    sim.msgs = sim.msgs.filter(m => m.from !== target.id && m.to !== target.id)
    log(sim, `S${target.id} crashed — survivors must elect a new leader`)
    setDownCount(sim.nodes.filter(n => n.role === 'dead').length)
    draw()
  }

  const reviveAll = () => {
    const sim = simRef.current
    for (const n of sim.nodes) {
      if (n.role !== 'dead') continue
      n.role = 'follower'
      n.votedFor = null
      n.votes = []
      resetTimer(n)
    }
    log(sim, 'downed servers restarted — they catch up from the leader')
    setDownCount(0)
    draw()
  }

  const togglePartition = () => {
    const sim = simRef.current
    sim.partition = !sim.partition
    log(
      sim,
      sim.partition
        ? 'network split: S3/S4 can no longer reach S0/S1/S2'
        : 'partition healed — the stale side rewinds to the majority log'
    )
    setPartition(sim.partition)
    draw()
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    simRef.current = makeSim()
    setRunning(false)
    setPartition(false)
    setDownCount(0)
    triggerReset()
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Raft Cluster</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: Raft Cluster. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <button onClick={killLeader}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors">
          <Zap size={12} /> Kill leader
        </button>
        <button onClick={reviveAll} disabled={downCount === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors disabled:opacity-40">
          <HeartPulse size={12} /> Revive {downCount > 0 ? `(${downCount})` : ''}
        </button>
        <button onClick={togglePartition}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${partition ? 'border-accent-pink text-accent-pink' : 'border-border text-text-secondary hover:bg-bg-hover'}`}>
          <Split size={12} /> {partition ? 'Heal network' : 'Partition'}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Speed:</span>
          <input type="range" min={SPEC.speed.min} max={SPEC.speed.max} step={SPEC.speed.step} value={speed}
            onChange={e => set('speed', +e.target.value)}
            className="w-16 accent-accent-gold" />
        </label>
      </div>
    </div>
  )
}
