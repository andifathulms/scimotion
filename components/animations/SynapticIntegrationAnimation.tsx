'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const LIME = '#A3E635' // excitatory
const BLUE = '#60A5FA' // inhibitory
const GOLD = '#F59E0B' // threshold / spike
const MUTE = 'rgba(245,240,232,0.55)'

const V_REST = -70
const V_THRESH = -55
const V_RESET = -74
const EPSP = 6.5 // mV jump per excitatory input
const IPSP = 5.5 // mV drop per inhibitory input
const LEAK = 0.05 // fraction pulled back toward rest each step
const PERIOD = 150 // sim-frames per input cycle

// Oscilloscope trace region.
const PLOT_X = 210
const PLOT_W = W - PLOT_X - 16
const PLOT_TOP = 24
const PLOT_BOT = 216

type Kind = 'exc' | 'inh'
type Input = { id: number; kind: Kind; base: number; last: number } // base = phase 0..1

function vToY(v: number): number {
  // Map −85..−40 mV onto the plot band (inverted: higher voltage → higher up).
  const t = (v - -85) / (-40 - -85)
  return PLOT_BOT - Math.max(0, Math.min(1, t)) * (PLOT_BOT - PLOT_TOP)
}

let NEXT_ID = 1

export function SynapticIntegrationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const frameRef = useRef(0)
  const vmRef = useRef(V_REST)
  const traceRef = useRef<number[]>([])
  const refractRef = useRef(0)
  const flashRef = useRef<Record<number, number>>({})
  const inputsRef = useRef<Input[]>([])
  const spikeXRef = useRef<number[]>([])
  const spreadRef = useRef(0.55)
  const firedRef = useRef(0)

  const [inputs, setInputs] = useState<Input[]>([])
  const [running, setRunning] = useState(false)
  const [spread, setSpread] = useState(0.55)
  const [fired, setFired] = useState(0)

  useEffect(() => {
    inputsRef.current = inputs
  }, [inputs])
  useEffect(() => {
    spreadRef.current = spread
  }, [spread])

  const seed = useCallback(() => {
    const init: Input[] = [
      { id: NEXT_ID++, kind: 'exc', base: 0.32, last: -1 },
      { id: NEXT_ID++, kind: 'exc', base: 0.5, last: -1 },
      { id: NEXT_ID++, kind: 'exc', base: 0.68, last: -1 },
      { id: NEXT_ID++, kind: 'inh', base: 0.58, last: -1 },
    ]
    inputsRef.current = init
    setInputs(init)
    vmRef.current = V_REST
    traceRef.current = []
    frameRef.current = 0
    refractRef.current = 0
    flashRef.current = {}
    spikeXRef.current = []
    firedRef.current = 0
    setFired(0)
  }, [])

  // Effective phase (0..1) once the synchrony slider compresses inputs toward 0.5.
  const phaseOf = (inp: Input) => 0.5 + (inp.base - 0.5) * spreadRef.current

  // The dendrite tip (synapse) position on the soma for input i of n.
  const synapsePos = (i: number, n: number) => {
    const cx = 96
    const cy = 120
    const r = 40
    const a = Math.PI - (i / Math.max(1, n - 1 || 1)) * Math.PI * 0.9 - Math.PI * 0.05
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, cx, cy, r, tx: cx + Math.cos(a) * 78, ty: cy + Math.sin(a) * 78 }
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const list = inputsRef.current
    const now = frameRef.current

    // ---- Neuron schematic (left) ----
    const soma = synapsePos(0, list.length)
    // Axon out of the soma.
    ctx.strokeStyle = 'rgba(163,230,53,0.4)'
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(soma.cx + soma.r - 4, soma.cy)
    ctx.lineTo(190, soma.cy)
    ctx.stroke()
    ctx.lineCap = 'butt'

    // Inputs: dendrite + synapse terminal, flashing when recently fired.
    list.forEach((inp, i) => {
      const s = synapsePos(i, list.length)
      const col = inp.kind === 'exc' ? LIME : BLUE
      const flash = flashRef.current[inp.id] ?? 0
      const fade = Math.max(0, (flash - (now - 14)) / 14) // 0..1 for ~14 frames
      ctx.strokeStyle = `rgba(245,240,232,${0.18 + 0.5 * fade})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(s.tx, s.ty)
      ctx.lineTo(s.x, s.y)
      ctx.stroke()
      // Terminal.
      ctx.fillStyle = fade > 0.05 ? col : `${col}55`
      ctx.beginPath()
      ctx.arc(s.tx, s.ty, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(15,13,10,0.9)'
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(inp.kind === 'exc' ? '+' : '−', s.tx, s.ty + 3)
    })

    // Soma body (drawn after dendrites so it sits on top).
    ctx.fillStyle = 'rgba(163,230,53,0.08)'
    ctx.strokeStyle = 'rgba(163,230,53,0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(soma.cx, soma.cy, soma.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // Soma tinted by how close Vm is to threshold; flashes on a spike.
    const climbing = Math.max(0, Math.min(1, (vmRef.current - V_REST) / (V_THRESH - V_REST)))
    if (refractRef.current > 0) {
      ctx.fillStyle = `rgba(245,158,11,${0.15 + 0.5 * (refractRef.current / 16)})`
      ctx.beginPath()
      ctx.arc(soma.cx, soma.cy, soma.r - 4, 0, Math.PI * 2)
      ctx.fill()
    } else if (climbing > 0) {
      ctx.fillStyle = `rgba(163,230,53,${0.1 + 0.28 * climbing})`
      ctx.beginPath()
      ctx.arc(soma.cx, soma.cy, soma.r - 4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = MUTE
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('Σ inputs', soma.cx, soma.cy - 2)
    ctx.fillText(refractRef.current > 0 ? 'FIRING' : 'sum', soma.cx, soma.cy + 12)

    // ---- Oscilloscope panel (right) ----
    // Reference lines.
    const lines: [number, string, string][] = [
      [V_THRESH, `threshold −55`, GOLD],
      [V_REST, `rest −70`, BLUE],
    ]
    ctx.font = '8px monospace'
    for (const [mv, lab, col] of lines) {
      const y = vToY(mv)
      ctx.strokeStyle = col === GOLD ? 'rgba(245,158,11,0.5)' : 'rgba(96,165,250,0.4)'
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PLOT_X, y)
      ctx.lineTo(PLOT_X + PLOT_W, y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = col
      ctx.textAlign = 'left'
      ctx.fillText(lab, PLOT_X + 2, y - 3)
    }

    // Spike markers.
    for (const sx of spikeXRef.current) {
      ctx.strokeStyle = 'rgba(245,158,11,0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(sx, PLOT_TOP)
      ctx.lineTo(sx, PLOT_BOT)
      ctx.stroke()
    }

    // Vm trace.
    const pts = traceRef.current
    if (pts.length > 1) {
      const stepX = PLOT_W / Math.max(1, pts.length - 1)
      ctx.beginPath()
      ctx.lineWidth = 2
      ctx.strokeStyle = LIME
      pts.forEach((v, i) => {
        const x = PLOT_X + i * stepX
        const y = vToY(v)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      // Head dot.
      const lv = pts[pts.length - 1]
      ctx.fillStyle = lv >= V_THRESH ? GOLD : LIME
      ctx.beginPath()
      ctx.arc(PLOT_X + (pts.length - 1) * stepX, vToY(lv), 3.5, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle = MUTE
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillText('membrane potential (mV)', PLOT_X, PLOT_TOP - 10)

    // ---- Bottom readout: the weighted-sum-and-threshold rule ----
    const nExc = list.filter(i => i.kind === 'exc').length
    const nInh = list.filter(i => i.kind === 'inh').length
    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    ctx.fillStyle = LIME
    ctx.fillText(`${nExc} excitatory (+)`, 20, 250)
    ctx.fillStyle = BLUE
    ctx.fillText(`${nInh} inhibitory (−)`, 20, 268)
    ctx.fillStyle = MUTE
    ctx.font = '9px monospace'
    ctx.fillText('fires only if  Σ wᵢxᵢ  crosses threshold', 20, 286)

    ctx.textAlign = 'right'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = vmRef.current >= V_THRESH ? GOLD : 'rgba(245,240,232,0.85)'
    ctx.fillText(`${vmRef.current.toFixed(0)} mV`, W - 16, 252)
    ctx.font = '9px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText(`spikes fired: ${firedRef.current}`, W - 16, 270)
  }, [])

  const stepSim = useCallback(() => {
    const f = ++frameRef.current
    const list = inputsRef.current
    const periodIndex = Math.floor(f / PERIOD)

    // Leak toward rest.
    vmRef.current += (V_REST - vmRef.current) * LEAK
    if (refractRef.current > 0) {
      refractRef.current -= 1
      vmRef.current = V_RESET
    }

    // Fire inputs at their phase within the current cycle.
    for (const inp of list) {
      const target = periodIndex * PERIOD + Math.round(phaseOf(inp) * PERIOD)
      if (inp.last !== periodIndex && f >= target) {
        inp.last = periodIndex
        flashRef.current[inp.id] = f
        if (refractRef.current <= 0) {
          vmRef.current += inp.kind === 'exc' ? EPSP : -IPSP
        }
      }
    }

    // Threshold crossing → spike.
    let sample = vmRef.current
    if (vmRef.current >= V_THRESH && refractRef.current <= 0) {
      sample = 32 // draw the spike peak
      firedRef.current += 1
      setFired(firedRef.current)
      refractRef.current = 16
      vmRef.current = V_RESET
      spikeXRef.current.push(PLOT_X + PLOT_W)
    }

    traceRef.current = [...traceRef.current, sample].slice(-Math.round(PLOT_W))
    // Scroll spike markers left with the trace.
    spikeXRef.current = spikeXRef.current.map(x => x - PLOT_W / Math.max(1, traceRef.current.length)).filter(x => x >= PLOT_X)
  }, [])

  useEffect(() => {
    seed()
    draw()
  }, [seed, draw])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      stepSim()
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, stepSim, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) draw()
      else setRunning(true)
    },
  })

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const addInput = (kind: Kind) => {
    setInputs(prev => {
      if (prev.length >= 7) return prev
      const next = [...prev, { id: NEXT_ID++, kind, base: Math.random(), last: -1 }]
      inputsRef.current = next
      return next
    })
  }
  const removeInput = () => {
    setInputs(prev => {
      if (prev.length <= 1) return prev
      const next = prev.slice(0, -1)
      inputsRef.current = next
      return next
    })
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    seed()
    setSpread(0.55)
    spreadRef.current = 0.55
    draw()
  }

  const btn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · The neuron sums its inputs and fires only past threshold
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: '#0F0D0A' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className={`${btn} bg-accent-lime text-bg-base hover:bg-accent-lime/90`}
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={() => addInput('exc')}
          className={`${btn} border`}
          style={{ color: LIME, borderColor: `${LIME}55`, background: `${LIME}14` }}
        >
          + Excitatory
        </button>
        <button
          onClick={() => addInput('inh')}
          className={`${btn} border`}
          style={{ color: BLUE, borderColor: `${BLUE}55`, background: `${BLUE}14` }}
        >
          + Inhibitory
        </button>
        <button
          onClick={removeInput}
          className={`${btn} border`}
          style={{ color: MUTE, borderColor: 'rgba(245,240,232,0.2)', background: 'rgba(245,240,232,0.04)' }}
        >
          − Remove
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Timing:</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={spread}
            onChange={e => setSpread(+e.target.value)}
            className="w-24 accent-accent-lime"
          />
          <span>{spread < 0.33 ? 'synchronous' : spread > 0.7 ? 'spread out' : 'mixed'}</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          fired: <strong className="text-accent-gold">{fired}</strong>
        </span>
      </div>
    </div>
  )
}
