'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

type Pt = { x: number; y: number }

const SRC: Pt = { x: 44, y: 120 }
const DST: Pt = { x: 556, y: 120 }

// Four routes of differing speed, drawn as distinct lanes.
const LANE_Y = [50, 96, 144, 190]
const LANE_X0 = 110
const LANE_X1 = 490
const BASE_MS = [1500, 2100, 2700, 3400] // lane base traversal time

const COL = {
  accent: '#F87171',
  gold: '#F59E0B',
  blue: '#60A5FA',
  violet: '#A78BFA',
  cyan: '#22D3EE',
  green: '#10B981',
  mute: 'rgba(255,245,235,0.5)',
  faint: 'rgba(255,245,235,0.12)',
}
const PCOL = [COL.accent, COL.gold, COL.blue, COL.violet, COL.cyan, COL.green]

type Packet = {
  seq: number
  lane: number
  pts: Pt[]
  cum: number[]   // cumulative segment length
  total: number   // total polyline length
  start: number   // ms before this packet leaves the source
  dur: number     // ms to traverse
  t: number       // ms elapsed since send
  arrived: boolean
}

type Sim = {
  packets: Packet[]
  n: number
  spread: number
  clock: number
  arrivalOrder: number[]
  received: boolean[]
  deliveredUpto: number // contiguous in-order prefix delivered to the app
  cycleTimer: number
  done: boolean
}

function lanePath(lane: number): { pts: Pt[]; cum: number[]; total: number } {
  const y = LANE_Y[lane]
  const pts: Pt[] = [SRC, { x: LANE_X0, y }, { x: LANE_X1, y }, DST]
  const cum = [0]
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    cum.push(total)
  }
  return { pts, cum, total }
}

function posOnPath(p: Packet, frac: number): Pt {
  const d = frac * p.total
  let i = 1
  while (i < p.cum.length && p.cum[i] < d) i++
  if (i >= p.cum.length) return p.pts[p.pts.length - 1]
  const segLen = p.cum[i] - p.cum[i - 1]
  const local = segLen === 0 ? 0 : (d - p.cum[i - 1]) / segLen
  const a = p.pts[i - 1]
  const b = p.pts[i]
  return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local }
}

function makeSim(n: number, spread: number): Sim {
  const packets: Packet[] = []
  for (let seq = 0; seq < n; seq++) {
    const lane = Math.floor(Math.random() * LANE_Y.length)
    const { pts, cum, total } = lanePath(lane)
    // Duration = lane base * (1 + random jitter scaled by the spread control).
    const jitter = (Math.random() * 2 - 1) * spread
    const dur = Math.max(700, BASE_MS[lane] * (1 + jitter))
    packets.push({
      seq,
      lane,
      pts,
      cum,
      total,
      start: seq * 70, // leave the source in order, 1,2,3,...
      dur,
      t: 0,
      arrived: false,
    })
  }
  return {
    packets,
    n,
    spread,
    clock: 0,
    arrivalOrder: [],
    received: Array.from({ length: n }, () => false),
    deliveredUpto: 0,
    cycleTimer: 0,
    done: false,
  }
}

function tick(sim: Sim, dt: number) {
  sim.clock += dt
  for (const p of sim.packets) {
    if (p.arrived) continue
    p.t += dt
    const eff = p.t - p.start
    if (eff >= p.dur) {
      p.arrived = true
      sim.arrivalOrder.push(p.seq)
      sim.received[p.seq] = true
      while (sim.deliveredUpto < sim.n && sim.received[sim.deliveredUpto]) sim.deliveredUpto += 1
    }
  }
  if (!sim.done && sim.packets.every(p => p.arrived)) {
    sim.done = true
    sim.cycleTimer = 0
  }
  if (sim.done) {
    sim.cycleTimer += dt
    if (sim.cycleTimer > 1800) {
      const fresh = makeSim(sim.n, sim.spread)
      Object.assign(sim, fresh)
    }
  }
}

