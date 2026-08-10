'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 320

const COL = {
  accent: '#F87171', // red — the TTL=0 death and Time Exceeded reply
  gold: '#F59E0B',   // the outgoing probe
  blue: '#60A5FA',   // source
  violet: '#A78BFA', // the router that killed the probe
  green: '#10B981',  // destination reached
  cyan: '#22D3EE',   // discovered hop RTT
  mute: 'rgba(255,245,235,0.5)',
  faint: 'rgba(255,245,235,0.12)',
}

// Nodes 0..5 laid left to right: 0 is your machine, 5 is the destination.
// Hops 1..5 correspond to nodes 1..5. R3 (node 3) is a silent router: it drops
// the probe but sends no ICMP reply, so it shows up as a * in the trace.
type Hop = { label: string; ip: string; responds: boolean }
const HOPS: Hop[] = [
  { label: 'R1', ip: '192.168.1.1', responds: true },
  { label: 'R2', ip: '10.24.0.1', responds: true },
  { label: 'R3', ip: '* * *', responds: false },
  { label: 'R4', ip: '72.14.238.9', responds: true },
  { label: 'DST', ip: '93.184.216.34', responds: true },
]
const N = HOPS.length // number of hops to the destination

const NODE_X = [46, 150, 250, 350, 450, 556]
const NODE_Y = 96

const LEG_MS = 460      // virtual ms to cross one hop
const REPLY_MS = 900    // Time Exceeded flight back to source (compressed)
const SILENT_MS = 1100  // wait before giving up on a silent hop
const PAUSE_MS = 650    // pause between probes

type Phase = 'idle' | 'forward' | 'return' | 'silent' | 'pause' | 'done'

type Discovered = { ip: string; rttMs: number | null } // null === no reply (*)

type Sim = {
  ttl: number            // TTL of the probe currently in flight (1..N)
  phase: Phase
  t: number
  dur: number
  discovered: (Discovered | null)[]
  rttMs: number
  auto: boolean
}

function makeSim(): Sim {
  return { ttl: 0, phase: 'idle', t: 0, dur: 0, discovered: Array.from({ length: N }, () => null), rttMs: 0, auto: false }
}

// Launch the next probe: TTL one greater than the last, dying one hop farther.
function launch(sim: Sim) {
  if (sim.ttl >= N) return
  sim.ttl += 1
  sim.phase = 'forward'
  sim.t = 0
  sim.dur = LEG_MS * sim.ttl // travel through `ttl` legs, dying at node `ttl`
  sim.rttMs = 4 + sim.ttl * (3 + Math.random() * 6)
}

function advance(sim: Sim, dt: number) {
  if (sim.phase === 'idle' || sim.phase === 'done') return
  sim.t += dt
  if (sim.t < sim.dur) return
  const over = sim.t - sim.dur
  const hop = HOPS[sim.ttl - 1]

  if (sim.phase === 'forward') {
    if (hop.responds) {
      // Router (or destination) will report back.
      sim.phase = 'return'
      sim.t = over
      sim.dur = REPLY_MS
    } else {
      // Silent router: drops the probe, sends nothing.
      sim.phase = 'silent'
      sim.t = over
      sim.dur = SILENT_MS
    }
  } else if (sim.phase === 'return') {
    sim.discovered[sim.ttl - 1] = { ip: hop.ip, rttMs: sim.rttMs }
    finishProbe(sim, over)
  } else if (sim.phase === 'silent') {
    sim.discovered[sim.ttl - 1] = { ip: '* * *', rttMs: null }
    finishProbe(sim, over)
  } else if (sim.phase === 'pause') {
    if (sim.ttl >= N) { sim.phase = 'done'; return }
    if (sim.auto) launch(sim)
    else sim.phase = 'idle'
  }
}

function finishProbe(sim: Sim, over: number) {
  if (sim.ttl >= N) { sim.phase = 'done'; return }
  sim.phase = 'pause'
  sim.t = over
  sim.dur = PAUSE_MS
}

