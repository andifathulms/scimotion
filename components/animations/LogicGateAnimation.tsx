'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

const DIM = 'rgba(245,240,232,0.42)'
const FAINT_LINE = 'rgba(255,245,235,0.12)'

type Bit = 0 | 1
type Shape = 'and' | 'or' | 'xor' | 'not'

type Gate = {
  id: string
  inputs: 1 | 2
  shape: Shape
  inverting: boolean
  fn: (a: Bit, b: Bit) => Bit
  note: string
}

const GATES: Gate[] = [
  { id: 'NOT', inputs: 1, shape: 'not', inverting: true, fn: a => (a ? 0 : 1), note: 'inverter: flips its single input' },
  { id: 'AND', inputs: 2, shape: 'and', inverting: false, fn: (a, b) => ((a && b) ? 1 : 0), note: 'on only when both inputs are on' },
  { id: 'OR', inputs: 2, shape: 'or', inverting: false, fn: (a, b) => ((a || b) ? 1 : 0), note: 'on when at least one input is on' },
  { id: 'XOR', inputs: 2, shape: 'xor', inverting: false, fn: (a, b) => ((a !== b) ? 1 : 0), note: 'on when the inputs differ — this is the sum bit' },
  { id: 'NAND', inputs: 2, shape: 'and', inverting: true, fn: (a, b) => ((a && b) ? 0 : 1), note: 'AND then invert — universal: every gate is built from these' },
]

// The four (or two) input combinations, in truth-table order.
function rowsFor(inputs: 1 | 2): [Bit, Bit][] {
  return inputs === 1
    ? [[0, 0], [1, 0]]
    : [[0, 0], [0, 1], [1, 0], [1, 1]]
}

