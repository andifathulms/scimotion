'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'
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
const MEM_TOP = 168        // stroma / membrane boundary
const MEM_BOT = 236        // membrane / lumen boundary
const LUMEN_BOT = 300      // bottom of the thylakoid lumen

const PSII_X = 108
const B6F_X = 246
const PSI_X = 372
const SYN_X = 522

const NADP_X = 452
const NADP_Y = 128

// Electron route: PSII -> plastoquinone (in-membrane) -> cyt b6f ->
// plastocyanin (in the lumen) -> PSI -> ferredoxin -> NADP+.
const EPATH: [number, number][] = [
  [PSII_X, MEM_TOP + 4],
  [PSII_X, MEM_BOT - 12],
  [B6F_X, MEM_BOT - 12],
  [B6F_X, MEM_BOT + 6],
  [PSI_X, MEM_BOT + 6],
  [PSI_X, MEM_TOP + 2],
  [NADP_X - 18, NADP_Y + 10],
  [NADP_X, NADP_Y],
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

// --- light response ---------------------------------------------------------
// A rectangular-hyperbola light curve: linear at low intensity, saturating once
// the electron carriers (not the photons) become the bottleneck.
const KM = 0.22
function lightResponse(l: number): number {
  return ((1 + KM) * l) / (l + KM)
}

// --- transient particles ----------------------------------------------------
type Photon = { x: number; y: number; tx: number; ty: number; t: number; speed: number }
type Water = { x: number; y: number; t: number; slot: number }
type Bubble = { x: number; y: number; vy: number; life: number }
type Atp = { x: number; y: number; life: number }

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  light: { default: 55, min: 0, max: 100, step: 1 },
}

