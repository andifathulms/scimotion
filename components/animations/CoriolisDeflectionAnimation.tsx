'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 400
const BG = '#0F0D0A'

const CX = 300
const CY = 208
const R = 150

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const MUTED = 'rgba(245,240,232,0.28)'

// Total disk rotation while the ball crosses one radius. Chosen so the curve in
// the rotating frame is clearly visible without wrapping around on itself.
const TOTAL_ROT = 1.15
const SPEED = 0.006 // progress per frame at 60fps
const RINGS = 3
const SPOKES = 8

type View = 'space' | 'ground'

// Rotate a point (dx, dy) — screen coords, y down — by angle a (CCW on screen
// means clockwise mathematically, but we stay internally consistent).
function rot(dx: number, dy: number, a: number): [number, number] {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [dx * c - dy * s, dx * s + dy * c]
}

export function CoriolisDeflectionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const progRef = useRef(0)

  const [view, setView] = useState<View>('ground')
  // sign = +1 -> disk turns counterclockwise on screen = Northern Hemisphere,
  // deflection to the RIGHT of motion. sign = -1 -> Southern, to the LEFT.
  const [north, setNorth] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [prog, setProg] = useState(0)

  const viewRef = useRef(view)
  const northRef = useRef(north)
  useEffect(() => {
    viewRef.current = view
  }, [view])
  useEffect(() => {
    northRef.current = north
  }, [north])

  // Ball launched from the disk centre straight "north" (up the screen) in the
  // fixed inertial frame. Its inertial position is a pure straight line.
  const inertialPos = (s: number): [number, number] => [CX, CY - s * R]

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)
    ctx.font = '11px monospace'

    const s = progRef.current
    const isGround = viewRef.current === 'ground'
    const sign = northRef.current ? 1 : -1
    // On-screen rotation angle of the disk at progress s (positive = CCW screen
    // rotation = mathematically negative because y points down).
    const theta = -sign * TOTAL_ROT * s

    // ---- the disk (planet) ----
    // Grid spokes/rings are painted ON the disk, so they carry its rotation.
    // In space view the disk is drawn rotated by theta; in ground view we hold
    // the disk still (co-rotating with it) and instead spin the ball's trail.
    const diskAngle = isGround ? 0 : theta

    ctx.save()
    ctx.beginPath()
    ctx.arc(CX, CY, R, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(34,211,238,0.05)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(34,211,238,0.35)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // concentric rings
    ctx.strokeStyle = 'rgba(245,240,232,0.08)'
    ctx.lineWidth = 1
    for (let i = 1; i <= RINGS; i++) {
      ctx.beginPath()
      ctx.arc(CX, CY, (R * i) / (RINGS + 1), 0, Math.PI * 2)
      ctx.stroke()
    }
    // spokes, rotated with the disk
    for (let i = 0; i < SPOKES; i++) {
      const a = diskAngle + (i / SPOKES) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      ctx.lineTo(CX + Math.cos(a) * R, CY + Math.sin(a) * R)
      ctx.strokeStyle = i === 0 ? 'rgba(96,165,250,0.5)' : 'rgba(245,240,232,0.06)'
      ctx.lineWidth = i === 0 ? 1.6 : 1
      ctx.stroke()
    }
    ctx.restore()

    // spin-direction arc arrow at the rim
    const arcDir = sign > 0 ? -1 : 1 // screen: +1 sign spins CCW
    ctx.beginPath()
    ctx.arc(CX, CY, R + 14, -Math.PI / 2, -Math.PI / 2 + arcDir * 0.9, arcDir < 0)
    ctx.strokeStyle = MUTED
    ctx.lineWidth = 1.4
    ctx.stroke()
    const tipA = -Math.PI / 2 + arcDir * 0.9
    const tx = CX + Math.cos(tipA) * (R + 14)
    const ty = CY + Math.sin(tipA) * (R + 14)
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(tx - arcDir * 6, ty - 7)
    ctx.lineTo(tx + arcDir * 3, ty - 9)
    ctx.closePath()
    ctx.fillStyle = MUTED
    ctx.fill()

    // ---- target painted on the disk (started due north of centre) ----
    // Its fixed-disk position is straight up; it rotates with the disk.
    const [tdx, tdy] = rot(0, -R * 0.82, diskAngle)
    const targetX = CX + tdx
    const targetY = CY + tdy
    ctx.beginPath()
    ctx.arc(targetX, targetY, 6, 0, Math.PI * 2)
    ctx.strokeStyle = CYAN
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(targetX - 9, targetY)
    ctx.lineTo(targetX + 9, targetY)
    ctx.moveTo(targetX, targetY - 9)
    ctx.lineTo(targetX, targetY + 9)
    ctx.stroke()
    ctx.fillStyle = 'rgba(34,211,238,0.85)'
    ctx.fillText('target', targetX + 10, targetY - 8)

    // ---- reference: where the ball was AIMED (fixed north line) ----
    ctx.setLineDash([4, 5])
    ctx.beginPath()
    ctx.moveTo(CX, CY)
    ctx.lineTo(CX, CY - R)
    ctx.strokeStyle = 'rgba(245,240,232,0.22)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.setLineDash([])

    // ---- the ball's trail ----
    // Build the path up to s. In space view the ball is the raw inertial
    // straight line. In ground view we express the SAME inertial positions in
    // the co-rotating frame, which bends them into a curve.
    const N = Math.max(2, Math.round(s / SPEED))
    ctx.beginPath()
    for (let i = 0; i <= N; i++) {
      const si = (i / N) * s
      const [ix, iy] = inertialPos(si)
      let px = ix
      let py = iy
      if (isGround) {
        // rotate inertial displacement by -theta(si) into the disk frame
        const th = -sign * TOTAL_ROT * si
        const [rx, ry] = rot(ix - CX, iy - CY, -th)
        px = CX + rx
        py = CY + ry
      }
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2.4
    ctx.stroke()

    // current ball head
    const [bix, biy] = inertialPos(s)
    let bx = bix
    let by = biy
    if (isGround) {
      const [rx, ry] = rot(bix - CX, biy - CY, -theta)
      bx = CX + rx
      by = CY + ry
    }
    ctx.beginPath()
    ctx.arc(bx, by, 6, 0, Math.PI * 2)
    ctx.fillStyle = GOLD
    ctx.fill()
    ctx.strokeStyle = BG
    ctx.lineWidth = 1.5
    ctx.stroke()

    // ---- captions ----
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    if (isGround) {
      ctx.fillText('GROUND view · you rotate with the disk', 14, 24)
      ctx.fillStyle = GOLD
      ctx.fillText('same motion — now the path curves', 14, H - 16)
    } else {
      ctx.fillText('SPACE view · fixed inertial frame', 14, 24)
      ctx.fillStyle = GOLD
      ctx.fillText('the ball flies dead straight; the disk turns under it', 14, H - 16)
    }
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        progRef.current = 1
        setProg(1)
        draw()
      } else {
        setPlaying(true)
      }
    },
  })

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!playing) return
    const tick = () => {
      let s = progRef.current + SPEED
      if (s >= 1) s = 1
      progRef.current = s
      setProg(s)
      draw()
      if (s >= 1) {
        setPlaying(false)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, draw])

  // redraw immediately when the viewer flips a toggle while paused
  useEffect(() => {
    if (!playing) draw()
  }, [view, north, playing, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const play = () => {
    if (progRef.current >= 1) {
      progRef.current = 0
      setProg(0)
    }
    setPlaying(true)
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setPlaying(false)
    triggerReset()
    progRef.current = 0
    setProg(0)
    draw()
  }

  const deflectLabel = north ? 'right (NH)' : 'left (SH)'

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: Coriolis deflection. Values are reported below the diagram."
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: BG, aspectRatio: `${W} / ${H}` }}
        />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          frame ={' '}
          <strong style={{ color: view === 'space' ? BLUE : CYAN }}>
            {view === 'space' ? 'inertial (space)' : 'rotating (ground)'}
          </strong>
        </span>
        <span>
          hemisphere = <strong className="text-accent-gold">{north ? 'Northern' : 'Southern'}</strong>
        </span>
        <span>
          apparent deflection = <strong style={{ color: CYAN }}>{deflectLabel}</strong>
        </span>
        <WidgetStatus className="ml-auto">t = {(prog * 100).toFixed(0)}%</WidgetStatus>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={play}
          disabled={playing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base disabled:opacity-50"
        >
          <Play size={12} /> Play
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>

        <div className="flex items-center gap-1 ml-1">
          <button
            onClick={() => setView('space')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              view === 'space' ? 'bg-accent-gold text-bg-base' : 'bg-bg-hover text-text-muted'
            }`}
          >
            Space view
          </button>
          <button
            onClick={() => setView('ground')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              view === 'ground' ? 'bg-accent-gold text-bg-base' : 'bg-bg-hover text-text-muted'
            }`}
          >
            Ground view
          </button>
        </div>

        <button
          onClick={() => setNorth(n => !n)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          Flip hemisphere → {north ? 'Southern' : 'Northern'}
        </button>
      </div>
    </div>
  )
}
