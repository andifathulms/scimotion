'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 372

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

// Real crustal wave speeds (km/s). Rayleigh waves run at roughly 0.92 vS.
const VP = 6.0
const VS = 3.46
const VR = 3.1

// Distance a whole second of S-minus-P separation is worth: 1 / (1/VS - 1/VP).
const KM_PER_SP_SECOND = 1 / (1 / VS - 1 / VP) // ≈ 8.18 km per second

const DMAX = 700 // km across the medium panel
const X0 = 40
const X1 = 570
const PXKM = (X1 - X0) / DMAX

const TEND = 270 // model seconds on the seismogram axis
const SPEED = 22 // model seconds per wall-clock second

// One wavelet family, used for both the particle field and the trace, so the
// two panels are showing the same event. Periods are stretched relative to a
// real local recording so the packets are legible at this pixel scale.
const T_P = 4
const SIG_P = 5
const T_S = 6
const SIG_S = 8
const T_R = 12
const SIG_R = 20

// Surface row spacing of the particle lattice.
const ROWS = 5
const ROW_Y0 = 62
const ROW_DY = 19
const COL_DX = 9

const AMP_P = 5.2
const AMP_S = 7.4
const AMP_R = 9.6

type Phase = { key: 'p' | 's' | 'r'; name: string; v: number; color: string }

const PHASES: Phase[] = [
  { key: 'p', name: 'P', v: VP, color: GOLD },
  { key: 's', name: 'S', v: VS, color: CYAN },
  { key: 'r', name: 'surface', v: VR, color: VIOLET },
]

// Gaussian-windowed sinusoid. Returns 0 well outside the window so the inner
// loop stays cheap.
function wav(tau: number, sig: number, period: number): number {
  const e = Math.exp(-(tau * tau) / (sig * sig))
  if (e < 1e-4) return 0
  return e * Math.sin((2 * Math.PI * tau) / period)
}

// Amplitude falls off with distance; not a real geometrical-spreading law, just
// enough that the far field does not look as violent as the near field.
const attenuate = (km: number) => 1 / (1 + km / 900)

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color = 'rgba(245,240,232,0.5)',
  size = 9
) {
  ctx.font = `${size}px monospace`
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

function doubleArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: string
) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(x - dx, y - dy)
  ctx.lineTo(x + dx, y + dy)
  ctx.stroke()
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  for (const s of [1, -1]) {
    const tx = x + s * dx
    const ty = y + s * dy
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(tx - s * ux * 5 - uy * 3, ty - s * uy * 5 + ux * 3)
    ctx.lineTo(tx - s * ux * 5 + uy * 3, ty - s * uy * 5 - ux * 3)
    ctx.closePath()
    ctx.fill()
  }
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  station: { default: 320, min: 80, max: 680, step: 10 },
}

