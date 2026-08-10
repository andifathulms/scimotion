'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const VW = 600
const VH = 380
const CYCLE_SEC = 0.9 // seconds per heartbeat (~67 bpm)

const DARK = '#8B1A1A' // oxygen-poor blood (dark maroon red)
const BRIGHT = '#EF4444' // oxygen-rich blood (bright red)
const PINK = '#F472B6' // field accent
const WALL = 'rgba(245,240,232,0.35)'
const OPEN = '#34D399' // valve open
const SHUT = 'rgba(245,240,232,0.25)' // valve closed

type Phase = {
  name: string
  half: 'Diastole' | 'Systole'
  av: 'open' | 'closed'
  sl: 'open' | 'closed'
  sound: string
}

// The cardiac cycle as a function of normalized phase p in [0,1).
// AV valves close at p=0.48 -> "lub"; semilunar valves close at p=0.80 -> "dub".
function phaseAt(p: number): Phase {
  if (p < 0.4) return { name: 'Ventricular filling', half: 'Diastole', av: 'open', sl: 'closed', sound: '—' }
  if (p < 0.48) return { name: 'Atrial systole', half: 'Diastole', av: 'open', sl: 'closed', sound: '—' }
  if (p < 0.52) return { name: 'Isovolumetric contraction', half: 'Systole', av: 'closed', sl: 'closed', sound: '"lub" (S1)' }
  if (p < 0.8) return { name: 'Ventricular ejection', half: 'Systole', av: 'closed', sl: 'open', sound: '—' }
  if (p < 0.86) return { name: 'Isovolumetric relaxation', half: 'Diastole', av: 'closed', sl: 'closed', sound: '"dub" (S2)' }
  return { name: 'Ventricular filling', half: 'Diastole', av: 'open', sl: 'closed', sound: '—' }
}

// smoothstep interpolation between a and b as t goes 0..1
function lerpS(a: number, b: number, t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t
  const s = c * c * (3 - 2 * c)
  return a + (b - a) * s
}

// fraction of a ventricle that is full of blood over the cycle
function ventFrac(p: number): number {
  if (p < 0.4) return lerpS(0.32, 0.9, p / 0.4)
  if (p < 0.48) return lerpS(0.9, 1, (p - 0.4) / 0.08)
  if (p < 0.52) return 1
  if (p < 0.8) return lerpS(1, 0.32, (p - 0.52) / 0.28)
  return 0.32
}

// fraction of an atrium that is full of blood over the cycle
function atriaFrac(p: number): number {
  if (p < 0.4) return lerpS(0.72, 0.34, p / 0.4)
  if (p < 0.48) return lerpS(0.34, 0.12, (p - 0.4) / 0.08)
  if (p < 0.8) return lerpS(0.12, 0.72, (p - 0.48) / 0.32)
  return 0.72
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

// A chamber: rounded box, filled with blood from the bottom to `frac`.
function chamber(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  frac: number, color: string, wallW: number, label: string,
) {
  ctx.save()
  roundRectPath(ctx, x, y, w, h, 12)
  ctx.clip()
  ctx.fillStyle = 'rgba(245,240,232,0.04)'
  ctx.fillRect(x, y, w, h)
  const bh = h * frac
  ctx.fillStyle = color
  ctx.fillRect(x, y + h - bh, w, bh)
  ctx.restore()
  roundRectPath(ctx, x, y, w, h, 12)
  ctx.lineWidth = wallW
  ctx.strokeStyle = WALL
  ctx.stroke()
  ctx.fillStyle = 'rgba(245,240,232,0.85)'
  ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(label, x + w / 2, y + h / 2 + 4)
}

// A valve drawn as two flaps: open -> pointing along flow; closed -> meeting flat.
function valve(ctx: CanvasRenderingContext2D, cx: number, cy: number, open: boolean, vertical: boolean) {
  ctx.strokeStyle = open ? OPEN : SHUT
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  const s = 11
  ctx.beginPath()
  if (vertical) {
    // flow is vertical (AV or semilunar). open: flaps splayed open; closed: flat line
    if (open) {
      ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx - s * 0.4, cy + s)
      ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx + s * 0.4, cy + s)
    } else {
      ctx.moveTo(cx - s, cy); ctx.lineTo(cx, cy + s * 0.5)
      ctx.moveTo(cx + s, cy); ctx.lineTo(cx, cy + s * 0.5)
    }
  }
  ctx.stroke()
}

function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  const ang = Math.atan2(y2 - y1, x2 - x1)
  const a = 6
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - a * Math.cos(ang - 0.5), y2 - a * Math.sin(ang - 0.5))
  ctx.lineTo(x2 - a * Math.cos(ang + 0.5), y2 - a * Math.sin(ang + 0.5))
  ctx.closePath(); ctx.fill()
}

function vesselStub(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string, label: string) {
  roundRectPath(ctx, x, y, w, 26, 8)
  ctx.fillStyle = color
  ctx.fill()
  ctx.fillStyle = 'rgba(245,240,232,0.6)'
  ctx.font = '10px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText(label, x + w / 2, y - 5)
}

