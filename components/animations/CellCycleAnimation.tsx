'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 360
const BG = '#0F0D0A'

const LIME = '#A3E635' // chromosome 1 (primary series)
const BLUE = '#60A5FA' // chromosome 2
const GOLD = '#F59E0B' // S phase / copying highlight
const VIOLET = '#A78BFA' // M phase accent
const PINK = '#F472B6' // spindle poles
const TEXT = 'rgba(245,240,232,0.85)'
const DIM = 'rgba(245,240,232,0.45)'
const FAINT = 'rgba(255,245,235,0.10)'

// Ordered phases of one trip around the cycle.
type Phase =
  | 'G1'
  | 'S'
  | 'G2'
  | 'Prophase'
  | 'Metaphase'
  | 'Anaphase'
  | 'Telophase'

const PHASES: Phase[] = ['G1', 'S', 'G2', 'Prophase', 'Metaphase', 'Anaphase', 'Telophase']

// Where each phase sits on the ring, as a fraction of the whole cycle (0..1),
// starting from the top and going clockwise. Interphase (G1/S/G2) fills three
// quarters; the M-phase stages are packed into the last quarter.
const RANGES: Record<Phase, [number, number]> = {
  G1: [0.0, 0.3],
  S: [0.3, 0.55],
  G2: [0.55, 0.75],
  Prophase: [0.75, 0.82],
  Metaphase: [0.82, 0.88],
  Anaphase: [0.88, 0.94],
  Telophase: [0.94, 1.0],
}

const CAPTION: Record<Phase, string> = {
  G1: 'G1 — the cell grows; each chromosome is a single molecule',
  S: 'S — DNA is replicated; each chromosome is copied into two sister chromatids',
  G2: 'G2 — growth and final checks before division',
  Prophase: 'Prophase — chromosomes condense; the nuclear envelope breaks down',
  Metaphase: 'Metaphase — chromosomes line up at the middle, gripped from both poles',
  Anaphase: 'Anaphase — sister chromatids are pulled to opposite poles',
  Telophase: 'Telophase & cytokinesis — the cell splits into two identical daughters',
}

// Ring geometry (left panel) and cell geometry (right panel).
const RING_CX = 158
const RING_CY = 176
const RING_R = 104
const CELL_CX = 424
const CELL_CY = 180
const CELL_R = 116

const TWO_PI = Math.PI * 2

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// A single chromosome body drawn as a slightly bent rounded bar.
function drawSingle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  len: number,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - 4, y - len)
  ctx.quadraticCurveTo(x + 5, y, x - 4, y + len)
  ctx.stroke()
}

// A replicated chromosome: two sister chromatids joined at a centromere,
// drawn as an X. `spread` pulls the two chromatids apart (used in anaphase).
function drawReplicated(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  len: number,
  spread: number,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  // left chromatid
  ctx.beginPath()
  ctx.moveTo(x - spread - 6, y - len)
  ctx.quadraticCurveTo(x - spread + 2, y, x - spread - 6, y + len)
  ctx.stroke()
  // right chromatid
  ctx.beginPath()
  ctx.moveTo(x + spread + 6, y - len)
  ctx.quadraticCurveTo(x + spread - 2, y, x + spread + 6, y + len)
  ctx.stroke()
  // centromere link (only while the sisters are still joined)
  if (spread < 5) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, 3.2, 0, TWO_PI)
    ctx.fill()
  }
}

