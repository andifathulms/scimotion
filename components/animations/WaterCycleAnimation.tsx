'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 360

// --- colours ----------------------------------------------------------------
const CYAN = '#22D3EE' // rising water vapour / evaporation
const BLUE = '#60A5FA' // rain, ocean, runoff
const VIOLET = '#A78BFA' // condensation in the clouds
const GREEN = '#10B981' // plants / transpiration
const SNOW = '#E2F0F8' // snow on the high ground

// --- scene geometry ---------------------------------------------------------
const SEA_Y = 250 // sea surface
const COAST_X = 300 // land to the left, ocean to the right
const PEAK_DROP = 90 // how far the mountain rises above sea level at x = 0
const SNOW_Y = 205 // above this height, precipitation falls as snow
const CLOUD_LO = 76
const CLOUD_HI = 122
const TREES = [150, 196, 242]

// Height of the land surface at a given x (a mountain sloping down to the coast).
function landY(x: number): number {
  if (x >= COAST_X) return SEA_Y
  return SEA_Y - (1 - x / COAST_X) * PEAK_DROP
}

type Phase = 'rise' | 'cloud' | 'rain' | 'runoff'
type Drop = {
  x: number
  y: number
  phase: Phase
  vx: number
  targetX: number // cloud column this parcel drifts toward
  cloudY: number
  life: number
  snow: boolean
  fromLand: boolean // started as transpiration rather than ocean evaporation
}

const TOTAL = 130
const rnd = (a: number, b: number) => a + Math.random() * (b - a)

// Restart a parcel at the ocean surface, ready to evaporate.
function reseedOcean(d: Drop) {
  d.x = rnd(COAST_X + 12, W - 12)
  d.y = SEA_Y
  d.phase = 'rise'
  d.vx = 0
  d.targetX = rnd(150, 470)
  d.cloudY = rnd(CLOUD_LO, CLOUD_HI)
  d.snow = false
  d.fromLand = false
}

// Restart a parcel at a plant, ready to transpire back up.
function reseedTree(d: Drop) {
  const tx = TREES[Math.floor(Math.random() * TREES.length)]
  d.x = tx + rnd(-6, 6)
  d.y = landY(tx) - 6
  d.phase = 'rise'
  d.vx = 0
  d.targetX = rnd(120, 320)
  d.cloudY = rnd(CLOUD_LO, CLOUD_HI)
  d.snow = false
  d.fromLand = true
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  solar: { default: 55, min: 0, max: 100, step: 1 },
}

