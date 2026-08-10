'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 340
const BG = '#0F0D0A'

const PINK = '#F472B6' // field accent
const LIME = '#A3E635'
const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const RED = '#F87171'
const TEXT = 'rgba(245,240,232,0.85)'
const DIM = 'rgba(245,240,232,0.45)'
const FAINT = 'rgba(255,245,235,0.10)'

const TWO_PI = Math.PI * 2

// Ordered stages the marker moves through. Checkpoints sit BEFORE the phase
// they guard: the cell must pass the gate to enter.
type Stage =
  | 'G1'
  | 'G1/S checkpoint'
  | 'S'
  | 'G2'
  | 'G2/M checkpoint'
  | 'M'
  | 'divided'
  | 'repair'
  | 'apoptosis'

const RING: { key: Stage; label: string; frac: number; color: string }[] = [
  { key: 'G1', label: 'G1', frac: 0.06, color: LIME },
  { key: 'G1/S checkpoint', label: 'G1/S ✋', frac: 0.28, color: PINK },
  { key: 'S', label: 'S', frac: 0.45, color: GOLD },
  { key: 'G2', label: 'G2', frac: 0.62, color: BLUE },
  { key: 'G2/M checkpoint', label: 'G2/M ✋', frac: 0.78, color: PINK },
  { key: 'M', label: 'M', frac: 0.93, color: '#A78BFA' },
]

const RING_CX = 168
const RING_CY = 176
const RING_R = 100

function angleAt(frac: number): number {
  return -Math.PI / 2 + frac * TWO_PI
}

