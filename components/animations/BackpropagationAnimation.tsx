'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Play, Pause, RotateCcw, ChevronRight, ChevronLeft } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 330

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const GREEN = '#10B981'

// A frozen 2-2-1 network, so every number below is reproducible.
const X = [0.90, -0.40]
const TARGET = 1
const W1 = [
  [0.80, -0.60], // into hidden 1
  [0.40, 0.90], // into hidden 2
]
const B1 = [0.10, -0.20]
const W2 = [1.20, -0.70]
const B2 = 0.30

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

type Model = {
  z1: number[]
  a1: number[]
  z2: number
  p: number
  loss: number
  dz2: number
  dW2: number[]
  db2: number
  da1: number[]
  dz1: number[]
  dW1: number[][]
  db1: number[]
}

function computeModel(): Model {
  const z1 = [0, 1].map(j => W1[j][0] * X[0] + W1[j][1] * X[1] + B1[j])
  const a1 = z1.map(Math.tanh)
  const z2 = W2[0] * a1[0] + W2[1] * a1[1] + B2
  const p = sigmoid(z2)
  const loss = -(TARGET * Math.log(p) + (1 - TARGET) * Math.log(1 - p))
  const dz2 = p - TARGET
  const dW2 = a1.map(a => dz2 * a)
  const db2 = dz2
  const da1 = W2.map(w => dz2 * w)
  const dz1 = [0, 1].map(j => da1[j] * (1 - a1[j] * a1[j]))
  const dW1 = [0, 1].map(j => [dz1[j] * X[0], dz1[j] * X[1]])
  const db1 = dz1
  return { z1, a1, z2, p, loss, dz2, dW2, db2, da1, dz1, dW1, db1 }
}

// Node geometry: two inputs, two hidden units, one output.
const NODE_R = 21
const COL = [96, 268, 442]
const IN_Y = [110, 200]
const HID_Y = [110, 200]
const OUT_Y = 155

type Phase = 'idle' | 'forward' | 'backward'
type Step = {
  phase: Phase
  title: string
  lines: (m: Model) => string[]
  // edges lit during this step: [layer, from, to]; layer 0 = input->hidden, 1 = hidden->output
  edges: [number, number, number][]
}