export function TracerouteAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number>(0)
  const simRef = useRef<Sim>(makeSim())
  const [running, setRunning] = useState(false)
  const [auto, setAuto] = useState(false)
  const [, force] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sim = simRef.current
    ctx.clearRect(0, 0, W, H)

    // Links between the chain of nodes.
    ctx.strokeStyle = COL.faint
    ctx.lineWidth = 2
    for (let i = 0; i < NODE_X.length - 1; i++) {
      ctx.beginPath()
      ctx.moveTo(NODE_X[i], NODE_Y)
      ctx.lineTo(NODE_X[i + 1], NODE_Y)
      ctx.stroke()
    }

    // The router where the current probe dies (TTL → 0).
    const dyingNode = sim.phase === 'forward' || sim.phase === 'return' || sim.phase === 'silent' ? sim.ttl : -1

    // Nodes.
    NODE_X.forEach((x, i) => {
      const isSrc = i === 0
      const isDst = i === N
      const found = i >= 1 && sim.discovered[i - 1] !== null
      let colr = COL.mute
      if (isSrc) colr = COL.blue
      else if (isDst) colr = found ? COL.green : COL.mute
      else if (found) colr = sim.discovered[i - 1]?.rttMs === null ? COL.accent : COL.cyan
      const dying = i === dyingNode && (sim.phase === 'return' || sim.phase === 'silent')
      if (dying) colr = HOPS[i - 1].responds ? COL.violet : COL.accent

      if (dying) {
        const g = ctx.createRadialGradient(x, NODE_Y, 0, x, NODE_Y, 30)
        g.addColorStop(0, `${colr}55`)
        g.addColorStop(1, `${colr}00`)
        ctx.beginPath(); ctx.arc(x, NODE_Y, 30, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      }
      const r = isSrc || isDst ? 15 : 12
      ctx.beginPath()
      ctx.arc(x, NODE_Y, r, 0, Math.PI * 2)
      ctx.fillStyle = `${colr}1F`
      ctx.fill()
      ctx.strokeStyle = colr
      ctx.lineWidth = dying ? 3 : 2
      ctx.stroke()
      ctx.fillStyle = colr
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(isSrc ? 'you' : isDst ? 'DST' : HOPS[i - 1].label, x, NODE_Y)
      ctx.textBaseline = 'alphabetic'
      ctx.font = '8px monospace'
      ctx.fillStyle = COL.mute
      if (isSrc) ctx.fillText('source', x, NODE_Y - 22)
      else ctx.fillText(`hop ${i}`, x, NODE_Y - 22)
    })

    // The moving probe / reply.
    if (sim.phase === 'forward') {
      const p = sim.t / sim.dur // 0..1 across `ttl` legs
      const along = p * sim.ttl  // 0..ttl in node units
      const seg = Math.min(Math.floor(along), sim.ttl - 1)
      const f = along - seg
      const x = NODE_X[seg] + (NODE_X[seg + 1] - NODE_X[seg]) * f
      const ttlNow = sim.ttl - seg // decremented at each router passed
      const g = ctx.createRadialGradient(x, NODE_Y, 0, x, NODE_Y, 15)
      g.addColorStop(0, `${COL.gold}99`)
      g.addColorStop(1, `${COL.gold}00`)
      ctx.beginPath(); ctx.arc(x, NODE_Y, 15, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      ctx.beginPath(); ctx.arc(x, NODE_Y, 9, 0, Math.PI * 2); ctx.fillStyle = COL.gold; ctx.fill()
      ctx.fillStyle = '#0F0D0A'
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(ttlNow), x, NODE_Y)
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = COL.gold
      ctx.font = 'bold 9px monospace'
      ctx.fillText(`TTL=${ttlNow}`, x, NODE_Y - 18)
    }

    if (sim.phase === 'return') {
      // ICMP Time Exceeded travelling back from the dying node to the source.
      const p = sim.t / sim.dur
      const along = sim.ttl * (1 - p)
      const seg = Math.min(Math.floor(along), sim.ttl - 1)
      const f = along - seg
      const x = NODE_X[seg] + (NODE_X[seg + 1] - NODE_X[seg]) * f
      const isDst = sim.ttl === N
      const colr = isDst ? COL.green : COL.accent
      ctx.beginPath(); ctx.arc(x, NODE_Y + 22, 6, 0, Math.PI * 2); ctx.fillStyle = colr; ctx.fill()
      ctx.fillStyle = colr
      ctx.font = 'bold 8px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(isDst ? 'reached!' : 'Time Exceeded', x, NODE_Y + 40)
    }

    // Status caption.
    ctx.textAlign = 'center'
    ctx.font = '10px monospace'
    let note = 'Press “Send probe (TTL+1)” to launch the first probe with TTL=1'
    let noteCol = COL.mute
    if (sim.phase === 'forward') {
      note = `Probe sent with TTL=${sim.ttl} — each router decrements it by 1`
      noteCol = COL.gold
    } else if (sim.phase === 'return') {
      note = sim.ttl === N
        ? 'TTL reached the destination — it replies, path complete'
        : `TTL hit 0 at hop ${sim.ttl} — router discards it and sends ICMP Time Exceeded`
      noteCol = sim.ttl === N ? COL.green : COL.accent
    } else if (sim.phase === 'silent') {
      note = `Hop ${sim.ttl} dropped the probe but sent no reply — it shows as *`
      noteCol = COL.accent
    } else if (sim.phase === 'done') {
      note = 'Path fully reconstructed — no packet was ever asked to report its route'
      noteCol = COL.green
    }
    ctx.fillStyle = noteCol
    ctx.fillText(note, 300, 158)

    // Discovered-hops table.
    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    ctx.fillStyle = COL.mute
    ctx.fillText('traceroute to 93.184.216.34, 5 hops max', 40, 190)
    sim.discovered.forEach((d, i) => {
      const y = 208 + i * 18
      if (d === null) {
        const pending = i + 1 === sim.ttl && sim.phase !== 'idle' && sim.phase !== 'done'
        ctx.fillStyle = pending ? 'rgba(255,245,235,0.45)' : COL.faint
        ctx.fillText(`${i + 1}   ${pending ? 'probing…' : '·'}`, 40, y)
      } else if (d.rttMs === null) {
        ctx.fillStyle = COL.accent
        ctx.fillText(`${i + 1}   * * *          (no reply — rate-limited or blocked)`, 40, y)
      } else {
        ctx.fillStyle = i + 1 === N ? COL.green : 'rgba(255,245,235,0.8)'
        ctx.fillText(`${i + 1}   ${d.ip}${' '.repeat(Math.max(1, 16 - d.ip.length))}${d.rttMs.toFixed(1)} ms`, 40, y)
      }
    })
  }, [])

  useEffect(() => {
    if (!running) { draw(); return }
    lastRef.current = 0
    const loop = (ts: number) => {
      const sim = simRef.current
      if (lastRef.current === 0) lastRef.current = ts
      let dt = ts - lastRef.current
      lastRef.current = ts
      if (dt > 60) dt = 60
      advance(sim, dt)
      draw()
      // Stop the loop once idle/done and nothing is animating.
      if (sim.phase === 'done' || (sim.phase === 'idle' && !sim.auto)) {
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
      if (reduced) {
        // Fill the whole trace statically.
        const sim = simRef.current
        sim.discovered = HOPS.map(h => ({ ip: h.ip, rttMs: h.responds ? 8 : null }))
        sim.ttl = N
        sim.phase = 'done'
        draw()
      } else {
        const sim = simRef.current
        sim.auto = true
        setAuto(true)
        launch(sim)
        setRunning(true)
      }
    },
  })

  useEffect(() => { draw() }, [draw])

  const step = () => {
    const sim = simRef.current
    if (sim.phase !== 'idle' && sim.phase !== 'done') return
    if (sim.ttl >= N) return
    launch(sim)
    force(x => x + 1)
    setRunning(true)
  }

  const toggleAuto = () => {
    const sim = simRef.current
    const v = !sim.auto
    sim.auto = v
    setAuto(v)
    if (v && (sim.phase === 'idle' || sim.phase === 'done')) {
      if (sim.phase === 'done') {
        // restart from scratch
        simRef.current = makeSim()
        simRef.current.auto = true
      }
      launch(simRef.current)
      setRunning(true)
    }
    force(x => x + 1)
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    simRef.current = makeSim()
    setRunning(false)
    setAuto(false)
    triggerReset()
    draw()
  }

  const sim = simRef.current
  const canStep = (sim.phase === 'idle' || sim.phase === 'done') && sim.ttl < N && !sim.auto

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Traceroute — dying packets confess</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={step}
          disabled={!canStep}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
          style={{ background: COL.gold, color: '#0F0D0A' }}
        >
          <ChevronRight size={12} /> Send probe (TTL+1)
        </button>
        <button
          onClick={toggleAuto}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs transition-colors"
          style={auto
            ? { background: `${COL.accent}22`, color: COL.accent, borderColor: COL.accent }
            : { color: 'rgba(245,240,232,0.7)' }}
        >
          {auto ? <><Pause size={12} /> Auto: on</> : <><Play size={12} /> Auto-run all</>}
        </button>
        <span className="ml-auto text-xs text-text-muted">Each probe dies one hop farther and reveals the router that killed it</span>
      </div>
    </div>
  )
}
