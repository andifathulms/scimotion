'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 620
const H = 380

const LIME = '#A3E635'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const TEXT = 'rgba(245,240,232,'

// --- wheel geometry ---------------------------------------------------------
const CX = 178
const CY = 198
const R = 116
const TAU = Math.PI * 2

// Angles are measured clockwise from the top of the wheel.
const A_FIX = 0
const A_RED = 0.5 * Math.PI
const A_POOL = Math.PI
const A_REGEN = 1.5 * Math.PI

function pt(a: number, r: number): { x: number; y: number } {
  return { x: CX + Math.sin(a) * r, y: CY - Math.cos(a) * r }
}

// --- RuBisCO specificity ----------------------------------------------------
// v_o / v_c = (1/S) * (O / C). Rubisco in a C3 plant has S ≈ 90 and sits in
// ~265 µM O2, so at the ~10 µM CO2 of ambient air roughly one in four
// reactions is an oxygenation.
const S_CO = 90
const O2_CONC = 265
function co2Conc(slider: number): number {
  return 2 + (slider / 100) * 28   // µM; ambient air ≈ 10 µM
}
function oxyRatio(slider: number): number {
  return O2_CONC / (S_CO * co2Conc(slider))
}

type Puff = { x: number; y: number; life: number; kind: 'co2' | 'o2' | 'lost' | 'g3p' }

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  co2: { default: 35, min: 0, max: 100, step: 1 },
}