export function CellCycleControlAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  // Mutation toggles.
  const [stuckAccel, setStuckAccel] = useState(false) // oncogene
  const [brokenBrakes, setBrokenBrakes] = useState(false) // lost tumour suppressor

  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState<Stage>('G1')
  const [prog, setProg] = useState(0) // 0..1 within the current segment
  const [divisions, setDivisions] = useState(0)

  const stateRef = useRef({ stuckAccel, brokenBrakes, running, stage, prog, divisions })
  useEffect(() => {
    stateRef.current = { stuckAccel, brokenBrakes, running, stage, prog, divisions }
  }, [stuckAccel, brokenBrakes, running, stage, prog, divisions])

  // Deterministic "damage" flag: every third trip around the cycle the cell
  // carries DNA damage, so checkpoints have real work to do. Counter, not RNG.
  const cyclesRef = useRef(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)
    ctx.textBaseline = 'middle'

    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = PINK
    ctx.fillText('CELL-CYCLE CONTROL — checkpoints are the brakes', 14, 18)

    // ---- The cycle ring ----------------------------------------------------
    ctx.lineWidth = 11
    ctx.lineCap = 'butt'
    const bounds: [number, number, string][] = [
      [0.0, 0.2, `${LIME}bb`],
      [0.2, 0.36, `${PINK}bb`],
      [0.36, 0.54, `${GOLD}bb`],
      [0.54, 0.7, `${BLUE}bb`],
      [0.7, 0.86, `${PINK}bb`],
      [0.86, 1.0, '#A78BFAbb'],
    ]
    for (const [f0, f1, col] of bounds) {
      ctx.beginPath()
      ctx.strokeStyle = col
      ctx.arc(RING_CX, RING_CY, RING_R, angleAt(f0), angleAt(f1))
      ctx.stroke()
    }

    // Ring labels + checkpoint gate glyphs.
    ctx.font = '10px monospace'
    for (const seg of RING) {
      const ang = angleAt(seg.frac)
      const lx = RING_CX + Math.cos(ang) * (RING_R + 22)
      const ly = RING_CY + Math.sin(ang) * (RING_R + 22)
      ctx.fillStyle = seg.color
      ctx.textAlign = 'center'
      ctx.fillText(seg.label, lx, ly)
    }

    // Draw gate bars across the ring at each checkpoint.
    for (const seg of RING) {
      if (!seg.key.includes('checkpoint')) continue
      const ang = angleAt(seg.frac)
      const ix = RING_CX + Math.cos(ang) * (RING_R - 9)
      const iy = RING_CY + Math.sin(ang) * (RING_R - 9)
      const ox = RING_CX + Math.cos(ang) * (RING_R + 9)
      const oy = RING_CY + Math.sin(ang) * (RING_R + 9)
      ctx.strokeStyle = brokenBrakes ? `${RED}66` : PINK
      ctx.lineWidth = brokenBrakes ? 2 : 3.5
      if (brokenBrakes) ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(ix, iy)
      ctx.lineTo(ox, oy)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Centre label.
    ctx.textAlign = 'center'
    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    ctx.fillText('one trip =', RING_CX, RING_CY - 10)
    ctx.fillText('one division', RING_CX, RING_CY + 4)

    // Marker position.
    let markFrac: number
    const idx = RING.findIndex(r => r.key === stage)
    if (idx >= 0) {
      const next = RING[(idx + 1) % RING.length]
      const cur = RING[idx].frac
      const nxt = idx === RING.length - 1 ? 1.0 : next.frac
      markFrac = cur + (nxt - cur) * prog
    } else {
      // divided / repair / apoptosis — park at M.
      markFrac = 0.93
    }
    const mAng = angleAt(markFrac)
    const mx = RING_CX + Math.cos(mAng) * RING_R
    const my = RING_CY + Math.sin(mAng) * RING_R
    ctx.beginPath()
    ctx.fillStyle = stage === 'apoptosis' ? RED : '#FFFFFF'
    ctx.arc(mx, my, 6.5, 0, TWO_PI)
    ctx.fill()

    // ================= RIGHT: accelerator / brakes / cell ==================
    const panelX = 340
    const dividedCell = stage === 'divided'

    // Accelerator gene.
    ctx.textAlign = 'left'
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = stuckAccel ? RED : LIME
    ctx.fillText('ACCELERATOR', panelX, 52)
    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText(stuckAccel ? 'oncogene · STUCK ON' : 'proto-oncogene · "go" signal', panelX, 68)
    // pedal bar
    ctx.fillStyle = FAINT
    ctx.fillRect(panelX, 76, 230, 8)
    ctx.fillStyle = stuckAccel ? RED : LIME
    ctx.fillRect(panelX, 76, stuckAccel ? 230 : 92, 8)

    // Brakes gene.
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = brokenBrakes ? RED : BLUE
    ctx.fillText('BRAKES', panelX, 104)
    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText(
      brokenBrakes ? 'tumour-suppressor · DISABLED' : 'TP53 · checkpoint + apoptosis',
      panelX,
      120,
    )
    ctx.fillStyle = FAINT
    ctx.fillRect(panelX, 128, 230, 8)
    ctx.fillStyle = brokenBrakes ? `${RED}44` : BLUE
    ctx.fillRect(panelX, 128, brokenBrakes ? 24 : 210, 8)

    // Cell glyph + status.
    const ccx = panelX + 60
    const ccy = 220
    if (dividedCell) {
      for (const sgn of [-1, 1]) {
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(245,240,232,0.55)'
        ctx.lineWidth = 2
        ctx.arc(ccx + sgn * 34, ccy, 26, 0, TWO_PI)
        ctx.stroke()
      }
    } else {
      ctx.beginPath()
      ctx.strokeStyle = stage === 'apoptosis' ? RED : 'rgba(245,240,232,0.55)'
      ctx.lineWidth = 2
      if (stage === 'apoptosis') ctx.setLineDash([4, 4])
      ctx.arc(ccx, ccy, 34, 0, TWO_PI)
      ctx.stroke()
      ctx.setLineDash([])
      // nucleus
      ctx.beginPath()
      ctx.fillStyle = stage === 'apoptosis' ? `${RED}33` : `${PINK}22`
      ctx.arc(ccx, ccy, 18, 0, TWO_PI)
      ctx.fill()
    }

    // Status line.
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    let statusText = ''
    let statusColor = TEXT
    if (stage === 'apoptosis') {
      statusText = 'apoptosis — damaged cell self-destructs ✓'
      statusColor = RED
    } else if (stage === 'repair') {
      statusText = 'paused at checkpoint — DNA repaired ✓'
      statusColor = PINK
    } else if (stage === 'divided') {
      statusText =
        stuckAccel && brokenBrakes
          ? 'divided — brakes gone, damage passed on ⚠'
          : 'divided — two healthy daughters ✓'
      statusColor = stuckAccel && brokenBrakes ? RED : LIME
    } else {
      statusText = `phase: ${stage}`
      statusColor = TEXT
    }
    ctx.fillStyle = statusColor
    ctx.fillText(statusText, panelX + 6, ccy + 62)

    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText(`divisions so far: ${divisions}`, panelX + 6, ccy + 80)

    // Bottom caption.
    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    ctx.fillStyle = DIM
    const cap =
      stuckAccel && brokenBrakes
        ? 'Both controls lost: damaged cells keep dividing — uncontrolled.'
        : stuckAccel
          ? 'Accelerator stuck, but intact brakes still catch damaged cells.'
          : brokenBrakes
            ? 'Brakes gone, but without a "go" signal division stays paced.'
            : 'Controls intact: damage is repaired or sent to apoptosis.'
    ctx.fillText(cap, 14, H - 14)
  }, [stage, prog, stuckAccel, brokenBrakes, divisions])

  useEffect(() => {
    draw()
  }, [draw])

  // Advance one small step of the cycle. Enforces checkpoint logic.
  const stepCycle = useCallback(() => {
    const st = stateRef.current
    const idx = RING.findIndex(r => r.key === st.stage)

    // Handle terminal/interrupt stages first.
    if (st.stage === 'apoptosis') {
      // stay dead until reset; stop the loop
      setRunning(false)
      return
    }
    if (st.stage === 'repair') {
      // resume into S phase after a repair pause
      setStage('S')
      setProg(0)
      return
    }
    if (st.stage === 'divided') {
      // begin a new cycle
      cyclesRef.current += 1
      setStage('G1')
      setProg(0)
      return
    }

    // Are we sitting on a checkpoint segment about to be evaluated?
    const cur = RING[idx]
    const isCheckpoint = cur.key.includes('checkpoint')
    // Deterministic damage: every 3rd cycle carries DNA damage.
    const hasDamage = cyclesRef.current % 3 === 2

    // At the end of a checkpoint segment, decide.
    if (isCheckpoint && st.prog >= 1) {
      if (hasDamage && !st.brokenBrakes) {
        // Intact brakes catch damage.
        if (cur.key === 'G1/S checkpoint') {
          // repairable -> pause then continue
          setStage('repair')
          setProg(0)
          return
        }
        // G2/M with severe damage -> apoptosis
        setStage('apoptosis')
        setProg(0)
        return
      }
      // pass the gate
      setStage(RING[idx + 1].key)
      setProg(0)
      return
    }

    // End of M -> divided.
    if (cur.key === 'M' && st.prog >= 1) {
      setDivisions(d => d + 1)
      setStage('divided')
      setProg(0)
      return
    }

    // Otherwise advance within the segment. Stuck accelerator speeds it up.
    const speed = st.stuckAccel ? 0.05 : 0.03
    setProg(p => {
      const np = p + speed
      if (np >= 1) {
        // move to next non-terminal segment unless this is a checkpoint or M
        if (isCheckpoint || cur.key === 'M') return 1
        setStage(RING[idx + 1].key)
        return 0
      }
      return np
    })
  }, [])

  useEffect(() => {
    if (!running) return
    let frame = 0
    const loop = () => {
      frame += 1
      // throttle: step roughly every 2 rAF frames for a readable pace
      if (frame % 2 === 0) stepCycle()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, stepCycle])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Static final frame: a single completed division with controls intact.
        cyclesRef.current = 0
        setStage('divided')
        setProg(0)
        setDivisions(1)
        return
      }
      setRunning(true)
    },
  })

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    cyclesRef.current = 0
    setStage('G1')
    setProg(0)
    setDivisions(0)
    triggerReset()
  }

  const uncontrolled = stuckAccel && brokenBrakes

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Cell-Cycle Control & Checkpoints
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Cell-Cycle Control & Checkpoints. Values are reported below the diagram." ref={canvasRef} className="w-full rounded-lg" style={{ background: BG }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          state: <span style={{ color: stage === 'apoptosis' ? RED : TEXT }}>{stage}</span>
        </span>
        <span>divisions: {divisions}</span>
        <span>
          mutations:{' '}
          <span style={{ color: uncontrolled ? RED : DIM }}>
            {[stuckAccel && 'oncogene', brokenBrakes && 'lost-suppressor']
              .filter(Boolean)
              .join(' + ') || 'none'}
          </span>
        </span>
        <span style={{ color: uncontrolled ? RED : '#A3E635' }}>
          {uncontrolled ? '⚠ uncontrolled division' : 'controlled'}
        </span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => setStuckAccel(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium transition-colors"
          style={stuckAccel ? { color: RED, borderColor: RED } : { color: DIM }}
        >
          {stuckAccel ? '✓ ' : ''}Stuck accelerator (oncogene)
        </button>
        <button
          onClick={() => setBrokenBrakes(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium transition-colors"
          style={brokenBrakes ? { color: RED, borderColor: RED } : { color: DIM }}
        >
          {brokenBrakes ? '✓ ' : ''}Broken brakes (lost suppressor)
        </button>
        <WidgetStatus className="ml-auto text-xs" style={{ color: PINK }}>
          checkpoints ✋ = the brakes
        </WidgetStatus>
      </div>
    </div>
  )
}
