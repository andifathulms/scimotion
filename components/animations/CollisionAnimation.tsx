'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'
import { EquationReadout } from '@/components/EquationReadout'

const W = 600
const H = 340

const TRACK_Y = 132
const TRACK_L = 24
const TRACK_R = W - 24

// bottom conservation panel
const PANEL_TOP = 196
const P_ROW_Y = 236 // momentum bar centre line
const KE_ROW_Y = 300 // kinetic-energy bar baseline
const BAR_L = 150
const BAR_R = W - 24
const BAR_MID = (BAR_L + BAR_R) / 2

const GREEN = '#10B981' // field accent — momentum
const GOLD = '#F59E0B' // kinetic energy
const BLUE = '#60A5FA'
const ORANGE = '#FB923C'
const MUTED = 'rgba(245,240,232,0.5)'

// scaling limits for the bars
const P_MAX = 42 // kg·m/s that fills half the momentum bar
const KE_MAX = 108 // J that fills the KE bar

// display: how many pixels a cart moves per (m/s) per second
const PX_PER_MV = 34

const DEFAULT_M1 = 2
const DEFAULT_M2 = 1
const DEFAULT_V1 = 3
const DEFAULT_V2 = -2

const X1_START = 150
const X2_START = 452

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const cartHalf = (m: number) => 12 + m * 5 // half-width in px, grows with mass

type Inputs = { m1: number; m2: number; v1: number; v2: number; elastic: boolean }

// Post-collision velocities. Elastic: 1-D elastic formulae. Perfectly inelastic:
// both move together at the centre-of-mass velocity.
function resolve(i: Inputs): { u1: number; u2: number } {
  const { m1, m2, v1, v2, elastic } = i
  if (!elastic) {
    const u = (m1 * v1 + m2 * v2) / (m1 + m2)
    return { u1: u, u2: u }
  }
  const u1 = ((m1 - m2) * v1 + 2 * m2 * v2) / (m1 + m2)
  const u2 = ((m2 - m1) * v2 + 2 * m1 * v1) / (m1 + m2)
  return { u1, u2 }
}

const momentum = (m1: number, v1: number, m2: number, v2: number) =>
  m1 * v1 + m2 * v2
const kinetic = (m1: number, v1: number, m2: number, v2: number) =>
  0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2

// Four knobs — the most of any widget on the site, and 8,181 reachable
// combinations. Reproducing a particular collision by hand is exactly the case
// addressable state exists for. `elastic` is a toggle rather than a slider and
// stays outside the spec, which only models numeric ranges.
const SPEC = {
  m1: { default: DEFAULT_M1, min: 0.5, max: 4, step: 0.5, symbol: 'm₁' },
  v1: { default: DEFAULT_V1, min: -5, max: 5, step: 0.5, symbol: 'v₁' },
  m2: { default: DEFAULT_M2, min: 0.5, max: 4, step: 0.5, symbol: 'm₂' },
  v2: { default: DEFAULT_V2, min: -5, max: 5, step: 0.5, symbol: 'v₂' },
}

