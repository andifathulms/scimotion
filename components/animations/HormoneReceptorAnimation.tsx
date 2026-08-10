'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

// Field accent (pink) — the hormone molecules.
const PINK = '#F472B6'
const TEAL = '#2DD4BF'
const GOLD = '#F59E0B'
const BG = '#0F0D0A'

// Bloodstream lane.
const VESSEL_TOP = 58
const VESSEL_BOT = 118
const LANE = (VESSEL_TOP + VESSEL_BOT) / 2

// Cells sit below the vessel, their membrane flush with the vessel floor.
const CELL_TOP = VESSEL_BOT
const CELL_BOT = 300
const CELL_W = 86

type Mode = 'water' | 'lipid'

type Cell = {
  cx: number
  target: boolean
  bound: number // molecules captured
}

type Mol = {
  x: number
  y: number
  bound: boolean
  cell: number // index of the cell it bound to, else -1
  enter: number // 0..1 progress into the cell (lipid mode)
  lane: number // seed for vertical wobble
}

const CELL_LAYOUT: { cx: number; target: boolean }[] = [
  { cx: 128, target: true },
  { cx: 226, target: false },
  { cx: 324, target: true },
  { cx: 422, target: false },
  { cx: 512, target: true },
]

const CAPACITY = 3 // molecules a target cell binds before saturating
const SPEED = 1.5 // px per frame along the vessel
const SPAWN_EVERY = 26 // frames between new molecules

function freshCells(): Cell[] {
  return CELL_LAYOUT.map(c => ({ cx: c.cx, target: c.target, bound: 0 }))
}

