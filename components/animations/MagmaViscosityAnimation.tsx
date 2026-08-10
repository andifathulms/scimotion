'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 380

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const ORANGE = '#FB923C'

const VENT_X = 300
const VENT_Y = 92
const GROUND = 215
const BASE_L = 182
const BASE_R = 418
const CH_CX = 300
const CH_CY = 328
const CH_RX = 94
const CH_RY = 36

// Deterministic PRNG so the sim never uses Math.random / Date.now.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Bubble = { x: number; y: number; r: number; trapped: boolean }
type Ash = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; hot: number }
type Spark = { x: number; y: number; vx: number; vy: number; life: number }

// Physical intuition, mapped from silica fraction (45%..75%).
function model(silica: number) {
  const s = (silica - 45) / 30 // 0 (basalt) .. 1 (rhyolite)
  const logVisc = 2 + s * 6 // 10^2 .. 10^8 Pa·s
  const riseSpeed = Math.max(0.28, 2.7 - s * 2.5)
  const explosive = silica >= 58
  const expansion = 0.006 + s * 0.05
  const type = silica < 52 ? 'basaltic' : silica < 63 ? 'andesitic' : 'rhyolitic'
  return { s, logVisc, riseSpeed, explosive, expansion, type }
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  silica: { default: 53, min: 45, max: 75, step: 1 },
}

