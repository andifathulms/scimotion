'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 620
const H = 340

const ORANGE = '#FB923C'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

// --- Geometry -------------------------------------------------------------
const BEAKER_TOP = 148
const BEAKER_BOT = 302
const SOL_TOP = 178
const LB0 = 48, LB1 = 250   // left beaker (anode compartment)
const RB0 = 370, RB1 = 572  // right beaker (cathode compartment)
const ANODE_X = 132
const CATHODE_X = 488
const EL_TOP = 158
const EL_BOT = 288
const WIRE_Y = 48
const LAMP_X = 310

// Salt bridge tube (inverted U dipping into both solutions)
const SB_LX = 214
const SB_RX = 406
const SB_TOP = 108
const SB_DIP = 206

// External circuit, anode top -> up -> across -> down to cathode top.
const WIRE: [number, number][] = [
  [ANODE_X, EL_TOP],
  [ANODE_X, WIRE_Y],
  [CATHODE_X, WIRE_Y],
  [CATHODE_X, EL_TOP],
]

const SEG_LEN = WIRE.slice(1).map((p, i) => Math.hypot(p[0] - WIRE[i][0], p[1] - WIRE[i][1]))
const WIRE_LEN = SEG_LEN.reduce((a, b) => a + b, 0)

function wirePoint(d: number): { x: number; y: number } {
  let rest = ((d % WIRE_LEN) + WIRE_LEN) % WIRE_LEN
  for (let i = 0; i < SEG_LEN.length; i++) {
    if (rest <= SEG_LEN[i]) {
      const t = rest / SEG_LEN[i]
      const a = WIRE[i], b = WIRE[i + 1]
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t }
    }
    rest -= SEG_LEN[i]
  }
  const last = WIRE[WIRE.length - 1]
  return { x: last[0], y: last[1] }
}

// Salt-bridge path, left dip -> up -> across -> down into right solution.
const BRIDGE: [number, number][] = [
  [SB_LX, SB_DIP],
  [SB_LX, SB_TOP],
  [SB_RX, SB_TOP],
  [SB_RX, SB_DIP],
]
const BSEG = BRIDGE.slice(1).map((p, i) => Math.hypot(p[0] - BRIDGE[i][0], p[1] - BRIDGE[i][1]))
const BLEN = BSEG.reduce((a, b) => a + b, 0)

function bridgePoint(d: number): { x: number; y: number } {
  let rest = ((d % BLEN) + BLEN) % BLEN
  for (let i = 0; i < BSEG.length; i++) {
    if (rest <= BSEG[i]) {
      const t = rest / BSEG[i]
      const a = BRIDGE[i], b = BRIDGE[i + 1]
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t }
    }
    rest -= BSEG[i]
  }
  const last = BRIDGE[BRIDGE.length - 1]
  return { x: last[0], y: last[1] }
}

const N_ELECTRONS = 14
const N_BRIDGE_IONS = 8

// Deterministic scatter for solution ions (no Math.random in render paths).
type SolIon = { x: number; y: number; phase: number; speed: number }

function makeSolIons(x0: number, x1: number, n: number): SolIon[] {
  return Array.from({ length: n }, (_, i) => ({
    x: x0 + ((i * 53) % (x1 - x0)),
    y: SOL_TOP + 12 + ((i * 37) % (BEAKER_BOT - SOL_TOP - 26)),
    phase: (i * 0.83) % (Math.PI * 2),
    speed: 0.35 + ((i * 17) % 10) / 30,
  }))
}

