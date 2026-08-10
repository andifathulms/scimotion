'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Plus, Minus } from 'lucide-react'
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

// The scaling model, in arbitrary "speed units".
// A single central server has a fixed upload budget, split evenly across
// however many clients pull from it. Each client is also capped by its own link.
const SERVER_CAP = 12 // total upload the one server can push out
const DOWN_CAP = 8 // any single downloader's own link ceiling
// In a swarm every downloader is also an uploader, so the more peers show up,
// the more sources each peer can pull pieces from in parallel — until it
// saturates its own link.
const PER_CONN = 2 // useful throughput a peer gets from each source it pulls from

const N_MIN = 1
const N_MAX = 8

const serverSpeed = (n: number) => Math.min(DOWN_CAP, SERVER_CAP / n)
const swarmSpeed = (n: number) => Math.min(DOWN_CAP, n * PER_CONN)
const serverTotal = (n: number) => serverSpeed(n) * n
const swarmTotal = (n: number) => swarmSpeed(n) * n

// green (fast) -> gold -> red (slow), by fraction of the download-link ceiling.
function speedColor(v: number) {
  const f = v / DOWN_CAP
  return f > 0.7 ? GREEN : f > 0.4 ? GOLD : RED
}

// Left panel (central server) client node positions, laid out in up to two rows.
function clientPositions(n: number) {
  const leftX = 24
  const rightX = 280
  const pts: { x: number; y: number }[] = []
  const topRow = Math.min(n, 4)
  const rows = n > 4 ? 2 : 1
  for (let i = 0; i < n; i++) {
    const row = i < 4 ? 0 : 1
    const inRow = row === 0 ? topRow : n - 4
    const idx = row === 0 ? i : i - 4
    const x = leftX + ((rightX - leftX) * (idx + 0.5)) / inRow
    const y = rows === 1 ? 190 : 168 + row * 62
    pts.push({ x, y })
  }
  return pts
}

