'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const COL = {
  accent: '#F87171', // red — lost / timeout
  gold: '#F59E0B',   // the Echo Request going out
  blue: '#60A5FA',   // your machine
  violet: '#A78BFA',
  green: '#10B981',  // the Echo Reply coming back / reachable host
  cyan: '#22D3EE',   // the measured RTT
  mute: 'rgba(255,245,235,0.5)',
  faint: 'rgba(255,245,235,0.12)',
}

// Signal speed in fibre is about two-thirds of c: ~200 km per millisecond.
// So a round trip over distance d takes at least 2d / v — the latency floor.
const KM_PER_MS = 200

type Link = { key: string; label: string; km: number; proc: number }
const LINKS: Link[] = [
  { key: 'lan', label: 'Same building', km: 0.1, proc: 0.4 },
  { key: 'city', label: 'Across town', km: 40, proc: 6 },
  { key: 'country', label: 'Cross-country', km: 4000, proc: 6 },
  { key: 'globe', label: 'Round the world', km: 16000, proc: 12 },
]

// Round-trip time ≈ propagation floor (2d/v) + per-hop processing + a little jitter.
function rttFor(link: Link) {
  const propagation = (2 * link.km) / KM_PER_MS
  const jitter = Math.random() * (link.proc * 0.4 + 0.6)
  return propagation + link.proc + jitter
}

// Compress virtual RTT into a watchable one-way animation: a longer RTT visibly
// takes longer to travel, driving home that distance buys latency.
function oneWayMs(rtt: number) {
  return 260 + rtt * 3.2
}

const TIMEOUT_ANIM_MS = 1000
const GAP_MS = 620

type Phase = 'request' | 'reply' | 'losswait' | 'gap'

type Sim = {
  linkIdx: number
  reachable: boolean
  phase: Phase
  t: number
  dur: number
  seq: number
  rttMs: number
  results: (number | null)[] // null === lost / timed out
}

function makeSim(linkIdx: number, reachable: boolean): Sim {
  return { linkIdx, reachable, phase: 'gap', t: 0, dur: 250, seq: 0, rttMs: 0, results: [] }
}

function startPing(sim: Sim) {
  const link = LINKS[sim.linkIdx]
  sim.seq += 1
  sim.rttMs = rttFor(link)
  sim.phase = 'request'
  sim.t = 0
  sim.dur = oneWayMs(sim.rttMs)
}

function advance(sim: Sim, dt: number) {
  sim.t += dt
  if (sim.t < sim.dur) return
  const over = sim.t - sim.dur
  if (sim.phase === 'request') {
    if (sim.reachable) {
      sim.phase = 'reply'
      sim.t = over
      sim.dur = oneWayMs(sim.rttMs)
    } else {
      sim.phase = 'losswait'
      sim.t = over
      sim.dur = TIMEOUT_ANIM_MS
    }
  } else if (sim.phase === 'reply') {
    sim.results.push(sim.rttMs)
    if (sim.results.length > 12) sim.results.shift()
    sim.phase = 'gap'
    sim.t = over
    sim.dur = GAP_MS
  } else if (sim.phase === 'losswait') {
    sim.results.push(null)
    if (sim.results.length > 12) sim.results.shift()
    sim.phase = 'gap'
    sim.t = over
    sim.dur = GAP_MS
  } else {
    startPing(sim)
  }
}

