'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const ORANGE = '#FB923C'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const TEAL = '#10B981'
const INK = '#F5F0E8'
const DIM = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.35)'

const MAX = 8            // largest degree of polymerization shown
const START_X = 56
const STEP = 62
const BOX_W = 46
const BOX_H = 38
const CY = 168          // chain centre line

type Mechanism = 'addition' | 'condensation'

// Deterministic devicePixelRatio-aware sizing.
function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
  canvas.width = W * dpr
  canvas.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Draw a single monomer unit box at its chain slot i, optionally offset while arriving.
function drawUnit(
  ctx: CanvasRenderingContext2D,
  i: number,
  dy: number,
  alpha: number,
  mech: Mechanism
) {
  const x = START_X + i * STEP
  const y = CY - BOX_H / 2 + dy
  ctx.globalAlpha = alpha
  roundRect(ctx, x, y, BOX_W, BOX_H, 8)
  ctx.fillStyle = mech === 'addition' ? 'rgba(251,146,60,0.16)' : 'rgba(245,158,11,0.16)'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = mech === 'addition' ? ORANGE : GOLD
  ctx.stroke()

  // Monomer label
  ctx.fillStyle = INK
  ctx.font = 'bold 13px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('M', x + BOX_W / 2, y + BOX_H / 2 + 5)
  ctx.globalAlpha = 1
}

