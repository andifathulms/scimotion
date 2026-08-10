'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

// 2 H2 + O2 -> 2 H2O as discrete molecules combining in a whole-number MOLE
// ratio. The user sets how many of each reactant is supplied; the widget finds
// the limiting reagent, consumes reactants 2:1, and leaves the excess behind.

const W = 620
const H = 340
const ORANGE = '#FB923C'
const C_H = '#93C5FD' // hydrogen atoms
const C_O = '#F87171' // oxygen atoms

// molar masses g/mol, for the "masses differ" readout
const M_H2 = 2.016
const M_O2 = 32.0
const M_H2O = 18.015

type XY = { x: number; y: number }

function gridSlot(i: number, ox: number, oy: number, perRow: number, dx: number, dy: number): XY {
  return { x: ox + (i % perRow) * dx, y: oy + Math.floor(i / perRow) * dy }
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  h2: { default: 6, min: 0, max: 8, step: 2 },
  o2: { default: 2, min: 0, max: 5, step: 1 },
}

export function StoichiometryAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const pRef = useRef(0) // reaction progress 0..1
  const reducedRef = useRef(false)

  const { params, set, permalink, isDefault, restored } = useWidgetParams('stoichiometry', SPEC)
  const { h2, o2 } = params
  const [running, setRunning] = useState(false)

  // stoichiometry: extent = number of "2H2 + O2" reaction events
  const extent = Math.min(h2 / 2, o2)
  const usedH2 = 2 * extent
  const usedO2 = extent
  const product = 2 * extent
  const leftH2 = h2 - usedH2
  const leftO2 = o2 - usedO2
  const limiting = h2 / 2 < o2 ? 'H₂' : o2 < h2 / 2 ? 'O₂' : 'balanced'

  const { ref, triggered } = useAnimationTrigger({
    onTrigger: reduced => {
      reducedRef.current = reduced
      if (reduced) {
        pRef.current = 1
      } else {
        setRunning(true)
      }
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const p = pRef.current

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)
    ctx.font = '11px monospace'

    // molecule drawing helpers ------------------------------------------------
    const atom = (x: number, y: number, r: number, color: string, a: number) => {
      ctx.globalAlpha = a
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.globalAlpha = 1
    }
    const drawH2 = (c: XY, a: number) => {
      atom(c.x - 7, c.y, 7, C_H, a)
      atom(c.x + 7, c.y, 7, C_H, a)
    }
    const drawO2 = (c: XY, a: number) => {
      atom(c.x - 8, c.y, 9, C_O, a)
      atom(c.x + 8, c.y, 9, C_O, a)
    }
    const drawH2O = (c: XY, a: number) => {
      atom(c.x, c.y, 9, C_O, a)
      atom(c.x - 12, c.y - 9, 6, C_H, a)
      atom(c.x + 12, c.y - 9, 6, C_H, a)
    }

    // labels
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.textAlign = 'left'
    ctx.fillText('REACTANTS  (2 H₂ : 1 O₂)', 30, 26)
    ctx.textAlign = 'right'
    ctx.fillText('PRODUCT  (H₂O)', W - 30, 26)
    ctx.textAlign = 'center'
    ctx.fillStyle = ORANGE
    ctx.font = 'bold 15px monospace'
    ctx.fillText('→', W / 2, H / 2)
    ctx.font = '11px monospace'

    const center: XY = { x: W / 2, y: H / 2 }

    // H2 molecules (top-left block)
    for (let i = 0; i < h2; i++) {
      const s = gridSlot(i, 55, 55, 2, 46, 40)
      if (i < usedH2) {
        const a = 1 - p
        const x = s.x + (center.x - s.x) * p
        const y = s.y + (center.y - s.y) * p
        drawH2({ x, y }, a)
      } else {
        drawH2(s, 1)
      }
    }
    // O2 molecules (bottom-left block)
    for (let i = 0; i < o2; i++) {
      const s = gridSlot(i, 55, 235, 2, 50, 44)
      if (i < usedO2) {
        const a = 1 - p
        const x = s.x + (center.x - s.x) * p
        const y = s.y + (center.y - s.y) * p
        drawO2({ x, y }, a)
      } else {
        drawO2(s, 1)
      }
    }
    // H2O products (right block), fade/drift in
    const nProd = Math.round(product)
    for (let i = 0; i < nProd; i++) {
      const s = gridSlot(i, 415, 70, 2, 62, 52)
      const x = s.x - (s.x - center.x) * (1 - p)
      drawH2O({ x, y: s.y }, p)
    }

    // leftover / limiting banner
    ctx.textAlign = 'center'
    ctx.font = 'bold 12px monospace'
    if (p > 0.6) {
      ctx.fillStyle = limiting === 'balanced' ? '#34D399' : ORANGE
      const msg =
        limiting === 'balanced'
          ? 'exact stoichiometry — nothing left over'
          : `${limiting} is the limiting reagent`
      ctx.fillText(msg, W / 2, H - 16)
    }
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
  }, [h2, o2, usedH2, usedO2, product, limiting])

  // animation loop
  useEffect(() => {
    if (!running) return
    const tick = () => {
      pRef.current = Math.min(1, pRef.current + 0.012)
      draw()
      if (pRef.current >= 1) {
        setRunning(false)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  // redraw on any state / setting change + reduced-motion static frame
  useEffect(() => {
    if (reducedRef.current && triggered) pRef.current = 1
    draw()
  }, [draw, triggered])

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

  const changeH2 = (v: number) => {
    setRunning(false)
    pRef.current = 0
    set('h2', v)
  }
  const changeO2 = (v: number) => {
    setRunning(false)
    pRef.current = 0
    set('o2', v)
  }
  const play = () => {
    if (pRef.current >= 1) pRef.current = 0
    setRunning(r => !r)
  }
  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    pRef.current = 0
    set('h2', 6)
    set('o2', 2)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Coefficients are mole ratios, not mass ratios
        </span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button
            onClick={resetAll}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>

      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: Coefficients are mole ratios, not mass ratios. Values are reported below the diagram."
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)', height: 'auto' }}
        />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          supplied: {h2} H₂ + {o2} O₂ (mol)
        </span>
        <span>
          reacted: {usedH2} H₂ + {usedO2} O₂ →{' '}
          <span className="text-accent-orange" style={{ color: ORANGE }}>
            {product} H₂O
          </span>
        </span>
        <span>
          leftover: {leftH2} H₂ · {leftO2} O₂
        </span>
        <span>
          mass: {(usedH2 * M_H2).toFixed(1)} g + {(usedO2 * M_O2).toFixed(1)} g ={' '}
          {(product * M_H2O).toFixed(1)} g
        </span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={play}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>

        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>H₂:</span>
          <input
            type="range"
            min={SPEC.h2.min}
            max={SPEC.h2.max}
            step={SPEC.h2.step}
            value={h2}
            onChange={e => changeH2(+e.target.value)}
            className="w-24 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">{h2} mol</span>
        </label>

        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>O₂:</span>
          <input
            type="range"
            min={SPEC.o2.min}
            max={SPEC.o2.max}
            step={SPEC.o2.step}
            value={o2}
            onChange={e => changeO2(+e.target.value)}
            className="w-24 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">{o2} mol</span>
        </label>

        <WidgetStatus className="ml-auto text-xs font-mono" style={{ color: ORANGE }}>
          limiting: {limiting}
        </WidgetStatus>
      </div>

      <p className="mt-2 px-1 text-xs text-text-muted">
        The coefficients 2:1:2 count molecules (or moles), not grams. Notice the masses in the readout:
        {' '}the mole ratio is a tidy 2:1, yet 2 mol of H₂ weighs only ~4 g against 32 g of O₂ &mdash; the
        same particles, wildly different weights. Whichever reactant runs out first is the limiting
        reagent, and the excess simply sits there unreacted. Total mass in equals total mass out.
      </p>
    </div>
  )
}
