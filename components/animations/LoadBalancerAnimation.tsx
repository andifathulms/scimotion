'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Zap, HeartPulse } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

const RED = '#F87171'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const CYAN = '#22D3EE'
const MUTE = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.28)'
const DEAD = 'rgba(255,245,235,0.22)'

const NB = 4 // number of backends
const BACKEND_COLORS = [BLUE, VIOLET, CYAN, GOLD]

// Geometry: a source on the left, the balancer in the middle, backends stacked
// on the right. Requests travel source -> balancer -> chosen backend.
const SOURCE_X = 40
const SOURCE_Y = 180
const LB_X = 210
const LB_Y = 180
const LB_W = 74
const LB_H = 120
const BACKEND_X = 470
const BACKEND_TOP = 44
const BACKEND_GAP = 76
const BACKEND_W = 104
const BACKEND_H = 52

const backendY = (i: number) => BACKEND_TOP + i * BACKEND_GAP + BACKEND_H / 2

// A backend can process this much "work" per virtual millisecond.
const SERVICE_RATE = 0.02
// New requests arrive on roughly this cadence (virtual ms).
const SPAWN_MS = 620
const FLIGHT_MS = 620 // source -> balancer, and balancer -> backend
const HEALTHCHECK_MS = 900

type Algo = 'round-robin' | 'least-conn'

type Backend = {
  id: number
  alive: boolean
  // Requests currently being served, each with remaining work.
  jobs: number[]
  // Total work processed (drives the load meter's history feel).
  flash: number
}

type Phase = 'to-lb' | 'to-backend'

type Req = {
  id: number
  cost: number // total work units
  color: string
  phase: Phase
  t: number // 0..1 progress along current leg
  target: number // backend index chosen at the balancer
}

type Sim = {
  clock: number
  spawn: number
  healthcheck: number
  nextId: number
  rrPointer: number
  backends: Backend[]
  reqs: Req[]
  served: number
  dropped: number
}

function makeSim(): Sim {
  return {
    clock: 0,
    spawn: 300,
    healthcheck: HEALTHCHECK_MS,
    nextId: 0,
    rrPointer: 0,
    backends: Array.from({ length: NB }, (_, i) => ({ id: i, alive: true, jobs: [], flash: 0 })),
    reqs: [],
    served: 0,
    dropped: 0,
  }
}

// Choose a backend for a new request. Only alive backends are eligible; if a
// chosen one has died mid-flight the request is re-routed on arrival.
function chooseBackend(sim: Sim, algo: Algo): number {
  const alive = sim.backends.filter(b => b.alive)
  if (alive.length === 0) return -1
  if (algo === 'least-conn') {
    let best = alive[0]
    for (const b of alive) if (b.jobs.length < best.jobs.length) best = b
    return best.id
  }
  // round-robin over the alive set
  for (let k = 0; k < NB; k++) {
    sim.rrPointer = (sim.rrPointer + 1) % NB
    if (sim.backends[sim.rrPointer].alive) return sim.rrPointer
  }
  return alive[0].id
}

function tick(sim: Sim, dt: number, algo: Algo) {
  sim.clock += dt

  // Health checks: nothing to detect here beyond keeping the pool current, but
  // this is where a real balancer would probe and mark backends up/down.
  sim.healthcheck -= dt
  if (sim.healthcheck <= 0) sim.healthcheck = HEALTHCHECK_MS

  // Spawn new requests with varied cost (some cheap, occasionally expensive).
  sim.spawn -= dt
  if (sim.spawn <= 0) {
    sim.spawn = SPAWN_MS
    const heavy = Math.random() < 0.28
    const cost = heavy ? 2.4 + Math.random() * 1.8 : 0.5 + Math.random() * 0.9
    const target = chooseBackend(sim, algo)
    sim.reqs.push({
      id: sim.nextId++,
      cost,
      color: heavy ? RED : GREEN,
      phase: 'to-lb',
      t: 0,
      target,
    })
  }

  // Advance in-flight requests.
  const keep: Req[] = []
  for (const r of sim.reqs) {
    const legMs = FLIGHT_MS
    r.t += dt / legMs
    if (r.t < 1) {
      keep.push(r)
      continue
    }
    if (r.phase === 'to-lb') {
      // Arrived at the balancer: (re)pick a backend now, in case the earlier
      // choice died in flight.
      r.target = chooseBackend(sim, algo)
      if (r.target < 0) {
        // No healthy backend at all: the request cannot be placed.
        sim.dropped++
        continue
      }
      r.phase = 'to-backend'
      r.t = 0
      keep.push(r)
    } else {
      // Arrived at a backend. If it died in flight, re-route rather than drop.
      const b = sim.backends[r.target]
      if (b && b.alive) {
        b.jobs.push(r.cost)
        b.flash = 160
      } else {
        const alt = chooseBackend(sim, algo)
        if (alt < 0) {
          sim.dropped++
        } else {
          r.target = alt
          r.t = 0
          keep.push(r)
        }
      }
    }
  }
  sim.reqs = keep

  // Backends process their jobs.
  for (const b of sim.backends) {
    if (b.flash > 0) b.flash = Math.max(0, b.flash - dt)
    if (!b.alive) continue
    const work = SERVICE_RATE * dt
    const next: number[] = []
    for (let rem of b.jobs) {
      rem -= work
      if (rem > 0) next.push(rem)
      else sim.served++
    }
    b.jobs = next
  }
}

