'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 280

const PINK = '#F472B6'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const GREEN = '#10B981'
const VIOLET = '#A78BFA'

// Blood osmolality set point and the narrow band the kidney holds it inside.
const SET_POINT = 290
const BAND_LO = 285
const BAND_HI = 295
const OSM_TOP = 305
const OSM_BOT = 275

// Gauge geometry.
const GX = 70
const GY_TOP = 44
const GY_BOT = 200
const yForOsm = (o: number) => GY_TOP + ((OSM_TOP - o) / (OSM_TOP - OSM_BOT)) * (GY_BOT - GY_TOP)

// Physiology as a function of hydration h ∈ [0,1] (0 = dehydrated, 1 = overhydrated).
// The kidney trades a huge swing in urine for a tiny swing in blood — negative feedback.
const bloodOsm = (h: number) => SET_POINT + (0.5 - h) * 8 // 294 → 286
const adhLevel = (h: number) => (1 - h) * 8 // pg/mL, 8 → 0
const urineOsm = (h: number) => 50 * Math.pow(24, 1 - h) // 1200 → 50 mOsm/kg
const urineFlow = (h: number) => 0.5 * Math.pow(36, h) // 0.5 → 18 L/day

const hex = (s: string): [number, number, number] => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
]
const lerpColor = (a: string, b: string, t: number) => {
  const [r0, g0, b0] = hex(a)
  const [r1, g1, b1] = hex(b)
  const m = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `rgb(${m(r0, r1)},${m(g0, g1)},${m(b0, b1)})`
}
// Urine tint: pale blue when dilute, deep gold when concentrated.
const urineColor = (h: number) => {
  const t = Math.max(0, Math.min(1, (urineOsm(h) - 50) / (1200 - 50)))
  return lerpColor('#9CC6F5', '#B8860B', t)
}

type Drop = { x: number; y: number; vy: number }

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  hydration: { default: 0.5, min: 0, max: 1, step: 0.01 },
}

