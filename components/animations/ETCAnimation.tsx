'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 620
const H = 380

// --- palette (Biology accent = lime) ----------------------------------------
const LIME = '#A3E635'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const TEXT = 'rgba(245,240,232,'

// --- geometry ---------------------------------------------------------------
// Deliberately mirrors the photosynthesis thylakoid widget: a low-H⁺ compartment
// on top (matrix), the membrane, and a high-H⁺ compartment below (intermembrane
// space). Protons are pumped down into it and flow back up through ATP synthase.
const MEM_TOP = 168        // matrix / membrane boundary
const MEM_BOT = 236        // membrane / intermembrane-space boundary
const IMS_BOT = 300        // outer edge of the intermembrane space

const CI_X = 104
const CIII_X = 250
const CIV_X = 386
const SYN_X = 524

const NADH_X = 48
const NADH_Y = 128

// Electron route: NADH -> complex I -> ubiquinone (in-membrane) -> complex III ->
// cytochrome c (in the intermembrane space) -> complex IV -> O2 (reduced to water).
const EPATH: [number, number][] = [
  [NADH_X, NADH_Y],
  [CI_X - 18, NADH_Y + 8],
  [CI_X, MEM_TOP + 2],
  [CI_X, MEM_BOT - 12],
  [CIII_X, MEM_BOT - 12],
  [CIII_X, MEM_BOT + 6],
  [CIV_X, MEM_BOT + 6],
  [CIV_X, MEM_TOP + 2],
  [CIV_X + 6, NADH_Y + 10],
]
const ESEG = EPATH.slice(1).map((p, i) => Math.hypot(p[0] - EPATH[i][0], p[1] - EPATH[i][1]))
const ELEN = ESEG.reduce((a, b) => a + b, 0)

function ePoint(d: number): { x: number; y: number } {
  let rest = ((d % ELEN) + ELEN) % ELEN
  for (let i = 0; i < ESEG.length; i++) {
    if (rest <= ESEG[i]) {
      const t = rest / ESEG[i]
      const a = EPATH[i]
      const b = EPATH[i + 1]
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t }
    }
    rest -= ESEG[i]
  }
  const last = EPATH[EPATH.length - 1]
  return { x: last[0], y: last[1] }
}

const N_ELECTRONS = 12

// --- supply response --------------------------------------------------------
// A saturating curve: linear while carriers are scarce, flattening once the
// complexes (not the substrate) become the bottleneck.
const KM = 0.22
function supplyResponse(s: number): number {
  return ((1 + KM) * s) / (s + KM)
}

// --- transient particles ----------------------------------------------------
type Bubble = { x: number; y: number; vy: number; life: number }
type Atp = { x: number; y: number; life: number }

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  supply: { default: 60, min: 0, max: 100, step: 1 },
}