export function GalvanicCellAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const bridgeRef = useRef(true)
  const currentRef = useRef(1)
  const imbalanceRef = useRef(0)
  const eOffsetRef = useRef(0)
  const bOffsetRef = useRef(0)
  const chargeRef = useRef(0)          // total charge passed (drives mass transfer)
  const tRef = useRef(0)

  const anodeIonsRef = useRef<SolIon[]>(makeSolIons(LB0 + 16, LB1 - 16, 10))
  const cathodeIonsRef = useRef<SolIon[]>(makeSolIons(RB0 + 16, RB1 - 16, 10))

  const [bridge, setBridge] = useState(true)
  const [running, setRunning] = useState(false)
  const [current, setCurrent] = useState(1)
  const [imbalance, setImbalance] = useState(0)
  const [charge, setCharge] = useState(0)

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  useEffect(() => { bridgeRef.current = bridge }, [bridge])

  // --- Drawing ------------------------------------------------------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cur = currentRef.current
    const imb = imbalanceRef.current
    const hasBridge = bridgeRef.current
    const q = chargeRef.current

    ctx.clearRect(0, 0, W, H)

    // --- Solutions ---------------------------------------------------------
    ctx.fillStyle = 'rgba(251,146,60,0.10)'
    ctx.fillRect(LB0, SOL_TOP, LB1 - LB0, BEAKER_BOT - SOL_TOP)
    ctx.fillStyle = 'rgba(96,165,250,0.12)'
    ctx.fillRect(RB0, SOL_TOP, RB1 - RB0, BEAKER_BOT - SOL_TOP)

    // --- Beaker outlines ---------------------------------------------------
    ctx.strokeStyle = 'rgba(245,240,232,0.28)'
    ctx.lineWidth = 1.5
    for (const [x0, x1] of [[LB0, LB1], [RB0, RB1]] as const) {
      ctx.beginPath()
      ctx.moveTo(x0, BEAKER_TOP)
      ctx.lineTo(x0, BEAKER_BOT)
      ctx.lineTo(x1, BEAKER_BOT)
      ctx.lineTo(x1, BEAKER_TOP)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(245,240,232,0.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(LB0, SOL_TOP); ctx.lineTo(LB1, SOL_TOP)
    ctx.moveTo(RB0, SOL_TOP); ctx.lineTo(RB1, SOL_TOP)
    ctx.stroke()

    // --- Salt bridge -------------------------------------------------------
    if (hasBridge) {
      ctx.strokeStyle = 'rgba(167,139,250,0.55)'
      ctx.lineWidth = 11
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(BRIDGE[0][0], BRIDGE[0][1])
      for (let i = 1; i < BRIDGE.length; i++) ctx.lineTo(BRIDGE[i][0], BRIDGE[i][1])
      ctx.stroke()
      ctx.strokeStyle = 'rgba(167,139,250,0.9)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.lineCap = 'butt'

      // Ions drifting through it: cations toward the cathode, anions toward the anode.
      for (let i = 0; i < N_BRIDGE_IONS; i++) {
        const base = (i / N_BRIDGE_IONS) * BLEN
        const cat = bridgePoint(base + bOffsetRef.current)
        const an = bridgePoint(base - bOffsetRef.current)
        ctx.beginPath()
        ctx.arc(cat.x, cat.y, 3, 0, Math.PI * 2)
        ctx.fillStyle = GOLD
        ctx.fill()
        ctx.beginPath()
        ctx.arc(an.x, an.y, 3, 0, Math.PI * 2)
        ctx.fillStyle = GREEN
        ctx.fill()
      }
      ctx.font = '9px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.fillText('salt bridge  (K⁺ →   ← NO₃⁻)', SB_LX + 6, SB_TOP - 10)
    } else {
      // Removed: draw the two stubs and the gap.
      ctx.strokeStyle = 'rgba(167,139,250,0.18)'
      ctx.lineWidth = 11
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(SB_LX, SB_DIP); ctx.lineTo(SB_LX, SB_TOP)
      ctx.moveTo(SB_RX, SB_DIP); ctx.lineTo(SB_RX, SB_TOP)
      ctx.stroke()
      ctx.lineCap = 'butt'
      ctx.setLineDash([5, 5])
      ctx.strokeStyle = 'rgba(244,114,182,0.5)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(SB_LX, SB_TOP); ctx.lineTo(SB_RX, SB_TOP)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.font = '9px monospace'
      ctx.fillStyle = 'rgba(244,114,182,0.85)'
      ctx.fillText('salt bridge removed — no ion path', SB_LX + 4, SB_TOP - 10)
    }

    // --- Electrodes (anode dissolving, cathode plating) ---------------------
    const loss = Math.min(9, q * 0.55)
    const gain = Math.min(9, q * 0.55)
    const aw = 12 - loss * 0.9
    const cw = 12 + gain * 0.9

    ctx.fillStyle = 'rgba(245,240,232,0.75)'
    ctx.fillRect(ANODE_X - aw / 2, EL_TOP, aw, EL_BOT - EL_TOP)
    ctx.fillStyle = 'rgba(251,146,60,0.9)'
    ctx.fillRect(CATHODE_X - cw / 2, EL_TOP, cw, EL_BOT - EL_TOP)
    // Freshly plated metal shows as a brighter rim.
    if (gain > 0.4) {
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 1.5
      ctx.strokeRect(CATHODE_X - cw / 2, EL_TOP, cw, EL_BOT - EL_TOP)
    }

    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = ORANGE
    ctx.fillText('ANODE  (−)', LB0 + 6, BEAKER_TOP - 22)
    ctx.fillStyle = BLUE
    ctx.fillText('CATHODE  (+)', RB0 + 6, BEAKER_TOP - 22)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('Zn → Zn²⁺ + 2e⁻   (oxidation)', LB0 + 6, BEAKER_TOP - 8)
    ctx.fillText('Cu²⁺ + 2e⁻ → Cu   (reduction)', RB0 + 6, BEAKER_TOP - 8)
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('Zn strip', ANODE_X - 22, EL_BOT + 12)
    ctx.fillText('Cu strip', CATHODE_X - 22, EL_BOT + 12)

    // --- Dissolved / plating ions in solution ------------------------------
    for (const ion of anodeIonsRef.current) {
      ctx.beginPath()
      ctx.arc(ion.x, ion.y, 3.4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(251,146,60,0.85)'
      ctx.fill()
    }
    for (const ion of cathodeIonsRef.current) {
      ctx.beginPath()
      ctx.arc(ion.x, ion.y, 3.4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(96,165,250,0.85)'
      ctx.fill()
    }

    // --- Charge build-up when the bridge is gone ----------------------------
    if (imb > 0.02) {
      const n = Math.min(7, Math.round(imb * 8))
      ctx.font = 'bold 13px monospace'
      for (let i = 0; i < n; i++) {
        const x = LB0 + 22 + i * 26
        ctx.fillStyle = `rgba(244,114,182,${0.35 + 0.55 * imb})`
        ctx.fillText('+', x, SOL_TOP + 16)
        ctx.fillStyle = `rgba(96,165,250,${0.35 + 0.55 * imb})`
        ctx.fillText('−', RB0 + 22 + i * 26, SOL_TOP + 16)
      }
    }

    // --- External circuit ---------------------------------------------------
    ctx.strokeStyle = 'rgba(245,240,232,0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(WIRE[0][0], WIRE[0][1])
    for (let i = 1; i < WIRE.length; i++) ctx.lineTo(WIRE[i][0], WIRE[i][1])
    ctx.stroke()

    // Lamp: brightness tracks the current.
    const glow = Math.max(0, Math.min(1, cur))
    ctx.beginPath()
    ctx.arc(LAMP_X, WIRE_Y, 15 + 9 * glow, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(245,158,11,${0.05 + 0.3 * glow})`
    ctx.fill()
    ctx.beginPath()
    ctx.arc(LAMP_X, WIRE_Y, 11, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(245,158,11,${0.12 + 0.85 * glow})`
    ctx.fill()
    ctx.strokeStyle = 'rgba(245,240,232,0.45)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Electrons: anode -> cathode through the wire, only while current flows.
    if (cur > 0.02) {
      for (let i = 0; i < N_ELECTRONS; i++) {
        const p = wirePoint((i / N_ELECTRONS) * WIRE_LEN + eOffsetRef.current)
        ctx.beginPath()
        ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(96,165,250,${0.35 + 0.65 * Math.min(1, cur)})`
        ctx.fill()
      }
      // Direction arrow on the top run.
      ctx.strokeStyle = `rgba(96,165,250,${0.4 + 0.5 * cur})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(228, WIRE_Y - 16); ctx.lineTo(248, WIRE_Y - 16)
      ctx.lineTo(243, WIRE_Y - 20); ctx.moveTo(248, WIRE_Y - 16); ctx.lineTo(243, WIRE_Y - 12)
      ctx.stroke()
      ctx.font = '9px monospace'
      ctx.fillStyle = 'rgba(96,165,250,0.75)'
      ctx.fillText('e⁻', 214, WIRE_Y - 13)
    }

    // --- Status banner ------------------------------------------------------
    const dead = cur <= 0.05
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = dead ? '#F472B6' : GREEN
    ctx.fillText(dead ? 'CURRENT STOPPED' : 'CURRENT FLOWING', 14, 24)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText(
      hasBridge
        ? 'ions cross the bridge — each compartment stays neutral'
        : dead
          ? 'charge imbalance opposes further electron transfer'
          : 'charge is piling up: + in the anode beaker, − in the cathode beaker',
      14,
      40
    )

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(`I = ${(cur * 100).toFixed(0)}%`, W - 168, 24)
    ctx.fillStyle = imb > 0.3 ? '#F472B6' : 'rgba(245,240,232,0.55)'
    ctx.fillText(`charge imbalance = ${(imb * 100).toFixed(0)}%`, W - 168, 40)
  }, [])

  // --- Physics step -------------------------------------------------------
  const step = useCallback(() => {
    const hasBridge = bridgeRef.current

    if (hasBridge) {
      // The bridge drains any accumulated imbalance almost as fast as it forms.
      imbalanceRef.current = Math.max(0, imbalanceRef.current * 0.9 - 0.002)
    } else {
      // Every electron that crosses leaves an uncompensated charge behind.
      imbalanceRef.current = Math.min(1, imbalanceRef.current + currentRef.current * 0.02)
    }
    // Current is throttled by the electrostatic back-pressure it creates.
    const target = Math.max(0, 1 - imbalanceRef.current * 1.15)
    currentRef.current += (target - currentRef.current) * 0.25

    const cur = currentRef.current
    eOffsetRef.current += 2.6 * cur
    bOffsetRef.current += 1.5 * cur
    chargeRef.current += cur * 0.02
    tRef.current += 0.05

    // Ions drift: Zn²⁺ away from the anode, Cu²⁺ toward the cathode.
    for (const ion of anodeIonsRef.current) {
      ion.x += ion.speed * cur
      ion.y += Math.sin(tRef.current + ion.phase) * 0.35
      if (ion.x > LB1 - 14) ion.x = ANODE_X + 8
      if (ion.y < SOL_TOP + 8) ion.y = SOL_TOP + 8
      if (ion.y > BEAKER_BOT - 10) ion.y = BEAKER_BOT - 10
    }
    for (const ion of cathodeIonsRef.current) {
      const dx = CATHODE_X + 10 - ion.x
      ion.x += Math.sign(dx) * ion.speed * cur
      ion.y += Math.sin(tRef.current + ion.phase) * 0.35
      if (Math.abs(dx) < 3) ion.x = RB1 - 16
      if (ion.y < SOL_TOP + 8) ion.y = SOL_TOP + 8
      if (ion.y > BEAKER_BOT - 10) ion.y = BEAKER_BOT - 10
    }

    setCurrent(cur)
    setImbalance(imbalanceRef.current)
    setCharge(chargeRef.current)
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

  useEffect(() => { if (!running) draw() }, [running, bridge, draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    bridgeRef.current = true
    currentRef.current = 1
    imbalanceRef.current = 0
    eOffsetRef.current = 0
    bOffsetRef.current = 0
    chargeRef.current = 0
    tRef.current = 0
    anodeIonsRef.current = makeSolIons(LB0 + 16, LB1 - 16, 10)
    cathodeIonsRef.current = makeSolIons(RB0 + 16, RB1 - 16, 10)
    setBridge(true)
    setCurrent(1)
    setImbalance(0)
    setCharge(0)
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The Daniell cell, with and without a salt bridge</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: The Daniell cell, with and without a salt bridge. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-orange text-bg-base text-xs font-medium hover:bg-accent-orange/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={() => setBridge(b => !b)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
          style={{
            color: bridge ? VIOLET : '#F472B6',
            borderColor: bridge ? `${VIOLET}55` : '#F472B655',
            background: bridge ? `${VIOLET}14` : '#F472B614',
          }}
        >
          {bridge ? 'Remove salt bridge' : 'Restore salt bridge'}
        </button>
        <span className="text-xs text-text-muted font-mono">
          charge passed: {charge.toFixed(1)}
        </span>
        <WidgetStatus className="ml-auto text-xs font-mono" style={{ color: current > 0.05 ? GREEN : '#F472B6' }}>
          I = {(current * 100).toFixed(0)}% · imbalance {(imbalance * 100).toFixed(0)}%
        </WidgetStatus>
      </div>
    </div>
  )
}
