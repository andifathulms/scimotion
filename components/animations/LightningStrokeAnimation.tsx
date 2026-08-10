'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

const CYAN = '#22D3EE' // accent
const GOLD = '#F59E0B'
const LEADER = '#7DA9C9' // dim bluish leader
const STREAMER = '#A78BFA' // upward streamer
const STROKE = '#FFF6D8' // brilliant return stroke
const MUTE = 'rgba(245,240,232,0.5)'

// Deterministic PRNG — fixed seed, no Math.random / Date.now anywhere.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hex = (c: string, a: number) =>
  `${c}${Math.max(0, Math.min(255, Math.round(a * 255)))
    .toString(16)
    .padStart(2, '0')}`

const CLOUD_Y = 70
const GROUND_Y = 300
const START_X = 300
const SEED = 0x5eed

type Node = { x: number; y: number }

// Phase model.
type Phase = { key: string; label: string; dir: string; color: string; note: string }
const PHASES: Phase[] = [
  {
    key: 'idle',
    label: '0 · Charged, ready',
    dir: '—',
    color: MUTE,
    note: 'The cloud base is strongly negative; the field across the air has reached breakdown. Nothing visible yet.',
  },
  {
    key: 'leader',
    label: '1 · Stepped leader',
    dir: 'DOWNWARD ↓',
    color: LEADER,
    note: 'A dim, branching channel of charge pushes DOWN from the cloud in ~50 m steps, feeling out a path to the ground.',
  },
  {
    key: 'streamer',
    label: '2 · Upward streamer',
    dir: 'UPWARD ↑',
    color: STREAMER,
    note: 'As the leader nears the ground, a streamer reaches UP from a tall point to meet it and complete the channel.',
  },
  {
    key: 'return',
    label: '3 · Return stroke',
    dir: 'UPWARD ↑ (the flash!)',
    color: STROKE,
    note: 'The bright RETURN STROKE surges UP the connected channel at ~1/3 light speed, heating it to ~30,000 K. This is the flash you see.',
  },
]

// Phase durations in frames (60fps-ish steps).
const DUR = [30, 60, 26, 46]

