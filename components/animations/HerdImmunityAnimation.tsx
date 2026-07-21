'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw, Zap } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const COLS = 30
const ROWS = 12
const CELL = 18
const X0 = Math.round((W - COLS * CELL) / 2)
const Y0 = 52

const N = COLS * ROWS
const NEIGHBOURS = 8          // Moore neighbourhood: each person has 8 contacts
const FRAMES_PER_GEN = 9
const MAX_GEN = 400

const C_INF = '#F472B6'   // pink   — currently infectious
const C_REC = '#A78BFA'   // violet — infected and recovered
const C_VAX = '#10B981'   // green  — immunised
const C_SUS = '#60A5FA'   // blue   — susceptible
const C_MARK = '#F59E0B'  // gold   — threshold / protected highlight

const SUSCEPTIBLE = 0
const INFECTIOUS = 1
const RECOVERED = 2
const VACCINATED = 3

type Stats = { infected: number; susceptible: number; gen: number; done: boolean }

const EMPTY_STATS: Stats = { infected: 0, susceptible: 0, gen: 0, done: false }

export function HerdImmunityAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const gridRef = useRef<Uint8Array>(new Uint8Array(N))
  const frameRef = useRef(0)
  const genRef = useRef(0)

  const [coverage, setCoverage] = useState(0.4)
  const [r0, setR0] = useState(4)
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)

  const threshold = r0 > 1 ? 1 - 1 / r0 : 0
  const protectedByHerd = coverage >= threshold

  const collect = useCallback((done: boolean): Stats => {
    const g = gridRef.current
    let infected = 0
    let susceptible = 0
    for (let i = 0; i < N; i++) {
      if (g[i] === RECOVERED || g[i] === INFECTIOUS) infected++
      else if (g[i] === SUSCEPTIBLE) susceptible++
    }
    return { infected, susceptible, gen: genRef.current, done }
  }, [])

  // Lay out a fresh population: immunise a random `coverage` fraction, then drop
  // a single index case into one of the remaining susceptibles.
  const build = useCallback((cov: number) => {
    const g = new Uint8Array(N)
    const order = Array.from({ length: N }, (_, i) => i)
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const t = order[i]
      order[i] = order[j]
      order[j] = t
    }
    const nVax = Math.round(cov * N)
    for (let k = 0; k < nVax; k++) g[order[k]] = VACCINATED
    for (let k = nVax; k < N; k++) {
      if (g[order[k]] === SUSCEPTIBLE) {
        g[order[k]] = INFECTIOUS
        break
      }
    }
    gridRef.current = g
    genRef.current = 0
    frameRef.current = 0
  }, [])

  // One generation: every infectious individual tries each of its 8 contacts with
  // probability p = R0 / 8, then recovers. Only susceptibles can be infected, so
  // immunised neighbours simply break the chain.
  const step = useCallback((): boolean => {
    const g = gridRef.current
    const next = Uint8Array.from(g)
    const p = Math.min(1, r0 / NEIGHBOURS)
    let anyInfectious = false

    for (let idx = 0; idx < N; idx++) {
      if (g[idx] !== INFECTIOUS) continue
      const r = Math.floor(idx / COLS)
      const c = idx % COLS
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const nr = r + dr
          const nc = c + dc
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue
          const nIdx = nr * COLS + nc
          if (g[nIdx] !== SUSCEPTIBLE) continue
          if (Math.random() < p) {
            next[nIdx] = INFECTIOUS
            anyInfectious = true
          }
        }
      }
      next[idx] = RECOVERED
    }

    gridRef.current = next
    genRef.current += 1
    return anyInfectious
  }, [r0])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    const g = gridRef.current

    // Header: coverage vs the computed herd-immunity threshold
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('coverage', X0, 18)
    ctx.fillText('threshold  1 − 1/R₀', X0 + 190, 18)

    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = protectedByHerd ? C_VAX : C_INF
    ctx.fillText(`${(coverage * 100).toFixed(0)}%`, X0, 36)
    ctx.fillStyle = C_MARK
    ctx.fillText(`${(threshold * 100).toFixed(0)}%`, X0 + 190, 36)

    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    ctx.fillStyle = protectedByHerd ? C_VAX : C_INF
    ctx.fillText(
      protectedByHerd ? 'above threshold — chains die out' : 'below threshold — chains keep going',
      X0 + COLS * CELL,
      36
    )

    // Population grid
    for (let idx = 0; idx < N; idx++) {
      const x = X0 + (idx % COLS) * CELL
      const y = Y0 + Math.floor(idx / COLS) * CELL
      const s = g[idx]
      const done = stats.done

      let fill = 'rgba(96,165,250,0.16)'
      let stroke = `${C_SUS}44`
      if (s === INFECTIOUS) { fill = C_INF; stroke = C_INF }
      else if (s === RECOVERED) { fill = `${C_REC}66`; stroke = `${C_REC}99` }
      else if (s === VACCINATED) { fill = `${C_VAX}33`; stroke = `${C_VAX}88` }

      ctx.beginPath()
      ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.32, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = stroke
      ctx.stroke()

      // Once the outbreak is over, ring the unvaccinated people who never got it.
      if (done && s === SUSCEPTIBLE) {
        ctx.beginPath()
        ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.46, 0, Math.PI * 2)
        ctx.strokeStyle = C_MARK
        ctx.lineWidth = 1.25
        ctx.stroke()
      }
    }

    // Legend + tallies
    const gy = Y0 + ROWS * CELL + 18
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    const legend: [string, string][] = [
      [C_SUS, 'susceptible'],
      [C_INF, 'infectious'],
      [C_REC, 'infected'],
      [C_VAX, 'immunised'],
    ]
    let lx = X0
    for (const [color, label] of legend) {
      ctx.beginPath()
      ctx.arc(lx + 4, gy - 3, 4, 0, Math.PI * 2)
      ctx.fillStyle = `${color}66`
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.55)'
      ctx.fillText(label, lx + 12, gy)
      lx += 16 + ctx.measureText(label).width + 14
    }

    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    const pct = ((stats.infected / N) * 100).toFixed(0)
    ctx.fillText(
      `generation ${stats.gen} · infected ${stats.infected}/${N} (${pct}%)`,
      X0 + COLS * CELL,
      gy
    )

    if (stats.done && stats.susceptible > 0) {
      ctx.fillStyle = C_MARK
      ctx.textAlign = 'right'
      ctx.fillText(`${stats.susceptible} unvaccinated and never infected (ringed)`, X0 + COLS * CELL, gy + 13)
      ctx.textAlign = 'left'
    }
  }, [coverage, threshold, protectedByHerd, stats])

  useEffect(() => { draw() }, [draw])

  // Rebuild whenever the population parameters change.
  useEffect(() => {
    setRunning(false)
    build(coverage)
    setStats(collect(false))
  }, [coverage, r0, build, collect])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        for (let k = 0; k < MAX_GEN; k++) if (!step()) break
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
        const alive = step()
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
  }, [running, step, collect])

  const reseed = () => {
    cancelAnimationFrame(rafRef.current)
    build(coverage)
    setStats(collect(false))
    setRunning(true)
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    setCoverage(0.4)
    setR0(4)
    build(0.4)
    setStats(collect(false))
    triggerReset()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Herd Immunity Threshold</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={reseed}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          <Zap size={12} /> Introduce a case
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>coverage:</span>
          <input type="range" min={0} max={0.95} step={0.05} value={coverage}
            onChange={e => setCoverage(+e.target.value)}
            className="w-24 accent-accent-gold" />
          <span className="font-mono">{(coverage * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>R₀:</span>
          <input type="range" min={1.5} max={8} step={0.5} value={r0}
            onChange={e => setR0(+e.target.value)}
            className="w-20 accent-accent-gold" />
          <span className="font-mono">{r0.toFixed(1)}</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          need <strong className="text-text-primary">{(threshold * 100).toFixed(0)}%</strong> ·{' '}
          <span style={{ color: C_REC }}>infected {((stats.infected / N) * 100).toFixed(0)}%</span>
        </span>
      </div>
    </div>
  )
}
