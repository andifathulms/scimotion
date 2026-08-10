'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 322

const COLS = 30
const ROWS = 10
const CELL = 16
const X0 = Math.round((W - COLS * CELL) / 2)
const GRID_W = COLS * CELL
const Y0 = 66
const N = COLS * ROWS

const MIC_S = 2          // MIC of the susceptible majority (arbitrary units)
const MIC_R = 8          // MIC of the resistant mutant — the top of the window
const DOSE_MAX = 16
const DRUG_START = 4     // generations of drug-free growth before dosing begins
const MAX_GEN = 60
const FRAMES_PER_GEN = 7

const BASE_DEATH = 0.05
const GROW_S = 0.6
const GROW_R = 0.45      // resistance carries a fitness cost when the drug is absent

const EMPTY = 0
const SUS = 1
const RES = 2

const C_RES = '#F472B6'   // pink   — resistant
const C_SUS = '#60A5FA'   // blue   — susceptible
const C_DRUG = '#F59E0B'  // gold   — drug / above the window
const C_WIN = '#A78BFA'   // violet — the mutant selection window
const C_OK = '#10B981'    // green  — cleared

const AXIS_Y = 40
const CHART_TOP = 244
const CHART_H = 56
const BAR_W = GRID_W / MAX_GEN

type Stats = { gen: number; s: number; r: number; done: boolean }
const EMPTY_STATS: Stats = { gen: 0, s: N, r: 0, done: false }

// Probability a cell of a strain with the given MIC dies this generation.
function deathProb(conc: number, mic: number): number {
  if (conc < mic) return BASE_DEATH
  return BASE_DEATH + Math.min(0.9, 0.3 + 0.5 * (conc / mic - 1))
}

// At or above its MIC a strain cannot divide at all — that is what "minimum
// inhibitory concentration" means — so no regrowth fills the space it vacates.
function growthProb(conc: number, mic: number, base: number): number {
  return conc >= mic ? 0 : base
}

