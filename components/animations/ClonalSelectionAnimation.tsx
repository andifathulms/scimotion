'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 300

const N_CELLS = 30           // lymphocytes drawn from the repertoire
const MATCH_ID = 13          // the one clone whose receptor fits the antigen
const ROUNDS = 10            // division rounds
const DRAW_CAP = 64          // most clone cells we actually render

// Phase timeline, in animation frames.
const T_SCAN_START = 50
const T_SCAN_END = 150
const T_MATCH_END = 195
const FRAMES_PER_ROUND = 42
const T_MAX = T_MATCH_END + FRAMES_PER_ROUND * ROUNDS

const C_MATCH = '#F472B6'    // pink — the selected clone
const C_MEMORY = '#60A5FA'   // blue — memory cells
const C_ANTIGEN = '#F59E0B'  // gold — antigen
const REPERTOIRE = ['#60A5FA', '#A78BFA', '#10B981', '#38BDF8', '#94A3B8']

type Phase = 'repertoire' | 'scanning' | 'matched' | 'expanding' | 'done'

// Deterministic jitter so the repertoire looks organic but never shifts between renders.
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

type Cell = { x: number; y: number; id: number; color: string }

const CELLS: Cell[] = Array.from({ length: N_CELLS }, (_, i) => {
  const col = i % 10
  const row = Math.floor(i / 10)
  return {
    id: i,
    x: 42 + col * 57 + (hash(i) - 0.5) * 14,
    y: 60 + row * 38 + (hash(i + 99) - 0.5) * 10,
    color: i === MATCH_ID ? C_MATCH : REPERTOIRE[i % REPERTOIRE.length],
  }
})

const CLONE_SLOTS = Array.from({ length: DRAW_CAP }, (_, i) => ({
  x: 40 + (i % 16) * 34,
  y: 200 + Math.floor(i / 16) * 23,
}))

// Draw a lymphocyte: a cell body plus three receptor prongs whose angles and tip
// glyphs are set by `id` — that is the receptor's "shape".
function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  id: number,
  alpha: number,
  glow: number
) {
  ctx.save()
  ctx.globalAlpha = alpha

  if (glow > 0) {
    ctx.beginPath()
    ctx.arc(x, y, r + 4 + glow * 5, 0, Math.PI * 2)
    ctx.fillStyle = `${color}22`
    ctx.fill()
  }

  const base = (id * 47) % 360
  for (let k = 0; k < 3; k++) {
    const a = ((base + k * 120) * Math.PI) / 180
    const ix = x + Math.cos(a) * r
    const iy = y + Math.sin(a) * r
    const ox = x + Math.cos(a) * (r + 5)
    const oy = y + Math.sin(a) * (r + 5)
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.4
    ctx.moveTo(ix, iy)
    ctx.lineTo(ox, oy)
    ctx.stroke()

    ctx.beginPath()
    ctx.fillStyle = color
    const glyph = id % 3
    if (glyph === 0) ctx.arc(ox, oy, 2, 0, Math.PI * 2)
    else if (glyph === 1) ctx.rect(ox - 2, oy - 2, 4, 4)
    else { ctx.moveTo(ox, oy - 2.6); ctx.lineTo(ox + 2.4, oy + 2); ctx.lineTo(ox - 2.4, oy + 2); ctx.closePath() }
    ctx.fill()
  }

  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = `${color}33`
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.4
  ctx.stroke()
  ctx.restore()
}

function drawAntigen(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.arc(x, y, 7, 0, Math.PI * 2)
  ctx.fillStyle = `${C_ANTIGEN}44`
  ctx.fill()
  ctx.strokeStyle = C_ANTIGEN
  ctx.lineWidth = 1.5
  ctx.stroke()
  // Epitope studs matching MATCH_ID's receptor glyph (square).
  const base = (MATCH_ID * 47) % 360
  for (let k = 0; k < 3; k++) {
    const a = ((base + 180 + k * 120) * Math.PI) / 180
    const ox = x + Math.cos(a) * 11
    const oy = y + Math.sin(a) * 11
    ctx.beginPath()
    ctx.strokeStyle = C_ANTIGEN
    ctx.moveTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7)
    ctx.lineTo(ox, oy)
    ctx.stroke()
    ctx.beginPath()
    ctx.fillStyle = C_ANTIGEN
    ctx.rect(ox - 2, oy - 2, 4, 4)
    ctx.fill()
  }
  ctx.restore()
}