export function CardiacCycleAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [running, setRunning] = useState(false)
  const [reducedStatic, setReducedStatic] = useState(false)
  const [phase, setPhase] = useState<Phase>(() => phaseAt(0))
  const pRef = useRef(0)
  const rafRef = useRef(0)

  const draw = useCallback((p: number) => {
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

    const info = phaseAt(p)
    const vf = ventFrac(p)
    const af = atriaFrac(p)

    // ---- vessels (drawn behind chambers) ----
    // right side carries oxygen-poor (dark) blood: vena cava in, pulmonary artery out
    vesselStub(ctx, 120, 34, 46, DARK, 'from body')
    vesselStub(ctx, 232, 34, 46, DARK, 'to lungs')
    // left side carries oxygen-rich (bright) blood: pulmonary veins in, aorta out
    vesselStub(ctx, 336, 34, 46, BRIGHT, 'from lungs')
    vesselStub(ctx, 440, 34, 46, BRIGHT, 'to body')

    // septum dividing the two pumps
    ctx.strokeStyle = 'rgba(245,240,232,0.15)'
    ctx.setLineDash([6, 6])
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(VW / 2, 70); ctx.lineTo(VW / 2, VH - 20); ctx.stroke()
    ctx.setLineDash([])

    // ---- chambers ----
    // Heart's own RIGHT side is on the viewer's LEFT.
    // Right atrium / right ventricle (oxygen-poor, dark). Thin ventricle wall.
    chamber(ctx, 150, 96, 108, 78, af, DARK, 3, 'Right atrium')
    chamber(ctx, 150, 210, 118, 128, vf, DARK, 3, 'Right ventricle')
    // Left atrium / left ventricle (oxygen-rich, bright). THICK left ventricle wall.
    chamber(ctx, 342, 96, 108, 78, af, BRIGHT, 3, 'Left atrium')
    chamber(ctx, 332, 210, 118, 128, vf, BRIGHT, 9, 'Left ventricle')

    // thick-wall callout
    ctx.fillStyle = PINK
    ctx.font = '10px ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.fillText('thick wall', 456, 276)

    // ---- valves ----
    // AV valves between atria and ventricles
    valve(ctx, 204, 192, info.av === 'open', true)
    valve(ctx, 396, 192, info.av === 'open', true)
    // semilunar valves at ventricle exits (top of ventricle -> artery)
    valve(ctx, 250, 200, info.sl === 'open', true)
    valve(ctx, 452, 200, info.sl === 'open', true)

    // ---- flow arrows for the current action ----
    if (info.av === 'open') {
      // filling: atria -> ventricles
      arrow(ctx, 204, 178, 204, 214, PINK)
      arrow(ctx, 396, 178, 396, 214, PINK)
    }
    if (info.sl === 'open') {
      // ejection: ventricles -> arteries
      arrow(ctx, 250, 208, 250, 62, PINK)
      arrow(ctx, 452, 208, 452, 62, PINK)
    }

    // ---- phase banner ----
    ctx.textAlign = 'left'
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = info.half === 'Systole' ? PINK : '#60A5FA'
    ctx.fillText(info.half.toUpperCase(), 20, VH - 18)
    ctx.fillStyle = 'rgba(245,240,232,0.7)'
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText('· ' + info.name, 105, VH - 18)
    if (info.sound !== '—') {
      ctx.fillStyle = PINK
      ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(info.sound, VW - 20, VH - 18)
    }

    setPhase(info)
  }, [])

  // animation loop
  useEffect(() => {
    if (!running || reducedStatic) return
    let last = performance.now()
    const step = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      pRef.current = (pRef.current + dt / CYCLE_SEC) % 1
      draw(pRef.current)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, reducedStatic, draw])

  // static (reduced-motion) frame: mid-ejection, both heart sounds already implied
  useEffect(() => {
    if (!reducedStatic) return
    pRef.current = 0.62
    draw(0.62)
  }, [reducedStatic, draw])

  // keep a frame painted while paused
  useEffect(() => {
    if (running || reducedStatic) return
    draw(pRef.current)
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
    pRef.current = 0
    draw(0)
  }

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · The cardiac cycle
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
          role="img"
          aria-label="Animated diagram: The cardiac cycle. Values are reported below the diagram."
          ref={canvasRef}
          width={VW}
          height={VH}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          phase:{' '}
          <span style={{ color: phase.half === 'Systole' ? PINK : '#60A5FA' }}>{phase.name}</span>
        </span>
        <span>AV valves: {phase.av}</span>
        <span>semilunar: {phase.sl}</span>
        <span>sound: {phase.sound}</span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { setReducedStatic(false); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <span className="text-xs text-text-muted">
          Right side (dark) → lungs · Left side (bright) → body
        </span>
      </div>
    </div>
  )
}
