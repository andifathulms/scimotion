'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const COLS = 30
const ROWS = 9
const CELL = 15
const GRID_W = COLS * CELL
const X0 = Math.round((W - GRID_W) / 2)
const Y0 = 50
const N = COLS * ROWS

const CDIFF = 7 // the opportunist that resists the antibiotic
const N_CDIFF0 = 4 // rare at baseline

const ANTIBIOTIC_START = 4
const ANTIBIOTIC_END = 8
const MAX_GEN = 40
const FRAMES_PER_GEN = 6

const DEATH_COMMENSAL = 0.5 // broad-spectrum drug hits the diverse majority
const DEATH_CDIFF = 0.03 // ...but barely touches the resistant opportunist

// Six commensal "species", each a distinct colour, plus the red opportunist.
const SPECIES = [
  '#60A5FA', // blue
  '#34D399', // green
  '#A78BFA', // violet
  '#FBBF24', // amber
  '#F472B6', // pink
  '#22D3EE', // cyan
]
const C_CDIFF = '#DC2626'
const LIME = '#A3E635'
const H_MAX = Math.log(7)

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Mode = 'recovery' | 'dysbiosis'

type Stats = {
  gen: number
  species: number
  diversity: number // normalised Shannon index 0..1
  cdiff: number // fraction of the community that is C. difficile
  live: number
  done: boolean
}

function collect(g: Uint8Array, gen: number, done: boolean): Stats {
  const counts = new Array(8).fill(0)
  let live = 0
  for (let i = 0; i < N; i++) {
    const s = g[i]
    if (s === 0) continue
    counts[s]++
    live++
  }
  let species = 0
  let hSum = 0
  for (let s = 1; s <= 7; s++) {
    if (counts[s] === 0) continue
    species++
    const p = counts[s] / live
    hSum -= p * Math.log(p)
  }
  const diversity = live > 0 ? hSum / H_MAX : 0
  const cdiff = live > 0 ? counts[CDIFF] / live : 0
  return { gen, species, diversity, cdiff, live, done }
}

