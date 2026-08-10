'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

// grams <-> moles <-> particles converter. The point the widget makes: a mole is
// a COUNT (like a dozen, but 6.022e23 of them), and the SAME number of moles of
// two substances weighs different amounts because molar mass differs.

const W = 620
const H = 330
const N_A = 6.022e23
const ORANGE = '#FB923C'

type Substance = { name: string; formula: string; molarMass: number; color: string }

// molar masses in g/mol
const SUBSTANCES: Substance[] = [
  { name: 'Carbon', formula: 'C', molarMass: 12.011, color: '#9CA3AF' },
  { name: 'Water', formula: 'H₂O', molarMass: 18.015, color: '#60A5FA' },
  { name: 'Iron', formula: 'Fe', molarMass: 55.845, color: '#F59E0B' },
  { name: 'Gold', formula: 'Au', molarMass: 196.97, color: '#FBBF24' },
]

// The always-visible reference substance for the mass comparison (unless it IS
// the selected one, in which case we compare against carbon).
const REF = SUBSTANCES[1] // water

type Mode = 'moles' | 'grams'

const fmtSci = (v: number) => {
  const s = v.toExponential(3) // e.g. "6.022e+23"
  const [m, e] = s.split('e')
  return `${m}×10^${parseInt(e, 10)}`
}

