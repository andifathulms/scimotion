'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'

// Cross-section geometry. The eye is at CX; the storm is symmetric about it.
const CX = 300
const SEA_Y = 250 // sea surface
const TOP_Y = 44 // outflow level (near the tropopause)
const OCEAN_BOT = 300
const EYE_HALF = 30 // half-width of the calm eye
const WALL_X = 48 // centre of the eyewall band, offset from the eye
const COND_Y = 202 // condensation level: latent heat is released above this

const THRESHOLD = 26 // deg C — warm-ocean fuel threshold
const SST_MIN = 20
const SST_MAX = 31
const DEFAULT_SST = 28

const N = 46
const TRAIL = 12

type Pt = { x: number; y: number }
type Phase = 'inflow' | 'rise' | 'outflow'
type Parcel = {
  side: number // -1 left of the eye, +1 right
  x: number
  y: number
  phase: Phase
  wait: number
  trail: Pt[]
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

// Target engine strength (0–1) set by the fuel: warm ocean drives it up, cold
// water or land starves it. Threshold behaviour is baked into the 24.5 offset.
function targetStrength(sst: number, land: boolean): number {
  if (land) return 0
  return clamp((sst - 24.5) / 6, 0, 1)
}

function categoryOf(v: number): { name: string; color: string } {
  if (v < 17) return { name: 'tropical depression', color: BLUE }
  if (v < 33) return { name: 'tropical storm', color: CYAN }
  if (v < 43) return { name: 'category 1', color: '#34D399' }
  if (v < 50) return { name: 'category 2', color: GOLD }
  if (v < 58) return { name: 'category 3', color: GOLD }
  if (v < 70) return { name: 'category 4', color: '#F97316' }
  return { name: 'category 5', color: '#EF4444' }
}

// Warm ocean reads warm; cold water reads blue; land is earthy.
function oceanColor(sst: number, land: boolean): string {
  if (land) return 'rgba(92,74,48,0.9)'
  const t = clamp((sst - SST_MIN) / (SST_MAX - SST_MIN), 0, 1)
  const r = Math.round(44 + t * 168)
  const g = Math.round(92 + t * 40)
  const b = Math.round(150 - t * 96)
  return `rgba(${r},${g},${b},0.85)`
}

export function HurricaneEngineAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const parcelsRef = useRef<Parcel[]>([])
  const strengthRef = useRef(targetStrength(DEFAULT_SST, false))

  const [sst, setSst] = useState(DEFAULT_SST)
  const [land, setLand] = useState(false)
  const [running, setRunning] = useState(false)
  const [strength, setStrength] = useState(strengthRef.current)

  const sstRef = useRef(DEFAULT_SST)
  const landRef = useRef(false)
  useEffect(() => {
    sstRef.current = sst
  }, [sst])
  useEffect(() => {
    landRef.current = land
  }, [land])

  const respawn = useCallback((p: Parcel, s: number) => {
    p.side = Math.random() < 0.5 ? -1 : 1
    p.x = CX + p.side * (WALL_X + 120 + Math.random() * 130)
    p.y = SEA_Y - 3 - Math.random() * 10
    p.phase = 'inflow'
    // A weak engine keeps most parcels parked at the surface, so it looks sparse.
    p.wait = Math.floor((1 - s) * 70 * Math.random())
    p.trail = []
  }, [])

  const seed = useCallback(() => {
    const s = strengthRef.current
    const out: Parcel[] = []
    for (let i = 0; i < N; i++) {
      const p: Parcel = { side: 1, x: 0, y: 0, phase: 'inflow', wait: 0, trail: [] }
      respawn(p, s)
      p.wait = Math.floor(Math.random() * 90)
      out.push(p)
    }
    parcelsRef.current = out
  }, [respawn])

  const step = useCallback(() => {
    const target = targetStrength(sstRef.current, landRef.current)
    strengthRef.current += (target - strengthRef.current) * 0.03
    const s = strengthRef.current

    const inf = 0.8 + 2.4 * s
    const rise = 0.6 + 3.4 * s
    const out = 1.0 + 2.6 * s

    for (const p of parcelsRef.current) {
      if (p.wait > 0) {
        p.wait -= 1
        continue
      }
      if (p.phase === 'inflow') {
        p.x += -p.side * inf
        p.y += (SEA_Y - 6 - p.y) * 0.12
        if (Math.abs(p.x - CX) <= WALL_X) {
          p.phase = 'rise'
          p.x = CX + p.side * WALL_X
        }
      } else if (p.phase === 'rise') {
        // When the fuel is nearly gone the updraft can no longer lift a parcel,
        // and it sinks back to the sea — the engine spinning down before your eyes.
        const damp = s < 0.15 ? 1.7 : 0
        p.y += damp - rise
        p.x += p.side * rise * 0.16 // the eyewall leans outward with height
        if (p.y >= SEA_Y) {
          respawn(p, s)
          continue
        }
        if (p.y <= TOP_Y) p.phase = 'outflow'
      } else {
        p.x += p.side * out
        p.y += -0.35
        if (Math.abs(p.x - CX) > 292 || p.y < 10) {
          respawn(p, s)
          continue
        }
      }
      p.trail.push({ x: p.x, y: p.y })
      if (p.trail.length > TRAIL) p.trail.shift()
    }
    return s
  }, [respawn])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const s = strengthRef.current
    const curSst = sstRef.current
    const curLand = landRef.current
    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'

    // ---- ocean / land: the fuel ----
    ctx.fillStyle = oceanColor(curSst, curLand)
    ctx.fillRect(0, SEA_Y, W, OCEAN_BOT - SEA_Y)
    ctx.strokeStyle = 'rgba(245,240,232,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, SEA_Y)
    ctx.lineTo(W, SEA_Y)
    ctx.stroke()
    ctx.fillStyle = 'rgba(15,13,10,0.8)'
    ctx.fillText(
      curLand ? 'land — no evaporation, fuel cut' : `warm ocean (${curSst.toFixed(0)}°C fuel)`,
      10,
      SEA_Y + 14
    )

    // condensation level: where latent heat is released
    ctx.strokeStyle = 'rgba(245,158,11,0.4)'
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, COND_Y)
    ctx.lineTo(W, COND_Y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,158,11,0.8)'
    ctx.fillText('condensation — latent heat released', W - 210, COND_Y - 4)

    // ---- eyewall cloud towers (translucent, brighter with strength) ----
    const wallA = 0.06 + 0.22 * s
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(CX + side * EYE_HALF, SEA_Y)
      ctx.lineTo(CX + side * (WALL_X + 20), SEA_Y)
      ctx.lineTo(CX + side * (WALL_X + 44), TOP_Y)
      ctx.lineTo(CX + side * (EYE_HALF + 10), TOP_Y)
      ctx.closePath()
      ctx.fillStyle = `rgba(226,240,248,${wallA.toFixed(3)})`
      ctx.fill()
      // latent-heat glow inside the tower, above the condensation level
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(CX + side * EYE_HALF, SEA_Y)
      ctx.lineTo(CX + side * (WALL_X + 20), SEA_Y)
      ctx.lineTo(CX + side * (WALL_X + 44), TOP_Y)
      ctx.lineTo(CX + side * (EYE_HALF + 10), TOP_Y)
      ctx.closePath()
      ctx.clip()
      ctx.fillStyle = `rgba(245,158,11,${(0.14 * s).toFixed(3)})`
      ctx.fillRect(0, TOP_Y, W, COND_Y - TOP_Y)
      ctx.restore()
    }

    // outflow anvil near the top
    ctx.fillStyle = `rgba(226,240,248,${(0.05 + 0.08 * s).toFixed(3)})`
    ctx.beginPath()
    ctx.ellipse(CX, TOP_Y + 6, 210 * (0.4 + 0.6 * s), 16, 0, 0, Math.PI * 2)
    ctx.fill()

    // ---- evaporation wisps rising off the sea into the inflow ----
    if (!curLand) {
      const wisps = Math.floor(s * 26) + 4
      ctx.strokeStyle = `rgba(34,211,238,${(0.2 + 0.4 * s).toFixed(3)})`
      ctx.lineWidth = 1
      for (let i = 0; i < wisps; i++) {
        const wx = 20 + Math.random() * (W - 40)
        if (Math.abs(wx - CX) < EYE_HALF) continue // calm eye: no updraft
        const h = 4 + Math.random() * 12
        ctx.beginPath()
        ctx.moveTo(wx, SEA_Y - 2)
        ctx.lineTo(wx + (Math.random() - 0.5) * 4, SEA_Y - 2 - h)
        ctx.stroke()
      }
    }

    // ---- parcel trails ----
    for (const p of parcelsRef.current) {
      if (p.wait > 0 || p.trail.length < 2) continue
      let col = CYAN
      if (p.phase === 'rise') col = p.y < COND_Y ? GOLD : BLUE
      else if (p.phase === 'outflow') col = VIOLET
      for (let i = 1; i < p.trail.length; i++) {
        const alpha = (i / p.trail.length) * 0.8
        ctx.beginPath()
        ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y)
        ctx.lineTo(p.trail[i].x, p.trail[i].y)
        ctx.strokeStyle =
          col +
          Math.floor(alpha * 255)
            .toString(16)
            .padStart(2, '0')
        ctx.lineWidth = p.phase === 'rise' && p.y < COND_Y ? 1.7 : 1.2
        ctx.stroke()
      }
      const head = p.trail[p.trail.length - 1]
      ctx.beginPath()
      ctx.arc(head.x, head.y, 1.8, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
    }

    // ---- inflow arrows along the sea surface ----
    ctx.strokeStyle = `rgba(34,211,238,${(0.3 + 0.4 * s).toFixed(3)})`
    ctx.fillStyle = ctx.strokeStyle
    for (const side of [-1, 1]) {
      for (const d of [90, 150, 210]) {
        const x = CX + side * d
        ctx.lineWidth = 1.3
        ctx.beginPath()
        ctx.moveTo(x, SEA_Y - 20)
        ctx.lineTo(x - side * 16, SEA_Y - 20)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x - side * 16, SEA_Y - 20)
        ctx.lineTo(x - side * 10, SEA_Y - 23)
        ctx.lineTo(x - side * 10, SEA_Y - 17)
        ctx.closePath()
        ctx.fill()
      }
    }

    // labels
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.font = '9px monospace'
    ctx.fillText('eye', CX - 8, TOP_Y + 30)
    ctx.fillText('eyewall', CX + WALL_X + 6, TOP_Y + 44)
    ctx.fillStyle = 'rgba(34,211,238,0.7)'
    ctx.fillText('moist inflow', CX + 96, SEA_Y - 24)
    ctx.fillStyle = 'rgba(167,139,250,0.75)'
    ctx.fillText('outflow', CX + 150, TOP_Y + 2)

    // ---- readout panel ----
    const maxWind = 17 + s * 63
    const cat = categoryOf(maxWind)
    const ts = 273.15 + curSst
    const eff = ((ts - 200) / ts) * 100

    ctx.fillStyle = 'rgba(15,13,10,0.82)'
    ctx.fillRect(10, 12, 200, 74)
    ctx.strokeStyle = 'rgba(255,245,235,0.1)'
    ctx.lineWidth = 1
    ctx.strokeRect(10, 12, 200, 74)

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('intensity', 18, 27)
    ctx.fillStyle = cat.color
    ctx.font = 'bold 11px monospace'
    ctx.fillText(`${cat.name}`, 74, 27)

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(`max wind  ${maxWind.toFixed(0)} m/s`, 18, 41)
    ctx.fillText(`Carnot η   ${eff.toFixed(0)}%`, 18, 55)

    // fuel bar
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('fuel', 18, 71)
    ctx.fillStyle = 'rgba(255,245,235,0.08)'
    ctx.fillRect(50, 63, 150, 9)
    const fuel = curLand ? 0 : clamp((curSst - SST_MIN) / (SST_MAX - SST_MIN), 0, 1)
    ctx.fillStyle = curLand || curSst < THRESHOLD ? BLUE : GOLD
    ctx.fillRect(50, 63, 150 * fuel, 9)
    // threshold tick
    const tx = 50 + 150 * ((THRESHOLD - SST_MIN) / (SST_MAX - SST_MIN))
    ctx.strokeStyle = 'rgba(245,240,232,0.6)'
    ctx.beginPath()
    ctx.moveTo(tx, 61)
    ctx.lineTo(tx, 74)
    ctx.stroke()
  }, [])

  const settle = useCallback(
    (n: number) => {
      let s = strengthRef.current
      for (let i = 0; i < n; i++) s = step()
      setStrength(s)
    },
    [step]
  )

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        settle(160)
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    seed()
    settle(80)
    draw()
  }, [seed, settle, draw])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      const s = step()
      draw()
      setStrength(s)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  useEffect(() => {
    if (!running) draw()
  }, [sst, land, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    setSst(DEFAULT_SST)
    setLand(false)
    sstRef.current = DEFAULT_SST
    landRef.current = false
    strengthRef.current = targetStrength(DEFAULT_SST, false)
    seed()
    settle(80)
    draw()
  }

  const maxWind = 17 + strength * 63

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · The heat engine
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
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Sea temp:</span>
          <input
            type="range"
            min={SST_MIN}
            max={SST_MAX}
            step={0.5}
            value={sst}
            disabled={land}
            onChange={e => setSst(+e.target.value)}
            className="w-36"
            style={{ accentColor: CYAN }}
          />
          <span className="font-mono text-text-secondary">{sst.toFixed(1)}°C</span>
        </div>
        <button
          onClick={() => setLand(l => !l)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: land ? '#5C4A30' : 'rgba(255,245,235,0.06)',
            color: land ? '#F5F0E8' : 'rgba(245,240,232,0.7)',
          }}
        >
          {land ? 'Back over ocean' : 'Move over land'}
        </button>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          {maxWind.toFixed(0)} m/s
        </span>
      </div>
    </div>
  )
}
