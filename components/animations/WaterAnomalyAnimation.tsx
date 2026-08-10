'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw, Snowflake, Droplet } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 640
const H = 380

// molecular box (left)
const BX0 = 14
const BY0 = 44
const BX1 = 384
const BY1 = 300

// right panel (density bars + floating beaker)
const RX = 402

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const ORANGE = '#FB923C'
const GREEN = '#10B981'

const RHO_LIQUID = 1.0 // g/cm³
const RHO_ICE = 0.917 // ice is ~9% less dense than liquid water

type Mol = { ix: number; iy: number; lx: number; ly: number; ph: number }

// Build an open hexagonal (honeycomb) lattice — the structure of ice. Molecules
// sit on hexagon vertices; the hexagon centres stay EMPTY, and that empty space
// is exactly why ice is less dense than the liquid it froze from.
function buildLattice(): { mols: Mol[]; edges: [number, number][] } {
  const R = 25
  const hsp = R * Math.sqrt(3)
  const vsp = R * 1.5
  const ox = 60
  const oy = 88
  const centers: [number, number][] = []
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      const cx = ox + c * hsp + (r % 2) * (hsp / 2)
      const cy = oy + r * vsp
      centers.push([cx, cy])
    }
  }

  const verts: [number, number][] = []
  const key = (x: number, y: number) => `${Math.round(x)},${Math.round(y)}`
  const index = new Map<string, number>()
  const hexVerts: number[][] = []

  for (const [cx, cy] of centers) {
    const ring: number[] = []
    for (let k = 0; k < 6; k++) {
      const ang = (Math.PI / 180) * (60 * k + 30)
      const vx = cx + R * Math.cos(ang)
      const vy = cy + R * Math.sin(ang)
      if (vx < BX0 + 10 || vx > BX1 - 10 || vy < BY0 + 12 || vy > BY1 - 12) {
        ring.push(-1)
        continue
      }
      const kk = key(vx, vy)
      let id = index.get(kk)
      if (id === undefined) {
        id = verts.length
        index.set(kk, id)
        verts.push([vx, vy])
      }
      ring.push(id)
    }
    hexVerts.push(ring)
  }

  const edgeSet = new Set<string>()
  const edges: [number, number][] = []
  for (const ring of hexVerts) {
    for (let k = 0; k < 6; k++) {
      const a = ring[k]
      const b = ring[(k + 1) % 6]
      if (a < 0 || b < 0) continue
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      const ek = `${lo}-${hi}`
      if (!edgeSet.has(ek)) {
        edgeSet.add(ek)
        edges.push([lo, hi])
      }
    }
  }

  // liquid target: pull each molecule partway toward its nearest hexagon centre,
  // collapsing molecules into the open holes so the liquid packs denser and
  // disordered. (Schematic — the real density change is 9%.)
  const mols: Mol[] = verts.map(([vx, vy], i) => {
    let best = 0
    let bd = Infinity
    centers.forEach(([cx, cy], ci) => {
      const d = (cx - vx) ** 2 + (cy - vy) ** 2
      if (d < bd) {
        bd = d
        best = ci
      }
    })
    const [ccx, ccy] = centers[best]
    const off = ((i * 2654435761) % 1000) / 1000 - 0.5
    const off2 = ((i * 40503) % 1000) / 1000 - 0.5
    const lx = vx + (ccx - vx) * 0.42 + off * 10
    const ly = vy + (ccy - vy) * 0.42 + off2 * 10
    return { ix: vx, iy: vy, lx, ly, ph: i * 1.3 }
  })

  return { mols, edges }
}

