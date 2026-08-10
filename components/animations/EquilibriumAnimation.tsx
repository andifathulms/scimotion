'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300

// Vessel (left) and the two stacked traces (right).
const VES = { x: 12, y: 34, w: 246, h: 252 }
const P1 = { x: 288, y: 34, w: 300, h: 118 } // concentrations
const P2 = { x: 288, y: 178, w: 300, h: 108 } // rates
const MAXPTS = P1.w

const N = 48
const R = 4.2
const BASE = 0.012 // reverse rate constant; forward = BASE * K

const ORANGE = '#FB923C'
const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'

type Start = 'reactant' | 'product' | 'mixed'

type Mol = { x: number; y: number; vx: number; vy: number; b: boolean; flash: number }

function makeMols(start: Start): Mol[] {
  return Array.from({ length: N }, (_, i) => {
    const a = Math.random() * Math.PI * 2
    const s = 0.7 + Math.random() * 0.8
    const b = start === 'product' ? true : start === 'reactant' ? false : i % 2 === 0
    return {
      x: VES.x + R + 2 + Math.random() * (VES.w - 2 * R - 4),
      y: VES.y + R + 2 + Math.random() * (VES.h - 2 * R - 4),
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      b,
      flash: 0,
    }
  })
}

type Hist = { a: number[]; b: number[]; rf: number[]; rr: number[] }

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  k: { default: 2, min: 0.25, max: 4, step: 0.25 },
}

