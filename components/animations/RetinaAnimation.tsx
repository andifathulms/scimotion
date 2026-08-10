'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

// Colours: pink is Medicine's accent and the primary series.
const PINK = '#F472B6'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const INK = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(255,245,235,0.10)'

// The retina laid out by eccentricity (degrees from the fovea). Cones peak
// sharply at the fovea (colour + detail); rods are absent there and dominate the
// periphery (dim-light, no colour). The optic disc — where the optic nerve
// exits — has no photoreceptors at all: the blind spot.
const E_MIN = -80 // temporal retina
const E_MAX = 80 // nasal retina
const BS_LO = 13 // blind spot, nasal side
const BS_HI = 18

const PLOT_X0 = 48
const PLOT_X1 = 560
const PLOT_BASE = 250 // density 0
const PLOT_TOP = 116 // density max
const DMAX = 165000 // scaling headroom (per mm^2)

const xOfEcc = (e: number) => PLOT_X0 + ((e - E_MIN) / (E_MAX - E_MIN)) * (PLOT_X1 - PLOT_X0)
const yOfDensity = (d: number) => PLOT_BASE - (d / DMAX) * (PLOT_BASE - PLOT_TOP)

const inBlindSpot = (e: number) => e >= BS_LO && e <= BS_HI

// Approximate Osterberg-style receptor densities (per mm^2).
function coneDensity(e: number): number {
  if (inBlindSpot(e)) return 0
  return 4000 + 146000 * Math.exp(-((e / 1.8) ** 2))
}
function rodDensity(e: number): number {
  if (inBlindSpot(e)) return 0
  const bump = Math.exp(-(((Math.abs(e) - 18) / 17) ** 2))
  const foveaCut = 1 - Math.exp(-((e / 2.2) ** 2))
  return 150000 * bump * foveaCut
}

const fmtK = (v: number) => `${Math.round(v / 1000)}k`