export function WaterCycleAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const dropsRef = useRef<Drop[]>([])

  const { params, set, permalink, isDefault, restored } = useWidgetParams('water-cycle', SPEC)
  const { solar } = params
  const [running, setRunning] = useState(false)

  const solarRef = useRef(55)
  useEffect(() => {
    solarRef.current = solar
  }, [solar])

  const seed = useCallback(() => {
    const out: Drop[] = []
    for (let i = 0; i < TOTAL; i++) {
      const d: Drop = {
        x: 0,
        y: 0,
        phase: 'rise',
        vx: 0,
        targetX: 0,
        cloudY: 0,
        life: 0,
        snow: false,
        fromLand: false,
      }
      reseedOcean(d)
      d.y = SEA_Y - Math.random() * 200 // pre-scatter so the first frame is full
      d.phase = d.y < CLOUD_HI ? 'cloud' : 'rise'
      d.life = Math.floor(rnd(20, 160))
      out.push(d)
    }
    dropsRef.current = out
  }, [])

  const step = useCallback(() => {
    const solarVal = solarRef.current
    const active = Math.round(30 + solarVal) // more Sun -> more parcels cycling at once
    const rise = 0.7 + solarVal / 100 // more Sun -> faster evaporation

    dropsRef.current.forEach((d, i) => {
      if (i >= active) return // dormant: waits at the surface until the Sun turns up

      if (d.phase === 'rise') {
        d.y -= 1.15 * rise
        d.x += (d.targetX - d.x) * 0.012
        if (d.y <= d.cloudY) {
          d.y = d.cloudY
          d.phase = 'cloud'
          d.vx = rnd(-0.35, 0.35)
          d.life = Math.floor(rnd(50, 170))
        }
      } else if (d.phase === 'cloud') {
        d.x += d.vx
        d.y += Math.sin((d.life + d.x) * 0.06) * 0.15
        d.life -= 1
        if (d.x < 120 || d.x > 480) d.vx *= -1
        if (d.life <= 0) {
          d.phase = 'rain'
          d.snow = d.x < COAST_X && landY(d.x) < SNOW_Y
        }
      } else if (d.phase === 'rain') {
        d.y += d.snow ? 1.0 : 2.6
        const ground = d.x < COAST_X ? landY(d.x) : SEA_Y
        if (d.y >= ground) {
          if (d.x < COAST_X) {
            // Landed on the mountain: some runs off, some infiltrates and later transpires.
            if (Math.random() < 0.45) {
              d.phase = 'runoff'
              d.y = ground
            } else {
              reseedTree(d)
            }
          } else {
            reseedOcean(d)
          }
        }
      } else {
        // runoff: slide downhill toward the coast, then rejoin the ocean
        d.x += 2.0
        d.y = landY(d.x)
        if (d.x >= COAST_X) reseedOcean(d)
      }
    })
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const solarVal = solarRef.current
    const active = Math.round(30 + solarVal)
    const bright = 0.35 + solarVal / 100

    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'

    // ---- the Sun and its rays (brightness tracks the solar input) ----
    const sx = 62
    const sy = 52
    ctx.beginPath()
    ctx.arc(sx, sy, 22, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(245,158,11,${(0.25 + 0.6 * bright).toFixed(3)})`
    ctx.fill()
    ctx.strokeStyle = `rgba(245,158,11,${(0.5 * bright + 0.3).toFixed(3)})`
    ctx.lineWidth = 1.5
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(sx + Math.cos(ang) * 26, sy + Math.sin(ang) * 26)
      ctx.lineTo(sx + Math.cos(ang) * (30 + 8 * bright), sy + Math.sin(ang) * (30 + 8 * bright))
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('solar energy', sx - 26, sy + 40)

    // ---- ocean ----
    ctx.fillStyle = `${BLUE}22`
    ctx.fillRect(COAST_X, SEA_Y, W - COAST_X, H - SEA_Y)
    ctx.strokeStyle = `${BLUE}66`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(COAST_X, SEA_Y)
    ctx.lineTo(W, SEA_Y)
    ctx.stroke()
    ctx.fillStyle = `${BLUE}CC`
    ctx.fillText('OCEAN  (97% of all water)', COAST_X + 90, H - 12)

    // ---- land / mountain ----
    ctx.beginPath()
    ctx.moveTo(0, SEA_Y)
    ctx.lineTo(0, landY(0))
    for (let x = 0; x <= COAST_X; x += 10) ctx.lineTo(x, landY(x))
    ctx.lineTo(COAST_X, H)
    ctx.lineTo(0, H)
    ctx.closePath()
    ctx.fillStyle = 'rgba(120,110,96,0.22)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(200,190,170,0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, landY(0))
    for (let x = 0; x <= COAST_X; x += 6) ctx.lineTo(x, landY(x))
    ctx.stroke()

    // snow cap on the high ground
    ctx.beginPath()
    ctx.moveTo(0, landY(0))
    for (let x = 0; landY(x) < SNOW_Y && x <= COAST_X; x += 6) ctx.lineTo(x, landY(x))
    ctx.strokeStyle = SNOW
    ctx.lineWidth = 2
    ctx.stroke()

    // ---- trees ----
    for (const tx of TREES) {
      const ty = landY(tx)
      ctx.strokeStyle = 'rgba(160,120,80,0.7)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.lineTo(tx, ty - 10)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(tx, ty - 13, 5, 0, Math.PI * 2)
      ctx.fillStyle = `${GREEN}AA`
      ctx.fill()
    }

    // ---- soft cloud puffs where cloud parcels have gathered ----
    for (let i = 0; i < active; i++) {
      const d = dropsRef.current[i]
      if (d.phase !== 'cloud') continue
      ctx.beginPath()
      ctx.arc(d.x, d.y, 12, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(226,240,248,0.06)'
      ctx.fill()
    }

    // ---- parcels ----
    for (let i = 0; i < active; i++) {
      const d = dropsRef.current[i]
      let col = CYAN
      let r = 1.8
      if (d.phase === 'rise') {
        col = d.fromLand ? GREEN : CYAN
      } else if (d.phase === 'cloud') {
        col = VIOLET
        r = 2.1
      } else if (d.phase === 'rain') {
        col = d.snow ? SNOW : BLUE
        r = d.snow ? 1.8 : 1.6
      } else {
        col = BLUE
        r = 1.7
      }
      ctx.beginPath()
      if (d.phase === 'rain' && !d.snow) {
        // draw rain as a short streak
        ctx.strokeStyle = col
        ctx.lineWidth = 1.4
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x, d.y + 4)
        ctx.stroke()
      } else {
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2)
        ctx.fillStyle = col
        ctx.fill()
      }
    }

    // ---- flux labels ----
    ctx.textAlign = 'center'
    ctx.fillStyle = `${CYAN}CC`
    ctx.fillText('evaporation ↑', 440, 210)
    ctx.fillStyle = `${GREEN}CC`
    ctx.fillText('transpiration ↑', 196, 150)
    ctx.fillStyle = `${VIOLET}CC`
    ctx.fillText('condensation', 300, 66)
    ctx.fillStyle = `${BLUE}CC`
    ctx.fillText('precipitation ↓', 360, 175)
    ctx.fillStyle = `${SNOW}CC`
    ctx.fillText('snow', 40, 150)
    ctx.fillStyle = `${BLUE}AA`
    ctx.fillText('runoff →', 245, 243)
    ctx.textAlign = 'left'
  }, [])

  const settle = useCallback(
    (n: number) => {
      for (let i = 0; i < n; i++) step()
    },
    [step]
  )

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        settle(200)
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    seed()
    settle(60)
    draw()
  }, [seed, settle, draw])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      step()
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  useEffect(() => {
    if (!running) draw()
  }, [solar, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    set('solar', 55)
    solarRef.current = 55
    seed()
    settle(60)
    draw()
  }

  // Displayed fluxes: real global values (×10^3 km^3/yr) scaled by a
  // Clausius-Clapeyron-like ~7%/K response to the temperature the Sun sets.
  const dT = Math.round((solar - 55) * 0.06 * 10) / 10
  const mult = Math.pow(1.07, dT)
  const evap = Math.round(486 * mult)
  const vapour = Math.round(12.9 * mult * 10) / 10

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · The water cycle, powered by the Sun
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
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
          <span>Solar input / temperature:</span>
          <input
            type="range"
            min={SPEC.solar.min}
            max={SPEC.solar.max}
            step={SPEC.solar.step}
            value={solar}
            onChange={e => set('solar', +e.target.value)}
            className="w-32 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">
            ΔT {dT >= 0 ? '+' : ''}
            {dT.toFixed(1)} °C
          </span>
        </label>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          evaporation ≈ precipitation ≈ {evap} · vapour aloft {vapour} (×10³ km³)
        </span>
      </div>
    </div>
  )
}