export function PhotosynthesisAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const lightRef = useRef(0.55)
  const rateRef = useRef(0)
  const gradientRef = useRef(0)
  const rotorRef = useRef(0)
  const eOffsetRef = useRef(0)
  const tRef = useRef(0)
  const cyclesRef = useRef(0)
  const photonTimerRef = useRef(0)
  const waterTimerRef = useRef(0)
  const spawnRef = useRef(0)

  const photonsRef = useRef<Photon[]>([])
  const watersRef = useRef<Water[]>([])
  const bubblesRef = useRef<Bubble[]>([])
  const atpsRef = useRef<Atp[]>([])

  const { params, set, permalink, isDefault, restored } = useWidgetParams('photosynthesis', SPEC)
  const { light } = params
  const [running, setRunning] = useState(false)
  const [rate, setRate] = useState(0)
  const [gradient, setGradient] = useState(0)
  const [cycles, setCycles] = useState(0)

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  useEffect(() => { lightRef.current = light / 100 }, [light])

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

    const l = lightRef.current
    const v = rateRef.current
    const g = gradientRef.current

    ctx.clearRect(0, 0, W, H)
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'

    // --- compartments -------------------------------------------------------
    ctx.fillStyle = 'rgba(163,230,53,0.035)'
    ctx.fillRect(0, 0, W, MEM_TOP)
    ctx.fillStyle = `rgba(244,114,182,${0.05 + 0.16 * Math.min(1, g)})`
    ctx.fillRect(0, MEM_BOT, W, LUMEN_BOT - MEM_BOT)

    ctx.fillStyle = `${TEXT}0.42)`
    ctx.fillText('STROMA   (low H⁺, pH ≈ 8)', 12, MEM_TOP - 10)
    ctx.fillStyle = `rgba(244,114,182,${0.45 + 0.45 * Math.min(1, g)})`
    ctx.fillText(`THYLAKOID LUMEN   (high H⁺, pH ≈ ${(8 - 3 * Math.min(1, g)).toFixed(1)})`, 12, LUMEN_BOT - 8)

    // --- membrane bilayer ---------------------------------------------------
    ctx.fillStyle = 'rgba(245,240,232,0.06)'
    ctx.fillRect(0, MEM_TOP, W, MEM_BOT - MEM_TOP)
    ctx.strokeStyle = 'rgba(245,240,232,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, MEM_TOP); ctx.lineTo(W, MEM_TOP)
    ctx.moveTo(0, MEM_BOT); ctx.lineTo(W, MEM_BOT)
    ctx.stroke()

    // --- lumen proton haze (the gradient itself) ----------------------------
    const nH = Math.round(6 + 34 * Math.min(1, g))
    ctx.font = 'bold 10px monospace'
    for (let i = 0; i < nH; i++) {
      const x = 16 + ((i * 71) % (W - 40))
      const y = MEM_BOT + 12 + ((i * 29) % (LUMEN_BOT - MEM_BOT - 24)) + Math.sin(tRef.current * 1.6 + i) * 2
      ctx.fillStyle = `rgba(244,114,182,${0.35 + 0.45 * Math.min(1, g)})`
      ctx.fillText('H⁺', x, y)
    }

    // --- complexes ----------------------------------------------------------
    drawComplex(ctx, PSII_X, 92, GOLD, 'PS II', 'P680')
    drawComplex(ctx, B6F_X, 66, VIOLET, 'cyt b6f', 'pump')
    drawComplex(ctx, PSI_X, 88, BLUE, 'PS I', 'P700')

    // ATP synthase: a lumen-side channel with a stroma-side rotor head.
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
    ctx.fillText('PQ', (PSII_X + B6F_X) / 2, MEM_BOT - 18)
    ctx.fillText('PC', (B6F_X + PSI_X) / 2, MEM_BOT + 18)
    ctx.fillText('Fd', (PSI_X + NADP_X) / 2 + 4, NADP_Y + 30)

    if (v > 0.02) {
      for (let i = 0; i < N_ELECTRONS; i++) {
        const p = ePoint((i / N_ELECTRONS) * ELEN + eOffsetRef.current)
        ctx.beginPath()
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(96,165,250,${0.3 + 0.7 * Math.min(1, v)})`
        ctx.fill()
      }
    }

    // --- NADP+ / NADPH terminus --------------------------------------------
    ctx.beginPath()
    ctx.arc(NADP_X, NADP_Y, 13, 0, Math.PI * 2)
    ctx.fillStyle = `${BLUE}22`
    ctx.fill()
    ctx.strokeStyle = `${BLUE}88`
    ctx.lineWidth = 1.25
    ctx.stroke()
    ctx.font = 'bold 8px monospace'
    ctx.fillStyle = BLUE
    ctx.fillText('NADPH', NADP_X, NADP_Y + 3)

    // --- water splitting at the PS II lumen face ----------------------------
    ctx.font = '9px monospace'
    for (const w of watersRef.current) {
      const a = Math.min(1, w.t * 3)
      ctx.fillStyle = `rgba(96,165,250,${0.35 + 0.5 * a})`
      ctx.fillText('H₂O', w.x, w.y)
    }
    ctx.fillStyle = `${TEXT}0.4)`
    ctx.fillText('2 H₂O in', 40, LUMEN_BOT - 24)

    // --- oxygen leaving, built from the split water -------------------------
    for (const b of bubblesRef.current) {
      const a = Math.max(0, Math.min(1, b.life))
      ctx.beginPath()
      ctx.arc(b.x, b.y, 8, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(163,230,53,${0.14 * a})`
      ctx.fill()
      ctx.strokeStyle = `rgba(163,230,53,${0.75 * a})`
      ctx.lineWidth = 1.25
      ctx.stroke()
      ctx.font = 'bold 9px monospace'
      ctx.fillStyle = `rgba(163,230,53,${0.95 * a})`
      ctx.fillText('O₂', b.x, b.y + 3)
    }

    // --- ATP popping off the synthase --------------------------------------
    for (const a of atpsRef.current) {
      const f = Math.max(0, Math.min(1, a.life))
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = `rgba(163,230,53,${f})`
      ctx.fillText('ATP', a.x, a.y)
    }

    // --- photons ------------------------------------------------------------
    for (const p of photonsRef.current) {
      const dx = p.tx - p.x
      const dy = p.ty - p.y
      const d = Math.max(1, Math.hypot(dx, dy))
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - (dx / d) * 11, p.y - (dy / d) * 11)
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 1.75
      ctx.stroke()
    }

    // --- light-response inset ------------------------------------------------
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
      const y = PY + PH - (lightResponse(u) / lightResponse(1)) * (PH - 6)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = LIME
    ctx.lineWidth = 1.75
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(PX + l * PW, PY + PH - (lightResponse(l) / lightResponse(1)) * (PH - 6), 3.5, 0, Math.PI * 2)
    ctx.fillStyle = GOLD
    ctx.fill()
    ctx.font = '8px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = `${TEXT}0.4)`
    ctx.fillText('rate vs light', PX, PY - 5)
    ctx.textAlign = 'right'
    ctx.fillText('saturation', PX + PW, PY + 8)

    // --- headline readout ---------------------------------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = v > 0.05 ? LIME : PINK
    ctx.fillText(v > 0.05 ? 'LINEAR ELECTRON FLOW' : 'DARK — NO ELECTRON FLOW', 12, 24)
    ctx.font = '9px monospace'
    ctx.fillStyle = `${TEXT}0.5)`
    ctx.fillText('2 H₂O → O₂ + 4 H⁺ + 4 e⁻   ·   the O₂ you breathe comes from water, not CO₂', 12, 40)
  }, [drawComplex])

  // --- simulation step ------------------------------------------------------
  const step = useCallback(() => {
    const l = lightRef.current
    const target = l < 0.005 ? 0 : lightResponse(l)
    rateRef.current += (target - rateRef.current) * 0.08
    const v = rateRef.current
    tRef.current += 0.05

    // Protons in: water splitting (2 H+ per H2O oxidised, released into the
    // lumen) plus the b6f pump. Protons out: through ATP synthase, at a flux
    // that grows with the gradient itself.
    const pumpIn = v * 0.05
    const flux = gradientRef.current * 0.042
    gradientRef.current = Math.max(0, Math.min(1.4, gradientRef.current + pumpIn - flux))
    rotorRef.current += flux * 5.5
    eOffsetRef.current += 3.2 * v

    // Turnover bookkeeping: one "cycle" = 2 H2O split = 1 O2 + 2 NADPH + ~3 ATP.
    cyclesRef.current += v * 0.014

    // --- photons ------------------------------------------------------------
    photonTimerRef.current += l * 0.55
    while (photonTimerRef.current >= 1) {
      photonTimerRef.current -= 1
      const k = spawnRef.current++
      const toPSII = k % 2 === 0
      const tx = toPSII ? PSII_X + ((k * 13) % 60) - 30 : PSI_X + ((k * 17) % 56) - 28
      const x0 = tx - 120 + ((k * 23) % 40)
      photonsRef.current.push({ x: x0, y: -8, tx, ty: MEM_TOP - 2, t: 0, speed: 5.5 })
    }
    photonsRef.current = photonsRef.current.filter(p => {
      const dx = p.tx - p.x
      const dy = p.ty - p.y
      const d = Math.hypot(dx, dy)
      if (d < p.speed) return false
      p.x += (dx / d) * p.speed
      p.y += (dy / d) * p.speed
      return true
    })

    // --- water in, oxygen out ----------------------------------------------
    waterTimerRef.current += v * 0.10
    while (waterTimerRef.current >= 1) {
      waterTimerRef.current -= 1
      const k = spawnRef.current++
      for (let s = 0; s < 2; s++) {
        watersRef.current.push({
          x: PSII_X - 46 + s * 34 + ((k * 11) % 14),
          y: LUMEN_BOT - 12,
          t: 0,
          slot: s,
        })
      }
    }
    watersRef.current = watersRef.current.filter(w => {
      w.t += 0.02 + 0.02 * v
      const ty = MEM_BOT + 6
      w.y += (ty - w.y) * 0.06
      w.x += (PSII_X - 12 - w.x) * 0.05
      if (w.t >= 1) {
        // Split: the two oxygen atoms leave together as one O2.
        if (w.slot === 1) bubblesRef.current.push({ x: PSII_X, y: MEM_BOT + 2, vy: -1.5, life: 1 })
        return false
      }
      return true
    })
    bubblesRef.current = bubblesRef.current.filter(b => {
      b.y += b.vy
      b.vy -= 0.02
      if (b.y < MEM_TOP - 4) b.life -= 0.02
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
    if (!running || !visible) return
    const tick = () => {
      step()
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw, visible])

  useEffect(() => { if (!running) draw() }, [running, light, draw])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    lightRef.current = 0.55
    rateRef.current = 0
    gradientRef.current = 0
    rotorRef.current = 0
    eOffsetRef.current = 0
    tRef.current = 0
    cyclesRef.current = 0
    photonTimerRef.current = 0
    waterTimerRef.current = 0
    spawnRef.current = 0
    photonsRef.current = []
    watersRef.current = []
    bubblesRef.current = []
    atpsRef.current = []
    set('light', 55)
    setRate(0)
    setGradient(0)
    setCycles(0)
    draw()
  }

  const o2 = Math.floor(cycles)
  const atp = Math.floor(cycles * 3)
  const nadph = Math.floor(cycles * 2)
  const relRate = rate / lightResponse(1)
  const perPhoton = light > 0 ? relRate / (light / 100) : 0

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The thylakoid membrane: photons in, O₂ and ATP out</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: The thylakoid membrane: photons in, O₂ and ATP out. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
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
          <span>Light:</span>
          <input
            type="range" min={SPEC.light.min} max={SPEC.light.max} step={SPEC.light.step} value={light}
            onChange={e => set('light', +e.target.value)}
            className="w-36"
            style={{ accentColor: GOLD }}
          />
          <span className="text-text-secondary font-mono">{light}%</span>
        </label>
        <span className="text-xs font-mono" style={{ color: relRate > 0.05 ? LIME : PINK }}>
          rate {(relRate * 100).toFixed(0)}% · ΔpH {(3 * Math.min(1, gradient)).toFixed(1)}
        </span>
        <WidgetStatus className="ml-auto text-xs text-text-secondary font-mono">
          O₂ {o2} · ATP {atp} · NADPH {nadph} · rate/photon {(perPhoton * 100).toFixed(0)}%
        </WidgetStatus>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Every O₂ that leaves is assembled from two water molecules drawn in at photosystem II — none of it comes from CO₂.
      </p>
    </div>
  )
}