export function SeismicWaveAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const lastRef = useRef<number | null>(null)
  const tRef = useRef(0)

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('seismic-wave', SPEC)
  const { station } = params
  const [shown, setShown] = useState<Record<Phase['key'], boolean>>({ p: true, s: true, r: true })
  const [clock, setClock] = useState(0)

  const stationRef = useRef(station)
  const shownRef = useRef(shown)
  useEffect(() => {
    stationRef.current = station
  }, [station])
  useEffect(() => {
    shownRef.current = shown
  }, [shown])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const t = tRef.current
    const d = stationRef.current
    const vis = shownRef.current

    ctx.clearRect(0, 0, W, H)

    // ---- faint backdrop ---------------------------------------------------
    ctx.strokeStyle = 'rgba(255,245,235,0.035)'
    ctx.lineWidth = 1
    for (let x = X0; x <= X1; x += 53) {
      ctx.beginPath()
      ctx.moveTo(x, 44)
      ctx.lineTo(x, 168)
      ctx.stroke()
    }

    ctx.font = '11px monospace'
    ctx.fillStyle = CYAN
    ctx.fillText('Rupture → medium → station', 12, 20)
    label(ctx, `P ${VP.toFixed(1)}  ·  S ${VS.toFixed(2)}  ·  surface ${VR.toFixed(1)} km/s`, 12, 34)

    // ---- free surface -----------------------------------------------------
    ctx.strokeStyle = 'rgba(245,240,232,0.28)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(X0 - 8, ROW_Y0 - 11)
    ctx.lineTo(X1 + 8, ROW_Y0 - 11)
    ctx.stroke()
    label(ctx, 'free surface', X0 - 6, ROW_Y0 - 16, 'rgba(245,240,232,0.3)', 8)

    // ---- the particle lattice --------------------------------------------
    for (let j = 0; j < ROWS; j++) {
      const y0 = ROW_Y0 + j * ROW_DY
      const depthFac = Math.exp(-j * 0.62) // Rayleigh motion dies away with depth
      for (let x = X0; x <= X1; x += COL_DX) {
        const km = (x - X0) / PXKM
        const att = attenuate(km)

        const p = vis.p ? wav(t - km / VP, SIG_P, T_P) : 0
        const s = vis.s ? wav(t - km / VS, SIG_S, T_S) : 0
        const rV = vis.r ? wav(t - km / VR, SIG_R, T_R) * depthFac : 0
        const rH = vis.r ? wav(t - km / VR - T_R / 4, SIG_R, T_R) * depthFac : 0

        // P is compressional: motion along the direction of travel (x).
        // S is shear: motion across it (y). Rayleigh motion is elliptical.
        const ux = (AMP_P * p + AMP_R * 0.7 * rH) * att
        const uy = (AMP_S * s + AMP_R * rV) * att

        const mag = Math.min(1, (Math.abs(p) + Math.abs(s) + Math.abs(rV)) * 1.1)
        let col = 'rgba(245,240,232,0.16)'
        if (mag > 0.05) {
          const ap = Math.abs(p)
          const as = Math.abs(s)
          const ar = Math.abs(rV)
          const base = ar >= ap && ar >= as ? VIOLET : as >= ap ? CYAN : GOLD
          const a = Math.round((0.3 + 0.7 * mag) * 255)
            .toString(16)
            .padStart(2, '0')
          col = `${base}${a}`
        }
        ctx.beginPath()
        ctx.arc(x + ux, y0 + uy, mag > 0.05 ? 1.9 : 1.3, 0, Math.PI * 2)
        ctx.fillStyle = col
        ctx.fill()
      }
    }

    // ---- rupture ----------------------------------------------------------
    const flash = Math.max(0, 1 - t / 6)
    ctx.beginPath()
    ctx.arc(X0, ROW_Y0 + 2 * ROW_DY, 4 + 10 * flash, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(245,158,11,${0.2 + 0.5 * flash})`
    ctx.fill()
    ctx.beginPath()
    ctx.arc(X0, ROW_Y0 + 2 * ROW_DY, 4, 0, Math.PI * 2)
    ctx.fillStyle = GOLD
    ctx.fill()
    label(ctx, 'rupture', X0 - 20, ROW_Y0 + 2 * ROW_DY + 26, GOLD, 8)

    // ---- wavefront markers ------------------------------------------------
    const yTop = ROW_Y0 - 11
    const yBot = ROW_Y0 + (ROWS - 1) * ROW_DY + 12
    for (const ph of PHASES) {
      if (!vis[ph.key]) continue
      const x = X0 + ph.v * t * PXKM
      if (x < X0 || x > X1 + 2) continue
      ctx.setLineDash([3, 4])
      ctx.strokeStyle = `${ph.color}99`
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(x, yTop)
      ctx.lineTo(x, yBot)
      ctx.stroke()
      ctx.setLineDash([])
      label(ctx, ph.name, x + 3, yTop - 3, ph.color, 9)
    }

    // Particle-motion keys, pinned just behind each front while it is on screen.
    const xP = X0 + VP * t * PXKM
    if (vis.p && xP > X0 + 40 && xP < X1 - 10) {
      doubleArrow(ctx, xP - 26, 168, 10, 0, GOLD)
      label(ctx, 'push–pull, along travel', xP - 70, 182, GOLD, 8)
    }
    const xS = X0 + VS * t * PXKM
    if (vis.s && xS > X0 + 40 && xS < X1 - 10) {
      doubleArrow(ctx, xS - 22, 168, 0, 8, CYAN)
      label(ctx, 'shear, across travel', xS - 4, 182, CYAN, 8)
    }

    // ---- station ----------------------------------------------------------
    const sx = X0 + d * PXKM
    ctx.beginPath()
    ctx.moveTo(sx, ROW_Y0 - 12)
    ctx.lineTo(sx - 6, ROW_Y0 - 23)
    ctx.lineTo(sx + 6, ROW_Y0 - 23)
    ctx.closePath()
    ctx.fillStyle = GREEN
    ctx.fill()
    label(ctx, `station · ${d} km`, sx - 30, ROW_Y0 - 27, GREEN, 8)

    // ---- seismogram -------------------------------------------------------
    const SG = 274
    const HALF = 50
    const tx = (tt: number) => X0 + (tt / TEND) * (X1 - X0)

    ctx.fillStyle = 'rgba(255,245,235,0.025)'
    ctx.fillRect(X0 - 8, SG - HALF - 12, X1 - X0 + 16, 2 * HALF + 30)
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.strokeRect(X0 - 7.5, SG - HALF - 11.5, X1 - X0 + 15, 2 * HALF + 29)

    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.beginPath()
    ctx.moveTo(X0, SG)
    ctx.lineTo(X1, SG)
    ctx.stroke()
    for (let tt = 0; tt <= TEND; tt += 30) {
      const x = tx(tt)
      ctx.strokeStyle = 'rgba(255,245,235,0.1)'
      ctx.beginPath()
      ctx.moveTo(x, SG + HALF)
      ctx.lineTo(x, SG + HALF + 4)
      ctx.stroke()
      label(ctx, `${tt}`, x - 6, SG + HALF + 14, 'rgba(245,240,232,0.28)', 8)
    }
    label(ctx, 'seconds after the rupture', X1 - 128, SG + HALF + 25, 'rgba(245,240,232,0.28)', 8)

    const tP = d / VP
    const tS = d / VS
    const tR = d / VR
    const att = attenuate(d)

    // Arrival markers: faint until the phase has actually turned up.
    const marks: [number, string, string][] = [
      [tP, 'P', GOLD],
      [tS, 'S', CYAN],
      [tR, 'surface', VIOLET],
    ]
    marks.forEach(([tt, name, color], i) => {
      if ((i === 0 && !vis.p) || (i === 1 && !vis.s) || (i === 2 && !vis.r)) return
      const x = tx(tt)
      const arrived = t >= tt
      ctx.setLineDash(arrived ? [] : [2, 4])
      ctx.strokeStyle = arrived ? `${color}CC` : `${color}44`
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(x, SG - HALF)
      ctx.lineTo(x, SG + HALF)
      ctx.stroke()
      ctx.setLineDash([])
      label(ctx, name, x + 3, SG - HALF + 10, arrived ? color : `${color}66`, 9)
    })

    // The trace itself, drawn only as far as the model clock has run.
    ctx.beginPath()
    const tNow = Math.min(t, TEND)
    for (let x = X0; x <= tx(tNow); x += 1) {
      const tt = ((x - X0) / (X1 - X0)) * TEND
      const y =
        (vis.p ? 0.22 * wav(tt - tP, SIG_P, T_P) : 0) +
        (vis.s ? 0.5 * wav(tt - tS, SIG_S, T_S) : 0) +
        (vis.r ? 1.0 * wav(tt - tR, SIG_R, T_R) : 0)
      ctx.lineTo(x, SG - y * 42 * att)
    }
    ctx.strokeStyle = 'rgba(245,240,232,0.85)'
    ctx.lineWidth = 1.2
    ctx.stroke()

    // ---- the S-minus-P measurement ---------------------------------------
    if (vis.p && vis.s) {
      const bx0 = tx(tP)
      const bx1 = tx(tS)
      const by = SG - HALF - 4
      ctx.strokeStyle = `${BLUE}CC`
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(bx0, by)
      ctx.lineTo(bx1, by)
      ctx.moveTo(bx0, by - 4)
      ctx.lineTo(bx0, by + 4)
      ctx.moveTo(bx1, by - 4)
      ctx.lineTo(bx1, by + 4)
      ctx.stroke()
      const dt = tS - tP
      label(
        ctx,
        `S−P = ${dt.toFixed(1)} s  →  ${Math.round(dt * KM_PER_SP_SECOND)} km`,
        Math.min(bx0 + 4, X1 - 190),
        by - 8,
        BLUE,
        9
      )
    }

    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(`t = ${Math.min(t, TEND).toFixed(0)} s`, X1 - 62, SG - HALF - 20)
    label(ctx, 'vertical ground motion at the station', X0, SG - HALF - 20, CYAN, 9)
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        tRef.current = 150
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    draw()
  }, [draw, station, shown])

  useEffect(() => {
    if (!running) {
      lastRef.current = null
      cancelAnimationFrame(rafRef.current)
      return
    }
    const loop = (now: number) => {
      if (lastRef.current === null) lastRef.current = now
      const dt = Math.min(64, now - lastRef.current)
      lastRef.current = now
      tRef.current += (dt / 1000) * SPEED
      if (tRef.current > TEND) tRef.current = 0
      setClock(tRef.current)
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    lastRef.current = null
    tRef.current = 0
    setClock(0)
    set('station', 320)
    stationRef.current = 320
    setShown({ p: true, s: true, r: true })
    shownRef.current = { p: true, s: true, r: true }
    draw()
  }

  const gap = station * (1 / VS - 1 / VP)
  const lead = gap // seconds of P-before-S warning at this distance

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · P, S and surface waves leaving a rupture
        </span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button
            onClick={resetAll}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: P, S and surface waves leaving a rupture. Values are reported below the diagram."
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
        <div className="flex items-center gap-1.5">
          {PHASES.map(ph => (
            <button
              key={ph.key}
              onClick={() => setShown(s => ({ ...s, [ph.key]: !s[ph.key] }))}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                shown[ph.key] ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
              style={shown[ph.key] ? { boxShadow: `inset 0 0 0 1px ${ph.color}` } : undefined}
            >
              {ph.name}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Station:</span>
          <input
            type="range"
            min={SPEC.station.min}
            max={SPEC.station.max}
            step={SPEC.station.step}
            value={station}
            onChange={e => set('station', +e.target.value)}
            className="w-32 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">{station} km</span>
        </label>
      </div>
      <div className="animation-controls flex-wrap gap-3 text-xs text-text-muted">
        <span>
          S−P gap: <strong style={{ color: BLUE }}>{gap.toFixed(1)} s</strong>
        </span>
        <span>
          distance from the gap:{' '}
          <strong className="text-text-secondary">
            {gap.toFixed(1)} × {KM_PER_SP_SECOND.toFixed(2)} = {Math.round(gap * KM_PER_SP_SECOND)} km
          </strong>
        </span>
        <WidgetStatus className="ml-auto font-mono">
          {clock.toFixed(0)} s · {lead.toFixed(0)} s of P-before-S warning
        </WidgetStatus>
      </div>
    </div>
  )
}
