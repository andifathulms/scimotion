'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Timer } from 'lucide-react'
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

// Virtual-millisecond costs.
const COST = { static: 220, dynamic: 650, slow: 3800 }
const PROXY_STATIC = 90 // a lightweight proxy serves a static file fast
const SPAWN_MS = 520
const SPEED = 3

type Kind = 'static' | 'dynamic' | 'slow'

type Job = {
  id: number
  kind: Kind
  cost: number
  remaining: number
  wait: number
}

const kindColor = (k: Kind) => (k === 'static' ? GREEN : k === 'dynamic' ? BLUE : RED)

type Sim = {
  clock: number
  spawn: number
  nextId: number

  // Naive: one shared queue, one worker doing everything.
  naiveQueue: Job[]
  naiveWorker: Job | null
  naiveDone: number
  naiveTailWait: number

  // Reverse proxy: static served on a fast proxy lane; dynamic sent to app pool.
  proxyQueue: Job[]
  proxyWorker: Job | null
  appQueue: Job[]
  appWorker: Job | null
  proxyDone: number
  proxyTailWait: number
}

function makeSim(): Sim {
  return {
    clock: 0,
    spawn: 240,
    nextId: 0,
    naiveQueue: [],
    naiveWorker: null,
    naiveDone: 0,
    naiveTailWait: 0,
    proxyQueue: [],
    proxyWorker: null,
    appQueue: [],
    appWorker: null,
    proxyDone: 0,
    proxyTailWait: 0,
  }
}

function newJob(sim: Sim, kind: Kind): Job {
  return { id: sim.nextId++, kind, cost: COST[kind], remaining: COST[kind], wait: 0 }
}

function inject(sim: Sim, kind: Kind) {
  // Same logical request enters both worlds.
  sim.naiveQueue.push(newJob(sim, kind))
  if (kind === 'static') sim.proxyQueue.push(newJob(sim, kind))
  else sim.appQueue.push(newJob(sim, kind))
}

function tailWait(queue: Job[]): number {
  let m = 0
  for (const j of queue) if (j.wait > m) m = j.wait
  return m
}

function tick(sim: Sim, dt: number) {
  sim.clock += dt

  sim.spawn -= dt
  if (sim.spawn <= 0) {
    sim.spawn = SPAWN_MS
    inject(sim, Math.random() < 0.7 ? 'static' : 'dynamic')
  }

  // Accumulate waiting time for everything still queued.
  for (const j of sim.naiveQueue) j.wait += dt
  for (const j of sim.proxyQueue) j.wait += dt
  for (const j of sim.appQueue) j.wait += dt

  // ---- naive: single worker, single queue ----
  if (!sim.naiveWorker && sim.naiveQueue.length > 0) sim.naiveWorker = sim.naiveQueue.shift() ?? null
  if (sim.naiveWorker) {
    sim.naiveWorker.remaining -= dt
    if (sim.naiveWorker.remaining <= 0) {
      sim.naiveDone++
      sim.naiveWorker = sim.naiveQueue.shift() ?? null
    }
  }
  sim.naiveTailWait = Math.round(tailWait(sim.naiveQueue))

  // ---- reverse proxy: fast static lane + app pool ----
  if (!sim.proxyWorker && sim.proxyQueue.length > 0) sim.proxyWorker = sim.proxyQueue.shift() ?? null
  if (sim.proxyWorker) {
    // The proxy serves the static file itself, quickly.
    sim.proxyWorker.remaining -= dt * (COST.static / PROXY_STATIC)
    if (sim.proxyWorker.remaining <= 0) {
      sim.proxyDone++
      sim.proxyWorker = sim.proxyQueue.shift() ?? null
    }
  }
  if (!sim.appWorker && sim.appQueue.length > 0) sim.appWorker = sim.appQueue.shift() ?? null
  if (sim.appWorker) {
    sim.appWorker.remaining -= dt
    if (sim.appWorker.remaining <= 0) {
      sim.proxyDone++
      sim.appWorker = sim.appQueue.shift() ?? null
    }
  }
  // The reverse-proxy tail wait is what a *static* request experiences.
  sim.proxyTailWait = Math.round(tailWait(sim.proxyQueue))
}