export function HormoneReceptorAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [mode, setMode] = useState<Mode>('water')
  const [running, setRunning] = useState(false)

  const modeRef = useRef<Mode>('water')
  const frameRef = useRef(0)
  const spawnCountRef = useRef(0)
  const molsRef = useRef<Mol[]>([])
  const cellsRef = useRef<Cell[]>(freshCells())

  const resetSim = useCallback(() => {
    frameRef.current = 0
    spawnCountRef.current = 0
    molsRef.current = []
    cellsRef.current = freshCells()
  }, [])

  // Advance the simulation by one tick. Deterministic — no randomness.
  const stepSim = useCallback(() => {
    const f = frameRef.current
    const cells = cellsRef.current
    const isLipid = modeRef.current === 'lipid'

    // Spawn a new molecule from the gland at a fixed cadence.
    if (f % SPAWN_EVERY === 0) {
      const n = spawnCountRef.current++
      molsRef.current.push({
        x: 40,
        y: LANE + ((n % 3) - 1) * 12,
        bound: false,
        cell: -1,
        enter: 0,
        lane: n % 5,
      })
    }

    for (const m of molsRef.current) {
      if (m.bound) {
        if (isLipid && m.enter < 1) {
          // Steroid diffuses inward toward the nucleus.
          m.enter = Math.min(1, m.enter + 0.03)
          const cell = cells[m.cell]
          const ny = (CELL_TOP + CELL_BOT) / 2 + 14
          m.y += (ny - m.y) * 0.12
          m.x += (cell.cx - m.x) * 0.12
        }
        continue
      }

      m.x += SPEED
      // Gentle organic wobble within the vessel.
      m.y = LANE + Math.sin((f + m.lane * 30) * 0.06) * 6

      // Try to bind at the next unsaturated target cell it overlaps.
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i]
        if (!c.target || c.bound >= CAPACITY) continue
        if (Math.abs(m.x - c.cx) < 14) {
          m.bound = true
          m.cell = i
          c.bound++
          if (isLipid) {
            // begin entering; final position handled above
            m.enter = 0.001
          } else {
            // dock at the surface receptor on the vessel floor
            m.y = VESSEL_BOT - 2
            m.x = c.cx
          }
          break
        }
      }
    }

    // Retire molecules that have flowed off the right edge unbound.
    molsRef.current = molsRef.current.filter(m => m.bound || m.x < W + 20)

    frameRef.current++
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    const isLipid = modeRef.current === 'lipid'
    const cells = cellsRef.current
    const f = frameRef.current

    // --- Bloodstream lane ---
    ctx.fillStyle = 'rgba(96,165,250,0.06)'
    ctx.fillRect(0, VESSEL_TOP, W, VESSEL_BOT - VESSEL_TOP)
    ctx.strokeStyle = 'rgba(96,165,250,0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(0, VESSEL_TOP); ctx.lineTo(W, VESSEL_TOP); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, VESSEL_BOT); ctx.lineTo(W, VESSEL_BOT); ctx.stroke()
    ctx.fillStyle = 'rgba(96,165,250,0.55)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('bloodstream', 96, VESSEL_TOP - 6)

    // Flow ticks drifting right (deterministic).
    ctx.strokeStyle = 'rgba(96,165,250,0.18)'
    ctx.lineWidth = 1
    for (let k = 0; k < 12; k++) {
      const tx = ((k * 55 + f * 0.8) % (W + 40)) - 20
      ctx.beginPath(); ctx.moveTo(tx, LANE - 4); ctx.lineTo(tx + 10, LANE - 4); ctx.stroke()
    }

    // --- Gland at far left ---
    ctx.fillStyle = 'rgba(244,114,182,0.18)'
    ctx.strokeStyle = PINK
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.ellipse(24, LANE, 22, 30, 0, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = PINK
    ctx.font = 'bold 9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('GLAND', 24, LANE + 46)

    // --- Cells ---
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]
      const x0 = c.cx - CELL_W / 2
      const activ = c.target ? c.bound / CAPACITY : 0

      // Cell body.
      ctx.beginPath()
      roundRect(ctx, x0, CELL_TOP + 4, CELL_W, CELL_BOT - CELL_TOP - 8, 10)
      if (c.target && activ > 0) {
        const glow = 0.08 + activ * 0.22
        ctx.fillStyle = `rgba(45,212,191,${glow})`
      } else {
        ctx.fillStyle = 'rgba(120,120,130,0.08)'
      }
      ctx.fill()
      ctx.strokeStyle = c.target ? 'rgba(45,212,191,0.5)' : 'rgba(150,150,160,0.35)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Receptor on the membrane (vessel floor).
      if (c.target) {
        // A notched "lock" that matches the hormone key — teal.
        ctx.fillStyle = TEAL
        ctx.beginPath()
        ctx.moveTo(c.cx - 9, CELL_TOP + 4)
        ctx.lineTo(c.cx - 9, CELL_TOP - 5)
        ctx.lineTo(c.cx - 3, CELL_TOP - 5)
        ctx.lineTo(c.cx - 3, CELL_TOP - 1)
        ctx.lineTo(c.cx + 3, CELL_TOP - 1)
        ctx.lineTo(c.cx + 3, CELL_TOP - 5)
        ctx.lineTo(c.cx + 9, CELL_TOP - 5)
        ctx.lineTo(c.cx + 9, CELL_TOP + 4)
        ctx.closePath()
        ctx.fill()
      } else {
        // No matching receptor — a flat, mismatched membrane stub.
        ctx.fillStyle = 'rgba(150,150,160,0.5)'
        ctx.fillRect(c.cx - 8, CELL_TOP - 3, 16, 5)
      }

      // Nucleus (used by the steroid pathway).
      const nucY = (CELL_TOP + CELL_BOT) / 2 + 14
      const geneGlow = isLipid && c.target ? activ : 0
      ctx.beginPath()
      ctx.arc(c.cx, nucY, 20, 0, Math.PI * 2)
      ctx.fillStyle = geneGlow > 0
        ? `rgba(167,139,250,${0.2 + geneGlow * 0.5})`
        : 'rgba(167,139,250,0.12)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(167,139,250,0.45)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Response readout inside the cell.
      if (c.target && activ > 0) {
        ctx.textAlign = 'center'
        ctx.font = '8px monospace'
        if (isLipid) {
          // Gene-expression bars growing from the nucleus.
          ctx.fillStyle = GOLD
          const bars = Math.round(activ * 3)
          for (let b = 0; b < bars; b++) {
            ctx.fillRect(c.cx - 12 + b * 9, nucY + 26, 5, 8 + b * 2)
          }
          ctx.fillStyle = 'rgba(245,158,11,0.8)'
          ctx.fillText('gene on', c.cx, nucY + 50)
        } else {
          // Second-messenger sparks radiating in the cytoplasm.
          ctx.fillStyle = GOLD
          for (let s = 0; s < 6; s++) {
            const a = (s / 6) * Math.PI * 2 + f * 0.05
            const r = 18 + Math.sin(f * 0.1 + s) * 4
            ctx.beginPath()
            ctx.arc(c.cx + Math.cos(a) * r, CELL_TOP + 40 + Math.sin(a) * r * 0.5, 2, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.fillStyle = 'rgba(245,158,11,0.85)'
          ctx.fillText('2nd msgr', c.cx, CELL_TOP + 70)
        }
      } else if (!c.target) {
        ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(150,150,160,0.55)'
        ctx.font = '8px monospace'
        ctx.fillText('no receptor', c.cx, nucY + 2)
        ctx.fillText('(ignores)', c.cx, nucY + 12)
      }
    }

    // --- Hormone molecules ---
    for (const m of molsRef.current) {
      drawHormone(ctx, m.x, m.y)
    }

    // Caption.
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText(
      isLipid ? 'steroid diffuses through the membrane' : 'hormone binds the surface receptor',
      12, H - 10
    )
  }, [])

  // A hormone molecule drawn as a small pink "key".
  const drawHormone = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.fillStyle = PINK
    ctx.beginPath()
    ctx.arc(x, y, 4.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(x - 1.5, y - 2, 8, 4)
  }

  // --- Animation loop ---
  useEffect(() => {
    if (!running) return
    const loop = () => {
      stepSim()
      draw()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running, stepSim, draw])

  // Keep a frame painted when idle / after mode change.
  useEffect(() => {
    if (!running) draw()
  }, [running, mode, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // One static final frame: fast-forward the simulation, no loop.
        resetSim()
        for (let i = 0; i < 260; i++) stepSim()
        draw()
        return
      }
      setRunning(true)
    },
  })

  const switchMode = (m: Mode) => {
    setMode(m)
    modeRef.current = m
    resetSim()
    draw()
  }

  const reset = () => {
    triggerReset()
    setRunning(false)
    resetSim()
    draw()
  }

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Receptors make a body-wide signal specific
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Receptors make a body-wide signal specific. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: BG }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          hormone:{' '}
          <span style={{ color: PINK }}>{mode === 'water' ? 'water-soluble' : 'lipid-soluble (steroid)'}</span>
        </span>
        <span>
          mechanism:{' '}
          <span className="text-accent-teal">
            {mode === 'water' ? 'surface receptor → 2nd messenger' : 'membrane diffusion → nuclear receptor → gene expression'}
          </span>
        </span>
        <span className="text-text-muted">grey cells: no receptor → no response</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Hormone type:</span>
          <button
            onClick={() => switchMode('water')}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              mode === 'water' ? 'bg-bg-hover text-text-secondary' : 'bg-bg-surface text-text-muted'
            }`}
          >
            Water-soluble
          </button>
          <button
            onClick={() => switchMode('lipid')}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              mode === 'lipid' ? 'bg-bg-hover text-text-secondary' : 'bg-bg-surface text-text-muted'
            }`}
          >
            Lipid-soluble
          </button>
        </div>
      </div>
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