export function LightningStrokeAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const lastRef = useRef<number | null>(null)

  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState(0)
  const phaseRef = useRef(0)
  const progRef = useRef(0)

  // Build a deterministic zig-zag main channel from cloud to ground, plus branches.
  const { main, branches, connectY } = useMemo(() => {
    const r = mulberry32(SEED)
    const nodes: Node[] = []
    const steps = 16
    let x = START_X
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const y = CLOUD_Y + t * (GROUND_Y - CLOUD_Y)
      x += (r() - 0.5) * 46
      x = Math.max(120, Math.min(W - 120, x))
      nodes.push({ x, y })
    }
    // ensure it lands near a tower
    nodes[nodes.length - 1] = { x: 200, y: GROUND_Y }
    // branches split off some interior nodes and dangle a short forked path
    const br: Node[][] = []
    for (let i = 3; i < steps - 3; i += 3) {
      const base = nodes[i]
      const seg: Node[] = [base]
      let bx = base.x
      let by = base.y
      const sideR = r()
      for (let k = 0; k < 3; k++) {
        bx += (sideR - 0.5) * 60 + (r() - 0.5) * 30
        by += 16 + r() * 12
        seg.push({ x: bx, y: by })
      }
      br.push(seg)
    }
    // streamer connects near the ground: connect point a bit above ground
    const connectY = GROUND_Y - 46
    return { main: nodes, branches: br, connectY }
  }, [])

  // Fraction of the main channel [0..1] revealed as the leader descends.
  const drawPolyline = (
    ctx: CanvasRenderingContext2D,
    pts: Node[],
    frac: number,
    color: string,
    width: number,
    alpha: number
  ) => {
    if (pts.length < 2 || frac <= 0) return
    const total = pts.length - 1
    const upto = frac * total
    ctx.strokeStyle = hex(color, alpha)
    ctx.lineWidth = width
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) {
      if (i <= upto) {
        ctx.lineTo(pts[i].x, pts[i].y)
      } else {
        const frac2 = upto - (i - 1)
        if (frac2 > 0) {
          const px = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * frac2
          const py = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * frac2
          ctx.lineTo(px, py)
        }
        break
      }
    }
    ctx.stroke()
  }

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const ph = phaseRef.current
    const pr = progRef.current

    // background
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    // ---- cloud base ----
    const cg = ctx.createLinearGradient(0, 0, 0, CLOUD_Y + 20)
    cg.addColorStop(0, 'rgba(90,100,120,0.28)')
    cg.addColorStop(1, 'rgba(90,100,120,0.06)')
    ctx.fillStyle = cg
    ctx.fillRect(0, 0, W, CLOUD_Y + 12)
    ctx.fillStyle = 'rgba(96,165,250,0.8)'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'left'
    for (let i = 0; i < 9; i++) ctx.fillText('−', 70 + i * 55, CLOUD_Y + 4)
    ctx.fillStyle = MUTE
    ctx.font = '9px monospace'
    ctx.fillText('cloud base (negative)', 12, 18)

    // ---- ground + a tall tower target ----
    ctx.strokeStyle = 'rgba(245,240,232,0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, GROUND_Y)
    ctx.lineTo(W, GROUND_Y)
    ctx.stroke()
    ctx.fillStyle = 'rgba(80,70,55,0.5)'
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)
    // tower at x=200
    ctx.fillStyle = 'rgba(180,170,150,0.55)'
    ctx.fillRect(192, GROUND_Y - 40, 16, 40)
    ctx.beginPath()
    ctx.moveTo(200, GROUND_Y - 54)
    ctx.lineTo(192, GROUND_Y - 40)
    ctx.lineTo(208, GROUND_Y - 40)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = hex(GOLD, 0.85)
    ctx.font = 'bold 12px monospace'
    for (let i = 0; i < 8; i++) ctx.fillText('+', 90 + i * 52, GROUND_Y + 14)
    ctx.fillStyle = MUTE
    ctx.font = '9px monospace'
    ctx.fillText('ground (induced positive)', 12, H - 8)

    // ---- Phase 1: stepped leader descends (dim, branching) ----
    // leaderFrac: how far down the leader has reached.
    let leaderFrac = 0
    if (ph === 1) leaderFrac = pr
    else if (ph >= 2) leaderFrac = 1

    if (leaderFrac > 0) {
      // main dim channel
      drawPolyline(ctx, main, leaderFrac, LEADER, 1.6, 0.75)
      // branches appear once the leader passes their origin
      const total = main.length - 1
      const reached = leaderFrac * total
      branches.forEach((seg, bi) => {
        const originIdx = 3 + bi * 3
        if (reached > originIdx) {
          const bf = Math.min(1, (reached - originIdx) / 3)
          drawPolyline(ctx, seg, bf, LEADER, 1, 0.5)
        }
      })
      // glowing leader tip
      if (ph === 1) {
        const idx = Math.min(main.length - 1, Math.floor(leaderFrac * total))
        const tip = main[idx]
        ctx.fillStyle = hex(LEADER, 0.9)
        ctx.beginPath()
        ctx.arc(tip.x, tip.y, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // ---- Phase 2: upward streamer from the tower ----
    let streamerFrac = 0
    if (ph === 2) streamerFrac = pr
    else if (ph >= 3) streamerFrac = 1
    if (streamerFrac > 0) {
      const topX = 200
      const topY = GROUND_Y - 54
      const tgtX = main[main.length - 1].x
      const tgtY = connectY
      const sx = topX + (tgtX - topX) * streamerFrac
      const sy = topY + (tgtY - topY) * streamerFrac
      ctx.strokeStyle = hex(STREAMER, 0.85)
      ctx.lineWidth = 1.8
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(topX, topY)
      ctx.lineTo(sx, sy)
      ctx.stroke()
      ctx.fillStyle = hex(STREAMER, 0.9)
      ctx.beginPath()
      ctx.arc(sx, sy, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // ---- Phase 3: brilliant return stroke surging UP ----
    if (ph === 3) {
      // The luminous front sweeps from the ground upward.
      const upFrac = pr // 0 at ground → 1 at cloud
      const total = main.length - 1
      // Reverse-reveal: bright from bottom up to (1-upFrac) of the channel index.
      // Build the fully lit channel but modulate alpha so the bright front is near the base early.
      const litFromBottom = upFrac // fraction of channel (measured from ground) that is lit
      // draw whole channel dim-hot then bright segment
      drawPolyline(ctx, main, 1, STROKE, 5.5, 0.25)
      // bright part: segments whose normalized position from ground <= litFromBottom
      ctx.strokeStyle = hex(STROKE, 0.98)
      ctx.lineWidth = 5.5
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()
      let started = false
      for (let i = main.length - 1; i >= 0; i--) {
        const posFromGround = (total - i) / total
        if (posFromGround <= litFromBottom) {
          if (!started) {
            ctx.moveTo(main[i].x, main[i].y)
            started = true
          } else {
            ctx.lineTo(main[i].x, main[i].y)
          }
        }
      }
      ctx.stroke()
      // outer glow
      ctx.strokeStyle = hex(CYAN, 0.35)
      ctx.lineWidth = 11
      ctx.stroke()
      // include branches fully lit
      branches.forEach(seg => drawPolyline(ctx, seg, 1, STROKE, 2.5, 0.7 * upFrac))

      // rising bright front marker + upward arrow
      const frontIdx = Math.max(0, Math.round((1 - litFromBottom) * total))
      const fp = main[Math.min(main.length - 1, frontIdx)]
      ctx.fillStyle = hex(STROKE, 1)
      ctx.beginPath()
      ctx.arc(fp.x, fp.y, 6, 0, Math.PI * 2)
      ctx.fill()
      // whole-scene flash tint
      ctx.fillStyle = hex(STROKE, 0.10 * upFrac)
      ctx.fillRect(0, 0, W, H)

      ctx.fillStyle = hex(STROKE, 0.95)
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('▲ UP', fp.x + 40, fp.y)
    }

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }, [main, branches, connectY])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // One static final frame: the return stroke fully up.
        phaseRef.current = 3
        progRef.current = 1
        setPhase(3)
        render()
      } else {
        phaseRef.current = 1
        progRef.current = 0
        setPhase(1)
        setRunning(true)
      }
    },
  })

  // devicePixelRatio-aware backing store.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.height = `${H}px`
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    render()
  }, [render])

  useEffect(() => {
    if (!running) {
      lastRef.current = null
      cancelAnimationFrame(rafRef.current)
      return
    }
    const loop = (t: number) => {
      if (lastRef.current === null) lastRef.current = t
      const dt = Math.min(64, t - lastRef.current)
      lastRef.current = t
      const steps = dt / 16.7
      let ph = phaseRef.current
      let pr = progRef.current
      pr += steps / DUR[ph]
      if (pr >= 1) {
        if (ph < 3) {
          ph += 1
          pr = 0
        } else {
          pr = 1
          phaseRef.current = ph
          progRef.current = 1
          setPhase(ph)
          render()
          setRunning(false)
          return
        }
      }
      phaseRef.current = ph
      progRef.current = pr
      setPhase(ph)
      render()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, render])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const stepPhase = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    lastRef.current = null
    let ph = phaseRef.current
    // If mid-phase, snap to end of current phase; else advance to next.
    if (progRef.current < 1 && ph > 0) {
      progRef.current = 1
    } else {
      ph = Math.min(3, ph + 1)
      phaseRef.current = ph
      progRef.current = 1
    }
    setPhase(phaseRef.current)
    render()
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    lastRef.current = null
    phaseRef.current = 0
    progRef.current = 0
    setPhase(0)
    render()
  }

  const p = PHASES[phase]

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-canvas">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span style={{ color: p.color === MUTE ? undefined : p.color }} className={p.color === MUTE ? 'text-text-muted' : ''}>
          {p.label}
        </span>
        <span style={{ color: CYAN }}>direction: {p.dir}</span>
        <span className="text-text-muted w-full">{p.note}</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (phaseRef.current === 0 || (phaseRef.current === 3 && progRef.current >= 1)) {
              // restart from leader
              phaseRef.current = 1
              progRef.current = 0
              setPhase(1)
            }
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={stepPhase}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          Step ›
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <span className="ml-auto text-xs text-text-muted">
          leader down · streamer up · return stroke up = the flash
        </span>
      </div>
    </div>
  )
}
