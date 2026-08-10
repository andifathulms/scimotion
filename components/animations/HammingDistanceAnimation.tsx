'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 320

const BLUE = '#60A5FA'
const GREEN = '#10B981'
const RED = '#F87171'
const GOLD = '#F59E0B'
const DIM = 'rgba(245,240,232,0.42)'
const FAINT = 'rgba(255,245,235,0.12)'

// A 7-bit repetition code: the only two codewords are 0000000 and 1111111.
// Its minimum Hamming distance is d = 7, so it corrects t = floor((d-1)/2) = 3
// errors and detects up to d-1 = 6. Because every 1 in the received word is one
// unit of Hamming distance from 0000000, the "weight" (count of 1s) equals the
// distance to codeword A — which lets us place the received word EXACTLY on a
// 1-D axis with no distortion.
const N = 7
const D_MIN = 7
const T_CORRECT = 3 // floor((7-1)/2)
const AX = 90 // x of codeword A (0000000)
const BX = 510 // x of codeword B (1111111)
const AXIS_Y = 205
const STEP_PX = (BX - AX) / N

export function HammingDistanceAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [errors, setErrors] = useState(0) // number of flipped bits = weight = distance to A
  const [playing, setPlaying] = useState(false)
  const [reduced, setReduced] = useState(false)

  const dispRef = useRef(0) // eased displayed weight
  const errorsRef = useRef(0)
  const playingRef = useRef(false)
  const lastStepRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => { errorsRef.current = errors }, [errors])
  useEffect(() => { playingRef.current = playing }, [playing])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: r => {
      if (r) {
        setReduced(true)
        setErrors(2)
        dispRef.current = 2
      } else {
        setErrors(0)
        dispRef.current = 0
        setPlaying(true)
      }
    },
  })

  const draw = useCallback((weight: number) => {
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

    const xAt = (w: number) => AX + w * STEP_PX
    const decisionX = (AX + BX) / 2

    // ---- title ----
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = BLUE
    ctx.fillText('Code space — nearest-neighbour decoding of a 7-bit repetition code', 16, 24)

    // ---- correction-radius zones (t = 3 units around each codeword) ----
    // Left zone decodes to A (the intended word) = correct; right zone -> B = wrong.
    ctx.fillStyle = 'rgba(16,185,129,0.09)'
    ctx.fillRect(AX - 40, AXIS_Y - 60, decisionX - (AX - 40), 120)
    ctx.fillStyle = 'rgba(248,113,113,0.09)'
    ctx.fillRect(decisionX, AXIS_Y - 60, BX + 40 - decisionX, 120)

    // decision boundary
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(decisionX, AXIS_Y - 62)
    ctx.lineTo(decisionX, AXIS_Y + 62)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('decision', decisionX, AXIS_Y - 68)
    ctx.fillText('boundary', decisionX, AXIS_Y - 58)

    // ---- axis + distance ticks ----
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(AX, AXIS_Y)
    ctx.lineTo(BX, AXIS_Y)
    ctx.stroke()
    for (let k = 0; k <= N; k++) {
      const x = xAt(k)
      ctx.strokeStyle = FAINT
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, AXIS_Y - 5)
      ctx.lineTo(x, AXIS_Y + 5)
      ctx.stroke()
      ctx.fillStyle = DIM
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(String(k), x, AXIS_Y + 18)
    }
    ctx.fillStyle = DIM
    ctx.fillText('Hamming distance from 0000000  →', (AX + BX) / 2, AXIS_Y + 34)

    // ---- codeword anchors ----
    const anchor = (x: number, label: string, color: string) => {
      ctx.beginPath()
      ctx.arc(x, AXIS_Y, 13, 0, Math.PI * 2)
      ctx.fillStyle = `${color}22`
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = color
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(label, x, AXIS_Y - 24)
      ctx.fillText('codeword', x, AXIS_Y - 36)
    }
    anchor(AX, '0000000', GREEN)
    anchor(BX, '1111111', BLUE)

    // ---- correction-radius bracket around A (t = 3) ----
    ctx.strokeStyle = GREEN
    ctx.lineWidth = 1.5
    const rBx = xAt(T_CORRECT)
    ctx.beginPath()
    ctx.moveTo(AX, AXIS_Y + 48)
    ctx.lineTo(rBx, AXIS_Y + 48)
    ctx.stroke()
    ctx.fillStyle = GREEN
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`correction radius t = ${T_CORRECT}`, (AX + rBx) / 2, AXIS_Y + 60)

    // ---- received word ----
    const rounded = Math.round(weight)
    const insideA = rounded <= T_CORRECT
    const isCodeword = rounded === 0 || rounded === N
    const rColor = isCodeword ? (rounded === 0 ? GREEN : BLUE) : insideA ? GOLD : RED
    const rx = xAt(weight)

    // received bit cells
    const cellW = 26
    const totalW = N * cellW
    const startX = (W - totalW) / 2
    const cellY = 60
    for (let i = 0; i < N; i++) {
      const flipped = i < rounded
      const cx = startX + i * cellW
      ctx.beginPath()
      ctx.roundRect(cx, cellY, cellW - 4, 26, 5)
      ctx.fillStyle = flipped ? `${GOLD}22` : 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = flipped ? GOLD : FAINT
      ctx.lineWidth = flipped ? 1.6 : 1
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = flipped ? GOLD : DIM
      ctx.font = 'bold 12px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(flipped ? '1' : '0', cx + (cellW - 4) / 2, cellY + 13)
      ctx.textBaseline = 'alphabetic'
    }
    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('received word (each flipped bit = one error)', W / 2, cellY - 8)

    // connector from cells down to the axis point
    ctx.strokeStyle = `${rColor}66`
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(rx, cellY + 34)
    ctx.lineTo(rx, AXIS_Y - 14)
    ctx.stroke()
    ctx.setLineDash([])

    // received point
    ctx.beginPath()
    ctx.arc(rx, AXIS_Y, 9, 0, Math.PI * 2)
    ctx.fillStyle = rColor
    ctx.fill()
    ctx.strokeStyle = '#0F0D0A'
    ctx.lineWidth = 2
    ctx.stroke()

    // ---- verdict line ----
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    let verdict: string
    let vColor: string
    if (isCodeword && rounded === 0) {
      verdict = 'clean — received word is a valid codeword'
      vColor = GREEN
    } else if (insideA) {
      verdict = `within radius → CORRECTED to 0000000 (${rounded} ≤ t=${T_CORRECT})`
      vColor = GREEN
    } else if (rounded < N) {
      verdict = `too many errors → decodes to WRONG codeword 1111111 (${rounded} > t=${T_CORRECT})`
      vColor = RED
    } else {
      verdict = 'flipped all 7 bits → landed exactly on the other codeword'
      vColor = RED
    }
    ctx.fillStyle = vColor
    ctx.fillText(verdict, 16, H - 16)
  }, [])

  // animation loop
  useEffect(() => {
    if (reduced) {
      draw(2)
      return
    }
    const loop = (t: number) => {
      // auto-advance while playing
      if (playingRef.current) {
        if (lastStepRef.current === 0) lastStepRef.current = t
        if (t - lastStepRef.current > 780) {
          lastStepRef.current = t
          const next = errorsRef.current + 1
          if (next > N) {
            setPlaying(false)
          } else {
            setErrors(next)
          }
        }
      } else {
        lastStepRef.current = 0
      }
      // ease displayed weight toward target
      dispRef.current += (errorsRef.current - dispRef.current) * 0.18
      if (Math.abs(dispRef.current - errorsRef.current) < 0.004) {
        dispRef.current = errorsRef.current
      }
      draw(dispRef.current)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [draw, reduced])

  const reset = () => {
    triggerReset()
    setPlaying(false)
    setErrors(0)
    dispRef.current = 0
    lastStepRef.current = 0
    if (reduced) draw(0)
  }

  const addError = () => {
    setPlaying(false)
    setErrors(e => {
      const next = Math.min(N, e + 1)
      if (reduced) { dispRef.current = next; draw(next) }
      return next
    })
  }

  const distA = errors
  const distB = N - errors

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Distance and correction radius</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Distance and correction radius. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>errors injected: <span style={{ color: BLUE }}>{errors}</span></span>
        <span>d(·, 0000000) = <span className="text-accent-teal">{distA}</span></span>
        <span>d(·, 1111111) = <span className="text-accent-blue">{distB}</span></span>
        <span>min distance d = {D_MIN}</span>
        <span>corrects ≤ {T_CORRECT}, detects ≤ {D_MIN - 1}</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (errorsRef.current >= N) { setErrors(0); dispRef.current = 0 }
            setPlaying(p => !p)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {playing ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={addError}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors"
        >
          <ChevronRight size={12} /> Add error
        </button>
        <WidgetStatus className="text-xs text-text-muted font-mono ml-auto self-center">
          {errors === 0 ? 'valid codeword'
            : errors <= T_CORRECT ? 'inside correction radius → fixed'
            : errors < N ? 'beyond radius → mis-decodes'
            : 'landed on the other codeword'}
        </WidgetStatus>
      </div>
    </div>
  )
}