export function EquilibriumAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const molsRef = useRef<Mol[]>([])
  const histRef = useRef<Hist>({ a: [], b: [], rf: [], rr: [] })
  const kRef = useRef(2)

  const { params, set, permalink, isDefault, restored } = useWidgetParams('equilibrium', SPEC)
  const { k } = params
  const [start, setStart] = useState<Start>('reactant')
  const [running, setRunning] = useState(false)
  const [readout, setReadout] = useState({ a: N, b: 0 })

  useEffect(() => {
    kRef.current = k
  }, [k])

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

    const K = kRef.current
    const kf = BASE * K
    const kr = BASE
    const mols = molsRef.current
    const nB = mols.reduce((s, m) => s + (m.b ? 1 : 0), 0)
    const nA = mols.length - nB

    // ---- Vessel ----
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(VES.x, VES.y, VES.w, VES.h)

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('sealed vessel   A ⇌ B', VES.x, VES.y - 12)

    mols.forEach(m => {
      if (m.flash > 0) {
        ctx.beginPath()
        ctx.arc(m.x, m.y, R + 4 * (m.flash / 12), 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(245,158,11,${0.5 * (m.flash / 12)})`
        ctx.lineWidth = 1.25
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(m.x, m.y, R, 0, Math.PI * 2)
      ctx.fillStyle = m.b ? BLUE : ORANGE
      ctx.fill()
    })

    // Counts inside the vessel
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = ORANGE
    ctx.fillText(`A ${nA}`, VES.x + 8, VES.y + VES.h - 10)
    ctx.fillStyle = BLUE
    ctx.fillText(`B ${nB}`, VES.x + 62, VES.y + VES.h - 10)
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.font = '10px monospace'
    ctx.fillText(`[B]/[A] = ${nA > 0 ? (nB / nA).toFixed(2) : '∞'}`, VES.x + 120, VES.y + VES.h - 10)

    // ---- Shared plot chrome ----
    const axis = (p: { x: number; y: number; w: number; h: number }, title: string) => {
      ctx.strokeStyle = 'rgba(255,245,235,0.15)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x, p.y + p.h)
      ctx.lineTo(p.x + p.w, p.y + p.h)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.font = '10px monospace'
      ctx.fillText(title, p.x, p.y - 6)
    }

    const trace = (
      p: { x: number; y: number; w: number; h: number },
      data: number[],
      max: number,
      color: string,
      width: number
    ) => {
      if (data.length < 2 || max <= 0) return
      ctx.beginPath()
      data.forEach((v, i) => {
        const px = p.x + i
        const py = p.y + p.h - Math.min(1, v / max) * p.h
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.stroke()
    }

    const dashed = (p: { x: number; y: number; w: number; h: number }, v: number, max: number, color: string) => {
      const py = p.y + p.h - Math.min(1, v / max) * p.h
      ctx.setLineDash([3, 4])
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(p.x, py)
      ctx.lineTo(p.x + p.w, py)
      ctx.stroke()
      ctx.setLineDash([])
    }

    const h = histRef.current

    // ---- Plot 1: concentrations ----
    axis(P1, 'amounts')
    const eqB = (N * K) / (1 + K)
    dashed(P1, eqB, N, 'rgba(96,165,250,0.35)')
    dashed(P1, N - eqB, N, 'rgba(251,146,60,0.35)')
    trace(P1, h.a, N, ORANGE, 2)
    trace(P1, h.b, N, BLUE, 2)
    ctx.font = '10px monospace'
    ctx.fillStyle = ORANGE
    ctx.fillText('[A]', P1.x + P1.w - 54, P1.y + 12)
    ctx.fillStyle = BLUE
    ctx.fillText('[B]', P1.x + P1.w - 24, P1.y + 12)

    // ---- Plot 2: rates ----
    axis(P2, 'reaction rates')
    const rMax = Math.max(kf, kr) * N * 1.05
    trace(P2, h.rf, rMax, GOLD, 2)
    trace(P2, h.rr, rMax, VIOLET, 2)
    ctx.font = '10px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText('forward  k_f[A]', P2.x + 6, P2.y + 14)
    ctx.fillStyle = VIOLET
    ctx.fillText('reverse  k_r[B]', P2.x + 6, P2.y + 28)

    const rf = kf * nA
    const rr = kr * nB
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(`gap ${Math.abs(rf - rr).toFixed(3)}`, P2.x + P2.w - 84, P2.y + 14)

    ctx.fillStyle = GOLD
    ctx.font = 'bold 11px monospace'
    ctx.fillText(`K = ${K.toFixed(2)}`, P1.x + 6, P1.y + 14)

    return { nA, nB, rf, rr }
  }, [])

  const init = useCallback(
    (s: Start) => {
      molsRef.current = makeMols(s)
      histRef.current = { a: [], b: [], rf: [], rr: [] }
      setReadout({
        a: molsRef.current.filter(m => !m.b).length,
        b: molsRef.current.filter(m => m.b).length,
      })
      draw()
    },
    [draw]
  )

  useEffect(() => {
    init(start)
  }, [start, init])

  // Restarting the traces when K changes keeps the plot honest.
  useEffect(() => {
    histRef.current = { a: [], b: [], rf: [], rr: [] }
  }, [k])

  useEffect(() => {
    if (!running) return
    let frame = 0
    const tick = () => {
      const K = kRef.current
      const kf = BASE * K
      const kr = BASE
      molsRef.current.forEach(m => {
        m.x += m.vx
        m.y += m.vy
        if (m.x < VES.x + R) { m.x = VES.x + R; m.vx = -m.vx }
        if (m.x > VES.x + VES.w - R) { m.x = VES.x + VES.w - R; m.vx = -m.vx }
        if (m.y < VES.y + R) { m.y = VES.y + R; m.vy = -m.vy }
        if (m.y > VES.y + VES.h - R) { m.y = VES.y + VES.h - R; m.vy = -m.vy }
        if (m.flash > 0) m.flash -= 1
        // Each molecule independently interconverts; the ratio of the two
        // probabilities is what fixes K, not any molecule "stopping".
        const p = m.b ? kr : kf
        if (Math.random() < p) {
          m.b = !m.b
          m.flash = 12
        }
      })

      const r = draw()
      if (r) {
        const h = histRef.current
        h.a.push(r.nA)
        h.b.push(r.nB)
        h.rf.push(r.rf)
        h.rr.push(r.rr)
        if (h.a.length > MAXPTS) { h.a.shift(); h.b.shift(); h.rf.shift(); h.rr.shift() }
        frame += 1
        if (frame % 6 === 0) setReadout({ a: r.nA, b: r.nB })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    init(start)
  }

  const startBtn = (id: Start, label: string) => (
    <button
      key={id}
      onClick={() => setStart(id)}
      className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
        start === id ? 'bg-accent-teal/20 text-accent-teal' : 'text-text-muted hover:text-text-secondary'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · A &#8652; B reaching equilibrium</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: A &#8652; B reaching equilibrium. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-teal text-bg-base text-xs font-medium hover:bg-accent-teal/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-1 text-xs text-text-muted">
          <span className="mr-1">Start:</span>
          {startBtn('reactant', 'all A')}
          {startBtn('product', 'all B')}
          {startBtn('mixed', '50/50')}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>K:</span>
          <input
            type="range" min={SPEC.k.min} max={SPEC.k.max} step={SPEC.k.step} value={k}
            onChange={e => set('k', +e.target.value)}
            className="w-24 accent-accent-teal"
          />
          <span className="font-mono text-text-secondary">{k.toFixed(2)}</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          A {readout.a} · B {readout.b} · [B]/[A] = {readout.a > 0 ? (readout.b / readout.a).toFixed(2) : '∞'}
        </span>
      </div>
    </div>
  )
}