export function MoleCountingAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const displayRef = useRef(0) // animated, eased moles
  const targetRef = useRef(0)
  const reducedRef = useRef(false)

  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState<Mode>('moles')
  const [amount, setAmount] = useState(1) // moles OR grams depending on mode

  const substance = SUBSTANCES[index]
  const target = mode === 'moles' ? amount : amount / substance.molarMass

  const { ref, triggered } = useAnimationTrigger({
    onTrigger: reduced => {
      reducedRef.current = reduced
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const moles = displayRef.current
    const particles = moles * N_A
    const grams = moles * substance.molarMass

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)
    ctx.font = '11px monospace'
    ctx.textAlign = 'left'

    // ---- Section A: the "count ladder" (log scale) ----
    const lx = 30
    const lw = W - 60
    const ly = 78
    const logMax = 24
    const xForLog = (lg: number) => lx + (Math.max(0, Math.min(logMax, lg)) / logMax) * lw

    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('How big is a mole? A count on a logarithmic scale', lx, 30)

    // baseline
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(lx, ly)
    ctx.lineTo(lx + lw, ly)
    ctx.stroke()

    // fixed reference ticks
    const ticks: { v: number; label: string }[] = [
      { v: 1, label: '1' },
      { v: 12, label: 'a dozen (12)' },
      { v: 1e3, label: 'thousand' },
      { v: 1e6, label: 'million' },
      { v: 1e9, label: 'billion' },
      { v: N_A, label: 'a mole' },
    ]
    ctx.textAlign = 'center'
    for (const t of ticks) {
      const x = xForLog(Math.log10(t.v))
      const isMole = t.v === N_A
      ctx.strokeStyle = isMole ? ORANGE : 'rgba(255,245,235,0.28)'
      ctx.lineWidth = isMole ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(x, ly - 8)
      ctx.lineTo(x, ly + 8)
      ctx.stroke()
      ctx.fillStyle = isMole ? ORANGE : 'rgba(245,240,232,0.4)'
      ctx.fillText(t.label, x, ly - 14)
    }

    // current-count marker
    if (particles > 0) {
      const mx = xForLog(Math.log10(particles))
      ctx.strokeStyle = '#34D399'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(mx, ly + 10)
      ctx.lineTo(mx, ly + 30)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(mx, ly + 10, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#34D399'
      ctx.fill()
      ctx.fillStyle = '#34D399'
      ctx.textAlign = 'center'
      const label = `${fmtSci(particles)} particles`
      const clampX = Math.max(lx + 60, Math.min(lx + lw - 60, mx))
      ctx.fillText(label, clampX, ly + 44)
    }

    // ---- Section B: mass comparison at equal moles ----
    const by = 150
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(`Same ${moles.toFixed(2)} mol — but the masses differ`, lx, by)

    const ref = REF.name === substance.name ? SUBSTANCES[0] : REF
    const bars = [
      { s: substance, g: grams },
      { s: ref, g: moles * ref.molarMass },
    ]
    const maxG = Math.max(0.0001, moles * Math.max(substance.molarMass, ref.molarMass))
    const barTop = by + 20
    const barMaxH = 110
    const barW = 90
    bars.forEach((b, i) => {
      const bx = lx + 40 + i * 260
      const h = (b.g / maxG) * barMaxH
      const yTop = barTop + (barMaxH - h)
      ctx.fillStyle = b.s.color
      ctx.globalAlpha = 0.85
      ctx.fillRect(bx, yTop, barW, h)
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(255,245,235,0.2)'
      ctx.strokeRect(bx, barTop, barW, barMaxH)
      ctx.fillStyle = 'rgba(245,240,232,0.85)'
      ctx.textAlign = 'center'
      ctx.font = 'bold 12px monospace'
      ctx.fillText(`${b.g.toFixed(2)} g`, bx + barW / 2, yTop - 8)
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.6)'
      ctx.fillText(`${b.s.name} (${b.s.formula})`, bx + barW / 2, barTop + barMaxH + 18)
      ctx.fillText(`${b.s.molarMass.toFixed(2)} g/mol`, bx + barW / 2, barTop + barMaxH + 32)
    })
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
  }, [substance])

  // Ease the displayed moles toward the target; draw one static frame if reduced.
  useEffect(() => {
    targetRef.current = target
    if (!triggered) return
    if (reducedRef.current) {
      displayRef.current = target
      draw()
      return
    }
    const tick = () => {
      const t = targetRef.current
      const d = displayRef.current
      const nd = d + (t - d) * 0.18
      displayRef.current = Math.abs(t - nd) < 1e-4 ? t : nd
      draw()
      if (displayRef.current !== t) rafRef.current = requestAnimationFrame(tick)
    }
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [triggered, target, draw])

  // devicePixelRatio-aware sizing
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw()
  }, [draw])

  const moles = target
  const grams = moles * substance.molarMass
  const particles = moles * N_A

  const toggleMode = () => {
    if (mode === 'moles') {
      setAmount(Math.round(amount * substance.molarMass * 10) / 10)
      setMode('grams')
    } else {
      setAmount(Math.round((amount / substance.molarMass) * 100) / 100)
      setMode('moles')
    }
  }

  const resetAll = () => {
    displayRef.current = 0
    setIndex(0)
    setMode('moles')
    setAmount(1)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · A mole is a count, molar mass is the bridge to grams
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: A mole is a count, molar mass is the bridge to grams. Values are reported below the diagram."
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)', height: 'auto' }}
        />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          <span className="text-accent-orange" style={{ color: ORANGE }}>
            {substance.name}
          </span>{' '}
          {substance.formula}
        </span>
        <span>M = {substance.molarMass.toFixed(3)} g/mol</span>
        <span>n = {moles.toFixed(3)} mol</span>
        <span>mass = {grams.toFixed(2)} g</span>
        <span>
          N = {fmtSci(particles)} <span className="text-text-muted">particles</span>
        </span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        {SUBSTANCES.map((s, i) => (
          <button
            key={s.name}
            onClick={() => setIndex(i)}
            className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: i === index ? s.color : 'rgba(255,245,235,0.08)',
              color: i === index ? '#1A1712' : 'rgba(245,240,232,0.7)',
            }}
          >
            {s.formula}
          </button>
        ))}

        <button
          onClick={toggleMode}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          Set: {mode}
        </button>

        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>{mode === 'moles' ? 'moles:' : 'grams:'}</span>
          <input
            type="range"
            min={mode === 'moles' ? 0.05 : 1}
            max={mode === 'moles' ? 5 : 500}
            step={mode === 'moles' ? 0.05 : 1}
            value={amount}
            onChange={e => setAmount(+e.target.value)}
            className="w-32 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">
            {mode === 'moles' ? `${amount.toFixed(2)} mol` : `${amount.toFixed(0)} g`}
          </span>
        </label>
      </div>

      <p className="mt-2 px-1 text-xs text-text-muted">
        Slide the amount and watch the green marker: even a fraction of a mole sits astronomically far
        to the right of &ldquo;a dozen&rdquo; on the log scale. Switch substances at fixed moles and the
        particle count is identical while the two mass bars stay different heights &mdash; equal moles do
        not mean equal grams, because each substance has its own molar mass.
      </p>
    </div>
  )
}
