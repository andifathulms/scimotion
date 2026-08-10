'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw, Shuffle } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 316

// left panel: the input space and its decision boundary
const BX = 16
const BY = 40
const BS = 262
const GRID = 41
const CELL = BS / GRID

// right panel: loss curve + network schematic
const LX = 316
const LY = 54
const LW = 268
const LH = 104

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const GREEN = '#10B981'

const MAX_EPOCH = 2000
const EPOCHS_PER_FRAME = 3
const LR = 0.06
const MOMENTUM = 0.9

const VIEW = 1.15 // data lives in roughly [-1, 1]

type Sample = { x: number; y: number; label: number }

type Net = {
  sizes: number[]
  W: number[][][]
  b: number[][]
  vW: number[][][]
  vb: number[][]
}

function makeSpirals(perClass: number): Sample[] {
  const out: Sample[] = []
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < perClass; i++) {
      const r = 0.08 + 0.92 * (i / (perClass - 1))
      const t = r * Math.PI * 2 + c * Math.PI + (Math.random() - 0.5) * 0.28
      out.push({
        x: r * Math.cos(t) + (Math.random() - 0.5) * 0.06,
        y: r * Math.sin(t) + (Math.random() - 0.5) * 0.06,
        label: c,
      })
    }
  }
  return out
}

function makeNet(sizes: number[]): Net {
  const Wm: number[][][] = []
  const bm: number[][] = []
  const vWm: number[][][] = []
  const vbm: number[][] = []
  for (let l = 0; l < sizes.length - 1; l++) {
    const fanIn = sizes[l]
    const fanOut = sizes[l + 1]
    const scale = Math.sqrt(2 / (fanIn + fanOut)) * 2.2
    const layer: number[][] = []
    const vLayer: number[][] = []
    for (let j = 0; j < fanOut; j++) {
      const row: number[] = []
      const vRow: number[] = []
      for (let i = 0; i < fanIn; i++) {
        row.push((Math.random() * 2 - 1) * scale)
        vRow.push(0)
      }
      layer.push(row)
      vLayer.push(vRow)
    }
    Wm.push(layer)
    vWm.push(vLayer)
    bm.push(new Array<number>(fanOut).fill(0))
    vbm.push(new Array<number>(fanOut).fill(0))
  }
  return { sizes, W: Wm, b: bm, vW: vWm, vb: vbm }
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

// acts[0] = input, acts[l] = output of layer l. tanh hidden, sigmoid output.
function forward(net: Net, input: number[]): number[][] {
  const acts: number[][] = [input]
  const L = net.W.length
  for (let l = 0; l < L; l++) {
    const prev = acts[l]
    const out: number[] = []
    for (let j = 0; j < net.W[l].length; j++) {
      let z = net.b[l][j]
      const row = net.W[l][j]
      for (let i = 0; i < row.length; i++) z += row[i] * prev[i]
      out.push(l === L - 1 ? sigmoid(z) : Math.tanh(z))
    }
    acts.push(out)
  }
  return acts
}

function predict(net: Net, x: number, y: number): number {
  const acts = forward(net, [x, y])
  return acts[acts.length - 1][0]
}

type EpochResult = { loss: number; acc: number }

// One full-batch gradient descent step with momentum. Backprop written out longhand.
function trainEpoch(net: Net, data: Sample[]): EpochResult {
  const L = net.W.length
  const gW: number[][][] = net.W.map(layer => layer.map(row => row.map(() => 0)))
  const gb: number[][] = net.b.map(row => row.map(() => 0))
  let loss = 0
  let correct = 0

  for (const s of data) {
    const acts = forward(net, [s.x, s.y])
    const p = acts[L][0]
    const clamped = Math.min(Math.max(p, 1e-7), 1 - 1e-7)
    loss += -(s.label * Math.log(clamped) + (1 - s.label) * Math.log(1 - clamped))
    if ((p > 0.5 ? 1 : 0) === s.label) correct++

    // sigmoid + binary cross-entropy collapse to this one clean delta
    let delta: number[] = [p - s.label]
    for (let l = L - 1; l >= 0; l--) {
      const prev = acts[l]
      for (let j = 0; j < delta.length; j++) {
        gb[l][j] += delta[j]
        for (let i = 0; i < prev.length; i++) gW[l][j][i] += delta[j] * prev[i]
      }
      if (l === 0) break
      const prevDelta: number[] = new Array<number>(prev.length).fill(0)
      for (let i = 0; i < prev.length; i++) {
        let sum = 0
        for (let j = 0; j < delta.length; j++) sum += net.W[l][j][i] * delta[j]
        prevDelta[i] = sum * (1 - prev[i] * prev[i]) // tanh'(z) = 1 - a^2
      }
      delta = prevDelta
    }
  }

  const n = data.length
  for (let l = 0; l < L; l++) {
    for (let j = 0; j < net.W[l].length; j++) {
      for (let i = 0; i < net.W[l][j].length; i++) {
        net.vW[l][j][i] = MOMENTUM * net.vW[l][j][i] - LR * (gW[l][j][i] / n)
        net.W[l][j][i] += net.vW[l][j][i]
      }
      net.vb[l][j] = MOMENTUM * net.vb[l][j] - LR * (gb[l][j] / n)
      net.b[l][j] += net.vb[l][j]
    }
  }
  return { loss: loss / n, acc: correct / n }
}

const toPx = (v: number) => BX + ((v + VIEW) / (2 * VIEW)) * BS
const toPy = (v: number) => BY + ((VIEW - v) / (2 * VIEW)) * BS

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  width: { default: 10, min: 1, max: 16, step: 1 },
}

