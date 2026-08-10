'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const PAD = 26
const TOP = 24
const GY = 244 // ground line
const ZONE_H = 20
const ALT_MAX = 16 // km drawn

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

const latX = (lat: number) => PAD + ((lat + 90) / 180) * (W - 2 * PAD)
const altY = (km: number) => GY - (km / ALT_MAX) * (GY - TOP)

type Cell = {
  name: string
  rise: number
  sink: number
  top: number
  color: string
  n: number
}

// Each cell is drawn as a loop that rises at `rise` and sinks at `sink`, so the
// Hadley and polar cells turn one way (thermally direct) and the Ferrel cell,
// sandwiched between them and driven by them, turns the other.
const CELLS: Cell[] = [
  { name: 'Hadley', rise: 0, sink: 30, top: 15, color: CYAN, n: 11 },
  { name: 'Ferrel', rise: 60, sink: 30, top: 9.5, color: VIOLET, n: 8 },
  { name: 'Polar', rise: 60, sink: 90, top: 7.5, color: BLUE, n: 7 },
  { name: 'Hadley', rise: 0, sink: -30, top: 15, color: CYAN, n: 11 },
  { name: 'Ferrel', rise: -60, sink: -30, top: 9.5, color: VIOLET, n: 8 },
  { name: 'Polar', rise: -60, sink: -90, top: 7.5, color: BLUE, n: 7 },
]

// Position on a cell loop at phase t. cx/rx are signed so the sense of rotation
// falls out of which edge is the rising branch.
function loopPoint(cell: Cell, t: number): { lat: number; km: number } {
  const cx = (cell.rise + cell.sink) / 2
  const rx = (cell.sink - cell.rise) / 2
  const ca = cell.top / 2
  const ra = (cell.top / 2) * 0.86
  return { lat: cx - rx * Math.cos(t), km: ca + ra * Math.sin(t) }
}

type Zone = { a: number; b: number; label: string; color: string }
const ZONES: Zone[] = [
  { a: -10, b: 10, label: 'rainforest', color: GREEN },
  { a: 15, b: 35, label: 'desert', color: GOLD },
  { a: -35, b: -15, label: 'desert', color: GOLD },
  { a: 40, b: 65, label: 'temperate', color: CYAN },
  { a: -65, b: -40, label: 'temperate', color: CYAN },
  { a: 70, b: 90, label: 'polar', color: BLUE },
  { a: -90, b: -70, label: 'polar', color: BLUE },
]

// Surface wind belts. `east` = air ends up blowing toward the east, i.e. out of
// the page in this cross-section.
type Belt = { a: number; b: number; label: string; east: boolean }
const BELTS: Belt[] = [
  { a: 3, b: 27, label: 'NE trades', east: false },
  { a: -27, b: -3, label: 'SE trades', east: false },
  { a: 33, b: 57, label: 'westerlies', east: true },
  { a: -57, b: -33, label: 'westerlies', east: true },
  { a: 63, b: 87, label: 'polar easterlies', east: false },
  { a: -87, b: -63, label: 'polar easterlies', east: false },
]

type Dot = { cell: number; t: number }

