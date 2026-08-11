'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const LIME = '#A3E635'   // replicate that fixed the favoured allele
const PINK = '#F472B6'   // replicate that lost it
const GOLD = '#F59E0B'   // still segregating
const BLUE = '#60A5FA'   // diffusion theory
const VIOLET = '#A78BFA'

const REPLICATES = 30
const MAX_GENS = 300
const P0 = 0.5

const PX = 44
const PY = 34
const PW = 386
const PH = 228
const PANEL = 452

// Box–Muller, used to approximate the binomial sample when N is large enough
// that drawing N individual gametes every frame would stall the animation.
function gauss(): number {
  let u = 0
  while (u === 0) u = Math.random()
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// One Wright–Fisher generation for a haploid population of size N.
// Selection moves the expected frequency; the finite sample of N does the rest.
function stepGeneration(p: number, s: number, N: number): number {
  if (p <= 0) return 0
  if (p >= 1) return 1
  const mean = (p * (1 + s)) / (p * (1 + s) + (1 - p))
  let k: number
  if (N <= 120) {
    k = 0
    for (let i = 0; i < N; i++) if (Math.random() < mean) k++
  } else {
    const sd = Math.sqrt(N * mean * (1 - mean))
    k = Math.round(mean * N + gauss() * sd)
    if (k < 0) k = 0
    if (k > N) k = N
  }
  return k / N
}

// Kimura's diffusion result for the probability that a favoured allele starting
// at frequency p eventually fixes. As Ns → 0 it collapses to p — pure drift.
function fixationProbability(p: number, s: number, N: number): number {
  const a = 2 * N * s
  if (Math.abs(a) < 1e-6) return p
  return (1 - Math.exp(-a * p)) / (1 - Math.exp(-a))
}

type Run = { path: number[]; done: boolean }

function freshRuns(): Run[] {
  return Array.from({ length: REPLICATES }, () => ({ path: [P0], done: false }))
}

export function GeneticDriftAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const runsRef = useRef<Run[]>(freshRuns())

  const [running, setRunning] = useState(false)
  const [tick, setTick] = useState(0)

  const [popN, setPopN] = useState(25)
  const [sel, setSel] = useState(4)     // selection coefficient × 100

  const paramsRef = useRef({ N: 25, s: 0.04 })
  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        const runs = runsRef.current
        const cur = paramsRef.current
        while (runs[0].path.length < MAX_GENS) {
          for (const run of runs) {
            run.path.push(stepGeneration(run.path[run.path.length - 1], cur.s, cur.N))
          }
        }
        setTick(t => t + 1)
        return
      }
      setRunning(true)
    },
  })

  useEffect(() => {
    paramsRef.current = { N: popN, s: sel / 100 }
  }, [popN, sel])

  const s = sel / 100

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const runs = runsRef.current
    const gen = runs[0].path.length - 1

    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText(`${REPLICATES} REPLICATE POPULATIONS · SAME RULES, DIFFERENT LUCK`, PX, PY - 14)

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PX + 0.5, PY)
    ctx.lineTo(PX + 0.5, PY + PH)
    ctx.lineTo(PX + PW, PY + PH)
    ctx.stroke()

    ctx.font = '9px monospace'
    for (const [v, lab] of [[0, '0'], [0.5, '0.5'], [1, '1']] as Array<[number, string]>) {
      const y = PY + PH - v * PH
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(245,240,232,0.3)'
      ctx.fillText(lab, PX - 8, y + 3)
      ctx.strokeStyle = v === 0 ? 'transparent' : 'rgba(255,245,235,0.06)'
      ctx.beginPath()
      ctx.moveTo(PX, y)
      ctx.lineTo(PX + PW, y)
      ctx.stroke()
    }
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('generations →', PX + PW / 2, PY + PH + 18)
    ctx.textAlign = 'left'
    ctx.save()
    ctx.translate(14, PY + PH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('allele frequency p', 0, 0)
    ctx.restore()

    const xAt = (k: number) => PX + (k / (MAX_GENS - 1)) * PW
    const yAt = (v: number) => PY + PH - v * PH

    // Starting frequency
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    ctx.moveTo(PX, yAt(P0))
    ctx.lineTo(PX + PW, yAt(P0))
    ctx.stroke()
    ctx.setLineDash([])

    // Trajectories
    let fixed = 0
    let lost = 0
    for (const run of runs) {
      const path = run.path
      const end = path[path.length - 1]
      const isFixed = end >= 1
      const isLost = end <= 0
      if (isFixed) fixed++
      if (isLost) lost++
      ctx.beginPath()
      ctx.moveTo(xAt(0), yAt(path[0]))
      for (let k = 1; k < path.length; k++) ctx.lineTo(xAt(k), yAt(path[k]))
      ctx.strokeStyle = isFixed ? `${LIME}CC` : isLost ? `${PINK}99` : `${GOLD}CC`
      ctx.lineWidth = isFixed || isLost ? 1.1 : 1.6
      ctx.stroke()
    }
    const segregating = REPLICATES - fixed - lost

    // Mean expected trajectory under selection alone (no drift)
    let det = P0
    ctx.beginPath()
    ctx.moveTo(xAt(0), yAt(det))
    for (let k = 1; k <= Math.min(gen, MAX_GENS - 1); k++) {
      det = (det * (1 + s)) / (det * (1 + s) + (1 - det))
      ctx.lineTo(xAt(k), yAt(det))
    }
    ctx.strokeStyle = BLUE
    ctx.lineWidth = 1.4
    ctx.setLineDash([5, 3])
    ctx.stroke()
    ctx.setLineDash([])

    // ---- Right panel -------------------------------------------------------
    const cur = paramsRef.current
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PANEL - 16, 18)
    ctx.lineTo(PANEL - 16, H - 18)
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('OUTCOMES', PANEL, 34)

    const rows: Array<[string, number, string]> = [
      ['fixed', fixed, LIME],
      ['lost', lost, PINK],
      ['running', segregating, GOLD],
    ]
    rows.forEach(([label, count, color], i) => {
      const y = 54 + i * 30
      ctx.fillStyle = color
      ctx.fillRect(PANEL, y - 8, 8, 8)
      ctx.fillStyle = 'rgba(245,240,232,0.6)'
      ctx.font = '9px monospace'
      ctx.fillText(label, PANEL + 14, y)
      ctx.textAlign = 'right'
      ctx.fillStyle = color
      ctx.font = 'bold 11px monospace'
      ctx.fillText(String(count), W - 20, y)
      ctx.textAlign = 'left'
      const bw = W - 20 - PANEL
      ctx.fillStyle = 'rgba(255,245,235,0.07)'
      ctx.fillRect(PANEL, y + 6, bw, 5)
      ctx.fillStyle = `${color}CC`
      ctx.fillRect(PANEL, y + 6, (bw * count) / REPLICATES, 5)
    })

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('fixed fraction', PANEL, 162)
    ctx.font = 'bold 15px monospace'
    ctx.fillStyle = LIME
    ctx.fillText(`${((fixed / REPLICATES) * 100).toFixed(0)}%`, PANEL, 180)

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('theory  u(p)', PANEL, 200)
    ctx.fillStyle = BLUE
    ctx.font = 'bold 12px monospace'
    ctx.fillText(`${(fixationProbability(P0, cur.s, cur.N) * 100).toFixed(0)}%`, PANEL, 216)

    const twoNs = 2 * cur.N * cur.s
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText(`2Ns = ${twoNs.toFixed(2)}`, PANEL, 240)
    ctx.fillStyle = twoNs < 1 ? PINK : twoNs < 4 ? GOLD : LIME
    ctx.fillText(twoNs < 1 ? 'drift dominates' : twoNs < 4 ? 'drift + selection' : 'selection dominates', PANEL, 254)

    ctx.fillStyle = VIOLET
    ctx.fillText(`drift SD ≈ ${Math.sqrt(0.25 / cur.N).toFixed(3)}`, PANEL, 274)
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('per generation', PANEL, 286)

    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText(`gen ${gen}`, PX + PW, PY - 6)
    ctx.textAlign = 'left'
  }, [s])

  useEffect(() => {
    draw()
  }, [draw, tick])

  useEffect(() => {
    if (!running || !visible) return
    const loop = () => {
      const runs = runsRef.current
      const cur = paramsRef.current
      if (runs[0].path.length >= MAX_GENS) {
        setRunning(false)
        setTick(t => t + 1)
        return
      }
      for (let step = 0; step < 2 && runs[0].path.length < MAX_GENS; step++) {
        for (const run of runs) {
          const p = run.path[run.path.length - 1]
          run.path.push(stepGeneration(p, cur.s, cur.N))
        }
      }
      setTick(t => t + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, visible])

  const restart = useCallback(() => {
    runsRef.current = freshRuns()
    setTick(t => t + 1)
  }, [])

  // Changing N or s starts a clean experiment — comparing halves of a run under
  // different parameters would be meaningless.
  useEffect(() => {
    runsRef.current = freshRuns()
    setRunning(false)
    setTick(t => t + 1)
  }, [popN, sel])


  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    setPopN(25)
    setSel(4)
    paramsRef.current = { N: 25, s: 0.04 }
    runsRef.current = freshRuns()
    triggerReset()
    setTick(t => t + 1)
  }

  const done = runsRef.current[0].path.length >= MAX_GENS

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Drift vs selection</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Drift vs selection. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-x-4 gap-y-2">
        <button
          onClick={() => {
            if (done) restart()
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> {done ? 'Run again' : 'Run'}</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Pop size N</span>
          <input type="range" min={5} max={1000} step={5} value={popN}
            onChange={e => setPopN(+e.target.value)}
            className="w-32 accent-accent-violet" />
          <span className="font-mono text-text-secondary w-10">{popN}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Selection s</span>
          <input type="range" min={0} max={20} step={1} value={sel}
            onChange={e => setSel(+e.target.value)}
            className="w-24 accent-accent-gold" />
          <span className="font-mono text-text-secondary w-10">{(sel / 100).toFixed(2)}</span>
        </label>
      </div>
    </div>
  )
}
