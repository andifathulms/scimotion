'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Scissors } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 360

const RED = '#F87171'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const CYAN = '#22D3EE'
const INK = 'rgba(245,240,232,0.55)'
const MUTE = 'rgba(245,240,232,0.35)'
const FAINT = 'rgba(245,240,232,0.14)'

const STREAMS = 4
const PER_STREAM = 6
const STREAM_TINT = [CYAN, BLUE, VIOLET, GOLD]
// The stream we will drop a packet on, so the reader can watch the others.
const LOSS_STREAM = 1

const FRAME_MS = 95 // one packet arrives at the receiver every this-many ms
const RTO = 1250 // a lost packet is retransmitted this-many ms later

type Mode = 'tcp' | 'quic'

type Frame = { stream: number; seq: number }

// A single interleaved send schedule shared by BOTH modes: round-robin frames
// from every stream, exactly as a multiplexed connection would put them on one wire.
function buildSchedule(): Frame[] {
  const sched: Frame[] = []
  for (let seq = 0; seq < PER_STREAM; seq++) {
    for (let stream = 0; stream < STREAMS; stream++) {
      sched.push({ stream, seq })
    }
  }
  return sched
}

type State = {
  mode: Mode
  clock: number
  sched: Frame[]
  arrived: boolean[] // has each scheduled frame reached the receiver
  sendPtr: number // next schedule index to put on the wire
  cooldown: number
  lostIdx: number // schedule index that was dropped, -1 = none
  retransAt: number // clock time the dropped frame will be retransmitted
  armed: boolean // user asked to drop the next LOSS_STREAM packet
  running: boolean
  pageDone: number
}

function makeState(mode: Mode): State {
  const sched = buildSchedule()
  return {
    mode,
    clock: 0,
    sched,
    arrived: sched.map(() => false),
    sendPtr: 0,
    cooldown: 0,
    lostIdx: -1,
    retransAt: 0,
    armed: false,
    running: false,
    pageDone: -1,
  }
}

// Delivered count per stream, computed from what has arrived.
// TCP: one global in-order byte stream — deliver schedule frames contiguously
//   from the front; the first missing frame stalls EVERY later frame (all streams).
// QUIC: each stream has its own ordering — deliver each stream's frames
//   contiguously; a gap only stalls that one stream.
function delivered(s: State): { deliv: number[]; buffered: number[] } {
  const deliv = new Array(STREAMS).fill(0)
  const buffered = new Array(STREAMS).fill(0)

  if (s.mode === 'tcp') {
    let cut = s.sched.length
    for (let i = 0; i < s.sched.length; i++) {
      if (!s.arrived[i]) { cut = i; break }
    }
    for (let i = 0; i < s.sched.length; i++) {
      const f = s.sched[i]
      if (i < cut) deliv[f.stream]++
      else if (s.arrived[i]) buffered[f.stream]++ // received but held behind the gap
    }
    return { deliv, buffered }
  }

  // QUIC: per-stream in-order delivery.
  for (let stream = 0; stream < STREAMS; stream++) {
    const frames = s.sched.filter(f => f.stream === stream)
    const idxs = s.sched
      .map((f, i) => ({ f, i }))
      .filter(x => x.f.stream === stream)
      .map(x => x.i)
    let blocked = false
    for (let k = 0; k < frames.length; k++) {
      const i = idxs[k]
      if (!blocked && s.arrived[i]) deliv[stream]++
      else {
        if (!s.arrived[i]) blocked = true
        else if (blocked) buffered[stream]++
      }
    }
  }
  return { deliv, buffered }
}

function step(s: State) {
  if (s.pageDone !== -1) return
  s.clock += 16
  s.cooldown -= 16

  // Retransmit the dropped frame once its timeout elapses.
  if (s.lostIdx !== -1 && !s.arrived[s.lostIdx] && s.clock >= s.retransAt) {
    s.arrived[s.lostIdx] = true
  }

  if (s.cooldown <= 0 && s.sendPtr < s.sched.length) {
    s.cooldown = FRAME_MS
    const i = s.sendPtr
    const f = s.sched[i]
    // Should this frame be the one we drop?
    if (s.armed && s.lostIdx === -1 && f.stream === LOSS_STREAM) {
      s.armed = false
      s.lostIdx = i
      s.retransAt = s.clock + RTO
      // dropped in flight — does NOT arrive now
    } else {
      s.arrived[i] = true
    }
    s.sendPtr++
  }

  if (s.arrived.every(Boolean)) s.pageDone = s.clock
}

