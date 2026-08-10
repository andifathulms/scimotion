'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

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
const FAINT = 'rgba(245,240,232,0.12)'

// A page is several resources of differing size. `size` is the number of
// frames each needs; the first one is deliberately large so it can block.
type Resource = {
  name: string
  color: string
  size: number
}

const RESOURCES: Resource[] = [
  { name: 'hero.jpg', color: RED, size: 14 },
  { name: 'style.css', color: BLUE, size: 3 },
  { name: 'app.js', color: VIOLET, size: 4 },
  { name: 'font.woff', color: GREEN, size: 3 },
  { name: 'logo.svg', color: CYAN, size: 2 },
  { name: 'icon.png', color: GOLD, size: 2 },
]

const TOTAL = RESOURCES.reduce((s, r) => s + r.size, 0)

// HTTP/1.1 opens up to this many parallel TCP connections ("lanes").
const H1_LANES = 2
// One frame delivered every this-many ms of virtual time, per active lane.
const FRAME_MS = 150

type Mode = 'h1' | 'h2'

type State = {
  mode: Mode
  clock: number
  // frames delivered per resource
  done: number[]
  // completion time (virtual ms) per resource, -1 until finished
  finishedAt: number[]
  cooldown: number
  running: boolean
  pageDone: number // -1 until whole page finished
}

function makeState(mode: Mode): State {
  return {
    mode,
    clock: 0,
    done: RESOURCES.map(() => 0),
    finishedAt: RESOURCES.map(() => -1),
    cooldown: 0,
    running: false,
    pageDone: -1,
  }
}

// Which resource indices are actively receiving frames right now.
// HTTP/1.1: strictly serial per lane — resource i+lanes cannot start until
// an earlier one on its lane finishes (one slow item blocks its lane).
// HTTP/2: all unfinished resources make progress at once (multiplexed).
function activeIndices(s: State): number[] {
  const active: number[] = []
  if (s.mode === 'h2') {
    for (let i = 0; i < RESOURCES.length; i++) {
      if (s.done[i] < RESOURCES[i].size) active.push(i)
    }
    return active
  }
  // h1: assign resources round-robin to lanes in order; only the current
  // front resource of each lane is active.
  const laneFront: number[] = new Array(H1_LANES).fill(-1)
  for (let i = 0; i < RESOURCES.length; i++) {
    const lane = i % H1_LANES
    if (laneFront[lane] === -1 && s.done[i] < RESOURCES[i].size) {
      laneFront[lane] = i
    }
  }
  for (const idx of laneFront) if (idx !== -1) active.push(idx)
  return active
}

function step(s: State) {
  if (s.pageDone !== -1) return
  s.clock += 16
  s.cooldown -= 16
  if (s.cooldown > 0) return
  s.cooldown = FRAME_MS

  const active = activeIndices(s)
  for (const i of active) {
    if (s.done[i] < RESOURCES[i].size) {
      s.done[i]++
      if (s.done[i] === RESOURCES[i].size && s.finishedAt[i] === -1) {
        s.finishedAt[i] = s.clock
      }
    }
  }
  if (s.done.every((d, i) => d >= RESOURCES[i].size)) {
    s.pageDone = s.clock
  }
}