export function ClearanceAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const dropsRef = useRef<Drop[]>([])
  const frameRef = useRef(0)
  const hRef = useRef(0.5)

  const { params, set, permalink, isDefault, restored } = useWidgetParams('clearance', SPEC)
  const { hydration } = params
  const [running, setRunning] = useState(false)
  useEffect(() => {
    hRef.current = hydration
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const h = hRef.current
    ctx.clearRect(0, 0, W, H)

    // ---- Blood osmolality gauge (the regulated variable) ----
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.fillText('blood osmolality', 24, 30)
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '9px monospace'
    ctx.fillText('(held steady)', 24, GY_BOT + 18)

    // Healthy band.
    ctx.fillStyle = `${GREEN}22`
    ctx.fillRect(GX - 18, yForOsm(BAND_HI), 36, yForOsm(BAND_LO) - yForOsm(BAND_HI))
    ctx.strokeStyle = `${GREEN}66`
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1
    for (const o of [BAND_LO, BAND_HI]) {
      ctx.beginPath()
      ctx.moveTo(GX - 18, yForOsm(o))
      ctx.lineTo(GX + 18, yForOsm(o))
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Gauge track and set point.
    ctx.strokeStyle = 'rgba(245,240,232,0.25)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(GX, GY_TOP)
    ctx.lineTo(GX, GY_BOT)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(245,240,232,0.3)'
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.moveTo(GX - 18, yForOsm(SET_POINT))
    ctx.lineTo(GX + 18, yForOsm(SET_POINT))
    ctx.stroke()
    ctx.setLineDash([])

    // Needle.
    const bo = bloodOsm(h)
    const ny = yForOsm(bo)
    ctx.strokeStyle = PINK
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(GX - 22, ny)
    ctx.lineTo(GX + 22, ny)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(GX + 22, ny, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = PINK
    ctx.fill()
    ctx.fillStyle = PINK
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`${bo.toFixed(0)}`, GX + 30, ny + 4)
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '8px monospace'
    ctx.textAlign = 'right'
    ctx.fillText('305', GX - 24, GY_TOP + 4)
    ctx.fillText('275', GX - 24, GY_BOT + 3)
    ctx.fillStyle = `${GREEN}cc`
    ctx.fillText('290', GX - 24, yForOsm(SET_POINT) + 3)

    // ---- Kidney + ADH (the controller) ----
    ctx.textAlign = 'center'
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.fillText('kidney', 250, 30)

    // ADH level bar.
    const adh = adhLevel(h)
    const barH = (adh / 8) * 120
    ctx.fillStyle = 'rgba(245,240,232,0.07)'
    ctx.fillRect(180, 50, 16, 120)
    ctx.fillStyle = VIOLET
    ctx.fillRect(180, 170 - barH, 16, barH)
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('ADH', 188, 184)
    ctx.fillStyle = VIOLET
    ctx.fillText(`${adh.toFixed(1)}`, 188, 44)

    // Water-reabsorption arrow (thicker = more water pulled back to blood).
    const reabW = 1 + (1 - h) * 10
    ctx.strokeStyle = BLUE
    ctx.lineWidth = reabW
    ctx.beginPath()
    ctx.moveTo(300, 150)
    ctx.lineTo(232, 110)
    ctx.stroke()
    ctx.fillStyle = BLUE
    ctx.beginPath()
    ctx.moveTo(232, 110)
    ctx.lineTo(246, 108)
    ctx.lineTo(242, 122)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = `${BLUE}cc`
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('water reabsorbed', 268, 138)

    // Kidney glyph.
    ctx.beginPath()
    ctx.ellipse(300, 118, 26, 34, 0, 0, Math.PI * 2)
    ctx.fillStyle = `${PINK}22`
    ctx.fill()
    ctx.strokeStyle = `${PINK}aa`
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(300, 118, 8, Math.PI * 0.3, Math.PI * 1.5)
    ctx.strokeStyle = `${PINK}77`
    ctx.lineWidth = 3
    ctx.stroke()

    // ---- Urine output (the manipulated variable) ----
    const uOsm = urineOsm(h)
    const uFlow = urineFlow(h)
    const col = urineColor(h)

    // Collecting duct → beaker.
    ctx.strokeStyle = 'rgba(245,240,232,0.3)'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(326, 118)
    ctx.lineTo(430, 118)
    ctx.lineTo(430, 150)
    ctx.stroke()

    // Beaker.
    const bx = 470
    const bw = 90
    const bTop = 150
    const bBot = 250
    ctx.strokeStyle = `${GOLD}88`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(bx, bTop)
    ctx.lineTo(bx + 8, bBot)
    ctx.lineTo(bx + bw - 8, bBot)
    ctx.lineTo(bx + bw, bTop)
    ctx.stroke()
    // Fill level ∝ log urine flow.
    const fillFrac = Math.max(0.08, Math.min(1, Math.log(uFlow / 0.5 + 1) / Math.log(37)))
    const fillY = bBot - (bBot - bTop - 6) * fillFrac
    ctx.fillStyle = col
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.moveTo(bx + 3 + (bTop < fillY ? (fillY - bTop) * 0.08 : 0), fillY)
    ctx.lineTo(bx + 8, bBot)
    ctx.lineTo(bx + bw - 8, bBot)
    ctx.lineTo(bx + bw - 3 - (fillY - bTop) * 0.08, fillY)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1

    // Falling droplets.
    for (const d of dropsRef.current) {
      ctx.beginPath()
      ctx.ellipse(d.x, d.y, 2.4, 3.6, 0, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
    }

    // Urine labels.
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('urine', bx + bw / 2, bTop - 8)
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = col
    ctx.fillText(`${uOsm.toFixed(0)} mOsm/kg`, bx + bw / 2, bBot + 16)
    ctx.fillStyle = GOLD
    ctx.fillText(`${uFlow.toFixed(1)} L/day`, bx + bw / 2, bBot + 30)

    // Feedback caption.
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(
      h < 0.5
        ? 'dehydrated → ADH high → reabsorb water → concentrated urine, blood held steady'
        : 'overhydrated → ADH low → dump water → dilute urine, blood held steady',
      W / 2,
      H - 8
    )
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) draw()
      else setRunning(true)
    },
  })

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      const h = hRef.current
      const flow = urineFlow(h)
      const interval = Math.max(3, Math.round(46 - (Math.log(flow / 0.5 + 1) / Math.log(37)) * 42))
      frameRef.current++
      if (frameRef.current % interval === 0) {
        dropsRef.current.push({ x: 430 + (Math.random() * 4 - 2), y: 150, vy: 2.2 })
      }
      for (const d of dropsRef.current) d.y += d.vy
      dropsRef.current = dropsRef.current.filter(d => d.y < 208)
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => {
    if (!running) draw()
  }, [hydration, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    set('hydration', 0.5)
    hRef.current = 0.5
    dropsRef.current = []
    frameRef.current = 0
    draw()
  }

  const stateLabel =
    hydration < 0.34 ? 'dehydrated' : hydration > 0.66 ? 'overhydrated' : 'balanced'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · A regulator, not a drain
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
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-pink text-bg-base text-xs font-medium hover:bg-accent-pink/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Dehydrated</span>
          <input
            type="range" min={SPEC.hydration.min} max={SPEC.hydration.max} step={SPEC.hydration.step} value={hydration}
            onChange={e => set('hydration', +e.target.value)}
            className="w-44 accent-accent-pink"
          />
          <span>Overhydrated</span>
        </label>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={{ color: PINK, borderColor: `${PINK}30`, background: `${PINK}10` }}
        >
          {stateLabel}
        </span>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          blood {bloodOsm(hydration).toFixed(0)} · urine {urineOsm(hydration).toFixed(0)} mOsm/kg · {urineFlow(hydration).toFixed(1)} L/day
        </span>
      </div>
    </div>
  )
}