export function QUICvsTCPAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const stateRef = useRef<State>(makeState('tcp'))
  const [running, setRunning] = useState(false)
  const [mode, setMode] = useState<Mode>('tcp')
  const [, force] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const s = stateRef.current
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    // Header.
    ctx.textAlign = 'left'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = s.mode === 'tcp' ? RED : GREEN
    ctx.fillText(s.mode === 'tcp' ? 'TCP  (HTTP/2)' : 'QUIC  (HTTP/3)', 20, 26)
    ctx.font = '10px monospace'
    ctx.fillStyle = INK
    ctx.fillText(
      s.mode === 'tcp'
        ? 'one in-order byte stream — a gap holds back EVERY stream'
        : 'independent per-stream ordering — a gap holds back only its own stream',
      148,
      26
    )

    const { deliv } = delivered(s)

    const laneX = 96
    const cellW = 66
    const cellGap = 6
    const laneTop = 56
    const laneH = 56

    for (let stream = 0; stream < STREAMS; stream++) {
      const y = laneTop + stream * laneH
      const isLoss = s.lostIdx !== -1 && s.sched[s.lostIdx].stream === stream
      // stalled if any of this lane's cells are held/undelivered because of the gap
      const stalled =
        s.lostIdx !== -1 &&
        !s.arrived[s.lostIdx] &&
        (s.mode === 'tcp' || isLoss)

      // Lane label.
      ctx.textAlign = 'right'
      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = stalled ? RED : STREAM_TINT[stream]
      ctx.fillText(`stream ${stream + 1}`, laneX - 12, y + 22)
      if (isLoss) {
        ctx.font = '8px monospace'
        ctx.fillStyle = MUTE
        ctx.fillText('(loss here)', laneX - 12, y + 34)
      }

      // Cells for this stream, in sequence order.
      for (let seq = 0; seq < PER_STREAM; seq++) {
        const cx = laneX + seq * (cellW + cellGap)
        const schedIdx = s.sched.findIndex(f => f.stream === stream && f.seq === seq)
        const isLost = schedIdx === s.lostIdx && !s.arrived[schedIdx]
        const isDelivered = seq < deliv[stream]
        const isArrived = s.arrived[schedIdx]

        let fill = 'transparent'
        let stroke = 'rgba(245,240,232,0.18)'
        let txt = MUTE
        let lbl = ''
        if (isLost) {
          fill = `${RED}22`
          stroke = RED
          txt = RED
          lbl = 'lost'
        } else if (isDelivered) {
          fill = `${GREEN}2e`
          stroke = GREEN
          txt = GREEN
          lbl = 'ok'
        } else if (isArrived) {
          // arrived at receiver but held behind the gap
          fill = `${GOLD}22`
          stroke = GOLD
          txt = GOLD
          lbl = 'held'
        }
        ctx.fillStyle = fill
        ctx.strokeStyle = stroke
        ctx.lineWidth = isLost ? 1.8 : 1.1
        roundRect(ctx, cx, y + 6, cellW, 30, 5)
        ctx.fill()
        ctx.stroke()
        ctx.textAlign = 'center'
        ctx.font = 'bold 10px monospace'
        ctx.fillStyle = txt
        ctx.fillText(`${stream + 1}.${seq + 1}`, cx + cellW / 2, y + 21)
        if (lbl) {
          ctx.font = '7px monospace'
          ctx.fillStyle = txt
          ctx.fillText(lbl, cx + cellW / 2, y + 31)
        }
      }

      if (stalled) {
        ctx.textAlign = 'left'
        ctx.font = 'bold 9px monospace'
        ctx.fillStyle = RED
        const remain = Math.max(0, s.retransAt - s.clock)
        ctx.fillText(`STALLED · retransmit in ${(remain / 1000).toFixed(1)}s`, laneX + PER_STREAM * (cellW + cellGap) + 4, y + 24)
      }
    }

    // Footer status.
    const fy = laneTop + STREAMS * laneH + 14
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    if (s.pageDone !== -1) {
      ctx.fillStyle = s.mode === 'tcp' ? RED : GREEN
      ctx.font = 'bold 11px monospace'
      ctx.fillText(`All streams delivered in ${(s.pageDone / 1000).toFixed(1)}s`, 20, fy)
    } else if (s.lostIdx !== -1 && !s.arrived[s.lostIdx]) {
      ctx.fillStyle = INK
      ctx.fillText(
        s.mode === 'tcp'
          ? 'green = delivered · gold = arrived but HELD behind the gap · red = lost'
          : 'green = delivered · gold = held (only in the lost stream) · red = lost',
        20,
        fy
      )
    } else if (running) {
      ctx.fillStyle = INK
      ctx.fillText('streaming… press "Drop a packet" to inject loss on stream 2', 20, fy)
    } else {
      ctx.fillStyle = FAINT
      ctx.fillText('Press Run, drop a packet, and toggle TCP vs QUIC to compare.', 20, fy)
    }
  }, [running])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const loop = () => {
      step(stateRef.current)
      draw()
      if (stateRef.current.pageDone !== -1) {
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

  const run = () => {
    const s = stateRef.current
    if (s.pageDone !== -1) stateRef.current = makeState(s.mode)
    setRunning(true)
  }

  const dropPacket = () => {
    const s = stateRef.current
    if (s.pageDone !== -1) return
    if (s.lostIdx !== -1) return
    s.armed = true
    force(x => x + 1)
    draw()
  }

  const switchMode = (m: Mode) => {
    cancelAnimationFrame(rafRef.current)
    stateRef.current = makeState(m)
    setMode(m)
    setRunning(false)
    force(x => x + 1)
    draw()
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    stateRef.current = makeState(stateRef.current.mode)
    setRunning(false)
    triggerReset()
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Packet loss: TCP stall vs QUIC streams</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: Packet loss: TCP stall vs QUIC streams. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => (running ? setRunning(false) : run())}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <button
          onClick={dropPacket}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors"
        >
          <Scissors size={12} /> Drop a packet
        </button>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 text-xs">
          <button
            onClick={() => switchMode('tcp')}
            className={`px-2.5 py-1 rounded-md transition-colors ${mode === 'tcp' ? 'bg-bg-hover text-text-secondary' : 'text-text-muted hover:text-text-secondary'}`}
          >
            TCP
          </button>
          <button
            onClick={() => switchMode('quic')}
            className={`px-2.5 py-1 rounded-md transition-colors ${mode === 'quic' ? 'bg-bg-hover text-text-secondary' : 'text-text-muted hover:text-text-secondary'}`}
          >
            QUIC
          </button>
        </div>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          {mode === 'tcp'
            ? <>one loss <strong style={{ color: RED }}>stalls all streams</strong></>
            : <>one loss <strong style={{ color: GREEN }}>stalls only its own</strong></>}
        </WidgetStatus>
      </div>
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
