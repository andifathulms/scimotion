'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300
const PLOT = { x: 48, y: 26, w: 540, h: 158 }
const PANEL = { x: 48, y: 208, w: 540, h: 84 }
const MAXPTS = PLOT.w

const ORANGE = '#FB923C'
const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

// A(g) ⇌ 2 B(g), endothermic forward (like N2O4 ⇌ 2 NO2, ΔH° ≈ +57 kJ/mol).
const DH = 57000
const RGAS = 8.314
const T0 = 298
const K0 = 1
const KR = 0.02 // reverse rate constant
const DT = 0.35

function Keq(T: number): number {
  return K0 * Math.exp((-DH / RGAS) * (1 / T - 1 / T0))
}

type Sys = { nA: number; nB: number; V: number; T: number }
type Marker = { pos: number; label: string; color: string }

export function LeChatelierAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const sysRef = useRef<Sys>({ nA: 1, nB: 1, V: 1, T: T0 })
  const histRef = useRef<{ a: number[]; b: number[] }>({ a: [], b: [] })
  const marksRef = useRef<Marker[]>([])

  const [running, setRunning] = useState(false)
  const [readout, setReadout] = useState({ a: 1, b: 1, q: 1, K: 1, T: T0, V: 1 })

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

    const s = sysRef.current
    const cA = s.nA / s.V
    const cB = s.nB / s.V
    const K = Keq(s.T)
    const Q = cA > 1e-6 ? (cB * cB) / cA : Infinity
    const h = histRef.current

    // ---- Concentration plot ----
    let yMax = 2
    for (let i = 0; i < h.a.length; i++) yMax = Math.max(yMax, h.a[i], h.b[i])
    yMax = Math.max(yMax, cA, cB) * 1.12

    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PLOT.x, PLOT.y)
    ctx.lineTo(PLOT.x, PLOT.y + PLOT.h)
    ctx.lineTo(PLOT.x + PLOT.w, PLOT.y + PLOT.h)
    ctx.stroke()

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('mol/L', PLOT.x - 40, PLOT.y + 4)
    ctx.fillText(yMax.toFixed(1), PLOT.x - 40, PLOT.y + 16)
    ctx.fillText('0', PLOT.x - 40, PLOT.y + PLOT.h)
    ctx.fillText('time →', PLOT.x + PLOT.w - 44, PLOT.y + PLOT.h + 14)

    // Perturbation markers
    marksRef.current.forEach(m => {
      const px = PLOT.x + m.pos
      ctx.setLineDash([2, 3])
      ctx.strokeStyle = 'rgba(255,245,235,0.22)'
      ctx.beginPath()
      ctx.moveTo(px, PLOT.y)
      ctx.lineTo(px, PLOT.y + PLOT.h)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = m.color
      ctx.font = '9px monospace'
      ctx.fillText(m.label, Math.min(px + 3, PLOT.x + PLOT.w - 62), PLOT.y + 10)
    })

    const trace = (data: number[], color: string) => {
      if (data.length < 2) return
      ctx.beginPath()
      data.forEach((v, i) => {
        const px = PLOT.x + i
        const py = PLOT.y + PLOT.h - Math.min(1, v / yMax) * PLOT.h
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()
    }
    trace(h.a, ORANGE)
    trace(h.b, BLUE)

    ctx.font = '10px monospace'
    ctx.fillStyle = ORANGE
    ctx.fillText(`[A] ${cA.toFixed(2)}`, PLOT.x + 6, PLOT.y + 12)
    ctx.fillStyle = BLUE
    ctx.fillText(`[B] ${cB.toFixed(2)}`, PLOT.x + 6, PLOT.y + 26)

    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText(`V = ${s.V.toFixed(2)} L    T = ${Math.round(s.T)} K`, PLOT.x + PLOT.w - 168, PLOT.y + 12)

    // ---- Q vs K panel ----
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.strokeRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h)

    const barMax = Math.max(Number.isFinite(Q) ? Q : K, K) * 1.2
    const barW = PANEL.w - 150
    const bar = (y: number, v: number, color: string, label: string, value: string) => {
      ctx.fillStyle = 'rgba(245,240,232,0.55)'
      ctx.font = 'bold 11px monospace'
      ctx.fillText(label, PANEL.x + 10, y + 9)
      ctx.strokeStyle = 'rgba(255,245,235,0.12)'
      ctx.strokeRect(PANEL.x + 34, y, barW, 10)
      ctx.fillStyle = color
      ctx.fillRect(PANEL.x + 34, y, barW * Math.min(1, (Number.isFinite(v) ? v : barMax) / barMax), 10)
      ctx.font = '11px monospace'
      ctx.fillText(value, PANEL.x + 44 + barW, y + 9)
    }

    bar(PANEL.y + 14, Q, GOLD, 'Q', Number.isFinite(Q) ? Q.toFixed(2) : '∞')
    bar(PANEL.y + 38, K, VIOLET, 'K', K.toFixed(2))

    const rel = Number.isFinite(Q) ? (Q - K) / K : 1
    let verdict = 'at equilibrium — Q = K, both directions running at equal rates'
    let vcolor = GREEN
    if (rel < -0.02) { verdict = 'Q < K  →  net forward, A converting to B'; vcolor = BLUE }
    else if (rel > 0.02) { verdict = 'Q > K  →  net reverse, B converting back to A'; vcolor = ORANGE }
    ctx.fillStyle = vcolor
    ctx.font = 'bold 11px monospace'
    ctx.fillText(verdict, PANEL.x + 10, PANEL.y + PANEL.h - 12)

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '9px monospace'
    ctx.fillText('K moves only with T', PANEL.x + PANEL.w - 118, PANEL.y - 6)

    return { cA, cB, Q, K }
  }, [])

  const push = useCallback((cA: number, cB: number) => {
    const h = histRef.current
    h.a.push(cA)
    h.b.push(cB)
    if (h.a.length > MAXPTS) {
      h.a.shift()
      h.b.shift()
      marksRef.current = marksRef.current
        .map(m => ({ ...m, pos: m.pos - 1 }))
        .filter(m => m.pos >= 0)
    }
  }, [])

  const init = useCallback(() => {
    sysRef.current = { nA: 1, nB: 1, V: 1, T: T0 }
    histRef.current = { a: [], b: [] }
    marksRef.current = []
    setReadout({ a: 1, b: 1, q: 1, K: 1, T: T0, V: 1 })
    draw()
  }, [draw])

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    if (!running) return
    let frame = 0
    const tick = () => {
      const s = sysRef.current
      const K = Keq(s.T)
      const kf = K * KR
      const cA = s.nA / s.V
      const cB = s.nB / s.V
      // Net forward rate of the elementary step A ⇌ 2B.
      const r = kf * cA - KR * cB * cB
      const dx = r * s.V * DT
      s.nA = Math.max(0.01, s.nA - dx)
      s.nB = Math.max(0.01, s.nB + 2 * dx)

      const res = draw()
      if (res) {
        push(res.cA, res.cB)
        frame += 1
        if (frame % 6 === 0) {
          setReadout({
            a: res.cA,
            b: res.cB,
            q: Number.isFinite(res.Q) ? res.Q : 0,
            K: res.K,
            T: s.T,
            V: s.V,
          })
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw, push])

  const perturb = (fn: (s: Sys) => void, label: string, color: string) => {
    fn(sysRef.current)
    marksRef.current.push({ pos: histRef.current.a.length, label, color })
    if (marksRef.current.length > 6) marksRef.current.shift()
    setRunning(true)
    draw()
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    init()
  }

  const btn = (label: string, onClick: () => void, tone: string) => (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${tone}`}
    >
      {label}
    </button>
  )

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Perturbing an equilibrium</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Perturbing an equilibrium. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-2">
        {btn('+ add A', () => perturb(s => { s.nA += 0.8 }, '+A', ORANGE), 'bg-accent-teal/15 text-accent-teal hover:bg-accent-teal/25')}
        {btn('− remove B', () => perturb(s => { s.nB = Math.max(0.05, s.nB - 0.7) }, '−B', BLUE), 'bg-accent-teal/15 text-accent-teal hover:bg-accent-teal/25')}
        {btn('compress ½V', () => perturb(s => { s.V = Math.max(0.25, s.V / 2) }, 'compress', GOLD), 'bg-accent-teal/15 text-accent-teal hover:bg-accent-teal/25')}
        {btn('expand 2V', () => perturb(s => { s.V = Math.min(4, s.V * 2) }, 'expand', GOLD), 'bg-accent-teal/15 text-accent-teal hover:bg-accent-teal/25')}
        {btn('heat +15 K', () => perturb(s => { s.T = Math.min(343, s.T + 15) }, 'heat', VIOLET), 'bg-accent-teal/15 text-accent-teal hover:bg-accent-teal/25')}
        {btn('cool −15 K', () => perturb(s => { s.T = Math.max(268, s.T - 15) }, 'cool', VIOLET), 'bg-accent-teal/15 text-accent-teal hover:bg-accent-teal/25')}
        <span className="ml-auto text-xs text-text-secondary font-mono">
          Q = {readout.q.toFixed(2)} · K = {readout.K.toFixed(2)} · {Math.round(readout.T)} K
        </span>
      </div>
    </div>
  )
}
