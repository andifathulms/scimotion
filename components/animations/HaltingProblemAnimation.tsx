'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Play } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 620
const H = 344
const N = 6

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const GREEN = '#10B981'

const DIM = 'rgba(245,240,232,0.42)'
const FAINT_LINE = 'rgba(255,245,235,0.12)'

// Deterministic behaviour table: does machine i halt on input j?
// A fixed integer expression — no randomness, so the picture is stable.
function halts(i: number, j: number): boolean {
  return (i * i + 3 * i * j + 5 * j + 2) % 7 < 4
}

const STEP_COMPARE = 3
const TOTAL_STEPS = STEP_COMPARE + N + 1 // table, diagonal, build D, N comparisons, verdict

const AUTOPLAY_MS = 1500

export function HaltingProblemAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)

  const diagonal = useMemo(() => Array.from({ length: N }, (_, i) => halts(i, i)), [])
  const contrarian = useMemo(() => diagonal.map(d => !d), [diagonal])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setStep(TOTAL_STEPS - 1); return }
      setStep(0)
      setPlaying(true)
    },
  })

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      setStep(prev => {
        if (prev >= TOTAL_STEPS - 1) { setPlaying(false); return prev }
        return prev + 1
      })
    }, AUTOPLAY_MS)
    return () => window.clearInterval(id)
  }, [playing])

  const compareRow = step >= STEP_COMPARE && step < STEP_COMPARE + N ? step - STEP_COMPARE : -1

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const X0 = 92
    const CW = 42
    const CH = 28
    const Y0 = 62
    const RGAP = 30

    const showDiag = step >= 1
    const showD = step >= 2
    const verdict = step >= STEP_COMPARE + N

    // ---- headings ----
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = BLUE
    ctx.fillText('behaviour table', 16, 24)
    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('rows = every program · columns = every input', 16, 38)

    // column headers
    ctx.font = '9px monospace'
    for (let j = 0; j < N; j++) {
      const cx = X0 + j * CW
      const onDiag = showDiag && j === compareRow
      ctx.fillStyle = onDiag ? GOLD : DIM
      ctx.fillText(`in${j + 1}`, cx + 10, Y0 - 8)
    }

    // rows
    for (let i = 0; i < N; i++) {
      const ry = Y0 + i * RGAP
      const isCompare = i === compareRow
      ctx.font = isCompare ? 'bold 10px monospace' : '10px monospace'
      ctx.fillStyle = isCompare ? GOLD : DIM
      ctx.fillText(`P${i + 1}`, 20, ry + 19)

      if (isCompare) {
        ctx.fillStyle = `${GOLD}12`
        ctx.fillRect(14, ry + 1, X0 + N * CW - 20, CH)
      }

      for (let j = 0; j < N; j++) {
        const cx = X0 + j * CW
        const h = halts(i, j)
        const onDiag = i === j
        const focused = isCompare && onDiag

        ctx.fillStyle = focused
          ? `${GOLD}44`
          : onDiag && showDiag
            ? `${VIOLET}26`
            : 'rgba(255,245,235,0.035)'
        ctx.fillRect(cx, ry + 1, CW - 4, CH)

        ctx.strokeStyle = focused ? GOLD : onDiag && showDiag ? VIOLET : FAINT_LINE
        ctx.lineWidth = 1
        ctx.strokeRect(cx + 0.5, ry + 1.5, CW - 5, CH - 1)

        ctx.font = 'bold 11px monospace'
        ctx.fillStyle = focused
          ? GOLD
          : onDiag && showDiag
            ? VIOLET
            : h
              ? `${GREEN}CC`
              : `${PINK}AA`
        ctx.fillText(h ? 'halt' : 'loop', cx + 6, ry + 20)
      }
    }

    const dY = Y0 + N * RGAP + 14

    // ---- separator ----
    ctx.strokeStyle = FAINT_LINE
    ctx.beginPath()
    ctx.moveTo(14, dY - 8)
    ctx.lineTo(X0 + N * CW - 6, dY - 8)
    ctx.stroke()

    // ---- contrarian row ----
    if (showD) {
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = PINK
      ctx.fillText('D', 20, dY + 19)

      for (let j = 0; j < N; j++) {
        const cx = X0 + j * CW
        const focused = j === compareRow
        ctx.fillStyle = focused ? `${PINK}44` : `${PINK}18`
        ctx.fillRect(cx, dY + 1, CW - 4, CH)
        ctx.strokeStyle = PINK
        ctx.lineWidth = focused ? 1.5 : 1
        ctx.strokeRect(cx + 0.5, dY + 1.5, CW - 5, CH - 1)
        ctx.font = 'bold 11px monospace'
        ctx.fillStyle = PINK
        ctx.fillText(contrarian[j] ? 'halt' : 'loop', cx + 6, dY + 20)
      }
    }

    // ---- narration panel ----
    const NX = 392
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.lineWidth = 1
    ctx.strokeRect(NX - 8, 10, W - NX - 2, H - 22)

    const lines: string[] = []
    let title = ''
    let titleColor = BLUE

    if (step === 0) {
      title = 'the table'
      titleColor = BLUE
      lines.push(
        'Suppose HALTS exists — a program',
        'that decides, for any program and',
        'input, whether it halts.',
        '',
        'Then every cell of this infinite',
        'table has a known entry, and every',
        'program appears as some row.',
      )
    } else if (step === 1) {
      title = 'the diagonal'
      titleColor = VIOLET
      lines.push(
        'Read down the diagonal: cell (i, i)',
        'is what program Pi does when fed',
        'its own description as input.',
        '',
        'That is a legal question, and HALTS',
        'answers it for every i.',
      )
    } else if (step === 2) {
      title = 'build D'
      titleColor = PINK
      lines.push(
        'Now build D. D asks HALTS what Pj',
        'does on input j — and then does',
        'the opposite:',
        '',
        '  if HALTS says "halt" → loop forever',
        '  if HALTS says "loop" → halt at once',
        '',
        'D is an ordinary program. If HALTS',
        'exists, D can be written.',
      )
    } else if (compareRow >= 0) {
      const k = compareRow
      title = `is D the same as P${k + 1}?`
      titleColor = GOLD
      lines.push(
        `Compare column ${k + 1}, the diagonal cell.`,
        '',
        `  P${k + 1} on input ${k + 1}:  ${diagonal[k] ? 'halt' : 'loop'}`,
        `  D  on input ${k + 1}:  ${contrarian[k] ? 'halt' : 'loop'}`,
        '',
        `They disagree, so D ≠ P${k + 1}.`,
        '',
        'D was built to differ from row k',
        'exactly at column k — so this will',
        'happen for every row, forever.',
      )
    } else if (verdict) {
      title = 'contradiction'
      titleColor = PINK
      lines.push(
        'D differs from every row of the',
        'table, so D is not in the table.',
        '',
        'But the table lists every program,',
        'and D is a program. Contradiction.',
        '',
        'Nothing in the argument was about',
        'speed or memory. The only thing we',
        'assumed was that HALTS exists.',
        '',
        'So HALTS does not exist.',
      )
    }

    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = titleColor
    ctx.fillText(title, NX, 28)

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.62)'
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], NX, 48 + i * 15)
    }

    // running tally of eliminated rows
    if (compareRow >= 0 || verdict) {
      const done = verdict ? N : compareRow + 1
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = GOLD
      ctx.fillText(`rows ruled out: ${done} / ${N} shown  (…and all the rest)`, NX, H - 22)
    }
  }, [step, compareRow, diagonal, contrarian])

  useEffect(() => { draw() }, [draw])

  const reset = () => {
    triggerReset()
    setPlaying(false)
    setStep(0)
  }

  const stepLabels = ['table', 'diagonal', 'build D', ...Array.from({ length: N }, (_, i) => `vs P${i + 1}`), 'verdict']

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The diagonal argument</span>
        <button onClick={reset} className="text-xs text-text-muted hover:text-text-secondary transition-colors">Reset</button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: The diagonal argument. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <button
            onClick={() => { setPlaying(false); setStep(s => Math.max(0, s - 1)) }}
            disabled={step === 0}
            className="rounded border border-white/10 px-2 py-1 hover:text-text-secondary disabled:opacity-40 transition-colors"
          >
            ← prev
          </button>
          <button
            onClick={() => { setPlaying(false); setStep(s => Math.min(TOTAL_STEPS - 1, s + 1)) }}
            disabled={step >= TOTAL_STEPS - 1}
            className="rounded border border-white/10 px-2 py-1 hover:text-text-secondary disabled:opacity-40 transition-colors"
          >
            next →
          </button>
          <button
            onClick={() => setPlaying(p => !p)}
            className="rounded border border-white/10 px-2 py-1 hover:text-text-secondary transition-colors"
          >
            {playing ? 'pause' : 'play'}
          </button>
          <span className="text-text-secondary font-medium">
            step {step + 1}/{TOTAL_STEPS} · {stepLabels[step]}
          </span>
        </div>
        <span className="ml-auto text-xs text-text-muted">
          D disagrees with row <strong className="text-text-secondary">k</strong> at column <strong className="text-text-secondary">k</strong>
        </span>
      </div>
    </div>
  )
}
