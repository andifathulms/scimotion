'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Play } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 620
const H = 300
const RUN_MS = 4200

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const GREEN = '#10B981'

const DIM = 'rgba(245,240,232,0.45)'

const BUDGETS = [100, 1_000, 10_000, 100_000, 1_000_000]

const A_HALT_STEP = 12

const CODE_A = [
  'sum = 0',
  'for i in 1..12:',
  '  sum = sum + i',
  'print(sum)',
]
const CODE_B = [
  'x = 0',
  'while true:',
  '  x = x + 1',
  '# no exit',
]
const CODE_C = [
  'n = 1',
  'while true:',
  '  if collatz(n)',
  '     never hits 1:',
  '        stop',
  '  n = n + 1',
]

function fmt(x: number): string {
  return Math.round(x).toLocaleString('en-US')
}

// Steps for one Collatz trajectory n -> ... -> 1.
function collatzSteps(n: number): number {
  let v = n
  let s = 0
  while (v !== 1 && s < 2000) {
    v = v % 2 === 0 ? v / 2 : 3 * v + 1
    s++
  }
  return s + 1
}

// Value reached after `r` steps of the trajectory starting at n.
function collatzAt(n: number, r: number): number {
  let v = n
  for (let s = 0; s < r && v !== 1; s++) v = v % 2 === 0 ? v / 2 : 3 * v + 1
  return v
}

