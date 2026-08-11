'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const GREEN = '#10B981'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const RED = '#F87171'
const MUTED = 'rgba(245,240,232,0.4)'

const CX = 250
const CY = 150
const RINGS = [42, 74, 108, 144]

type Mode = 'wire' | 'coil'

// Shortest angular step from a to b.
function angleTo(a: number, b: number) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

export function CurrentFieldAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const phaseRef = useRef(0)
  const needleRef = useRef(0) // current compass needle angle (radians)

  const [mode, setMode] = useState<Mode>('wire')
  const [on, setOn] = useState(true)
  const [dir, setDir] = useState(1) // +1 or -1
  const [running, setRunning] = useState(false)

  const modeRef = useRef<Mode>('wire')
  const onRef = useRef(true)
  const dirRef = useRef(1)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  useEffect(() => {
    onRef.current = on
  }, [on])
  useEffect(() => {
    dirRef.current = dir
  }, [dir])

  // Target compass-needle angle for the current settings.
  const targetNeedle = useCallback(() => {
    if (!onRef.current) return -Math.PI / 2 // no current → points "north" (up) by default
    if (modeRef.current === 'wire') {
      // Compass sits to the right of the wire (angle 0 on the ring).
      // Field is counterclockwise for current out of page (dir=+1),
      // so the tangent there points up; reversed for dir=-1.
      return dirRef.current > 0 ? -Math.PI / 2 : Math.PI / 2
    }
    // Coil: axis field points right for dir=+1 (N on the right), left for dir=-1.
    return dirRef.current > 0 ? 0 : Math.PI
  }, [])

  const drawArrowHead = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    a: number,
    size: number,
    color: string
  ) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - size * Math.cos(a - 0.4), y - size * Math.sin(a - 0.4))
    ctx.lineTo(x - size * Math.cos(a + 0.4), y - size * Math.sin(a + 0.4))
    ctx.closePath()
    ctx.fill()
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const m = modeRef.current
    const isOn = onRef.current
    const d = dirRef.current
    const phase = phaseRef.current

    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    ctx.font = '11px monospace'

    if (m === 'wire') {
      // --- Concentric circular field lines around a wire ⟂ to the screen ---
      for (let i = 0; i < RINGS.length; i++) {
        const r = RINGS[i]
        ctx.strokeStyle = isOn ? 'rgba(96,165,250,0.5)' : 'rgba(96,165,250,0.12)'
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.arc(CX, CY, r, 0, Math.PI * 2)
        ctx.stroke()

        if (isOn) {
          // Direction markers travelling around each ring (CCW for d=+1).
          const nDots = 3
          for (let k = 0; k < nDots; k++) {
            const ang =
              (k / nDots) * Math.PI * 2 + d * (phase * 0.02 + i * 0.5)
            const x = CX + r * Math.cos(ang)
            const y = CY + r * Math.sin(ang)
            // tangent direction (CCW = angle + 90°, then flip for d)
            const ta = ang + (d > 0 ? Math.PI / 2 : -Math.PI / 2)
            drawArrowHead(ctx, x, y, ta, 7, BLUE)
          }
        }
      }

      // --- Wire symbol at the centre (dot = out of page, × = into page) ----
      ctx.fillStyle = '#0F0D0A'
      ctx.beginPath()
      ctx.arc(CX, CY, 15, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = isOn ? GOLD : MUTED
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(CX, CY, 15, 0, Math.PI * 2)
      ctx.stroke()
      if (isOn && d > 0) {
        ctx.fillStyle = GOLD
        ctx.beginPath()
        ctx.arc(CX, CY, 4, 0, Math.PI * 2)
        ctx.fill()
      } else if (isOn) {
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(CX - 6, CY - 6)
        ctx.lineTo(CX + 6, CY + 6)
        ctx.moveTo(CX + 6, CY - 6)
        ctx.lineTo(CX - 6, CY + 6)
        ctx.stroke()
      }
      ctx.fillStyle = isOn ? GOLD : MUTED
      ctx.font = '10px monospace'
      ctx.fillText(
        isOn ? (d > 0 ? 'current OUT of page ⊙' : 'current INTO page ⊗') : 'no current',
        CX - 60,
        CY + 40
      )
    } else {
      // --- Solenoid: loops add into a bar-magnet-like field ---------------
      const axisY = CY
      const x0 = 140
      const x1 = 360
      const loops = 6
      const loopGap = (x1 - x0) / (loops - 1)
      const rx = 12
      const ry = 40

      // Field lines: through the axis (interior) then looping back outside.
      if (isOn) {
        ctx.strokeStyle = 'rgba(96,165,250,0.5)'
        ctx.lineWidth = 1.4
        const outer = [0, 30, 60]
        for (const off of outer) {
          // external return loops (bar-magnet-like closed field lines)
          ctx.beginPath()
          ctx.ellipse((x0 + x1) / 2, axisY, (x1 - x0) / 2 + 10, 18 + off, 0, 0, Math.PI * 2)
          ctx.stroke()
        }
        // interior axis line
        ctx.strokeStyle = BLUE
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.moveTo(x0 - 4, axisY)
        ctx.lineTo(x1 + 4, axisY)
        ctx.stroke()

        // travelling markers along the interior axis (points toward N pole)
        const dirSign = d > 0 ? 1 : -1
        for (let k = 0; k < 4; k++) {
          const t = ((phase * 0.01 * dirSign + k / 4) % 1 + 1) % 1
          const x = x0 + t * (x1 - x0)
          drawArrowHead(ctx, x, axisY, dirSign > 0 ? 0 : Math.PI, 8, BLUE)
        }

        // N / S labels
        ctx.font = 'bold 14px monospace'
        const nRight = d > 0
        ctx.fillStyle = RED
        ctx.fillText('N', nRight ? x1 + 14 : x0 - 26, axisY + 5)
        ctx.fillStyle = BLUE
        ctx.fillText('S', nRight ? x0 - 24 : x1 + 14, axisY + 5)
      }

      // Draw the coil loops on top.
      for (let i = 0; i < loops; i++) {
        const x = x0 + i * loopGap
        ctx.strokeStyle = isOn ? GOLD : MUTED
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.ellipse(x, axisY, rx, ry, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.fillStyle = isOn ? GOLD : MUTED
      ctx.font = '10px monospace'
      ctx.fillText(isOn ? 'solenoid — loop fields add' : 'no current', x0 - 6, axisY + ry + 24)
    }

    // --- Compass ----------------------------------------------------------
    const compX = m === 'wire' ? CX + RINGS[0] : (140 + 360) / 2
    const compY = m === 'wire' ? CY : CY - 96
    ctx.strokeStyle = 'rgba(245,240,232,0.3)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(compX, compY, 18, 0, Math.PI * 2)
    ctx.stroke()
    const na = needleRef.current
    // north half (red) and south half (light)
    ctx.lineWidth = 3
    ctx.strokeStyle = RED
    ctx.beginPath()
    ctx.moveTo(compX, compY)
    ctx.lineTo(compX + 14 * Math.cos(na), compY + 14 * Math.sin(na))
    ctx.stroke()
    ctx.strokeStyle = 'rgba(245,240,232,0.7)'
    ctx.beginPath()
    ctx.moveTo(compX, compY)
    ctx.lineTo(compX - 14 * Math.cos(na), compY - 14 * Math.sin(na))
    ctx.stroke()
    ctx.fillStyle = MUTED
    ctx.font = '9px monospace'
    ctx.fillText('compass', compX - 20, compY + 30)

    // --- Right-hand-rule caption -----------------------------------------
    ctx.font = '11px monospace'
    ctx.fillStyle = isOn ? GREEN : MUTED
    ctx.fillText('Right-hand rule: thumb → current, fingers curl → B field', 24, H - 22)
    ctx.fillStyle = MUTED
    ctx.font = '10px monospace'
    ctx.fillText(isOn ? 'moving charge → magnetic field' : 'no current → no field', 24, H - 6)
  }, [])

  const step = useCallback(() => {
    if (onRef.current) phaseRef.current += 1
    // Ease the compass needle toward its target orientation.
    needleRef.current += angleTo(needleRef.current, targetNeedle()) * 0.15
  }, [targetNeedle])

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        needleRef.current = targetNeedle()
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    needleRef.current = targetNeedle()
    draw()
  }, [draw, targetNeedle])

  useEffect(() => {
    if (!running || !visible) return
    const tick = () => {
      step()
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw, visible])

  // Redraw immediately when settings change while paused.
  useEffect(() => {
    if (!running) draw()
  }, [mode, on, dir, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    setMode('wire')
    setOn(true)
    setDir(1)
    modeRef.current = 'wire'
    onRef.current = true
    dirRef.current = 1
    phaseRef.current = 0
    needleRef.current = -Math.PI / 2
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Moving charge makes a magnetic field
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
          aria-label="Animated diagram: Moving charge makes a magnetic field. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          conductor: <span style={{ color: GOLD }}>{mode === 'wire' ? 'straight wire' : 'coil (solenoid)'}</span>
        </span>
        <span>
          current: <span style={{ color: on ? GREEN : MUTED }}>{on ? (dir > 0 ? 'ON →' : 'ON ←') : 'OFF'}</span>
        </span>
        <span>
          field: <span className="text-accent-blue">{on ? 'present' : 'none'}</span>
        </span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            setOn(o => !o)
            if (!running) setRunning(true)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors text-bg-base"
          style={{ background: on ? GREEN : '#6B7280' }}
        >
          <Play size={12} /> {on ? 'Current ON' : 'Current OFF'}
        </button>
        <button
          onClick={() => {
            setDir(v => -v)
            if (!running) setRunning(true)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <RotateCcw size={12} /> Reverse current
        </button>
        <button
          onClick={() => {
            setMode(m => (m === 'wire' ? 'coil' : 'wire'))
            if (!running) setRunning(true)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary border border-border"
        >
          {mode === 'wire' ? 'Coil it into a solenoid' : 'Back to straight wire'}
        </button>
      </div>
    </div>
  )
}
