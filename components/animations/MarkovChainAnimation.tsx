'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'
import { EquationReadout } from '@/components/EquationReadout'

const W = 600
const H = 300

const NAMES = ['Sunny', 'Cloudy', 'Rainy']
const SHORT = ['S', 'C', 'R']
const COLORS = ['#F59E0B', '#60A5FA', '#A78BFA']
const NODES = [
  { x: 105, y: 82 },
  { x: 258, y: 82 },
  { x: 180, y: 214 },
]
const NODE_R = 26
const CENTROID = { x: 181, y: 126 }

// Histogram panel
const HX = 382
const HY = 46
const HW = 190
const HH = 176

type Pt = { x: number; y: number }

// Row-stochastic 3x3 weather matrix. The two sliders set the self-loop
// probability of Sunny and Rainy; the remaining mass is split on a fixed ratio.
function buildMatrix(pS: number, pR: number): number[][] {
  return [
    [pS, (1 - pS) * 0.62, (1 - pS) * 0.38],
    [0.34, 0.3, 0.36],
    [(1 - pR) * 0.42, (1 - pR) * 0.58, pR],
  ]
}

// Left eigenvector with eigenvalue 1, by power iteration on a row vector.
function stationary(P: number[][]): number[] {
  let v = [1 / 3, 1 / 3, 1 / 3]
  for (let it = 0; it < 400; it++) {
    const n = [0, 0, 0]
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) n[j] += v[i] * P[i][j]
    v = n
  }
  const s = v[0] + v[1] + v[2]
  return v.map(x => x / s)
}

function pickNext(row: number[]): number {
  const r = Math.random()
  let acc = 0
  for (let j = 0; j < 3; j++) {
    acc += row[j]
    if (r < acc) return j
  }
  return 2
}

// Quadratic bezier helpers for the curved transition arrows.
function control(i: number, j: number): Pt {
  const a = NODES[i]
  const b = NODES[j]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { x: (a.x + b.x) / 2 - (dy / len) * 30, y: (a.y + b.y) / 2 + (dx / len) * 30 }
}

function bez(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }
}

function bezTangent(a: Pt, c: Pt, b: Pt, t: number): number {
  const u = 1 - t
  return Math.atan2(2 * u * (c.y - a.y) + 2 * t * (b.y - c.y), 2 * u * (c.x - a.x) + 2 * t * (b.x - c.x))
}

// Self-loop circle, pushed radially outward from the triangle centre.
function loopCircle(i: number): { cx: number; cy: number; r: number; ux: number; uy: number } {
  const n = NODES[i]
  const dx = n.x - CENTROID.x
  const dy = n.y - CENTROID.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  return { cx: n.x + ux * 33, cy: n.y + uy * 33, r: 19, ux, uy }
}

function loopPoint(i: number, t: number): Pt {
  const l = loopCircle(i)
  const base = Math.atan2(l.uy, l.ux)
  const ang = base + Math.PI + t * Math.PI * 2
  return { x: l.cx + Math.cos(ang) * l.r, y: l.cy + Math.sin(ang) * l.r }
}

function arrowHead(ctx: CanvasRenderingContext2D, p: Pt, ang: number, color: string) {
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(ang)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-7, 3.4)
  ctx.lineTo(-7, -3.4)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()
}

// The two self-transition probabilities are the whole chain: everything else,
// including the stationary distribution, follows from them. Speed is presentation
// only, but it rides along so a link reproduces the pace it was found at too.
const SPEC = {
  pS: { default: 0.7, min: 0.05, max: 0.95, step: 0.05, symbol: 'P(S→S)' },
  pR: { default: 0.55, min: 0.05, max: 0.95, step: 0.05, symbol: 'P(R→R)' },
  speed: { default: 3, min: 1, max: 6, step: 1 },
}

