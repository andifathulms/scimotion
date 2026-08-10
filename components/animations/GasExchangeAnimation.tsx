'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 290

// Colours
const PINK = '#F472B6'
const GOLD = '#F59E0B' // O2
const VIOLET = '#A78BFA' // CO2
const BLUE: [number, number, number] = [96, 165, 250] // deoxygenated blood
const RED: [number, number, number] = [248, 113, 113] // oxygenated blood

// Vertical layout (px). Barrier grows upward from a fixed bottom edge, so a
// thicker barrier eats into the air space above it.
const AIR_TOP = 24
const BARRIER_BOT = 162
const CAP_TOP = 176
const CAP_BOT = 252
const CAP_MID = (CAP_TOP + CAP_BOT) / 2
const X1 = 60 // left edge of the exchange interface
const X2 = 560 // right edge

const VENOUS_PO2 = 40 // mmHg — blood arriving from the tissues

type Cross = { x: number; y: number; vy: number }
type RBC = { x: number; y: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const bloodColor = (sat: number) => {
  const t = Math.max(0, Math.min(1, sat))
  const r = Math.round(lerp(BLUE[0], RED[0], t))
  const g = Math.round(lerp(BLUE[1], RED[1], t))
  const b = Math.round(lerp(BLUE[2], RED[2], t))
  return `rgb(${r},${g},${b})`
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  alvO2: { default: 100, min: 40, max: 120, step: 1 },
  thick: { default: 1, min: 0.5, max: 3, step: 0.1 },
}

export function GasExchangeAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('gas-exchange', SPEC)
  const { alvO2, thick } = params
  const [running, setRunning] = useState(false)
  const [reducedStatic, setReducedStatic] = useState(false)

  const alvRef = useRef(alvO2)
  const thickRef = useRef(thick)
  useEffect(() => { alvRef.current = alvO2 })
  useEffect(() => { thickRef.current = thick })

  // particle pools live in refs so the rAF loop mutates them without re-rendering
  const o2Ref = useRef<Cross[]>([])
  const co2Ref = useRef<Cross[]>([])
  const rbcRef = useRef<RBC[]>([])
  const spawnAcc = useRef(0)

  // Fick's law: flux ∝ ΔP / thickness. Normalise so alvO2=100, thick=1 → 1.0.
  const fluxRel = ((alvO2 - VENOUS_PO2) / (100 - VENOUS_PO2)) / thick
  const barrierPx = 8 + thick * 10 // 18px at normal thickness

  const seedRBCs = useCallback(() => {
    const cells: RBC[] = []
    for (let i = 0; i < 9; i++) {
      cells.push({ x: X1 + (i / 9) * (X2 - X1), y: CAP_MID + (i % 2 === 0 ? -8 : 8) })
    }
    rbcRef.current = cells
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const alv = alvRef.current
    const th = thickRef.current
    const bPx = 8 + th * 10
    const barrierTop = BARRIER_BOT - bPx
    const flux = ((alv - VENOUS_PO2) / (100 - VENOUS_PO2)) / th

    ctx.clearRect(0, 0, W, H)

    // --- alveolar air space ---
    ctx.fillStyle = 'rgba(244,114,182,0.05)'
    ctx.fillRect(0, 0, W, barrierTop)
    ctx.strokeStyle = 'rgba(244,114,182,0.18)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, W - 1, barrierTop)

    // ambient O2 in the air — density tracks alveolar pO2
    const airCount = Math.round((alv / 120) * 44)
    ctx.fillStyle = 'rgba(245,158,11,0.5)'
    for (let i = 0; i < airCount; i++) {
      // deterministic scatter so the static frame is stable
      const x = 30 + ((i * 97) % (W - 60))
      const y = AIR_TOP + 6 + ((i * 53) % Math.max(1, barrierTop - AIR_TOP - 14))
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill()
    }

    ctx.fillStyle = GOLD
    ctx.font = '11px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`Alveolus (air) · pO₂ ${Math.round(alv)} mmHg`, 10, 16)

    // --- the barrier (respiratory membrane) ---
    ctx.fillStyle = 'rgba(245,240,232,0.12)'
    ctx.fillRect(0, barrierTop, W, bPx)
    ctx.strokeStyle = 'rgba(245,240,232,0.3)'
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(0, barrierTop); ctx.lineTo(W, barrierTop); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, BARRIER_BOT); ctx.lineTo(W, BARRIER_BOT); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.font = '10px monospace'
    ctx.fillText(`barrier ~${(0.5 * th).toFixed(1)} µm`, W - 120, barrierTop + bPx / 2 + 3)

    // --- capillary (blood) ---
    ctx.fillStyle = 'rgba(96,165,250,0.06)'
    ctx.fillRect(0, CAP_TOP, W, CAP_BOT - CAP_TOP)
    ctx.strokeStyle = 'rgba(96,165,250,0.2)'
    ctx.strokeRect(0.5, CAP_TOP, W - 1, CAP_BOT - CAP_TOP)

    // red blood cells drifting left→right, oxygenating as they cross the interface
    for (const c of rbcRef.current) {
      const frac = (c.x - X1) / (X2 - X1)
      const sat = Math.max(0, Math.min(1, flux * frac))
      ctx.fillStyle = bloodColor(sat)
      ctx.beginPath(); ctx.ellipse(c.x, c.y, 8, 5, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(15,13,10,0.35)'
      ctx.beginPath(); ctx.ellipse(c.x, c.y, 3, 2, 0, 0, Math.PI * 2); ctx.fill()
    }

    // flow direction labels
    ctx.fillStyle = bloodColor(0)
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('deoxygenated in →', 8, CAP_BOT + 14)
    ctx.fillStyle = bloodColor(1)
    ctx.textAlign = 'right'
    ctx.fillText('→ oxygenated out', W - 8, CAP_BOT + 14)

    // --- crossing molecules ---
    ctx.textAlign = 'left'
    for (const p of o2Ref.current) {
      ctx.fillStyle = GOLD
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill()
    }
    for (const p of co2Ref.current) {
      ctx.fillStyle = VIOLET
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill()
    }

    // gradient arrows + legend
    ctx.fillStyle = GOLD
    ctx.font = '10px monospace'
    ctx.fillText('O₂ ↓ (high → low pO₂)', 12, barrierTop - 8)
    ctx.fillStyle = VIOLET
    ctx.textAlign = 'right'
    ctx.fillText('CO₂ ↑', W - 12, BARRIER_BOT + 16)
    ctx.textAlign = 'left'
  }, [])

  const stepParticles = useCallback(() => {
    const alv = alvRef.current
    const th = thickRef.current
    const bPx = 8 + th * 10
    const barrierTop = BARRIER_BOT - bPx
    const flux = ((alv - VENOUS_PO2) / (100 - VENOUS_PO2)) / th

    // move RBCs
    for (const c of rbcRef.current) {
      c.x += 1.1
      if (c.x > X2 + 12) c.x = X1 - 12
    }

    // spawn crossers in proportion to flux
    spawnAcc.current += Math.max(0, flux) * 0.9
    while (spawnAcc.current >= 1) {
      spawnAcc.current -= 1
      const x = X1 + Math.random() * (X2 - X1)
      o2Ref.current.push({ x, y: AIR_TOP + 20 + Math.random() * 30, vy: 1.1 + Math.random() * 0.6 })
      // CO2 leaves the blood the other way, driven by its own (opposite) gradient
      if (Math.random() < 0.7) {
        co2Ref.current.push({ x: X1 + Math.random() * (X2 - X1), y: CAP_MID, vy: -(0.9 + Math.random() * 0.5) })
      }
    }

    // advance & retire O2 (down into blood)
    o2Ref.current = o2Ref.current.filter(p => {
      p.y += p.vy
      p.x += (Math.random() - 0.5) * 0.6
      return p.y < CAP_MID + 6
    })
    // advance & retire CO2 (up into the air)
    co2Ref.current = co2Ref.current.filter(p => {
      p.y += p.vy
      p.x += (Math.random() - 0.5) * 0.6
      return p.y > barrierTop - 24
    })

    // keep pools bounded
    if (o2Ref.current.length > 220) o2Ref.current.length = 220
    if (co2Ref.current.length > 160) co2Ref.current.length = 160
  }, [])

  // animation loop
  useEffect(() => {
    if (!running || reducedStatic) return
    let raf = 0
    const loop = () => {
      stepParticles()
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running, reducedStatic, stepParticles, draw])

  // repaint when idle / sliders change while paused
  useEffect(() => {
    if (running && !reducedStatic) return
    draw()
  }, [running, reducedStatic, alvO2, thick, draw])

  // static (reduced-motion) frame
  useEffect(() => {
    if (!reducedStatic) return
    const o2: Cross[] = []
    const co2: Cross[] = []
    for (let i = 0; i < 30; i++) {
      o2.push({ x: X1 + Math.random() * (X2 - X1), y: AIR_TOP + 30 + Math.random() * 110, vy: 0 })
    }
    for (let i = 0; i < 18; i++) {
      co2.push({ x: X1 + Math.random() * (X2 - X1), y: BARRIER_BOT - 10 - Math.random() * 90, vy: 0 })
    }
    o2Ref.current = o2
    co2Ref.current = co2
    draw()
  }, [reducedStatic, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      seedRBCs()
      if (reduced) { setReducedStatic(true); return }
      setRunning(true)
    },
  })

  useEffect(() => { seedRBCs() }, [seedRBCs])

  const reset = () => {
    triggerReset()
    setRunning(false)
    setReducedStatic(false)
    set('alvO2', 100)
    set('thick', 1)
    alvRef.current = 100
    thickRef.current = 1
    o2Ref.current = []
    co2Ref.current = []
    spawnAcc.current = 0
    seedRBCs()
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Gas exchange at the alveolus
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
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { setReducedStatic(false); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-pink text-bg-base text-xs font-medium hover:bg-accent-pink/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Alveolar pO₂:</span>
          <input
            type="range" min={SPEC.alvO2.min} max={SPEC.alvO2.max} step={SPEC.alvO2.step} value={alvO2}
            onChange={e => set('alvO2', +e.target.value)}
            className="w-32 accent-accent-pink"
          />
          <span className="text-text-secondary font-mono">{alvO2}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Barrier:</span>
          <span className="text-text-secondary">thin</span>
          <input
            type="range" min={SPEC.thick.min} max={SPEC.thick.max} step={SPEC.thick.step} value={thick}
            onChange={e => set('thick', +e.target.value)}
            className="w-28 accent-accent-pink"
          />
          <span className="text-text-secondary">thick</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          O₂ flux <strong style={{ color: PINK }}>{Math.round(fluxRel * 100)}%</strong>
          <span className="text-text-muted"> · barrier {barrierPx > 0 ? (0.5 * thick).toFixed(1) : ''}µm</span>
        </span>
      </div>
    </div>
  )
}
