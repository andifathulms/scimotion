'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Scissors } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 380

// Colours
const RED = '#F87171'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const CYAN = '#22D3EE'
const INK = 'rgba(255,245,235,0.55)'
const FAINT = 'rgba(255,245,235,0.10)'

// Geometry: sender on the left, receiver on the right, a "wire" in between.
const SENDER_X = 96
const RECV_X = 504
const WIRE_TOP = 96
const LANE_Y = 150 // vertical centre of the flight lane

const FLIGHT = 900 // virtual ms for a packet to cross the wire one way
const RECV_WINDOW_MAX = 4 // receiver buffer, in segments
const TOTAL_SEGMENTS = 8 // data segments to deliver after the handshake
const RTO = 1400 // retransmission timeout (virtual ms)
const SEND_GAP = 520 // spacing between launching new segments

type Phase = 'handshake' | 'data' | 'done'
type PktKind = 'syn' | 'syn-ack' | 'ack' | 'data' | 'dack'

type Pkt = {
  id: number
  kind: PktKind
  seq: number // segment number carried (data) or acked-up-to (dack)
  dir: 1 | -1 // 1 = sender→receiver, -1 = receiver→sender
  t: number // 0..1 progress along the wire
  dropAt: number // progress at which it dies (>=1 means it arrives)
  dying: boolean
}

type Seg = {
  seq: number
  sent: boolean
  acked: boolean
  timer: number // ms until retransmit if unacked
  retransmits: number
}

type Sim = {
  clock: number
  phase: Phase
  hsStep: number // 0 none, 1 SYN sent, 2 SYN-ACK, 3 ACK -> established
  pkts: Pkt[]
  segs: Seg[]
  received: boolean[] // which seqs the receiver physically holds
  delivered: number // highest contiguous seq handed to the app (1-based count)
  nextToSend: number // index into segs of next unsent segment
  sendCooldown: number
  window: number // receiver advertised window (segments), user-adjustable max
  ackedUpTo: number // cumulative ack: highest in-order seq received
  dropArmed: boolean // user asked to drop the next data segment
  drops: number
  retransmits: number
  nextId: number
  event: string
}

function makeSim(window: number): Sim {
  return {
    clock: 0,
    phase: 'handshake',
    hsStep: 0,
    pkts: [],
    segs: Array.from({ length: TOTAL_SEGMENTS }, (_, i) => ({
      seq: i + 1,
      sent: false,
      acked: false,
      timer: 0,
      retransmits: 0,
    })),
    received: Array.from({ length: TOTAL_SEGMENTS }, () => false),
    delivered: 0,
    nextToSend: 0,
    sendCooldown: 0,
    window,
    ackedUpTo: 0,
    dropArmed: false,
    drops: 0,
    retransmits: 0,
    nextId: 0,
    event: 'idle — press Run to open the connection',
  }
}

function launch(sim: Sim, kind: PktKind, seq: number, dir: 1 | -1, drop = false) {
  sim.pkts.push({
    id: sim.nextId++,
    kind,
    seq,
    dir,
    t: 0,
    dropAt: drop ? 0.5 : 2,
    dying: false,
  })
}

// How many segments are currently in flight or waiting for an ack.
function outstanding(sim: Sim): number {
  return sim.segs.filter(s => s.sent && !s.acked).length
}

function deliverToApp(sim: Sim) {
  // Advance the contiguous delivered pointer across received segments.
  while (sim.delivered < TOTAL_SEGMENTS && sim.received[sim.delivered]) {
    sim.delivered++
  }
}

function onArrive(sim: Sim, p: Pkt) {
  if (p.kind === 'syn') {
    sim.hsStep = 1
    sim.event = 'receiver got SYN → replies SYN-ACK (agreeing on sequence numbers)'
    launch(sim, 'syn-ack', 0, -1)
    return
  }
  if (p.kind === 'syn-ack') {
    sim.hsStep = 2
    sim.event = 'sender got SYN-ACK → sends final ACK'
    launch(sim, 'ack', 0, 1)
    return
  }
  if (p.kind === 'ack') {
    sim.hsStep = 3
    sim.phase = 'data'
    sim.event = 'connection established — reliable data transfer begins'
    return
  }
  if (p.kind === 'data') {
    const i = p.seq - 1
    if (!sim.received[i]) sim.received[i] = true
    deliverToApp(sim)
    // Cumulative ACK: name the highest in-order byte received.
    let ack = 0
    for (let k = 0; k < TOTAL_SEGMENTS; k++) {
      if (sim.received[k]) ack = k + 1
      else break
    }
    sim.ackedUpTo = ack
    launch(sim, 'dack', ack, -1)
    return
  }
  // dack — cumulative acknowledgement arriving back at the sender.
  for (const s of sim.segs) {
    if (s.seq <= p.seq && !s.acked) {
      s.acked = true
      s.timer = 0
    }
  }
  const done = sim.segs.every(s => s.acked)
  if (done && sim.phase === 'data') {
    sim.phase = 'done'
    sim.event = 'every segment acknowledged — the stream arrived perfect and in order'
  }
}

