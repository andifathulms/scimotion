'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 320

const GREEN = '#10B981'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const MUTED = 'rgba(245,240,232,0.4)'

// Deterministic PRNG so the "random" starting orientations are identical on
// every render — never Math.random().
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const COLS = 8
const ROWS = 5
const N = COLS * ROWS
const FIELD_DIR = 0 // aligned domains point right (+x)

// Grid geometry
const GX0 = 40
const GY0 = 40
const CELL = 46
const HALF = 15 // arrow half-length

type Domain = { base: number; angle: number }

function makeDomains(seed: number): Domain[] {
  const rnd = mulberry32(seed)
  const out: Domain[] = []
  for (let i = 0; i < N; i++) {
    const base = rnd() * Math.PI * 2
    out.push({ base, angle: base })
  }
  return out
}

// Shortest angular step from a to b.
function angleTo(a: number, b: number) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  field: { default: 0, min: 0, max: 1, step: 0.02 },
}

export function MagneticDomainAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const seedRef = useRef(1) // fixed starting seed; bumps deterministically on re-randomize
  const domainsRef = useRef<Domain[]>(makeDomains(1))
  const fieldRef = useRef(0) // 0 = no external field, 1 = saturating

  const { params, set, permalink, isDefault, restored } = useWidgetParams('magnetic-domain', SPEC)
  const { field } = params
  const [running, setRunning] = useState(false)
  const [netMag, setNetMag] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const doms = domainsRef.current
    const f = fieldRef.current

    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    // Compute net magnetization (average unit vector).
    let sx = 0
    let sy = 0
    for (const d of doms) {
      sx += Math.cos(d.angle)
      sy += Math.sin(d.angle)
    }
    sx /= N
    sy /= N
    const mag = Math.hypot(sx, sy) // 0..1

    // --- Domain grid ------------------------------------------------------
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const d = doms[r * COLS + c]
        const cx = GX0 + c * CELL + CELL / 2
        const cy = GY0 + r * CELL + CELL / 2
        // cell outline
        ctx.strokeStyle = 'rgba(245,240,232,0.08)'
        ctx.lineWidth = 1
        ctx.strokeRect(GX0 + c * CELL + 2, GY0 + r * CELL + 2, CELL - 4, CELL - 4)
        // alignment of this domain with the field direction (1 = aligned)
        const al = Math.cos(d.angle - FIELD_DIR)
        const col = al > 0.75 ? GREEN : al > 0.2 ? BLUE : 'rgba(245,240,232,0.55)'
        const dx = Math.cos(d.angle)
        const dy = Math.sin(d.angle)
        // arrow shaft
        ctx.strokeStyle = col
        ctx.lineWidth = 2.4
        ctx.beginPath()
        ctx.moveTo(cx - dx * HALF, cy - dy * HALF)
        ctx.lineTo(cx + dx * HALF, cy + dy * HALF)
        ctx.stroke()
        // arrow head
        const hx = cx + dx * HALF
        const hy = cy + dy * HALF
        const a = Math.atan2(dy, dx)
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.moveTo(hx, hy)
        ctx.lineTo(hx - 6 * Math.cos(a - 0.4), hy - 6 * Math.sin(a - 0.4))
        ctx.lineTo(hx - 6 * Math.cos(a + 0.4), hy - 6 * Math.sin(a + 0.4))
        ctx.closePath()
        ctx.fill()
      }
    }

    // --- External field arrows (top strip) --------------------------------
    ctx.font = '10px monospace'
    if (f > 0.02) {
      ctx.strokeStyle = GOLD
      ctx.fillStyle = GOLD
      ctx.lineWidth = 1.6
      const y = 26
      for (let i = 0; i < 6; i++) {
        const x0 = GX0 + 20 + i * 70
        ctx.globalAlpha = 0.3 + 0.6 * f
        ctx.beginPath()
        ctx.moveTo(x0, y)
        ctx.lineTo(x0 + 40, y)
        ctx.lineTo(x0 + 34, y - 4)
        ctx.moveTo(x0 + 40, y)
        ctx.lineTo(x0 + 34, y + 4)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      ctx.fillText('external field B_ext →', GX0, 18)
    } else {
      ctx.fillStyle = MUTED
      ctx.fillText('no external field — domains random', GX0, 18)
    }

    // --- Net magnetization bar (right side) -------------------------------
    const barX = GX0 + COLS * CELL + 26
    const barTop = GY0 + 8
    const barH = ROWS * CELL - 24
    ctx.strokeStyle = 'rgba(245,240,232,0.25)'
    ctx.lineWidth = 1
    ctx.strokeRect(barX, barTop, 22, barH)
    // fill proportional to net magnetization, direction shown by colour
    const fillH = mag * barH
    ctx.fillStyle = mag > 0.35 ? GREEN : mag > 0.12 ? BLUE : 'rgba(245,240,232,0.35)'
    ctx.fillRect(barX, barTop + (barH - fillH), 22, fillH)
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.font = '9px monospace'
    ctx.fillText('net M', barX - 4, barTop - 6)

    // net magnetization vector arrow, below the grid
    const ny = GY0 + ROWS * CELL + 30
    const ncx = W / 2
    ctx.strokeStyle = 'rgba(245,240,232,0.2)'
    ctx.beginPath()
    ctx.moveTo(GX0, ny)
    ctx.lineTo(GX0 + COLS * CELL - 6, ny)
    ctx.stroke()
    if (mag > 0.02) {
      const len = mag * (COLS * CELL - 6) * 0.5
      const ex = ncx + sx / (mag || 1) * len
      const ey = ny + sy / (mag || 1) * len
      ctx.strokeStyle = GOLD
      ctx.fillStyle = GOLD
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(ncx, ny)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      const a = Math.atan2(ey - ny, ex - ncx)
      ctx.beginPath()
      ctx.moveTo(ex, ey)
      ctx.lineTo(ex - 9 * Math.cos(a - 0.4), ey - 9 * Math.sin(a - 0.4))
      ctx.lineTo(ex - 9 * Math.cos(a + 0.4), ey - 9 * Math.sin(a + 0.4))
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.fillStyle = MUTED
      ctx.font = '10px monospace'
      ctx.fillText('net magnetization ≈ 0  (fields cancel)', ncx - 90, ny + 16)
    }

    return mag
  }, [])

  // Advance domain angles one step toward their targets.
  const step = useCallback(() => {
    const doms = domainsRef.current
    const f = fieldRef.current
    for (const d of doms) {
      // Target blends the domain's random base with the field direction.
      // Higher field → target pulled strongly toward alignment.
      const tx = (1 - f) * Math.cos(d.base) + f * Math.cos(FIELD_DIR)
      const ty = (1 - f) * Math.sin(d.base) + f * Math.sin(FIELD_DIR)
      const target = Math.atan2(ty, tx)
      d.angle += angleTo(d.angle, target) * 0.12
    }
  }, [])

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Static final frame: fully magnetized.
        fieldRef.current = 1
        set('field', 1)
        for (const d of domainsRef.current) d.angle = FIELD_DIR
        const m = draw()
        if (typeof m === 'number') setNetMag(m)
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    draw()
  }, [draw])

  // Keep the field ref in sync with the slider.
  useEffect(() => {
    fieldRef.current = field
  }, [field])

  useEffect(() => {
    if (!running || !visible) return
    const tick = () => {
      step()
      const m = draw()
      if (typeof m === 'number') setNetMag(m)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw, visible])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const magnetize = () => {
    set('field', 1)
    fieldRef.current = 1
    if (!running) setRunning(true)
  }

  // "Heat / hammer": re-randomize domains and drop the external field.
  const demagnetize = () => {
    seedRef.current += 1
    domainsRef.current = makeDomains(seedRef.current)
    set('field', 0)
    fieldRef.current = 0
    if (!running) setRunning(true)
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    seedRef.current = 1
    domainsRef.current = makeDomains(1)
    set('field', 0)
    fieldRef.current = 0
    const m = draw()
    if (typeof m === 'number') setNetMag(m)
  }

  const pct = Math.round(netMag * 100)
  const state = netMag > 0.6 ? 'magnetized' : netMag > 0.2 ? 'partly aligned' : 'demagnetized'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Domains align to magnetize iron
        </span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button
            onClick={reset}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas">
        <canvas
          role="img"
          aria-label="Animated diagram: Domains align to magnetize iron. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          net magnetization ={' '}
          <span style={{ color: GREEN }}>{pct}%</span>
        </span>
        <span>
          external field = <span style={{ color: GOLD }}>{Math.round(field * 100)}%</span>
        </span>
        <span>
          state: <span className="text-accent-blue">{state}</span>
        </span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={magnetize}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors text-bg-base"
          style={{ background: GREEN }}
        >
          <Play size={12} /> Apply field / magnetize
        </button>
        <button
          onClick={demagnetize}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <RotateCcw size={12} /> Heat / hammer (demagnetize)
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>External field:</span>
          <input
            type="range"
            min={SPEC.field.min}
            max={SPEC.field.max}
            step={SPEC.field.step}
            value={field}
            onChange={e => {
              set('field', +e.target.value)
              if (!running) setRunning(true)
            }}
            className="w-32"
            style={{ accentColor: GREEN }}
          />
        </label>
      </div>
    </div>
  )
}