export function ReverseProxyAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const simRef = useRef<Sim>(makeSim())
  const [running, setRunning] = useState(false)
  const [, setFrame] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sim = simRef.current
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    // Divider.
    ctx.strokeStyle = 'rgba(245,240,232,0.14)'
    ctx.setLineDash([5, 5])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(W / 2, 30)
    ctx.lineTo(W / 2, H - 14)
    ctx.stroke()
    ctx.setLineDash([])

    // Titles.
    ctx.textAlign = 'center'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = RED
    ctx.fillText('NAIVE — one server does everything', 150, 22)
    ctx.fillStyle = VIOLET
    ctx.fillText('REVERSE PROXY — split the work', 450, 22)
    ctx.font = '9px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText('static + dynamic share one queue', 150, 38)
    ctx.fillText('fast static lane, separate app pool', 450, 38)

    // ---- NAIVE panel ----
    drawQueue(ctx, sim.naiveQueue, 232, 300, 12)
    drawWorker(ctx, 236, 278, 'server', GOLD, sim.naiveWorker)
    // arrivals feed marker
    ctx.textAlign = 'left'
    ctx.font = '8px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText('arrivals →', 20, 270)

    // ---- REVERSE PROXY panel ----
    // Static fast lane (top).
    drawQueue(ctx, sim.proxyQueue, 470, 150, 8)
    drawWorker(ctx, 474, 128, 'proxy', VIOLET, sim.proxyWorker)
    ctx.textAlign = 'left'
    ctx.font = '8px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText('static →', 320, 120)
    // App pool lane (bottom).
    drawQueue(ctx, sim.appQueue, 470, 300, 12)
    drawWorker(ctx, 474, 278, 'app', CYAN, sim.appWorker)
    ctx.fillStyle = FAINT
    ctx.fillText('dynamic →', 320, 270)

    // ---- readouts ----
    const box = (x: number, tail: number, done: number, accent: string, label: string) => {
      ctx.textAlign = 'left'
      ctx.font = '9px monospace'
      ctx.fillStyle = MUTE
      ctx.fillText(`completed ${done}`, x, H - 30)
      ctx.fillStyle = tail > 900 ? RED : tail > 400 ? GOLD : GREEN
      ctx.fillText(`${label} tail wait ${tail}ms`, x, H - 16)
      ctx.fillStyle = accent
    }
    box(20, sim.naiveTailWait, sim.naiveDone, RED, 'queue')
    box(320, sim.proxyTailWait, sim.proxyDone, VIOLET, 'static')
  }, [])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const loop = () => {
      tick(simRef.current, 16 * SPEED)
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

  const injectSlow = () => {
    inject(simRef.current, 'slow')
    setFrame(f => f + 1)
    draw()
  }

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
        <span className="animation-label"><Play size={13} /> Interactive · Separation of Concerns</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: Separation of Concerns. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <button onClick={injectSlow}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent-red text-accent-red text-xs hover:bg-bg-hover transition-colors">
          <Timer size={12} /> Inject slow request
        </button>
        <span className="ml-auto text-xs text-text-muted">
          <span style={{ color: GREEN }}>■</span> static&nbsp;&nbsp;
          <span style={{ color: BLUE }}>■</span> dynamic&nbsp;&nbsp;
          <span style={{ color: RED }}>■</span> slow
        </span>
      </div>
    </div>
  )
}

const SQ = 16
const GAP = 3

// Draw a queue of jobs as squares stacking to the LEFT of a worker.
function drawQueue(ctx: CanvasRenderingContext2D, queue: Job[], workerLeft: number, cy: number, cap: number) {
  const y = cy - SQ / 2
  const shown = Math.min(queue.length, cap)
  for (let i = 0; i < shown; i++) {
    const j = queue[i]
    const x = workerLeft - (i + 1) * (SQ + GAP)
    const col = kindColor(j.kind)
    ctx.fillStyle = `${col}30`
    ctx.strokeStyle = col
    ctx.lineWidth = 1
    roundRect(ctx, x, y, SQ, SQ, 3)
    ctx.fill()
    ctx.stroke()
  }
  if (queue.length > cap) {
    ctx.fillStyle = MUTE
    ctx.font = '8px monospace'
    ctx.textAlign = 'right'
    ctx.fillText(`+${queue.length - cap}`, workerLeft - cap * (SQ + GAP) - 4, cy + 3)
  }
}

// Draw a worker box with a progress bar for its current job.
function drawWorker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  accent: string,
  job: Job | null
) {
  const w = 52
  const h = 44
  ctx.fillStyle = `${accent}18`
  ctx.strokeStyle = accent
  ctx.lineWidth = 1.6
  roundRect(ctx, x, y, w, h, 8)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = accent
  ctx.font = 'bold 9px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(label, x + w / 2, y + 15)

  if (job) {
    const frac = Math.max(0, Math.min(1, 1 - job.remaining / job.cost))
    const barX = x + 8
    const barY = y + 26
    const barW = w - 16
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    roundRect(ctx, barX, barY, barW, 6, 2)
    ctx.fill()
    ctx.fillStyle = kindColor(job.kind)
    roundRect(ctx, barX, barY, Math.max(2, barW * frac), 6, 2)
    ctx.fill()
  } else {
    ctx.fillStyle = FAINT
    ctx.font = '8px monospace'
    ctx.fillText('idle', x + w / 2, y + 32)
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
