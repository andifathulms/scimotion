'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const LIME = '#A3E635' // small nonpolar molecules (O2 / CO2) — simple diffusion
const GOLD = '#F59E0B' // Na+ / ATP
const BLUE = '#60A5FA' // K+
const VIOLET = '#A78BFA' // glucose
const PINK = '#F472B6' // pump highlight

// Membrane band (the bilayer) spans the middle of the canvas. Above it is the
// extracellular space ("outside"); below it, the cytoplasm ("inside").
const MY0 = 122 // top of bilayer
const MY1 = 178 // bottom of bilayer
const MID = (MY0 + MY1) / 2

// x-centres of the three transport lanes.
const LANE_SIMPLE = 118
const LANE_CHANNEL = 300
const LANE_PUMP = 482
const CHANNEL_HW = 13 // half-width of the facilitated channel pore
const PUMP_HW = 20

type Kind = 'o2' | 'na' | 'k' | 'glu'
type Mode = 'simple' | 'channel'

const COLOR: Record<Kind, string> = { o2: LIME, na: GOLD, k: BLUE, glu: VIOLET }
const RADIUS: Record<Kind, number> = { o2: 2.4, na: 3, k: 3, glu: 3.4 }

type Particle = {
  kind: Kind
  mode: Mode
  x: number
  y: number
  vx: number
  vy: number
}

const CHANNEL_KINDS: Kind[] = ['k', 'glu']

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

// A passive particle: seeded biased toward the "outside" (top) so there is a real
// gradient to relax. Simple-diffusion particles roam near the left lane; channel
// particles near the middle lane.
function makePassive(kind: Kind, mode: Mode): Particle {
  const laneX = mode === 'simple' ? LANE_SIMPLE : LANE_CHANNEL
  const spread = mode === 'simple' ? 46 : 34
  const outside = Math.random() < 0.72 // start mostly outside → net inward drift
  const y = outside ? rand(14, MY0 - 8) : rand(MY1 + 8, H - 14)
  return {
    kind,
    mode,
    x: laneX + rand(-spread, spread),
    y,
    vx: rand(-0.35, 0.35),
    vy: rand(-0.8, 0.8),
  }
}

const N_SIMPLE = 26
const N_CHANNEL = 22

// Pump cycle: a Na+ carried up and out, a K+ carried down and in, per tick group.
type PumpIon = { kind: 'na' | 'k'; t: number; lane: number }