function tick(sim: Sim, dt: number) {
  sim.clock += dt

  // Kick off the handshake once.
  if (sim.phase === 'handshake' && sim.hsStep === 0 && sim.pkts.length === 0) {
    sim.hsStep = 0.5
    sim.event = 'sender sends SYN (its starting sequence number)'
    launch(sim, 'syn', 0, 1)
  }

  // Move packets along the wire.
  const keep: Pkt[] = []
  for (const p of sim.pkts) {
    p.t += dt / FLIGHT
    if (p.dropAt < 1 && p.t >= p.dropAt) {
      // Packet dropped by the network mid-flight.
      p.dying = true
      if (p.t >= p.dropAt + 0.18) continue // fully vanished
      keep.push(p)
      continue
    }
    if (p.t >= 1) {
      onArrive(sim, p)
      continue
    }
    keep.push(p)
  }
  sim.pkts = keep

  if (sim.phase !== 'data') return

  // Retransmission timers on unacked, already-sent segments.
  for (const s of sim.segs) {
    if (s.sent && !s.acked) {
      s.timer -= dt
      if (s.timer <= 0) {
        s.timer = RTO
        s.retransmits++
        sim.retransmits++
        sim.event = `no ACK for segment ${s.seq} → timeout, retransmitting it`
        launch(sim, 'data', s.seq, 1)
      }
    }
  }

  // Send new segments, bounded by the receiver's advertised window.
  sim.sendCooldown -= dt
  if (sim.sendCooldown <= 0 && sim.nextToSend < TOTAL_SEGMENTS) {
    if (outstanding(sim) < sim.window) {
      const s = sim.segs[sim.nextToSend]
      s.sent = true
      s.timer = RTO
      sim.nextToSend++
      sim.sendCooldown = SEND_GAP
      const willDrop = sim.dropArmed
      if (willDrop) {
        sim.dropArmed = false
        sim.drops++
        sim.event = `segment ${s.seq} launched — the network will drop it in flight`
      } else {
        sim.event = `segment ${s.seq} sent (window = ${sim.window})`
      }
      launch(sim, 'data', s.seq, 1, willDrop)
    }
  }
}

