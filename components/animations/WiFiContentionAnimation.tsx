'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Plus, Minus } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

const COL = {
  accent: '#F87171', // red — the shared channel / collisions
  gold: '#F59E0B',
  blue: '#60A5FA',
  violet: '#A78BFA',
  green: '#10B981', // successful delivery + ACK
  cyan: '#22D3EE',
  mute: 'rgba(255,245,235,0.5)',
  faint: 'rgba(255,245,235,0.1)',
}

// Each device gets a stable colour so you can follow it.
const DCOL = [COL.gold, COL.blue, COL.violet, COL.cyan, COL.green, '#F472B6', '#A3E635', '#FB923C']

const AP = { x: 300, y: 52 }
const DEV_Y = 210

const SLOT_MS = 110 // virtual ms per contention slot
const TX_SLOTS = 6 // slots a single frame occupies the air
const CW_MIN = 4
const CW_MAX = 64
const MIN_DEV = 2
const MAX_DEV = 8

type Dev = {
  id: number
  x: number
  color: string
  state: 'backoff' | 'tx'
  backoff: number
  cw: number
  txLeft: number
  flash: number // collision highlight (frames)
  ack: number // ACK highlight (frames)
  airtime: number // slots spent in *successful* transmission
}

type Cell = { type: 'idle' | 'ok' | 'col'; color: string }

type Sim = {
  devs: Dev[]
  history: Cell[]
  totalSlots: number
  successes: number
  collisions: number
  acc: number
  note: string
}

const HISTORY = 72

function randBackoff(cw: number) {
  return Math.floor(Math.random() * (cw + 1))
}

function deviceX(i: number, n: number) {
  if (n === 1) return 300
  return 70 + (i * 460) / (n - 1)
}

function makeDevs(n: number): Dev[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    x: deviceX(i, n),
    color: DCOL[i % DCOL.length],
    state: 'backoff' as const,
    backoff: randBackoff(CW_MIN),
    cw: CW_MIN,
    txLeft: 0,
    flash: 0,
    ack: 0,
    airtime: 0,
  }))
}

function makeSim(n: number): Sim {
  return {
    devs: makeDevs(n),
    history: [],
    totalSlots: 0,
    successes: 0,
    collisions: 0,
    acc: 0,
    note: 'each device listens, waits a random backoff, then transmits',
  }
}

function pushCell(sim: Sim, cell: Cell) {
  sim.history.push(cell)
  if (sim.history.length > HISTORY) sim.history.shift()
}

// Advance the simulation by exactly one contention slot.
function stepSlot(sim: Sim) {
  const active = sim.devs.filter(d => d.state === 'tx')

  if (active.length > 0) {
    // Channel is busy: every backoff device freezes; the air carries this frame.
    active.forEach(d => (d.txLeft -= 1))
    const collided = active.length > 1
    pushCell(sim, collided ? { type: 'col', color: COL.accent } : { type: 'ok', color: active[0].color })
    if (active[0].txLeft <= 0) {
      if (collided) {
        // Nobody could tell mid-transmission; the missing ACK reveals the clash.
        active.forEach(d => {
          d.cw = Math.min(d.cw * 2, CW_MAX)
          d.backoff = randBackoff(d.cw)
          d.state = 'backoff'
          d.flash = 22
        })
        sim.collisions += 1
        sim.note = `${active.length} devices transmitted at once — collision, both double their backoff and retry`
      } else {
        const d = active[0]
        d.airtime += TX_SLOTS
        d.cw = CW_MIN
        d.backoff = randBackoff(d.cw)
        d.state = 'backoff'
        d.ack = 24
        sim.successes += 1
        sim.note = 'frame delivered — the access point returns an ACK to confirm'
      }
    }
    sim.totalSlots += 1
    return
  }

  // Channel is idle: backoff counters tick down; those hitting zero transmit.
  const ready: Dev[] = []
  sim.devs.forEach(d => {
    if (d.state !== 'backoff') return
    if (d.backoff > 0) d.backoff -= 1
    if (d.backoff === 0) ready.push(d)
  })
  ready.forEach(d => {
    d.state = 'tx'
    d.txLeft = TX_SLOTS
  })
  pushCell(sim, { type: 'idle', color: COL.faint })
  sim.totalSlots += 1
}