export function CirculationCellsAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const dotsRef = useRef<Dot[]>([])

  const [running, setRunning] = useState(false)
  const [coriolis, setCoriolis] = useState(true)
  const [zones, setZones] = useState(true)
  const coriolisRef = useRef(true)
  const zonesRef = useRef(true)

  useEffect(() => {
    coriolisRef.current = coriolis
  }, [coriolis])
  useEffect(() => {
    zonesRef.current = zones
  }, [zones])

  const seed = useCallback(() => {
    const out: Dot[] = []
    CELLS.forEach((c, i) => {
      for (let k = 0; k < c.n; k++) {
        out.push({ cell: i, t: (k / c.n) * Math.PI * 2 + Math.random() * 0.12 })
      }
    })
    dotsRef.current = out
  }, [])

  const step = useCallback(() => {
    for (const d of dotsRef.current) {
      // Bigger cells turn over more slowly, as they do in the real atmosphere.
      d.t += 0.016 * (10 / (CELLS[d.cell].top + 4))
      if (d.t > Math.PI * 2) d.t -= Math.PI * 2
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'

    // altitude gridlines
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    ctx.lineWidth = 1
    for (let km = 0; km <= 15; km += 5) {
      const y = altY(km)
      ctx.beginPath()
      ctx.moveTo(PAD, y)
      ctx.lineTo(W - PAD, y)
      ctx.stroke()
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(245,240,232,0.25)'
      ctx.fillText(`${km} km`, PAD + 2, y - 3)
      ctx.textAlign = 'center'
    }

    // vertical bands: rising air (wet) and sinking air (dry)
    const bands: [number, string, string][] = [
      [0, CYAN, 'rising'],
      [30, GOLD, 'sinking'],
      [-30, GOLD, 'sinking'],
      [60, CYAN, 'rising'],
      [-60, CYAN, 'rising'],
    ]
    for (const [lat, col] of bands) {
      const x = latX(lat)
      const grad = ctx.createLinearGradient(x - 14, 0, x + 14, 0)
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(0.5, col === CYAN ? 'rgba(34,211,238,0.13)' : 'rgba(245,158,11,0.13)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.fillRect(x - 14, TOP, 28, GY - TOP)
    }

    // cell outlines
    for (const c of CELLS) {
      ctx.beginPath()
      for (let i = 0; i <= 72; i++) {
        const p = loopPoint(c, (i / 72) * Math.PI * 2)
        const x = latX(p.lat)
        const y = altY(p.km)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = `${c.color}33`
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // circulating parcels, with a short tail showing the direction of travel
    for (const d of dotsRef.current) {
      const c = CELLS[d.cell]
      const p = loopPoint(c, d.t)
      const q = loopPoint(c, d.t - 0.34)
      ctx.beginPath()
      ctx.moveTo(latX(q.lat), altY(q.km))
      ctx.lineTo(latX(p.lat), altY(p.km))
      ctx.strokeStyle = `${c.color}88`
      ctx.lineWidth = 1.6
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(latX(p.lat), altY(p.km), 2.4, 0, Math.PI * 2)
      ctx.fillStyle = c.color
      ctx.fill()
    }

    // cell names
    const named: [string, number, number][] = [
      ['Hadley', 15, 16.6],
      ['Ferrel', 45, 11],
      ['Polar', 75, 9],
      ['Hadley', -15, 16.6],
      ['Ferrel', -45, 11],
      ['Polar', -75, 9],
    ]
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    for (const [label, lat, km] of named) {
      ctx.fillText(label, latX(lat), Math.max(TOP - 6, altY(km)))
    }

    // ground
    ctx.strokeStyle = 'rgba(245,240,232,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD, GY)
    ctx.lineTo(W - PAD, GY)
    ctx.stroke()

    // surface wind belts, just above the ground
    const wy = GY - 10
    for (const b of BELTS) {
      const x0 = latX(b.a)
      const x1 = latX(b.b)
      const mid = (x0 + x1) / 2
      const toward = b.a + b.b > 0 ? -1 : 1 // meridional sense: which way along x
      ctx.strokeStyle = 'rgba(245,240,232,0.3)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x0, wy)
      ctx.lineTo(x1, wy)
      ctx.stroke()

      if (coriolisRef.current) {
        // zonal component: dot = out of the page (eastward), cross = into it
        const col = b.east ? GREEN : GOLD
        ctx.beginPath()
        ctx.arc(mid, wy, 4, 0, Math.PI * 2)
        ctx.strokeStyle = col
        ctx.lineWidth = 1.2
        ctx.stroke()
        if (b.east) {
          ctx.beginPath()
          ctx.arc(mid, wy, 1.4, 0, Math.PI * 2)
          ctx.fillStyle = col
          ctx.fill()
        } else {
          ctx.beginPath()
          ctx.moveTo(mid - 2.6, wy - 2.6)
          ctx.lineTo(mid + 2.6, wy + 2.6)
          ctx.moveTo(mid + 2.6, wy - 2.6)
          ctx.lineTo(mid - 2.6, wy + 2.6)
          ctx.stroke()
        }
      } else {
        // no rotation: the surface return flow would be purely north-south
        const ax = mid + toward * 9
        ctx.strokeStyle = 'rgba(245,240,232,0.55)'
        ctx.beginPath()
        ctx.moveTo(mid - toward * 9, wy)
        ctx.lineTo(ax, wy)
        ctx.lineTo(ax - toward * 4, wy - 3)
        ctx.moveTo(ax, wy)
        ctx.lineTo(ax - toward * 4, wy + 3)
        ctx.stroke()
      }
    }

    // jet streams, at the tops of the boundaries between cells
    const jets: [number, number, string][] = [
      [30, 12, 'subtropical jet'],
      [-30, 12, 'subtropical jet'],
      [58, 9, 'polar jet'],
      [-58, 9, 'polar jet'],
    ]
    for (const [lat, km, label] of jets) {
      const x = latX(lat)
      const y = altY(km)
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(15,13,10,0.9)'
      ctx.fill()
      ctx.strokeStyle = GREEN
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x, y, 1.6, 0, Math.PI * 2)
      ctx.fillStyle = GREEN
      ctx.fill()
      if (lat > 0) {
        ctx.fillStyle = 'rgba(16,185,129,0.75)'
        ctx.fillText(label, x + 40, y + 3)
      }
    }

    // climate zone bar
    if (zonesRef.current) {
      ctx.fillStyle = 'rgba(255,245,235,0.04)'
      ctx.fillRect(PAD, GY + 4, W - 2 * PAD, ZONE_H)
      for (const z of ZONES) {
        const x0 = latX(z.a)
        const x1 = latX(z.b)
        ctx.fillStyle =
          z.color === GREEN
            ? 'rgba(16,185,129,0.3)'
            : z.color === GOLD
              ? 'rgba(245,158,11,0.32)'
              : z.color === CYAN
                ? 'rgba(34,211,238,0.22)'
                : 'rgba(96,165,250,0.24)'
        ctx.fillRect(x0, GY + 4, x1 - x0, ZONE_H)
        if (x1 - x0 > 34) {
          ctx.fillStyle = 'rgba(245,240,232,0.75)'
          ctx.fillText(z.label, (x0 + x1) / 2, GY + 4 + ZONE_H / 2 + 3)
        }
      }
    }

    // latitude axis
    const ticks: [number, string][] = [
      [-90, 'S pole'],
      [-60, '60S'],
      [-30, '30S'],
      [0, 'equator'],
      [30, '30N'],
      [60, '60N'],
      [90, 'N pole'],
    ]
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    for (const [t, label] of ticks) {
      const x = latX(t)
      ctx.strokeStyle = 'rgba(255,245,235,0.1)'
      ctx.beginPath()
      ctx.moveTo(x, GY + 4 + ZONE_H)
      ctx.lineTo(x, GY + 8 + ZONE_H)
      ctx.stroke()
      ctx.fillText(label, x, GY + 20 + ZONE_H)
    }

    // annotations
    ctx.fillStyle = 'rgba(34,211,238,0.8)'
    ctx.fillText('ITCZ — rising, wet', latX(0), TOP - 8)
    ctx.fillStyle = 'rgba(245,158,11,0.8)'
    ctx.fillText('subtropical high — sinking, dry', latX(30) + 4, altY(15.6))
    ctx.fillText('sinking, dry', latX(-30), altY(15.6))

    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText(
      coriolisRef.current
        ? 'surface winds:  ⊗ = blowing west   ⊙ = blowing east'
        : 'surface winds: no rotation — return flow is purely north–south',
      PAD,
      H - 8
    )
  }, [])

  const settle = useCallback(
    (n: number) => {
      for (let i = 0; i < n; i++) step()
    },
    [step]
  )

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        settle(60)
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    seed()
    draw()
  }, [seed, draw])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      step()
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  useEffect(() => {
    if (!running) draw()
  }, [coriolis, zones, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    setCoriolis(true)
    setZones(true)
    coriolisRef.current = true
    zonesRef.current = true
    seed()
    draw()
  }

  const toggleClass = (on: boolean) =>
    `px-2.5 py-1 rounded-lg border text-xs transition-colors ${
      on
        ? 'border-accent-cyan text-accent-cyan'
        : 'border-border text-text-muted hover:text-text-secondary'
    }`

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · The three-cell circulation
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
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Play
            </>
          )}
        </button>
        <button onClick={() => setCoriolis(v => !v)} className={toggleClass(coriolis)}>
          Coriolis deflection
        </button>
        <button onClick={() => setZones(v => !v)} className={toggleClass(zones)}>
          Climate zones
        </button>
        <span className="ml-auto text-xs text-text-secondary">
          schematic — <strong className="text-accent-cyan">not a model run</strong>
        </span>
      </div>
    </div>
  )
}
