'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 380

const SKY_L = 12
const SKY_R = 588
const SKY_TOP = 16
const GROUND_Y = 344

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'

// Physics. Heights in metres, temperatures in degrees C.
const Z_MAX = 4000 // top of drawn domain
const GAMMA_D = 9.8 // dry adiabatic lapse rate, K/km
const GAMMA_M = 5.5 // moist adiabatic lapse rate, K/km (above cloud base)
const T_SURF = 24 // surface parcel temperature, degrees C

const DEFAULT_RH = 55
const RISE_PER_FRAME = 26 // metres the parcel climbs each frame while running

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

// Tetens formula: saturation vapour pressure (hPa) as a function of temperature.
// This is what actually rises steeply with temperature -- NOT any "holding capacity".
const esat = (tC: number) => 6.112 * Math.exp((17.67 * tC) / (tC + 243.5))

// Parcel temperature after adiabatic ascent to height z, given the cloud base (LCL).
function parcelT(z: number, lcl: number): number {
  if (z <= lcl) return T_SURF - (GAMMA_D / 1000) * z
  return T_SURF - (GAMMA_D / 1000) * lcl - (GAMMA_M / 1000) * (z - lcl)
}

// Dew point of the surface air is fixed by its starting vapour content, which we
// set from the chosen surface relative humidity. The vapour pressure is conserved
// as the parcel rises (until it saturates), so the dew point barely changes -- the
// parcel reaches saturation because its TEMPERATURE falls to meet the dew point.
const surfaceDewPoint = (rh: number) => {
  const e = (clamp(rh, 5, 100) / 100) * esat(T_SURF) // actual vapour pressure, hPa
  // invert Tetens for the temperature at which esat == e
  const ln = Math.log(e / 6.112)
  return (243.5 * ln) / (17.67 - ln)
}

// Lifting condensation level: cool the parcel at the dry rate until T == dew point.
// Standard approximation LCL ~= 125 m per degC of dewpoint depression.
const lclOf = (rh: number) => clamp((T_SURF - surfaceDewPoint(rh)) * 125, 0, Z_MAX - 200)

// Relative humidity of the rising parcel at height z: actual vapour pressure over
// the saturation vapour pressure at the parcel's (now colder) temperature.
function parcelRH(z: number, rh: number, lcl: number): number {
  const e = (clamp(rh, 5, 100) / 100) * esat(T_SURF)
  const eS = esat(parcelT(Math.min(z, lcl), lcl))
  return clamp((e / eS) * 100, 0, 100)
}

type Puff = { dx: number; dy: number; r: number }
// Deterministic cloud puffs seeded from a fixed table (no Math.random).
const PUFFS: Puff[] = [
  { dx: -70, dy: 4, r: 20 },
  { dx: -44, dy: -8, r: 26 },
  { dx: -14, dy: -12, r: 30 },
  { dx: 18, dy: -9, r: 27 },
  { dx: 48, dy: -3, r: 24 },
  { dx: 74, dy: 6, r: 19 },
  { dx: -30, dy: 8, r: 22 },
  { dx: 4, dy: 10, r: 23 },
  { dx: 36, dy: 9, r: 21 },
]

const zToY = (z: number) => GROUND_Y - (z / Z_MAX) * (GROUND_Y - SKY_TOP)
const PARCEL_X = 300

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  rh: { default: DEFAULT_RH, min: 20, max: 95, step: 1 },
}