export function NeuralNetworkAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [data] = useState<Sample[]>(() => makeSpirals(60))
  const { params, set, permalink, isDefault, restored } = useWidgetParams('neural-network', SPEC)
  const { width } = params
  const [seed, setSeed] = useState(0)
  const [running, setRunning] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const [stats, setStats] = useState<EpochResult>({ loss: 0.693, acc: 0.5 })

  const netRef = useRef<Net | null>(null)
  const historyRef = useRef<number[]>([])
  const epochRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) return
      setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const net = netRef.current
    if (!canvas || !net) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'middle'

    // ---- decision boundary ------------------------------------------------
    for (let gi = 0; gi < GRID; gi++) {
      for (let gj = 0; gj < GRID; gj++) {
        const vx = -VIEW + ((gi + 0.5) / GRID) * 2 * VIEW
        const vy = VIEW - ((gj + 0.5) / GRID) * 2 * VIEW
        const p = predict(net, vx, vy)
        const conf = Math.abs(p - 0.5) * 2
        ctx.fillStyle = p > 0.5 ? PINK : BLUE
        ctx.globalAlpha = 0.06 + 0.34 * conf
        ctx.fillRect(BX + gi * CELL, BY + gj * CELL, CELL + 0.6, CELL + 0.6)
      }
    }
    ctx.globalAlpha = 1

    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.lineWidth = 1
    ctx.strokeRect(BX, BY, BS, BS)

    // training points, ringed when the network currently gets them wrong
    for (const s of data) {
      const p = predict(net, s.x, s.y)
      const wrong = (p > 0.5 ? 1 : 0) !== s.label
      const px = toPx(s.x)
      const py = toPy(s.y)
      ctx.fillStyle = s.label === 1 ? PINK : BLUE
      ctx.beginPath()
      ctx.arc(px, py, 3.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(15,13,10,0.85)'
      ctx.lineWidth = 1
      ctx.stroke()
      if (wrong) {
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(px, py, 6, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('input space · decision boundary', BX, BY - 14)

    // ---- loss curve -------------------------------------------------------
    const hist = historyRef.current
    const xMax = Math.max(200, Math.ceil((hist.length + 1) / 200) * 200)
    const yMax = 0.78
    ctx.strokeStyle = 'rgba(255,245,235,0.07)'
    ctx.lineWidth = 1
    for (let k = 0; k <= 3; k++) {
      const gy = LY + (k / 3) * LH
      ctx.beginPath()
      ctx.moveTo(LX, gy)
      ctx.lineTo(LX + LW, gy)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.beginPath()
    ctx.moveTo(LX, LY)
    ctx.lineTo(LX, LY + LH)
    ctx.lineTo(LX + LW, LY + LH)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('cross-entropy loss', LX, LY - 14)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('0.78', LX - 26, LY)
    ctx.fillText('0', LX - 8, LY + LH)
    ctx.fillText(`${xMax} epochs`, LX + LW - 58, LY + LH + 12)

    if (hist.length > 1) {
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 1.8
      ctx.beginPath()
      for (let i = 0; i < hist.length; i++) {
        const px = LX + (i / xMax) * LW
        const py = LY + LH - (Math.min(hist[i], yMax) / yMax) * LH
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }

    // ---- network schematic -----------------------------------------------
    const SY = 186
    const SH = 112
    const cols = [LX + 16, LX + 100, LX + 184, LX + 252]
    const shown = Math.min(net.sizes[1], 7)
    const colNodes: { x: number; y: number }[][] = []
    net.sizes.forEach((size, l) => {
      const count = l === 0 || l === net.sizes.length - 1 ? size : shown
      const nodes: { x: number; y: number }[] = []
      for (let j = 0; j < count; j++) {
        const y = count === 1 ? SY + SH / 2 : SY + 10 + (j / (count - 1)) * (SH - 20)
        nodes.push({ x: cols[l], y })
      }
      colNodes.push(nodes)
    })

    for (let l = 0; l < net.W.length; l++) {
      for (let j = 0; j < colNodes[l + 1].length; j++) {
        for (let i = 0; i < colNodes[l].length; i++) {
          const w = net.W[l][j][i]
          const mag = Math.min(Math.abs(w) / 2.5, 1)
          ctx.strokeStyle = w >= 0 ? BLUE : PINK
          ctx.globalAlpha = 0.12 + 0.55 * mag
          ctx.lineWidth = 0.4 + 2 * mag
          ctx.beginPath()
          ctx.moveTo(colNodes[l][i].x, colNodes[l][i].y)
          ctx.lineTo(colNodes[l + 1][j].x, colNodes[l + 1][j].y)
          ctx.stroke()
        }
      }
    }
    ctx.globalAlpha = 1
    ctx.lineWidth = 1.2
    colNodes.forEach((nodes, l) => {
      for (const n of nodes) {
        ctx.fillStyle = l === 0 ? `${VIOLET}33` : l === colNodes.length - 1 ? `${GREEN}33` : 'rgba(255,255,255,0.05)'
        ctx.strokeStyle = l === 0 ? VIOLET : l === colNodes.length - 1 ? GREEN : 'rgba(245,240,232,0.35)'
        ctx.beginPath()
        ctx.arc(n.x, n.y, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    })

    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('x, y', cols[0], SY + SH + 12)
    ctx.fillText(`${net.sizes[1]}`, cols[1], SY + SH + 12)
    ctx.fillText(`${net.sizes[2]}`, cols[2], SY + SH + 12)
    ctx.fillText('p', cols[3], SY + SH + 12)
    if (net.sizes[1] > shown) {
      ctx.fillStyle = 'rgba(245,240,232,0.3)'
      ctx.fillText('⋮', cols[1], SY + SH - 2)
      ctx.fillText('⋮', cols[2], SY + SH - 2)
    }
    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('weights: blue positive, pink negative, thickness = magnitude', LX, H - 8)
  }, [data])

  // (re)build the network whenever the width changes or the reader reshuffles
  useEffect(() => {
    netRef.current = makeNet([2, width, width, 1])
    historyRef.current = []
    epochRef.current = 0
    setEpoch(0)
    setStats({ loss: 0.693, acc: 0.5 })
    draw()
  }, [width, seed, draw])

  useEffect(() => {
    if (!running) return
    let alive = true
    const tick = () => {
      if (!alive) return
      const net = netRef.current
      if (!net) return
      let last: EpochResult = { loss: 0.693, acc: 0.5 }
      for (let k = 0; k < EPOCHS_PER_FRAME && epochRef.current < MAX_EPOCH; k++) {
        last = trainEpoch(net, data)
        historyRef.current.push(last.loss)
        epochRef.current++
      }
      setEpoch(epochRef.current)
      setStats(last)
      draw()
      if (epochRef.current >= MAX_EPOCH) {
        setRunning(false)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      alive = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [running, data, draw])

  const restart = () => {
    setRunning(false)
    setSeed(s => s + 1)
  }

  const resetAll = () => {
    triggerReset()
    restart()
  }

  const done = epoch >= MAX_EPOCH

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Training a 2-layer network</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (done) { setSeed(s => s + 1) }
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Train</>}
        </button>
        <button
          onClick={restart}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors"
        >
          <Shuffle size={12} /> New weights
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Hidden width:</span>
          <input
            type="range" min={SPEC.width.min} max={SPEC.width.max} step={SPEC.width.step} value={width}
            onChange={e => set('width', +e.target.value)}
            className="w-28 accent-accent-blue"
          />
          <span className="font-mono text-text-secondary">{width}</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          epoch <strong className="font-mono text-accent-gold">{epoch}</strong>
          {' · '}loss <strong className="font-mono" style={{ color: GOLD }}>{stats.loss.toFixed(4)}</strong>
          {' · '}accuracy <strong className="font-mono" style={{ color: stats.acc > 0.95 ? GREEN : PINK }}>{(stats.acc * 100).toFixed(0)}%</strong>
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Gold rings mark points the network currently misclassifies. Two hidden layers of the chosen width, tanh activations, full-batch gradient descent with momentum.
      </p>
    </div>
  )
}
