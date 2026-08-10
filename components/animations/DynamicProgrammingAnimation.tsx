'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const A = 'KITTEN'
const B = 'SITTING'
const M = A.length // rows (7 incl. base)
const N = B.length // cols (8 incl. base)

const CELL = 44
const OX = 62
const OY = 46
const W = OX + (N + 1) * CELL + 12
const H = OY + (M + 1) * CELL + 14

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const GREEN = '#10B981'

type Fill = { kind: 'fill'; i: number; j: number; val: number; match: boolean }
type Back = { kind: 'back'; i: number; j: number }
type Step = Fill | Back

type Model = { table: number[][]; steps: Step[] }

function buildModel(): Model {
  const table: number[][] = Array.from({ length: M + 1 }, () => new Array<number>(N + 1).fill(0))
  for (let i = 0; i <= M; i++) table[i][0] = i
  for (let j = 0; j <= N; j++) table[0][j] = j

  const steps: Step[] = []
  for (let i = 1; i <= M; i++) {
    for (let j = 1; j <= N; j++) {
      const match = A[i - 1] === B[j - 1]
      const val = match
        ? table[i - 1][j - 1]
        : 1 + Math.min(table[i - 1][j - 1], table[i - 1][j], table[i][j - 1])
      table[i][j] = val
      steps.push({ kind: 'fill', i, j, val, match })
    }
  }

  // backtrack from the bottom-right corner to the origin
  let i = M
  let j = N
  const path: Back[] = [{ kind: 'back', i, j }]
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && A[i - 1] === B[j - 1] && table[i][j] === table[i - 1][j - 1]) { i--; j-- }
    else if (i > 0 && j > 0 && table[i][j] === table[i - 1][j - 1] + 1) { i--; j-- }
    else if (i > 0 && table[i][j] === table[i - 1][j] + 1) i--
    else j--
    path.push({ kind: 'back', i, j })
  }
  return { table, steps: [...steps, ...path] }
}

