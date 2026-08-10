'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 320

const RED = '#F87171'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const GREEN = '#10B981'
const MUTE = 'rgba(245,240,232,0.4)'

// Pixels → kilometres → latency. The canvas width (~600 px) stands in for
// roughly 18,000 km of the globe. Light in fibre travels ~200,000 km/s, so a
// round trip costs RTT = 2·d / v. We fold in a couple of ms of edge overhead.
const KM_PER_PX = 30
const V_FIBRE_KM_PER_MS = 200 // 200,000 km/s
const EDGE_OVERHEAD_MS = 2

function rttMs(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dpx = Math.hypot(a.x - b.x, a.y - b.y)
  const km = dpx * KM_PER_PX
  return (2 * km) / V_FIBRE_KM_PER_MS
}

const ORIGIN = { x: 130, y: 120 }
// edge PoPs scattered across the "map"
const EDGES = [
  { x: 90, y: 90 },
  { x: 250, y: 70 },
  { x: 430, y: 100 },
  { x: 520, y: 200 },
  { x: 300, y: 230 },
  { x: 110, y: 235 },
]
// stationary "other users" to show the fleet effect
const OTHERS = [
  { x: 480, y: 60 },
  { x: 555, y: 150 },
  { x: 360, y: 265 },
  { x: 200, y: 275 },
  { x: 60, y: 180 },
  { x: 430, y: 240 },
]

function nearestEdge(p: { x: number; y: number }) {
  let best = EDGES[0]
  let bd = Infinity
  for (const e of EDGES) {
    const d = Math.hypot(p.x - e.x, p.y - e.y)
    if (d < bd) {
      bd = d
      best = e
    }
  }
  return best
}

