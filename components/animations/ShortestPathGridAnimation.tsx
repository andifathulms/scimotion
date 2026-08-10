'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 260
const COLS = 15
const ROWS = 9
const ACCENT = '#60A5FA' // blue
const GOLD = '#F59E0B'

// Grid layout: 0 = open, 1 = wall. Start fixed left, goal fixed right.
const WALLS: number[][] = [
  [0,0,0,0,1,0,0,0,0,0,1,0,0,0,0],
  [0,1,1,0,1,0,1,1,1,0,1,0,1,1,0],
  [0,0,1,0,0,0,0,0,1,0,0,0,0,1,0],
  [1,0,1,1,1,1,1,0,1,1,1,1,0,1,0],
  [0,0,0,0,0,0,1,0,0,0,0,1,0,0,0],
  [0,1,1,1,1,0,1,1,1,1,0,1,1,1,0],
  [0,0,0,0,1,0,0,0,0,1,0,0,0,1,0],
  [1,1,1,0,1,1,1,1,0,1,1,1,0,1,0],
  [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
]

const START: [number, number] = [4, 0]   // [r, c]
const GOAL: [number, number] = [4, 14]    // [r, c]

const key = (r: number, c: number) => r * COLS + c

type BfsResult = {
  rings: Array<Array<[number, number]>> // frontier layers in order discovered
  dist: number[]                        // distance per cell index, -1 if unreached
  path: Array<[number, number]>         // shortest path start -> goal
  maxDist: number
}

function computeBfs(): BfsResult {
  const dist = new Array(ROWS * COLS).fill(-1)
  const prev = new Array<number>(ROWS * COLS).fill(-1)
  const rings: Array<Array<[number, number]>> = []

  const [sr, sc] = START
  dist[key(sr, sc)] = 0
  let frontier: Array<[number, number]> = [[sr, sc]]
  rings.push(frontier)
  let d = 0
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]]

  while (frontier.length) {
    const next: Array<[number, number]> = []
    for (const [r, c] of frontier) {
      for (const [dr, dc] of dirs) {
        const nr = r + dr
        const nc = c + dc
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue
        if (WALLS[nr][nc] === 1) continue
        const k = key(nr, nc)
        if (dist[k] !== -1) continue
        dist[k] = d + 1
        prev[k] = key(r, c)
        next.push([nr, nc])
      }
    }
    if (next.length) rings.push(next)
    frontier = next
    d++
  }

  // Reconstruct shortest path goal -> start
  const path: Array<[number, number]> = []
  const goalK = key(GOAL[0], GOAL[1])
  if (dist[goalK] !== -1) {
    let cur = goalK
    while (cur !== -1) {
      path.push([Math.floor(cur / COLS), cur % COLS])
      cur = prev[cur]
    }
    path.reverse()
  }

  const maxDist = Math.max(0, ...dist.filter(v => v !== -1))
  return { rings, dist, path, maxDist }
}

// Hex helpers to interpolate a dark cell toward the blue accent by distance.
function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
const BASE_RGB = hexToRgb('#1A1712')
const ACCENT_RGB = hexToRgb(ACCENT)

function distColor(t: number): string {
  // t in [0,1]: blend base -> accent
  const r = Math.round(BASE_RGB[0] + (ACCENT_RGB[0] - BASE_RGB[0]) * t)
  const g = Math.round(BASE_RGB[1] + (ACCENT_RGB[1] - BASE_RGB[1]) * t)
  const b = Math.round(BASE_RGB[2] + (ACCENT_RGB[2] - BASE_RGB[2]) * t)
  return `rgb(${r},${g},${b})`
}

