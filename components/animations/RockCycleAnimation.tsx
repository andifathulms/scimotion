'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

type RockState = 'igneous' | 'sedimentary' | 'metamorphic' | 'magma' | 'sediment'

type NodeInfo = { x: number; y: number; label: string; sub: string; color: string }

const R = 37 // node radius, px

const NODES: Record<RockState, NodeInfo> = {
  igneous: { x: 300, y: 58, label: 'IGNEOUS', sub: 'granite · basalt', color: CYAN },
  metamorphic: { x: 505, y: 152, label: 'METAMORPHIC', sub: 'marble · slate', color: VIOLET },
  magma: { x: 430, y: 300, label: 'MAGMA', sub: 'molten rock', color: GOLD },
  sedimentary: { x: 172, y: 300, label: 'SEDIMENTARY', sub: 'sandstone · limestone', color: BLUE },
  sediment: { x: 92, y: 152, label: 'SEDIMENT', sub: 'sand · mud · ions', color: GREEN },
}

type Edge = { from: RockState; to: RockState; short: string; proc: string }

// The web of transformations. Every state has at least one outgoing edge, so a
// walk can wander forever — there is no dead end and no single fixed loop.
const EDGES: Edge[] = [
  { from: 'magma', to: 'igneous', short: 'cool', proc: 'cooling & crystallising' },
  { from: 'igneous', to: 'sediment', short: 'weather', proc: 'weathering & erosion' },
  { from: 'sedimentary', to: 'sediment', short: 'weather', proc: 'weathering & erosion' },
  { from: 'metamorphic', to: 'sediment', short: 'weather', proc: 'weathering & erosion' },
  { from: 'sediment', to: 'sedimentary', short: 'deposit', proc: 'deposition & compaction' },
  { from: 'igneous', to: 'metamorphic', short: 'heat+P', proc: 'heat & pressure' },
  { from: 'sedimentary', to: 'metamorphic', short: 'heat+P', proc: 'heat & pressure' },
  { from: 'igneous', to: 'magma', short: 'melt', proc: 'melting' },
  { from: 'sedimentary', to: 'magma', short: 'melt', proc: 'melting' },
  { from: 'metamorphic', to: 'magma', short: 'melt', proc: 'melting' },
]

const edgesFrom = (s: RockState): Edge[] => EDGES.filter(e => e.from === s)

const MOVE_STEP = 1 / 46 // travel progress per 16.7 ms frame
const PAUSE_FRAMES = 30 // idle beats between auto-steps

function arrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
  head: number
) {
  const a = Math.atan2(y2 - y1, x2 - x1)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - head * Math.cos(a - 0.42), y2 - head * Math.sin(a - 0.42))
  ctx.lineTo(x2 - head * Math.cos(a + 0.42), y2 - head * Math.sin(a + 0.42))
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

// Endpoints trimmed to the node rims so arrows touch the circles, not their centres.
function trim(from: NodeInfo, to: NodeInfo) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d
  const uy = dy / d
  return { sx: from.x + ux * R, sy: from.y + uy * R, ex: to.x - ux * R, ey: to.y - uy * R }
}

