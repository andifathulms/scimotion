'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

// Present-day density parameters (Planck-ish).
const RHO_DE = 0.685 // dark energy — constant with expansion
const RHO_DM = 0.265 // dark matter — dilutes as 1/a^3
const RHO_B = 0.05 // ordinary matter — dilutes as 1/a^3

const A_MIN = 0.4
const A_MAX = 3.0
const A_TODAY = 1.0
const PLAY_SPEED = 0.42 // change in a per second while playing

type Share = { de: number; dm: number; b: number }

// Fractions of the energy budget at scale factor a.
function sharesAt(a: number): Share {
  const de = RHO_DE
  const dm = RHO_DM / (a * a * a)
  const b = RHO_B / (a * a * a)
  const tot = de + dm + b
  return { de: de / tot, dm: dm / tot, b: b / tot }
}

const COL_DE = '#818CF8' // dark energy (indigo)
const COL_DM = '#60A5FA' // dark matter (blue)
const COL_B = '#F59E0B' // ordinary matter (gold)

export function DarkEnergyBudgetAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number | null>(null)
  const aRef = useRef(A_TODAY)

  const [running, setRunning] = useState(false)
  const [a, setA] = useState(A_TODAY)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Static final frame: today's budget.
        aRef.current = A_TODAY
        setA(A_TODAY)
        return
      }
      setRunning(true)
    },
  })

  const setupCanvas = useCallback((ctx: CanvasRenderingContext2D) => {
    const canvas = canvasRef.current!
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const bw = Math.round(W * dpr)
    const bh = Math.round(H * dpr)
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw
      canvas.height = bh
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [])

  const draw = useCallback((av: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    setupCanvas(ctx)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    const s = sharesAt(av)

    // Donut chart on the left.
    const cx = 158
    const cy = 178
    const rOuter = 108
    const rInner = 52
    const segs: { frac: number; col: string }[] = [
      { frac: s.de, col: COL_DE },
      { frac: s.dm, col: COL_DM },
      { frac: s.b, col: COL_B },
    ]
    let start = -Math.PI / 2
    for (const seg of segs) {
      const end = start + seg.frac * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, rOuter, start, end)
      ctx.closePath()
      ctx.fillStyle = seg.col
      ctx.fill()
      start = end
    }
    // punch the hole
    ctx.fillStyle = '#0F0D0A'
    ctx.beginPath(); ctx.arc(cx, cy, rInner, 0, Math.PI * 2); ctx.fill()

    ctx.font = 'bold 15px monospace'
    ctx.fillStyle = COL_DE
    ctx.textAlign = 'center'
    ctx.fillText(`${Math.round(s.de * 100)}%`, cx, cy - 2)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.fillText('dark energy', cx, cy + 14)
    ctx.textAlign = 'left'

    // Title
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('The cosmic energy budget', 50, 34)

    // Legend / effect readout on the right.
    const rows = [
      {
        col: COL_DE, name: 'Dark energy', pct: s.de,
        tag: 'PUSHES', tagCol: '#818CF8',
        note: 'energy of space — accelerates expansion',
      },
      {
        col: COL_DM, name: 'Dark matter', pct: s.dm,
        tag: 'PULLS', tagCol: '#60A5FA',
        note: 'gravitating mass — holds galaxies together',
      },
      {
        col: COL_B, name: 'Ordinary matter', pct: s.b,
        tag: 'PULLS', tagCol: '#F59E0B',
        note: 'atoms — stars, gas, planets, you',
      },
    ]
    const lx = 306
    let ly = 70
    for (const row of rows) {
      ctx.fillStyle = row.col
      ctx.fillRect(lx, ly - 11, 14, 14)
      ctx.font = 'bold 13px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.9)'
      ctx.fillText(row.name, lx + 22, ly)
      ctx.font = 'bold 13px monospace'
      ctx.fillStyle = row.col
      const pctText = `${(row.pct * 100).toFixed(1)}%`
      ctx.fillText(pctText, W - 20 - ctx.measureText(pctText).width, ly)
      // effect tag
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = row.tagCol
      ctx.fillText(row.tag, lx + 22, ly + 16)
      ctx.font = '10px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.45)'
      ctx.fillText(row.note, lx + 22, ly + 30)
      ly += 58
    }

    // Opposite-roles reminder.
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(129,140,248,0.85)'
    ctx.fillText('dark energy PUSHES  ·  matter PULLS  — opposite roles', lx, ly + 4)

    // Stacked bar at the bottom showing the same split.
    const barX = 40, barY = 300, barW = W - 80, barH = 20
    let bx = barX
    for (const seg of segs) {
      const segW = seg.frac * barW
      ctx.fillStyle = seg.col
      ctx.fillRect(bx, barY, segW, barH)
      bx += segW
    }
    ctx.strokeStyle = 'rgba(245,240,232,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(barX, barY, barW, barH)

    // Time / scale-factor readout on the donut side.
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    const era = av < 0.98 ? 'past (matter-dominated)' : av > 1.02 ? 'future (dark-energy-dominated)' : 'today'
    ctx.textAlign = 'center'
    ctx.fillText(`a = ${av.toFixed(2)}  ·  ${era}`, cx, 300 + 15)
    ctx.textAlign = 'left'
  }, [setupCanvas])

  useEffect(() => { draw(a) }, [draw, a])

  useEffect(() => {
    if (!running) { lastRef.current = null; cancelAnimationFrame(rafRef.current); return }
    const loop = (now: number) => {
      if (lastRef.current === null) lastRef.current = now
      const dt = Math.min(64, now - lastRef.current) / 1000
      lastRef.current = now
      let next = aRef.current + PLAY_SPEED * dt
      if (next >= A_MAX) {
        next = A_MAX
        aRef.current = next
        setA(next)
        setRunning(false)
        return
      }
      aRef.current = next
      setA(next)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running])

  const togglePlay = () => {
    if (aRef.current >= A_MAX) {
      aRef.current = A_MIN
      setA(A_MIN)
    }
    setRunning(r => !r)
  }

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRunning(false)
    const v = Number(e.target.value) / 1000
    aRef.current = v
    setA(v)
  }

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    aRef.current = A_TODAY
    lastRef.current = null
    setA(A_TODAY)
  }

  const s = sharesAt(a)

  return (
    <div className="animation-block" ref={ref}>
      <div
        className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1"
      >
        <span>
          dark energy <span style={{ color: COL_DE }}>{(s.de * 100).toFixed(1)}%</span> — pushes (accelerates)
        </span>
        <span>
          dark matter <span style={{ color: COL_DM }}>{(s.dm * 100).toFixed(1)}%</span> — pulls (gravitates)
        </span>
        <span>
          ordinary <span style={{ color: COL_B }}>{(s.b * 100).toFixed(1)}%</span> — pulls
        </span>
      </div>

      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: Dark energy budget. Values are reported below the diagram."
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)', aspectRatio: `${W} / ${H}` }}
        />
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={togglePlay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play over cosmic time'}
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <input
          type="range"
          min={A_MIN * 1000}
          max={A_MAX * 1000}
          value={Math.round(a * 1000)}
          onChange={onScrub}
          aria-label="Scrub scale factor"
          className="flex-1 min-w-[140px] accent-accent-gold"
        />
      </div>
    </div>
  )
}