export function GlobalLatencyAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [user, setUser] = useState({ x: 500, y: 250 })
  const [cdnMode, setCdnMode] = useState(true)
  const userRef = useRef(user)
  const dragRef = useRef(false)
  userRef.current = user

  const draw = useCallback(
    (u: { x: number; y: number }, cdn: boolean) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, W, H)

      // faint map backdrop
      ctx.strokeStyle = 'rgba(255,245,235,0.05)'
      ctx.lineWidth = 0.5
      for (let x = 40; x < W; x += 40) {
        ctx.beginPath()
        ctx.moveTo(x, 40)
        ctx.lineTo(x, H - 40)
        ctx.stroke()
      }
      for (let y = 40; y < H - 30; y += 40) {
        ctx.beginPath()
        ctx.moveTo(20, y)
        ctx.lineTo(W - 20, y)
        ctx.stroke()
      }

      // header
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = RED
      ctx.fillText(cdn ? 'serve each user from its NEAREST edge' : 'serve EVERY user from one origin', 20, 24)

      // faint fleet lines for the other users
      for (const o of OTHERS) {
        const target = cdn ? nearestEdge(o) : ORIGIN
        ctx.strokeStyle = cdn ? `${GREEN}44` : `${RED}44`
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.moveTo(o.x, o.y)
        ctx.lineTo(target.x, target.y)
        ctx.stroke()
      }
      ctx.setLineDash([])
      for (const o of OTHERS) {
        ctx.beginPath()
        ctx.arc(o.x, o.y, 4, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(96,165,250,0.5)'
        ctx.fill()
      }

      // edge PoPs
      for (const e of EDGES) {
        ctx.beginPath()
        ctx.arc(e.x, e.y, 6, 0, Math.PI * 2)
        ctx.fillStyle = `${GOLD}33`
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 1.4
        ctx.fill()
        ctx.stroke()
      }

      // origin
      ctx.beginPath()
      ctx.arc(ORIGIN.x, ORIGIN.y, 10, 0, Math.PI * 2)
      ctx.fillStyle = `${RED}33`
      ctx.strokeStyle = RED
      ctx.lineWidth = 1.8
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = RED
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('origin', ORIGIN.x, ORIGIN.y - 15)

      // the two candidate connections for the draggable user
      const ne = nearestEdge(u)
      const originRtt = rttMs(u, ORIGIN)
      const edgeRtt = rttMs(u, ne) + EDGE_OVERHEAD_MS

      // origin line (always drawn, dim unless origin-only mode)
      ctx.strokeStyle = cdn ? `${RED}33` : RED
      ctx.lineWidth = cdn ? 1 : 2
      ctx.setLineDash(cdn ? [4, 4] : [])
      ctx.beginPath()
      ctx.moveTo(u.x, u.y)
      ctx.lineTo(ORIGIN.x, ORIGIN.y)
      ctx.stroke()
      ctx.setLineDash([])

      // nearest-edge line (bright in cdn mode)
      ctx.strokeStyle = cdn ? GREEN : `${GREEN}33`
      ctx.lineWidth = cdn ? 2.2 : 1
      ctx.setLineDash(cdn ? [] : [4, 4])
      ctx.beginPath()
      ctx.moveTo(u.x, u.y)
      ctx.lineTo(ne.x, ne.y)
      ctx.stroke()
      ctx.setLineDash([])

      // highlight the chosen edge
      ctx.beginPath()
      ctx.arc(ne.x, ne.y, 8, 0, Math.PI * 2)
      ctx.strokeStyle = GREEN
      ctx.lineWidth = 1.6
      ctx.stroke()

      // the draggable user
      ctx.beginPath()
      ctx.arc(u.x, u.y, 12, 0, Math.PI * 2)
      ctx.fillStyle = `${BLUE}33`
      ctx.strokeStyle = BLUE
      ctx.lineWidth = 2
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = BLUE
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('you', u.x, u.y + 3)

      // readouts
      ctx.textAlign = 'left'
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = RED
      ctx.fillText(`to origin:  ${Math.round(originRtt)} ms RTT`, 20, H - 42)
      ctx.fillStyle = GREEN
      ctx.fillText(`to nearest edge:  ${Math.round(edgeRtt)} ms RTT`, 20, H - 24)
      const speedup = edgeRtt > 0 ? originRtt / edgeRtt : 1
      ctx.textAlign = 'right'
      ctx.fillStyle = GOLD
      ctx.fillText(`${speedup.toFixed(1)}× closer`, W - 20, H - 24)

      ctx.textAlign = 'left'
      ctx.font = '9px monospace'
      ctx.fillStyle = MUTE
      ctx.fillText('drag "you" anywhere on the map', 20, H - 8)
    },
    []
  )

  useEffect(() => {
    draw(user, cdnMode)
  }, [user, cdnMode, draw])

  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height),
    }
  }

  const pick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toCanvas(e)
    if (!p) return
    if (Math.hypot(p.x - userRef.current.x, p.y - userRef.current.y) < 26) {
      dragRef.current = true
      canvasRef.current?.setPointerCapture(e.pointerId)
    }
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return
    const p = toCanvas(e)
    if (!p) return
    const x = Math.max(24, Math.min(W - 24, p.x))
    const y = Math.max(44, Math.min(H - 52, p.y))
    setUser({ x, y })
  }

  const release = () => {
    dragRef.current = false
  }

  const { ref } = useAnimationTrigger({
    onTrigger: () => {
      setUser({ x: 500, y: 250 })
      setCdnMode(true)
    },
  })

  const reset = () => {
    setUser({ x: 500, y: 250 })
    setCdnMode(true)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Distance is latency — one origin vs. edges everywhere
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: Distance is latency — one origin vs. edges everywhere. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg touch-none cursor-grab"
          style={{ background: 'var(--color-canvas)' }}
          onPointerDown={pick}
          onPointerMove={move}
          onPointerUp={release}
          onPointerLeave={release}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setCdnMode(m => !m)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {cdnMode ? 'Show: origin only' : 'Show: nearest edge'}
        </button>
        {/* The user marker was drag-only, so the whole point of the widget —
            move the user, watch which edge serves them — was unreachable from a
            keyboard. These write the same `user` the drag writes. */}
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>User west–east:</span>
          <input
            type="range" min={20} max={W - 20} step={5} value={user.x}
            onChange={e => setUser(u => ({ ...u, x: +e.target.value }))}
            className="w-28 accent-accent-gold"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>User north–south:</span>
          <input
            type="range" min={20} max={H - 20} step={5} value={user.y}
            onChange={e => setUser(u => ({ ...u, y: +e.target.value }))}
            className="w-28 accent-accent-gold"
          />
        </label>
        <WidgetStatus className="text-xs text-text-muted">
          mode:{' '}
          <strong style={{ color: cdnMode ? GREEN : RED }}>
            {cdnMode ? 'CDN — nearest edge' : 'single origin'}
          </strong>
        </WidgetStatus>
      </div>
    </div>
  )
}