export function LogicGateAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gateId, setGateId] = useState('AND')
  const [a, setA] = useState<Bit>(1)
  const [b, setB] = useState<Bit>(0)
  const [playing, setPlaying] = useState(false)

  const gate = GATES.find(g => g.id === gateId) ?? GATES[1]
  const out = gate.fn(a, gate.inputs === 1 ? 0 : b)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) return
      setPlaying(true)
    },
  })

  // Autoplay: cycle through the truth-table rows so the reader sees every combination.
  useEffect(() => {
    if (!playing) return
    const rows = rowsFor(gate.inputs)
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      if (i >= rows.length) { setPlaying(false); return }
      setA(rows[i][0])
      setB(rows[i][1])
    }, 900)
    return () => window.clearInterval(id)
  }, [playing, gate.inputs])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    // ---- heading ----
    ctx.textAlign = 'left'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = BLUE
    ctx.fillText(`${gate.id} gate`, 16, 24)
    ctx.font = '10px monospace'
    ctx.fillStyle = DIM
    ctx.fillText(gate.note, 16, 40)

    const single = gate.inputs === 1
    const aY = single ? 150 : 135
    const bY = 165
    const inX = 110
    const nodeR = 11

    const wire = (v: Bit) => (v ? GREEN : DIM)

    // ---- input wires + nodes ----
    const drawInput = (label: string, y: number, v: Bit) => {
      ctx.strokeStyle = wire(v)
      ctx.lineWidth = v ? 2.5 : 1.5
      ctx.beginPath()
      ctx.moveTo(inX, y)
      ctx.lineTo(220, y)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(inX, y, nodeR, 0, Math.PI * 2)
      ctx.fillStyle = v ? `${GREEN}33` : 'rgba(26,23,18,0.9)'
      ctx.fill()
      ctx.strokeStyle = wire(v)
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = wire(v)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(v), inX, y)
      ctx.font = '10px monospace'
      ctx.fillStyle = DIM
      ctx.fillText(label, inX - 24, y)
      ctx.textBaseline = 'alphabetic'
      ctx.textAlign = 'left'
    }
    drawInput('A', aY, a)
    if (!single) drawInput('B', bY, b)

    // ---- gate body ----
    ctx.strokeStyle = BLUE
    ctx.lineWidth = 2.5
    ctx.fillStyle = `${BLUE}14`
    ctx.beginPath()
    let noseX = 285
    if (gate.shape === 'and') {
      ctx.moveTo(220, 120)
      ctx.lineTo(255, 120)
      ctx.arc(255, 150, 30, -Math.PI / 2, Math.PI / 2)
      ctx.lineTo(220, 180)
      ctx.closePath()
      noseX = 285
    } else if (gate.shape === 'or' || gate.shape === 'xor') {
      const sx = gate.shape === 'xor' ? 228 : 220
      noseX = gate.shape === 'xor' ? 298 : 290
      ctx.moveTo(sx, 120)
      ctx.quadraticCurveTo(sx + 48, 120, noseX, 150)
      ctx.quadraticCurveTo(sx + 48, 180, sx, 180)
      ctx.quadraticCurveTo(sx + 20, 150, sx, 120)
      ctx.closePath()
    } else {
      ctx.moveTo(222, 120)
      ctx.lineTo(222, 180)
      ctx.lineTo(282, 150)
      ctx.closePath()
      noseX = 282
    }
    ctx.fill()
    ctx.stroke()

    // XOR back arc
    if (gate.shape === 'xor') {
      ctx.strokeStyle = BLUE
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(220, 120)
      ctx.quadraticCurveTo(240, 150, 220, 180)
      ctx.stroke()
    }

    // inverting bubble
    let outStart = noseX
    if (gate.inverting) {
      ctx.beginPath()
      ctx.arc(noseX + 6, 150, 6, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(26,23,18,0.95)'
      ctx.fill()
      ctx.strokeStyle = BLUE
      ctx.lineWidth = 2
      ctx.stroke()
      outStart = noseX + 12
    }

    // gate id inside body
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = BLUE
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(gate.id, gate.shape === 'not' ? 244 : 246, 150)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'

    // ---- output wire + node ----
    const outNodeX = 350
    ctx.strokeStyle = wire(out)
    ctx.lineWidth = out ? 2.5 : 1.5
    ctx.beginPath()
    ctx.moveTo(outStart, 150)
    ctx.lineTo(outNodeX, 150)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(outNodeX, 150, 13, 0, Math.PI * 2)
    ctx.fillStyle = out ? `${GREEN}33` : 'rgba(26,23,18,0.9)'
    ctx.fill()
    ctx.strokeStyle = wire(out)
    ctx.lineWidth = 2.5
    ctx.stroke()
    ctx.font = 'bold 14px monospace'
    ctx.fillStyle = wire(out)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(out), outNodeX, 150)
    ctx.font = '10px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('OUT', outNodeX, 178)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'

    // ---- truth table ----
    const rows = rowsFor(gate.inputs)
    const tX = 410
    const tY = 92
    const rowH = 30
    const cols = single ? ['A', 'OUT'] : ['A', 'B', 'OUT']
    const colX = single ? [tX + 24, tX + 116] : [tX + 22, tX + 74, tX + 140]

    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = DIM
    ctx.textAlign = 'center'
    cols.forEach((c, i) => ctx.fillText(c, colX[i], tY - 6))
    ctx.strokeStyle = FAINT_LINE
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(tX, tY)
    ctx.lineTo(tX + 176, tY)
    ctx.stroke()

    rows.forEach((r, i) => {
      const ry = tY + i * rowH
      const active = r[0] === a && (single || r[1] === b)
      if (active) {
        ctx.fillStyle = `${GOLD}22`
        ctx.fillRect(tX, ry, 176, rowH)
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 1.5
        ctx.strokeRect(tX + 0.5, ry + 0.5, 175, rowH - 1)
      }
      const rout = gate.fn(r[0], single ? 0 : r[1])
      const cellColor = (v: Bit) => (active ? (v ? GREEN : GOLD) : (v ? 'rgba(16,185,129,0.7)' : DIM))
      ctx.font = active ? 'bold 12px monospace' : '12px monospace'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = cellColor(r[0])
      ctx.fillText(String(r[0]), colX[0], ry + rowH / 2)
      if (!single) {
        ctx.fillStyle = cellColor(r[1])
        ctx.fillText(String(r[1]), colX[1], ry + rowH / 2)
      }
      ctx.fillStyle = active ? (rout ? GREEN : GOLD) : (rout ? 'rgba(16,185,129,0.7)' : DIM)
      ctx.fillText(String(rout), colX[single ? 1 : 2], ry + rowH / 2)
      ctx.textBaseline = 'alphabetic'
    })

    // rows count note
    ctx.font = '9px monospace'
    ctx.fillStyle = VIOLET
    ctx.textAlign = 'left'
    ctx.fillText(`${gate.inputs} input${single ? '' : 's'} → 2^${gate.inputs} = ${rows.length} rows`, tX, tY + rows.length * rowH + 18)
  }, [gate, a, b, out])

  useEffect(() => { draw() }, [draw])

  const pickGate = (id: string) => {
    setPlaying(false)
    setGateId(id)
  }

  const reset = () => {
    triggerReset()
    setPlaying(false)
    setA(1)
    setB(0)
  }

  const single = gate.inputs === 1

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Gates and truth tables</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Gates and truth tables. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="font-mono">gate:</span>
          {GATES.map(g => (
            <button
              key={g.id}
              onClick={() => pickGate(g.id)}
              className={`rounded border px-2 py-1 font-mono transition-colors ${gateId === g.id ? 'border-accent-blue text-accent-blue' : 'border-white/10 text-text-muted hover:text-text-secondary'}`}
            >
              {g.id}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-text-muted ml-auto">
          <span className="font-mono">flip:</span>
          <button
            onClick={() => { setPlaying(false); setA(v => (v ? 0 : 1)) }}
            className="rounded border border-white/10 px-2 py-1 font-mono hover:text-text-secondary transition-colors"
          >
            A = {a}
          </button>
          <button
            onClick={() => { setPlaying(false); setB(v => (v ? 0 : 1)) }}
            disabled={single}
            className="rounded border border-white/10 px-2 py-1 font-mono hover:text-text-secondary disabled:opacity-40 transition-colors"
          >
            B = {single ? '—' : b}
          </button>
          <button
            onClick={() => { setA(0); setB(0); setPlaying(true) }}
            className="rounded border border-white/10 px-2 py-1 hover:text-text-secondary transition-colors"
          >
            {playing ? 'cycling…' : 'cycle rows'}
          </button>
        </div>
      </div>
    </div>
  )
}
