'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300
const LIME = '#A3E635'
const RED = '#F87171'
const BLUE = '#60A5FA'

// The cell repairs a Cas9 double-strand break one of two ways. Both start from the
// SAME cut. The gene of interest reads left-to-right in codons of three.
const LEFT = 'ATGACC' // upstream of the cut (unchanged in both outcomes)
const RIGHT_ORIG = 'TAGCTG' // downstream, with a defect at the first base (mutant "T")

// NHEJ ligates the blunt ends sloppily: here two bases are lost at the junction,
// shifting every downstream codon → frameshift → knockout.
const NHEJ_JOIN = RIGHT_ORIG.slice(2) // "GCTG": the "TA" at the junction is deleted

// HDR copies a supplied donor template across the break, pasting in the corrected
// base (the mutant "T" becomes the intended "C") with no indel.
const RIGHT_FIXED = 'CAGCTG'
const DONOR = LEFT + RIGHT_FIXED // homology arms flank the edit

type Mode = 'nhej' | 'hdr'

const CW = 15 // width per base cell
const CUT_X = 300 // screen x of the break

// Timeline (frames).
const T_APPROACH = 40 // ends drift / donor slides in
const T_JOIN = 40 // ligation or template copy
const T_SETTLE = 30
const T_MAX = T_APPROACH + T_JOIN + T_SETTLE

function drawSeq(
  ctx: CanvasRenderingContext2D,
  seq: string,
  x: number,
  y: number,
  colorFor: (i: number) => string,
  align: 'left' | 'right' = 'left'
) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '13px monospace'
  const startX = align === 'left' ? x : x - seq.length * CW
  for (let i = 0; i < seq.length; i++) {
    const cx = startX + i * CW + CW / 2
    ctx.fillStyle = colorFor(i)
    ctx.fillText(seq[i], cx, y)
  }
  return startX
}