export function PacketReassemblyAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [n, setN] = useState(6)
  const [spread, setSpread] = useState(0.5)
  const simRef = useRef<Sim>(makeSim(6, 0.5))
  const [running, setRunning] = useState(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sim = simRef.current
    ctx.clearRect(0, 0, W, H)

    // Lanes.
    LANE_Y.forEach((y, i) => {
      ctx.beginPath()
      ctx.moveTo(SRC.x, SRC.y)
      ctx.lineTo(LANE_X0, y)
      ctx.lineTo(LANE_X1, y)
      ctx.lineTo(DST.x, DST.y)
      ctx.strokeStyle = COL.faint
      ctx.lineWidth = 1.25
      ctx.stroke()
      ctx.fillStyle = COL.mute
      ctx.font = '8px monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(`path ${i + 1}`, LANE_X0 + 6, y - 8)
    })

    // Endpoints.
    ;[{ p: SRC, l: 'S' }, { p: DST, l: 'D' }].forEach(({ p, l }) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(96,165,250,0.18)'
      ctx.fill()
      ctx.strokeStyle = COL.blue
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = COL.blue
      ctx.font = 'bold 12px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(l, p.x, p.y)
    })

    // In-flight packets.
    for (const p of sim.packets) {
      if (p.arrived) continue
      const eff = p.t - p.start
      if (eff < 0) continue
      const frac = Math.max(0, Math.min(1, eff / p.dur))
      const pos = posOnPath(p, frac)
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, 9, 0, Math.PI * 2)
      ctx.fillStyle = PCOL[p.seq % PCOL.length]
      ctx.fill()
      ctx.fillStyle = '#0F0D0A'
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(p.seq + 1), pos.x, pos.y)
    }

    // Arrival order (as received — jumbled).
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = COL.mute
    ctx.font = '10px monospace'
    ctx.fillText('arrival order (as the network delivers them):', 24, 244)
    sim.arrivalOrder.forEach((seq, i) => {
      const x = 24 + i * 30
      const y = 254
      ctx.fillStyle = 'rgba(248,113,113,0.16)'
      ctx.fillRect(x, y, 24, 20)
      ctx.strokeStyle = COL.accent
      ctx.lineWidth = 1
      ctx.strokeRect(x, y, 24, 20)
      ctx.fillStyle = COL.accent
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(String(seq + 1), x + 12, y + 14)
    })

    // Reassembled by sequence number.
    ctx.textAlign = 'left'
    ctx.fillStyle = COL.mute
    ctx.font = '10px monospace'
    ctx.fillText('reassembled by sequence number:', 24, 300)
    for (let i = 0; i < sim.n; i++) {
      const x = 24 + i * 30
      const y = 310
      const got = sim.received[i]
      const delivered = i < sim.deliveredUpto
      ctx.fillStyle = delivered ? 'rgba(16,185,129,0.28)' : got ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.03)'
      ctx.fillRect(x, y, 24, 20)
      ctx.strokeStyle = delivered ? COL.green : got ? COL.gold : COL.faint
      ctx.lineWidth = 1
      ctx.strokeRect(x, y, 24, 20)
      ctx.fillStyle = delivered ? COL.green : got ? COL.gold : COL.mute
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), x + 12, y + 14)
    }
    // Delivered-prefix marker.
    ctx.textAlign = 'left'
    ctx.fillStyle = COL.mute
    ctx.font = '9px monospace'
    ctx.fillText(
      sim.deliveredUpto >= sim.n
        ? 'message complete'
        : `in-order so far: ${sim.deliveredUpto}/${sim.n}  (green = delivered · gold = buffered, waiting for a gap)`,
      24 + sim.n * 30 + 8,
      324
    )
  }, [])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const loop = () => {
      tick(simRef.current, 16)
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

  const resend = (nn: number, sp: number) => {
    simRef.current = makeSim(nn, sp)
    draw()
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    simRef.current = makeSim(n, spread)
    setRunning(false)
    triggerReset()
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Out-of-Order Reassembly</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-4">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Packets:</span>
          <input type="range" min={4} max={10} step={1} value={n}
            onChange={e => { const v = +e.target.value; setN(v); resend(v, spread) }}
            className="w-20 accent-accent-gold" />
          <span className="font-mono text-text-secondary">{n}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Delay spread:</span>
          <input type="range" min={0} max={100} step={1} value={Math.round(spread * 100)}
            onChange={e => { const v = +e.target.value / 100; setSpread(v); resend(n, v) }}
            className="w-20 accent-accent-gold" />
        </div>
      </div>
    </div>
  )
}