export function MagmaViscosityAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const runningRef = useRef(false)

  const silicaRef = useRef(53)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('magma-viscosity', SPEC)
  const { silica } = params

  const rngRef = useRef(mulberry32(0x5eed))
  const frameRef = useRef(0)
  const bubblesRef = useRef<Bubble[]>([])
  const ashRef = useRef<Ash[]>([])
  const sparksRef = useRef<Spark[]>([])
  const pressureRef = useRef(0)
  const lavaRef = useRef(0)
  const flashRef = useRef(0)

  const [readout, setReadout] = useState<{ visc: string; gas: string; style: string; type: string; press: number }>(
    { visc: '', gas: '', style: '', type: '', press: 0 }
  )

  const setupCanvas = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    setupCanvas(ctx, canvas)

    const m = model(silicaRef.current)

    // background & sky
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND)
    sky.addColorStop(0, '#0F0D0A')
    sky.addColorStop(1, '#17130E')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, GROUND)

    // eruption flash halo
    if (flashRef.current > 0) {
      const g = ctx.createRadialGradient(VENT_X, VENT_Y, 4, VENT_X, VENT_Y, 160)
      g.addColorStop(0, `rgba(251,146,60,${0.5 * flashRef.current})`)
      g.addColorStop(1, 'rgba(251,146,60,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, GROUND)
    }

    // ash particles (behind cone edges but drawn over sky)
    for (const a of ashRef.current) {
      const f = a.life / a.max
      const col = a.hot > 0.5 ? `rgba(251,146,60,${0.5 * f})` : `rgba(150,140,135,${0.45 * f})`
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2)
      ctx.fill()
    }

    // ground
    ctx.fillStyle = '#241d16'
    ctx.fillRect(0, GROUND, W, H - GROUND)
    ctx.strokeStyle = 'rgba(245,240,232,0.14)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, GROUND)
    ctx.lineTo(W, GROUND)
    ctx.stroke()

    // volcano cone
    ctx.beginPath()
    ctx.moveTo(BASE_L, GROUND)
    ctx.lineTo(VENT_X - 12, VENT_Y + 4)
    ctx.lineTo(VENT_X + 12, VENT_Y + 4)
    ctx.lineTo(BASE_R, GROUND)
    ctx.closePath()
    ctx.fillStyle = '#33291f'
    ctx.fill()
    ctx.strokeStyle = 'rgba(245,240,232,0.10)'
    ctx.stroke()

    // magma chamber
    const chGlow = ctx.createRadialGradient(CH_CX, CH_CY, 6, CH_CX, CH_CY, CH_RX)
    chGlow.addColorStop(0, '#FFB347')
    chGlow.addColorStop(0.6, '#E8641E')
    chGlow.addColorStop(1, 'rgba(120,40,10,0.15)')
    ctx.fillStyle = chGlow
    ctx.beginPath()
    ctx.ellipse(CH_CX, CH_CY, CH_RX, CH_RY, 0, 0, Math.PI * 2)
    ctx.fill()

    // conduit (magma-filled channel)
    ctx.fillStyle = '#B94A16'
    ctx.fillRect(VENT_X - 9, VENT_Y, 18, CH_CY - VENT_Y)
    const cGrad = ctx.createLinearGradient(0, VENT_Y, 0, CH_CY)
    cGrad.addColorStop(0, 'rgba(255,180,71,0.35)')
    cGrad.addColorStop(1, 'rgba(255,120,40,0.9)')
    ctx.fillStyle = cGrad
    ctx.fillRect(VENT_X - 9, VENT_Y, 18, CH_CY - VENT_Y)

    // lava flow (effusive)
    if (lavaRef.current > 0.02) {
      const lv = Math.min(1, lavaRef.current)
      ctx.strokeStyle = `rgba(255,150,60,${0.85 * lv})`
      ctx.lineWidth = 4 + 6 * lv
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(VENT_X + 6, VENT_Y + 6)
      ctx.quadraticCurveTo(VENT_X + 60, 150, BASE_R - 20, GROUND - 2)
      ctx.stroke()
      // glowing pool at base
      ctx.fillStyle = `rgba(255,140,50,${0.6 * lv})`
      ctx.beginPath()
      ctx.ellipse(BASE_R - 10, GROUND, 26 * lv + 6, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineCap = 'butt'
    }

    // bubbles rising in the conduit / chamber
    for (const b of bubblesRef.current) {
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
      ctx.fillStyle = b.trapped ? 'rgba(255,240,220,0.85)' : 'rgba(255,250,240,0.6)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,220,180,0.9)'
      ctx.lineWidth = 0.8
      ctx.stroke()
    }

    // sparks (lava fountain)
    for (const sp of sparksRef.current) {
      ctx.fillStyle = `rgba(255,190,90,${Math.max(0, sp.life / 30)})`
      ctx.fillRect(sp.x, sp.y, 2, 2)
    }

    // pressure gauge for explosive magma
    if (m.explosive) {
      const gx = 470
      const gy = 250
      const gw = 100
      ctx.fillStyle = 'rgba(255,245,235,0.10)'
      ctx.fillRect(gx, gy, gw, 8)
      const p = Math.min(1, pressureRef.current)
      ctx.fillStyle = p > 0.75 ? '#EF4444' : ORANGE
      ctx.fillRect(gx, gy, gw * p, 8)
      ctx.font = '8px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.55)'
      ctx.textAlign = 'left'
      ctx.fillText('gas pressure', gx, gy - 4)
    }

    // labels
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = CYAN
    ctx.fillText('why some ooze and some explode', 12, 18)
    ctx.font = '8px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('bubbles nucleate as magma rises and pressure drops (Henry’s law)', 12, 32)

    ctx.textAlign = 'center'
    ctx.font = '8px monospace'
    ctx.fillStyle = 'rgba(255,220,180,0.75)'
    ctx.fillText('magma chamber', CH_CX, CH_CY + 2)

    ctx.textAlign = 'right'
    ctx.font = '9px monospace'
    ctx.fillStyle = m.explosive ? '#EF4444' : GOLD
    ctx.fillText(m.explosive ? 'EXPLOSIVE' : 'EFFUSIVE', W - 12, 18)
  }, [setupCanvas])

  const step = useCallback(() => {
    const m = model(silicaRef.current)
    const rng = rngRef.current
    frameRef.current++

    // spawn bubbles from the chamber
    if (frameRef.current % 9 === 0 && bubblesRef.current.length < 34) {
      const bx = CH_CX + (rng() - 0.5) * CH_RX * 1.2
      bubblesRef.current.push({ x: bx, y: CH_CY + (rng() - 0.5) * 10, r: 1.4 + rng() * 1.2, trapped: false })
    }

    const next: Bubble[] = []
    for (const b of bubblesRef.current) {
      // funnel toward the conduit as bubbles enter it
      if (b.y < CH_CY - CH_RY) b.x += (VENT_X + (rng() - 0.5) * 12 - b.x) * 0.08
      b.r += m.expansion * (b.trapped ? 1.7 : 1)

      if (m.explosive) {
        b.y -= m.riseSpeed * 0.55
        if (b.y < 190) {
          b.trapped = true
          pressureRef.current += 0.0011
        }
        b.y = Math.max(b.y, VENT_Y + 16) // trapped foam cannot reach the vent
        next.push(b)
      } else {
        b.y -= m.riseSpeed
        if (b.y <= VENT_Y + 4) {
          // gas escapes gently; feed the effusive lava flow + a small fountain
          lavaRef.current = Math.min(1.2, lavaRef.current + 0.05)
          for (let i = 0; i < 3; i++) {
            sparksRef.current.push({
              x: VENT_X + (rng() - 0.5) * 6,
              y: VENT_Y,
              vx: (rng() - 0.5) * 2.2,
              vy: -1.6 - rng() * 2.4,
              life: 22 + rng() * 8,
            })
          }
        } else {
          next.push(b)
        }
      }
    }
    bubblesRef.current = next

    // effusive lava decays when no bubbles feed it
    if (!m.explosive) lavaRef.current *= 0.985
    else lavaRef.current *= 0.9

    // explosive release
    if (m.explosive && pressureRef.current >= 1) {
      pressureRef.current = 0
      flashRef.current = 1
      bubblesRef.current = []
      const n = 90
      for (let i = 0; i < n; i++) {
        const ang = -Math.PI / 2 + (rng() - 0.5) * 1.5
        const spd = 3 + rng() * 5 + m.s * 2
        ashRef.current.push({
          x: VENT_X + (rng() - 0.5) * 10,
          y: VENT_Y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 90 + rng() * 60,
          max: 150,
          r: 1.5 + rng() * 3,
          hot: rng(),
        })
      }
    }

    // advance ash
    flashRef.current *= 0.92
    const nextAsh: Ash[] = []
    for (const a of ashRef.current) {
      a.vy += 0.055
      a.vx *= 0.992
      a.x += a.vx
      a.y += a.vy
      a.hot *= 0.96
      a.life--
      if (a.y > GROUND) {
        // pyroclastic spread along the ground
        a.y = GROUND
        a.vy = 0
        a.vx *= 0.85
        a.x += a.vx
      }
      if (a.life > 0) nextAsh.push(a)
    }
    ashRef.current = nextAsh

    // advance sparks
    const nextSp: Spark[] = []
    for (const sp of sparksRef.current) {
      sp.vy += 0.14
      sp.x += sp.vx
      sp.y += sp.vy
      sp.life--
      if (sp.life > 0 && sp.y < GROUND) nextSp.push(sp)
    }
    sparksRef.current = nextSp

    // update readout ~6x/sec
    if (frameRef.current % 10 === 0) {
      setReadout({
        visc: `10^${m.logVisc.toFixed(1)} Pa·s`,
        gas: m.explosive ? 'trapped — pressure rising' : 'escapes freely',
        style: m.explosive ? 'EXPLOSIVE' : 'EFFUSIVE',
        type: m.type,
        press: Math.round(Math.min(1, pressureRef.current) * 100),
      })
    }
  }, [])

  const ensureLoop = useCallback(() => {
    if (rafRef.current) return
    const loop = () => {
      if (!runningRef.current) {
        rafRef.current = 0
        return
      }
      step()
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [step, draw])

  const { ref } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // one static final frame: a representative snapshot, no loop
        for (let i = 0; i < 40; i++) step()
        draw()
        return
      }
      runningRef.current = true
      ensureLoop()
    },
  })

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const onSilica = (v: number) => {
    silicaRef.current = v
    set('silica', v)
    // switching regime should not leave stale foam/pressure hanging
    pressureRef.current = 0
    if (!runningRef.current) draw()
  }

  const reset = () => {
    rngRef.current = mulberry32(0x5eed)
    frameRef.current = 0
    bubblesRef.current = []
    ashRef.current = []
    sparksRef.current = []
    pressureRef.current = 0
    lavaRef.current = 0
    flashRef.current = 0
    draw()
  }

  const m = model(silica)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Drag the silica slider
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
          role="img"
          aria-label="Animated diagram: Drag the silica slider. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-secondary w-full">
          <span className="text-text-muted whitespace-nowrap">
            silica <strong style={{ color: CYAN }}>{silica}%</strong>
          </span>
          <input
            type="range"
            min={SPEC.silica.min}
            max={SPEC.silica.max}
            step={SPEC.silica.step}
            value={silica}
            onChange={e => onSilica(Number(e.target.value))}
            className="flex-1 accent-accent-teal"
            style={{ accentColor: CYAN }}
            aria-label="silica content percent"
          />
          <span className="text-text-muted whitespace-nowrap">runny → viscous</span>
        </label>
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>SiO<sub>2</sub>: <span style={{ color: CYAN }}>{silica}%</span> ({readout.type || m.type})</span>
        <span>viscosity: {readout.visc || `10^${m.logVisc.toFixed(1)} Pa·s`}</span>
        <span>gas: {readout.gas || (m.explosive ? 'trapped — pressure rising' : 'escapes freely')}</span>
        {m.explosive && <span>pressure: {readout.press}%</span>}
        <span>
          style:{' '}
          <span style={{ color: m.explosive ? '#EF4444' : GOLD }}>
            {readout.style || (m.explosive ? 'EXPLOSIVE' : 'EFFUSIVE')}
          </span>
        </span>
      </div>
    </div>
  )
}