export function DynamicProgrammingAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setIdx(totalRef.current - 1); return }
      setIdx(-1)
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { table, steps } = useMemo(() => buildModel(), [])
  const totalRef = useRef(steps.length)
  const [idx, setIdx] = useState(-1)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(220)

  const fillCount = useMemo(() => steps.filter(s => s.kind === 'fill').length, [steps])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const cur = idx >= 0 && idx < steps.length ? steps[idx] : null
    const filled = Math.min(idx + 1, fillCount)

    // cells revealed on the backtrack path so far
    const onPath = new Set<string>()
    if (idx >= fillCount) {
      for (let k = fillCount; k <= idx; k++) {
        const s = steps[k]
        if (s.kind === 'back') onPath.add(`${s.i},${s.j}`)
      }
    }

    // column headers (word B) and row headers (word A)
    ctx.font = 'bold 13px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let j = 1; j <= N; j++) {
      const active = cur?.kind === 'fill' && cur.j === j
      ctx.fillStyle = active ? GOLD : 'rgba(245,240,232,0.55)'
      ctx.fillText(B[j - 1], OX + (j + 0.5) * CELL, OY - 16)
    }
    for (let i = 1; i <= M; i++) {
      const active = cur?.kind === 'fill' && cur.i === i
      ctx.fillStyle = active ? GOLD : 'rgba(245,240,232,0.55)'
      ctx.fillText(A[i - 1], OX - 18, OY + (i + 0.5) * CELL)
    }
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.textAlign = 'left'
    ctx.fillText('SITTING →', OX + CELL, OY - 32)
    ctx.textAlign = 'center'

    // grid
    for (let i = 0; i <= M; i++) {
      for (let j = 0; j <= N; j++) {
        const x = OX + j * CELL
        const y = OY + i * CELL
        const base = i === 0 || j === 0
        const flatIdx = (i - 1) * N + (j - 1)
        const isFilled = base || flatIdx < filled
        const isCurrent = cur?.kind === 'fill' && cur.i === i && cur.j === j
        const isDep =
          cur?.kind === 'fill' &&
          ((i === cur.i - 1 && j === cur.j - 1) || (i === cur.i - 1 && j === cur.j) || (i === cur.i && j === cur.j - 1))
        const isPath = onPath.has(`${i},${j}`)

        let fill = 'rgba(255,255,255,0.02)'
        let stroke = 'rgba(255,245,235,0.10)'
        let text = 'rgba(245,240,232,0.25)'

        if (isFilled) { fill = 'rgba(255,255,255,0.04)'; stroke = 'rgba(255,245,235,0.14)'; text = 'rgba(245,240,232,0.7)' }
        if (base && isFilled) { text = 'rgba(245,240,232,0.4)' }
        if (isDep) { fill = `${VIOLET}22`; stroke = `${VIOLET}88`; text = VIOLET }
        if (isPath) { fill = `${GREEN}22`; stroke = GREEN; text = GREEN }
        if (isCurrent) {
          fill = cur.match ? `${BLUE}33` : `${GOLD}33`
          stroke = cur.match ? BLUE : GOLD
          text = cur.match ? BLUE : GOLD
        }

        ctx.fillStyle = fill
        ctx.strokeStyle = stroke
        ctx.lineWidth = isCurrent || isPath ? 1.8 : 1
        ctx.beginPath()
        ctx.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 6)
        ctx.fill()
        ctx.stroke()

        if (isFilled) {
          ctx.fillStyle = text
          ctx.font = isCurrent ? 'bold 15px monospace' : '13px monospace'
          ctx.fillText(String(table[i][j]), x + CELL / 2, y + CELL / 2)
        }
      }
    }

    // arrows from the three dependencies into the current cell
    if (cur?.kind === 'fill') {
      const cx = OX + (cur.j + 0.5) * CELL
      const cy = OY + (cur.i + 0.5) * CELL
      const deps: [number, number][] = [
        [cur.i - 1, cur.j - 1],
        [cur.i - 1, cur.j],
        [cur.i, cur.j - 1],
      ]
      ctx.strokeStyle = `${VIOLET}99`
      ctx.lineWidth = 1.2
      ctx.setLineDash([3, 3])
      for (const [di, dj] of deps) {
        const dx = OX + (dj + 0.5) * CELL
        const dy = OY + (di + 0.5) * CELL
        ctx.beginPath()
        ctx.moveTo(dx, dy)
        ctx.lineTo(cx, cy)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }

    // status line
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    if (cur?.kind === 'fill') {
      ctx.fillStyle = cur.match ? BLUE : GOLD
      const txt = cur.match
        ? `'${A[cur.i - 1]}' = '${B[cur.j - 1]}' → free: copy the diagonal = ${cur.val}`
        : `'${A[cur.i - 1]}' ≠ '${B[cur.j - 1]}' → 1 + min(diag, up, left) = ${cur.val}`
      ctx.fillText(txt, OX, H - 6)
    } else if (idx >= fillCount) {
      ctx.fillStyle = GREEN
      ctx.fillText(`Backtracking the cheapest edit path — distance = ${table[M][N]}`, OX, H - 6)
    } else {
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.fillText('Press Play to fill the table cell by cell', OX, H - 6)
    }
  }, [idx, steps, table, fillCount])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setIdx(i => {
        if (i >= steps.length - 1) { setRunning(false); return i }
        return i + 1
      })
    }, speed)
    return () => clearInterval(id)
  }, [running, speed, steps.length])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setIdx(-1)
  }

  const stepOnce = () => {
    setRunning(false)
    setIdx(i => Math.min(i + 1, steps.length - 1))
  }

  const cellsDone = Math.max(0, Math.min(idx + 1, fillCount))

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Edit distance DP table</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Edit distance DP table. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { if (idx >= steps.length - 1) { setIdx(-1) } setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={stepOnce}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors"
        >
          <ChevronRight size={12} /> Step
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Speed:</span>
          <input
            type="range" min={60} max={600} step={20} value={660 - speed}
            onChange={e => setSpeed(660 - +e.target.value)}
            className="w-20 accent-accent-gold"
          />
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          Cells filled <strong className="text-accent-gold">{cellsDone}</strong> / {fillCount}
          {idx >= steps.length - 1 && <span style={{ color: PINK }} className="ml-3">distance = {table[M][N]}</span>}
        </WidgetStatus>
      </div>
    </div>
  )
}