export function PingAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number>(0)
  const simRef = useRef<Sim>(makeSim(2, true))
  const [running, setRunning] = useState(false)
  const [linkIdx, setLinkIdx] = useState(2)
  const [reachable, setReachable] = useState(true)
  const [, force] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sim = simRef.current
    const link = LINKS[sim.linkIdx]
    ctx.clearRect(0, 0, W, H)

    const yWire = 96
    const xYou = 74
    const xHost = 526

    // The link.
    ctx.strokeStyle = COL.faint
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(xYou, yWire)
    ctx.lineTo(xHost, yWire)
    ctx.stroke()

    // Endpoints: your machine (blue) and the target host (green, or red if unreachable).
    const hostCol = sim.reachable ? COL.green : COL.accent
    for (const [x, colr, label, sub] of [
      [xYou, COL.blue, 'your machine', '192.168.1.10'],
      [xHost, hostCol, 'target host', sim.reachable ? 'reachable' : 'unreachable'],
    ] as const) {
      ctx.beginPath()
      ctx.arc(x, yWire, 15, 0, Math.PI * 2)
      ctx.fillStyle = `${colr}22`
      ctx.fill()
      ctx.strokeStyle = colr
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = colr
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(x === xYou ? 'you' : 'host', x, yWire)
      ctx.font = '9px monospace'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = COL.mute
      ctx.fillText(label, x, yWire - 24)
      ctx.fillText(sub, x, yWire + 32)
    }

    // The distance / propagation-floor caption.
    ctx.textAlign = 'center'
    ctx.fillStyle = COL.mute
    ctx.font = '9px monospace'
    ctx.fillText(`${link.label} · d ≈ ${link.km >= 1 ? Math.round(link.km) : link.km} km`, 300, yWire - 42)

    // The in-flight ICMP message.
    if (sim.phase === 'request' || sim.phase === 'reply' || sim.phase === 'losswait') {
      const p = Math.min(1, sim.t / sim.dur)
      const outgoing = sim.phase !== 'reply'
      // losswait: the request sits at the host, unanswered.
      const frac = sim.phase === 'losswait' ? 1 : p
      const x = outgoing ? xYou + (xHost - xYou) * frac : xHost + (xYou - xHost) * frac
      const isReq = sim.phase !== 'reply'
      const pcol = sim.phase === 'reply' ? COL.green : COL.gold
      if (sim.phase !== 'losswait') {
        const g = ctx.createRadialGradient(x, yWire, 0, x, yWire, 16)
        g.addColorStop(0, `${pcol}88`)
        g.addColorStop(1, `${pcol}00`)
        ctx.beginPath(); ctx.arc(x, yWire, 16, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
        ctx.beginPath(); ctx.arc(x, yWire, 7, 0, Math.PI * 2); ctx.fillStyle = pcol; ctx.fill()
        ctx.fillStyle = pcol
        ctx.font = 'bold 9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(isReq ? 'Echo Request' : 'Echo Reply', x, yWire - 16)
      } else {
        // Fading, unanswered request at the host.
        ctx.globalAlpha = 0.4
        ctx.beginPath(); ctx.arc(xHost, yWire, 6, 0, Math.PI * 2); ctx.fillStyle = COL.gold; ctx.fill()
        ctx.globalAlpha = 1
        ctx.fillStyle = COL.accent
        ctx.font = 'bold 9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('no reply…', xHost, yWire - 16)
      }
    }

    // Big RTT readout.
    ctx.textAlign = 'center'
    if (sim.phase === 'reply' || (sim.phase === 'gap' && sim.results.length && sim.results[sim.results.length - 1] !== null)) {
      const val = sim.phase === 'reply' ? sim.rttMs : (sim.results[sim.results.length - 1] as number)
      ctx.fillStyle = COL.cyan
      ctx.font = 'bold 26px monospace'
      ctx.fillText(`${val.toFixed(1)} ms`, 300, 168)
      ctx.fillStyle = COL.mute
      ctx.font = '9px monospace'
      ctx.fillText('round-trip time', 300, 184)
    } else if (sim.phase === 'losswait' || (sim.phase === 'gap' && sim.results.length && sim.results[sim.results.length - 1] === null)) {
      ctx.fillStyle = COL.accent
      ctx.font = 'bold 20px monospace'
      ctx.fillText('Request timed out', 300, 166)
      ctx.fillStyle = COL.mute
      ctx.font = '9px monospace'
      ctx.fillText('no Echo Reply — host unreachable', 300, 184)
    }

    // Terminal-style log of recent pings.
    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    const lastN = sim.results.slice(-4)
    const startSeq = sim.seq - sim.results.length + Math.max(0, sim.results.length - 4)
    lastN.forEach((r, i) => {
      const y = 214 + i * 15
      if (r === null) {
        ctx.fillStyle = COL.accent
        ctx.fillText(`icmp_seq=${startSeq + i}  Request timed out`, 40, y)
      } else {
        ctx.fillStyle = 'rgba(255,245,235,0.7)'
        ctx.fillText(`64 bytes  icmp_seq=${startSeq + i}  ttl=57  time=${r.toFixed(1)} ms`, 40, y)
      }
    })

    // Summary stats line.
    const got = sim.results.filter(r => r !== null) as number[]
    const sent = sim.results.length
    const loss = sent ? Math.round(((sent - got.length) / sent) * 100) : 0
    ctx.fillStyle = COL.mute
    ctx.font = '9px monospace'
    if (sent > 0) {
      if (got.length) {
        const min = Math.min(...got)
        const max = Math.max(...got)
        const avg = got.reduce((s, v) => s + v, 0) / got.length
        ctx.fillText(
          `${sent} sent, ${got.length} received, ${loss}% loss · rtt min/avg/max = ${min.toFixed(1)}/${avg.toFixed(1)}/${max.toFixed(1)} ms`,
          40, 288
        )
      } else {
        ctx.fillStyle = COL.accent
        ctx.fillText(`${sent} sent, 0 received, ${loss}% loss — measures reachability, not bandwidth`, 40, 288)
      }
    }
  }, [])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    lastRef.current = 0
    const loop = (ts: number) => {
      const sim = simRef.current
      if (lastRef.current === 0) lastRef.current = ts
      let dt = ts - lastRef.current
      lastRef.current = ts
      if (dt > 60) dt = 60 // clamp after tab-away
      advance(sim, dt)
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Show one completed measurement, statically.
        const sim = simRef.current
        sim.rttMs = rttFor(LINKS[sim.linkIdx])
        sim.results = [sim.reachable ? sim.rttMs : null]
        sim.phase = 'gap'
        sim.seq = 1
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => { draw() }, [draw])

  const applySettings = (nextLink: number, nextReach: boolean) => {
    const sim = simRef.current
    sim.linkIdx = nextLink
    sim.reachable = nextReach
    sim.results = []
    sim.seq = 0
    sim.phase = 'gap'
    sim.t = 0
    sim.dur = 200
    draw()
    force(x => x + 1)
  }

  const pickLink = (i: number) => { setLinkIdx(i); applySettings(i, reachable) }
  const toggleReach = () => { const v = !reachable; setReachable(v); applySettings(linkIdx, v) }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    simRef.current = makeSim(linkIdx, reachable)
    setRunning(false)
    triggerReset()
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Ping — echo, and time the bounce</span>
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
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="font-mono">distance:</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {LINKS.map((l, i) => (
              <button
                key={l.key}
                onClick={() => pickLink(i)}
                className="px-2.5 py-1 font-mono text-xs transition-colors"
                style={linkIdx === i
                  ? { background: COL.cyan, color: '#0F0D0A' }
                  : { color: 'rgba(245,240,232,0.6)' }}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={toggleReach}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs transition-colors"
          style={reachable
            ? { color: 'rgba(245,240,232,0.7)' }
            : { background: `${COL.accent}22`, color: COL.accent, borderColor: COL.accent }}
        >
          {reachable ? 'Host reachable' : 'Host unreachable'}
        </button>
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: COL.green, color: '#0F0D0A' }}
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <span className="ml-auto text-xs text-text-muted">Farther host → bigger RTT (latency), never bandwidth</span>
      </div>
    </div>
  )
}