// Desaturate a hex colour toward grey by (1 - sat): peripheral cone loss steals
// colour, not just detail.
function desat(hex: string, sat: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const lum = 0.3 * r + 0.59 * g + 0.11 * b
  const mix = (c: number) => Math.round(lum + (c - lum) * sat)
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`
}

export function RetinaAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const [ecc, setEcc] = useState(0)
  const [sweeping, setSweeping] = useState(false)

  const paramsRef = useRef(ecc)
  useEffect(() => {
    paramsRef.current = ecc
  }, [ecc])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: (reduced) => {
      if (reduced) return
      setSweeping(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const e = paramsRef.current
    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'

    // ---- plot frame ------------------------------------------------------
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PLOT_X0, PLOT_BASE)
    ctx.lineTo(PLOT_X1, PLOT_BASE)
    ctx.stroke()

    // Fovea band and blind-spot band.
    const fovX = xOfEcc(0)
    ctx.fillStyle = 'rgba(244,114,182,0.08)'
    ctx.fillRect(xOfEcc(-3), PLOT_TOP - 8, xOfEcc(3) - xOfEcc(-3), PLOT_BASE - PLOT_TOP + 8)
    const bsX0 = xOfEcc(BS_LO)
    const bsX1 = xOfEcc(BS_HI)
    ctx.fillStyle = 'rgba(245,240,232,0.06)'
    ctx.fillRect(bsX0, PLOT_TOP - 8, bsX1 - bsX0, PLOT_BASE - PLOT_TOP + 8)
    ctx.strokeStyle = 'rgba(245,240,232,0.18)'
    ctx.setLineDash([2, 3])
    ctx.strokeRect(bsX0, PLOT_TOP - 8, bsX1 - bsX0, PLOT_BASE - PLOT_TOP + 8)
    ctx.setLineDash([])

    // ---- density curves --------------------------------------------------
    const drawCurve = (fn: (x: number) => number, color: string) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      let started = false
      for (let px = PLOT_X0; px <= PLOT_X1; px++) {
        const ex = E_MIN + ((px - PLOT_X0) / (PLOT_X1 - PLOT_X0)) * (E_MAX - E_MIN)
        const y = yOfDensity(fn(ex))
        if (!started) {
          ctx.moveTo(px, y)
          started = true
        } else ctx.lineTo(px, y)
      }
      ctx.stroke()
    }
    drawCurve(rodDensity, BLUE)
    drawCurve(coneDensity, PINK)

    // Curve legends.
    ctx.fillStyle = PINK
    ctx.textAlign = 'left'
    ctx.fillText('cones — colour + detail', xOfEcc(-78), PLOT_TOP + 4)
    ctx.fillStyle = BLUE
    ctx.fillText('rods — dim light, no colour', xOfEcc(30), PLOT_TOP + 44)

    // Axis labels.
    ctx.fillStyle = INK
    ctx.textAlign = 'center'
    ctx.fillText('fovea', fovX, PLOT_BASE + 16)
    ctx.fillText('temporal periphery', xOfEcc(-52), PLOT_BASE + 16)
    ctx.fillText('nasal periphery', xOfEcc(52), PLOT_BASE + 16)
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('blind spot', (bsX0 + bsX1) / 2, PLOT_TOP - 14)
    ctx.fillText('optic disc', (bsX0 + bsX1) / 2, PLOT_TOP - 2)

    // ---- movable point of interest --------------------------------------
    const mx = xOfEcc(e)
    const onBlind = inBlindSpot(e)
    ctx.strokeStyle = onBlind ? 'rgba(245,240,232,0.5)' : GOLD
    ctx.lineWidth = 1.5
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(mx, PLOT_TOP - 8)
    ctx.lineTo(mx, PLOT_BASE)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = onBlind ? 'rgba(245,240,232,0.5)' : GOLD
    ctx.beginPath()
    ctx.moveTo(mx, PLOT_BASE + 2)
    ctx.lineTo(mx - 5, PLOT_BASE + 11)
    ctx.lineTo(mx + 5, PLOT_BASE + 11)
    ctx.closePath()
    ctx.fill()

    // ---- perception swatch: what this retinal spot resolves ---------------
    const cones = coneDensity(e)
    const acuity = Math.min(1, cones / coneDensity(0)) // 1 at fovea -> ~0 far out
    const swX = 40
    const swY = 20
    const swW = 200
    const swH = 74
    ctx.strokeStyle = 'rgba(245,240,232,0.14)'
    ctx.lineWidth = 1
    ctx.strokeRect(swX + 0.5, swY + 0.5, swW - 1, swH - 1)
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
    ctx.fillText('what this spot sees', swX + 4, swY - 6)

    if (onBlind) {
      ctx.strokeStyle = 'rgba(245,240,232,0.25)'
      ctx.setLineDash([4, 4])
      ctx.strokeRect(swX + 20.5, swY + 16.5, swW - 41, swH - 33)
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(245,240,232,0.55)'
      ctx.textAlign = 'center'
      ctx.fillText('nothing — no receptors here', swX + swW / 2, swY + swH / 2)
      ctx.fillStyle = 'rgba(245,240,232,0.3)'
      ctx.fillText('and your brain fills the hole', swX + swW / 2, swY + swH / 2 + 14)
    } else {
      const blur = (1 - acuity) * 5.5
      // Colour patches, desaturating with cone loss.
      const patches = [PINK, GREEN, BLUE, GOLD]
      ctx.filter = `blur(${Math.round(blur * 10) / 10}px)`
      const pw = (swW - 24) / patches.length
      for (let i = 0; i < patches.length; i++) {
        ctx.fillStyle = desat(patches[i], acuity)
        ctx.fillRect(swX + 12 + i * pw, swY + 12, pw - 4, 22)
      }
      // Fine detail bars: how many stay resolvable tracks acuity.
      const bars = Math.max(2, Math.round(2 + acuity * 14))
      const gap = (swW - 24) / (bars * 2)
      ctx.fillStyle = '#F5F0E8'
      for (let i = 0; i < bars; i++) {
        ctx.fillRect(swX + 12 + i * gap * 2, swY + 42, gap, 20)
      }
      ctx.filter = 'none'
    }

    // ---- readout ---------------------------------------------------------
    const rods = rodDensity(e)
    ctx.textAlign = 'right'
    ctx.font = 'bold 13px monospace'
    let zone: string
    let zColor: string
    if (onBlind) {
      zone = 'BLIND SPOT'
      zColor = GOLD
    } else if (Math.abs(e) <= 3) {
      zone = 'FOVEA'
      zColor = PINK
    } else if (Math.abs(e) <= 12) {
      zone = 'PARAFOVEA'
      zColor = VIOLET
    } else {
      zone = 'PERIPHERY'
      zColor = BLUE
    }
    ctx.fillStyle = zColor
    ctx.fillText(zone, W - 16, 30)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText(`eccentricity  ${e >= 0 ? '+' : ''}${Math.round(e)}°`, W - 16, 48)
    ctx.fillStyle = PINK
    ctx.fillText(`cones  ${fmtK(cones)}/mm²`, W - 16, 64)
    ctx.fillStyle = BLUE
    ctx.fillText(`rods  ${fmtK(rods)}/mm²`, W - 16, 80)

    ctx.textAlign = 'left'
    ctx.fillStyle = INK
    ctx.fillText('sharp colour vision lives only at the centre', 40, 100)
    ctx.textAlign = 'left'
  }, [])

  useEffect(() => {
    draw()
  }, [draw, ecc])

  useEffect(() => {
    if (!sweeping) return
    let dir = 1
    const step = () => {
      setEcc((prev) => {
        let next = prev + dir * 0.7
        if (next >= E_MAX) {
          next = E_MAX
          dir = -1
        } else if (next <= E_MIN) {
          next = E_MIN
          dir = 1
        }
        return Math.round(next * 10) / 10
      })
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [sweeping])

  const resetAll = () => {
    triggerReset()
    setSweeping(false)
    setEcc(0)
  }

  const jumpBlindSpot = () => {
    setSweeping(false)
    setEcc((BS_LO + BS_HI) / 2)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · The Retina, Fovea, and Blind Spot
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Point of interest:</span>
          <input
            type="range"
            min={E_MIN}
            max={E_MAX}
            step={0.5}
            value={ecc}
            onChange={(e) => {
              setEcc(+e.target.value)
              setSweeping(false)
            }}
            className="w-44 accent-accent-gold"
          />
        </label>
        <button
          onClick={jumpBlindSpot}
          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/5 text-text-muted hover:text-text-secondary transition-colors"
        >
          Land it on the blind spot
        </button>
        <span className="ml-auto text-xs text-text-secondary">
          drift from the <strong style={{ color: PINK }}>fovea</strong> and watch detail and colour collapse
        </span>
      </div>
    </div>
  )
}