export function TerminationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [budgetIdx, setBudgetIdx] = useState(1)
  const [used, setUsed] = useState(0)
  const [playing, setPlaying] = useState(false)

  const budget = BUDGETS[budgetIdx]

  // Cumulative cost of checking n = 1, 2, 3, ... up to the budget.
  const cum = useMemo(() => {
    const out: number[] = []
    let total = 0
    for (let n = 1; total <= budget && n < 200_000; n++) {
      total += collatzSteps(n)
      out.push(total)
    }
    return out
  }, [budget])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setUsed(budget); return }
      setUsed(0)
      setPlaying(true)
    },
  })

  useEffect(() => {
    setUsed(0)
    setPlaying(false)
  }, [budgetIdx])

  useEffect(() => {
    if (!playing) return
    const start = performance.now()
    let raf = 0
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / RUN_MS)
      setUsed(Math.round(t * budget))
      if (t >= 1) { setPlaying(false); return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, budget])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // where the Collatz search has got to
    let done = 0
    while (done < cum.length && cum[done] <= used) done++
    const curN = done + 1
    const into = used - (done > 0 ? cum[done - 1] : 0)
    const curV = collatzAt(curN, into)

    const aSteps = Math.min(used, A_HALT_STEP)
    const aDone = used >= A_HALT_STEP

    const panels = [
      {
        x: 14,
        title: 'program A',
        accent: BLUE,
        code: CODE_A,
        state: [`i = ${Math.min(12, aSteps)}`, `steps used: ${fmt(aSteps)}`],
        verdict: 'HALTS',
        vColor: GREEN,
        why: 'bounded loop:',
        why2: 'counter provably',
        why3: 'reaches its limit',
        frac: aDone ? 1 : aSteps / A_HALT_STEP,
        barColor: GREEN,
      },
      {
        x: 216,
        title: 'program B',
        accent: VIOLET,
        code: CODE_B,
        state: [`x = ${fmt(used)}`, `steps used: ${fmt(used)}`],
        verdict: 'LOOPS',
        vColor: PINK,
        why: 'no reachable exit:',
        why2: 'the loop condition',
        why3: 'is literally true',
        frac: budget === 0 ? 0 : used / budget,
        barColor: PINK,
      },
      {
        x: 418,
        title: 'program C',
        accent: GOLD,
        code: CODE_C,
        state: [`n = ${fmt(curN)}, value ${fmt(curV)}`, `steps used: ${fmt(used)}`],
        verdict: 'UNKNOWN',
        vColor: GOLD,
        why: 'halts iff some n',
        why2: 'escapes Collatz —',
        why3: 'nobody knows',
        frac: budget === 0 ? 0 : used / budget,
        barColor: GOLD,
      },
    ]

    for (const p of panels) {
      const PW = 188
      ctx.strokeStyle = 'rgba(255,245,235,0.10)'
      ctx.lineWidth = 1
      ctx.strokeRect(p.x - 6, 10, PW + 12, H - 22)

      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = p.accent
      ctx.fillText(p.title, p.x, 30)

      // code
      ctx.font = '10px monospace'
      for (let i = 0; i < p.code.length; i++) {
        ctx.fillStyle = 'rgba(245,240,232,0.55)'
        ctx.fillText(p.code[i], p.x, 50 + i * 14)
      }

      const codeBottom = 50 + p.code.length * 14 + 8

      ctx.strokeStyle = 'rgba(255,245,235,0.08)'
      ctx.beginPath()
      ctx.moveTo(p.x, codeBottom)
      ctx.lineTo(p.x + PW, codeBottom)
      ctx.stroke()

      // live trace
      ctx.font = '10px monospace'
      ctx.fillStyle = DIM
      for (let i = 0; i < p.state.length; i++) {
        ctx.fillText(p.state[i], p.x, codeBottom + 18 + i * 14)
      }

      // budget bar
      const barY = 214
      ctx.fillStyle = 'rgba(255,245,235,0.06)'
      ctx.fillRect(p.x, barY, PW, 12)
      ctx.fillStyle = p.barColor
      ctx.fillRect(p.x, barY, Math.max(1, PW * Math.min(1, p.frac)), 12)
      ctx.strokeStyle = 'rgba(255,245,235,0.14)'
      ctx.strokeRect(p.x + 0.5, barY + 0.5, PW - 1, 11)

      ctx.font = '9px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.fillText('budget consumed', p.x, barY + 24)

      // verdict badge
      const vy = 250
      ctx.fillStyle = `${p.vColor}1F`
      ctx.fillRect(p.x, vy, PW, 22)
      ctx.strokeStyle = `${p.vColor}66`
      ctx.strokeRect(p.x + 0.5, vy + 0.5, PW - 1, 21)
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = p.vColor
      ctx.fillText(p.verdict, p.x + 8, vy + 16)

      ctx.font = '9px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.42)'
      ctx.fillText(p.why, p.x, vy + 36)
      ctx.fillText(p.why2, p.x, vy + 46)
      ctx.fillText(p.why3, p.x, vy + 56)
    }
  }, [used, budget, cum])

  useEffect(() => { draw() }, [draw])

  const restart = () => {
    triggerReset()
    setUsed(0)
    setPlaying(true)
  }

  let done = 0
  while (done < cum.length && cum[done] <= used) done++

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · A termination checker with three answers</span>
        <button onClick={restart} className="text-xs text-text-muted hover:text-text-secondary transition-colors">Reset</button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg px-2.5 py-1.5 border" style={{ borderColor: `${GREEN}33`, background: `${GREEN}0F` }}>
          <div className="font-medium" style={{ color: GREEN }}>A · decided in {A_HALT_STEP} steps</div>
          <div className="text-text-muted">a ranking function exists</div>
        </div>
        <div className="rounded-lg px-2.5 py-1.5 border" style={{ borderColor: `${PINK}33`, background: `${PINK}0F` }}>
          <div className="font-medium" style={{ color: PINK }}>B · decided immediately</div>
          <div className="text-text-muted">no exit edge in the CFG</div>
        </div>
        <div className="rounded-lg px-2.5 py-1.5 border" style={{ borderColor: `${GOLD}33`, background: `${GOLD}0F` }}>
          <div className="font-medium" style={{ color: GOLD }}>C · still unknown</div>
          <div className="text-text-muted">{fmt(done)} values of n cleared</div>
        </div>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>step budget:</span>
          <input
            type="range" min={0} max={BUDGETS.length - 1} value={budgetIdx}
            onChange={e => setBudgetIdx(+e.target.value)}
            className="w-40 accent-accent-blue"
          />
          <span className="text-text-secondary font-medium">{fmt(budget)}</span>
        </div>
        <button
          onClick={() => setPlaying(true)}
          className="rounded border border-white/10 px-2 py-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          run
        </button>
        <span className="ml-auto text-xs text-text-muted">
          raise the budget as far as it goes — <strong className="text-text-secondary">C never resolves</strong>
        </span>
      </div>
    </div>
  )
}