// A backend's load = current in-flight jobs, normalised to a soft cap for the meter.
const LOAD_CAP = 6
const loadOf = (b: Backend) => Math.min(1, b.jobs.length / LOAD_CAP)

export function LoadBalancerAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const simRef = useRef<Sim>(makeSim())
  const algoRef = useRef<Algo>('round-robin')
  const [running, setRunning] = useState(false)
  const [algo, setAlgo] = useState<Algo>('round-robin')
  const [downCount, setDownCount] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sim = simRef.current
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    // ---- title ----
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText('One stream of requests, spread across a pool of identical backends. Kill one and watch traffic reroute.', 20, 22)

    const aliveCount = sim.backends.filter(b => b.alive).length

    // ---- wires: source -> balancer, and balancer -> each backend ----
    ctx.strokeStyle = 'rgba(245,240,232,0.16)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(SOURCE_X + 14, SOURCE_Y)
    ctx.lineTo(LB_X, LB_Y)
    ctx.stroke()
    for (let i = 0; i < NB; i++) {
      const b = sim.backends[i]
      ctx.beginPath()
      ctx.moveTo(LB_X + LB_W, LB_Y)
      ctx.lineTo(BACKEND_X, backendY(i))
      ctx.strokeStyle = b.alive ? 'rgba(245,240,232,0.14)' : 'rgba(248,113,113,0.18)'
      ctx.setLineDash(b.alive ? [] : [4, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // ---- source ----
    ctx.fillStyle = `${CYAN}22`
    ctx.strokeStyle = CYAN
    ctx.lineWidth = 1.4
    roundRect(ctx, SOURCE_X - 16, SOURCE_Y - 26, 60, 52, 8)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = CYAN
    ctx.font = 'bold 9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('clients', SOURCE_X + 14, SOURCE_Y - 4)
    ctx.fillStyle = MUTE
    ctx.font = '8px monospace'
    ctx.fillText('requests', SOURCE_X + 14, SOURCE_Y + 10)

    // ---- balancer ----
    ctx.fillStyle = `${RED}22`
    ctx.strokeStyle = RED
    ctx.lineWidth = 1.8
    roundRect(ctx, LB_X, LB_Y - LB_H / 2, LB_W, LB_H, 10)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = RED
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('LOAD', LB_X + LB_W / 2, LB_Y - 6)
    ctx.fillText('BALANCER', LB_X + LB_W / 2, LB_Y + 8)
    ctx.fillStyle = MUTE
    ctx.font = '8px monospace'
    ctx.fillText(algoRef.current === 'round-robin' ? 'round-robin' : 'least-conn', LB_X + LB_W / 2, LB_Y + 24)

    // ---- backends with load meters ----
    for (let i = 0; i < NB; i++) {
      const b = sim.backends[i]
      const y = backendY(i)
      const bx = BACKEND_X
      const by = y - BACKEND_H / 2
      const col = b.alive ? BACKEND_COLORS[i] : DEAD

      if (b.flash > 0 && b.alive) {
        const g = ctx.createRadialGradient(bx + BACKEND_W / 2, y, 0, bx + BACKEND_W / 2, y, 70)
        g.addColorStop(0, `${col}33`)
        g.addColorStop(1, `${col}00`)
        ctx.fillStyle = g
        ctx.fillRect(bx - 12, by - 12, BACKEND_W + 24, BACKEND_H + 24)
      }

      ctx.fillStyle = b.alive ? `${col}18` : 'rgba(26,23,18,0.9)'
      ctx.strokeStyle = col
      ctx.lineWidth = 1.5
      roundRect(ctx, bx, by, BACKEND_W, BACKEND_H, 8)
      ctx.fill()
      ctx.stroke()

      ctx.textAlign = 'left'
      ctx.fillStyle = col
      ctx.font = 'bold 10px monospace'
      ctx.fillText(`backend ${String.fromCharCode(65 + i)}`, bx + 10, by + 16)

      if (!b.alive) {
        ctx.fillStyle = RED
        ctx.font = 'bold 9px monospace'
        ctx.textAlign = 'right'
        ctx.fillText('DOWN', bx + BACKEND_W - 10, by + 16)
        ctx.textAlign = 'left'
        ctx.fillStyle = DEAD
        ctx.font = '8px monospace'
        ctx.fillText('health check failing', bx + 10, by + 34)
      } else {
        // load meter
        const load = loadOf(b)
        const meterX = bx + 10
        const meterY = by + 26
        const meterW = BACKEND_W - 20
        ctx.fillStyle = 'rgba(255,255,255,0.06)'
        roundRect(ctx, meterX, meterY, meterW, 8, 3)
        ctx.fill()
        const fillCol = load > 0.75 ? RED : load > 0.45 ? GOLD : GREEN
        ctx.fillStyle = fillCol
        roundRect(ctx, meterX, meterY, Math.max(2, meterW * load), 8, 3)
        ctx.fill()
        ctx.fillStyle = MUTE
        ctx.font = '8px monospace'
        ctx.fillText(`${b.jobs.length} in flight`, bx + 10, by + 48)
      }
    }

    // ---- in-flight request dots ----
    for (const r of sim.reqs) {
      let x: number
      let y: number
      if (r.phase === 'to-lb') {
        x = SOURCE_X + 14 + (LB_X - (SOURCE_X + 14)) * r.t
        y = SOURCE_Y + (LB_Y - SOURCE_Y) * r.t
      } else {
        const ty = backendY(r.target)
        x = LB_X + LB_W + (BACKEND_X - (LB_X + LB_W)) * r.t
        y = LB_Y + (ty - LB_Y) * r.t
      }
      ctx.beginPath()
      ctx.arc(x, y, r.color === RED ? 5 : 4, 0, Math.PI * 2)
      ctx.fillStyle = r.color
      ctx.fill()
    }

    // ---- readout ----
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = MUTE
    ctx.fillText(`served ${sim.served}`, 20, H - 30)
    ctx.fillStyle = aliveCount > 0 ? MUTE : RED
    ctx.fillText(`healthy backends ${aliveCount}/${NB}`, 20, H - 16)
    ctx.fillStyle = FAINT
    ctx.font = '8px monospace'
    ctx.fillText('green = cheap request   red = expensive request', 200, H - 16)
    ctx.fillStyle = sim.dropped > 0 ? RED : FAINT
    ctx.textAlign = 'right'
    ctx.font = '9px monospace'
    ctx.fillText(sim.dropped > 0 ? `dropped ${sim.dropped} (no healthy backend)` : 'dropped 0', W - 20, H - 16)
  }, [])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const loop = () => {
      tick(simRef.current, 16 * 2.5, algoRef.current)
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

  const setAlgorithm = (a: Algo) => {
    algoRef.current = a
    setAlgo(a)
    draw()
  }

  const killOne = () => {
    const sim = simRef.current
    // Kill the most-loaded healthy backend, so the reroute is visible.
    const alive = sim.backends.filter(b => b.alive)
    if (alive.length <= 1) return
    let victim = alive[0]
    for (const b of alive) if (b.jobs.length > victim.jobs.length) victim = b
    victim.alive = false
    victim.jobs = []
    setDownCount(sim.backends.filter(b => !b.alive).length)
    draw()
  }

  const reviveAll = () => {
    const sim = simRef.current
    for (const b of sim.backends) b.alive = true
    setDownCount(0)
    draw()
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    simRef.current = makeSim()
    setRunning(false)
    setDownCount(0)
    triggerReset()
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Load Balancer</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: Load Balancer. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <button onClick={killOne}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors">
          <Zap size={12} /> Kill a backend
        </button>
        <button onClick={reviveAll} disabled={downCount === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors disabled:opacity-40">
          <HeartPulse size={12} /> Revive {downCount > 0 ? `(${downCount})` : ''}
        </button>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span>Algorithm:</span>
          <button onClick={() => setAlgorithm('round-robin')}
            className={`px-2 py-1 rounded border text-xs transition-colors ${algo === 'round-robin' ? 'border-accent-red text-accent-red' : 'border-border text-text-secondary hover:bg-bg-hover'}`}>
            round-robin
          </button>
          <button onClick={() => setAlgorithm('least-conn')}
            className={`px-2 py-1 rounded border text-xs transition-colors ${algo === 'least-conn' ? 'border-accent-red text-accent-red' : 'border-border text-text-secondary hover:bg-bg-hover'}`}>
            least-conn
          </button>
        </div>
      </div>
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
