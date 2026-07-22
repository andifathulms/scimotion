'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Zap } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

const CX = 300
const CY = 176
const R_EARTH = 122 // whole planet (mantle) radius, px
const R_CORE = 84 // liquid outer core radius, px
const R_INNER = 30 // solid inner core radius, px
const BASE_TILT = 0.19 // dipole tilt ~11 degrees, in radians
const REV_FRAMES = 300 // length of a reversal, in frames

const hex = (c: string, a: number) =>
  `${c}${Math.max(0, Math.min(255, Math.round(a * 255)))
    .toString(16)
    .padStart(2, '0')}`

// A single dipole field line in the meridional plane: rho = L sin^2(theta).
// `mag` scales the outward bulge so the loop collapses onto the surface as the
// field dies; `disorder` jitters it so a weak or reversing dynamo looks tangled.
function fieldLine(
  ctx: CanvasRenderingContext2D,
  L: number,
  side: number,
  tilt: number,
  mag: number,
  disorder: number,
  phase: number,
  color: string,
  alpha: number
) {
  const Leff = R_EARTH + (L - R_EARTH) * mag
  if (Leff <= R_EARTH + 2) return
  const thMin = Math.asin(Math.min(1, Math.sqrt(R_EARTH / Leff)))
  const steps = 46
  const ct = Math.cos(tilt)
  const st = Math.sin(tilt)
  ctx.beginPath()
  for (let i = 0; i <= steps; i++) {
    const th = thMin + (Math.PI - 2 * thMin) * (i / steps)
    const s = Math.sin(th)
    let rho = Leff * s * s
    rho += disorder * 11 * Math.sin(th * 3 + side * 2.1 + phase * 6.2 + L * 0.05)
    const dx = side * rho * s
    const dy = -rho * Math.cos(th)
    const x = CX + dx * ct - dy * st
    const y = CY + dx * st + dy * ct
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = hex(color, alpha)
  ctx.lineWidth = 1 + mag
  ctx.stroke()
}

// A stubby rogue loop, drawn only when the field is disordered, to suggest the
// multipolar mess a dynamo passes through as it weakens or reverses.
function rogueLoop(
  ctx: CanvasRenderingContext2D,
  ang: number,
  size: number,
  alpha: number,
  color: string
) {
  const bx = CX + (R_EARTH + 6) * Math.cos(ang)
  const by = CY + (R_EARTH + 6) * Math.sin(ang)
  ctx.beginPath()
  ctx.moveTo(bx, by)
  ctx.quadraticCurveTo(
    bx + size * Math.cos(ang - 0.5),
    by + size * Math.sin(ang - 0.5),
    CX + (R_EARTH + 6) * Math.cos(ang + 0.32),
    CY + (R_EARTH + 6) * Math.sin(ang + 0.32)
  )
  ctx.strokeStyle = hex(color, alpha)
  ctx.lineWidth = 1
  ctx.stroke()
}

export function GeodynamoAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const lastRef = useRef<number | null>(null)
  const frameRef = useRef(0)

  const [vigour, setVigour] = useState(0.85) // core convection / rotation, 0.15..1
  const [running, setRunning] = useState(false)
  const [strength, setStrength] = useState(85) // displayed field strength, %

  const vigourRef = useRef(vigour)
  useEffect(() => {
    vigourRef.current = vigour
  }, [vigour])

  const polRef = useRef(1) // dipole polarity, +1 normal / -1 reversed
  const magRef = useRef(0.85) // eased dipole magnitude, 0..1
  const revActiveRef = useRef(false)
  const revTRef = useRef(0)
  const revFlippedRef = useRef(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const f = frameRef.current
    const phase = (f / 260) % 1
    const vig = vigourRef.current

    // ---- reversal envelope ----
    let env = 1
    let revDisorder = 0
    if (revActiveRef.current) {
      const rt = revTRef.current
      env = 0.1 + 0.9 * Math.abs(2 * rt - 1)
      revDisorder = Math.sin(rt * Math.PI)
      if (rt >= 0.5 && !revFlippedRef.current) {
        polRef.current *= -1
        revFlippedRef.current = true
      }
    }

    const target = vig * env
    magRef.current += (target - magRef.current) * 0.12
    const mag = magRef.current
    const disorder = Math.min(1, (1 - vig) * 0.55 + revDisorder * 0.95)
    const tilt = BASE_TILT + disorder * 0.5 * Math.sin(phase * 2 * Math.PI)
    const pol = polRef.current

    ctx.clearRect(0, 0, W, H)

    // faint grid
    ctx.strokeStyle = 'rgba(255,245,235,0.035)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }

    // ---- outer dipole field lines (behind the globe) ----
    const Ls = [150, 180, 216, 262, 320]
    for (const L of Ls) {
      for (const side of [1, -1]) {
        fieldLine(ctx, L, side, tilt, mag, disorder, phase, CYAN, 0.16 + 0.5 * mag)
      }
    }
    // rogue multipolar loops while disordered
    if (disorder > 0.35) {
      for (let i = 0; i < 5; i++) {
        const ang = i * 1.257 + phase * 2 + f * 0.004
        rogueLoop(ctx, ang, 20 + 26 * disorder, 0.1 + 0.35 * disorder, VIOLET)
      }
    }

    // ---- the planet (cutaway) ----
    // mantle shell
    ctx.beginPath()
    ctx.arc(CX, CY, R_EARTH, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(167,139,250,0.06)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(245,240,232,0.18)'
    ctx.lineWidth = 1.4
    ctx.stroke()
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('mantle', CX - 84, CY - 96)

    // liquid outer core
    const coreGlow = ctx.createRadialGradient(CX, CY, R_INNER, CX, CY, R_CORE)
    coreGlow.addColorStop(0, 'rgba(245,158,11,0.30)')
    coreGlow.addColorStop(1, 'rgba(245,158,11,0.10)')
    ctx.beginPath()
    ctx.arc(CX, CY, R_CORE, 0, Math.PI * 2)
    ctx.fillStyle = coreGlow
    ctx.fill()
    ctx.strokeStyle = hex(GOLD, 0.5)
    ctx.lineWidth = 1
    ctx.stroke()

    // convection: swirling streaklines in the outer-core annulus
    const spin = f * 0.01 * (0.4 + vig)
    ctx.save()
    ctx.beginPath()
    ctx.arc(CX, CY, R_CORE, 0, Math.PI * 2)
    ctx.clip()
    for (let i = 0; i < 26; i++) {
      const a0 = (i / 26) * Math.PI * 2 + spin
      const rr = R_INNER + 8 + ((i * 37) % (R_CORE - R_INNER - 12))
      const wob = 4 * Math.sin(f * 0.03 * (0.4 + vig) + i)
      ctx.beginPath()
      ctx.arc(CX, CY, rr + wob, a0, a0 + 0.5 + 0.4 * vig)
      ctx.strokeStyle = hex(GOLD, 0.15 + 0.4 * vig)
      ctx.lineWidth = 1.3
      ctx.stroke()
    }
    // rising / sinking convection plumes
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - spin * 1.6
      const up = i % 2 === 0
      const r1 = R_INNER + 4
      const r2 = R_CORE - 4
      const puls = up ? (f * 0.02 * (0.3 + vig)) % 1 : 1 - ((f * 0.02 * (0.3 + vig)) % 1)
      const rp = r1 + (r2 - r1) * puls
      const x = CX + rp * Math.cos(a)
      const y = CY + rp * Math.sin(a)
      ctx.beginPath()
      ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fillStyle = hex(up ? GOLD : BLUE, 0.5 + 0.4 * vig)
      ctx.fill()
    }
    ctx.restore()

    // solid inner core
    ctx.beginPath()
    ctx.arc(CX, CY, R_INNER, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(245,240,232,0.22)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(245,240,232,0.4)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = 'rgba(15,13,10,0.9)'
    ctx.font = '7px monospace'
    ctx.fillText('inner', CX - 11, CY - 1)
    ctx.fillText('core', CX - 9, CY + 7)
    ctx.fillStyle = hex(GOLD, 0.8)
    ctx.font = '9px monospace'
    ctx.fillText('liquid iron', CX - 20, CY + R_CORE - 8)

    // ---- dipole axis + pole markers (swap on reversal) ----
    const ax = Math.sin(tilt)
    const ay = -Math.cos(tilt)
    const northUp = pol > 0
    const nx = CX + ax * (R_EARTH + 20) * (northUp ? 1 : -1)
    const ny = CY + ay * (R_EARTH + 20) * (northUp ? 1 : -1)
    const sx = CX - ax * (R_EARTH + 20) * (northUp ? 1 : -1)
    const sy = CY - ay * (R_EARTH + 20) * (northUp ? 1 : -1)
    ctx.strokeStyle = 'rgba(245,240,232,0.2)'
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(nx, ny)
    ctx.lineTo(sx, sy)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = hex(CYAN, 0.3 + 0.7 * mag)
    ctx.fillText('N', nx - 4, ny + 4)
    ctx.fillStyle = hex(VIOLET, 0.3 + 0.7 * mag)
    ctx.fillText('S', sx - 4, sy + 4)

    // ---- headings + strength meter ----
    ctx.font = '11px monospace'
    ctx.fillStyle = CYAN
    ctx.fillText('Geodynamo · the field is made by motion', 12, 18)

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('field strength', 12, H - 34)
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.strokeRect(12.5, H - 28.5, 140, 9)
    ctx.fillStyle = hex(mag > 0.4 ? CYAN : GOLD, 0.85)
    ctx.fillRect(13, H - 28, 139 * Math.max(0, Math.min(1, mag)), 8)

    ctx.fillStyle = revActiveRef.current
      ? hex(GOLD, 0.9)
      : disorder > 0.35
        ? hex(VIOLET, 0.85)
        : hex(GREEN, 0.85)
    ctx.font = '9px monospace'
    const state = revActiveRef.current
      ? 'REVERSING — dipole collapsing, going multipolar'
      : mag < 0.35
        ? 'weak & disordered — barely a dynamo'
        : `strong dipole · ${northUp ? 'normal' : 'reversed'} polarity`
    ctx.fillText(state, 168, H - 21)

    setStrength(Math.round(Math.max(0, Math.min(1, mag)) * 100))
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        magRef.current = vigourRef.current
        frameRef.current = 80
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    draw()
  }, [draw, vigour])

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
      frameRef.current += steps
      if (revActiveRef.current) {
        revTRef.current += steps / REV_FRAMES
        if (revTRef.current >= 1) {
          revActiveRef.current = false
          revTRef.current = 0
          revFlippedRef.current = false
        }
      }
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const triggerReversal = () => {
    if (revActiveRef.current) return
    revActiveRef.current = true
    revTRef.current = 0
    revFlippedRef.current = false
    if (!running) setRunning(true)
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    lastRef.current = null
    frameRef.current = 0
    revActiveRef.current = false
    revTRef.current = 0
    revFlippedRef.current = false
    polRef.current = 1
    magRef.current = 0.85
    setVigour(0.85)
    vigourRef.current = 0.85
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · The geodynamo in cutaway
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
        <button
          onClick={triggerReversal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ boxShadow: `inset 0 0 0 1px ${VIOLET}`, color: VIOLET }}
        >
          <Zap size={12} /> Trigger reversal
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Core vigour:</span>
          <input
            type="range"
            min={15}
            max={100}
            step={1}
            value={Math.round(vigour * 100)}
            onChange={e => setVigour(+e.target.value / 100)}
            className="w-32 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">{Math.round(vigour * 100)}%</span>
        </div>
      </div>
      <div className="animation-controls flex-wrap gap-3 text-xs text-text-muted">
        <span>
          convection + rotation drive an induction loop that regenerates the field
        </span>
        <span className="ml-auto font-mono">
          field:{' '}
          <strong style={{ color: strength > 40 ? CYAN : GOLD }}>{strength}%</strong> of full
        </span>
      </div>
    </div>
  )
}