export function MembraneTransportAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const partsRef = useRef<Particle[]>([])
  const pumpIonsRef = useRef<PumpIon[]>([])
  const gradRef = useRef(0.85) // Na+ gradient "charge": 0.5 = equilibrium, 1 = fully charged
  const atpRef = useRef(0) // ATP molecules spent (visual counter)
  const pumpOnRef = useRef(true)

  const [running, setRunning] = useState(false)
  const [pumpOn, setPumpOn] = useState(true)
  const [gradPct, setGradPct] = useState(70)

  useEffect(() => {
    pumpOnRef.current = pumpOn
  }, [pumpOn])

  const seed = useCallback(() => {
    const out: Particle[] = []
    for (let i = 0; i < N_SIMPLE; i++) out.push(makePassive('o2', 'simple'))
    for (let i = 0; i < N_CHANNEL; i++) {
      const kind = CHANNEL_KINDS[i % CHANNEL_KINDS.length]
      out.push(makePassive(kind, 'channel'))
    }
    partsRef.current = out
    pumpIonsRef.current = [
      { kind: 'na', t: 0, lane: 0 },
      { kind: 'k', t: 0.5, lane: 1 },
    ]
    gradRef.current = 0.85
    atpRef.current = 0
  }, [])

  // Draw one phospholipid: a head circle on each face with two tails toward centre.
  const drawLipid = (ctx: CanvasRenderingContext2D, x: number) => {
    ctx.strokeStyle = 'rgba(245,240,232,0.22)'
    ctx.lineWidth = 1
    // top leaflet
    ctx.beginPath()
    ctx.moveTo(x - 2, MY0 + 4)
    ctx.lineTo(x - 2, MID - 2)
    ctx.moveTo(x + 2, MY0 + 4)
    ctx.lineTo(x + 2, MID - 2)
    ctx.stroke()
    // bottom leaflet
    ctx.beginPath()
    ctx.moveTo(x - 2, MY1 - 4)
    ctx.lineTo(x - 2, MID + 2)
    ctx.moveTo(x + 2, MY1 - 4)
    ctx.lineTo(x + 2, MID + 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(163,230,53,0.5)'
    ctx.beginPath()
    ctx.arc(x, MY0 + 3, 2.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, MY1 - 3, 2.6, 0, Math.PI * 2)
    ctx.fill()
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // Region tints.
    ctx.fillStyle = 'rgba(96,165,250,0.05)'
    ctx.fillRect(0, 0, W, MY0)
    ctx.fillStyle = 'rgba(163,230,53,0.04)'
    ctx.fillRect(0, MY1, W, H - MY1)

    // Bilayer core.
    ctx.fillStyle = 'rgba(245,240,232,0.04)'
    ctx.fillRect(0, MY0, W, MY1 - MY0)

    // Phospholipid heads/tails, leaving gaps where the channel and pump sit.
    for (let x = 12; x < W; x += 15) {
      const nearChannel = Math.abs(x - LANE_CHANNEL) < CHANNEL_HW + 8
      const nearPump = Math.abs(x - LANE_PUMP) < PUMP_HW + 8
      if (nearChannel || nearPump) continue
      drawLipid(ctx, x)
    }

    // Labels for the two compartments.
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(96,165,250,0.7)'
    ctx.fillText('outside (extracellular)', 12, 18)
    ctx.fillStyle = 'rgba(163,230,53,0.7)'
    ctx.fillText('inside (cytoplasm)', 12, H - 10)

    // Lane captions.
    ctx.textAlign = 'center'
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('simple diffusion', LANE_SIMPLE, MID + 3)
    ctx.fillText('facilitated', LANE_CHANNEL, 30)
    ctx.fillText('active pump', LANE_PUMP, 30)
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('(free, downhill)', LANE_SIMPLE, MID + 15)
    ctx.fillText('(free, downhill)', LANE_CHANNEL, 42)
    ctx.fillStyle = pumpOnRef.current ? `${PINK}cc` : 'rgba(245,240,232,0.3)'
    ctx.fillText(pumpOnRef.current ? '(ATP, uphill)' : '(pump off)', LANE_PUMP, 42)

    // Facilitated channel protein: two rounded pillars framing a pore.
    ctx.fillStyle = 'rgba(167,139,250,0.16)'
    ctx.strokeStyle = `${VIOLET}aa`
    ctx.lineWidth = 1.5
    for (const dir of [-1, 1]) {
      const px = LANE_CHANNEL + dir * (CHANNEL_HW + 5)
      ctx.beginPath()
      ctx.roundRect(px - 5, MY0 - 6, 10, MY1 - MY0 + 12, 4)
      ctx.fill()
      ctx.stroke()
    }

    // Pump protein: a wider gated barrel, tinted by whether it is running.
    const pumpCol = pumpOnRef.current ? GOLD : 'rgba(245,240,232,0.3)'
    ctx.fillStyle = pumpOnRef.current ? 'rgba(245,158,11,0.16)' : 'rgba(245,240,232,0.06)'
    ctx.strokeStyle = pumpOnRef.current ? `${GOLD}cc` : 'rgba(245,240,232,0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(LANE_PUMP - PUMP_HW, MY0 - 8, PUMP_HW * 2, MY1 - MY0 + 16, 6)
    ctx.fill()
    ctx.stroke()
    // ATP badge on the pump.
    ctx.fillStyle = pumpCol
    ctx.font = 'bold 9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('ATP', LANE_PUMP, MID + 3)

    // Passive particles.
    for (const p of partsRef.current) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, RADIUS[p.kind], 0, Math.PI * 2)
      ctx.fillStyle = COLOR[p.kind]
      ctx.fill()
    }

    // Pump ions in transit (only while running the pump).
    for (const pi of pumpIonsRef.current) {
      const outside = pi.kind === 'na'
      // Na+ travels bottom→top (out); K+ travels top→bottom (in).
      const yStart = outside ? MY1 + 26 : MY0 - 26
      const yEnd = outside ? MY0 - 26 : MY1 + 26
      const y = yStart + (yEnd - yStart) * pi.t
      const x = LANE_PUMP + (pi.kind === 'na' ? -7 : 7)
      ctx.beginPath()
      ctx.arc(x, y, pi.kind === 'na' ? 3 : 3, 0, Math.PI * 2)
      ctx.fillStyle = pi.kind === 'na' ? GOLD : BLUE
      ctx.fill()
    }

    // Uphill arrows on the pump when active.
    if (pumpOnRef.current) {
      ctx.strokeStyle = `${GOLD}88`
      ctx.lineWidth = 1.25
      ctx.beginPath()
      ctx.moveTo(LANE_PUMP - 7, MY1 + 22)
      ctx.lineTo(LANE_PUMP - 7, MY0 - 22)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(LANE_PUMP - 10, MY0 - 16)
      ctx.lineTo(LANE_PUMP - 7, MY0 - 22)
      ctx.lineTo(LANE_PUMP - 4, MY0 - 16)
      ctx.stroke()
    }

    // Na+ gradient "battery" meter, top-right.
    const g = gradRef.current
    const bx = W - 150
    const by = 12
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.fillText('Na⁺ gradient (battery)', bx, by + 8)
    // battery body
    ctx.strokeStyle = 'rgba(245,240,232,0.4)'
    ctx.lineWidth = 1.25
    ctx.beginPath()
    ctx.roundRect(bx, by + 14, 120, 14, 3)
    ctx.stroke()
    ctx.beginPath()
    ctx.roundRect(bx + 120, by + 18, 4, 6, 1)
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fill()
    // charge fill: map g in [0.5,1] → [0,1]
    const charge = Math.max(0, Math.min(1, (g - 0.5) / 0.5))
    const fillCol = charge > 0.66 ? LIME : charge > 0.33 ? GOLD : PINK
    ctx.fillStyle = fillCol
    ctx.beginPath()
    ctx.roundRect(bx + 2, by + 16, Math.max(0, 116 * charge), 10, 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(245,240,232,0.75)'
    ctx.font = 'bold 10px monospace'
    ctx.fillText(`${Math.round(charge * 100)}%`, bx + 40, by + 42)
    ctx.font = '8px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText(pumpOnRef.current ? 'pump charging' : 'leaking to equilibrium', bx, by + 42)

    // ATP spent counter.
    ctx.textAlign = 'right'
    ctx.font = '9px monospace'
    ctx.fillStyle = `${GOLD}cc`
    ctx.fillText(`ATP spent: ${atpRef.current}`, W - 12, H - 10)

    // Legend.
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    const legend: [string, string][] = [
      [LIME, 'O₂/CO₂'], [GOLD, 'Na⁺'], [BLUE, 'K⁺'], [VIOLET, 'glucose'],
    ]
    let lx = 210
    for (const [col, lab] of legend) {
      ctx.beginPath()
      ctx.arc(lx + 4, H - 13, 3.2, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
      ctx.fillStyle = 'rgba(245,240,232,0.6)'
      ctx.fillText(lab, lx + 12, H - 10)
      lx += 22 + ctx.measureText(lab).width + 12
    }
  }, [])

  const step = useCallback(() => {
    const pumpActive = pumpOnRef.current
    const g = gradRef.current

    // Passive particles random-walk with a small down-gradient bias, reflecting
    // off the outer walls and off the bilayer except at their permitted crossing.
    for (const p of partsRef.current) {
      p.vx += rand(-0.12, 0.12)
      p.vy += rand(-0.14, 0.14)
      p.vx = Math.max(-0.9, Math.min(0.9, p.vx))
      p.vy = Math.max(-1.1, Math.min(1.1, p.vy))
      const nx = p.x + p.vx
      let ny = p.y + p.vy

      // Membrane gate: crossing allowed only through the lane's opening.
      const crossing = (p.y - MID) * (ny - MID) < 0
      if (crossing) {
        const laneX = p.mode === 'simple' ? LANE_SIMPLE : LANE_CHANNEL
        const hw = p.mode === 'simple' ? 30 : CHANNEL_HW
        // Na+ may only leak back through the channel when the pump is off.
        const blockedNa = p.kind === 'na' && p.mode === 'channel' && pumpActive
        if (Math.abs(nx - laneX) > hw || blockedNa) {
          p.vy = -p.vy // bounce off the bilayer
          ny = p.y + p.vy
        }
      }

      p.x = nx
      p.y = ny

      // Reflect off outer bounds.
      if (p.x < 6) { p.x = 6; p.vx = Math.abs(p.vx) }
      if (p.x > W - 6) { p.x = W - 6; p.vx = -Math.abs(p.vx) }
      if (p.y < 8) { p.y = 8; p.vy = Math.abs(p.vy) }
      if (p.y > H - 8) { p.y = H - 8; p.vy = -Math.abs(p.vy) }
    }

    // Pump cycle: advance the two ferried ions; each completed Na+ ejection
    // charges the gradient and costs an ATP.
    if (pumpActive) {
      for (const pi of pumpIonsRef.current) {
        pi.t += 0.018
        if (pi.t >= 1) {
          pi.t = 0
          if (pi.kind === 'na') atpRef.current += 1
        }
      }
      // Pump drives the gradient up toward ~0.98; channel leak drags it down.
      gradRef.current = g + (0.98 - g) * 0.012 - 0.004 * Math.max(0, g - 0.5)
    } else {
      // No pump: Na+ leaks back down its gradient toward equilibrium (0.5).
      gradRef.current = g + (0.5 - g) * 0.012
    }
    gradRef.current = Math.max(0.5, Math.min(1, gradRef.current))
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) draw()
      else setRunning(true)
    },
  })

  useEffect(() => {
    seed()
    draw()
  }, [seed, draw])

  useEffect(() => {
    if (!running) return
    let frame = 0
    const tick = () => {
      step()
      if (frame % 8 === 0) setGradPct(Math.round(Math.max(0, (gradRef.current - 0.5) / 0.5) * 100))
      frame++
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  useEffect(() => {
    if (!running) draw()
  }, [pumpOn, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    setPumpOn(true)
    pumpOnRef.current = true
    seed()
    setGradPct(70)
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Passive is free but downhill; active costs ATP but goes uphill
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
          role="img"
          aria-label="Animated diagram: Passive is free but downhill; active costs ATP but goes uphill. Values are reported below the diagram."
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-lime text-bg-base text-xs font-medium hover:bg-accent-lime/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={() => setPumpOn(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
          style={
            pumpOn
              ? { color: GOLD, borderColor: `${GOLD}55`, background: `${GOLD}14` }
              : { color: 'rgba(245,240,232,0.55)', borderColor: 'rgba(245,240,232,0.18)', background: 'rgba(245,240,232,0.04)' }
          }
        >
          {pumpOn ? 'Pump: ON (charging)' : 'Pump: OFF (draining)'}
        </button>
        <span className="ml-auto text-xs text-text-secondary">
          Na⁺ gradient: <strong style={{ color: gradPct > 50 ? LIME : PINK }}>{gradPct}%</strong> charged
        </span>
      </div>
    </div>
  )
}
