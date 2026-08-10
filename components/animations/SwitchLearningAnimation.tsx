'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw, Send } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

const COL = {
  accent: '#F87171', // red — the central device / switch
  gold: '#F59E0B',   // the frame in flight
  blue: '#60A5FA',   // the sending device
  violet: '#A78BFA',
  green: '#10B981',  // a device that accepts the frame
  cyan: '#22D3EE',
  mute: 'rgba(255,245,235,0.5)',
  faint: 'rgba(255,245,235,0.12)',
}

type Pt = { x: number; y: number }

type Device = { mac: string; x: number; y: number }

// Four machines wired into one central box. Port Pi serves device i.
const DEVICES: Device[] = [
  { mac: '3C:5A:B4:1A:2E:01', x: 110, y: 66 },  // P0 top-left
  { mac: '3C:5A:B4:7F:C2:02', x: 490, y: 66 },  // P1 top-right
  { mac: 'A0:99:9B:04:5D:03', x: 110, y: 294 }, // P2 bottom-left
  { mac: '9C:2E:A6:33:71:04', x: 490, y: 294 }, // P3 bottom-right
]
const CENTER: Pt = { x: 300, y: 180 }

const octet = (mac: string) => mac.slice(-2)

const LEG_MS = 620 // virtual ms to cross one leg

type Frame = {
  route: Pt[]
  leg: number
  t: number
  done: boolean
  color: string
  label: string
  target: number // device index this frame is heading to (-1 = the switch)
  accept: boolean // true if this device is the addressed destination
}

type Stage = 'idle' | 'ingress' | 'egress'

type Sim = {
  mode: 'hub' | 'switch'
  src: number
  dest: number
  stage: Stage
  frames: Frame[]
}

function makeSim(mode: 'hub' | 'switch'): Sim {
  return { mode, src: 0, dest: 3, stage: 'idle', frames: [] }
}

