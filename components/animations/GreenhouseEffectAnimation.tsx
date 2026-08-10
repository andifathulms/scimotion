'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 330

// Published values.
const S0 = 1361            // solar constant, W/m^2 (TSI, ~1361 per SORCE/TIM)
const ALBEDO = 0.30        // Earth's Bond albedo, ~0.29-0.30
const SIGMA = 5.670374419e-8 // Stefan-Boltzmann constant, W m^-2 K^-4

const F_TOA = S0 / 4                   // 340.25 W/m^2 spread over the whole globe
const F_REFL = F_TOA * ALBEDO          // 102.1
const F_ABS = F_TOA * (1 - ALBEDO)     // 238.2
const T_EFF = Math.pow(F_ABS / SIGMA, 0.25) // 254.6 K — the bare-rock number

// Single slab, transparent to sunlight, longwave emissivity eps.
// Slab energy balance gives sigma*Ta^4 = sigma*Ts^4 / 2, so the top-of-atmosphere
// budget reads F_abs = sigma*Ts^4 * (1 - eps/2).
const eqTemp = (eps: number) => T_EFF / Math.pow(1 - eps / 2, 0.25)

const EPS_TODAY = 0.78     // the value that reproduces the observed ~288 K surface

const TOA_Y = 44
const ATM_TOP = 130
const ATM_BOT = 178
const SURF_Y = 274

const wOf = (f: number) => Math.max(1.5, Math.min(26, f * 0.062))

type Dir = 1 | -1

function drawFlux(
  ctx: CanvasRenderingContext2D,
  x: number, yFrom: number, yTo: number,
  w: number, color: string, phase: number
) {
  const dir: Dir = yTo > yFrom ? 1 : -1
  const head = 13
  const tipY = yTo
  const bodyEnd = yTo - dir * head
  const top = Math.min(yFrom, bodyEnd)
  const bot = Math.max(yFrom, bodyEnd)

  ctx.save()
  ctx.fillStyle = color
  ctx.globalAlpha = 0.28
  ctx.fillRect(x - w / 2, top, w, Math.max(0, bot - top))

  // Moving stripes read as flow direction without a library.
  ctx.beginPath()
  ctx.rect(x - w / 2, top, w, Math.max(0, bot - top))
  ctx.clip()
  ctx.globalAlpha = 0.5
  const span = bot - top
  for (let s = -18; s < span + 18; s += 18) {
    const y = dir > 0 ? top + ((s + phase) % (span + 36)) : bot - ((s + phase) % (span + 36))
    ctx.fillRect(x - w / 2, y, w, 5)
  }
  ctx.restore()

  ctx.fillStyle = color
  ctx.globalAlpha = 0.9
  ctx.beginPath()
  ctx.moveTo(x, tipY)
  ctx.lineTo(x - w / 2 - 4, tipY - dir * head)
  ctx.lineTo(x + w / 2 + 4, tipY - dir * head)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = 1
}