export function AntibioticResistanceAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const gridRef = useRef<Uint8Array>(new Uint8Array(N))
  const histRef = useRef<Array<{ s: number; r: number }>>([])
  const frameRef = useRef(0)
  const genRef = useRef(0)

  const [dose, setDose] = useState(4)
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)

  const inWindow = dose >= MIC_S && dose < MIC_R

  const collect = useCallback((done: boolean): Stats => {
    const g = gridRef.current
    let s = 0
    let r = 0
    for (let i = 0; i < N; i++) {
      if (g[i] === SUS) s++
      else if (g[i] === RES) r++
    }
    return { gen: genRef.current, s, r, done }
  }, [])

  // A full lawn of susceptibles with three pre-existing resistant mutants —
  // the mutants are there before the drug ever arrives.
  const build = useCallback(() => {
    const g = new Uint8Array(N)
    g.fill(SUS)
    let placed = 0
    while (placed < 3) {
      const i = Math.floor(Math.random() * N)
      if (g[i] !== RES) {
        g[i] = RES
        placed++
      }
    }
    gridRef.current = g
    genRef.current = 0
    frameRef.current = 0
    histRef.current = []
  }, [])

  // One generation: drug-dependent killing, then division of survivors into
  // whatever empty space the killing opened up.
  const step = useCallback(
    (conc: number): boolean => {
      const g = gridRef.current
      const drug = genRef.current >= DRUG_START ? conc : 0
      const dS = deathProb(drug, MIC_S)
      const dR = deathProb(drug, MIC_R)
      const gS = growthProb(drug, MIC_S, GROW_S)
      const gR = growthProb(drug, MIC_R, GROW_R)

      const afterDeath = Uint8Array.from(g)
      for (let i = 0; i < N; i++) {
        if (g[i] === SUS && Math.random() < dS) afterDeath[i] = EMPTY
        else if (g[i] === RES && Math.random() < dR) afterDeath[i] = EMPTY
      }

      const next = Uint8Array.from(afterDeath)
      for (let i = 0; i < N; i++) {
        if (afterDeath[i] !== EMPTY) continue
        const row = Math.floor(i / COLS)
        const col = i % COLS
        const parents: number[] = []
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue
            const nr = row + dr
            const nc = col + dc
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue
            const j = nr * COLS + nc
            if (afterDeath[j] !== EMPTY) parents.push(j)
          }
        }
        if (parents.length === 0) continue
        const p = parents[Math.floor(Math.random() * parents.length)]
        const strain = afterDeath[p]
        if (Math.random() < (strain === SUS ? gS : gR)) next[i] = strain
      }

      gridRef.current = next
      genRef.current += 1

      let s = 0
      let r = 0
      for (let i = 0; i < N; i++) {
        if (next[i] === SUS) s++
        else if (next[i] === RES) r++
      }
      histRef.current.push({ s, r })
      return s + r > 0
    },
    []
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    const g = gridRef.current

    // ---- Dose axis: the mutant selection window, drawn to scale ----
    const dx = (c: number) => X0 + (c / DOSE_MAX) * GRID_W
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'

    ctx.fillStyle = 'rgba(96,165,250,0.10)'
    ctx.fillRect(X0, AXIS_Y - 12, dx(MIC_S) - X0, 14)
    ctx.fillStyle = `${C_WIN}22`
    ctx.fillRect(dx(MIC_S), AXIS_Y - 12, dx(MIC_R) - dx(MIC_S), 14)
    ctx.fillStyle = `${C_OK}18`
    ctx.fillRect(dx(MIC_R), AXIS_Y - 12, X0 + GRID_W - dx(MIC_R), 14)

    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(X0, AXIS_Y + 2)
    ctx.lineTo(X0 + GRID_W, AXIS_Y + 2)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('nothing dies', X0 + 3, AXIS_Y - 2)
    ctx.fillStyle = C_WIN
    ctx.fillText('mutant selection window', dx(MIC_S) + 4, AXIS_Y - 2)
    ctx.fillStyle = C_OK
    ctx.fillText('both cleared', dx(MIC_R) + 4, AXIS_Y - 2)

    for (const [c, label] of [[MIC_S, 'MIC susceptible'], [MIC_R, 'MIC resistant']] as [number, string][]) {
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.35)'
      ctx.setLineDash([3, 3])
      ctx.moveTo(dx(c), AXIS_Y - 14)
      ctx.lineTo(dx(c), AXIS_Y + 6)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.fillText(label, dx(c) + 3, AXIS_Y + 15)
    }

    // Dose marker
    ctx.beginPath()
    ctx.strokeStyle = C_DRUG
    ctx.lineWidth = 2
    ctx.moveTo(dx(dose), AXIS_Y - 18)
    ctx.lineTo(dx(dose), AXIS_Y + 6)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(dx(dose), AXIS_Y - 18, 3, 0, Math.PI * 2)
    ctx.fillStyle = C_DRUG
    ctx.fill()

    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('dose →', X0, 16)
    ctx.textAlign = 'right'
    ctx.fillStyle = C_DRUG
    ctx.fillText(
      genRef.current >= DRUG_START ? `drug on · ${dose.toFixed(1)}` : `drug starts at generation ${DRUG_START}`,
      X0 + GRID_W,
      16
    )

    // ---- Population grid ----
    ctx.textAlign = 'left'
    for (let i = 0; i < N; i++) {
      const x = X0 + (i % COLS) * CELL
      const y = Y0 + Math.floor(i / COLS) * CELL
      const s = g[i]
      if (s === EMPTY) {
        ctx.beginPath()
        ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.16, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(245,240,232,0.06)'
        ctx.fill()
        continue
      }
      const color = s === RES ? C_RES : C_SUS
      ctx.beginPath()
      ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.33, 0, Math.PI * 2)
      ctx.fillStyle = s === RES ? `${color}CC` : `${color}44`
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = s === RES ? color : `${color}88`
      ctx.stroke()
    }

    // ---- Composition history ----
    const base = CHART_TOP + CHART_H
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.beginPath()
    ctx.moveTo(X0, base)
    ctx.lineTo(X0 + GRID_W, base)
    ctx.stroke()

    const hist = histRef.current
    for (let i = 0; i < hist.length && i < MAX_GEN; i++) {
      const x = X0 + i * BAR_W
      const hs = (hist[i].s / N) * CHART_H
      const hr = (hist[i].r / N) * CHART_H
      ctx.fillStyle = `${C_SUS}55`
      ctx.fillRect(x, base - hs, BAR_W - 0.5, hs)
      ctx.fillStyle = C_RES
      ctx.fillRect(x, base - hs - hr, BAR_W - 0.5, hr)
    }

    // Marker for the generation the drug arrives
    const dxDrug = X0 + DRUG_START * BAR_W
    ctx.beginPath()
    ctx.strokeStyle = `${C_DRUG}99`
    ctx.setLineDash([3, 3])
    ctx.moveTo(dxDrug, CHART_TOP - 10)
    ctx.lineTo(dxDrug, base)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = C_DRUG
    ctx.font = '9px monospace'
    ctx.fillText('drug', dxDrug + 3, CHART_TOP - 12)

    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('population composition, generation by generation', X0, CHART_TOP - 12)

    // ---- Legend / tallies ----
    const ly = Y0 + ROWS * CELL + 18
    const legend: [string, string][] = [
      [C_SUS, 'susceptible'],
      [C_RES, 'resistant mutant'],
    ]
    let lx = X0
    for (const [color, label] of legend) {
      ctx.beginPath()
      ctx.arc(lx + 4, ly - 3, 4, 0, Math.PI * 2)
      ctx.fillStyle = `${color}88`
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.55)'
      ctx.fillText(label, lx + 12, ly)
      lx += 16 + ctx.measureText(label).width + 14
    }

    const live = stats.s + stats.r
    const pct = live > 0 ? Math.round((stats.r / live) * 100) : 0
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(
      `generation ${stats.gen} · alive ${live}/${N} · resistant ${pct}%`,
      X0 + GRID_W,
      ly
    )

    if (stats.done) {
      ctx.fillStyle = live === 0 ? C_OK : pct >= 90 ? C_RES : 'rgba(245,240,232,0.55)'
      ctx.fillText(
        live === 0
          ? 'population cleared — no survivors to select from'
          : pct >= 90
            ? 'the resistant strain has taken over'
            : 'susceptibles still dominate',
        X0 + GRID_W,
        ly + 13
      )
    }
    ctx.textAlign = 'left'
  }, [dose, stats])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    setRunning(false)
    build()
    setStats(collect(false))
  }, [dose, build, collect])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        for (let k = 0; k < MAX_GEN; k++) if (!step(dose)) break
        setStats(collect(true))
        return
      }
      setRunning(true)
    },
  })

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(rafRef.current)
      return
    }
    const tick = () => {
      frameRef.current += 1
      if (frameRef.current % FRAMES_PER_GEN === 0) {
        const alive = step(dose)
        if (!alive || genRef.current >= MAX_GEN) {
          setStats(collect(true))
          setRunning(false)
          return
        }
        setStats(collect(false))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, collect, dose])

  const replay = () => {
    cancelAnimationFrame(rafRef.current)
    build()
    setStats(collect(false))
    setRunning(true)
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    setDose(4)
    build()
    setStats(collect(false))
    triggerReset()
  }

  const live = stats.s + stats.r
  const pct = live > 0 ? Math.round((stats.r / live) * 100) : 0

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Selecting for resistance</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Selecting for resistance. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => (stats.done ? replay() : setRunning(r => !r))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {stats.done ? <><RotateCcw size={12} /> Run again</> : running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Dose:</span>
          <input
            type="range" min={0} max={DOSE_MAX} step={0.5} value={dose}
            onChange={e => setDose(+e.target.value)}
            className="w-32 accent-accent-pink"
          />
          <span className="text-text-secondary font-mono">{dose.toFixed(1)}</span>
        </label>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={
            inWindow
              ? { color: C_WIN, borderColor: `${C_WIN}44`, background: `${C_WIN}12` }
              : dose >= MIC_R
                ? { color: C_OK, borderColor: `${C_OK}44`, background: `${C_OK}12` }
                : { color: 'rgba(245,240,232,0.5)', borderColor: 'rgba(245,240,232,0.15)', background: 'rgba(245,240,232,0.04)' }
          }
        >
          {inWindow ? 'inside the selection window' : dose >= MIC_R ? 'above both MICs' : 'below both MICs'}
        </span>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          gen {stats.gen} · alive {live}/{N} · resistant {pct}%
        </span>
      </div>
    </div>
  )
}
