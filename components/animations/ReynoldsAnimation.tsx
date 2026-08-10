'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 280

const CX = 168 // cylinder centre
const CY = 140
const A = 26 // cylinder radius
const U = 2.1 // free-stream speed, px/frame

const ROWS = 30
const PER_ROW = 17
const TRAIL = 10

const GREEN = '#10B981'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'

const DEFAULT_L = 2.1 // log10(Re) ≈ 126

type Vortex = { x: number; y: number; g: number; life: number }
type Pt = { x: number; y: number }
type Particle = { x: number; y: number; row: number; trail: Pt[] }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const ramp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a))

function rowColor(row: number): string {
  if (row % 7 === 3) return GOLD
  if (row % 5 === 0) return BLUE
  return GREEN
}

function regimeOf(re: number): { name: string; color: string } {
  if (re < 5) return { name: 'creeping (Stokes) flow', color: BLUE }
  if (re < 40) return { name: 'attached vortex pair', color: GREEN }
  if (re < 200) return { name: 'von Kármán vortex street', color: GOLD }
  if (re < 3000) return { name: 'transitional wake', color: VIOLET }
  return { name: 'turbulent wake', color: PINK }
}

function formatRe(re: number): string {
  if (re < 10) return re.toFixed(1)
  if (re < 10000) return String(Math.round(re))
  const e = Math.floor(Math.log10(re))
  return `${(re / Math.pow(10, e)).toFixed(1)}e${e}`
}

// Not a Navier-Stokes solve: a potential-flow base field with hand-placed
// vortices layered on top, tuned so each regime reads the way the real one looks.
function velocity(
  x: number,
  y: number,
  vs: Vortex[],
  standing: number,
  turb: number
): Pt {
  const dx = x - CX
  const dy = y - CY
  const r2 = dx * dx + dy * dy
  let ux = U
  let uy = 0

  if (r2 > 4) {
    const a2 = A * A
    const r4 = r2 * r2
    ux = U * (1 - (a2 * (dx * dx - dy * dy)) / r4)
    uy = U * ((-2 * a2 * dx * dy) / r4)
  }

  if (standing > 0) {
    const sx = CX + A * 1.2
    const oy = A * 0.58
    const g = standing * 78
    for (const s of [1, -1]) {
      const wx = x - sx
      const wy = y - (CY - s * oy)
      const d2 = wx * wx + wy * wy + 110
      ux += (-s * g * wy) / d2
      uy += (s * g * wx) / d2
    }
  }

  for (const v of vs) {
    const wx = x - v.x
    const wy = y - v.y
    const d2 = wx * wx + wy * wy + 130
    ux += (-v.g * wy) / d2
    uy += (v.g * wx) / d2
  }

  if (turb > 0 && x > CX - A) {
    const amp = turb * 2.4 * Math.min(1, (x - CX + A) / 70)
    ux += (Math.random() - 0.5) * amp
    uy += (Math.random() - 0.5) * amp
  }

  return { x: ux, y: uy }
}