export function SwitchLearningAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const simRef = useRef<Sim>(makeSim('switch'))
  const learnedRef = useRef<Set<number>>(new Set()) // device indices the switch has learned
  const stateRef = useRef<Record<number, 'accept' | 'discard'>>({}) // last-frame outcome per device
  const noteRef = useRef<string>('Pick a source and a destination, then send a frame.')

  const [mode, setMode] = useState<'hub' | 'switch'>('switch')
  const [src, setSrc] = useState(0)
  const [dest, setDest] = useState(3)
  const [running, setRunning] = useState(false)
  const [, force] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sim = simRef.current
    ctx.clearRect(0, 0, W, H)

    // Which ports currently carry a frame (for highlighting the wires).
    const activePorts = new Set<number>()
    for (const f of sim.frames) if (!f.done && f.target >= 0) activePorts.add(f.target)
    const ingressActive = sim.stage === 'ingress'

    // Port wires from the central box out to each device.
    DEVICES.forEach((d, i) => {
      const lit = activePorts.has(i) || (ingressActive && i === sim.src)
      ctx.beginPath()
      ctx.moveTo(CENTER.x, CENTER.y)
      ctx.lineTo(d.x, d.y)
      ctx.strokeStyle = lit ? COL.gold : COL.faint
      ctx.lineWidth = lit ? 2.5 : 1.5
      ctx.stroke()
      // Port stub label near the central box.
      const px = CENTER.x + (d.x - CENTER.x) * 0.24
      const py = CENTER.y + (d.y - CENTER.y) * 0.24
      ctx.fillStyle = COL.mute
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`P${i}`, px, py)
    })

    // Central device: a switch or a hub.
    const isHub = sim.mode === 'hub'
    ctx.beginPath()
    ctx.roundRect(CENTER.x - 56, CENTER.y - 26, 112, 52, 8)
    ctx.fillStyle = 'rgba(26,23,18,0.95)'
    ctx.fill()
    ctx.strokeStyle = isHub ? COL.mute : COL.accent
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = isHub ? COL.mute : COL.accent
    ctx.font = 'bold 15px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(isHub ? 'HUB' : 'SWITCH', CENTER.x, CENTER.y - 4)
    ctx.font = '9px monospace'
    ctx.fillStyle = COL.mute
    ctx.fillText(isHub ? 'repeats to all' : 'learns + forwards', CENTER.x, CENTER.y + 12)

    // Devices.
    DEVICES.forEach((d, i) => {
      const isSrc = sim.stage !== 'idle' && i === sim.src
      const st = stateRef.current[i]
      let stroke: string = COL.mute
      let fill = 'rgba(26,23,18,0.9)'
      if (isSrc) { stroke = COL.blue; fill = 'rgba(96,165,250,0.14)' }
      else if (st === 'accept') { stroke = COL.green; fill = 'rgba(16,185,129,0.14)' }
      else if (st === 'discard') { stroke = COL.accent; fill = 'rgba(248,113,113,0.08)' }

      ctx.beginPath()
      ctx.roundRect(d.x - 62, d.y - 22, 124, 44, 7)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = stroke
      ctx.lineWidth = isSrc || st ? 2 : 1.25
      if (st === 'discard') ctx.setLineDash([4, 3])
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = stroke
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(d.mac, d.x, d.y - 4)
      ctx.font = '8px monospace'
      ctx.fillStyle = COL.mute
      const tag = isSrc ? 'sender' : st === 'accept' ? 'for me → keep' : st === 'discard' ? 'not for me → drop' : `PC ${i}`
      ctx.fillText(tag, d.x, d.y + 10)
    })

    // Frames in flight.
    for (const f of sim.frames) {
      if (f.done) continue
      const a = f.route[f.leg]
      const b = f.route[f.leg + 1]
      if (!a || !b) continue
      const x = a.x + (b.x - a.x) * f.t
      const y = a.y + (b.y - a.y) * f.t
      ctx.beginPath()
      ctx.roundRect(x - 13, y - 9, 26, 18, 4)
      ctx.fillStyle = f.color
      ctx.fill()
      ctx.fillStyle = '#0F0D0A'
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(f.label, x, y)
    }

    // Status note.
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.7)'
    ctx.fillText(`› ${noteRef.current}`, 16, 24)
  }, [])

  // Advance the simulation by dt virtual-ms. Returns true when it has finished.
  const step = useCallback((dt: number): boolean => {
    const sim = simRef.current
    let allDone = sim.frames.length > 0
    for (const f of sim.frames) {
      if (f.done) continue
      f.t += dt / LEG_MS
      while (f.t >= 1 && !f.done) {
        f.t -= 1
        f.leg += 1
        if (f.leg >= f.route.length - 1) {
          f.done = true
          if (f.target >= 0) {
            stateRef.current[f.target] = f.accept ? 'accept' : 'discard'
          }
        }
      }
      if (!f.done) allDone = false
    }

    if (!allDone) return false

    if (sim.stage === 'ingress') {
      // The frame reached the central device. Decide what leaves each port.
      const destMac = DEVICES[sim.dest].mac
      const srcMac = DEVICES[sim.src].mac
      let targets: number[]
      if (sim.mode === 'hub') {
        targets = DEVICES.map((_, i) => i).filter(i => i !== sim.src)
        noteRef.current = `HUB repeats the frame out every other port — all ${targets.length} machines receive it, though only ${destMac} wanted it.`
      } else {
        learnedRef.current.add(sim.src) // learn source MAC → source port
        if (sim.dest !== sim.src && learnedRef.current.has(sim.dest)) {
          targets = [sim.dest]
          noteRef.current = `SWITCH knows ${destMac} is on P${sim.dest} → forwards ONLY to P${sim.dest}. No other port sees it.`
        } else {
          targets = DEVICES.map((_, i) => i).filter(i => i !== sim.src)
          noteRef.current = `SWITCH learned ${srcMac} on P${sim.src}, but ${destMac} isn't in its table yet → floods this once to find it.`
        }
      }
      sim.frames = targets.map(t => ({
        route: [CENTER, DEVICES[t]],
        leg: 0,
        t: 0,
        done: false,
        color: t === sim.dest ? COL.green : COL.gold,
        label: octet(destMac),
        target: t,
        accept: t === sim.dest,
      }))
      sim.stage = 'egress'
      force(x => x + 1)
      return false
    }

    // Egress finished.
    sim.stage = 'idle'
    sim.frames = []
    force(x => x + 1)
    return true
  }, [])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const loop = () => {
      const finished = step(16)
      draw()
      if (finished) {
        setRunning(false)
        return
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  const sendFrame = useCallback((m: 'hub' | 'switch', s: number, d: number) => {
    cancelAnimationFrame(rafRef.current)
    const sim = simRef.current
    sim.mode = m
    sim.src = s
    sim.dest = d
    sim.stage = 'ingress'
    stateRef.current = {}
    sim.frames = [{
      route: [DEVICES[s], CENTER],
      leg: 0,
      t: 0,
      done: false,
      color: COL.gold,
      label: octet(DEVICES[d].mac),
      target: -1,
      accept: false,
    }]
    noteRef.current = m === 'hub'
      ? `PC ${s} sends a frame addressed to ${DEVICES[d].mac} into the hub…`
      : `PC ${s} sends a frame addressed to ${DEVICES[d].mac} into the switch…`
    force(x => x + 1)
    setRunning(true)
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) sendFrame('switch', 0, 3)
      else draw()
    },
  })

  useEffect(() => { draw() }, [draw])

  const switchMode = (m: 'hub' | 'switch') => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    setMode(m)
    simRef.current = makeSim(m)
    simRef.current.src = src
    simRef.current.dest = dest
    stateRef.current = {}
    noteRef.current = m === 'hub'
      ? 'A hub keeps no table — every frame goes out every port. Send one and watch.'
      : 'A switch starts with an empty table and learns as frames arrive. Send one and watch.'
    force(x => x + 1)
    draw()
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    simRef.current = makeSim(mode)
    learnedRef.current = new Set()
    stateRef.current = {}
    noteRef.current = 'Pick a source and a destination, then send a frame.'
    setSrc(0)
    setDest(3)
    triggerReset()
    force(x => x + 1)
    draw()
  }

  const learned = learnedRef.current

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Switch learning vs hub flooding</span>
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

      {/* Forwarding table of the central device. */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-text-muted">
          {mode === 'hub' ? 'hub table:' : 'switch MAC table:'}
        </span>
        {mode === 'hub'
          ? <span className="font-mono" style={{ color: COL.mute }}>none — a hub has no table, it just repeats every frame everywhere</span>
          : DEVICES.map((d, i) => {
            const known = learned.has(i)
            return (
              <span
                key={i}
                className="px-2 py-0.5 rounded font-mono border"
                style={{
                  borderColor: known ? COL.gold : 'rgba(255,245,235,0.12)',
                  color: known ? COL.gold : 'rgba(245,240,232,0.4)',
                  background: known ? 'rgba(245,158,11,0.08)' : 'transparent',
                }}
              >
                P{i} → {known ? d.mac : '· not learned ·'}
              </span>
            )
          })}
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(['hub', 'switch'] as const).map(m => (
            <button key={m} onClick={() => switchMode(m)}
              className={`px-4 py-1.5 uppercase font-mono tracking-wide transition-colors ${mode === m ? 'bg-accent text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}
              style={mode === m ? { background: COL.accent, color: '#0F0D0A' } : undefined}>
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span className="font-mono">from</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {DEVICES.map((_, i) => (
              <button key={i} onClick={() => setSrc(i)}
                className="px-2 py-1 font-mono text-xs transition-colors"
                style={src === i ? { background: COL.blue, color: '#0F0D0A' } : { color: 'rgba(245,240,232,0.6)' }}>
                {i}
              </button>
            ))}
          </div>
          <span className="font-mono">to</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {DEVICES.map((_, i) => (
              <button key={i} onClick={() => setDest(i)}
                className="px-2 py-1 font-mono text-xs transition-colors"
                style={dest === i ? { background: COL.green, color: '#0F0D0A' } : { color: 'rgba(245,240,232,0.6)' }}>
                {i}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => sendFrame(mode, src, dest)}
          disabled={running || src === dest}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
          style={{ background: COL.gold, color: '#0F0D0A' }}
        >
          <Send size={12} /> Send frame
        </button>
      </div>
    </div>
  )
}
