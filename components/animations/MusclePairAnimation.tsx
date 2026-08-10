'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const VW = 600
const VH = 360

const PINK = '#F472B6' // field accent — the contracting muscle
const BONE = 'rgba(245,240,232,0.85)'
const IDLE = 'rgba(245,240,232,0.28)' // relaxed muscle

// Geometry of the arm.
const SHOULDER = { x: 210, y: 70 }
const ELBOW = { x: 210, y: 220 }
const FOREARM_LEN = 150

// Forearm angle (radians) measured from straight-down. 0 = extended (arm straight),
// larger = flexed (forearm swings up).
const ANG_EXTEND = 0.15
const ANG_FLEX = 2.05
const ANG_REST = 1.1

type Mode = 'biceps' | 'triceps' | 'rest'

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}

// Draw a muscle as a tapered band between two points; `on` selects colour + bulge.
function muscle(
  ctx: CanvasRenderingContext2D,
  ax: number, ay: number, bx: number, by: number,
  on: boolean, label: string,
) {
  const midx = (ax + bx) / 2
  const midy = (ay + by) / 2
  const len = dist(ax, ay, bx, by)
  const nx = -(by - ay) / len // unit normal
  const ny = (bx - ax) / len
  const belly = on ? 20 : 11 // contracted muscles bulge
  const c1x = midx + nx * belly
  const c1y = midy + ny * belly
  const c2x = midx - nx * belly
  const c2y = midy - ny * belly

  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.quadraticCurveTo(c1x, c1y, bx, by)
  ctx.quadraticCurveTo(c2x, c2y, ax, ay)
  ctx.closePath()
  ctx.fillStyle = on ? PINK : IDLE
  ctx.fill()

  ctx.fillStyle = on ? '#0F0D0A' : 'rgba(245,240,232,0.55)'
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(label, midx + nx * belly * 0.4, midy + ny * belly * 0.4 + 3)
}

function joint(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = BONE
  ctx.beginPath()
  ctx.arc(x, y, 6, 0, Math.PI * 2)
  ctx.fill()
}

