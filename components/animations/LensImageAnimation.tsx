'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 360
const LX = W / 2 // lens plane x
const AY = H * 0.52 // optical axis y
const SCALE = 26 // px per world unit
const F = 2.6 // focal length in world units
const HO = 2.0 // object height in world units

const GREEN = '#10B981' // field accent (object / image)
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const ORANGE = '#FB923C'
const MUTED = 'rgba(245,240,232,0.5)'

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

const DO_MIN = 1.2
const DO_MAX = 6.8
const DEFAULT_DO = 4.5

export function LensImageAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)

  const [doV, setDoV] = useState(DEFAULT_DO) // object distance (world units)
  const [running, setRunning] = useState(false)

  const doRef = useRef(DEFAULT_DO)
  useEffect(() => {
    doRef.current = doV
  }, [doV])

  // sweep direction for the auto animation
  const dirRef = useRef(-1)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dObj = doRef.current

    // thin-lens equation: 1/f = 1/do + 1/di
    const di = (F * dObj) / (dObj - F) // >0 real (right), <0 virtual (left), inf at f
    const mag = -di / dObj
    const real = dObj > F
    const nearlyAtF = Math.abs(dObj - F) < 0.06

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    // ---- optical axis ----
    ctx.strokeStyle = 'rgba(255,245,235,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, AY)
    ctx.lineTo(W, AY)
    ctx.stroke()

    // ---- lens (convex) ----
    ctx.strokeStyle = 'rgba(96,165,250,0.85)'
    ctx.fillStyle = 'rgba(96,165,250,0.10)'
    ctx.lineWidth = 2
    const lh = 96 // lens half height in px
    const bulge = 14
    ctx.beginPath()
    ctx.moveTo(LX, AY - lh)
    ctx.quadraticCurveTo(LX + bulge, AY, LX, AY + lh)
    ctx.quadraticCurveTo(LX - bulge, AY, LX, AY - lh)
    ctx.fill()
    ctx.stroke()

    // ---- focal points and 2F markers ----
    const marks: [number, string][] = [
      [LX - F * SCALE, 'F'],
      [LX + F * SCALE, "F'"],
      [LX - 2 * F * SCALE, '2F'],
      [LX + 2 * F * SCALE, "2F'"],
    ]
    ctx.font = '10px monospace'
    for (const [mx, label] of marks) {
      if (mx < 6 || mx > W - 6) continue
      ctx.fillStyle = GOLD
      ctx.beginPath()
      ctx.arc(mx, AY, 2.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = MUTED
      ctx.textAlign = 'center'
      ctx.fillText(label, mx, AY + 16)
    }
    ctx.textAlign = 'left'

    // ---- object arrow (upright, green) ----
    const oX = LX - dObj * SCALE
    const oTipY = AY - HO * SCALE
    const arrow = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      color: string,
      width: number
    ) => {
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      const up = y2 < y1 ? -1 : 1
      ctx.beginPath()
      ctx.moveTo(x2, y2)
      ctx.lineTo(x2 - 5, y2 + up * 8)
      ctx.lineTo(x2 + 5, y2 + up * 8)
      ctx.closePath()
      ctx.fill()
    }
    arrow(oX, AY, oX, oTipY, GREEN, 2.5)
    ctx.fillStyle = GREEN
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('object', oX, AY + 30)
    ctx.textAlign = 'left'

    // ---- three principal rays from object tip ----
    const line = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      color: string,
      dash: boolean,
      width = 1.4
    ) => {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.setLineDash(dash ? [4, 4] : [])
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // image geometry
    const iX = LX + di * SCALE
    const iTipY = AY - HO * mag * SCALE // mag<0 => below axis (inverted)

    if (nearlyAtF) {
      // rays emerge parallel — image at infinity
      // Ray A: parallel in, through F'
      line(oX, oTipY, LX, oTipY, BLUE, false)
      // Ray B: through center
      const slopeB = (AY - oTipY) / (LX - oX)
      line(oX, oTipY, W, AY + slopeB * (W - LX), ORANGE, false)
      // Ray A continues through F' out to the right
      const fpX = LX + F * SCALE
      const slopeA = (AY - oTipY) / (fpX - LX)
      line(LX, oTipY, W, oTipY + slopeA * (W - LX), BLUE, false)
      ctx.fillStyle = MUTED
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('object at F → rays parallel, image at infinity', W / 2, 24)
      ctx.textAlign = 'left'
    } else {
      // Ray A: parallel to axis, then bends through far focus F'
      line(oX, oTipY, LX, oTipY, BLUE, false)
      if (real) {
        line(LX, oTipY, iX, iTipY, BLUE, false)
        if (iX < W) {
          const s = (iTipY - oTipY) / (iX - LX)
          line(iX, iTipY, W, iTipY + s * (W - iX), BLUE, false)
        }
      } else {
        // virtual: real ray goes out to the right through F'; dashed back to image
        const fpX = LX + F * SCALE
        const sA = (AY - oTipY) / (fpX - LX)
        line(LX, oTipY, W, oTipY + sA * (W - LX), BLUE, false)
        line(LX, oTipY, iX, iTipY, BLUE, true) // back-extension
      }

      // Ray B: through lens center, undeviated
      const sB = (AY - oTipY) / (LX - oX)
      line(oX, oTipY, W, AY + sB * (W - oX), ORANGE, false)
      if (!real) line(oX, oTipY, iX, iTipY, ORANGE, true) // back-extension left

      // Ray C: through near focus F, then parallel to axis
      const nfX = LX - F * SCALE
      const sC = (AY - oTipY) / (nfX - oX)
      const yAtLensC = oTipY + sC * (LX - oX)
      line(oX, oTipY, LX, yAtLensC, GOLD, false)
      if (real) {
        line(LX, yAtLensC, W, yAtLensC, GOLD, false)
      } else {
        line(LX, yAtLensC, W, yAtLensC, GOLD, false)
        line(LX, yAtLensC, iX, iTipY, GOLD, true) // back-extension
      }

      // ---- image arrow ----
      if (iX > 4 && iX < W - 4) {
        const col = real ? '#F5F0E8' : 'rgba(16,185,129,0.85)'
        arrow(iX, AY, iX, iTipY, col, 2.5)
        ctx.fillStyle = col
        ctx.font = '11px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(
          real ? 'real image' : 'virtual image',
          iX,
          iTipY < AY ? iTipY - 10 : iTipY + 22
        )
        ctx.textAlign = 'left'
      }
    }

    // header status
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = real ? BLUE : GREEN
    if (!nearlyAtF) {
      ctx.fillText(
        real ? 'REAL · inverted' : 'VIRTUAL · upright · magnified',
        14,
        24
      )
    }
  }, [])

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
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
    draw()
  }, [draw])

  useEffect(() => {
    if (!running || !visible) return
    let last = 0
    const tick = (t: number) => {
      if (last === 0) last = t
      const dt = clamp((t - last) / 1000, 0, 0.05)
      last = t
      let next = doRef.current + dirRef.current * dt * 1.1
      if (next <= DO_MIN) {
        next = DO_MIN
        dirRef.current = 1
      } else if (next >= DO_MAX) {
        next = DO_MAX
        dirRef.current = -1
      }
      // skip a hair over exactly f to avoid the infinity singularity
      if (Math.abs(next - F) < 0.05) next = F + dirRef.current * 0.05
      doRef.current = next
      setDoV(next)
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw, visible])

  // redraw when slider changes while paused
  useEffect(() => {
    if (!running) draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doV])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    dirRef.current = -1
    doRef.current = DEFAULT_DO
    setDoV(DEFAULT_DO)
    draw()
  }

  // readout values
  const di = (F * doV) / (doV - F)
  const mag = -di / doV
  const real = doV > F
  const atF = Math.abs(doV - F) < 0.06

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Lens image formation
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: Lens image formation. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          d<sub>o</sub> = {doV.toFixed(2)}
        </span>
        <span>f = {F.toFixed(2)}</span>
        <span>d<sub>i</sub> = {atF ? '∞' : di.toFixed(2)}</span>
        <span style={{ color: real ? BLUE : GREEN }}>
          m = {atF ? '—' : mag.toFixed(2)}
        </span>
        <span style={{ color: real ? BLUE : GREEN }}>
          {atF ? 'at focal point' : real ? 'real · inverted' : 'virtual · upright'}
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

        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>object distance</span>
          <input
            type="range"
            min={DO_MIN}
            max={DO_MAX}
            step={0.05}
            value={doV}
            onChange={e => setDoV(+e.target.value)}
            className="w-40"
            style={{ accentColor: GREEN }}
          />
          <span className="text-text-secondary font-mono">{doV.toFixed(2)}</span>
        </label>

        <WidgetStatus className="text-xs text-text-muted">
          drag across <span style={{ color: GOLD }}>F</span> to flip the image
        </WidgetStatus>
      </div>
    </div>
  )
}