export function MicrobiomeBalanceAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const gridRef = useRef<Uint8Array>(new Uint8Array(N))
  const rngRef = useRef<() => number>(mulberry32(1))
  const frameRef = useRef(0)
  const genRef = useRef(0)

  const [mode, setMode] = useState<Mode>('recovery')
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<Stats>({ gen: 0, species: 7, diversity: 1, cdiff: 0, live: N, done: false })

  const modeRef = useRef<Mode>(mode)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  // A full, diverse gut community with a small resident population of C. diff.
  const build = useCallback(() => {
    const rng = mulberry32(0x5eed)
    const g = new Uint8Array(N)
    for (let i = 0; i < N; i++) g[i] = 1 + Math.floor(rng() * SPECIES.length)
    let placed = 0
    while (placed < N_CDIFF0) {
      const i = Math.floor(rng() * N)
      if (g[i] !== CDIFF) {
        g[i] = CDIFF
        placed++
      }
    }
    gridRef.current = g
    rngRef.current = rng
    genRef.current = 0
    frameRef.current = 0
  }, [])

  // One generation. Antibiotic phase: kill the susceptible majority. Outcome
  // phase: empty niches are recolonised — by diverse commensals (recovery) or
  // by the opportunist filling the vacancy (dysbiosis).
  const step = useCallback((m: Mode) => {
    const g = gridRef.current
    const rng = rngRef.current
    const gen = genRef.current
    const next = Uint8Array.from(g)

    if (gen >= ANTIBIOTIC_START && gen < ANTIBIOTIC_END) {
      for (let i = 0; i < N; i++) {
        const s = g[i]
        if (s === 0) continue
        if (s === CDIFF) {
          if (rng() < DEATH_CDIFF) next[i] = 0
        } else if (rng() < DEATH_COMMENSAL) {
          next[i] = 0
        }
      }
    } else if (gen >= ANTIBIOTIC_END) {
      const gComm = m === 'recovery' ? 0.5 : 0.03
      const gCdiff = m === 'recovery' ? 0.04 : 0.5
      for (let i = 0; i < N; i++) {
        if (g[i] !== 0) continue
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
            if (g[j] !== 0) parents.push(j)
          }
        }
        if (parents.length === 0) continue
        const strain = g[parents[Math.floor(rng() * parents.length)]]
        const prob = strain === CDIFF ? gCdiff : gComm
        if (rng() < prob) next[i] = strain
      }
    }

    gridRef.current = next
    genRef.current += 1
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    const g = gridRef.current
    const gen = genRef.current

    // ---- Header ----
    ctx.font = '11px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('gut microbial community', X0, 22)

    const phase =
      gen < ANTIBIOTIC_START
        ? 'baseline'
        : gen < ANTIBIOTIC_END
          ? 'broad-spectrum antibiotic'
          : modeRef.current === 'recovery'
            ? 'recolonising · diversity returns'
            : 'C. difficile overgrowth'
    ctx.textAlign = 'right'
    ctx.fillStyle = gen >= ANTIBIOTIC_START && gen < ANTIBIOTIC_END ? '#FBBF24' : modeRef.current === 'dysbiosis' && gen >= ANTIBIOTIC_END ? C_CDIFF : LIME
    ctx.fillText(phase, X0 + GRID_W, 22)
    ctx.textAlign = 'left'

    // ---- Community grid ----
    for (let i = 0; i < N; i++) {
      const x = X0 + (i % COLS) * CELL
      const y = Y0 + Math.floor(i / COLS) * CELL
      const s = g[i]
      const cx = x + CELL / 2
      const cy = y + CELL / 2
      if (s === 0) {
        ctx.beginPath()
        ctx.arc(cx, cy, CELL * 0.13, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(245,240,232,0.06)'
        ctx.fill()
        continue
      }
      const isCdiff = s === CDIFF
      const color = isCdiff ? C_CDIFF : SPECIES[s - 1]
      ctx.beginPath()
      ctx.arc(cx, cy, CELL * 0.34, 0, Math.PI * 2)
      ctx.fillStyle = isCdiff ? color : `${color}AA`
      ctx.fill()
      if (isCdiff) {
        ctx.lineWidth = 1
        ctx.strokeStyle = '#FCA5A5'
        ctx.stroke()
      }
    }

    // ---- Diversity meter ----
    const metaY = Y0 + ROWS * CELL + 22
    const barY = metaY + 6
    const barH = 12
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('diversity', X0, metaY)
    ctx.fillStyle = 'rgba(245,240,232,0.06)'
    ctx.fillRect(X0, barY, GRID_W, barH)
    const frac = Math.max(0, Math.min(1, stats.diversity))
    ctx.fillStyle = stats.cdiff > 0.4 ? C_CDIFF : LIME
    ctx.fillRect(X0, barY, GRID_W * frac, barH)
    ctx.strokeStyle = 'rgba(245,240,232,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(X0 + 0.5, barY + 0.5, GRID_W - 1, barH - 1)
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(`${(frac * 100).toFixed(0)}%`, X0 + GRID_W, metaY)
    ctx.textAlign = 'left'

    // ---- Legend ----
    const ly = barY + barH + 20
    let lx = X0
    for (let s = 0; s < SPECIES.length; s++) {
      ctx.beginPath()
      ctx.arc(lx + 4, ly - 3, 4, 0, Math.PI * 2)
      ctx.fillStyle = `${SPECIES[s]}AA`
      ctx.fill()
      lx += 12
    }
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('commensal species', lx + 4, ly)
    lx += 16 + ctx.measureText('commensal species').width + 20
    ctx.beginPath()
    ctx.arc(lx + 4, ly - 3, 4, 0, Math.PI * 2)
    ctx.fillStyle = C_CDIFF
    ctx.fill()
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('C. difficile (opportunist)', lx + 14, ly)
  }, [stats])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    build()
    setStats(collect(gridRef.current, 0, false))
  }, [build])

  const runToEnd = useCallback(
    (m: Mode) => {
      while (genRef.current < MAX_GEN) step(m)
      setStats(collect(gridRef.current, genRef.current, true))
    },
    [step]
  )

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        runToEnd(modeRef.current)
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
        step(modeRef.current)
        const done = genRef.current >= MAX_GEN
        setStats(collect(gridRef.current, genRef.current, done))
        if (done) {
          setRunning(false)
          return
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step])

  const replay = () => {
    cancelAnimationFrame(rafRef.current)
    build()
    setStats(collect(gridRef.current, 0, false))
    setRunning(true)
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    build()
    setStats(collect(gridRef.current, 0, false))
    triggerReset()
  }

  const state =
    stats.gen < ANTIBIOTIC_START
      ? 'balanced'
      : stats.gen < ANTIBIOTIC_END
        ? 'depleted by antibiotic'
        : stats.cdiff > 0.4
          ? 'dysbiotic'
          : stats.species >= 5
            ? 'recovered'
            : 'recovering'

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Microbiome balance. Values are reported below the diagram." ref={canvasRef} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>gen {stats.gen}</span>
        <span>species {stats.species}/7</span>
        <span>diversity {(stats.diversity * 100).toFixed(0)}%</span>
        <span>C. diff {(stats.cdiff * 100).toFixed(0)}%</span>
        <span style={{ color: state === 'dysbiotic' ? C_CDIFF : state === 'recovered' || state === 'balanced' ? LIME : undefined }}>
          {state}
        </span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => (stats.done ? replay() : running ? setRunning(false) : setRunning(true))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {stats.done ? (
            <>
              <RotateCcw size={12} /> Run again
            </>
          ) : running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Apply antibiotic
            </>
          )}
        </button>

        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span>outcome:</span>
          {(['recovery', 'dysbiosis'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="px-2 py-1 rounded-md border transition-colors"
              style={
                mode === m
                  ? { color: '#0F0D0A', background: m === 'dysbiosis' ? C_CDIFF : LIME, borderColor: 'transparent' }
                  : { color: 'rgba(245,240,232,0.55)', borderColor: 'rgba(245,240,232,0.15)' }
              }
            >
              {m}
            </button>
          ))}
        </div>

        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors ml-auto"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
    </div>
  )
}