export function WiFiContentionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const simRef = useRef<Sim>(makeSim(3))
  const [running, setRunning] = useState(false)
  const [count, setCount] = useState(3)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sim = simRef.current
    ctx.clearRect(0, 0, W, H)

    const active = sim.devs.filter(d => d.state === 'tx')
    const colliding = active.length > 1

    // Links from the access point to each device.
    sim.devs.forEach(d => {
      const txing = d.state === 'tx'
      ctx.beginPath()
      ctx.moveTo(AP.x, AP.y)
      ctx.lineTo(d.x, DEV_Y)
      if (txing && colliding) {
        ctx.strokeStyle = COL.accent
        ctx.lineWidth = 2.5
      } else if (txing) {
        ctx.strokeStyle = d.color
        ctx.lineWidth = 2.5
      } else if (d.ack > 0) {
        ctx.strokeStyle = 'rgba(16,185,129,0.6)'
        ctx.lineWidth = 1.5
      } else {
        ctx.strokeStyle = COL.faint
        ctx.lineWidth = 1
      }
      ctx.stroke()
    })

    // Access point.
    ctx.beginPath()
    ctx.arc(AP.x, AP.y, 18, 0, Math.PI * 2)
    ctx.fillStyle = colliding ? 'rgba(248,113,113,0.25)' : 'rgba(96,165,250,0.15)'
    ctx.fill()
    ctx.strokeStyle = colliding ? COL.accent : COL.blue
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = colliding ? COL.accent : COL.blue
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(colliding ? '⚡' : 'AP', AP.x, AP.y)

    // One shared medium — label it.
    ctx.fillStyle = COL.mute
    ctx.font = '9px monospace'
    ctx.fillText('one shared channel', AP.x, AP.y + 30)

    // Devices.
    sim.devs.forEach(d => {
      const r = 17
      let ring = COL.mute
      let lw = 1.25
      if (d.state === 'tx' && colliding) {
        ring = COL.accent
        lw = 2.5
      } else if (d.state === 'tx') {
        ring = d.color
        lw = 2.5
      } else if (d.flash > 0) {
        ring = COL.accent
        lw = 2
      } else if (d.ack > 0) {
        ring = COL.green
        lw = 2
      }
      ctx.beginPath()
      ctx.arc(d.x, DEV_Y, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(26,23,18,0.9)'
      ctx.fill()
      ctx.strokeStyle = ring
      ctx.lineWidth = lw
      ctx.stroke()

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      if (d.state === 'tx') {
        ctx.fillStyle = colliding ? COL.accent : d.color
        ctx.font = 'bold 9px monospace'
        ctx.fillText('TX', d.x, DEV_Y)
      } else {
        ctx.fillStyle = d.color
        ctx.font = 'bold 11px monospace'
        ctx.fillText(String(d.backoff), d.x, DEV_Y - 1)
        ctx.fillStyle = COL.mute
        ctx.font = '7px monospace'
        ctx.fillText('backoff', d.x, DEV_Y + 9)
      }

      // ACK badge.
      if (d.ack > 0) {
        ctx.fillStyle = COL.green
        ctx.font = 'bold 8px monospace'
        ctx.fillText('ACK ✓', d.x, DEV_Y - r - 6)
      }

      // Per-device throughput bar (share of airtime this device has won).
      const barY = DEV_Y + r + 8
      const barW = 40
      const frac = sim.totalSlots > 0 ? d.airtime / sim.totalSlots : 0
      ctx.fillStyle = COL.faint
      ctx.fillRect(d.x - barW / 2, barY, barW, 6)
      ctx.fillStyle = d.color
      ctx.fillRect(d.x - barW / 2, barY, barW * Math.min(1, frac), 6)
      ctx.fillStyle = COL.mute
      ctx.font = '8px monospace'
      ctx.fillText(`${Math.round(frac * 100)}%`, d.x, barY + 16)
    })

    // Airtime timeline: the last ~72 contention slots.
    const stripX = 30
    const stripY = 300
    const stripW = 540
    const cw = stripW / HISTORY
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = COL.mute
    ctx.font = '9px monospace'
    ctx.fillText('shared airtime (recent slots)', stripX, stripY - 6)
    for (let i = 0; i < sim.history.length; i++) {
      const cell = sim.history[i]
      const x = stripX + i * cw
      if (cell.type === 'idle') {
        ctx.fillStyle = 'rgba(255,255,255,0.04)'
      } else if (cell.type === 'col') {
        ctx.fillStyle = 'rgba(248,113,113,0.85)'
      } else {
        ctx.fillStyle = cell.color
      }
      ctx.fillRect(x, stripY, Math.max(1, cw - 0.5), 20)
    }
    ctx.strokeStyle = COL.faint
    ctx.strokeRect(stripX, stripY, stripW, 20)

    // Legend + efficiency readout.
    const usefulFrac = sim.totalSlots > 0 ? sim.devs.reduce((s, d) => s + d.airtime, 0) / sim.totalSlots : 0
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = '9px monospace'
    ctx.fillStyle = COL.mute
    ctx.fillText(
      `${sim.devs.length} devices · ${Math.round(usefulFrac * 100)}% of airtime useful · ${sim.collisions} collisions`,
      stripX,
      stripY + 34
    )

    // Status note.
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '10px monospace'
    ctx.fillStyle = colliding ? COL.accent : 'rgba(255,245,235,0.65)'
    ctx.fillText(`› ${sim.note}`, 16, 22)
  }, [])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const loop = () => {
      const sim = simRef.current
      sim.acc += 16
      while (sim.acc >= SLOT_MS) {
        sim.acc -= SLOT_MS
        stepSlot(sim)
      }
      sim.devs.forEach(d => {
        if (d.flash > 0) d.flash -= 1
        if (d.ack > 0) d.ack -= 1
      })
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

  const rebuild = (n: number) => {
    cancelAnimationFrame(rafRef.current)
    simRef.current = makeSim(n)
    setCount(n)
    draw()
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    simRef.current = makeSim(count)
    setRunning(false)
    triggerReset()
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · CSMA/CA &amp; shared airtime</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => rebuild(Math.max(MIN_DEV, count - 1))}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors disabled:opacity-40"
            disabled={count <= MIN_DEV}>
            <Minus size={12} /> Device
          </button>
          <span className="text-xs font-mono text-text-secondary tabular-nums">{count} sharing</span>
          <button onClick={() => rebuild(Math.min(MAX_DEV, count + 1))}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors disabled:opacity-40"
            disabled={count >= MAX_DEV}>
            <Plus size={12} /> Device
          </button>
        </div>
        <span className="text-xs text-text-muted">add devices and watch each one&apos;s share of the air shrink</span>
      </div>
    </div>
  )
}