// Right panel (swarm) peer positions on a ring.
function peerPositions(n: number) {
  const cx = 448
  const cy = 168
  const r = n <= 2 ? 40 : 78
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return pts
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export function P2PvsServerAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0)
  const nRef = useRef(3)
  const [n, setN] = useState(3)
  const [running, setRunning] = useState(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const N = nRef.current
    const phase = phaseRef.current
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    const ss = serverSpeed(N)
    const ps = swarmSpeed(N)

    // ---- panel titles ----
    ctx.textAlign = 'center'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = CYAN
    ctx.fillText('ONE CENTRAL SERVER', 152, 22)
    ctx.fillStyle = RED
    ctx.fillText('A P2P SWARM', 448, 22)
    ctx.font = '8px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText('client asks, server answers', 152, 34)
    ctx.fillText('every peer downloads AND uploads', 448, 34)

    // divider
    ctx.strokeStyle = 'rgba(245,240,232,0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(300, 12)
    ctx.lineTo(300, 250)
    ctx.stroke()

    // ---------- LEFT: central server ----------
    const server = { x: 152, y: 66 }
    const clients = clientPositions(N)
    // wires + flow dots server -> each client
    for (const cpt of clients) {
      ctx.strokeStyle = 'rgba(245,240,232,0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(server.x, server.y + 14)
      ctx.lineTo(cpt.x, cpt.y - 9)
      ctx.stroke()
      // flow dots: rate proportional to per-client speed
      const dots = Math.max(1, Math.round(ss / 2))
      for (let k = 0; k < dots; k++) {
        const t = ((phase * (ss / DOWN_CAP) + k / dots) % 1 + 1) % 1
        const dx = server.x + (cpt.x - server.x) * t
        const dy = server.y + 14 + (cpt.y - 9 - server.y - 14) * t
        ctx.beginPath()
        ctx.arc(dx, dy, 2, 0, Math.PI * 2)
        ctx.fillStyle = CYAN
        ctx.fill()
      }
    }
    // server box
    roundRect(ctx, server.x - 26, server.y - 16, 52, 30, 6)
    ctx.fillStyle = `${CYAN}22`
    ctx.strokeStyle = CYAN
    ctx.lineWidth = 1.6
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = CYAN
    ctx.font = 'bold 9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('SERVER', server.x, server.y + 3)
    // client nodes, coloured by their speed
    for (const cpt of clients) {
      const col = speedColor(ss)
      ctx.beginPath()
      ctx.arc(cpt.x, cpt.y, 8, 0, Math.PI * 2)
      ctx.fillStyle = `${col}33`
      ctx.strokeStyle = col
      ctx.lineWidth = 1.5
      ctx.fill()
      ctx.stroke()
    }

    // ---------- RIGHT: swarm ----------
    const peers = peerPositions(N)
    // mesh edges between every pair + flow dots
    for (let i = 0; i < peers.length; i++) {
      for (let j = i + 1; j < peers.length; j++) {
        const a = peers[i]
        const b = peers[j]
        ctx.strokeStyle = 'rgba(248,113,113,0.16)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        const t = ((phase * (ps / DOWN_CAP) + (i + j) * 0.17) % 1 + 1) % 1
        const dx = a.x + (b.x - a.x) * t
        const dy = a.y + (b.y - a.y) * t
        ctx.beginPath()
        ctx.arc(dx, dy, 2, 0, Math.PI * 2)
        ctx.fillStyle = [RED, GOLD, BLUE, VIOLET, GREEN][(i + j) % 5]
        ctx.fill()
      }
    }
    // peer nodes, coloured by their speed
    for (const ppt of peers) {
      const col = speedColor(ps)
      ctx.beginPath()
      ctx.arc(ppt.x, ppt.y, 9, 0, Math.PI * 2)
      ctx.fillStyle = `${col}33`
      ctx.strokeStyle = col
      ctx.lineWidth = 1.6
      ctx.fill()
      ctx.stroke()
      // little up/down glyph to say "both client and server"
      ctx.strokeStyle = col
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(ppt.x - 3, ppt.y)
      ctx.lineTo(ppt.x - 3, ppt.y - 3)
      ctx.moveTo(ppt.x + 3, ppt.y)
      ctx.lineTo(ppt.x + 3, ppt.y + 3)
      ctx.stroke()
    }

    // ---------- BOTTOM: the comparison ----------
    const barX = 150
    const barW = 300
    const barMax = DOWN_CAP
    const rows = [
      { label: 'server: speed per downloader', v: ss, col: speedColor(ss), y: 288 },
      { label: 'swarm:  speed per downloader', v: ps, col: speedColor(ps), y: 316 },
    ]
    ctx.textAlign = 'left'
    for (const row of rows) {
      ctx.font = '10px monospace'
      ctx.fillStyle = MUTE
      ctx.fillText(row.label, 20, row.y + 4)
      // track
      roundRect(ctx, barX, row.y - 6, barW, 12, 4)
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      ctx.fill()
      // fill
      const fw = Math.max(3, barW * (row.v / barMax))
      roundRect(ctx, barX, row.y - 6, fw, 12, 4)
      ctx.fillStyle = row.col
      ctx.fill()
      ctx.textAlign = 'left'
      ctx.fillStyle = row.col
      ctx.font = 'bold 10px monospace'
      ctx.fillText(`${row.v.toFixed(1)}`, barX + barW + 8, row.y + 4)
      ctx.textAlign = 'left'
    }

    // totals + verdict
    ctx.font = '9px monospace'
    ctx.fillStyle = FAINT
    ctx.textAlign = 'left'
    ctx.fillText(`server total throughput  ${serverTotal(N).toFixed(0)}  (fixed — the server is the ceiling)`, 20, 352)
    ctx.fillStyle = MUTE
    ctx.fillText(`swarm total throughput   ${swarmTotal(N).toFixed(0)}  (rises with every new peer)`, 20, 366)

    ctx.textAlign = 'right'
    ctx.font = 'bold 10px monospace'
    if (ps > ss) {
      ctx.fillStyle = GREEN
      ctx.fillText(`${N} downloaders → swarm is ${(ps / ss).toFixed(1)}× faster`, W - 20, 352)
    } else if (ps < ss) {
      ctx.fillStyle = GOLD
      ctx.fillText(`${N} downloader${N > 1 ? 's' : ''} → server still ahead`, W - 20, 352)
    } else {
      ctx.fillStyle = MUTE
      ctx.fillText(`${N} downloaders → neck and neck`, W - 20, 352)
    }
  }, [])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const loop = () => {
      phaseRef.current = (phaseRef.current + 0.012) % 1
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

  const setDownloaders = (val: number) => {
    const clamped = Math.max(N_MIN, Math.min(N_MAX, val))
    nRef.current = clamped
    setN(clamped)
    draw()
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    phaseRef.current = 0
    setRunning(false)
    setDownloaders(3)
    triggerReset()
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Server vs Swarm</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <button onClick={() => setDownloaders(n - 1)} disabled={n <= N_MIN}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors disabled:opacity-40">
          <Minus size={12} /> Fewer
        </button>
        <button onClick={() => setDownloaders(n + 1)} disabled={n >= N_MAX}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors disabled:opacity-40">
          <Plus size={12} /> More downloaders
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Downloaders:</span>
          <input
            type="range" min={N_MIN} max={N_MAX} step={1} value={n}
            onChange={e => setDownloaders(+e.target.value)}
            className="w-28 accent-accent-red"
          />
          <span className="text-text-secondary font-medium">{n}</span>
        </label>
      </div>
    </div>
  )
}