export function GreenhouseEffectAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tsRef = useRef(eqTemp(EPS_TODAY))
  const phaseRef = useRef(0)
  const epsRef = useRef(EPS_TODAY)

  const [eps, setEps] = useState(EPS_TODAY)
  const [running, setRunning] = useState(false)
  const [readout, setReadout] = useState({ ts: eqTemp(EPS_TODAY), imb: 0 })

  useEffect(() => { epsRef.current = eps }, [eps])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        tsRef.current = eqTemp(epsRef.current)
        setReadout({ ts: tsRef.current, imb: 0 })
        return
      }
      // Start from the airless equilibrium so the 33 K climb is visible.
      tsRef.current = T_EFF
      setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const e = epsRef.current
    const ts = tsRef.current
    const phase = phaseRef.current

    const surfUp = SIGMA * ts * ts * ts * ts
    const winFlux = (1 - e) * surfUp        // straight to space through the IR window
    const layerUp = (e * surfUp) / 2       // slab emission upward
    const back = (e * surfUp) / 2          // slab emission downward
    const outTop = winFlux + layerUp
    const imb = F_ABS - outTop

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'

    // ---- scene ----
    ctx.fillStyle = 'rgba(34,211,238,0.05)'
    ctx.fillRect(0, ATM_TOP, W, ATM_BOT - ATM_TOP)
    ctx.fillStyle = `rgba(34,211,238,${(0.06 + 0.3 * e).toFixed(3)})`
    ctx.fillRect(0, ATM_TOP, W, ATM_BOT - ATM_TOP)
    ctx.strokeStyle = 'rgba(34,211,238,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, ATM_TOP + 0.5); ctx.lineTo(W, ATM_TOP + 0.5)
    ctx.moveTo(0, ATM_BOT - 0.5); ctx.lineTo(W, ATM_BOT - 0.5); ctx.stroke()

    ctx.strokeStyle = 'rgba(255,245,235,0.16)'
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(0, TOA_Y + 0.5); ctx.lineTo(W, TOA_Y + 0.5); ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = 'rgba(245,240,232,0.10)'
    ctx.fillRect(0, SURF_Y, W, H - SURF_Y)
    ctx.strokeStyle = 'rgba(245,240,232,0.4)'
    ctx.beginPath(); ctx.moveTo(0, SURF_Y + 0.5); ctx.lineTo(W, SURF_Y + 0.5); ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('to space', 8, TOA_Y - 8)
    ctx.fillText(`absorbing layer  ε = ${e.toFixed(2)}`, 8, ATM_TOP - 8)
    ctx.fillText('surface', 8, H - 8)

    // ---- fluxes ----
    // Sunlight passes straight through: greenhouse gases are transparent here.
    drawFlux(ctx, 66, TOA_Y - 14, SURF_Y, wOf(F_ABS), '#F59E0B', phase)
    drawFlux(ctx, 132, SURF_Y, TOA_Y - 14, wOf(F_REFL), 'rgba(245,240,232,0.75)', phase)
    // Longwave leaving the surface, split by the slab.
    drawFlux(ctx, 250, SURF_Y, ATM_BOT + 2, wOf(surfUp), '#22D3EE', phase)
    drawFlux(ctx, 250, ATM_TOP, TOA_Y - 14, wOf(winFlux), '#22D3EE', phase)
    drawFlux(ctx, 356, ATM_TOP, TOA_Y - 14, wOf(layerUp), '#10B981', phase)
    drawFlux(ctx, 452, ATM_BOT, SURF_Y, wOf(back), '#A78BFA', phase)

    const tag = (x: number, y: number, c: string, l1: string, l2: string) => {
      ctx.fillStyle = c
      ctx.font = 'bold 10px monospace'
      ctx.fillText(l1, x, y)
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.font = '9px monospace'
      ctx.fillText(l2, x, y + 11)
    }
    tag(84, 232, '#F59E0B', `${F_ABS.toFixed(0)} W/m²`, 'absorbed sunlight')
    tag(150, 108, 'rgba(245,240,232,0.75)', `${F_REFL.toFixed(0)} W/m²`, 'reflected')
    tag(268, 236, '#22D3EE', `${surfUp.toFixed(0)} W/m²`, 'surface IR emission')
    tag(268, 92, '#22D3EE', `${winFlux.toFixed(0)} W/m²`, 'through the IR window')
    tag(374, 116, '#10B981', `${layerUp.toFixed(0)} W/m²`, 'layer → space')
    tag(470, 232, '#A78BFA', `${back.toFixed(0)} W/m²`, 'back radiation')

    // ---- readout panel ----
    const px = 380, py = 8, pw = 212, ph = 78
    ctx.fillStyle = 'rgba(15,13,10,0.85)'
    ctx.fillRect(px, py, pw, ph)
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.lineWidth = 1
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1)

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('surface temperature', px + 10, py + 16)
    ctx.font = 'bold 20px monospace'
    ctx.fillStyle = '#22D3EE'
    ctx.fillText(`${ts.toFixed(1)} K`, px + 10, py + 38)
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = '#F5F0E8'
    ctx.fillText(`${(ts - 273.15).toFixed(1)} °C`, px + 118, py + 37)

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText(`no-atmosphere: ${T_EFF.toFixed(1)} K  ·  Δ = +${(ts - T_EFF).toFixed(1)} K`, px + 10, py + 55)
    ctx.fillStyle = Math.abs(imb) < 0.05 ? '#10B981' : '#F59E0B'
    ctx.fillText(
      Math.abs(imb) < 0.05
        ? 'top-of-atmosphere budget balanced'
        : `imbalance ${imb > 0 ? '+' : ''}${imb.toFixed(1)} W/m² → ${imb > 0 ? 'warming' : 'cooling'}`,
      px + 10, py + 69
    )

    ctx.textAlign = 'right'
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.28)'
    ctx.fillText('single-layer grey-slab model — not a GCM', W - 10, H - 8)
    ctx.textAlign = 'left'

    return { ts, imb }
  }, [])

  useEffect(() => { draw() }, [draw, eps, readout])

  useEffect(() => {
    if (!running) return
    let frame = 0
    const tick = () => {
      const e = epsRef.current
      const ts = tsRef.current
      const out = SIGMA * ts * ts * ts * ts * (1 - e / 2)
      const imb = F_ABS - out
      // Crude slab heat capacity: dTs/dt proportional to the TOA imbalance.
      tsRef.current = ts + imb * 0.02
      phaseRef.current = (phaseRef.current + 1.4) % 10000
      const r = draw()
      frame += 1
      if (r && frame % 5 === 0) setReadout({ ts: r.ts, imb: r.imb })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const onEps = (v: number) => {
    setEps(v)
    epsRef.current = v
    if (!running) {
      // Static mode: snap straight to the new equilibrium.
      tsRef.current = eqTemp(v)
      setReadout({ ts: tsRef.current, imb: 0 })
    }
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    setEps(EPS_TODAY)
    epsRef.current = EPS_TODAY
    tsRef.current = T_EFF
    phaseRef.current = 0
    setReadout({ ts: T_EFF, imb: F_ABS - SIGMA * Math.pow(T_EFF, 4) * (1 - EPS_TODAY / 2) })
  }

  const target = eqTemp(eps)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Energy balance of a one-layer atmosphere</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Energy balance of a one-layer atmosphere. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-teal text-bg-base text-xs font-medium hover:bg-accent-teal/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Greenhouse gases (IR opacity ε):</span>
          <input
            type="range" min={0} max={0.95} step={0.01} value={eps}
            onChange={e => onEps(+e.target.value)}
            className="w-40 accent-accent-teal"
          />
          <span className="font-mono text-text-secondary">{eps.toFixed(2)}</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          T<sub>s</sub> = {readout.ts.toFixed(1)} K → {target.toFixed(1)} K
        </span>
      </div>
    </div>
  )
}