export function ETCAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const supplyRef = useRef(0.6)
  const rateRef = useRef(0)
  const gradientRef = useRef(0)
  const rotorRef = useRef(0)
  const eOffsetRef = useRef(0)
  const tRef = useRef(0)
  const cyclesRef = useRef(0)
  const waterTimerRef = useRef(0)
  const spawnRef = useRef(0)

  const bubblesRef = useRef<Bubble[]>([])
  const atpsRef = useRef<Atp[]>([])

  const { params, set, permalink, isDefault, restored } = useWidgetParams('e-t-c', SPEC)
  const { supply } = params
  const [running, setRunning] = useState(false)
  const [rate, setRate] = useState(0)
  const [gradient, setGradient] = useState(0)
  const [cycles, setCycles] = useState(0)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  useEffect(() => { supplyRef.current = supply / 100 }, [supply])

  // --- drawing --------------------------------------------------------------
  const drawComplex = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, w: number, color: string, label: string, sub: string) => {
      ctx.beginPath()
      ctx.roundRect(x - w / 2, MEM_TOP - 6, w, MEM_BOT - MEM_TOP + 12, 7)
      ctx.fillStyle = `${color}22`
      ctx.fill()
      ctx.strokeStyle = `${color}88`
      ctx.lineWidth = 1.25
      ctx.stroke()
      ctx.textAlign = 'center'
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = color
      ctx.fillText(label, x, MEM_TOP + 12)
      ctx.font = '8px monospace'
      ctx.fillStyle = `${TEXT}0.45)`
      ctx.fillText(sub, x, MEM_TOP + 26)
    },
    []
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const s = supplyRef.current
    const v = rateRef.current
    const g = gradientRef.current

    ctx.clearRect(0, 0, W, H)
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'

    // --- compartments -------------------------------------------------------
    ctx.fillStyle = 'rgba(163,230,53,0.035)'
    ctx.fillRect(0, 0, W, MEM_TOP)
    ctx.fillStyle = `rgba(244,114,182,${0.05 + 0.16 * Math.min(1, g)})`
    ctx.fillRect(0, MEM_BOT, W, IMS_BOT - MEM_BOT)

    ctx.fillStyle = `${TEXT}0.42)`
    ctx.fillText('MATRIX   (low H⁺, pH ≈ 8)', 12, MEM_TOP - 10)
    ctx.fillStyle = `rgba(244,114,182,${0.45 + 0.45 * Math.min(1, g)})`
    ctx.fillText(`INTERMEMBRANE SPACE   (high H⁺, pH ≈ ${(8 - 1.4 * Math.min(1, g)).toFixed(1)})`, 12, IMS_BOT - 8)

    // --- inner membrane bilayer --------------------------------------------
    ctx.fillStyle = 'rgba(245,240,232,0.06)'
    ctx.fillRect(0, MEM_TOP, W, MEM_BOT - MEM_TOP)
    ctx.strokeStyle = 'rgba(245,240,232,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, MEM_TOP); ctx.lineTo(W, MEM_TOP)
    ctx.moveTo(0, MEM_BOT); ctx.lineTo(W, MEM_BOT)
    ctx.stroke()

    // --- proton haze (the gradient itself) ---------------------------------
    const nH = Math.round(6 + 34 * Math.min(1, g))
    ctx.font = 'bold 10px monospace'
    for (let i = 0; i < nH; i++) {
      const x = 16 + ((i * 71) % (W - 40))
      const y = MEM_BOT + 12 + ((i * 29) % (IMS_BOT - MEM_BOT - 24)) + Math.sin(tRef.current * 1.6 + i) * 2
      ctx.fillStyle = `rgba(244,114,182,${0.35 + 0.45 * Math.min(1, g)})`
      ctx.fillText('H⁺', x, y)
    }

    // --- complexes ----------------------------------------------------------
    drawComplex(ctx, CI_X, 92, GOLD, 'complex I', 'pump')
    drawComplex(ctx, CIII_X, 66, VIOLET, 'complex III', 'pump')
    drawComplex(ctx, CIV_X, 88, BLUE, 'complex IV', 'O₂ → H₂O')

    // ATP synthase: a channel spanning the membrane with a matrix-side rotor head.
    ctx.beginPath()
    ctx.roundRect(SYN_X - 15, MEM_TOP, 30, MEM_BOT - MEM_TOP + 8, 5)
    ctx.fillStyle = `${LIME}22`
    ctx.fill()
    ctx.strokeStyle = `${LIME}88`
    ctx.lineWidth = 1.25
    ctx.stroke()
    const rot = rotorRef.current
    ctx.save()
    ctx.translate(SYN_X, MEM_TOP - 16)
    ctx.rotate(rot)
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.ellipse(0, 0, 20, 9, (i * Math.PI) / 3, 0, Math.PI * 2)
      ctx.strokeStyle = `${LIME}AA`
      ctx.lineWidth = 1.4
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(0, 0, 4, 0, Math.PI * 2)
    ctx.fillStyle = LIME
    ctx.fill()
    ctx.restore()
    ctx.textAlign = 'center'
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = LIME
    ctx.fillText('ATP synthase', SYN_X, MEM_TOP - 34)
    ctx.font = '8px monospace'
    ctx.fillStyle = `${TEXT}0.45)`
    ctx.fillText('ADP + Pᵢ → ATP', SYN_X, MEM_TOP - 46)

    // --- the electron route -------------------------------------------------
    ctx.beginPath()
    ctx.moveTo(EPATH[0][0], EPATH[0][1])
    for (let i = 1; i < EPATH.length; i++) ctx.lineTo(EPATH[i][0], EPATH[i][1])
    ctx.strokeStyle = 'rgba(245,240,232,0.16)'
    ctx.lineWidth = 1.25
    ctx.stroke()

    ctx.font = '8px monospace'
    ctx.fillStyle = `${TEXT}0.42)`
    ctx.fillText('Q', (CI_X + CIII_X) / 2, MEM_BOT - 18)
    ctx.fillText('cyt c', (CIII_X + CIV_X) / 2 - 6, MEM_BOT + 18)

    if (v > 0.02) {
      for (let i = 0; i < N_ELECTRONS; i++) {
        const p = ePoint((i / N_ELECTRONS) * ELEN + eOffsetRef.current)
        ctx.beginPath()
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(96,165,250,${0.3 + 0.7 * Math.min(1, v)})`
        ctx.fill()
      }
    }

    // --- NADH source --------------------------------------------------------
    ctx.beginPath()
    ctx.arc(NADH_X, NADH_Y, 15, 0, Math.PI * 2)
    ctx.fillStyle = `${GOLD}22`
    ctx.fill()
    ctx.strokeStyle = `${GOLD}88`
    ctx.lineWidth = 1.25
    ctx.stroke()
    ctx.font = 'bold 8px monospace'
    ctx.fillStyle = GOLD
    ctx.textAlign = 'center'
    ctx.fillText('NADH', NADH_X, NADH_Y + 3)
    ctx.font = '8px monospace'
    ctx.fillStyle = `${TEXT}0.4)`
    ctx.fillText('from Krebs', NADH_X, NADH_Y + 26)

    // --- oxygen accepting electrons, water leaving --------------------------
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = `${TEXT}0.4)`
    ctx.fillText('½ O₂ + 2 H⁺ + 2 e⁻ → H₂O', CIV_X - 30, NADH_Y - 8)
    for (const b of bubblesRef.current) {
      const a = Math.max(0, Math.min(1, b.life))
      ctx.beginPath()
      ctx.arc(b.x, b.y, 8, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(96,165,250,${0.14 * a})`
      ctx.fill()
      ctx.strokeStyle = `rgba(96,165,250,${0.7 * a})`
      ctx.lineWidth = 1.25
      ctx.stroke()
      ctx.font = 'bold 9px monospace'
      ctx.fillStyle = `rgba(96,165,250,${0.95 * a})`
      ctx.fillText('H₂O', b.x - 8, b.y + 3)
    }

    // --- ATP popping off the synthase --------------------------------------
    for (const a of atpsRef.current) {
      const f = Math.max(0, Math.min(1, a.life))
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = `rgba(163,230,53,${f})`
      ctx.fillText('ATP', a.x, a.y)
    }

    // --- supply-response inset ----------------------------------------------
    const PX = W - 152, PY = 18, PW = 136, PH = 62
    ctx.strokeStyle = 'rgba(245,240,232,0.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PX, PY); ctx.lineTo(PX, PY + PH); ctx.lineTo(PX + PW, PY + PH)
    ctx.stroke()
    ctx.beginPath()
    for (let i = 0; i <= 60; i++) {
      const u = i / 60
      const x = PX + u * PW
      const y = PY + PH - (supplyResponse(u) / supplyResponse(1)) * (PH - 6)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = LIME
    ctx.lineWidth = 1.75
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(PX + s * PW, PY + PH - (supplyResponse(s) / supplyResponse(1)) * (PH - 6), 3.5, 0, Math.PI * 2)
    ctx.fillStyle = GOLD
    ctx.fill()
    ctx.font = '8px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = `${TEXT}0.4)`
    ctx.fillText('ATP vs supply', PX, PY - 5)
    ctx.textAlign = 'right'
    ctx.fillText('saturation', PX + PW, PY + 8)

    // --- headline readout ---------------------------------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = v > 0.05 ? LIME : PINK
    ctx.fillText(v > 0.05 ? 'OXIDATIVE PHOSPHORYLATION' : 'NO ELECTRON FLOW', 12, 24)
    ctx.font = '9px monospace'
    ctx.fillStyle = `${TEXT}0.5)`
    ctx.fillText('the same machine as the chloroplast, run downhill toward oxygen', 12, 40)
  }, [drawComplex])

  // --- simulation step ------------------------------------------------------
  const step = useCallback(() => {
    const s = supplyRef.current
    const target = s < 0.005 ? 0 : supplyResponse(s)
    rateRef.current += (target - rateRef.current) * 0.08
    const v = rateRef.current
    tRef.current += 0.05

    // Protons pumped in by complexes I, III, IV; protons out through ATP synthase,
    // at a flux that grows with the gradient itself.
    const pumpIn = v * 0.05
    const flux = gradientRef.current * 0.042
    gradientRef.current = Math.max(0, Math.min(1.4, gradientRef.current + pumpIn - flux))
    rotorRef.current += flux * 5.5
    eOffsetRef.current += 3.2 * v

    // Turnover bookkeeping: NADH oxidised feeds ~2.5 ATP through the chain.
    cyclesRef.current += v * 0.02

    // --- oxygen -> water at complex IV -------------------------------------
    waterTimerRef.current += v * 0.12
    while (waterTimerRef.current >= 1) {
      waterTimerRef.current -= 1
      const k = spawnRef.current++
      bubblesRef.current.push({ x: CIV_X + ((k * 11) % 12) - 6, y: MEM_TOP - 4, vy: -1.4, life: 1 })
    }
    bubblesRef.current = bubblesRef.current.filter(b => {
      b.y += b.vy
      b.vy -= 0.02
      if (b.y < MEM_TOP - 40) b.life -= 0.03
      return b.y > -14 && b.life > 0
    })

    // --- ATP output ---------------------------------------------------------
    if (flux > 0.002 && Math.floor(tRef.current * 6) % 3 === 0 && atpsRef.current.length < 14) {
      const k = spawnRef.current++
      atpsRef.current.push({ x: SYN_X + 20 + ((k * 7) % 22), y: MEM_TOP - 26, life: 1 })
    }
    atpsRef.current = atpsRef.current.filter(a => {
      a.y -= 0.9
      a.x += 0.35
      a.life -= 0.012
      return a.life > 0
    })

    setRate(v)
    setGradient(gradientRef.current)
    setCycles(cyclesRef.current)
  }, [])

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

  useEffect(() => { if (!running) draw() }, [running, supply, draw])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    supplyRef.current = 0.6
    rateRef.current = 0
    gradientRef.current = 0
    rotorRef.current = 0
    eOffsetRef.current = 0
    tRef.current = 0
    cyclesRef.current = 0
    waterTimerRef.current = 0
    spawnRef.current = 0
    bubblesRef.current = []
    atpsRef.current = []
    set('supply', 60)
    setRate(0)
    setGradient(0)
    setCycles(0)
    draw()
  }

  const atp = Math.floor(cycles * 2.5)
  const water = Math.floor(cycles)
  const relRate = rate / supplyResponse(1)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The electron transport chain and chemiosmosis</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-90"
          style={{ background: LIME, color: '#0F0D0A' }}
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>NADH supply:</span>
          <input
            type="range" min={SPEC.supply.min} max={SPEC.supply.max} step={SPEC.supply.step} value={supply}
            onChange={e => set('supply', +e.target.value)}
            className="w-36"
            style={{ accentColor: GOLD }}
          />
          <span className="text-text-secondary font-mono">{supply}%</span>
        </label>
        <span className="text-xs font-mono" style={{ color: relRate > 0.05 ? LIME : PINK }}>
          rate {(relRate * 100).toFixed(0)}% · gradient {(gradient * 100 / 1.4).toFixed(0)}%
        </span>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          ATP {atp} · H₂O {water}
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Raise the supply and the ATP output rises with it; oxygen quietly accepts every spent electron at complex IV and leaves as water.
      </p>
    </div>
  )
}