export function CloudFormationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)

  const { params, set, permalink, isDefault, restored } = useWidgetParams('cloud-formation', SPEC)
  const { rh } = params
  const [running, setRunning] = useState(false)
  const [z, setZ] = useState(0)

  const rhRef = useRef(DEFAULT_RH)
  const zRef = useRef(0)
  useEffect(() => {
    rhRef.current = rh
  }, [rh])

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

    const rhNow = rhRef.current
    const lcl = lclOf(rhNow)
    const zNow = zRef.current

    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)
    ctx.font = '10px monospace'

    // altitude gridlines
    ctx.lineWidth = 1
    for (let km = 0; km <= 4; km += 1) {
      const y = zToY(km * 1000)
      ctx.strokeStyle = 'rgba(255,245,235,0.06)'
      ctx.beginPath()
      ctx.moveTo(SKY_L, y)
      ctx.lineTo(SKY_R, y)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.28)'
      ctx.fillText(`${km} km`, SKY_L + 2, y - 3)
    }

    // condensation level (cloud base)
    const lclY = zToY(lcl)
    ctx.strokeStyle = 'rgba(96,165,250,0.55)'
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(SKY_L, lclY)
    ctx.lineTo(SKY_R, lclY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = BLUE
    ctx.fillText('cloud base (dew point reached)', SKY_R - 200, lclY - 5)

    // the cloud: grows as the parcel climbs above the condensation level
    if (zNow > lcl) {
      const grown = clamp((zNow - lcl) / 900, 0, 1)
      const cloudY = lclY - grown * 40
      for (const p of PUFFS) {
        const r = p.r * (0.5 + 0.5 * grown)
        ctx.beginPath()
        ctx.arc(PARCEL_X + p.dx, cloudY + p.dy, r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(226,240,248,${(0.05 + 0.13 * grown).toFixed(3)})`
        ctx.fill()
      }
      // droplets condensing onto nuclei near the base
      for (let i = 0; i < PUFFS.length; i++) {
        const p = PUFFS[i]
        ctx.beginPath()
        ctx.arc(PARCEL_X + p.dx * 0.7, cloudY + 6 + (i % 3) * 4, 1.4, 0, Math.PI * 2)
        ctx.fillStyle = CYAN
        ctx.globalAlpha = grown
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    // the rising parcel and its trail
    const pY = zToY(zNow)
    ctx.strokeStyle = 'rgba(245,158,11,0.35)'
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.moveTo(PARCEL_X, GROUND_Y)
    ctx.lineTo(PARCEL_X, pY)
    ctx.stroke()
    ctx.setLineDash([])

    const saturated = zNow >= lcl
    ctx.beginPath()
    ctx.arc(PARCEL_X, pY, 8, 0, Math.PI * 2)
    ctx.fillStyle = saturated ? VIOLET : GOLD
    ctx.fill()
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('rising parcel (expands, cools)', PARCEL_X + 14, pY + 3)

    // ground
    ctx.fillStyle = 'rgba(245,158,11,0.28)'
    ctx.fillRect(SKY_L, GROUND_Y, SKY_R - SKY_L, 12)
    ctx.strokeStyle = 'rgba(245,240,232,0.3)'
    ctx.beginPath()
    ctx.moveTo(SKY_L, GROUND_Y)
    ctx.lineTo(SKY_R, GROUND_Y)
    ctx.stroke()
    ctx.fillStyle = 'rgba(15,13,10,0.85)'
    ctx.fillText('humid surface air', SKY_L + 6, GROUND_Y + 9)
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        zRef.current = Z_MAX - 400
        setZ(zRef.current)
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      zRef.current = Math.min(Z_MAX - 200, zRef.current + RISE_PER_FRAME)
      setZ(zRef.current)
      draw()
      if (zRef.current >= Z_MAX - 200) {
        setRunning(false)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => {
    if (!running) draw()
  }, [rh, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    set('rh', DEFAULT_RH)
    rhRef.current = DEFAULT_RH
    zRef.current = 0
    setZ(0)
    draw()
  }

  const play = () => {
    if (zRef.current >= Z_MAX - 200) {
      zRef.current = 0
      setZ(0)
    }
    setRunning(true)
  }

  const lcl = lclOf(rh)
  const tNow = parcelT(z, lcl)
  const dew = surfaceDewPoint(rh)
  const rhNow = parcelRH(z, rh, lcl)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Air rises, cools, condenses
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
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          altitude <span className="text-text-secondary">{(z / 1000).toFixed(2)} km</span>
        </span>
        <span>
          temp <span style={{ color: GOLD }}>{tNow.toFixed(1)} °C</span>
        </span>
        <span>
          dew point <span style={{ color: BLUE }}>{dew.toFixed(1)} °C</span>
        </span>
        <span>
          RH <span style={{ color: rhNow >= 99.5 ? CYAN : undefined }}>{rhNow.toFixed(0)}%</span>
        </span>
        <span>
          cloud base <span style={{ color: CYAN }}>{Math.round(lcl)} m</span>
        </span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={play}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base disabled:opacity-50"
        >
          <Play size={12} /> Play
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Surface humidity:</span>
          <input
            type="range"
            min={SPEC.rh.min}
            max={SPEC.rh.max}
            step={SPEC.rh.step}
            value={rh}
            onChange={e => set('rh', +e.target.value)}
            className="w-32"
            style={{ accentColor: CYAN }}
          />
          <span className="text-text-secondary font-mono">{rh}%</span>
        </div>
        <span className="ml-auto text-xs text-text-muted">
          {z > lcl ? (
            <strong style={{ color: VIOLET }}>condensing on nuclei</strong>
          ) : (
            <span>below dew point altitude</span>
          )}
        </span>
      </div>
    </div>
  )
}