const STEPS: Step[] = [
  {
    phase: 'idle',
    title: 'Inputs',
    lines: () => [
      `x₁ = ${X[0].toFixed(2)}   x₂ = ${X[1].toFixed(2)}   target y = ${TARGET}`,
      'Every weight is fixed, so each number below is exact — nothing is sampled.',
    ],
    edges: [],
  },
  {
    phase: 'forward',
    title: 'Forward · hidden layer',
    lines: m => [
      `z₁ = ${W1[0][0].toFixed(2)}·${X[0].toFixed(2)} + ${W1[0][1].toFixed(2)}·(${X[1].toFixed(2)}) + ${B1[0].toFixed(2)} = ${m.z1[0].toFixed(4)}`,
      `z₂ = ${W1[1][0].toFixed(2)}·${X[0].toFixed(2)} + ${W1[1][1].toFixed(2)}·(${X[1].toFixed(2)}) + ${B1[1].toFixed(2)} = ${m.z1[1].toFixed(4)}`,
      `a = tanh(z)  →  a₁ = ${m.a1[0].toFixed(4)},  a₂ = ${m.a1[1].toFixed(4)}`,
    ],
    edges: [[0, 0, 0], [0, 1, 0], [0, 0, 1], [0, 1, 1]],
  },
  {
    phase: 'forward',
    title: 'Forward · output',
    lines: m => [
      `z_out = ${W2[0].toFixed(2)}·${m.a1[0].toFixed(4)} + (${W2[1].toFixed(2)})·${m.a1[1].toFixed(4)} + ${B2.toFixed(2)} = ${m.z2.toFixed(4)}`,
      `p = σ(z_out) = ${m.p.toFixed(4)}`,
    ],
    edges: [[1, 0, 0], [1, 1, 0]],
  },
  {
    phase: 'forward',
    title: 'Loss',
    lines: m => [
      `L = −[ y·ln p + (1−y)·ln(1−p) ]  with y = ${TARGET}`,
      `L = −ln(${m.p.toFixed(4)}) = ${m.loss.toFixed(4)}`,
      'One number. Everything from here on is ∂L/∂(something).',
    ],
    edges: [],
  },
  {
    phase: 'backward',
    title: 'Backward · seed the chain',
    lines: m => [
      `∂L/∂p · ∂p/∂z_out  collapses to  ∂L/∂z_out = p − y`,
      `∂L/∂z_out = ${m.p.toFixed(4)} − ${TARGET} = ${m.dz2.toFixed(4)}`,
      'Sigmoid and cross-entropy were built to cancel like this.',
    ],
    edges: [],
  },
  {
    phase: 'backward',
    title: 'Backward · output weights',
    lines: m => [
      `∂L/∂w = (∂L/∂z_out)·(∂z_out/∂w) and ∂z_out/∂wⱼ = aⱼ`,
      `∂L/∂w₁ = ${m.dz2.toFixed(4)} · ${m.a1[0].toFixed(4)} = ${m.dW2[0].toFixed(4)}`,
      `∂L/∂w₂ = ${m.dz2.toFixed(4)} · ${m.a1[1].toFixed(4)} = ${m.dW2[1].toFixed(4)}   ∂L/∂b = ${m.db2.toFixed(4)}`,
    ],
    edges: [[1, 0, 0], [1, 1, 0]],
  },
  {
    phase: 'backward',
    title: 'Backward · through the activations',
    lines: m => [
      `∂L/∂aⱼ = (∂L/∂z_out)·wⱼ  →  ${m.da1[0].toFixed(4)}, ${m.da1[1].toFixed(4)}`,
      `tanh′(z) = 1 − a²  →  ${(1 - m.a1[0] * m.a1[0]).toFixed(4)}, ${(1 - m.a1[1] * m.a1[1]).toFixed(4)}`,
      `∂L/∂zⱼ = ${m.dz1[0].toFixed(4)}, ${m.dz1[1].toFixed(4)}   ← the same signal, one layer earlier`,
    ],
    edges: [[1, 0, 0], [1, 1, 0]],
  },
  {
    phase: 'backward',
    title: 'Backward · input weights',
    lines: m => [
      `∂L/∂w₍ᵢⱼ₎ = (∂L/∂zⱼ)·xᵢ — the local input, times the signal arriving from above`,
      `hidden 1:  ${m.dW1[0][0].toFixed(4)},  ${m.dW1[0][1].toFixed(4)}    bias ${m.db1[0].toFixed(4)}`,
      `hidden 2:  ${m.dW1[1][0].toFixed(4)},  ${m.dW1[1][1].toFixed(4)}    bias ${m.db1[1].toFixed(4)}`,
    ],
    edges: [[0, 0, 0], [0, 1, 0], [0, 0, 1], [0, 1, 1]],
  },
  {
    phase: 'idle',
    title: 'Done — one gradient, one update',
    lines: m => [
      `All 9 partial derivatives obtained in a single backward sweep.`,
      `Cost: about one forward pass. Now step each weight by −η·∂L/∂w.`,
      `Largest pull: ∂L/∂w₁ (output) = ${m.dW2[0].toFixed(4)} — push it down to raise p toward ${TARGET}.`,
    ],
    edges: [],
  },
]

function edgePoints(layer: number, from: number, to: number) {
  if (layer === 0) {
    return { x0: COL[0], y0: IN_Y[from], x1: COL[1], y1: HID_Y[to] }
  }
  return { x0: COL[1], y0: HID_Y[from], x1: COL[2], y1: OUT_Y }
}