export function CellCycleAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const [phaseIdx, setPhaseIdx] = useState(0)
  const [prog, setProg] = useState(0)
  const [running, setRunning] = useState(false)

  const stateRef = useRef({ phaseIdx, prog, running })
  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // No motion: jump straight to the finished two-daughter frame.
        setPhaseIdx(PHASES.length - 1)
        setProg(1)
        return
      }
      setRunning(true)
    },
  })

  useEffect(() => {
    stateRef.current = { phaseIdx, prog, running }
  }, [phaseIdx, prog, running])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const phase = PHASES[phaseIdx]

    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'middle'

    // ---- Title -------------------------------------------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = LIME
    ctx.fillText('THE CELL CYCLE — one cell becomes two identical daughters', 14, 18)

    // ================= LEFT: the cycle ring =================================
    // Interphase (G1/S/G2) arc, then the M-phase arc, coloured differently.
    const a0 = -Math.PI / 2 // top
    const angleAt = (frac: number) => a0 + frac * TWO_PI

    // Interphase band 0 .. 0.75
    ctx.lineWidth = 12
    ctx.lineCap = 'butt'
    const segs: [number, number, string][] = [
      [RANGES.G1[0], RANGES.G1[1], `${LIME}cc`],
      [RANGES.S[0], RANGES.S[1], `${GOLD}cc`],
      [RANGES.G2[0], RANGES.G2[1], `${BLUE}cc`],
      [0.75, 1.0, `${VIOLET}cc`],
    ]
    for (const [f0, f1, col] of segs) {
      ctx.beginPath()
      ctx.strokeStyle = col
      ctx.arc(RING_CX, RING_CY, RING_R, angleAt(f0), angleAt(f1))
      ctx.stroke()
    }

    // Segment labels around the ring.
    ctx.font = '10px monospace'
    const ringLabel = (frac: number, text: string, color: string) => {
      const ang = angleAt(frac)
      const lx = RING_CX + Math.cos(ang) * (RING_R + 20)
      const ly = RING_CY + Math.sin(ang) * (RING_R + 20)
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.fillText(text, lx, ly)
    }
    ringLabel(0.15, 'G1', LIME)
    ringLabel(0.425, 'S', GOLD)
    ringLabel(0.65, 'G2', BLUE)
    ringLabel(0.875, 'M', VIOLET)

    // Interphase / M grouping text in the centre.
    ctx.textAlign = 'center'
    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    ctx.fillText('interphase', RING_CX, RING_CY - 12)
    ctx.fillText('(G1 · S · G2)', RING_CX, RING_CY)
    ctx.fillStyle = VIOLET
    ctx.fillText('M = mitosis + cytokinesis', RING_CX, RING_CY + 16)

    // Moving marker at the current cycle position.
    const [r0, r1] = RANGES[phase]
    const frac = lerp(r0, r1, prog)
    const mAng = angleAt(frac)
    const mx = RING_CX + Math.cos(mAng) * RING_R
    const my = RING_CY + Math.sin(mAng) * RING_R
    ctx.beginPath()
    ctx.fillStyle = '#FFFFFF'
    ctx.arc(mx, my, 6.5, 0, TWO_PI)
    ctx.fill()
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 2
    ctx.arc(mx, my, 10, 0, TWO_PI)
    ctx.stroke()

    // ================= RIGHT: the cell =====================================
    const inM = phaseIdx >= 3
    const isTelo = phase === 'Telophase'

    // Cell membrane. In telophase it pinches into two circles.
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(245,240,232,0.55)'
    if (isTelo) {
      const gap = lerp(0, 74, prog) // poles separate as the cell splits
      const rr = lerp(CELL_R, 74, prog)
      for (const sgn of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(CELL_CX + sgn * gap, CELL_CY, rr, 0, TWO_PI)
        ctx.stroke()
      }
      // cleavage furrow guide
      ctx.strokeStyle = FAINT
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(CELL_CX, CELL_CY - CELL_R)
      ctx.lineTo(CELL_CX, CELL_CY + CELL_R)
      ctx.stroke()
      ctx.setLineDash([])
    } else {
      ctx.beginPath()
      ctx.arc(CELL_CX, CELL_CY, CELL_R, 0, TWO_PI)
      ctx.stroke()
    }

    // Nucleus present through interphase; dissolving in prophase; gone in
    // metaphase/anaphase; reforming in telophase.
    const nucleusAlpha =
      phase === 'G1' || phase === 'S' || phase === 'G2'
        ? 0.5
        : phase === 'Prophase'
          ? 0.5 * (1 - prog)
          : 0
    if (nucleusAlpha > 0.01) {
      ctx.beginPath()
      ctx.strokeStyle = `rgba(167,139,250,${nucleusAlpha.toFixed(3)})`
      ctx.lineWidth = 1.5
      ctx.arc(CELL_CX, CELL_CY, 74, 0, TWO_PI)
      ctx.stroke()
    }

    // Spindle poles + fibres during metaphase and anaphase.
    if (phase === 'Metaphase' || phase === 'Anaphase') {
      const px = CELL_R - 12
      for (const sgn of [-1, 1]) {
        const pole = CELL_CX + sgn * px
        ctx.fillStyle = PINK
        ctx.beginPath()
        ctx.arc(pole, CELL_CY, 4, 0, TWO_PI)
        ctx.fill()
        ctx.strokeStyle = `${PINK}55`
        ctx.lineWidth = 1
        for (const dy of [-52, -18, 18, 52]) {
          ctx.beginPath()
          ctx.moveTo(pole, CELL_CY)
          ctx.lineTo(CELL_CX + sgn * 10, CELL_CY + dy)
          ctx.stroke()
        }
      }
    }

    // ---- The chromosomes ---------------------------------------------------
    // Two chromosomes: lime (upper) and blue (lower). Their appearance and
    // position depend on the phase. `condensed` shortens them once packed.
    const drawChromosomes = () => {
      if (phase === 'G1') {
        // Two single, decondensed chromosomes, loosely in the nucleus.
        drawSingle(ctx, CELL_CX - 22, CELL_CY - 20, LIME, 26)
        drawSingle(ctx, CELL_CX + 24, CELL_CY + 22, BLUE, 26)
        return
      }
      if (phase === 'S') {
        // Copying: the second sister chromatid grows in alongside the first.
        const grow = prog
        // lime, partly copied
        drawSingle(ctx, CELL_CX - 22, CELL_CY - 20, LIME, 26)
        if (grow > 0.05) {
          ctx.globalAlpha = Math.min(1, grow * 1.4)
          drawSingle(ctx, CELL_CX - 22 + 9, CELL_CY - 20, GOLD, 26 * grow)
          ctx.globalAlpha = 1
        }
        // blue, partly copied
        drawSingle(ctx, CELL_CX + 24, CELL_CY + 22, BLUE, 26)
        if (grow > 0.05) {
          ctx.globalAlpha = Math.min(1, grow * 1.4)
          drawSingle(ctx, CELL_CX + 24 + 9, CELL_CY + 22, GOLD, 26 * grow)
          ctx.globalAlpha = 1
        }
        return
      }
      if (phase === 'G2') {
        // Two replicated chromosomes (joined sisters), still decondensed.
        drawReplicated(ctx, CELL_CX - 24, CELL_CY - 20, LIME, 26, 4)
        drawReplicated(ctx, CELL_CX + 26, CELL_CY + 22, BLUE, 26, 4)
        return
      }
      if (phase === 'Prophase') {
        // Condensing: bars shorten as prog rises.
        const len = lerp(26, 17, prog)
        drawReplicated(ctx, CELL_CX - 30, CELL_CY - 24, LIME, len, 4)
        drawReplicated(ctx, CELL_CX + 30, CELL_CY + 26, BLUE, len, 4)
        return
      }
      if (phase === 'Metaphase') {
        // Lined up on the metaphase plate (vertical centre line).
        ctx.strokeStyle = FAINT
        ctx.setLineDash([3, 4])
        ctx.beginPath()
        ctx.moveTo(CELL_CX, CELL_CY - CELL_R + 14)
        ctx.lineTo(CELL_CX, CELL_CY + CELL_R - 14)
        ctx.stroke()
        ctx.setLineDash([])
        drawReplicated(ctx, CELL_CX, CELL_CY - 34, LIME, 17, 4)
        drawReplicated(ctx, CELL_CX, CELL_CY + 34, BLUE, 17, 4)
        return
      }
      if (phase === 'Anaphase') {
        // Sisters separate: one chromatid of each chromosome to each pole.
        const off = lerp(0, CELL_R - 34, prog)
        // lime: sisters move left and right
        drawSingle(ctx, CELL_CX - off, CELL_CY - 34, LIME, 17)
        drawSingle(ctx, CELL_CX + off, CELL_CY - 34, LIME, 17)
        // blue: sisters move left and right
        drawSingle(ctx, CELL_CX - off, CELL_CY + 34, BLUE, 17)
        drawSingle(ctx, CELL_CX + off, CELL_CY + 34, BLUE, 17)
        return
      }
      // Telophase: each daughter carries one lime + one blue single chromosome.
      const gap = lerp(0, 74, prog)
      for (const sgn of [-1, 1]) {
        const dcx = CELL_CX + sgn * gap
        drawSingle(ctx, dcx - 14, CELL_CY - 16, LIME, 16)
        drawSingle(ctx, dcx + 16, CELL_CY + 16, BLUE, 16)
        // reforming nuclear envelope
        ctx.beginPath()
        ctx.strokeStyle = `rgba(167,139,250,${(0.5 * prog).toFixed(3)})`
        ctx.lineWidth = 1.5
        ctx.arc(dcx, CELL_CY, 52, 0, TWO_PI)
        ctx.stroke()
      }
    }
    drawChromosomes()

    // Copy/distribute annotation over the cell panel.
    ctx.textAlign = 'center'
    ctx.font = '9px monospace'
    ctx.fillStyle = phase === 'S' ? GOLD : inM ? VIOLET : DIM
    const tag =
      phase === 'S'
        ? 'copying the genome'
        : inM
          ? 'distributing the copies'
          : phase === 'G1'
            ? '2 chromosomes, single copies'
            : '2 chromosomes, now duplicated'
    ctx.fillText(tag, CELL_CX, CELL_CY + CELL_R + 14)

    // ---- Phase caption (bottom) -------------------------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = inM ? VIOLET : phase === 'S' ? GOLD : TEXT
    ctx.fillText(`${phaseIdx + 1}/7  ${phase.toUpperCase()}`, 14, H - 30)
    ctx.font = '10px monospace'
    ctx.fillStyle = DIM
    ctx.fillText(CAPTION[phase], 14, H - 14)
  }, [phaseIdx, prog])

  useEffect(() => {
    draw()
  }, [draw])

  // Auto-run: advance progress within a phase, then step to the next phase.
  useEffect(() => {
    if (!running || !visible) return
    const loop = () => {
      setProg(prev => {
        const next = prev + 0.018
        if (next >= 1) {
          const idx = stateRef.current.phaseIdx
          if (idx >= PHASES.length - 1) {
            setRunning(false)
            return 1
          }
          setPhaseIdx(idx + 1)
          return 0
        }
        return next
      })
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, visible])


  const atEnd = phaseIdx >= PHASES.length - 1 && prog >= 1

  const step = () => {
    setRunning(false)
    if (prog < 1) {
      setProg(1)
      return
    }
    setPhaseIdx(idx => {
      if (idx >= PHASES.length - 1) return idx
      return idx + 1
    })
    setProg(1)
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    setPhaseIdx(0)
    setProg(0)
    triggerReset()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · The Cell Cycle & Mitosis
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
          aria-label="Animated diagram: The Cell Cycle & Mitosis. Values are reported below the diagram."
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
            if (atEnd) {
              setPhaseIdx(0)
              setProg(0)
            }
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
              <Play size={12} /> {atEnd ? 'Run again' : 'Play'}
            </>
          )}
        </button>
        <button
          onClick={step}
          disabled={atEnd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs font-medium hover:text-text-primary transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <ChevronRight size={12} /> Step
        </button>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          <span style={{ color: LIME }}>chromosome 1</span> ·{' '}
          <span style={{ color: BLUE }}>chromosome 2</span> — each daughter gets one of each
        </WidgetStatus>
      </div>
    </div>
  )
}