export function ClonalSelectionAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setTick(T_MAX); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [tick, setTick] = useState(0)

  const phase: Phase =
    tick < T_SCAN_START ? 'repertoire'
    : tick < T_SCAN_END ? 'scanning'
    : tick < T_MATCH_END ? 'matched'
    : tick < T_MAX ? 'expanding'
    : 'done'

  const roundProgress = Math.max(0, (tick - T_MATCH_END) / FRAMES_PER_ROUND)
  const round = Math.min(ROUNDS, Math.floor(roundProgress) + (phase === 'expanding' || phase === 'done' ? 1 : 0))
  const cloneCount = phase === 'repertoire' || phase === 'scanning' ? 0 : Math.pow(2, Math.max(0, round))

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    const selected = phase === 'matched' || phase === 'expanding' || phase === 'done'
    const target = CELLS[MATCH_ID]

    // --- Repertoire panel -------------------------------------------------
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('naive repertoire — every cell a different receptor shape', 14, 22)

    for (const cell of CELLS) {
      const isMatch = cell.id === MATCH_ID
      const alpha = selected ? (isMatch ? 1 : 0.18) : 0.9
      const glow = isMatch && selected ? 0.5 + 0.5 * Math.sin(tick * 0.15) : 0
      drawCell(ctx, cell.x, cell.y, 9, cell.color, cell.id, alpha, glow)
    }

    // Antigen travelling in to meet its one matching receptor.
    const dockX = target.x + 23
    const dockY = target.y
    if (phase === 'scanning') {
      const p = (tick - T_SCAN_START) / (T_SCAN_END - T_SCAN_START)
      drawAntigen(ctx, 22 + (dockX - 22) * p, 166 + (dockY - 166) * p, 1)
    } else if (selected) {
      drawAntigen(ctx, dockX, dockY, 1)
    } else {
      drawAntigen(ctx, 22, 166, 0.8)
    }

    // --- Divider ----------------------------------------------------------
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(245,240,232,0.1)'
    ctx.lineWidth = 1
    ctx.moveTo(14, 178)
    ctx.lineTo(W - 14, 178)
    ctx.stroke()

    // --- Clonal expansion panel ------------------------------------------
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText(
      selected ? `clonal expansion — round ${round}: 2^${round} = ${cloneCount.toLocaleString()} cells` : 'clonal expansion — awaiting a match',
      14,
      194
    )

    if (selected) {
      const drawn = Math.min(DRAW_CAP, cloneCount)
      const frac = roundProgress - Math.floor(roundProgress)
      const prevDrawn = Math.min(DRAW_CAP, Math.max(1, cloneCount / 2))
      for (let i = 0; i < drawn; i++) {
        const slot = CLONE_SLOTS[i]
        const fresh = i >= prevDrawn
        const alpha = phase === 'done' ? 1 : fresh ? Math.min(1, frac * 2.2) : 1
        // A minority of late-round cells differentiate into long-lived memory cells.
        const isMemory = round >= 8 && i % 7 === 3
        drawCell(ctx, slot.x, slot.y, 7, isMemory ? C_MEMORY : C_MATCH, MATCH_ID, alpha, 0)
      }
      if (cloneCount > DRAW_CAP) {
        ctx.fillStyle = 'rgba(245,240,232,0.4)'
        ctx.fillText(`+ ${(cloneCount - DRAW_CAP).toLocaleString()} more`, 40, H - 8)
      }
      if (round >= 8) {
        ctx.fillStyle = C_MEMORY
        ctx.textAlign = 'right'
        ctx.fillText('blue = memory cells', W - 18, H - 8)
        ctx.textAlign = 'left'
      }
    }
  }, [phase, tick, round, cloneCount, roundProgress])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }
    const loop = () => {
      setTick(prev => {
        const next = prev + 1
        if (next >= T_MAX) { setRunning(false); return T_MAX }
        return next
      })
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setTick(0)
  }

  const PHASE_LABEL: Record<Phase, string> = {
    repertoire: 'Diverse repertoire — one receptor per cell',
    scanning: 'Antigen searching for a fit',
    matched: 'Match found — clone selected',
    expanding: 'Clonal expansion — doubling each round',
    done: 'Expansion complete — effectors + memory',
  }

  const badgeColor = phase === 'repertoire' || phase === 'scanning' ? C_ANTIGEN : C_MATCH

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Clonal Selection</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Clonal Selection. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { if (tick >= T_MAX) setTick(0); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-pink text-bg-base text-xs font-medium hover:bg-accent-pink/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={{ color: badgeColor, borderColor: `${badgeColor}30`, background: `${badgeColor}10` }}
        >
          {PHASE_LABEL[phase]}
        </span>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          round <strong className="text-text-primary">{cloneCount > 0 ? round : 0}</strong> ·{' '}
          <strong className="text-accent-pink">{cloneCount.toLocaleString()}</strong> clone{cloneCount === 1 ? '' : 's'}
        </WidgetStatus>
      </div>
    </div>
  )
}