export function BackpropagationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const m = useMemo(() => computeModel(), [])
  const [step, setStep] = useState(0)
  const [running, setRunning] = useState(false)
  const [t, setT] = useState(1)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef(0)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setStep(STEPS.length - 1); setT(1); return }
      setStep(0)
      setT(0)
      setRunning(true)
    },
  })

  // animate t: 0 → 1 whenever the step changes
  useEffect(() => {
    setT(0)
    startRef.current = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - startRef.current) / 900, 1)
      setT(p)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [step])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setStep(s => {
        if (s >= STEPS.length - 1) { setRunning(false); return s }
        return s + 1
      })
    }, 1700)
    return () => clearInterval(id)
  }, [running])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const cur = STEPS[step]
    const back = cur.phase === 'backward'
    const flow = back ? PINK : BLUE
    const lit = new Set(cur.edges.map(([l, f, to]) => `${l},${f},${to}`))

    // ---- all edges, faint ------------------------------------------------
    const allEdges: [number, number, number][] = [
      [0, 0, 0], [0, 1, 0], [0, 0, 1], [0, 1, 1], [1, 0, 0], [1, 1, 0],
    ]
    for (const [l, f, to] of allEdges) {
      const { x0, y0, x1, y1 } = edgePoints(l, f, to)
      const on = lit.has(`${l},${f},${to}`)
      ctx.strokeStyle = on ? flow : 'rgba(255,245,235,0.10)'
      ctx.lineWidth = on ? 1.8 : 1
      ctx.globalAlpha = on ? 0.85 : 1
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
      ctx.globalAlpha = 1

      if (on) {
        // travelling pulse: forward left→right, backward right→left
        const u = back ? 1 - t : t
        const px = x0 + (x1 - x0) * u
        const py = y0 + (y1 - y0) * u
        ctx.fillStyle = flow
        ctx.beginPath()
        ctx.arc(px, py, 4.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 0.3
        ctx.beginPath()
        ctx.arc(px, py, 9, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    // ---- weight labels ---------------------------------------------------
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    for (const [l, f, to] of allEdges) {
      const { x0, y0, x1, y1 } = edgePoints(l, f, to)
      const w = l === 0 ? W1[to][f] : W2[f]
      const showGrad = back && step >= (l === 0 ? 7 : 5) && lit.has(`${l},${f},${to}`)
      const g = l === 0 ? m.dW1[to][f] : m.dW2[f]
      ctx.fillStyle = showGrad ? PINK : 'rgba(245,240,232,0.4)'
      ctx.fillText(
        showGrad ? `∂L/∂w ${g.toFixed(3)}` : `w ${w.toFixed(2)}`,
        x0 + (x1 - x0) * 0.5,
        y0 + (y1 - y0) * 0.5 - 8,
      )
    }

    // ---- nodes -----------------------------------------------------------
    const drawNode = (
      x: number, y: number, label: string, value: string | null,
      stroke: string, revealed: boolean,
    ) => {
      ctx.fillStyle = revealed ? `${stroke}22` : 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = revealed ? stroke : 'rgba(255,245,235,0.15)'
      ctx.lineWidth = revealed ? 1.8 : 1
      ctx.beginPath()
      ctx.arc(x, y, NODE_R, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.font = '10px monospace'
      ctx.fillStyle = revealed ? stroke : 'rgba(245,240,232,0.3)'
      ctx.fillText(label, x, y - 5)
      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = revealed ? 'rgba(245,240,232,0.9)' : 'rgba(245,240,232,0.25)'
      ctx.fillText(value ?? '—', x, y + 8)
    }

    drawNode(COL[0], IN_Y[0], 'x₁', X[0].toFixed(2), VIOLET, true)
    drawNode(COL[0], IN_Y[1], 'x₂', X[1].toFixed(2), VIOLET, true)
    drawNode(COL[1], HID_Y[0], 'a₁', step >= 1 ? m.a1[0].toFixed(3) : null, GOLD, step >= 1)
    drawNode(COL[1], HID_Y[1], 'a₂', step >= 1 ? m.a1[1].toFixed(3) : null, GOLD, step >= 1)
    drawNode(COL[2], OUT_Y, 'p', step >= 2 ? m.p.toFixed(3) : null, GREEN, step >= 2)

    // loss box to the right of the output
    ctx.strokeStyle = step >= 3 ? PINK : 'rgba(255,245,235,0.15)'
    ctx.fillStyle = step >= 3 ? `${PINK}18` : 'rgba(255,255,255,0.03)'
    ctx.lineWidth = step >= 3 ? 1.8 : 1
    ctx.beginPath()
    ctx.roundRect(510, OUT_Y - 24, 72, 48, 8)
    ctx.fill()
    ctx.stroke()
    ctx.font = '10px monospace'
    ctx.fillStyle = step >= 3 ? PINK : 'rgba(245,240,232,0.3)'
    ctx.fillText('loss L', 546, OUT_Y - 8)
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = step >= 3 ? 'rgba(245,240,232,0.9)' : 'rgba(245,240,232,0.25)'
    ctx.fillText(step >= 3 ? m.loss.toFixed(4) : '—', 546, OUT_Y + 9)
    ctx.strokeStyle = step >= 3 ? PINK : 'rgba(255,245,235,0.10)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(COL[2] + NODE_R, OUT_Y)
    ctx.lineTo(510, OUT_Y)
    ctx.stroke()

    // backward-gradient badges on the hidden and output units
    if (back) {
      ctx.font = '9px monospace'
      ctx.fillStyle = PINK
      if (step >= 4) ctx.fillText(`∂L/∂z = ${m.dz2.toFixed(3)}`, COL[2], OUT_Y + NODE_R + 14)
      if (step >= 6) {
        ctx.fillText(`∂L/∂z = ${m.dz1[0].toFixed(3)}`, COL[1], HID_Y[0] - NODE_R - 12)
        ctx.fillText(`∂L/∂z = ${m.dz1[1].toFixed(3)}`, COL[1], HID_Y[1] + NODE_R + 14)
      }
    }

    // ---- direction banner + explanation panel ----------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = back ? PINK : cur.phase === 'forward' ? BLUE : 'rgba(245,240,232,0.5)'
    const banner =
      cur.phase === 'forward' ? '▶ FORWARD — activations flow toward the loss'
        : back ? '◀ BACKWARD — gradients flow away from the loss'
          : '· setup'
    ctx.fillText(banner, 16, 26)
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.font = '11px monospace'
    ctx.textAlign = 'right'
    ctx.fillText(`step ${step + 1}/${STEPS.length} · ${cur.title}`, W - 16, 26)

    ctx.textAlign = 'left'
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.fillStyle = 'rgba(255,255,255,0.025)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(16, 244, W - 32, 72, 8)
    ctx.fill()
    ctx.stroke()
    ctx.font = '11px monospace'
    const lines = cur.lines(m)
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? (back ? PINK : BLUE) : 'rgba(245,240,232,0.65)'
      ctx.fillText(line, 30, 264 + i * 18)
    })
  }, [step, t, m])

  useEffect(() => { draw() }, [draw])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setStep(0)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · One forward pass, one backward pass</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: One forward pass, one backward pass. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (step >= STEPS.length - 1) setStep(0)
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={() => { setRunning(false); setStep(s => Math.max(0, s - 1)) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors"
        >
          <ChevronLeft size={12} /> Back
        </button>
        <button
          onClick={() => { setRunning(false); setStep(s => Math.min(STEPS.length - 1, s + 1)) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors"
        >
          <ChevronRight size={12} /> Step
        </button>
        <span className="ml-auto text-xs text-text-secondary">
          {STEPS[step].phase === 'backward'
            ? <strong style={{ color: PINK }}>backward pass</strong>
            : STEPS[step].phase === 'forward'
              ? <strong style={{ color: BLUE }}>forward pass</strong>
              : <span className="text-text-muted">2-2-1 network · 9 parameters</span>}
        </span>
      </div>
    </div>
  )
}