export function CrisprRepairAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) setTick(T_MAX)
      else setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [tick, setTick] = useState(0)
  const [mode, setMode] = useState<Mode>('nhej')

  const approach = Math.min(1, tick / T_APPROACH)
  const join = Math.min(1, Math.max(0, (tick - T_APPROACH) / T_JOIN))
  const settled = tick >= T_APPROACH + T_JOIN
  const done = tick >= T_MAX

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('Cas9 has cut. The cell — not CRISPR — now repairs the break.', 16, 22)

    const topY = 70

    // --- Row 1: the double-strand break (identical for both paths) -----------
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('double-strand break', 16, topY - 20)

    // gap between the two blunt ends, closing during "approach"
    const gap = (1 - (mode === 'nhej' ? approach : 1)) * 22 + 8
    drawSeq(ctx, LEFT, CUT_X - gap, topY, () => 'rgba(245,240,232,0.85)', 'right')
    drawSeq(ctx, RIGHT_ORIG, CUT_X + gap, topY, i =>
      i === 0 ? RED : 'rgba(245,240,232,0.85)'
    )
    // jagged cut marker
    ctx.strokeStyle = LIME
    ctx.setLineDash([4, 3])
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(CUT_X, topY - 16)
    ctx.lineTo(CUT_X, topY + 16)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = RED
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('defect', CUT_X + gap + CW / 2, topY + 18)

    // --- Path-specific machinery + result -----------------------------------
    const midY = 160
    const resY = 232

    if (mode === 'nhej') {
      ctx.textAlign = 'left'
      ctx.font = '10px monospace'
      ctx.fillStyle = BLUE
      ctx.fillText('NHEJ — ends ligated directly, bases lost at the junction', 16, midY - 20)

      // ligation flash at the junction
      if (join > 0 && !settled) {
        ctx.fillStyle = `rgba(96,165,250,${0.5 - 0.4 * join})`
        ctx.beginPath()
        ctx.arc(CUT_X, midY, 14 - join * 8, 0, Math.PI * 2)
        ctx.fill()
      }

      // rejoined strand: LEFT + NHEJ_JOIN (the "TA" deleted)
      const startX = drawSeq(ctx, LEFT + NHEJ_JOIN, CUT_X - LEFT.length * CW, midY, i =>
        i < LEFT.length ? 'rgba(245,240,232,0.85)' : settled ? RED : 'rgba(245,240,232,0.5)'
      )
      if (settled) {
        // mark the deletion scar
        ctx.strokeStyle = RED
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(CUT_X - 3, midY - 12)
        ctx.lineTo(CUT_X + 3, midY + 12)
        ctx.stroke()
        ctx.fillStyle = RED
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('−2 bp indel', CUT_X + 30, midY + 20)
      }
      void startX

      // outcome
      if (done) {
        ctx.textAlign = 'center'
        ctx.font = 'bold 13px monospace'
        ctx.fillStyle = RED
        ctx.fillText('frameshift → gene KNOCKED OUT', W / 2, resY)
        ctx.font = '10px monospace'
        ctx.fillStyle = 'rgba(245,240,232,0.5)'
        ctx.fillText('reading frame scrambled downstream of the scar', W / 2, resY + 20)
      }
    } else {
      ctx.textAlign = 'left'
      ctx.font = '10px monospace'
      ctx.fillStyle = LIME
      ctx.fillText('HDR — a supplied donor template is copied across the break', 16, midY - 40)

      // donor template sliding up into register beneath the break
      const donorY = midY + 14 - approach * 8
      const donorX = LEFT.length ? CUT_X - LEFT.length * CW : CUT_X
      ctx.globalAlpha = 0.4 + 0.6 * approach
      drawSeq(ctx, DONOR, donorX, donorY, i => {
        const editIdx = LEFT.length // corrected base
        return i === editIdx ? LIME : 'rgba(96,165,250,0.8)'
      })
      ctx.globalAlpha = 1
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'left'
      ctx.fillText('donor template →', donorX - 2, donorY + 16)

      // copied, corrected strand appears as HDR completes
      if (join > 0) {
        ctx.globalAlpha = join
        const startX = drawSeq(ctx, LEFT + RIGHT_FIXED, donorX, midY - 6, i =>
          i === LEFT.length ? LIME : 'rgba(245,240,232,0.9)'
        )
        ctx.globalAlpha = 1
        if (settled) {
          ctx.strokeStyle = LIME
          ctx.lineWidth = 1.4
          const ex = startX + LEFT.length * CW + CW / 2
          ctx.strokeRect(ex - CW / 2, midY - 18, CW, 24)
          ctx.fillStyle = LIME
          ctx.font = '9px monospace'
          ctx.textAlign = 'center'
          ctx.fillText('corrected', ex, midY + 16)
        }
      }

      if (done) {
        ctx.textAlign = 'center'
        ctx.font = 'bold 13px monospace'
        ctx.fillStyle = LIME
        ctx.fillText('precise edit → defect CORRECTED', W / 2, resY)
        ctx.font = '10px monospace'
        ctx.fillStyle = 'rgba(245,240,232,0.5)'
        ctx.fillText('reading frame intact, single base fixed from template', W / 2, resY + 20)
      }
    }
  }, [mode, approach, join, settled, done])

  useEffect(() => {
    draw()
  }, [draw, triggered])

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(animRef.current)
      return
    }
    const loop = () => {
      setTick(prev => {
        const next = prev + 1
        if (next >= T_MAX) {
          setRunning(false)
          return T_MAX
        }
        return next
      })
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  const play = () => {
    if (tick >= T_MAX) setTick(0)
    setRunning(true)
  }
  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setTick(0)
  }
  const pickMode = (m: Mode) => {
    setMode(m)
    setRunning(false)
    setTick(0)
  }

  const outcome = mode === 'nhej' ? 'knockout (indel)' : 'precise correction'

  return (
    <div className="animation-block" ref={ref}>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="w-full rounded-lg"
        style={{ background: 'var(--color-canvas)', aspectRatio: `${W} / ${H}` }}
      />
      <div className="mt-3 px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          pathway{' '}
          <span style={{ color: mode === 'nhej' ? BLUE : LIME }}>{mode.toUpperCase()}</span>
        </span>
        <span>
          template{' '}
          <span style={{ color: mode === 'hdr' ? LIME : 'rgba(245,240,232,0.45)' }}>
            {mode === 'hdr' ? 'supplied' : 'none'}
          </span>
        </span>
        <span>
          outcome{' '}
          <span style={{ color: mode === 'nhej' ? RED : LIME }}>{outcome}</span>
        </span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={play}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> Play
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <span className="text-xs text-text-muted">pathway:</span>
        <button
          onClick={() => pickMode('nhej')}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-surface border border-border text-text-secondary"
          style={mode === 'nhej' ? { borderColor: BLUE, color: BLUE } : undefined}
        >
          NHEJ
        </button>
        <button
          onClick={() => pickMode('hdr')}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-surface border border-border text-text-secondary"
          style={mode === 'hdr' ? { borderColor: LIME, color: LIME } : undefined}
        >
          HDR
        </button>
      </div>
    </div>
  )
}
