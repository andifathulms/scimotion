'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 322

// Dish (where the cells swim)
const DX = 20
const DY = 46
const DW = 560
const DH = 156

// Chart (carriage over time)
const CX = 44
const CY = 240
const CW = 536
const CH = 58

const N_CELLS = 60
const R = 5.5
const CONTACT = 17
const DIV_FRAMES = 22        // one division event every this many frames
const SAMPLE_FRAMES = 6
const HIST_MAX = 150
const MAX_FRAMES = HIST_MAX * SAMPLE_FRAMES

const C_PLASMID = '#F472B6'  // pink   — carries the resistance plasmid
const C_SP_A = '#60A5FA'     // blue   — species A
const C_SP_B = '#A78BFA'     // violet — species B
const C_PILUS = '#F59E0B'    // gold   — conjugation bridge
const C_GHOST = '#10B981'    // green  — the stored comparison run

type Cell = { x: number; y: number; vx: number; vy: number; sp: 0 | 1; p: boolean }
type Pilus = { ax: number; ay: number; bx: number; by: number; life: number }
type Stats = { frame: number; carriers: number; bCarriers: number; done: boolean }

const EMPTY_STATS: Stats = { frame: 0, carriers: 1, bCarriers: 0, done: false }

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  rate: { default: 1, min: 0.2, max: 2, step: 0.1 },
}

