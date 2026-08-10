'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 620
const H = 330

const ORANGE = '#FB923C'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const PINK = '#F472B6'

type Metal = {
  sym: string
  ion: string
  couple: string
  e0: number // standard reduction potential, volts vs SHE
  n: number  // electrons in the half-reaction
}

// Standard reduction potentials at 25 °C, 1 M, vs the standard hydrogen electrode.
const METALS: Metal[] = [
  { sym: 'Li', ion: 'Li⁺', couple: 'Li⁺/Li', e0: -3.04, n: 1 },
  { sym: 'Mg', ion: 'Mg²⁺', couple: 'Mg²⁺/Mg', e0: -2.37, n: 2 },
  { sym: 'Al', ion: 'Al³⁺', couple: 'Al³⁺/Al', e0: -1.66, n: 3 },
  { sym: 'Zn', ion: 'Zn²⁺', couple: 'Zn²⁺/Zn', e0: -0.76, n: 2 },
  { sym: 'Fe', ion: 'Fe²⁺', couple: 'Fe²⁺/Fe', e0: -0.44, n: 2 },
  { sym: 'Pb', ion: 'Pb²⁺', couple: 'Pb²⁺/Pb', e0: -0.13, n: 2 },
  { sym: 'Cu', ion: 'Cu²⁺', couple: 'Cu²⁺/Cu', e0: 0.34, n: 2 },
  { sym: 'Ag', ion: 'Ag⁺', couple: 'Ag⁺/Ag', e0: 0.80, n: 1 },
]

const E_LO = -3.25
const E_HI = 1.05
const LAD_Y0 = 292 // most negative
const LAD_Y1 = 74  // most positive
const LAD_X = 176

const yFor = (e: number) => LAD_Y0 - ((e - E_LO) / (E_HI - E_LO)) * (LAD_Y0 - LAD_Y1)

// Plot panel (discharge view)
const PX0 = 372
const PX1 = 598
const PY0 = 286
const PY1 = 128

const F_KJ = 96.485 // Faraday constant in kJ·mol⁻¹·V⁻¹
const NERNST = 0.05916 // (RT/F)·ln10 at 25 °C

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
const lcm = (a: number, b: number) => (a * b) / gcd(a, b)

type Cell = {
  anode: Metal
  cathode: Metal
  n: number
  e0: number
}

function buildCell(a: Metal, b: Metal): Cell {
  // The metal with the more negative reduction potential is oxidised: it is the anode.
  const anode = a.e0 <= b.e0 ? a : b
  const cathode = a.e0 <= b.e0 ? b : a
  const n = lcm(anode.n, cathode.n)
  return { anode, cathode, n, e0: cathode.e0 - anode.e0 }
}

// Depth of discharge -> concentrations. The cathode ion is consumed (log sweep,
// so the last decades of depletion are visible) and the anode ion accumulates.
function concentrations(depth: number): { cA: number; cC: number } {
  const cC = Math.pow(10, -6 * depth)
  return { cA: 2 - cC, cC }
}

function nernstE(cell: Cell, depth: number): number {
  const { cA, cC } = concentrations(depth)
  const q = Math.pow(cA, cell.n / cell.anode.n) / Math.pow(cC, cell.n / cell.cathode.n)
  return cell.e0 - (NERNST / cell.n) * Math.log10(q)
}

// What a load actually sees: as the cathode reactant runs out, mass transport
// (and internal resistance) collapse the terminal voltage to zero.
function terminalV(cell: Cell, depth: number): number {
  const { cC } = concentrations(depth)
  return Math.max(0, nernstE(cell, depth)) * (cC / (cC + 0.002))
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  depth: { default: 0, min: 0, max: 1, step: 0.001 },
}