export function MultiplexingAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const stateRef = useRef<State>(makeState('h2'))
  const [running, setRunning] = useState(false)
  const [mode, setMode] = useState<Mode>('h2')
  const [, force] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const s = stateRef.current
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    // Title strip.
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = INK
    const label =
      s.mode === 'h1'
        ? `HTTP/1.1 — ${H1_LANES} parallel connections, one request at a time each`
        : 'HTTP/2 — every stream multiplexed over ONE connection'
    ctx.fillText(label, 20, 24)

    // Layout of the resource rows.
    const rowX = 132
    const rowW = 360
    const rowTop = 46
    const rowH = 34
    const active = new Set(activeIndices(s))

    RESOURCES.forEach((r, i) => {
      const y = rowTop + i * rowH
      // name + size
      ctx.textAlign = 'left'
      ctx.font = '10px monospace'
      ctx.fillStyle = r.color
      ctx.fillText(r.name, 20, y + 15)
      ctx.fillStyle = MUTE
      ctx.font = '8px monospace'
      ctx.fillText(`${r.size} frames`, 20, y + 26)

      // frame track
      const cellW = rowW / TOTAL
      const filled = s.done[i]
      // track background
      ctx.fillStyle = 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = FAINT
      ctx.lineWidth = 1
      roundRect(ctx, rowX, y + 3, r.size * cellW * 3, 20, 4)
      ctx.fill()
      ctx.stroke()
      // frames
      for (let f = 0; f < r.size; f++) {
        const fx = rowX + f * cellW * 3 + 2
        const on = f < filled
        ctx.fillStyle = on ? r.color : 'transparent'
        ctx.strokeStyle = on ? r.color : 'rgba(245,240,232,0.18)'
        ctx.lineWidth = 1
        roundRect(ctx, fx, y + 6, cellW * 3 - 4, 14, 2)
        if (on) ctx.fill()
        ctx.stroke()
      }

      const complete = s.done[i] >= r.size
      // status marker on the right
      const sx = rowX + r.size * cellW * 3 + 12
      if (complete) {
        ctx.fillStyle = GREEN
        ctx.font = 'bold 9px monospace'
        ctx.textAlign = 'left'
        ctx.fillText(`done ${(s.finishedAt[i] / 1000).toFixed(1)}s`, sx, y + 17)
      } else if (active.has(i)) {
        ctx.fillStyle = GOLD
        ctx.font = '9px monospace'
        ctx.textAlign = 'left'
        ctx.fillText('▶ loading', sx, y + 17)
      } else {
        ctx.fillStyle = MUTE
        ctx.font = '9px monospace'
        ctx.textAlign = 'left'
        ctx.fillText('waiting…', sx, y + 17)
      }
    })

    // Connection lanes indicator on the far left.
    ctx.textAlign = 'left'
    ctx.font = '8px monospace'
    ctx.fillStyle = MUTE
    const laneNote =
      s.mode === 'h1'
        ? `${H1_LANES} lanes → later files queue`
        : `1 lane → all interleave`
    ctx.fillText(laneNote, 20, rowTop + RESOURCES.length * rowH + 14)

    // Bottom summary bar: total page completion time.
    const by = rowTop + RESOURCES.length * rowH + 30
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = INK
    if (s.pageDone !== -1) {
      ctx.fillStyle = s.mode === 'h1' ? RED : GREEN
      ctx.font = 'bold 12px monospace'
      ctx.fillText(
        `Page complete in ${(s.pageDone / 1000).toFixed(1)}s  (${
          s.mode === 'h1' ? 'serial — slowest file gates the rest' : 'multiplexed — no file blocks another'
        })`,
        20,
        by + 14
      )
    } else if (running) {
      ctx.fillText(`elapsed ${(s.clock / 1000).toFixed(1)}s …`, 20, by + 14)
    } else {
      ctx.fillStyle = FAINT
      ctx.fillText('Press Load — then switch mode and compare the finish times.', 20, by + 14)
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

  const start = () => {
    const s = stateRef.current
    if (s.pageDone !== -1) {
      stateRef.current = makeState(s.mode)
    }
    setRunning(true)
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
        <span className="animation-label"><Play size={13} /> Interactive · Serial requests vs multiplexing</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: Serial requests vs multiplexing. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => (running ? setRunning(false) : start())}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Load page</>}
        </button>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 text-xs">
          <button
            onClick={() => switchMode('h1')}
            className={`px-2.5 py-1 rounded-md transition-colors ${mode === 'h1' ? 'bg-bg-hover text-text-secondary' : 'text-text-muted hover:text-text-secondary'}`}
          >
            HTTP/1.1
          </button>
          <button
            onClick={() => switchMode('h2')}
            className={`px-2.5 py-1 rounded-md transition-colors ${mode === 'h2' ? 'bg-bg-hover text-text-secondary' : 'text-text-muted hover:text-text-secondary'}`}
          >
            HTTP/2
          </button>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          {mode === 'h1'
            ? <>serial: <strong style={{ color: RED }}>big file blocks the queue</strong></>
            : <>multiplexed: <strong style={{ color: GREEN }}>streams interleave</strong></>}
        </span>
      </div>
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