export function RockCycleAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const lastRef = useRef<number | null>(null)

  const currentRef = useRef<RockState>('magma')
  const phaseRef = useRef<'idle' | 'moving'>('idle')
  const tRef = useRef(0)
  const edgeRef = useRef<Edge | null>(null)
  const pauseRef = useRef(PAUSE_FRAMES)
  const pathRef = useRef<RockState[]>(['magma'])
  const runningRef = useRef(false)

  const [current, setCurrent] = useState<RockState>('magma')
  const [path, setPath] = useState<RockState[]>(['magma'])
  const [running, setRunning] = useState(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(255,245,235,0.035)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }

    const cur = currentRef.current
    const moving = phaseRef.current === 'moving'
    const active = edgeRef.current

    // ---- edges ----
    for (const e of EDGES) {
      const { sx, sy, ex, ey } = trim(NODES[e.from], NODES[e.to])
      const isActive = moving && active === e
      const isAvailable = !moving && e.from === cur
      if (isActive) {
        arrow(ctx, sx, sy, ex, ey, `${NODES[e.to].color}DD`, 2.4, 8)
      } else if (isAvailable) {
        arrow(ctx, sx, sy, ex, ey, `${NODES[e.to].color}99`, 1.6, 7)
        ctx.font = '8px monospace'
        ctx.fillStyle = `${NODES[e.to].color}CC`
        ctx.textAlign = 'center'
        ctx.fillText(e.short, (sx + ex) / 2, (sy + ey) / 2 - 3)
      } else {
        ctx.strokeStyle = 'rgba(245,240,232,0.08)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(ex, ey)
        ctx.stroke()
      }
    }

    // ---- travelling token ----
    if (moving && active) {
      const { sx, sy, ex, ey } = trim(NODES[active.from], NODES[active.to])
      const t = tRef.current
      const tx = sx + (ex - sx) * t
      const ty = sy + (ey - sy) * t
      ctx.beginPath()
      ctx.arc(tx, ty, 5, 0, Math.PI * 2)
      ctx.fillStyle = NODES[active.to].color
      ctx.fill()
      ctx.font = '9px monospace'
      ctx.fillStyle = `${NODES[active.to].color}DD`
      ctx.textAlign = 'center'
      ctx.fillText(active.proc, (sx + ex) / 2, (sy + ey) / 2 + 14)
    }

    // ---- nodes ----
    for (const key of Object.keys(NODES) as RockState[]) {
      const n = NODES[key]
      const isCur = key === cur && !moving
      if (isCur) {
        const glow = ctx.createRadialGradient(n.x, n.y, 2, n.x, n.y, R + 12)
        glow.addColorStop(0, `${n.color}44`)
        glow.addColorStop(1, `${n.color}00`)
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(n.x, n.y, R + 12, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(n.x, n.y, R, 0, Math.PI * 2)
      ctx.fillStyle = `${n.color}1E`
      ctx.fill()
      ctx.lineWidth = isCur ? 2.4 : 1.2
      ctx.strokeStyle = isCur ? n.color : `${n.color}66`
      ctx.stroke()

      ctx.textAlign = 'center'
      ctx.font = '8px monospace'
      ctx.fillStyle = isCur ? n.color : `${n.color}CC`
      ctx.fillText(n.label, n.x, n.y + 2)
      ctx.font = '7px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.fillText(n.sub, n.x, n.y + R + 11)
    }

    // ---- caption ----
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = CYAN
    ctx.fillText('the rock cycle: any rock can become any other', 12, 18)
    ctx.font = '8px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('surface processes (sun · water · gravity) + internal heat (plate tectonics)', 12, 32)
  }, [])

  const commit = useCallback((to: RockState) => {
    currentRef.current = to
    pathRef.current = [...pathRef.current, to]
    if (pathRef.current.length > 40) pathRef.current = pathRef.current.slice(-40)
    setCurrent(to)
    setPath(pathRef.current)
  }, [])

  const ensureLoop = useCallback(() => {
    if (rafRef.current) return
    const loop = (t: number) => {
      if (lastRef.current === null) lastRef.current = t
      const dt = Math.min(64, t - lastRef.current)
      lastRef.current = t
      const steps = dt / 16.7

      if (phaseRef.current === 'moving') {
        tRef.current += MOVE_STEP * steps
        if (tRef.current >= 1) {
          const e = edgeRef.current
          phaseRef.current = 'idle'
          tRef.current = 0
          edgeRef.current = null
          pauseRef.current = PAUSE_FRAMES
          if (e) commit(e.to)
        }
      } else if (runningRef.current) {
        pauseRef.current -= steps
        if (pauseRef.current <= 0) {
          const opts = edgesFrom(currentRef.current)
          const pick = opts[Math.floor(Math.random() * opts.length)]
          edgeRef.current = pick
          phaseRef.current = 'moving'
          tRef.current = 0
        }
      }

      draw()

      const busy = phaseRef.current === 'moving' || runningRef.current
      if (busy) {
        rafRef.current = requestAnimationFrame(loop)
      } else {
        rafRef.current = 0
        lastRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [draw, commit])

  const startTransition = useCallback(
    (e: Edge) => {
      if (phaseRef.current === 'moving') return
      runningRef.current = false
      setRunning(false)
      edgeRef.current = e
      phaseRef.current = 'moving'
      tRef.current = 0
      lastRef.current = null
      ensureLoop()
    },
    [ensureLoop]
  )

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        draw()
        return
      }
      runningRef.current = true
      setRunning(true)
      lastRef.current = null
      ensureLoop()
    },
  })

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const toggleRun = () => {
    const next = !runningRef.current
    runningRef.current = next
    setRunning(next)
    if (next) {
      lastRef.current = null
      pauseRef.current = 6
      ensureLoop()
    }
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    lastRef.current = null
    runningRef.current = false
    setRunning(false)
    phaseRef.current = 'idle'
    edgeRef.current = null
    tRef.current = 0
    pauseRef.current = PAUSE_FRAMES
    currentRef.current = 'magma'
    pathRef.current = ['magma']
    setCurrent('magma')
    setPath(['magma'])
    triggerReset()
    draw()
  }

  const available = edgesFrom(current)
  const pathText = path.map(s => NODES[s].label.toLowerCase()).join(' → ')

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Follow a rock through its transformations
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: '#0F0D0A' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={toggleRun}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Auto-walk
            </>
          )}
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-text-muted">
            from <strong style={{ color: NODES[current].color }}>{NODES[current].label.toLowerCase()}</strong>:
          </span>
          {available.map(e => (
            <button
              key={`${e.from}-${e.to}`}
              onClick={() => startTransition(e)}
              className="px-2.5 py-1 rounded-md text-xs transition-colors text-text-muted hover:text-text-secondary"
              style={{ boxShadow: `inset 0 0 0 1px ${NODES[e.to].color}55` }}
            >
              {e.proc} → {NODES[e.to].label.toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="animation-controls flex-wrap gap-3 text-xs text-text-muted">
        <span className="font-mono">
          path ({path.length - 1} steps): <span className="text-text-secondary">{pathText}</span>
        </span>
      </div>
    </div>
  )
}
