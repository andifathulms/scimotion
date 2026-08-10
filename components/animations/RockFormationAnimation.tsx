'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'

// Panel geometry (three routes to rock, side by side).
const PW = 184
const PANEL_X = [12, 208, 404]
const AY = 54
const AH = 214
const PAD = 7

const PROG_STEP = 1 / 150 // fills in ~2.5 s at 60 fps

// --- deterministic layouts (client-only widget, ssr:false) ------------------
const IGNEOUS_SEEDS = Array.from({ length: 64 }, () => ({
  u: Math.random(),
  v: Math.random(),
  rot: Math.random() * Math.PI,
  tone: Math.random(),
}))

const META_GRAINS = Array.from({ length: 56 }, () => ({
  u: 0.08 + Math.random() * 0.84,
  v: 0.08 + Math.random() * 0.84,
  angle0: (Math.random() - 0.5) * Math.PI, // random initial orientation
  len: 7 + Math.random() * 6,
}))

const FALLING = Array.from({ length: 16 }, () => ({
  u: 0.1 + Math.random() * 0.8,
  phase: Math.random(),
  tone: Math.random(),
}))

const LAYER_TONES = [
  'rgba(96,165,250,0.22)',
  'rgba(245,158,11,0.20)',
  'rgba(120,140,160,0.20)',
  'rgba(96,165,250,0.16)',
  'rgba(245,158,11,0.24)',
  'rgba(120,140,160,0.16)',
  'rgba(96,165,250,0.22)',
]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function hexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * Math.PI * 2
    const x = cx + r * Math.cos(a)
    const y = cy + r * Math.sin(a)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function arrowIn(ctx: CanvasRenderingContext2D, x1: number, y: number, x2: number, color: string) {
  const dir = x2 > x1 ? 1 : -1
  ctx.strokeStyle = color
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(x1, y)
  ctx.lineTo(x2, y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x2, y)
  ctx.lineTo(x2 - dir * 5, y - 4)
  ctx.lineTo(x2 - dir * 5, y + 4)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function panelFrame(ctx: CanvasRenderingContext2D, x0: number, title: string, sub: string, color: string) {
  ctx.strokeStyle = 'rgba(255,245,235,0.10)'
  ctx.lineWidth = 1
  ctx.strokeRect(x0 + 0.5, AY - 0.5, PW - 1, AH + 1)
  ctx.textAlign = 'center'
  ctx.font = '10px monospace'
  ctx.fillStyle = color
  ctx.fillText(title, x0 + PW / 2, 22)
  ctx.font = '7px monospace'
  ctx.fillStyle = 'rgba(245,240,232,0.42)'
  ctx.fillText(sub, x0 + PW / 2, 36)
}

function nucleiCount(rate: number): number {
  return Math.round(4 + ((rate - 1) / 9) * 56)
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  rate: { default: 3, min: 1, max: 10, step: 1 },
}

export function RockFormationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const lastRef = useRef<number | null>(null)

  const progressRef = useRef(0)
  const rateRef = useRef(3)
  const runningRef = useRef(false)

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('rock-formation', SPEC)
  const { rate } = params
  const [pct, setPct] = useState(0)

  const drawIgneous = useCallback((ctx: CanvasRenderingContext2D, p: number) => {
    const x0 = PANEL_X[0]
    const ax = x0 + PAD
    const aw = PW - 2 * PAD
    const N = nucleiCount(rateRef.current)
    const targetR = Math.sqrt((aw * AH) / (N * Math.PI)) * 1.28
    const r = targetR * Math.min(1, p * 1.3)

    ctx.save()
    ctx.beginPath()
    ctx.rect(ax, AY + PAD, aw, AH - 2 * PAD)
    ctx.clip()
    // molten backdrop, fading as it crystallises
    ctx.fillStyle = `rgba(245,158,11,${0.12 * (1 - p)})`
    ctx.fillRect(ax, AY, aw, AH)
    for (let i = 0; i < N; i++) {
      const s = IGNEOUS_SEEDS[i]
      const cx = ax + s.u * aw
      const cy = AY + PAD + s.v * (AH - 2 * PAD)
      hexagon(ctx, cx, cy, r, s.rot)
      ctx.fillStyle = `rgba(34,211,238,${0.16 + s.tone * 0.2})`
      ctx.fill()
      ctx.strokeStyle = `${CYAN}77`
      ctx.lineWidth = 0.8
      ctx.stroke()
    }
    ctx.restore()

    ctx.textAlign = 'center'
    ctx.font = '8px monospace'
    ctx.fillStyle = CYAN
    ctx.fillText(
      `${N} crystals · ${N <= 16 ? 'coarse (granite)' : 'fine (basalt)'}`,
      x0 + PW / 2,
      AY + AH - 8
    )
  }, [])

  const drawSedimentary = useCallback((ctx: CanvasRenderingContext2D, p: number) => {
    const x0 = PANEL_X[1]
    const ax = x0 + PAD
    const aw = PW - 2 * PAD
    const ah = AH - 2 * PAD
    const top = AY + PAD
    const bottom = top + ah
    const filledH = ah * p
    const topY = bottom - filledH
    const nL = 7
    const layerH = ah / nL

    ctx.save()
    ctx.beginPath()
    ctx.rect(ax, topY, aw, filledH)
    ctx.clip()
    for (let i = 0; i < nL; i++) {
      const ly = bottom - (i + 1) * layerH
      ctx.fillStyle = LAYER_TONES[i]
      ctx.fillRect(ax, ly, aw, layerH)
      ctx.strokeStyle = 'rgba(245,240,232,0.12)'
      ctx.lineWidth = 0.75
      ctx.beginPath()
      ctx.moveTo(ax, ly)
      ctx.lineTo(ax + aw, ly)
      ctx.stroke()
    }
    // fossil buried in the third layer up
    const fx = ax + aw * 0.5
    const fy = bottom - 2.5 * layerH
    if (topY <= fy) {
      ctx.strokeStyle = `${GOLD}CC`
      ctx.lineWidth = 1.3
      ctx.beginPath()
      for (let k = 0; k <= 40; k++) {
        const a = k / 40
        const ang = a * Math.PI * 3.2
        const rad = 1 + a * 8
        const x = fx + rad * Math.cos(ang)
        const y = fy + rad * Math.sin(ang)
        if (k === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.restore()

    // falling grains above the current deposition surface
    for (const g of FALLING) {
      const gx = ax + g.u * aw
      const cyc = (p * 3 + g.phase) % 1
      const gy = top + cyc * (topY - top)
      if (gy < topY - 1 && gy > top) {
        ctx.beginPath()
        ctx.arc(gx, gy, 1.6, 0, Math.PI * 2)
        ctx.fillStyle = g.tone > 0.5 ? `${BLUE}CC` : `${GOLD}CC`
        ctx.fill()
      }
    }

    ctx.strokeStyle = 'rgba(245,240,232,0.18)'
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(ax, topY)
    ctx.lineTo(ax + aw, topY)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.textAlign = 'center'
    ctx.font = '8px monospace'
    ctx.fillStyle = BLUE
    ctx.fillText('layers + fossils', x0 + PW / 2, AY + AH - 8)
  }, [])

  const drawMetamorphic = useCallback((ctx: CanvasRenderingContext2D, p: number) => {
    const x0 = PANEL_X[2]
    const ax = x0 + PAD
    const aw = PW - 2 * PAD
    const ah = AH - 2 * PAD
    const top = AY + PAD

    ctx.save()
    ctx.beginPath()
    ctx.rect(ax, top, aw, ah)
    ctx.clip()
    // foliation bands strengthen with pressure
    const nB = 6
    for (let i = 0; i < nB; i++) {
      ctx.fillStyle = `rgba(167,139,250,${0.05 + 0.08 * p * (i % 2)})`
      ctx.fillRect(ax, top + (i / nB) * ah, aw, ah / nB)
    }
    for (const g of META_GRAINS) {
      const cx = ax + g.u * aw
      const cy = top + g.v * ah
      const angle = lerp(g.angle0, 0, p) // align toward horizontal foliation
      const len = g.len * (1 + 0.5 * p) // grains recrystallise larger
      const dx = Math.cos(angle) * len
      const dy = Math.sin(angle) * len
      ctx.strokeStyle = `rgba(167,139,250,${0.55 + 0.35 * p})`
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(cx - dx / 2, cy - dy / 2)
      ctx.lineTo(cx + dx / 2, cy + dy / 2)
      ctx.stroke()
    }
    ctx.lineCap = 'butt'
    ctx.restore()

    // squeeze arrows creeping inward as pressure rises
    const off = 6 + p * 10
    const midY = top + ah / 2
    arrowIn(ctx, ax - 4, midY - 22, ax + off, VIOLET)
    arrowIn(ctx, ax + aw + 4, midY + 22, ax + aw - off, VIOLET)

    ctx.textAlign = 'center'
    ctx.font = '8px monospace'
    ctx.fillStyle = VIOLET
    ctx.fillText('realigned · never melted', x0 + PW / 2, AY + AH - 8)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const p = progressRef.current

    ctx.clearRect(0, 0, W, H)
    panelFrame(ctx, PANEL_X[0], 'IGNEOUS', 'cool a melt → crystals', CYAN)
    panelFrame(ctx, PANEL_X[1], 'SEDIMENTARY', 'deposit + compact grains', BLUE)
    panelFrame(ctx, PANEL_X[2], 'METAMORPHIC', 'heat + pressure, solid', VIOLET)

    drawIgneous(ctx, p)
    drawSedimentary(ctx, p)
    drawMetamorphic(ctx, p)
  }, [drawIgneous, drawSedimentary, drawMetamorphic])

  const ensureLoop = useCallback(() => {
    if (rafRef.current) return
    const loop = (t: number) => {
      if (lastRef.current === null) lastRef.current = t
      const dt = Math.min(64, t - lastRef.current)
      lastRef.current = t
      const steps = dt / 16.7
      progressRef.current = Math.min(1, progressRef.current + PROG_STEP * steps)
      setPct(Math.round(progressRef.current * 100))
      draw()
      if (progressRef.current >= 1 || !runningRef.current) {
        runningRef.current = false
        setRunning(false)
        rafRef.current = 0
        lastRef.current = null
        return
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        progressRef.current = 1
        setPct(100)
        draw()
        return
      }
      progressRef.current = 0
      runningRef.current = true
      setRunning(true)
      lastRef.current = null
      ensureLoop()
    },
  })

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const play = () => {
    if (runningRef.current) {
      runningRef.current = false
      setRunning(false)
      return
    }
    if (progressRef.current >= 1) progressRef.current = 0
    runningRef.current = true
    setRunning(true)
    lastRef.current = null
    ensureLoop()
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    lastRef.current = null
    runningRef.current = false
    setRunning(false)
    progressRef.current = 0
    setPct(0)
    triggerReset()
    draw()
  }

  const onRate = (v: number) => {
    rateRef.current = v
    set('rate', v)
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Three routes to rock, side by side
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
          aria-label="Animated diagram: Three routes to rock, side by side. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={play}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Form
            </>
          )}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Igneous cooling rate:</span>
          <span className="text-text-secondary">slow</span>
          <input
            type="range"
            min={SPEC.rate.min}
            max={SPEC.rate.max}
            step={SPEC.rate.step}
            value={rate}
            onChange={e => onRate(+e.target.value)}
            className="w-24 accent-accent-gold"
          />
          <span className="text-text-secondary">fast</span>
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary font-mono">
          {nucleiCount(rate)} crystals · {pct}% formed
        </WidgetStatus>
      </div>
    </div>
  )
}