export function HorizontalTransferAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const cellsRef = useRef<Cell[]>([])
  const piliRef = useRef<Pilus[]>([])
  const frameRef = useRef(0)
  // One stored curve per mode, so the two can be compared directly.
  const curvesRef = useRef<{ hgt: number[]; vertical: number[] }>({ hgt: [], vertical: [] })

  const [conjugation, setConjugation] = useState(true)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('horizontal-transfer', SPEC)
  const { rate } = params
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)

  const tally = useCallback((done: boolean): Stats => {
    const cells = cellsRef.current
    let carriers = 0
    let bCarriers = 0
    for (const c of cells) {
      if (!c.p) continue
      carriers++
      if (c.sp === 1) bCarriers++
    }
    return { frame: frameRef.current, carriers, bCarriers, done }
  }, [])

  // A mixed community: half species A, half species B, with exactly one
  // species-A cell already carrying the resistance plasmid.
  const build = useCallback((mode: boolean) => {
    const cells: Cell[] = []
    for (let i = 0; i < N_CELLS; i++) {
      cells.push({
        x: DX + R + 2 + Math.random() * (DW - 2 * R - 4),
        y: DY + R + 2 + Math.random() * (DH - 2 * R - 4),
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        sp: i % 2 === 0 ? 0 : 1,
        p: false,
      })
    }
    cells[0].p = true
    cellsRef.current = cells
    piliRef.current = []
    frameRef.current = 0
    if (mode) curvesRef.current.hgt = []
    else curvesRef.current.vertical = []
  }, [])

  const step = useCallback(
    (mode: boolean, transferRate: number) => {
      const cells = cellsRef.current

      // Drift
      for (const c of cells) {
        c.x += c.vx
        c.y += c.vy
        if (c.x < DX + R) { c.x = DX + R; c.vx = -c.vx }
        if (c.x > DX + DW - R) { c.x = DX + DW - R; c.vx = -c.vx }
        if (c.y < DY + R) { c.y = DY + R; c.vy = -c.vy }
        if (c.y > DY + DH - R) { c.y = DY + DH - R; c.vy = -c.vy }
      }

      // Vertical inheritance. Under drug pressure carriers outgrow non-carriers,
      // so a division event replaces a random same-species cell with a copy of a
      // parent picked with a bias toward carriage. Daughters keep the parent's
      // plasmid — and, crucially, the parent's species.
      if (frameRef.current % DIV_FRAMES === 0 && frameRef.current > 0) {
        let total = 0
        for (const c of cells) total += c.p ? 1 : 0.25
        let pick = Math.random() * total
        let parent = cells[0]
        for (const c of cells) {
          pick -= c.p ? 1 : 0.25
          if (pick <= 0) { parent = c; break }
        }
        // The cell that makes way is a non-carrier: under drug pressure it is the
        // cells without the plasmid that are being lost.
        const sameSpecies = cells.filter(c => c.sp === parent.sp && c !== parent && !c.p)
        if (sameSpecies.length > 0) {
          const target = sameSpecies[Math.floor(Math.random() * sameSpecies.length)]
          target.p = parent.p
          target.x = Math.max(DX + R, Math.min(DX + DW - R, parent.x + (Math.random() - 0.5) * 14))
          target.y = Math.max(DY + R, Math.min(DY + DH - R, parent.y + (Math.random() - 0.5) * 14))
        }
      }

      // Horizontal transfer: any donor in contact with any recipient — same
      // species or not — can hand over a copy of the plasmid.
      if (mode) {
        const pTransfer = 0.03 * transferRate
        for (let i = 0; i < cells.length; i++) {
          if (!cells[i].p) continue
          for (let j = 0; j < cells.length; j++) {
            if (cells[j].p) continue
            const dx = cells[i].x - cells[j].x
            const dy = cells[i].y - cells[j].y
            if (dx * dx + dy * dy > CONTACT * CONTACT) continue
            if (Math.random() < pTransfer) {
              cells[j].p = true
              piliRef.current.push({ ax: cells[i].x, ay: cells[i].y, bx: cells[j].x, by: cells[j].y, life: 22 })
            }
          }
        }
      }

      for (const pl of piliRef.current) pl.life -= 1
      piliRef.current = piliRef.current.filter(pl => pl.life > 0)

      frameRef.current += 1

      if (frameRef.current % SAMPLE_FRAMES === 0) {
        let carriers = 0
        for (const c of cells) if (c.p) carriers++
        const curve = mode ? curvesRef.current.hgt : curvesRef.current.vertical
        if (curve.length < HIST_MAX) curve.push(carriers / N_CELLS)
      }
    },
    []
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'

    // Dish
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(DX, DY, DW, DH, 10)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText(conjugation ? 'conjugation ON — plasmid can jump between cells and between species' : 'vertical inheritance only — the plasmid moves only into daughter cells', DX, 18)
    ctx.textAlign = 'right'
    ctx.fillStyle = C_PLASMID
    ctx.fillText(`${Math.round((stats.carriers / N_CELLS) * 100)}% carry the resistance gene`, DX + DW, 18)
    ctx.textAlign = 'left'

    // Legend
    const legend: [string, string][] = [
      [C_SP_A, 'species A'],
      [C_SP_B, 'species B'],
      [C_PLASMID, 'carries plasmid'],
    ]
    let lx = DX
    for (const [color, label] of legend) {
      ctx.beginPath()
      ctx.arc(lx + 4, 34, 4, 0, Math.PI * 2)
      ctx.fillStyle = `${color}55`
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.fillText(label, lx + 12, 37)
      lx += 16 + ctx.measureText(label).width + 14
    }

    // Conjugation bridges
    for (const pl of piliRef.current) {
      ctx.beginPath()
      ctx.strokeStyle = `${C_PILUS}${pl.life > 11 ? 'CC' : '55'}`
      ctx.lineWidth = 1.5
      ctx.moveTo(pl.ax, pl.ay)
      ctx.lineTo(pl.bx, pl.by)
      ctx.stroke()
    }

    // Cells
    for (const c of cellsRef.current) {
      const outline = c.sp === 0 ? C_SP_A : C_SP_B
      ctx.beginPath()
      if (c.sp === 0) ctx.arc(c.x, c.y, R, 0, Math.PI * 2)
      else ctx.roundRect(c.x - R * 1.5, c.y - R * 0.7, R * 3, R * 1.4, R * 0.7)
      ctx.fillStyle = c.p ? `${C_PLASMID}77` : `${outline}22`
      ctx.fill()
      ctx.lineWidth = c.p ? 1.4 : 1
      ctx.strokeStyle = c.p ? C_PLASMID : `${outline}99`
      ctx.stroke()
      if (c.p) {
        // the plasmid itself: a small closed loop inside the cell
        ctx.beginPath()
        ctx.arc(c.x, c.y, 1.9, 0, Math.PI * 2)
        ctx.strokeStyle = '#FFE3F1'
        ctx.lineWidth = 0.9
        ctx.stroke()
      }
    }

    // ---- Chart ----
    const base = CY + CH
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(CX, CY - 4)
    ctx.lineTo(CX, base)
    ctx.lineTo(CX + CW, base)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.textAlign = 'right'
    ctx.fillText('100%', CX - 5, CY + 3)
    ctx.fillText('0', CX - 5, base + 3)
    ctx.textAlign = 'left'
    ctx.fillText('fraction of the community carrying the gene  ·  time →', CX + 4, CY - 8)

    const plot = (curve: number[], color: string, dashed: boolean) => {
      if (curve.length < 2) return
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.setLineDash(dashed ? [4, 4] : [])
      for (let i = 0; i < curve.length; i++) {
        const x = CX + (i / (HIST_MAX - 1)) * CW
        const y = base - curve[i] * CH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.setLineDash([])
    }

    const { hgt, vertical } = curvesRef.current
    plot(conjugation ? vertical : hgt, `${C_GHOST}99`, true)
    plot(conjugation ? hgt : vertical, C_PLASMID, false)

    const other = conjugation ? vertical : hgt
    if (other.length > 1) {
      const y = base - other[other.length - 1] * CH
      ctx.fillStyle = C_GHOST
      ctx.textAlign = 'right'
      ctx.fillText(conjugation ? 'vertical only (stored run)' : 'with conjugation (stored run)', CX + CW, y - 5)
      ctx.textAlign = 'left'
    }

    // Species-B carriage: the thing vertical inheritance can never produce
    ctx.textAlign = 'right'
    ctx.fillStyle = stats.bCarriers > 0 ? C_SP_B : 'rgba(245,240,232,0.4)'
    ctx.fillText(`species B carriers: ${stats.bCarriers}/${N_CELLS / 2}`, CX + CW, CY - 8)
    ctx.textAlign = 'left'
  }, [conjugation, stats])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    setRunning(false)
    build(conjugation)
    setStats(tally(false))
  }, [conjugation, build, tally])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        for (let k = 0; k < MAX_FRAMES; k++) step(conjugation, rate)
        setStats(tally(true))
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
      step(conjugation, rate)
      if (frameRef.current >= MAX_FRAMES) {
        setStats(tally(true))
        setRunning(false)
        return
      }
      setStats(tally(false))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, tally, conjugation, rate])

  const replay = () => {
    cancelAnimationFrame(rafRef.current)
    build(conjugation)
    setStats(tally(false))
    setRunning(true)
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    set('rate', 1)
    curvesRef.current = { hgt: [], vertical: [] }
    setConjugation(true)
    build(true)
    setStats(tally(false))
    triggerReset()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Horizontal gene transfer</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Horizontal gene transfer. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => (stats.done ? replay() : setRunning(r => !r))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {stats.done ? <><RotateCcw size={12} /> Run again</> : running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={() => setConjugation(v => !v)}
          className="px-2 py-1 rounded text-xs font-medium border transition-colors"
          style={
            conjugation
              ? { color: C_PLASMID, borderColor: `${C_PLASMID}44`, background: `${C_PLASMID}12` }
              : { color: 'rgba(245,240,232,0.5)', borderColor: 'rgba(245,240,232,0.15)', background: 'rgba(245,240,232,0.04)' }
          }
        >
          Conjugation {conjugation ? 'on' : 'off'}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Transfer rate:</span>
          <input
            type="range" min={SPEC.rate.min} max={SPEC.rate.max} step={SPEC.rate.step} value={rate}
            onChange={e => set('rate', +e.target.value)}
            className="w-24 accent-accent-pink"
            disabled={!conjugation}
          />
          <span className="text-text-secondary font-mono">×{rate.toFixed(1)}</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          carriers {stats.carriers}/{N_CELLS} · species B {stats.bCarriers}/{N_CELLS / 2}
        </span>
      </div>
    </div>
  )
}