export function CalvinCycleAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const thetaRef = useRef(0)
  const photoRef = useRef(true)
  const co2Ref = useRef(35)
  const oxyAccumRef = useRef(0)
  const oxyTurnRef = useRef(false)
  const poolRef = useRef(0)
  const puffsRef = useRef<Puff[]>([])
  const tRef = useRef(0)

  const ledgerRef = useRef({
    turns: 0, fixed: 0, oxygenations: 0, lost: 0,
    atp: 0, nadph: 0, exported: 0,
  })

  const [running, setRunning] = useState(false)
  const [photo, setPhoto] = useState(true)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('calvin-cycle', SPEC)
  const { co2 } = params
  const [ledger, setLedger] = useState({ ...ledgerRef.current })
  const [oxyTurn, setOxyTurn] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  useEffect(() => { photoRef.current = photo }, [photo])
  useEffect(() => { co2Ref.current = co2 }, [co2])

  // --- drawing --------------------------------------------------------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const th = thetaRef.current
    const oxy = oxyTurnRef.current
    const L = ledgerRef.current

    ctx.clearRect(0, 0, W, H)
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'

    // --- the wheel ----------------------------------------------------------
    ctx.beginPath()
    ctx.arc(CX, CY, R, 0, TAU)
    ctx.strokeStyle = 'rgba(245,240,232,0.14)'
    ctx.lineWidth = 14
    ctx.stroke()

    // Coloured arcs, one per stage of the cycle.
    const arcs: [number, number, string][] = [
      [A_FIX, A_RED, LIME],       // carboxylation -> 3-PGA
      [A_RED, A_POOL, BLUE],      // reduction with ATP + NADPH
      [A_POOL, A_REGEN, GOLD],    // triose pool / export
      [A_REGEN, TAU, VIOLET],     // regeneration of RuBP
    ]
    for (const [a0, a1, col] of arcs) {
      ctx.beginPath()
      ctx.arc(CX, CY, R, a0 - Math.PI / 2, a1 - Math.PI / 2)
      ctx.strokeStyle = `${col}66`
      ctx.lineWidth = 14
      ctx.stroke()
    }
    ctx.lineWidth = 1

    // --- stations -----------------------------------------------------------
    const stations: [number, string, string, string][] = [
      [A_FIX, oxy ? PINK : LIME, oxy ? 'RuBisCO + O₂' : 'RuBisCO + CO₂', oxy ? 'oxygenation' : 'carboxylation'],
      [A_RED, BLUE, 'REDUCTION', '2 ATP + 2 NADPH'],
      [A_POOL, GOLD, 'TRIOSE POOL', '2 × G3P (3C)'],
      [A_REGEN, VIOLET, 'REGENERATION', '1 ATP → RuBP (5C)'],
    ]
    for (const [a, col, label, sub] of stations) {
      const p = pt(a, R)
      ctx.beginPath()
      ctx.arc(p.x, p.y, 8, 0, TAU)
      ctx.fillStyle = `${col}33`
      ctx.fill()
      ctx.strokeStyle = col
      ctx.lineWidth = 1.5
      ctx.stroke()

      const lp = pt(a, R + 30)
      ctx.textAlign = a === A_REGEN ? 'right' : a === A_RED ? 'left' : 'center'
      ctx.font = 'bold 9px monospace'
      ctx.fillStyle = col
      ctx.fillText(label, lp.x, lp.y)
      ctx.font = '8px monospace'
      ctx.fillStyle = `${TEXT}0.45)`
      ctx.fillText(sub, lp.x, lp.y + 11)
    }

    // --- the travelling carbon batch ---------------------------------------
    const mp = pt(th, R)
    ctx.beginPath()
    ctx.arc(mp.x, mp.y, 6.5, 0, TAU)
    ctx.fillStyle = oxy && th < A_RED ? PINK : LIME
    ctx.fill()

    // What the batch currently is, written in the middle of the wheel.
    let carrying: string
    let carbons: string
    if (th < A_RED) {
      carrying = oxy ? '1 × 3-PGA  +  1 × 2-phosphoglycolate' : '2 × 3-phosphoglycerate'
      carbons = oxy ? '3C + 2C = 5C' : '3C + 3C = 6C'
    } else if (th < A_POOL) {
      carrying = oxy ? 'salvage pathway (peroxisome + mitochondrion)' : '2 × G3P being reduced'
      carbons = oxy ? '2 glycolate → 1 serine + CO₂' : '6C'
    } else if (th < A_REGEN) {
      carrying = 'triose phosphate pool'
      carbons = `${poolRef.current} of 6 G3P toward one export`
    } else {
      carrying = 'RuBP regenerating'
      carbons = '5 G3P (15C) → 3 RuBP (15C)'
    }
    ctx.textAlign = 'center'
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = `${TEXT}0.75)`
    ctx.fillText(`turn ${L.turns + 1}`, CX, CY - 12)
    ctx.font = '9px monospace'
    ctx.fillStyle = oxy ? PINK : `${TEXT}0.55)`
    ctx.fillText(carrying, CX, CY + 6)
    ctx.fillStyle = `${TEXT}0.4)`
    ctx.fillText(carbons, CX, CY + 20)

    // --- photorespiration detour -------------------------------------------
    if (oxy) {
      const d0 = pt(0.18 * Math.PI, R)
      ctx.beginPath()
      ctx.moveTo(d0.x, d0.y)
      ctx.quadraticCurveTo(CX + R + 46, CY - 78, CX + R - 4, CY - R + 74)
      ctx.strokeStyle = `${PINK}88`
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.textAlign = 'left'
      ctx.font = 'bold 9px monospace'
      ctx.fillStyle = PINK
      ctx.fillText('photorespiration', CX + 74, CY - 96)
      ctx.font = '8px monospace'
      ctx.fillStyle = `${PINK}CC`
      ctx.fillText('carbon leaves as CO₂', CX + 74, CY - 84)
    }

    // --- inputs and outputs -------------------------------------------------
    const fixP = pt(A_FIX, R)
    ctx.textAlign = 'center'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = oxy ? PINK : LIME
    ctx.fillText(oxy ? 'O₂' : 'CO₂', fixP.x - 44, fixP.y - 6)
    ctx.strokeStyle = oxy ? `${PINK}99` : `${LIME}99`
    ctx.lineWidth = 1.25
    ctx.beginPath()
    ctx.moveTo(fixP.x - 32, fixP.y - 10)
    ctx.lineTo(fixP.x - 12, fixP.y - 4)
    ctx.stroke()

    for (const p of puffsRef.current) {
      const a = Math.max(0, Math.min(1, p.life))
      const col = p.kind === 'lost' ? PINK : p.kind === 'g3p' ? GOLD : p.kind === 'o2' ? PINK : LIME
      const txt = p.kind === 'lost' ? '− CO₂' : p.kind === 'g3p' ? 'G3P out' : p.kind === 'o2' ? 'O₂' : 'CO₂'
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = `${col}${Math.round(a * 255).toString(16).padStart(2, '0')}`
      ctx.fillText(txt, p.x, p.y)
    }

    // --- ledger panel -------------------------------------------------------
    const LX = 386
    let ly = 40
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = LIME
    ctx.fillText('CARBON BOOKKEEPING', LX, ly)
    ly += 8
    ctx.strokeStyle = 'rgba(245,240,232,0.14)'
    ctx.beginPath()
    ctx.moveTo(LX, ly); ctx.lineTo(W - 16, ly)
    ctx.stroke()
    ly += 20

    const rows: [string, string, string][] = [
      ['turns completed', `${L.turns}`, `${TEXT}0.7)`],
      ['CO₂ carboxylations', `${L.fixed}`, LIME],
      ['O₂ oxygenations', `${L.oxygenations}`, PINK],
      ['carbon lost to photorespiration', `${L.lost.toFixed(1)} C`, PINK],
      ['ATP consumed', `${L.atp}`, GOLD],
      ['NADPH consumed', `${L.nadph}`, BLUE],
      ['G3P exported (3C each)', `${L.exported}`, GOLD],
    ]
    ctx.font = '10px monospace'
    for (const [k, v, col] of rows) {
      ctx.fillStyle = `${TEXT}0.45)`
      ctx.fillText(k, LX, ly)
      ctx.textAlign = 'right'
      ctx.fillStyle = col
      ctx.fillText(v, W - 16, ly)
      ctx.textAlign = 'left'
      ly += 17
    }

    ly += 8
    const netC = L.fixed - L.lost
    const retained = L.fixed > 0 ? (netC / L.fixed) * 100 : 100
    ctx.fillStyle = `${TEXT}0.45)`
    ctx.fillText('net carbon retained', LX, ly)
    ctx.textAlign = 'right'
    ctx.fillStyle = retained > 90 ? LIME : retained > 75 ? GOLD : PINK
    ctx.fillText(`${retained.toFixed(0)}%`, W - 16, ly)
    ctx.textAlign = 'left'
    ly += 20

    // ATP cost per exported triose — the real price of photorespiration.
    const costTxt = L.exported > 0 ? `${(L.atp / L.exported).toFixed(1)} ATP` : '—'
    ctx.fillStyle = `${TEXT}0.45)`
    ctx.fillText('ATP per exported G3P', LX, ly)
    ctx.textAlign = 'right'
    ctx.fillStyle = GOLD
    ctx.fillText(costTxt, W - 16, ly)
    ctx.textAlign = 'left'
    ly += 26

    ctx.font = '9px monospace'
    ctx.fillStyle = `${TEXT}0.4)`
    ctx.fillText('ideal: 3 turns → 9 ATP, 6 NADPH,', LX, ly)
    ctx.fillText('one 3-carbon G3P exported.', LX, ly + 13)

    // --- footer -------------------------------------------------------------
    const ratio = photoRef.current ? oxyRatio(co2Ref.current) : 0
    ctx.font = '9px monospace'
    ctx.fillStyle = `${TEXT}0.5)`
    ctx.fillText(
      photoRef.current
        ? `[CO₂] = ${co2Conc(co2Ref.current).toFixed(0)} µM · [O₂] = 265 µM · v_o/v_c = ${ratio.toFixed(2)}`
        : 'CO₂ pump active (C4 / CAM) — RuBisCO sees almost no O₂, v_o/v_c ≈ 0',
      14, H - 14
    )
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = ratio > 0.3 ? PINK : LIME
    ctx.fillText(
      ratio > 0.5 ? 'RuBisCO IS OFTEN GRABBING THE WRONG MOLECULE'
        : ratio > 0.15 ? 'ROUGHLY ONE IN FOUR REACTIONS IS A MISTAKE'
          : 'CARBOXYLATION DOMINATES',
      14, 26
    )
  }, [])

  // --- simulation -----------------------------------------------------------
  const step = useCallback(() => {
    tRef.current += 1
    const L = ledgerRef.current
    const prev = thetaRef.current
    let next = prev + 0.022

    const crossed = (a: number) => prev < a && next >= a

    // Reduction: the ATP and NADPH delivered by the light reactions.
    if (crossed(A_RED)) {
      L.atp += 2
      L.nadph += 2
      if (oxyTurnRef.current) L.atp += 2   // salvage is not free
    }

    // Triose pool: a carboxylation turn makes 2 G3P; an oxygenation turn
    // yields only one usable 3-PGA and vents half a CO2 during salvage.
    if (crossed(A_POOL)) {
      if (oxyTurnRef.current) {
        L.lost += 0.5
        poolRef.current += 1
        puffsRef.current.push({ x: CX + R + 18, y: CY - 60, life: 1, kind: 'lost' })
      } else {
        poolRef.current += 2
      }
      if (poolRef.current >= 6) {
        poolRef.current -= 6
        L.exported += 1
        puffsRef.current.push({ x: CX - R - 6, y: CY + 62, life: 1, kind: 'g3p' })
      }
    }

    // Regeneration always costs its ATP.
    if (crossed(A_REGEN)) L.atp += 1

    // End of a turn: bank it and decide what RuBisCO grabs next.
    if (next >= TAU) {
      next -= TAU
      L.turns += 1
      if (oxyTurnRef.current) L.oxygenations += 1
      else L.fixed += 1

      const ratio = photoRef.current ? oxyRatio(co2Ref.current) : 0
      oxyAccumRef.current += ratio
      if (oxyAccumRef.current >= 1) {
        oxyAccumRef.current -= 1
        oxyTurnRef.current = true
      } else {
        oxyTurnRef.current = false
      }
      setOxyTurn(oxyTurnRef.current)
      const fp = pt(A_FIX, R)
      puffsRef.current.push({ x: fp.x - 44, y: fp.y - 18, life: 1, kind: oxyTurnRef.current ? 'o2' : 'co2' })
      setLedger({ ...L })
    }

    thetaRef.current = next

    puffsRef.current = puffsRef.current.filter(p => {
      p.y -= 0.7
      p.life -= 0.014
      return p.life > 0
    })
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

  useEffect(() => { if (!running) draw() }, [running, photo, co2, draw])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    thetaRef.current = 0
    oxyAccumRef.current = 0
    oxyTurnRef.current = false
    poolRef.current = 0
    puffsRef.current = []
    tRef.current = 0
    ledgerRef.current = { turns: 0, fixed: 0, oxygenations: 0, lost: 0, atp: 0, nadph: 0, exported: 0 }
    photoRef.current = true
    co2Ref.current = 35
    setPhoto(true)
    set('co2', 35)
    setOxyTurn(false)
    setLedger({ ...ledgerRef.current })
    draw()
  }

  const ratio = photo ? oxyRatio(co2) : 0

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The Calvin cycle, and RuBisCO&apos;s expensive mistake</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-90"
          style={{ background: LIME, color: '#0F0D0A' }}
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={() => setPhoto(p => !p)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
          style={{
            color: photo ? PINK : LIME,
            borderColor: photo ? `${PINK}55` : `${LIME}55`,
            background: photo ? `${PINK}14` : `${LIME}14`,
          }}
        >
          Photorespiration: {photo ? 'on' : 'off (C4 pump)'}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>CO₂:</span>
          <input
            type="range" min={SPEC.co2.min} max={SPEC.co2.max} step={SPEC.co2.step} value={co2}
            onChange={e => set('co2', +e.target.value)}
            disabled={!photo}
            className="w-32 disabled:opacity-40"
            style={{ accentColor: LIME }}
          />
          <span className="text-text-secondary font-mono">{co2Conc(co2).toFixed(0)} µM</span>
        </div>
        <span className="ml-auto text-xs font-mono" style={{ color: oxyTurn ? PINK : LIME }}>
          v_o/v_c = {ratio.toFixed(2)} · {ledger.turns} turns · {ledger.exported} G3P out
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Drop the CO₂ concentration — as on a hot, dry day with the stomata shut — and watch the pink oxygenation turns take over the wheel.
      </p>
    </div>
  )
}
