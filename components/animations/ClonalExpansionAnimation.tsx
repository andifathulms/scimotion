'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360
const BG = '#0F0D0A'

const TEXT = 'rgba(245,240,232,0.85)'
const DIM = 'rgba(245,240,232,0.45)'

// Colour-coded clones. Clone 0 is the normal, healthy lineage (muted); each
// later clone is a driver-mutation sub-lineage that divides faster.
const CLONE_COLORS = [
  '#6B7280', // 0 normal — grey
  '#F472B6', // 1 first driver — pink (field accent)
  '#60A5FA', // 2 — blue
  '#A3E635', // 3 — lime
  '#F59E0B', // 4 — gold
  '#A78BFA', // 5 — violet
]
const CLONE_NAME = ['normal', 'driver-1', 'driver-2', 'driver-3', 'driver-4', 'driver-5']

// Each clone's relative division tendency (fitness). Higher = more likely to
// divide on a given generation. Normal cells are also capped in number.
const CLONE_FITNESS = [1.0, 1.5, 2.1, 2.8, 3.6, 4.5]

// A cell living in the tissue grid.
type Cell = {
  clone: number
  x: number // grid col
  y: number // grid row
}

// Deterministic PRNG so the whole run is reproducible (no Math.random).
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const COLS = 40
const ROWS = 24
const MAX_CELLS = COLS * ROWS
const NORMAL_CAP = 60 // contact-inhibited normal-tissue limit

// Generations at which a NEW driver mutation appears in some existing cell,
// seeded from a fixed schedule (deterministic — a counter, not chance).
const MUTATION_GENERATIONS = [3, 6, 9, 13, 18]