export function ShortestPathGridAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bfs = useRef<BfsResult>(computeBfs())
  const [layer, setLayer] = useState(0) // how many rings revealed
  const [showPath, setShowPath] = useState(false)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  // Scroll trigger: autoplay the flood, or render the settled result for reduced motion.
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setLayer(bfs.current.rings.length)
        setShowPath(true)
      } else {
        setLayer(0)
        setShowPath(false)
        setRunning(true)
      }
    },
  })

  // Cell geometry, centered with a small margin.
  const margin = 8
  const cw = (W - margin * 2) / COLS
  const ch = (H - margin * 2) / ROWS
  const cell = Math.min(cw, ch)
  const gridW = cell * COLS
  const gridH = cell * ROWS
  const ox = (W - gridW) / 2
  const oy = (H - gridH) / 2

  const goalReachedRing = useCallback(() => {
    const { dist } = bfs.current
    const d = dist[key(GOAL[0], GOAL[1])]
    return d === -1 ? bfs.current.rings.length : d
  }, [])

  const draw = useCallback((revealed: number, drawPath: boolean) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const { dist, path, maxDist } = bfs.current

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = ox + c * cell
        const y = oy + r * cell
        const pad = 1
        if (WALLS[r][c] === 1) {
          ctx.fillStyle = '#0B0907'
          ctx.fillRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2)
          continue
        }
        const d = dist[key(r, c)]
        const reached = d !== -1 && d < revealed
        if (reached) {
          const t = maxDist > 0 ? 0.18 + 0.82 * (d / maxDist) : 0.5
          ctx.fillStyle = distColor(t)
        } else {
          ctx.fillStyle = '#15120D'
        }
        ctx.fillRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2)
      }
    }

    // Shortest path overlay
    if (drawPath && path.length) {
      for (const [r, c] of path) {
        const x = ox + c * cell
        const y = oy + r * cell
        ctx.fillStyle = 'rgba(245,158,11,0.85)'
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2)
      }
      // path line through centers
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.beginPath()
      path.forEach(([r, c], i) => {
        const px = ox + c * cell + cell / 2
        const py = oy + r * cell + cell / 2
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()
    }

    // Start & goal markers
    const marker = (rc: [number, number], col: string, label: string) => {
      const [r, c] = rc
      const cx = ox + c * cell + cell / 2
      const cy = oy + r * cell + cell / 2
      ctx.beginPath()
      ctx.arc(cx, cy, cell * 0.3, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
      ctx.fillStyle = '#0F0D0A'
      ctx.font = `bold ${Math.round(cell * 0.34)}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, cx, cy + 0.5)
    }
    marker(START, ACCENT, 'S')
    marker(GOAL, GOLD, 'G')

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }, [cell, ox, oy])

  useEffect(() => { draw(layer, showPath) }, [layer, showPath, draw])

  // Animate the flood: reveal one ring per tick, then the path.
  useEffect(() => {
    if (!running) { clearInterval(intervalRef.current); return }
    intervalRef.current = setInterval(() => {
      setLayer(prev => {
        const total = bfs.current.rings.length
        if (prev >= total) {
          setShowPath(true)
          setRunning(false)
          return prev
        }
        return prev + 1
      })
    }, 110)
    return () => clearInterval(intervalRef.current)
  }, [running])

  // Reveal path once the goal's ring is uncovered.
  useEffect(() => {
    if (layer > goalReachedRing()) setShowPath(true)
  }, [layer, goalReachedRing])

  const reset = () => {
    clearInterval(intervalRef.current)
    setRunning(false)
    setShowPath(false)
    setLayer(0)
    triggerReset()
  }

  const togglePlay = () => {
    const total = bfs.current.rings.length
    if (layer >= total) { // already done -> restart
      setShowPath(false)
      setLayer(0)
      setRunning(true)
      return
    }
    setRunning(r => !r)
  }

  const goalDist = bfs.current.dist[key(GOAL[0], GOAL[1])]

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · BFS shortest path</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary">
        <span className="mr-2" style={{ color: ACCENT }}>Frontier {Math.min(layer, bfs.current.rings.length)}/{bfs.current.rings.length}</span>
        {showPath && goalDist >= 0
          ? <>Shortest path found — <span style={{ color: GOLD }}>{goalDist} steps</span></>
          : 'Flooding outward — every ring is one step farther from the start'}
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button onClick={togglePlay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-bg-base text-xs font-medium transition-colors"
          style={{ background: ACCENT }}>
          {running ? <Pause size={12} /> : <Play size={12} />} {running ? 'Pause' : 'Play'}
        </button>
        <div className="ml-auto flex items-center gap-4 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: ACCENT }} /> distance
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: GOLD }} /> shortest path
          </span>
        </div>
      </div>
    </div>
  )
}