export function ReynoldsAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const partsRef = useRef<Particle[]>([])
  const vortRef = useRef<Vortex[]>([])
  const frameRef = useRef(0)
  const nextShedRef = useRef(0)
  const sideRef = useRef(1)

  const [logRe, setLogRe] = useState(DEFAULT_L)
  const [running, setRunning] = useState(false)
  const logReRef = useRef(DEFAULT_L)

  useEffect(() => {
    logReRef.current = logRe
  }, [logRe])

  const seed = useCallback(() => {
    const out: Particle[] = []
    for (let r = 0; r < ROWS; r++) {
      const y = 12 + ((H - 24) * r) / (ROWS - 1)
      for (let i = 0; i < PER_ROW; i++) {
        out.push({
          x: (W * (i + Math.random())) / PER_ROW,
          y,
          row: r,
          trail: [],
        })
      }
    }
    partsRef.current = out
    vortRef.current = []
    frameRef.current = 0
    nextShedRef.current = 0
    sideRef.current = 1
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)

    // faint grid
    ctx.strokeStyle = 'rgba(255,245,235,0.04)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }

    // tracer trails
    for (const p of partsRef.current) {
      if (p.trail.length < 2) continue
      const col = rowColor(p.row)
      for (let i = 1; i < p.trail.length; i++) {
        const alpha = (i / p.trail.length) * 0.75
        ctx.beginPath()
        ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y)
        ctx.lineTo(p.trail[i].x, p.trail[i].y)
        ctx.strokeStyle =
          col +
          Math.floor(alpha * 255)
            .toString(16)
            .padStart(2, '0')
        ctx.lineWidth = 1.3
        ctx.stroke()
      }
      const head = p.trail[p.trail.length - 1]
      ctx.beginPath()
      ctx.arc(head.x, head.y, 1.4, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
    }

    // the cylinder
    ctx.beginPath()
    ctx.arc(CX, CY, A, 0, Math.PI * 2)
    ctx.fillStyle = '#0F0D0A'
    ctx.fill()
    ctx.strokeStyle = 'rgba(245,240,232,0.55)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // no-slip reminder ring
    ctx.beginPath()
    ctx.arc(CX, CY, A + 3.5, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(245,240,232,0.14)'
    ctx.setLineDash([3, 4])
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.setLineDash([])

    const re = Math.pow(10, logReRef.current)
    const reg = regimeOf(re)

    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText(`Re = ${formatRe(re)}`, 12, 22)
    ctx.fillStyle = reg.color
    ctx.fillText(reg.name, 12, 38)

    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.font = '9px monospace'
    ctx.fillText('flow →', 12, H - 12)
    ctx.fillText('no-slip surface', CX - 36, CY + A + 18)
  }, [])

  const step = useCallback(() => {
    const l = logReRef.current

    const standing = ramp(l, 0.7, 1.6) * (1 - ramp(l, 1.6, 2.05))
    const shed = ramp(l, 1.6, 2.05)
    const turb = ramp(l, 2.6, 3.9)

    frameRef.current += 1

    // shed alternating vortices once Re passes the onset
    if (shed > 0.02 && frameRef.current >= nextShedRef.current) {
      const period = Math.max(16, 40 - 16 * shed - 8 * turb)
      nextShedRef.current = frameRef.current + period
      const s = sideRef.current
      sideRef.current = -s
      vortRef.current.push({
        x: CX + A * 1.25,
        y: CY - s * A * 0.62,
        g: s * 105 * shed,
        life: 0,
      })
    }

    // advect and decay the vortices
    const alive: Vortex[] = []
    for (const v of vortRef.current) {
      v.x += U * 0.82
      v.y += (v.g > 0 ? -1 : 1) * 0.12 + (Math.random() - 0.5) * turb * 1.2
      v.life += 1
      v.g *= 1 - 0.004 - 0.012 * turb
      if (v.x < W + 60 && Math.abs(v.g) > 4) alive.push(v)
    }
    vortRef.current = alive

    for (const p of partsRef.current) {
      const u = velocity(p.x, p.y, alive, standing, turb)
      p.x += u.x
      p.y += u.y

      // keep tracers out of the solid body
      const dx = p.x - CX
      const dy = p.y - CY
      const d = Math.hypot(dx, dy)
      if (d < A + 1.5) {
        const k = (A + 1.5) / (d || 1)
        p.x = CX + dx * k
        p.y = CY + dy * k
      }

      if (p.x > W + 4 || p.y < -4 || p.y > H + 4) {
        p.x = -4
        p.y = 12 + ((H - 24) * p.row) / (ROWS - 1)
        p.trail.length = 0
      }

      p.trail.push({ x: p.x, y: p.y })
      if (p.trail.length > TRAIL) p.trail.shift()
    }
  }, [])

  const settle = useCallback(
    (n: number) => {
      for (let i = 0; i < n; i++) step()
    },
    [step]
  )

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        settle(90)
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    seed()
    settle(40)
    draw()
  }, [seed, settle, draw])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      step()
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  useEffect(() => {
    if (!running) draw()
  }, [logRe, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    setLogRe(DEFAULT_L)
    logReRef.current = DEFAULT_L
    seed()
    settle(40)
    draw()
  }

  const re = Math.pow(10, logRe)
  const reg = regimeOf(re)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Flow past a cylinder
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas
          role="img"
          aria-label="Animated diagram: Flow past a cylinder. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Play
            </>
          )}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Re:</span>
          <input
            type="range"
            min={-1}
            max={5}
            step={0.01}
            value={logRe}
            onChange={e => setLogRe(+e.target.value)}
            className="w-48 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">{formatRe(re)}</span>
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          regime: <strong style={{ color: reg.color }}>{reg.name}</strong>
        </WidgetStatus>
      </div>
    </div>
  )
}