export function MarkovChainAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('markov', SPEC)
  const { pS, pR, speed } = params
  const [steps, setSteps] = useState(0)

  const curRef = useRef(0)
  const nextRef = useRef(1)
  const tRef = useRef(0)
  const visitsRef = useRef<number[]>([0, 0, 0])
  const stepsRef = useRef(0)

  const P = useMemo(() => buildMatrix(pS, pR), [pS, pR])
  const pi = useMemo(() => stationary(P), [P])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // Panel divider
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(352, 18)
    ctx.lineTo(352, H - 18)
    ctx.stroke()

    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,245,235,0.35)'
    ctx.fillText('State graph', 16, 24)
    ctx.fillText('Fraction of time in each state', HX - 12, 24)

    // Directed transition arrows
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (i === j) continue
        const p = P[i][j]
        if (p < 0.005) continue
        const a = NODES[i]
        const b = NODES[j]
        const c = control(i, j)
        ctx.strokeStyle = `${COLORS[i]}${p > 0.28 ? '99' : '4D'}`
        ctx.lineWidth = 0.8 + p * 4
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.quadraticCurveTo(c.x, c.y, b.x, b.y)
        ctx.stroke()
        const head = bez(a, c, b, 0.78)
        arrowHead(ctx, head, bezTangent(a, c, b, 0.78), COLORS[i])
        const lab = bez(a, c, b, 0.5)
        ctx.fillStyle = 'rgba(255,245,235,0.55)'
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(p.toFixed(2), lab.x, lab.y + 3)
      }
    }

    // Self-loops
    for (let i = 0; i < 3; i++) {
      const p = P[i][i]
      if (p < 0.005) continue
      const l = loopCircle(i)
      ctx.strokeStyle = `${COLORS[i]}${p > 0.28 ? '99' : '4D'}`
      ctx.lineWidth = 0.8 + p * 4
      ctx.beginPath()
      ctx.arc(l.cx, l.cy, l.r, 0, Math.PI * 2)
      ctx.stroke()
      const hp = loopPoint(i, 0.22)
      arrowHead(ctx, hp, Math.atan2(hp.x - l.cx, -(hp.y - l.cy)) + Math.PI / 2, COLORS[i])
      ctx.fillStyle = 'rgba(255,245,235,0.55)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(p.toFixed(2), l.cx + l.ux * 26, l.cy + l.uy * 26 + 3)
    }

    // Nodes
    for (let i = 0; i < 3; i++) {
      const n = NODES[i]
      const active = curRef.current === i && tRef.current === 0
      ctx.beginPath()
      ctx.arc(n.x, n.y, NODE_R, 0, Math.PI * 2)
      ctx.fillStyle = active ? `${COLORS[i]}44` : 'rgba(15,13,10,0.95)'
      ctx.fill()
      ctx.strokeStyle = COLORS[i]
      ctx.lineWidth = active ? 2.5 : 1.4
      ctx.stroke()
      ctx.fillStyle = COLORS[i]
      ctx.font = 'bold 13px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(SHORT[i], n.x, n.y + 4.5)
      ctx.fillStyle = 'rgba(255,245,235,0.4)'
      ctx.font = '9px monospace'
      ctx.fillText(NAMES[i], n.x, n.y + NODE_R + 13)
    }

    // Token
    const cur = curRef.current
    const nxt = nextRef.current
    const t = tRef.current
    const pos = cur === nxt
      ? loopPoint(cur, t)
      : bez(NODES[cur], control(cur, nxt), NODES[nxt], t)
    const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 15)
    g.addColorStop(0, '#10B98188')
    g.addColorStop(1, '#10B98100')
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, 15, 0, Math.PI * 2)
    ctx.fillStyle = g
    ctx.fill()
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2)
    ctx.fillStyle = '#10B981'
    ctx.fill()

    // Histogram of empirical occupancy vs stationary distribution
    const total = visitsRef.current[0] + visitsRef.current[1] + visitsRef.current[2]
    const fracs = visitsRef.current.map(v => (total > 0 ? v / total : 0))
    const scale = Math.max(...fracs, ...pi, 0.15) * 1.18
    const barW = HW / 3

    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(HX, HY)
    ctx.lineTo(HX, HY + HH)
    ctx.lineTo(HX + HW, HY + HH)
    ctx.stroke()

    for (let i = 0; i < 3; i++) {
      const x = HX + i * barW
      const h = (fracs[i] / scale) * HH
      const grad = ctx.createLinearGradient(x, HY + HH - h, x, HY + HH)
      grad.addColorStop(0, `${COLORS[i]}D9`)
      grad.addColorStop(1, `${COLORS[i]}40`)
      ctx.fillStyle = grad
      ctx.fillRect(x + 10, HY + HH - h, barW - 20, h)

      // Stationary marker
      const py = HY + HH - (pi[i] / scale) * HH
      ctx.strokeStyle = '#F59E0B'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(x + 5, py)
      ctx.lineTo(x + barW - 5, py)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = 'rgba(255,245,235,0.45)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(SHORT[i], x + barW / 2, HY + HH + 13)
      ctx.fillStyle = COLORS[i]
      ctx.fillText(total > 0 ? fracs[i].toFixed(2) : '—', x + barW / 2, HY + HH - h - 6)
    }

    ctx.fillStyle = '#F59E0B'
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`— stationary π = (${pi.map(v => v.toFixed(2)).join(', ')})`, HX - 12, H - 12)

    ctx.fillStyle = 'rgba(255,245,235,0.35)'
    ctx.fillText(`hops: ${stepsRef.current}`, 16, H - 12)
  }, [P, pi])

  const restart = useCallback(() => {
    curRef.current = 0
    nextRef.current = 0
    tRef.current = 0
    visitsRef.current = [0, 0, 0]
    stepsRef.current = 0
    setSteps(0)
  }, [])

  // Changing the matrix invalidates the collected statistics.
  useEffect(() => {
    restart()
    nextRef.current = pickNext(P[curRef.current])
    draw()
  }, [P, restart, draw])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const tick = () => {
      tRef.current += (0.012 + speed * 0.011)
      if (tRef.current >= 1) {
        tRef.current = 0
        curRef.current = nextRef.current
        visitsRef.current[curRef.current] += 1
        stepsRef.current += 1
        if (stepsRef.current % 4 === 0) setSteps(stepsRef.current)
        nextRef.current = pickNext(P[curRef.current])
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, speed, P, draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    restart()
    nextRef.current = pickNext(P[0])
    triggerReset()
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Markov Chain</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Walk</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>P(S→S):</span>
          <input type="range" min={SPEC.pS.min} max={SPEC.pS.max} step={SPEC.pS.step} value={pS}
            onChange={e => set('pS', +e.target.value)}
            className="w-20 accent-accent-gold" />
          <span className="font-mono">{pS.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>P(R→R):</span>
          <input type="range" min={SPEC.pR.min} max={SPEC.pR.max} step={SPEC.pR.step} value={pR}
            onChange={e => set('pR', +e.target.value)}
            className="w-20 accent-accent-gold" />
          <span className="font-mono">{pR.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Speed:</span>
          <input type="range" min={SPEC.speed.min} max={SPEC.speed.max} step={SPEC.speed.step} value={speed}
            onChange={e => set('speed', +e.target.value)}
            className="w-16 accent-accent-gold" />
        </div>
      </div>
      <div className="animation-readout">
        {/* The stationary distribution is not simulated — it is solved from the
            two knobs, which is exactly the point the article makes: where the
            walk ends up is a property of the matrix, not of the walk. */}
        {/* Reuses `pi`, which the component already solves from the same
            matrix it walks. A second, hand-derived expression here would be a
            competing source of truth, and a two-state closed form would be
            simply wrong: this is a three-state chain, and the mass the two
            sliders leave over is split between the others on a fixed ratio. */}
        <EquationReadout
          formula="π = πP → π(Sunny)"
          bindings={[
            { symbol: 'P(S→S)', value: pS.toFixed(2) },
            { symbol: 'P(R→R)', value: pR.toFixed(2) },
          ]}
          result={`${(pi[0] * 100).toFixed(1)}%`}
          assumption="the exact long-run share, reached by power iteration on the 3×3 matrix; the walk above only converges towards it"
        />
        <span className="text-xs text-text-secondary font-mono shrink-0">{steps} hops</span>
      </div>
    </div>
  )
}
