'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 360

// Left panel: the sky
const SC_L = 10
const SC_R = 352
const SKY_TOP = 18
const GROUND_Y = 300

// Right panel: the temperature-height diagram
const D_L = 400
const D_R = 588
const D_TOP = 18
const D_BOT = 300

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

// Physics constants, in SI-ish units. Heights in metres, temperatures in kelvin.
const G = 9.81
const T_SURF = 288 // 15 degrees C at the ground
const Z_MAX = 10000 // top of the drawn domain
const Z_TROP = 8000 // above this the environment is taken as isothermal
const GAMMA_D = 0.0098 // dry adiabatic lapse rate, K/m  (9.8 K/km)
const GAMMA_M = 0.0055 // representative moist adiabatic lapse rate, K/m (5.5 K/km)
const DRAG = 2e-4
const DT = 2 // seconds per frame

const T_MIN = 195
const T_MAX = 297

const CELLS = 3
const PER_CELL = 6
const CELL_W = (SC_R - SC_L) / CELLS
const TRAIL = 16

const DEFAULT_HEAT = 62
const DEFAULT_RH = 55

type Pt = { x: number; y: number }
type Phase = 'rise' | 'spread' | 'sink' | 'return'
type Parcel = {
  cell: number
  dir: number
  x: number
  z: number
  w: number
  phase: Phase
  wait: number
  trail: Pt[]
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

// Environmental profile: constant lapse rate up to the tropopause, isothermal above.
const envT = (z: number, gamma: number) => T_SURF - (gamma / 1000) * Math.min(z, Z_TROP)

// Parcel profile: dry adiabat to the lifting condensation level, moist adiabat above.
function parcelT(z: number, excess: number, lcl: number): number {
  const base = T_SURF + excess
  if (z <= lcl) return base - GAMMA_D * z
  return base - GAMMA_D * lcl - GAMMA_M * (z - lcl)
}

const lclOf = (rh: number) => clamp((100 - rh) * 25, 60, 3000)
const gammaOf = (heat: number) => 4 + heat * 0.07 // 4 to 11 K/km
const excessOf = (heat: number) => 0.5 + heat * 0.02 // 0.5 to 2.5 K

function verdictOf(gamma: number): { name: string; color: string } {
  if (gamma > 9.8) return { name: 'absolutely unstable', color: '#F472B6' }
  if (gamma > 5.5) return { name: 'conditionally unstable', color: GOLD }
  return { name: 'absolutely stable', color: BLUE }
}

const zToY = (z: number) => GROUND_Y - (z / Z_MAX) * (GROUND_Y - SKY_TOP)
const dzToY = (z: number) => D_BOT - (z / Z_MAX) * (D_BOT - D_TOP)
const dtToX = (t: number) =>
  D_L + ((clamp(t, T_MIN, T_MAX) - T_MIN) / (T_MAX - T_MIN)) * (D_R - D_L)

const cellCentre = (i: number) => SC_L + (i + 0.5) * CELL_W

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  heat: { default: DEFAULT_HEAT, min: 0, max: 100, step: 1 },
  rh: { default: DEFAULT_RH, min: 10, max: 100, step: 1 },
}