export function PolymerizationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const unitsRef = useRef(1)       // float: whole part = bonded units, frac = arriving unit
  const holdRef = useRef(0)        // frames to pause at completion before looping

  const [running, setRunning] = useState(false)
  const [mech, setMech] = useState<Mechanism>('addition')
  const mechRef = useRef<Mechanism>('addition')
  const [units, setUnits] = useState(1)

  const draw = useCallback((u: number, m: Mechanism) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    const bonded = Math.min(MAX, Math.floor(u))
    const frac = Math.min(1, u - Math.floor(u))
    const arriving = bonded < MAX && frac > 0.001

    // --- Header / reaction schematic --------------------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = INK
    if (m === 'addition') {
      ctx.fillText('Addition:  n (CH₂=CH₂)  →  —(CH₂—CH₂)ₙ—', 16, 26)
      ctx.font = '10px monospace'
      ctx.fillStyle = DIM
      ctx.fillText('C=C double bonds open and add on — no byproduct', 16, 44)
    } else {
      ctx.fillText('Condensation:  H—M—OH + H—M—OH  →  —M—M—  + H₂O', 16, 26)
      ctx.font = '10px monospace'
      ctx.fillStyle = DIM
      ctx.fillText('each new bond ejects a small molecule (water)', 16, 44)
    }

    // --- Bond lines between settled units ---------------------------------
    ctx.strokeStyle = m === 'addition' ? 'rgba(251,146,60,0.7)' : 'rgba(245,158,11,0.7)'
    ctx.lineWidth = 3
    for (let i = 0; i < bonded - 1; i++) {
      const x0 = START_X + i * STEP + BOX_W
      const x1 = START_X + (i + 1) * STEP
      ctx.beginPath()
      ctx.moveTo(x0, CY)
      ctx.lineTo(x1, CY)
      ctx.stroke()
    }
    // Forming bond to the arriving unit
    if (arriving && bonded >= 1) {
      const x0 = START_X + (bonded - 1) * STEP + BOX_W
      const x1 = START_X + bonded * STEP
      ctx.strokeStyle = m === 'addition' ? ORANGE : GOLD
      ctx.lineWidth = 3
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(x0, CY)
      ctx.lineTo(x0 + (x1 - x0) * frac, CY)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // --- Settled units ----------------------------------------------------
    for (let i = 0; i < bonded; i++) drawUnit(ctx, i, 0, 1, m)

    // --- Arriving unit sliding up into place ------------------------------
    if (arriving) {
      const dy = (1 - frac) * 96
      drawUnit(ctx, bonded, dy, 0.55 + 0.45 * frac, m)

      // Condensation: eject a water molecule from the join as the bond forms
      if (m === 'condensation' && bonded >= 1 && frac > 0.35) {
        const p = (frac - 0.35) / 0.65
        const jx = START_X + (bonded - 1) * STEP + BOX_W + (STEP - BOX_W) / 2
        const wy = CY - 26 - p * 70
        ctx.globalAlpha = 1 - p
        ctx.beginPath()
        ctx.arc(jx, wy, 8, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(96,165,250,0.25)'
        ctx.fill()
        ctx.strokeStyle = BLUE
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = BLUE
        ctx.font = 'bold 9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('H₂O', jx, wy + 3)
        ctx.globalAlpha = 1
      }
    }

    // --- Degree-of-polymerization bracket ---------------------------------
    if (bonded >= 1) {
      const leftX = START_X - 6
      const rightX = START_X + (bonded - 1) * STEP + BOX_W + 6
      const by = CY + BOX_H / 2 + 16
      ctx.strokeStyle = FAINT
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(leftX, by - 6); ctx.lineTo(leftX, by); ctx.lineTo(rightX, by); ctx.lineTo(rightX, by - 6)
      ctx.stroke()
      ctx.fillStyle = m === 'addition' ? ORANGE : GOLD
      ctx.font = 'bold 12px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('degree of polymerization  n = ' + bonded, (leftX + rightX) / 2, by + 18)
    }

    ctx.textAlign = 'left'
  }, [])

  // --- Animation loop -----------------------------------------------------
  useEffect(() => {
    if (!running) return
    const tick = () => {
      let u = unitsRef.current
      if (holdRef.current > 0) {
        holdRef.current -= 1
        if (holdRef.current === 0) { u = 1; unitsRef.current = 1; setUnits(1) }
      } else {
        u += 0.018
        if (u >= MAX) { u = MAX; holdRef.current = 60 }
        unitsRef.current = u
        setUnits(Math.floor(u))
      }
      draw(unitsRef.current, mechRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      const c = canvasRef.current
      if (c) setupCanvas(c)
      if (reduced) {
        unitsRef.current = MAX
        setUnits(MAX)
        draw(MAX, mechRef.current)
        return
      }
      setRunning(true)
    },
  })

  useEffect(() => {
    const c = canvasRef.current
    if (c) setupCanvas(c)
    draw(unitsRef.current, mechRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (!running) draw(unitsRef.current, mech) }, [running, mech, draw])

  const step = () => {
    setRunning(false)
    holdRef.current = 0
    let u = Math.floor(unitsRef.current) + 1
    if (u > MAX) u = 1
    unitsRef.current = u
    setUnits(u)
    draw(u, mechRef.current)
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    holdRef.current = 0
    unitsRef.current = 1
    setUnits(1)
    draw(1, mechRef.current)
  }

  const chooseMech = (m: Mechanism) => {
    mechRef.current = m
    setMech(m)
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    holdRef.current = 0
    unitsRef.current = 1
    setUnits(1)
    draw(1, m)
  }

  const byproduct = mech === 'condensation'
    ? Math.max(0, units - 1) + ' H₂O'
    : 'none'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Monomers link into a chain</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Monomers link into a chain. Values are reported below the diagram." ref={canvasRef} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>mechanism: <span style={{ color: mech === 'addition' ? ORANGE : GOLD }}>{mech}</span></span>
        <span>units added: <span style={{ color: INK }}>{units}</span></span>
        <span>byproduct: <span style={{ color: mech === 'condensation' ? BLUE : TEAL }}>{byproduct}</span></span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={step}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
          style={{ color: BLUE, borderColor: `${BLUE}55`, background: `${BLUE}14` }}
        >
          <ChevronRight size={12} /> Step
        </button>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => chooseMech('addition')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            style={mech === 'addition'
              ? { color: '#0F0D0A', background: ORANGE, borderColor: ORANGE }
              : { color: ORANGE, background: 'transparent', borderColor: `${ORANGE}55` }}
          >
            Addition
          </button>
          <button
            onClick={() => chooseMech('condensation')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            style={mech === 'condensation'
              ? { color: '#0F0D0A', background: GOLD, borderColor: GOLD }
              : { color: GOLD, background: 'transparent', borderColor: `${GOLD}55` }}
          >
            Condensation
          </button>
        </div>
      </div>
    </div>
  )
}
