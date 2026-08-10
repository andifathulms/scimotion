'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360
const BG = '#0F0D0A'

const LIME = '#A3E635' // healthy cell / on
const GOLD = '#F59E0B' // arrested / waiting
const PINK = '#F472B6' // damage / cancer
const TEXT = 'rgba(245,240,232,0.85)'
const DIM = 'rgba(245,240,232,0.45)'

// The three checkpoints, placed as fractions around the cycle loop.
type Gate = { id: string; frac: number; label: string; asks: string }
const GATES: Gate[] = [
  { id: 'g1s', frac: 0.08, label: 'G1/S', asks: 'DNA undamaged?' },
  { id: 'g2m', frac: 0.5, label: 'G2/M', asks: 'DNA fully replicated & intact?' },
  { id: 'sac', frac: 0.78, label: 'SAC', asks: 'chromosomes attached?' },
]

// Damage is caught by the two DNA-integrity checkpoints (G1/S and G2/M).
const DNA_GATES = new Set(['g1s', 'g2m'])

const RING_CX = 168
const RING_CY = 182
const RING_R = 116
const TWO_PI = Math.PI * 2
const START = -Math.PI / 2 // top of the loop

function angleAt(frac: number): number {
  return START + frac * TWO_PI
}

type Status = 'running' | 'arrested' | 'dividing'