export function ConvectionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const parcelsRef = useRef<Parcel[]>([])

  const { params, set, permalink, isDefault, restored } = useWidgetParams('convection', SPEC)
  const { heat, rh } = params
  const [running, setRunning] = useState(false)
  const [lead, setLead] = useState({ z: 0, w: 0 })

  const heatRef = useRef(DEFAULT_HEAT)
  const rhRef = useRef(DEFAULT_RH)
  useEffect(() => {
    heatRef.current = heat
  }, [heat])
  useEffect(() => {
    rhRef.current = rh
  }, [rh])

  const seed = useCallback(() => {
    const out: Parcel[] = []
    for (let c = 0; c < CELLS; c++) {
      for (let i = 0; i < PER_CELL; i++) {
        out.push({
          cell: c,
          dir: i % 2 === 0 ? 1 : -1,
          x: cellCentre(c) + (Math.random() - 0.5) * 8,
          z: 0,
          w: 1,
          phase: 'rise',
          wait: i * 16 + Math.floor(Math.random() * 10),
          trail: [],
        })
      }
    }
    parcelsRef.current = out
  }, [])

  const step = useCallback(() => {
    const gamma = gammaOf(heatRef.current)
    const excess = excessOf(heatRef.current)
    const lcl = lclOf(rhRef.current)

    let bestZ = 0
    let bestW = 0

    for (const p of parcelsRef.current) {
      if (p.wait > 0) {
        p.wait -= 1
        continue
      }
      const cx = cellCentre(p.cell)

      if (p.phase === 'rise') {
        const te = envT(p.z, gamma)
        const tp = parcelT(p.z, excess, lcl)
        const a = (G * (tp - te)) / te - DRAG * p.w * Math.abs(p.w)
        p.w += a * DT
        p.z += p.w * DT
        p.x += (cx - p.x) * 0.06
        if (p.z <= 0) {
          // Negatively buoyant: the parcel sank straight back to where it started.
          p.z = 0
          p.w = 1
          p.trail.length = 0
          p.wait = 8
        } else if (p.z >= Z_MAX - 40) {
          p.z = Z_MAX - 40
          p.w = 0
          p.phase = 'spread'
        } else if (p.w <= 0.04 && p.z > 120) {
          p.w = 0
          p.phase = 'spread'
        }
      } else if (p.phase === 'spread') {
        p.x += p.dir * 1.5
        p.z -= 6
        if (Math.abs(p.x - cx) > CELL_W * 0.46) p.phase = 'sink'
      } else if (p.phase === 'sink') {
        p.z -= 55
        p.x += p.dir * 0.12
        if (p.z <= 30) {
          p.z = 20
          p.phase = 'return'
        }
      } else {
        p.z = 20
        p.x += (cx - p.x) * 0.05 - p.dir * 0.2
        if (Math.abs(p.x - cx) < 7) {
          p.x = cx + (Math.random() - 0.5) * 8
          p.z = 0
          p.w = 1
          p.phase = 'rise'
          p.trail.length = 0
        }
      }

      p.trail.push({ x: p.x, y: zToY(p.z) })
      if (p.trail.length > TRAIL) p.trail.shift()

      if (p.phase === 'rise' && p.z > bestZ) {
        bestZ = p.z
        bestW = p.w
      }
    }

    return { z: bestZ, w: bestW }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const gamma = gammaOf(heatRef.current)
    const excess = excessOf(heatRef.current)
    const lcl = lclOf(rhRef.current)

    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'

    // ---- left panel: the sky ----
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    ctx.lineWidth = 1
    for (let km = 0; km <= 10; km += 2) {
      const y = zToY(km * 1000)
      ctx.beginPath()
      ctx.moveTo(SC_L, y)
      ctx.lineTo(SC_R, y)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.28)'
      ctx.fillText(`${km} km`, SC_L + 2, y - 3)
    }

    // condensation level
    const lclY = zToY(lcl)
    ctx.strokeStyle = 'rgba(96,165,250,0.5)'
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(SC_L, lclY)
    ctx.lineTo(SC_R, lclY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = BLUE
    ctx.fillText('cloud base (LCL)', SC_R - 84, lclY - 4)

    // clouds: every parcel that has risen above its condensation level
    for (const p of parcelsRef.current) {
      if (p.wait > 0 || p.z <= lcl) continue
      const y = zToY(p.z)
      ctx.beginPath()
      ctx.arc(p.x, y, 13, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(226,240,248,0.11)'
      ctx.fill()
    }

    // trails
    for (const p of parcelsRef.current) {
      if (p.trail.length < 2) continue
      const buoyant = p.phase === 'rise' && p.w > 0
      const col = buoyant ? (p.z > lcl ? VIOLET : GOLD) : BLUE
      for (let i = 1; i < p.trail.length; i++) {
        const alpha = (i / p.trail.length) * 0.7
        ctx.beginPath()
        ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y)
        ctx.lineTo(p.trail[i].x, p.trail[i].y)
        ctx.strokeStyle = `rgba(${buoyant ? (p.z > lcl ? '167,139,250' : '245,158,11') : '96,165,250'},${alpha.toFixed(3)})`
        ctx.lineWidth = 1.4
        ctx.stroke()
      }
      const y = zToY(p.z)
      ctx.beginPath()
      ctx.arc(p.x, y, p.phase === 'rise' ? 3.1 : 2.2, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
    }

    // ground, tinted by how hard it is being heated
    const hf = heatRef.current / 100
    ctx.fillStyle = `rgba(245,158,11,${(0.18 + 0.5 * hf).toFixed(3)})`
    ctx.fillRect(SC_L, GROUND_Y, SC_R - SC_L, 12)
    ctx.strokeStyle = 'rgba(245,240,232,0.3)'
    ctx.beginPath()
    ctx.moveTo(SC_L, GROUND_Y)
    ctx.lineTo(SC_R, GROUND_Y)
    ctx.stroke()
    ctx.fillStyle = 'rgba(15,13,10,0.85)'
    ctx.fillText('heated surface', SC_L + 6, GROUND_Y + 9)

    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('convection cells', SC_L + 2, SKY_TOP - 6)

    // ---- right panel: T-z diagram ----
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(D_L, D_TOP)
    ctx.lineTo(D_L, D_BOT)
    ctx.lineTo(D_R, D_BOT)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    for (let t = 200; t <= 290; t += 30) {
      const x = dtToX(t)
      ctx.beginPath()
      ctx.moveTo(x, D_BOT)
      ctx.lineTo(x, D_BOT + 3)
      ctx.strokeStyle = 'rgba(255,245,235,0.14)'
      ctx.stroke()
      ctx.fillText(`${t}`, x - 8, D_BOT + 13)
    }
    ctx.fillText('temperature (K)', D_L + 52, D_BOT + 24)

    // shade the positively buoyant layer (parcel warmer than environment)
    ctx.beginPath()
    let started = false
    for (let z = 0; z <= Z_MAX; z += 100) {
      const tp = parcelT(z, excess, lcl)
      const te = envT(z, gamma)
      if (tp > te) {
        const y = dzToY(z)
        if (!started) {
          ctx.moveTo(dtToX(te), y)
          started = true
        }
        ctx.lineTo(dtToX(tp), y)
      }
    }
    if (started) {
      for (let z = Z_MAX; z >= 0; z -= 100) {
        const tp = parcelT(z, excess, lcl)
        const te = envT(z, gamma)
        if (tp > te) ctx.lineTo(dtToX(te), dzToY(z))
      }
      ctx.closePath()
      ctx.fillStyle = 'rgba(16,185,129,0.16)'
      ctx.fill()
    }

    // environmental profile
    ctx.beginPath()
    for (let z = 0; z <= Z_MAX; z += 100) {
      const x = dtToX(envT(z, gamma))
      const y = dzToY(z)
      if (z === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = CYAN
    ctx.lineWidth = 1.9
    ctx.stroke()

    // parcel path: dry adiabat below the LCL, moist adiabat above
    ctx.beginPath()
    for (let z = 0; z <= Math.min(lcl, Z_MAX); z += 50) {
      const x = dtToX(parcelT(z, excess, lcl))
      const y = dzToY(z)
      if (z === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 1.7
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(dtToX(parcelT(lcl, excess, lcl)), dzToY(lcl))
    for (let z = lcl; z <= Z_MAX; z += 100) {
      ctx.lineTo(dtToX(parcelT(z, excess, lcl)), dzToY(z))
    }
    ctx.strokeStyle = VIOLET
    ctx.lineWidth = 1.7
    ctx.stroke()

    // LCL marker
    const ly = dzToY(lcl)
    ctx.beginPath()
    ctx.arc(dtToX(parcelT(lcl, excess, lcl)), ly, 3, 0, Math.PI * 2)
    ctx.fillStyle = BLUE
    ctx.fill()
    ctx.fillStyle = BLUE
    ctx.fillText('LCL', D_L + 4, ly - 4)

    // the leading parcel's actual state
    let top = 0
    let topW = 0
    for (const p of parcelsRef.current) {
      if (p.wait === 0 && p.phase === 'rise' && p.z > top) {
        top = p.z
        topW = p.w
      }
    }
    if (top > 0) {
      ctx.beginPath()
      ctx.arc(dtToX(parcelT(top, excess, lcl)), dzToY(top), 3.6, 0, Math.PI * 2)
      ctx.fillStyle = topW > 0 ? GREEN : BLUE
      ctx.fill()
    }

    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('parcel vs environment', D_L, D_TOP - 6)

    // legend
    const leg: [string, string][] = [
      ['environment', CYAN],
      ['dry adiabat', GOLD],
      ['moist adiabat', VIOLET],
    ]
    leg.forEach(([label, col], i) => {
      const y = D_TOP + 12 + i * 13
      ctx.strokeStyle = col
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(D_L + 4, y)
      ctx.lineTo(D_L + 18, y)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.fillText(label, D_L + 22, y + 3)
    })
  }, [])

  const settle = useCallback(
    (n: number) => {
      let last = { z: 0, w: 0 }
      for (let i = 0; i < n; i++) last = step()
      setLead(last)
    },
    [step]
  )

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        settle(140)
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    seed()
    settle(70)
    draw()
  }, [seed, settle, draw])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      const l = step()
      draw()
      setLead(l)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  useEffect(() => {
    if (!running) draw()
  }, [heat, rh, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    set('heat', DEFAULT_HEAT)
    set('rh', DEFAULT_RH)
    heatRef.current = DEFAULT_HEAT
    rhRef.current = DEFAULT_RH
    seed()
    settle(70)
    draw()
  }

  const gamma = gammaOf(heat)
  const lcl = lclOf(rh)
  const verdict = verdictOf(gamma)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · A parcel of air, lifted
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
          style={{ background: '#0F0D0A' }}
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
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Surface heating:</span>
          <input
            type="range"
            min={SPEC.heat.min}
            max={SPEC.heat.max}
            step={SPEC.heat.step}
            value={heat}
            onChange={e => set('heat', +e.target.value)}
            className="w-28 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">
            Γ = {gamma.toFixed(1)} K/km
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Humidity:</span>
          <input
            type="range"
            min={SPEC.rh.min}
            max={SPEC.rh.max}
            step={SPEC.rh.step}
            value={rh}
            onChange={e => set('rh', +e.target.value)}
            className="w-28 accent-accent-cyan"
          />
          <span className="text-text-secondary font-mono">
            {rh}% · LCL {Math.round(lcl)} m
          </span>
        </div>
        <span className="text-xs text-text-secondary font-mono">
          top {(lead.z / 1000).toFixed(1)} km · w = {lead.w.toFixed(1)} m/s
        </span>
        <span className="ml-auto text-xs text-text-secondary">
          <strong style={{ color: verdict.color }}>{verdict.name}</strong>
        </span>
      </div>
    </div>
  )
}