export function TCPHandshakeAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const windowRef = useRef(RECV_WINDOW_MAX)
  const simRef = useRef<Sim>(makeSim(RECV_WINDOW_MAX))
  const [running, setRunning] = useState(false)
  const [win, setWin] = useState(RECV_WINDOW_MAX)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sim = simRef.current
    ctx.clearRect(0, 0, W, H)

    // Endpoint columns.
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = RED
    ctx.fillText('SENDER', SENDER_X, 34)
    ctx.fillStyle = BLUE
    ctx.fillText('RECEIVER', RECV_X, 34)
    ctx.font = '9px monospace'
    ctx.fillStyle = INK
    ctx.fillText('your machine', SENDER_X, 48)
    ctx.fillText('the server', RECV_X, 48)

    // Vertical endpoint rails.
    for (const rx of [SENDER_X, RECV_X]) {
      ctx.strokeStyle = FAINT
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(rx, 58)
      ctx.lineTo(rx, 300)
      ctx.stroke()
    }

    // The "network" label between the rails — best-effort, drops allowed.
    ctx.fillStyle = 'rgba(255,245,235,0.28)'
    ctx.font = '9px monospace'
    ctx.fillText('best-effort network (packets may be dropped)', W / 2, WIRE_TOP - 20)

    // Handshake ledger (top strip).
    const hsLabels = ['SYN', 'SYN-ACK', 'ACK']
    for (let i = 0; i < 3; i++) {
      const on = sim.hsStep > i + 0.4 || (sim.phase !== 'handshake')
      const x = 210 + i * 60
      ctx.fillStyle = on ? GOLD : 'rgba(255,245,235,0.22)'
      ctx.font = on ? 'bold 10px monospace' : '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(hsLabels[i], x, 74)
    }
    ctx.textAlign = 'center'
    ctx.fillStyle = sim.hsStep >= 3 ? GREEN : 'rgba(255,245,235,0.25)'
    ctx.font = 'bold 10px monospace'
    ctx.fillText(sim.hsStep >= 3 ? 'ESTABLISHED' : '3-way handshake', 420, 74)

    // In-flight packets on the wire.
    for (const p of sim.pkts) {
      const fromX = p.dir === 1 ? SENDER_X : RECV_X
      const toX = p.dir === 1 ? RECV_X : SENDER_X
      const tt = Math.min(p.t, p.dropAt < 1 ? p.dropAt : 1)
      const x = fromX + (toX - fromX) * tt
      const y = LANE_Y + (p.kind === 'dack' || p.kind === 'syn-ack' || p.kind === 'ack' ? 26 : -26)
      let col = BLUE
      if (p.kind === 'syn') col = VIOLET
      else if (p.kind === 'syn-ack') col = CYAN
      else if (p.kind === 'ack') col = VIOLET
      else if (p.kind === 'data') col = RED
      else if (p.kind === 'dack') col = GREEN

      ctx.globalAlpha = p.dying ? 0.35 : 1
      if (p.kind === 'data') {
        // Numbered segment box.
        ctx.fillStyle = `${col}33`
        ctx.strokeStyle = col
        ctx.lineWidth = 1.5
        ctx.fillRect(x - 12, y - 9, 24, 18)
        ctx.strokeRect(x - 12, y - 9, 24, 18)
        ctx.fillStyle = col
        ctx.font = 'bold 10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(String(p.seq), x, y + 4)
      } else {
        ctx.beginPath()
        ctx.arc(x, y, 6, 0, Math.PI * 2)
        ctx.fillStyle = `${col}44`
        ctx.fill()
        ctx.strokeStyle = col
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = col
        ctx.font = '8px monospace'
        ctx.textAlign = 'center'
        const lbl = p.kind === 'dack' ? `ack ${p.seq}` : p.kind.toUpperCase()
        ctx.fillText(lbl, x, y - 11)
      }
      if (p.dying) {
        ctx.fillStyle = GOLD
        ctx.font = '8px monospace'
        ctx.fillText('dropped', x, y + 20)
      }
      ctx.globalAlpha = 1
    }

    // Lane guides.
    ctx.strokeStyle = FAINT
    ctx.setLineDash([4, 5])
    ctx.beginPath()
    ctx.moveTo(SENDER_X, LANE_Y - 26)
    ctx.lineTo(RECV_X, LANE_Y - 26)
    ctx.moveTo(RECV_X, LANE_Y + 26)
    ctx.lineTo(SENDER_X, LANE_Y + 26)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,245,235,0.3)'
    ctx.font = '8px monospace'
    ctx.fillText('data →', SENDER_X + 8, LANE_Y - 32)
    ctx.textAlign = 'right'
    ctx.fillText('← ack', RECV_X - 8, LANE_Y + 40)

    // Receiver buffer / advertised window gauge.
    const bx = RECV_X - 30
    const by = 210
    ctx.textAlign = 'center'
    ctx.fillStyle = INK
    ctx.font = '9px monospace'
    ctx.fillText(`advertised window: ${sim.window}`, RECV_X, by - 8)
    const used = outstanding(sim)
    for (let i = 0; i < RECV_WINDOW_MAX; i++) {
      const cx = bx + i * 16
      const active = i < sim.window
      const filled = i < used
      ctx.fillStyle = filled ? `${RED}55` : active ? FAINT : 'transparent'
      ctx.strokeStyle = active ? RED : 'rgba(255,245,235,0.15)'
      ctx.lineWidth = 1
      ctx.fillRect(cx, by, 13, 16)
      ctx.strokeRect(cx, by, 13, 16)
    }

    // Reassembled stream at the receiver (bottom strip).
    const sx = 60
    const sy = 300
    ctx.textAlign = 'left'
    ctx.fillStyle = INK
    ctx.font = '9px monospace'
    ctx.fillText('reassembled stream (green = delivered in order to the app):', sx, sy - 8)
    const cellW = 30
    for (let i = 0; i < TOTAL_SEGMENTS; i++) {
      const x = sx + i * (cellW + 4)
      const y = sy
      const delivered = i < sim.delivered
      const held = sim.received[i]
      let fill = 'transparent'
      let stroke = 'rgba(255,245,235,0.15)'
      let txt = 'rgba(255,245,235,0.25)'
      if (delivered) {
        fill = `${GREEN}2e`
        stroke = GREEN
        txt = GREEN
      } else if (held) {
        // Received but blocked behind an earlier gap.
        fill = `${GOLD}22`
        stroke = GOLD
        txt = GOLD
      }
      ctx.fillStyle = fill
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1.25
      ctx.fillRect(x, y, cellW, 20)
      ctx.strokeRect(x, y, cellW, 20)
      ctx.fillStyle = txt
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), x + cellW / 2, y + 14)
    }

    // Counters.
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText(`drops: ${sim.drops}`, 400, sy + 15)
    ctx.fillStyle = RED
    ctx.fillText(`retransmits: ${sim.retransmits}`, 460, sy + 15)

    // Event line.
    ctx.fillStyle = 'rgba(255,245,235,0.6)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`› ${sim.event}`, 16, 360)
  }, [])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const loop = () => {
      tick(simRef.current, 16)
      draw()
      if (simRef.current.phase === 'done') {
        setRunning(false)
        return
      }
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

  const dropNext = () => {
    const sim = simRef.current
    if (sim.phase === 'done') return
    sim.dropArmed = true
    sim.event = 'armed: the network will swallow the next data segment'
    draw()
  }

  const changeWindow = (v: number) => {
    windowRef.current = v
    simRef.current.window = v
    setWin(v)
    draw()
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    simRef.current = makeSim(windowRef.current)
    setRunning(false)
    triggerReset()
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Handshake &amp; Reliable Transfer</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <button onClick={dropNext}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors">
          <Scissors size={12} /> Drop next
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Receiver window:</span>
          <input type="range" min={1} max={RECV_WINDOW_MAX} step={1} value={win}
            onChange={e => changeWindow(+e.target.value)}
            className="w-16 accent-accent-gold" />
          <span>{win}</span>
        </div>
      </div>
    </div>
  )
}