export function CheckpointAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const [damage, setDamage] = useState(false)
  const [gatesOn, setGatesOn] = useState(true)
  const [running, setRunning] = useState(false)

  // Position around the loop (0..1), generation count, and current status.
  const [pos, setPos] = useState(0)
  const [gen, setGen] = useState(0)
  const [status, setStatus] = useState<Status>('running')
  const [flash, setFlash] = useState(0) // brief pulse when a division happens

  const cfgRef = useRef({ damage, gatesOn })
  useEffect(() => {
    cfgRef.current = { damage, gatesOn }
  }, [damage, gatesOn])

  const posRef = useRef(pos)
  useEffect(() => {
    posRef.current = pos
  }, [pos])

  // Cell population: doubles each completed loop while the cell is dividing.
  const cellCount = Math.min(2 ** gen, 1 << 20)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'middle'

    // ---- Title -------------------------------------------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = LIME
    ctx.fillText('CHECKPOINTS — the brakes on the cell cycle', 14, 18)

    // ================= LEFT: the loop with three gates =====================
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(245,240,232,0.16)'
    ctx.lineWidth = 12
    ctx.arc(RING_CX, RING_CY, RING_R, 0, TWO_PI)
    ctx.stroke()

    // travelled portion of the loop, coloured by health
    const travelCol = damage ? PINK : LIME
    ctx.beginPath()
    ctx.strokeStyle = travelCol
    ctx.lineWidth = 12
    ctx.arc(RING_CX, RING_CY, RING_R, angleAt(0), angleAt(Math.max(0.001, pos)))
    ctx.stroke()

    // gates
    for (const g of GATES) {
      const ang = angleAt(g.frac)
      const gx = RING_CX + Math.cos(ang) * RING_R
      const gy = RING_CY + Math.sin(ang) * RING_R
      const catches = gatesOn && damage && DNA_GATES.has(g.id)
      const isBlocking = catches && status === 'arrested'
      // gate bar across the track
      const nx = Math.cos(ang)
      const ny = Math.sin(ang)
      ctx.strokeStyle = !gatesOn
        ? 'rgba(245,240,232,0.25)'
        : isBlocking
          ? GOLD
          : catches
            ? GOLD
            : LIME
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(gx - nx * 12, gy - ny * 12)
      ctx.lineTo(gx + nx * 12, gy + ny * 12)
      ctx.stroke()
      // gate node
      ctx.beginPath()
      ctx.fillStyle = !gatesOn ? 'rgba(30,27,22,0.9)' : `${isBlocking ? GOLD : LIME}22`
      ctx.arc(gx, gy, 8, 0, TWO_PI)
      ctx.fill()
      ctx.strokeStyle = !gatesOn ? DIM : isBlocking ? GOLD : LIME
      ctx.lineWidth = 1.5
      ctx.stroke()
      // "disabled" cross when gates are off
      if (!gatesOn) {
        ctx.strokeStyle = PINK
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(gx - 5, gy - 5)
        ctx.lineTo(gx + 5, gy + 5)
        ctx.moveTo(gx + 5, gy - 5)
        ctx.lineTo(gx - 5, gy + 5)
        ctx.stroke()
      }
      // label
      const lx = RING_CX + Math.cos(ang) * (RING_R + 24)
      const ly = RING_CY + Math.sin(ang) * (RING_R + 24)
      ctx.fillStyle = !gatesOn ? DIM : isBlocking ? GOLD : DIM
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(g.label, lx, ly - 5)
      ctx.font = '8px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.fillText(g.asks, lx, ly + 6)
    }

    // the travelling cell
    const cang = angleAt(pos)
    const cx = RING_CX + Math.cos(cang) * RING_R
    const cy = RING_CY + Math.sin(cang) * RING_R
    const cellCol = damage ? PINK : LIME
    ctx.beginPath()
    ctx.fillStyle = `${cellCol}33`
    ctx.arc(cx, cy, 11, 0, TWO_PI)
    ctx.fill()
    ctx.strokeStyle = cellCol
    ctx.lineWidth = 2
    ctx.stroke()
    // damage mark inside the cell
    if (damage) {
      ctx.strokeStyle = PINK
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(cx - 4, cy - 4)
      ctx.lineTo(cx + 4, cy + 4)
      ctx.moveTo(cx + 4, cy - 4)
      ctx.lineTo(cx - 4, cy + 4)
      ctx.stroke()
    }
    // arrest halo
    if (status === 'arrested') {
      ctx.strokeStyle = `rgba(245,158,11,${(0.4 + 0.4 * Math.abs(Math.sin(flash))).toFixed(3)})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cx, cy, 16, 0, TWO_PI)
      ctx.stroke()
    }

    // centre status
    ctx.textAlign = 'center'
    ctx.font = 'bold 11px monospace'
    if (status === 'arrested') {
      ctx.fillStyle = GOLD
      ctx.fillText('ARRESTED', RING_CX, RING_CY - 6)
      ctx.font = '8px monospace'
      ctx.fillStyle = DIM
      ctx.fillText('halted for repair', RING_CX, RING_CY + 8)
    } else if (status === 'dividing' && damage) {
      ctx.fillStyle = PINK
      ctx.fillText('DIVIDING', RING_CX, RING_CY - 6)
      ctx.font = '8px monospace'
      ctx.fillStyle = DIM
      ctx.fillText('damage passed on', RING_CX, RING_CY + 8)
    } else {
      ctx.fillStyle = LIME
      ctx.fillText('CYCLING', RING_CX, RING_CY - 6)
      ctx.font = '8px monospace'
      ctx.fillStyle = DIM
      ctx.fillText('healthy', RING_CX, RING_CY + 8)
    }

    // ================= RIGHT: the population ================================
    const PX = 336
    ctx.textAlign = 'left'
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = TEXT
    ctx.fillText('POPULATION', PX, 44)
    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('one loop of the cycle = one division', PX, 58)

    // grid of cells (capped display)
    const shown = Math.min(cellCount, 64)
    const gcols = 8
    const gx0 = PX
    const gy0 = 76
    const cellR = 8
    const gap = 22
    for (let i = 0; i < shown; i++) {
      const r = Math.floor(i / gcols)
      const c = i % gcols
      const dotx = gx0 + c * gap + cellR
      const doty = gy0 + r * gap + cellR
      const justSplit = flash > 0 && i >= shown / 2
      ctx.beginPath()
      ctx.fillStyle = damage ? `${PINK}${justSplit ? 'aa' : '55'}` : `${LIME}55`
      ctx.arc(dotx, doty, cellR, 0, TWO_PI)
      ctx.fill()
      ctx.strokeStyle = damage ? PINK : LIME
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // count readout
    const ry = gy0 + 8 * gap + 6
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = damage && status !== 'arrested' && gen > 0 ? PINK : TEXT
    ctx.fillText(`N = ${cellCount.toLocaleString()}`, PX, ry)
    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText(`N = N₀ · 2^n   with  n = ${gen} division${gen === 1 ? '' : 's'}`, PX, ry + 16)

    // verdict line
    ctx.font = '9px monospace'
    const verdictY = ry + 40
    if (!damage) {
      ctx.fillStyle = LIME
      ctx.fillText('Healthy cell — divides on schedule.', PX, verdictY)
    } else if (gatesOn) {
      ctx.fillStyle = GOLD
      ctx.fillText('Damage + checkpoint = arrest.', PX, verdictY)
      ctx.fillStyle = DIM
      ctx.fillText('The brake holds. No uncontrolled growth.', PX, verdictY + 14)
    } else {
      ctx.fillStyle = PINK
      ctx.fillText('Damage + no checkpoint = cancer.', PX, verdictY)
      ctx.fillStyle = DIM
      ctx.fillText('Divides again and again, out of control.', PX, verdictY + 14)
    }
  }, [pos, gen, status, damage, gatesOn, flash, cellCount])

  useEffect(() => {
    draw()
  }, [draw])

  // Main loop: move the cell around the cycle, enforce gates, count divisions.
  useEffect(() => {
    if (!running) return
    const loop = () => {
      setFlash(f => (f > 0 ? f - 1 : f))
      setPos(prev => {
        const cfg = cfgRef.current
        const next = prev + 0.006

        // Check whether we are crossing a blocking gate this step.
        for (const g of GATES) {
          if (prev < g.frac && next >= g.frac) {
            const catches = cfg.gatesOn && cfg.damage && DNA_GATES.has(g.id)
            if (catches) {
              setStatus('arrested')
              setRunning(false)
              return g.frac
            }
          }
        }

        setStatus(cfg.damage ? 'dividing' : 'running')

        if (next >= 1) {
          // Completed a loop: the cell divides.
          setGen(gn => Math.min(gn + 1, 20))
          setFlash(24)
          return 0
        }
        return next
      })
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // No motion: show a healthy cell that has completed a few divisions.
        setGen(3)
        setStatus('running')
        setPos(0.5)
        return
      }
      setRunning(true)
    },
  })

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    setPos(0)
    setGen(0)
    setStatus('running')
    setFlash(0)
    triggerReset()
  }

  const toggleDamage = () => {
    setDamage(d => !d)
    setStatus('running')
  }
  const toggleGates = () => {
    setGatesOn(g => !g)
    setStatus('running')
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Checkpoints & Cancer
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: Checkpoints & Cancer. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: BG }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (status === 'arrested') setStatus('running')
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-lime text-bg-base text-xs font-medium hover:bg-accent-lime/90 transition-colors"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Run
            </>
          )}
        </button>
        <button
          onClick={toggleDamage}
          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            damage
              ? 'border-accent-pink text-accent-pink'
              : 'border-border text-text-muted hover:text-text-secondary'
          }`}
        >
          {damage ? 'DNA damage: on' : 'Introduce DNA damage'}
        </button>
        <button
          onClick={toggleGates}
          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            gatesOn
              ? 'border-border text-text-muted hover:text-text-secondary'
              : 'border-accent-pink text-accent-pink'
          }`}
        >
          {gatesOn ? 'Disable checkpoints' : 'Checkpoints: disabled'}
        </button>
        <span className="ml-auto text-xs text-text-secondary">
          <span style={{ color: GOLD }}>brake holds</span> ·{' '}
          <span style={{ color: PINK }}>brake cut = cancer</span>
        </span>
      </div>
    </div>
  )
}