export function WaterAnomalyAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const latticeRef = useRef(buildLattice())
  const freezeRef = useRef(0) // 0 = liquid, 1 = ice
  const targetRef = useRef(0)
  const tickRef = useRef(0)
  const reducedRef = useRef(false)

  const [frozen, setFrozen] = useState(false)
  const [freezePct, setFreezePct] = useState(0)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      reducedRef.current = reduced
      if (reduced) {
        freezeRef.current = 1
        targetRef.current = 1
        setFrozen(true)
        setFreezePct(100)
      } else {
        targetRef.current = 1
        setFrozen(true)
      }
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const f = freezeRef.current
    const t = tickRef.current
    const { mols, edges } = latticeRef.current
    const rho = RHO_LIQUID - (RHO_LIQUID - RHO_ICE) * f
    const jitter = reducedRef.current ? 0 : 3.6 * (1 - f) + 0.7

    ctx.clearRect(0, 0, W, H)

    // ---- molecular box ----
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(BX0, BY0, BX1 - BX0, BY1 - BY0)

    // resolve live positions
    const px = new Float32Array(mols.length)
    const py = new Float32Array(mols.length)
    mols.forEach((m, i) => {
      const bx = m.lx + (m.ix - m.lx) * f
      const by = m.ly + (m.iy - m.ly) * f
      px[i] = bx + Math.sin(t * 0.08 + m.ph) * jitter
      py[i] = by + Math.cos(t * 0.07 + m.ph * 1.4) * jitter
    })

    // hydrogen bonds: fixed and taut in ice, transient and flickering in liquid
    edges.forEach(([a, b], ei) => {
      const flicker = (Math.sin(t * 0.14 + ei * 2.3) + 1) / 2
      const op = f * 0.85 + (1 - f) * flicker * 0.4
      if (op < 0.05) return
      ctx.beginPath()
      ctx.setLineDash(f > 0.5 ? [] : [2, 3])
      ctx.strokeStyle = `rgba(96,165,250,${op})`
      ctx.lineWidth = f > 0.5 ? 1.4 : 1
      ctx.moveTo(px[a], py[a])
      ctx.lineTo(px[b], py[b])
      ctx.stroke()
    })
    ctx.setLineDash([])

    // molecules: O (blue) with two H stubs — a bent water molecule
    mols.forEach((_, i) => {
      const x = px[i]
      const y = py[i]
      const base = i * 0.9 + (reducedRef.current ? 0 : t * 0.01)
      for (const da of [-0.911, 0.911]) {
        const hx = x + Math.cos(base + da) * 8
        const hy = y + Math.sin(base + da) * 8
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(245,240,232,0.35)'
        ctx.lineWidth = 1.2
        ctx.moveTo(x, y)
        ctx.lineTo(hx, hy)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(hx, hy, 2, 0, Math.PI * 2)
        ctx.fillStyle = GOLD
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fillStyle = BLUE
      ctx.fill()
    })

    ctx.font = 'bold 12px monospace'
    if (f > 0.65) {
      ctx.fillStyle = BLUE
      ctx.fillText('ICE · open hexagonal lattice — molecules farther apart', BX0, 30)
    } else if (f < 0.3) {
      ctx.fillStyle = ORANGE
      ctx.fillText('LIQUID · molecules jostle, packed closer', BX0, 30)
    } else {
      ctx.fillStyle = GOLD
      ctx.fillText(freezeRef.current < targetRef.current ? 'FREEZING…' : 'MELTING…', BX0, 30)
    }
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('blue links = hydrogen bonds · empty hexagon centres = wasted space', BX0, BY1 + 16)

    // ---- density comparison bars ----
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.fillText('density (g/cm³)', RX, 66)
    const barX = RX + 4
    const barMaxW = W - 20 - barX
    const bars: [string, number, string][] = [
      ['liquid', RHO_LIQUID, ORANGE],
      ['ice', RHO_ICE, BLUE],
    ]
    bars.forEach(([lab, val, col], i) => {
      const y = 80 + i * 26
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.font = '9px monospace'
      ctx.fillText(lab, barX, y - 3)
      ctx.strokeStyle = 'rgba(255,245,235,0.12)'
      ctx.lineWidth = 1
      ctx.strokeRect(barX, y, barMaxW, 11)
      ctx.fillStyle = col
      ctx.fillRect(barX, y, barMaxW * (val / 1.05), 11)
      ctx.fillStyle = 'rgba(15,13,10,0.9)'
      ctx.font = 'bold 9px monospace'
      ctx.fillText(val.toFixed(3), barX + 6, y + 9)
    })
    ctx.font = '9px monospace'
    ctx.fillStyle = GREEN
    ctx.fillText('ice is ~9% less dense → it floats', RX, 138)

    // ---- floating beaker ----
    const bxL = RX + 8
    const bxR = W - 20
    const wTop = 200 // waterline
    const bBot = BY1
    // beaker walls
    ctx.strokeStyle = 'rgba(255,245,235,0.25)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(bxL, 168)
    ctx.lineTo(bxL, bBot)
    ctx.lineTo(bxR, bBot)
    ctx.lineTo(bxR, 168)
    ctx.stroke()
    // water
    ctx.fillStyle = 'rgba(96,165,250,0.14)'
    ctx.fillRect(bxL + 1, wTop, bxR - bxL - 2, bBot - wTop - 1)
    ctx.strokeStyle = 'rgba(96,165,250,0.4)'
    ctx.beginPath()
    ctx.moveTo(bxL + 1, wTop)
    ctx.lineTo(bxR - 1, wTop)
    ctx.stroke()

    // ice block: floats with (1 - rho) of its height above the waterline
    if (f > 0.05) {
      const cubeH = 74
      const cubeW = 84
      const cubeCx = (bxL + bxR) / 2
      const above = (1 - rho) * cubeH
      const top = wTop - above
      ctx.globalAlpha = Math.min(1, f * 1.6)
      ctx.fillStyle = 'rgba(96,165,250,0.35)'
      ctx.strokeStyle = BLUE
      ctx.lineWidth = 1.5
      ctx.fillRect(cubeCx - cubeW / 2, top, cubeW, cubeH)
      ctx.strokeRect(cubeCx - cubeW / 2, top, cubeW, cubeH)
      ctx.fillStyle = BLUE
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('ICE', cubeCx, top + 15)
      ctx.font = '8px monospace'
      ctx.fillStyle = GREEN
      ctx.fillText(`${Math.round((1 - rho) * 100)}% above`, cubeCx, top - 4)
      ctx.textAlign = 'left'
      ctx.globalAlpha = 1
    }
  }, [])

  useEffect(() => {
    const tick = () => {
      // ease freeze toward target
      const target = targetRef.current
      freezeRef.current += (target - freezeRef.current) * (reducedRef.current ? 1 : 0.05)
      if (Math.abs(target - freezeRef.current) < 0.002) freezeRef.current = target
      tickRef.current += 1
      draw()
      if (tickRef.current % 5 === 0) setFreezePct(Math.round(freezeRef.current * 100))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const toggle = () => {
    const next = targetRef.current < 0.5 ? 1 : 0
    targetRef.current = next
    setFrozen(next === 1)
  }

  const reset = () => {
    targetRef.current = 0
    freezeRef.current = 0
    tickRef.current = 0
    setFrozen(false)
    setFreezePct(0)
    triggerReset()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Freeze water and watch it expand
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
          role="img"
          aria-label="Animated diagram: Freeze water and watch it expand. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {frozen ? <><Droplet size={12} /> Melt</> : <><Snowflake size={12} /> Freeze</>}
        </button>
        <span className="text-xs text-text-muted font-mono">
          {freezePct < 10 ? 'liquid' : freezePct > 90 ? 'ice' : `${freezePct}% frozen`}
        </span>
        <WidgetStatus className="ml-auto text-xs text-text-secondary font-mono">
          {(RHO_LIQUID - (RHO_LIQUID - RHO_ICE) * (freezePct / 100)).toFixed(3)} g/cm³
        </WidgetStatus>
      </div>
    </div>
  )
}