export function CollisionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)

  const { params, set, reset: resetParams, permalink, isDefault, restored } = useWidgetParams('collision', SPEC)
  const { m1, m2, v1, v2 } = params
  const [elastic, setElastic] = useState(true)
  const [running, setRunning] = useState(false)
  const [collided, setCollided] = useState(false)

  const inputsRef = useRef<Inputs>({
    m1: DEFAULT_M1,
    m2: DEFAULT_M2,
    v1: DEFAULT_V1,
    v2: DEFAULT_V2,
    elastic: true,
  })
  useEffect(() => {
    inputsRef.current = { m1, m2, v1, v2, elastic }
  }, [m1, m2, v1, v2, elastic])

  // live simulation state
  const stateRef = useRef({
    x1: X1_START,
    x2: X2_START,
    cv1: DEFAULT_V1,
    cv2: DEFAULT_V2,
    hit: false,
  })
  const collidedRef = useRef(false)

  const seed = useCallback((i: Inputs) => {
    stateRef.current = {
      x1: X1_START,
      x2: X2_START,
      cv1: i.v1,
      cv2: i.v2,
      hit: false,
    }
    collidedRef.current = false
  }, [])

  const step = useCallback((dt: number) => {
    const i = inputsRef.current
    const s = stateRef.current
    s.x1 += s.cv1 * PX_PER_MV * dt
    s.x2 += s.cv2 * PX_PER_MV * dt

    const h1 = cartHalf(i.m1)
    const h2 = cartHalf(i.m2)

    // collision: right edge of cart 1 meets left edge of cart 2 while closing
    if (!s.hit && s.x1 + h1 >= s.x2 - h2 && s.cv1 - s.cv2 > 0) {
      const { u1, u2 } = resolve(i)
      // place exactly touching to avoid overlap, then adopt new velocities
      const mid = (s.x1 + h1 + (s.x2 - h2)) / 2
      s.x1 = mid - h1
      s.x2 = mid + h2
      s.cv1 = u1
      s.cv2 = u2
      s.hit = true
      collidedRef.current = true
      setCollided(true)
    }

    // loop: once resolved and a cart leaves the track, re-seed
    const off =
      s.x1 - h1 < TRACK_L - 30 ||
      s.x2 + h2 > TRACK_R + 30 ||
      s.x1 + h1 > TRACK_R + 30 ||
      s.x2 - h2 < TRACK_L - 30
    if (s.hit && off) {
      seed(inputsRef.current)
      setCollided(false)
    }
  }, [seed])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const i = inputsRef.current
    const s = stateRef.current

    ctx.clearRect(0, 0, W, H)
    ctx.font = '11px monospace'
    ctx.textBaseline = 'alphabetic'

    // ---- track ----
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(TRACK_L, TRACK_Y + 26)
    ctx.lineTo(TRACK_R, TRACK_Y + 26)
    ctx.stroke()
    // tick marks
    ctx.strokeStyle = 'rgba(255,245,235,0.07)'
    ctx.lineWidth = 1
    for (let x = TRACK_L; x <= TRACK_R; x += 40) {
      ctx.beginPath()
      ctx.moveTo(x, TRACK_Y + 26)
      ctx.lineTo(x, TRACK_Y + 32)
      ctx.stroke()
    }

    const drawCart = (
      x: number,
      m: number,
      v: number,
      col: string,
      label: string
    ) => {
      const hw = cartHalf(m)
      const hh = 14 + m * 3
      ctx.fillStyle = col
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.roundRect(x - hw, TRACK_Y + 24 - 2 * hh, 2 * hw, 2 * hh, 4)
      ctx.fill()
      ctx.globalAlpha = 1
      // mass label
      ctx.fillStyle = '#0F0D0A'
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`${m}kg`, x, TRACK_Y + 24 - hh + 4)
      ctx.font = '10px monospace'
      ctx.fillStyle = MUTED
      ctx.fillText(label, x, TRACK_Y + 24 - 2 * hh - 16)
      // velocity arrow
      if (Math.abs(v) > 0.05) {
        const dir = Math.sign(v)
        const len = clamp(Math.abs(v) * 7, 8, 46)
        const ay = TRACK_Y + 24 - 2 * hh - 6
        ctx.strokeStyle = col
        ctx.fillStyle = col
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x, ay)
        ctx.lineTo(x + dir * len, ay)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x + dir * len, ay)
        ctx.lineTo(x + dir * len - dir * 6, ay - 4)
        ctx.lineTo(x + dir * len - dir * 6, ay + 4)
        ctx.closePath()
        ctx.fill()
      }
      ctx.textAlign = 'left'
    }

    drawCart(s.x1, i.m1, s.cv1, BLUE, 'cart A')
    drawCart(s.x2, i.m2, s.cv2, ORANGE, 'cart B')

    // ---- conservation panel ----
    ctx.strokeStyle = 'rgba(255,245,235,0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(TRACK_L, PANEL_TOP - 6)
    ctx.lineTo(TRACK_R, PANEL_TOP - 6)
    ctx.stroke()

    const before = {
      p: momentum(i.m1, i.v1, i.m2, i.v2),
      ke: kinetic(i.m1, i.v1, i.m2, i.v2),
    }
    const { u1, u2 } = resolve(i)
    const after = {
      p: momentum(i.m1, u1, i.m2, u2),
      ke: kinetic(i.m1, u1, i.m2, u2),
    }
    const isAfter = collidedRef.current
    const keLost = before.ke - after.ke

    ctx.font = '11px monospace'
    ctx.fillStyle = MUTED
    ctx.textAlign = 'left'

    // --- total momentum: signed bar from centre ---
    ctx.fillStyle = 'rgba(245,240,232,0.7)'
    ctx.fillText('total momentum  p = Σmv  (VECTOR)', TRACK_L, P_ROW_Y - 22)
    // zero axis
    ctx.strokeStyle = 'rgba(255,245,235,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(BAR_MID, P_ROW_Y - 12)
    ctx.lineTo(BAR_MID, P_ROW_Y + 12)
    ctx.stroke()

    const drawPBar = (val: number, y: number, alpha: number, lab: string) => {
      const halfSpan = BAR_R - BAR_MID
      const wpx = clamp(val / P_MAX, -1, 1) * halfSpan
      ctx.fillStyle = GREEN
      ctx.globalAlpha = alpha
      const bx = wpx >= 0 ? BAR_MID : BAR_MID + wpx
      ctx.fillRect(bx, y - 7, Math.abs(wpx), 14)
      ctx.globalAlpha = 1
      ctx.fillStyle = MUTED
      ctx.font = '10px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(lab, TRACK_L, y + 4)
    }
    // before (faint) and after (bright) share the SAME length — the whole point
    drawPBar(before.p, P_ROW_Y - 4, isAfter ? 0.28 : 0.95, 'before')
    drawPBar(after.p, P_ROW_Y + 12, isAfter ? 0.95 : 0.28, 'after')
    ctx.fillStyle = GREEN
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'right'
    ctx.fillText(`${(isAfter ? after.p : before.p).toFixed(1)} kg·m/s`, BAR_R, P_ROW_Y - 22)

    // --- total kinetic energy: bar from left ---
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.7)'
    ctx.font = '11px monospace'
    ctx.fillText('total kinetic energy  ½mv²  (SCALAR)', TRACK_L, KE_ROW_Y - 22)

    const drawKEBar = (val: number, y: number, alpha: number, lab: string) => {
      const span = BAR_R - BAR_L
      const wpx = clamp(val / KE_MAX, 0, 1) * span
      ctx.fillStyle = GOLD
      ctx.globalAlpha = alpha
      ctx.fillRect(BAR_L, y - 7, wpx, 14)
      ctx.globalAlpha = 1
      ctx.fillStyle = MUTED
      ctx.font = '10px monospace'
      ctx.fillText(lab, TRACK_L, y + 4)
    }
    drawKEBar(before.ke, KE_ROW_Y - 4, isAfter ? 0.28 : 0.95, 'before')
    drawKEBar(after.ke, KE_ROW_Y + 12, isAfter ? 0.95 : 0.28, 'after')
    ctx.fillStyle = GOLD
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'right'
    ctx.fillText(`${(isAfter ? after.ke : before.ke).toFixed(1)} J`, BAR_R, KE_ROW_Y - 22)
    ctx.textAlign = 'left'

    // verdict banner
    ctx.font = 'bold 11px monospace'
    if (i.elastic) {
      ctx.fillStyle = GREEN
      ctx.fillText('ELASTIC — both conserved', BAR_L + 4, KE_ROW_Y + 30)
    } else {
      ctx.fillStyle = ORANGE
      ctx.fillText(
        `INELASTIC — p conserved, KE −${keLost.toFixed(1)} J → heat/deformation`,
        BAR_L + 4,
        KE_ROW_Y + 30
      )
    }
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // static final frame: show the resolved (after) state
        const i = inputsRef.current
        const { u1, u2 } = resolve(i)
        stateRef.current = {
          x1: 260 - cartHalf(i.m1),
          x2: 260 + cartHalf(i.m2),
          cv1: u1,
          cv2: u2,
          hit: true,
        }
        collidedRef.current = true
        setCollided(true)
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = W * dpr
      canvas.height = H * dpr
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    seed(inputsRef.current)
    draw()
  }, [seed, draw])

  useEffect(() => {
    if (!running) return
    let last = 0
    const tick = (t: number) => {
      if (last === 0) last = t
      const dt = clamp((t - last) / 1000, 0, 0.05)
      last = t
      step(dt)
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  // redraw when inputs change while paused
  useEffect(() => {
    if (!running) {
      seed(inputsRef.current)
      setCollided(false)
      draw()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m1, m2, v1, v2, elastic])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    resetParams()
    setElastic(true)
    inputsRef.current = {
      m1: DEFAULT_M1,
      m2: DEFAULT_M2,
      v1: DEFAULT_V1,
      v2: DEFAULT_V2,
      elastic: true,
    }
    seed(inputsRef.current)
    setCollided(false)
    draw()
  }

  const pNow = momentum(m1, v1, m2, v2)

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Two carts collide
        </span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button
            onClick={reset}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
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

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          mode:{' '}
          <strong style={{ color: elastic ? GREEN : ORANGE }}>
            {elastic ? 'elastic' : 'inelastic'}
          </strong>
        </span>
        <span>total p = {pNow.toFixed(1)} kg·m/s</span>
        <span style={{ color: GREEN }}>
          {collided ? 'p unchanged ✓' : 'watch the green bar'}
        </span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
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

        <button
          onClick={() => setElastic(e => !e)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border bg-bg-surface text-text-secondary"
        >
          {elastic ? 'Make inelastic (stick)' : 'Make elastic (bounce)'}
        </button>

        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="text-accent-gold">m₁</span>
          <input
            type="range"
            min={SPEC.m1.min}
            max={SPEC.m1.max}
            step={SPEC.m1.step}
            value={m1}
            onChange={e => set('m1', +e.target.value)}
            className="w-20 accent-accent-blue"
          />
          <span className="text-text-secondary font-mono">{m1}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="text-accent-gold">v₁</span>
          <input
            type="range"
            min={SPEC.v1.min}
            max={SPEC.v1.max}
            step={SPEC.v1.step}
            value={v1}
            onChange={e => set('v1', +e.target.value)}
            className="w-20 accent-accent-blue"
          />
          <span className="text-text-secondary font-mono">
            {v1 > 0 ? '+' : ''}
            {v1}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="text-accent-gold">m₂</span>
          <input
            type="range"
            min={SPEC.m2.min}
            max={SPEC.m2.max}
            step={SPEC.m2.step}
            value={m2}
            onChange={e => set('m2', +e.target.value)}
            className="w-20 accent-accent-orange"
          />
          <span className="text-text-secondary font-mono">{m2}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="text-accent-gold">v₂</span>
          <input
            type="range"
            min={SPEC.v2.min}
            max={SPEC.v2.max}
            step={SPEC.v2.step}
            value={v2}
            onChange={e => set('v2', +e.target.value)}
            className="w-20 accent-accent-orange"
          />
          <span className="text-text-secondary font-mono">
            {v2 > 0 ? '+' : ''}
            {v2}
          </span>
        </div>
      </div>
      <div className="animation-readout">
        {/* Momentum is the invariant: it holds in both modes, which is what
              separates it from kinetic energy and is the reason the article
              bothers with the inelastic toggle at all. Shown as the total going
              in, so the reader can check it against the carts coming out. */}
        <EquationReadout
          formula="p = m₁v₁ + m₂v₂"
          bindings={[
            { symbol: 'm₁', value: String(m1) },
            { symbol: 'v₁', value: String(v1) },
            { symbol: 'm₂', value: String(m2) },
            { symbol: 'v₂', value: String(v2) },
          ]}
          result={(m1 * v1 + m2 * v2).toFixed(2)}
          assumption="conserved in both modes — unlike kinetic energy, which the inelastic collision discards"
        />
      </div>
    </div>
  )
}