export function ClonalExpansionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [gen, setGen] = useState(0)
  const [count, setCount] = useState(1)
  const [clones, setClones] = useState(1)

  // Simulation state kept in refs (mutated in the loop, not per-render).
  const cellsRef = useRef<Cell[]>([])
  const occupiedRef = useRef<Set<number>>(new Set())
  const rngRef = useRef(mulberry32(1))
  const genRef = useRef(0)
  const nextCloneRef = useRef(1) // next clone id to introduce
  const highestCloneRef = useRef(0)

  const key = (x: number, y: number) => y * COLS + x

  const initSim = useCallback(() => {
    const cx = Math.floor(COLS / 2)
    const cy = Math.floor(ROWS / 2)
    cellsRef.current = [{ clone: 0, x: cx, y: cy }]
    occupiedRef.current = new Set([key(cx, cy)])
    rngRef.current = mulberry32(1)
    genRef.current = 0
    nextCloneRef.current = 1
    highestCloneRef.current = 0
    setGen(0)
    setCount(1)
    setClones(1)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)
    ctx.textBaseline = 'middle'

    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = '#F472B6'
    ctx.fillText('CLONAL EVOLUTION — natural selection inside a tissue', 14, 18)

    // Grid geometry.
    const gridTop = 34
    const gridH = 268
    const cw = W / COLS
    const ch = gridH / ROWS

    // Cells.
    const perClone = new Array(CLONE_COLORS.length).fill(0)
    for (const c of cellsRef.current) {
      perClone[c.clone] += 1
      ctx.fillStyle = CLONE_COLORS[c.clone]
      const px = c.x * cw
      const py = gridTop + c.y * ch
      ctx.fillRect(px + 0.5, py + 0.5, cw - 1, ch - 1)
    }

    // Legend at the bottom for clones present.
    ctx.font = '9px monospace'
    let lx = 14
    const ly = H - 12
    for (let i = 0; i <= highestCloneRef.current; i++) {
      if (perClone[i] === 0 && i !== 0) continue
      ctx.fillStyle = CLONE_COLORS[i]
      ctx.fillRect(lx, ly - 4, 8, 8)
      ctx.fillStyle = DIM
      const label = `${CLONE_NAME[i]} (${perClone[i]})`
      ctx.fillText(label, lx + 12, ly)
      lx += 12 + ctx.measureText(label).width + 16
    }
  }, [])

  useEffect(() => {
    draw()
  }, [draw])

  // Advance one generation of the tissue.
  const stepGen = useCallback(() => {
    const rng = rngRef.current
    genRef.current += 1
    const g = genRef.current

    // Introduce a scheduled driver mutation: pick an existing cell (highest
    // fitness clone available) and convert it to the new clone id.
    if (MUTATION_GENERATIONS.includes(g) && cellsRef.current.length > 0) {
      const cells = cellsRef.current
      // deterministic pick: index derived from generation and current count
      const pickIdx = (g * 7 + cells.length * 3) % cells.length
      const newClone = nextCloneRef.current
      if (newClone < CLONE_COLORS.length) {
        cells[pickIdx].clone = newClone
        nextCloneRef.current += 1
        highestCloneRef.current = Math.max(highestCloneRef.current, newClone)
      }
    }

    // Division pass. Iterate a snapshot; each cell may spawn into a free
    // neighbouring grid site with probability tied to its clone fitness.
    const snapshot = [...cellsRef.current]
    const occupied = occupiedRef.current
    const normalCount = snapshot.filter(c => c.clone === 0).length

    for (const cell of snapshot) {
      if (cellsRef.current.length >= MAX_CELLS) break
      const fit = CLONE_FITNESS[cell.clone]
      // Normal cells stop dividing past the contact-inhibition cap.
      if (cell.clone === 0 && normalCount >= NORMAL_CAP) continue
      // Fitness -> per-generation division chance.
      const chance = Math.min(0.95, fit / 5)
      if (rng() > chance) continue

      // Find a free neighbour (4-neighbourhood), deterministic order rotated
      // by a per-cell hash so growth is not always biased one way.
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
      const rot = (cell.x * 3 + cell.y * 5 + g) % 4
      let placed = false
      for (let d = 0; d < 4 && !placed; d++) {
        const [dx, dy] = dirs[(d + rot) % 4]
        const nx = cell.x + dx
        const ny = cell.y + dy
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
        const k = key(nx, ny)
        if (occupied.has(k)) continue
        occupied.add(k)
        cellsRef.current.push({ clone: cell.clone, x: nx, y: ny })
        placed = true
      }
    }

    // Update readouts.
    const total = cellsRef.current.length
    const present = new Set(cellsRef.current.map(c => c.clone))
    setGen(g)
    setCount(total)
    setClones(present.size)

    if (total >= MAX_CELLS || g >= 60) {
      setRunning(false)
    }
  }, [])

  useEffect(() => {
    if (!running) return
    let frame = 0
    const loop = () => {
      frame += 1
      if (frame % 6 === 0) {
        stepGen()
        draw()
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, stepGen, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Static frame: run the full simulation instantly to a final tumour.
        initSim()
        for (let i = 0; i < 40; i++) stepGen()
        draw()
        return
      }
      initSim()
      draw()
      setRunning(true)
    },
  })

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    initSim()
    draw()
    triggerReset()
  }

  // Seed an initial cell on first mount so the canvas is not empty.
  useEffect(() => {
    initSim()
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Clonal Evolution of a Tumour
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} className="w-full rounded-lg" style={{ background: BG }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          generation: <span style={{ color: TEXT }}>{gen}</span>
        </span>
        <span>
          cells: <span style={{ color: TEXT }}>{count}</span>
        </span>
        <span>
          distinct clones: <span style={{ color: '#F472B6' }}>{clones}</span>
        </span>
        <span style={{ color: DIM }}>faster clones out-divide the rest</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (!running && genRef.current >= 60) {
              initSim()
              draw()
            }
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <span className="ml-auto text-xs text-text-secondary">
          each colour = a clone; new drivers appear on a fixed schedule
        </span>
      </div>
    </div>
  )
}