export function CellPotentialAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const depthRef = useRef(0)
  const pairRef = useRef<[number, number]>([3, 6]) // Zn / Cu
  const modeRef = useRef<'table' | 'discharge'>('table')

  const [pair, setPair] = useState<[number, number]>([3, 6])
  const [mode, setMode] = useState<'table' | 'discharge'>('table')
  const { params, set, permalink, isDefault, restored } = useWidgetParams('cell-potential', SPEC)
  const { depth } = params
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  useEffect(() => { pairRef.current = pair }, [pair])
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { depthRef.current = depth }, [depth])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const [ia, ib] = pairRef.current
    const cell = buildCell(METALS[ia], METALS[ib])
    const d = depthRef.current
    const m = modeRef.current

    ctx.clearRect(0, 0, W, H)

    // --- Ladder of standard reduction potentials ---------------------------
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.75)'
    ctx.fillText('Standard reduction potentials', 14, 26)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('E° / V vs SHE  ·  25 °C, 1 M', 14, 42)

    ctx.strokeStyle = 'rgba(245,240,232,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(LAD_X, LAD_Y1 - 12)
    ctx.lineTo(LAD_X, LAD_Y0 + 12)
    ctx.stroke()

    // Zero line (the hydrogen reference).
    const y0 = yFor(0)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(245,240,232,0.22)'
    ctx.beginPath()
    ctx.moveTo(24, y0)
    ctx.lineTo(LAD_X + 44, y0)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('0.00  H⁺/H₂', LAD_X + 8, y0 - 4)

    for (let i = 0; i < METALS.length; i++) {
      const met = METALS[i]
      const y = yFor(met.e0)
      const isA = met === cell.anode
      const isC = met === cell.cathode
      const col = isA ? ORANGE : isC ? BLUE : 'rgba(245,240,232,0.4)'

      ctx.strokeStyle = col
      ctx.lineWidth = isA || isC ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(LAD_X - (isA || isC ? 14 : 8), y)
      ctx.lineTo(LAD_X, y)
      ctx.stroke()

      ctx.font = isA || isC ? 'bold 10px monospace' : '10px monospace'
      ctx.fillStyle = col
      const label = `${met.couple.padEnd(7, ' ')} ${met.e0 > 0 ? '+' : '−'}${Math.abs(met.e0).toFixed(2)}`
      ctx.fillText(label, 24, y + 3.5)
      if (isA) ctx.fillText('◀ anode', LAD_X + 8, y + 3.5)
      if (isC) ctx.fillText('◀ cathode', LAD_X + 8, y + 3.5)
    }

    // The gap between the two rungs IS the cell voltage.
    const yA = yFor(cell.anode.e0)
    const yC = yFor(cell.cathode.e0)
    const bx = LAD_X + 78
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(bx - 6, yA); ctx.lineTo(bx, yA)
    ctx.lineTo(bx, yC); ctx.lineTo(bx - 6, yC)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(bx, yA); ctx.lineTo(bx - 4, yA - 5); ctx.moveTo(bx, yA); ctx.lineTo(bx + 4, yA - 5)
    ctx.moveTo(bx, yC); ctx.lineTo(bx - 4, yC + 5); ctx.moveTo(bx, yC); ctx.lineTo(bx + 4, yC + 5)
    ctx.stroke()
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText(`${cell.e0.toFixed(2)} V`, bx + 8, (yA + yC) / 2 + 4)

    // --- Right-hand panel ---------------------------------------------------
    ctx.strokeStyle = 'rgba(245,240,232,0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(340, 18); ctx.lineTo(340, H - 18)
    ctx.stroke()

    if (m === 'table') {
      const dG = -cell.n * F_KJ * cell.e0
      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.75)'
      ctx.fillText('Cell at standard conditions', 358, 26)

      ctx.font = '10px monospace'
      ctx.fillStyle = ORANGE
      ctx.fillText(`anode  (oxidation)`, 358, 56)
      ctx.fillStyle = 'rgba(245,240,232,0.7)'
      ctx.fillText(
        `${cell.anode.sym} → ${cell.anode.ion} + ${cell.anode.n}e⁻`,
        372, 72
      )
      ctx.fillStyle = BLUE
      ctx.fillText(`cathode  (reduction)`, 358, 96)
      ctx.fillStyle = 'rgba(245,240,232,0.7)'
      ctx.fillText(
        `${cell.cathode.ion} + ${cell.cathode.n}e⁻ → ${cell.cathode.sym}`,
        372, 112
      )

      ctx.fillStyle = 'rgba(245,240,232,0.45)'
      ctx.fillText('E°cell = E°cathode − E°anode', 358, 146)
      ctx.fillStyle = 'rgba(245,240,232,0.7)'
      ctx.fillText(
        `       = ${cell.cathode.e0.toFixed(2)} − (${cell.anode.e0.toFixed(2)}) V`,
        358, 162
      )

      ctx.font = 'bold 34px monospace'
      ctx.fillStyle = GOLD
      ctx.fillText(`${cell.e0.toFixed(2)} V`, 358, 208)

      ctx.font = '10px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.45)'
      ctx.fillText(`n = ${cell.n} electrons transferred`, 358, 234)
      ctx.fillStyle = GREEN
      ctx.fillText(`ΔG° = −nFE° = ${dG.toFixed(0)} kJ/mol`, 358, 252)
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.fillText('negative ΔG° ⇒ the reaction runs', 358, 268)
      ctx.fillText('on its own; the cell can do work.', 358, 282)
      ctx.fillStyle = VIOLET
      ctx.fillText('voltage is intensive — size-independent', 358, 304)
    } else {
      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.75)'
      ctx.fillText('Discharge: Nernst correction', 358, 26)

      const { cA, cC } = concentrations(d)
      const eN = nernstE(cell, d)
      const vT = terminalV(cell, d)

      ctx.font = '10px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.fillText('E = E° − (0.0592/n)·log Q', 358, 48)
      ctx.fillStyle = ORANGE
      ctx.fillText(`[${cell.anode.ion}] = ${cA.toFixed(3)} M`, 358, 68)
      ctx.fillStyle = BLUE
      ctx.fillText(`[${cell.cathode.ion}] = ${cC < 0.001 ? cC.toExponential(1) : cC.toFixed(3)} M`, 358, 84)
      ctx.fillStyle = GOLD
      ctx.fillText(`E = ${eN.toFixed(3)} V`, 358, 104)
      ctx.fillStyle = vT > 0.05 ? GREEN : PINK
      ctx.fillText(`terminal V = ${vT.toFixed(3)} V`, 470, 104)

      // Axes
      const vMax = Math.max(1.2, cell.e0 * 1.1)
      const vy = (v: number) => PY0 - (Math.max(0, v) / vMax) * (PY0 - PY1)
      const dx = (t: number) => PX0 + t * (PX1 - PX0)

      ctx.strokeStyle = 'rgba(245,240,232,0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PX0, PY1 - 8); ctx.lineTo(PX0, PY0); ctx.lineTo(PX1, PY0)
      ctx.stroke()
      ctx.font = '9px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.fillText('V', PX0 - 14, PY1 + 2)
      ctx.fillText('0', PX0 - 12, PY0 + 3)
      ctx.fillText('depth of discharge', PX0 + 60, PY0 + 16)
      ctx.fillText('100%', PX1 - 22, PY0 + 16)

      // Nernst potential curve
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i <= 120; i++) {
        const t = i / 120
        const x = dx(t)
        const y = vy(nernstE(cell, t))
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()

      // Terminal voltage under load
      ctx.strokeStyle = BLUE
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i <= 120; i++) {
        const t = i / 120
        const x = dx(t)
        const y = vy(terminalV(cell, t))
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()

      // Live marker
      ctx.strokeStyle = 'rgba(245,240,232,0.25)'
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(dx(d), PY0); ctx.lineTo(dx(d), PY1 - 8)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(dx(d), vy(eN), 4, 0, Math.PI * 2)
      ctx.fillStyle = GOLD
      ctx.fill()
      ctx.beginPath()
      ctx.arc(dx(d), vy(vT), 4, 0, Math.PI * 2)
      ctx.fillStyle = BLUE
      ctx.fill()

      ctx.font = '9px monospace'
      ctx.fillStyle = GOLD
      ctx.fillText('E (Nernst)', PX0 + 6, PY1 - 2)
      ctx.fillStyle = BLUE
      ctx.fillText('under load', PX0 + 76, PY1 - 2)

      if (vT < 0.05) {
        ctx.font = 'bold 10px monospace'
        ctx.fillStyle = PINK
        ctx.fillText('FLAT — reactant exhausted', PX0 + 40, PY0 - 12)
      }
    }
  }, [])

  // The discharge sweep is the only thing that animates; the standard-cell view
  // is static, so the loop is gated on the mode as well as the play state.
  useEffect(() => {
    if (!running || mode !== 'discharge') return
    const tick = () => {
      const next = Math.min(1, depthRef.current + 0.0022)
      depthRef.current = next
      set('depth', next)
      if (next >= 1) { setRunning(false); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, mode, set])

  // Refs are synced in the effects above, so redraw after any state change.
  useEffect(() => { draw() }, [pair, mode, depth, draw])

  const pick = (i: number) => {
    setPair(p => (p[0] === i || p[1] === i ? p : [p[1], i]))
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    depthRef.current = 0
    pairRef.current = [3, 6]
    modeRef.current = 'table'
    set('depth', 0)
    setPair([3, 6])
    setMode('table')
    draw()
  }

  const cell = buildCell(METALS[pair[0]], METALS[pair[1]])

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Pick two metals, read the voltage</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-2">
        {METALS.map((met, i) => {
          const isA = met === cell.anode
          const isC = met === cell.cathode
          const col = isA ? ORANGE : isC ? BLUE : undefined
          return (
            <button
              key={met.sym}
              onClick={() => pick(i)}
              className="px-2 py-1 rounded text-xs font-mono border transition-colors"
              style={
                col
                  ? { color: col, borderColor: `${col}55`, background: `${col}14` }
                  : { color: 'rgba(245,240,232,0.5)', borderColor: 'rgba(245,240,232,0.15)' }
              }
            >
              {met.sym}
            </button>
          )
        })}
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setMode(m => (m === 'table' ? 'discharge' : 'table'))}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
          style={{ color: VIOLET, borderColor: `${VIOLET}55`, background: `${VIOLET}14` }}
        >
          {mode === 'table' ? 'Show discharge' : 'Show standard cell'}
        </button>
        {mode === 'discharge' && (
          <>
            <button
              onClick={() => {
                if (depthRef.current >= 1) { depthRef.current = 0; set('depth', 0) }
                setRunning(r => !r)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-orange text-bg-base text-xs font-medium hover:bg-accent-orange/90 transition-colors"
            >
              {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Discharge</>}
            </button>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span>Depth:</span>
              <input
                type="range" min={SPEC.depth.min} max={SPEC.depth.max} step={SPEC.depth.step} value={depth}
                onChange={e => { setRunning(false); set('depth', +e.target.value) }}
                className="w-32 accent-accent-orange"
              />
              <span className="font-mono text-text-secondary">{(depth * 100).toFixed(0)}%</span>
            </div>
          </>
        )}
        <span className="ml-auto text-xs font-mono text-text-secondary">
          {cell.anode.sym} | {cell.cathode.sym} · E°cell = {cell.e0.toFixed(2)} V · n = {cell.n}
        </span>
      </div>
    </div>
  )
}