export function MusclePairAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [running, setRunning] = useState(false)
  const [reducedStatic, setReducedStatic] = useState(false)
  const [mode, setMode] = useState<Mode>('rest')

  const angRef = useRef(ANG_REST) // current forearm angle
  const modeRef = useRef<Mode>('rest')
  const autoRef = useRef(0) // timer for the auto-alternate demo (Play)
  const autoOnRef = useRef(false)
  const rafRef = useRef(0)

  const draw = useCallback((ang: number, m: Mode) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
    const pw = Math.round(VW * dpr)
    const ph = Math.round(VH * dpr)
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw
      canvas.height = ph
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, VW, VH)

    // forearm end point (wrist)
    const wrist = {
      x: ELBOW.x + FOREARM_LEN * Math.sin(ang),
      y: ELBOW.y + FOREARM_LEN * Math.cos(ang),
    }

    // Muscle attachment points.
    // Upper-arm anchors sit high on the upper arm, one on each side.
    const upFront = { x: SHOULDER.x - 15, y: SHOULDER.y + 55 } // flexor (biceps) side
    const upBack = { x: SHOULDER.x + 15, y: SHOULDER.y + 55 } // extensor (triceps) side
    // Forearm insertions sit a short way down the forearm, on opposite sides.
    const fdx = Math.sin(ang)
    const fdy = Math.cos(ang)
    const perpx = Math.cos(ang) // perpendicular to forearm
    const perpy = -Math.sin(ang)
    const along = 46
    const insFront = {
      x: ELBOW.x + fdx * along - perpx * 12,
      y: ELBOW.y + fdy * along - perpy * 12,
    }
    const insBack = {
      x: ELBOW.x + fdx * along + perpx * 12,
      y: ELBOW.y + fdy * along + perpy * 12,
    }

    // --- muscles (behind bones) ---
    muscle(ctx, upFront.x, upFront.y, insFront.x, insFront.y, m === 'biceps', 'biceps')
    muscle(ctx, upBack.x, upBack.y, insBack.x, insBack.y, m === 'triceps', 'triceps')

    // --- bones ---
    ctx.strokeStyle = BONE
    ctx.lineWidth = 11
    ctx.lineCap = 'round'
    // upper arm
    ctx.beginPath()
    ctx.moveTo(SHOULDER.x, SHOULDER.y)
    ctx.lineTo(ELBOW.x, ELBOW.y)
    ctx.stroke()
    // forearm
    ctx.beginPath()
    ctx.moveTo(ELBOW.x, ELBOW.y)
    ctx.lineTo(wrist.x, wrist.y)
    ctx.stroke()

    joint(ctx, SHOULDER.x, SHOULDER.y)
    joint(ctx, ELBOW.x, ELBOW.y)

    // labels for shoulder / elbow / hand
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.font = '10px ui-monospace, monospace'
    ctx.textAlign = 'right'
    ctx.fillText('shoulder', SHOULDER.x - 12, SHOULDER.y + 3)
    ctx.textAlign = 'left'
    ctx.fillText('elbow', ELBOW.x + 12, ELBOW.y - 8)
    // hand blob
    ctx.fillStyle = BONE
    ctx.beginPath()
    ctx.arc(wrist.x, wrist.y, 8, 0, Math.PI * 2)
    ctx.fill()

    // --- pull arrow on the active muscle: emphasise PULL, never push ---
    if (m === 'biceps') {
      // biceps pulls the insertion toward the shoulder (up the arm)
      drawPull(ctx, insFront.x, insFront.y, upFront.x, upFront.y)
      banner(ctx, 'BICEPS contracts → forearm PULLED UP (flexion)')
    } else if (m === 'triceps') {
      drawPull(ctx, insBack.x, insBack.y, upBack.x, upBack.y)
      banner(ctx, 'TRICEPS contracts → forearm PULLED DOWN (extension)')
    } else {
      banner(ctx, 'At rest — activate one muscle. Neither can push.')
    }
  }, [])

  // main loop
  useEffect(() => {
    if (!running || reducedStatic) return
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now

      // auto-alternate demo: swap the active muscle on a fixed cadence
      if (autoOnRef.current) {
        autoRef.current += dt
        if (autoRef.current > 1.6) {
          autoRef.current = 0
          const next: Mode = modeRef.current === 'biceps' ? 'triceps' : 'biceps'
          modeRef.current = next
          setMode(next)
        }
      }

      const target =
        modeRef.current === 'biceps' ? ANG_FLEX : modeRef.current === 'triceps' ? ANG_EXTEND : ANG_REST
      const diff = target - angRef.current
      angRef.current += diff * Math.min(1, dt * 4)
      draw(angRef.current, modeRef.current)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, reducedStatic, draw])

  // reduced-motion static frame: biceps contracted, arm flexed
  useEffect(() => {
    if (!reducedStatic) return
    angRef.current = ANG_FLEX
    modeRef.current = 'biceps'
    setMode('biceps')
    draw(ANG_FLEX, 'biceps')
  }, [reducedStatic, draw])

  // keep a frame painted while paused
  useEffect(() => {
    if (running || reducedStatic) return
    draw(angRef.current, modeRef.current)
  }, [running, reducedStatic, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setReducedStatic(true); return }
      autoOnRef.current = true
      modeRef.current = 'biceps'
      setMode('biceps')
      setRunning(true)
    },
  })

  const activate = (m: Mode) => {
    autoOnRef.current = false
    modeRef.current = m
    setMode(m)
    setReducedStatic(false)
    setRunning(true)
  }

  const togglePlay = () => {
    setReducedStatic(false)
    if (running) {
      setRunning(false)
      return
    }
    autoOnRef.current = true
    autoRef.current = 0
    if (modeRef.current === 'rest') {
      modeRef.current = 'biceps'
      setMode('biceps')
    }
    setRunning(true)
  }

  const reset = () => {
    triggerReset()
    setRunning(false)
    setReducedStatic(false)
    autoOnRef.current = false
    autoRef.current = 0
    angRef.current = ANG_REST
    modeRef.current = 'rest'
    setMode('rest')
    draw(ANG_REST, 'rest')
  }

  const contracting = mode === 'rest' ? 'none' : mode
  const motion =
    mode === 'biceps' ? 'flexion (forearm up)' : mode === 'triceps' ? 'extension (forearm down)' : '—'

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · The biceps–triceps pair
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: VH + 10 }}>
        <canvas
          ref={canvasRef}
          width={VW}
          height={VH}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          contracting: <span style={{ color: PINK }}>{contracting}</span>
        </span>
        <span>motion: {motion}</span>
        <span style={{ color: PINK }}>each muscle only PULLS</span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={togglePlay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running && autoOnRef.current ? 'Pause' : 'Play (alternate)'}
        </button>
        <button
          onClick={() => activate('biceps')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary border border-border"
        >
          Contract biceps
        </button>
        <button
          onClick={() => activate('triceps')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary border border-border"
        >
          Contract triceps
        </button>
      </div>
    </div>
  )
}

// A short arrow along the muscle showing the direction of pull (toward the fixed end).
function drawPull(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) {
  const d = dist(fromX, fromY, toX, toY)
  const ux = (toX - fromX) / d
  const uy = (toY - fromY) / d
  const sx = fromX + ux * d * 0.35
  const sy = fromY + uy * d * 0.35
  const ex = fromX + ux * d * 0.72
  const ey = fromY + uy * d * 0.72
  ctx.strokeStyle = '#0F0D0A'
  ctx.fillStyle = '#0F0D0A'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  const ang = Math.atan2(ey - sy, ex - sx)
  const a = 6
  ctx.beginPath()
  ctx.moveTo(ex, ey)
  ctx.lineTo(ex - a * Math.cos(ang - 0.5), ey - a * Math.sin(ang - 0.5))
  ctx.lineTo(ex - a * Math.cos(ang + 0.5), ey - a * Math.sin(ang + 0.5))
  ctx.closePath()
  ctx.fill()
}

function banner(ctx: CanvasRenderingContext2D, text: string) {
  ctx.fillStyle = PINK
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(text, 24, VH - 22)
}
