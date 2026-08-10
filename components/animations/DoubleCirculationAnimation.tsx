'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const VW = 600
const VH = 420
const LOOP_SEC = 9 // seconds for a blood cell to make one full figure-eight
const N_CELLS = 14

const DARK = '#8B1A1A' // oxygen-poor blood (dark maroon red)
const BRIGHT = '#EF4444' // oxygen-rich blood (bright red)
const PINK = '#F472B6' // field accent
const FAINT = 'rgba(245,240,232,0.14)'

const CX = VW / 2
const MID = VH / 2 // crossing point of the figure-eight = the heart
const R = 128 // radius of each loop
const TC_Y = MID - R // top loop (pulmonary / lungs) centre y
const BC_Y = MID + R // bottom loop (systemic / body) centre y

// Position along the whole figure-eight for t in [0,1).
// t<0.5 -> top loop (to/from lungs); t>=0.5 -> bottom loop (to/from body).
// Both loops pass through the heart at (CX, MID).
function posAt(t: number): { x: number; y: number } {
  if (t < 0.5) {
    const u = t / 0.5
    const a = Math.PI / 2 + 2 * Math.PI * u // starts at bottom of top circle = heart
    return { x: CX + R * Math.cos(a), y: TC_Y + R * Math.sin(a) }
  }
  const u = (t - 0.5) / 0.5
  const a = -Math.PI / 2 + 2 * Math.PI * u // starts at top of bottom circle = heart
  return { x: CX + R * Math.cos(a), y: BC_Y + R * Math.sin(a) }
}

// Blood is bright (oxygen-rich) between the lungs and the body tissues,
// i.e. from just after the lungs (t~0.25) until the body (t~0.75).
function colorAt(t: number): string {
  const bright = t > 0.25 && t < 0.75
  // smooth transition bands around the lungs (0.25) and body (0.75)
  return bright ? BRIGHT : DARK
}

// Which segment a cell at t is travelling through.
function segAt(t: number): string {
  if (t < 0.25) return 'Pulmonary circuit · right heart → lungs (O2-poor)'
  if (t < 0.5) return 'Pulmonary circuit · lungs → left heart (O2-rich)'
  if (t < 0.75) return 'Systemic circuit · left heart → body (O2-rich)'
  return 'Systemic circuit · body → right heart (O2-poor)'
}

function drawPathLoop(ctx: CanvasRenderingContext2D, top: boolean) {
  ctx.beginPath()
  const cy = top ? TC_Y : BC_Y
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI
    const x = CX + R * Math.cos(a)
    const y = cy + R * Math.sin(a)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function organ(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, sub: string) {
  roundRectPath(ctx, x - w / 2, y - h / 2, w, h, 12)
  ctx.fillStyle = 'rgba(245,240,232,0.06)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(245,240,232,0.3)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = 'rgba(245,240,232,0.9)'
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(label, x, y - 1)
  ctx.fillStyle = 'rgba(245,240,232,0.55)'
  ctx.font = '10px ui-monospace, monospace'
  ctx.fillText(sub, x, y + 14)
}

export function DoubleCirculationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [running, setRunning] = useState(false)
  const [reducedStatic, setReducedStatic] = useState(false)
  const [seg, setSeg] = useState(() => segAt(0))
  const tRef = useRef(0)
  const rafRef = useRef(0)

  const draw = useCallback((base: number) => {
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

    // ---- figure-eight guide paths ----
    ctx.lineWidth = 2
    ctx.strokeStyle = FAINT
    drawPathLoop(ctx, true)
    drawPathLoop(ctx, false)

    // ---- lungs (top) and body (bottom) ----
    organ(ctx, CX, TC_Y - R, 150, 46, 'LUNGS', 'pick up O2')
    organ(ctx, CX, BC_Y + R, 150, 46, 'BODY', 'drop off O2')

    // ---- the heart at the crossing: two pumps kept separate ----
    const hw = 96
    const hh = 84
    // right pump (to lungs) — dark; left pump (to body) — bright
    roundRectPath(ctx, CX - hw / 2, MID - hh / 2, hw / 2, hh, 8)
    ctx.fillStyle = 'rgba(139,26,26,0.35)'
    ctx.fill()
    roundRectPath(ctx, CX, MID - hh / 2, hw / 2, hh, 8)
    ctx.fillStyle = 'rgba(239,68,68,0.30)'
    ctx.fill()
    // thicker left-pump wall
    ctx.strokeStyle = 'rgba(245,240,232,0.3)'
    ctx.lineWidth = 1.5
    roundRectPath(ctx, CX - hw / 2, MID - hh / 2, hw / 2, hh, 8)
    ctx.stroke()
    ctx.lineWidth = 5
    ctx.strokeStyle = PINK
    roundRectPath(ctx, CX, MID - hh / 2, hw / 2, hh, 8)
    ctx.stroke()
    // septum
    ctx.strokeStyle = 'rgba(245,240,232,0.5)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(CX, MID - hh / 2); ctx.lineTo(CX, MID + hh / 2); ctx.stroke()
    // labels
    ctx.fillStyle = 'rgba(245,240,232,0.9)'
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('RIGHT', CX - hw / 4, MID - 6)
    ctx.fillText('LEFT', CX + hw / 4, MID - 6)
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.font = '9px ui-monospace, monospace'
    ctx.fillText('to lungs', CX - hw / 4, MID + 9)
    ctx.fillText('to body', CX + hw / 4, MID + 9)
    ctx.fillStyle = PINK
    ctx.font = '9px ui-monospace, monospace'
    ctx.fillText('thicker wall', CX + hw / 4, MID + hh / 2 + 14)

    // side labels for the two circuits
    ctx.save()
    ctx.fillStyle = 'rgba(96,165,250,0.8)'
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('PULMONARY CIRCUIT', 14, 20)
    ctx.fillStyle = PINK
    ctx.fillText('SYSTEMIC CIRCUIT', 14, VH - 12)
    ctx.restore()

    // ---- blood cells flowing the full path ----
    for (let i = 0; i < N_CELLS; i++) {
      const t = (base + i / N_CELLS) % 1
      const p = posAt(t)
      const c = colorAt(t)
      ctx.beginPath()
      ctx.arc(p.x, p.y, 5.5, 0, 2 * Math.PI)
      ctx.fillStyle = c
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.stroke()
    }

    setSeg(segAt(base % 1))
  }, [])

  // animation loop
  useEffect(() => {
    if (!running || reducedStatic) return
    let last = performance.now()
    const step = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      tRef.current = (tRef.current + dt / LOOP_SEC) % 1
      draw(tRef.current)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, reducedStatic, draw])

  // static (reduced-motion) frame
  useEffect(() => {
    if (!reducedStatic) return
    tRef.current = 0.12
    draw(0.12)
  }, [reducedStatic, draw])

  // keep a frame painted while paused
  useEffect(() => {
    if (running || reducedStatic) return
    draw(tRef.current)
  }, [running, reducedStatic, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setReducedStatic(true); return }
      setRunning(true)
    },
  })

  const reset = () => {
    triggerReset()
    setRunning(false)
    setReducedStatic(false)
    tRef.current = 0
    draw(0)
  }

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Double circulation (figure-eight)
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
        <span>lead cell: <span style={{ color: PINK }}>{seg}</span></span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { setReducedStatic(false); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <span className="text-xs text-text-muted">
          Right heart → lungs · Left heart → body · streams stay separate
        </span>
      </div>
    </div>
  )
}
