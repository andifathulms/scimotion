'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Shuffle } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 620
const H = 340
const BG = '#0F0D0A'

const LIME = '#A3E635' // stem cells
const VIOLET = '#A78BFA' // specialized cells
const TEXT = 'rgba(245,240,232,0.85)'
const MUTED = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.08)'

const BASE_POOL = 3 // stem cells the niche starts with
const MAX_ROUND = 8 // divisions before we stop

type Mode = 'asym' | 'sym'

// Niche (left) and tissue (right) geometry.
const DIV_X = 288
const NICHE_X0 = 24
const TISSUE_X0 = 312
const CELL_R = 12

// Grid slot position within a panel, filling left→right, top→bottom.
function slot(x0: number, i: number, cols: number): [number, number] {
  const gx = 34
  const gy = 34
  const c = i % cols
  const rrow = Math.floor(i / cols)
  return [x0 + 22 + c * gx, 88 + rrow * gy]
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

// Deterministic counts as a function of completed rounds.
function poolAt(mode: Mode, round: number) {
  return mode === 'sym' ? BASE_POOL + round : BASE_POOL
}
function specializedAt(mode: Mode, round: number) {
  return mode === 'sym' ? 0 : round
}

export function SelfRenewalAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const [mode, setMode] = useState<Mode>('asym')
  const [round, setRound] = useState(0)
  const [prog, setProg] = useState(0)
  const [running, setRunning] = useState(false)

  const stateRef = useRef({ mode, round, prog, running })
  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      reducedRef.current = reduced
      if (reduced) {
        setRound(MAX_ROUND)
        setProg(0)
        return
      }
      setRunning(true)
    },
  })

  useEffect(() => {
    stateRef.current = { mode, round, prog, running }
  }, [mode, round, prog, running])
  const reducedRef = useRef(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)
    ctx.textBaseline = 'middle'

    // Divider between niche and tissue.
    ctx.strokeStyle = FAINT
    ctx.setLineDash([4, 5])
    ctx.beginPath()
    ctx.moveTo(DIV_X, 30)
    ctx.lineTo(DIV_X, H - 20)
    ctx.stroke()
    ctx.setLineDash([])

    // ---- Titles ------------------------------------------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = LIME
    ctx.fillText('STEM-CELL NICHE (pool)', NICHE_X0, 20)
    ctx.fillStyle = VIOLET
    ctx.fillText('TISSUE (specialized cells)', TISSUE_X0, 20)
    ctx.font = '9px monospace'
    ctx.fillStyle = MUTED
    ctx.fillText(
      mode === 'asym' ? 'asymmetric: 1 stem + 1 specialized' : 'symmetric: 2 stem — pool expands',
      NICHE_X0,
      40,
    )

    const drawCell = (x: number, y: number, color: string, alpha: number, ring: boolean) => {
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.fillStyle = color
      ctx.arc(x, y, CELL_R, 0, Math.PI * 2)
      ctx.fill()
      if (ring) {
        ctx.globalAlpha = alpha
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    const poolDone = poolAt(mode, round)
    const specDone = specializedAt(mode, round)

    // Settled stem cells in the niche.
    for (let i = 0; i < poolDone; i++) {
      const [x, y] = slot(NICHE_X0, i, 5)
      drawCell(x, y, LIME, 1, false)
    }
    // Settled specialized cells in the tissue.
    for (let i = 0; i < specDone; i++) {
      const [x, y] = slot(TISSUE_X0, i, 7)
      drawCell(x, y, VIOLET, 1, false)
    }

    // ---- The in-progress division -----------------------------------------
    if (round < MAX_ROUND && prog > 0) {
      // The dividing stem cell is the last one in the current pool.
      const parentIdx = poolAt(mode, round) - 1
      const [px, py] = slot(NICHE_X0, parentIdx, 5)

      // Highlight the dividing parent.
      drawCell(px, py, LIME, 1, true)

      if (mode === 'asym') {
        // One daughter self-renews (stays put); the other migrates out and
        // turns violet as it specializes.
        const [tx, ty] = slot(TISSUE_X0, specDone, 7)
        const dx = lerp(px, tx, prog)
        const dy = lerp(py, ty, prog)
        // colour shifts lime → violet across the divide
        const color = prog < 0.5 ? LIME : VIOLET
        drawCell(dx, dy, color, Math.max(0.4, prog), false)
      } else {
        // A new stem cell buds into the next free niche slot.
        const [nx, ny] = slot(NICHE_X0, poolDone, 5)
        const dx = lerp(px, nx, prog)
        const dy = lerp(py, ny, prog)
        drawCell(dx, dy, LIME, Math.max(0.4, prog), false)
      }
    }

    // ---- Readout captions --------------------------------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = TEXT
    ctx.fillText(`round ${round} / ${MAX_ROUND}`, NICHE_X0, H - 30)
    ctx.font = '9px monospace'
    ctx.fillStyle = MUTED
    ctx.fillText(
      mode === 'asym'
        ? 'pool held constant while specialized cells stream out →'
        : 'pool doubles up; no specialized cells are made',
      NICHE_X0,
      H - 14,
    )
  }, [mode, round, prog])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!running || !visible) return
    const loop = () => {
      setProg(prev => {
        const next = prev + 0.02
        if (next >= 1) {
          const s = stateRef.current
          if (s.round >= MAX_ROUND - 1) {
            setRound(MAX_ROUND)
            setRunning(false)
            return 0
          }
          setRound(r => r + 1)
          return 0
        }
        return next
      })
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, visible])


  const atEnd = round >= MAX_ROUND

  const toggleMode = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    setMode(m => (m === 'asym' ? 'sym' : 'asym'))
    setRound(0)
    setProg(0)
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    setRound(0)
    setProg(0)
    triggerReset()
  }

  const poolNow = poolAt(mode, round)
  const specNow = specializedAt(mode, round)

  return (
    <div className="animation-block" ref={ref}>
      <div
        className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1"
        aria-live="polite"
      >
        <span>mode: {mode === 'asym' ? 'asymmetric' : 'symmetric'}</span>
        <span>round: {round}</span>
        <span>
          stem pool: <span style={{ color: LIME }}>{poolNow}</span>
        </span>
        <span>
          specialized: <span style={{ color: VIOLET }}>{specNow}</span>
        </span>
      </div>

      <div className="my-3">
        <canvas
          role="img"
          aria-label="Animated diagram: Self renewal. Values are reported below the diagram."
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
              setRound(0)
              setProg(0)
            }
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> {atEnd ? 'Again' : 'Play'}
            </>
          )}
        </button>
        <button
          onClick={toggleMode}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs font-medium hover:text-text-primary transition-colors"
        >
          <Shuffle size={12} /> {mode === 'asym' ? 'Show symmetric' : 'Show asymmetric'}
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs font-medium hover:text-text-primary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          <span style={{ color: LIME }}>stem</span> · <span style={{ color: VIOLET }}>specialized</span>
        </WidgetStatus>
      </div>
    </div>
  )
}
