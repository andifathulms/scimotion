'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 620
const H = 350

// Molecule box
const BX0 = 14
const BY0 = 44
const BX1 = 286
const BY1 = 292

// Heating-curve plot
const PX0 = 348
const PX1 = 606
const PY0 = 292 // T = -40 °C
const PY1 = 60 // T = +160 °C
const TLO = -40
const THI = 160

// --- Real water thermodynamics, per gram --------------------------------
// c_ice = 2.09, c_water = 4.18, c_steam = 2.01 J/g/K
// L_fus = 334 J/g at 0 °C, L_vap = 2260 J/g at 100 °C
const E_ICE = 2.09 * 30 // -30 °C -> 0 °C  = 62.7
const L_FUS = 334
const E_WATER = 4.18 * 100 // 0 -> 100 °C  = 418
const L_VAP = 2260
const E_STEAM = 2.01 * 40 // 100 -> 140 °C = 80.4

const C1 = E_ICE
const C2 = C1 + L_FUS
const C3 = C2 + E_WATER
const C4 = C3 + L_VAP
const EMAX = C4 + E_STEAM

type Phase = 'solid' | 'melting' | 'liquid' | 'boiling' | 'gas'

type State = {
  T: number
  phase: Phase
  /** fraction of the sample already converted, during a plateau */
  frac: number
  latentDone: number
  latentTotal: number
}

function stateAt(E: number): State {
  if (E < C1) {
    return { T: -30 + E / 2.09, phase: 'solid', frac: 0, latentDone: 0, latentTotal: 0 }
  }
  if (E < C2) {
    const done = E - C1
    return { T: 0, phase: 'melting', frac: done / L_FUS, latentDone: done, latentTotal: L_FUS }
  }
  if (E < C3) {
    return { T: (E - C2) / 4.18, phase: 'liquid', frac: 0, latentDone: 0, latentTotal: 0 }
  }
  if (E < C4) {
    const done = E - C3
    return { T: 100, phase: 'boiling', frac: done / L_VAP, latentDone: done, latentTotal: L_VAP }
  }
  return { T: 100 + (E - C4) / 2.01, phase: 'gas', frac: 1, latentDone: 0, latentTotal: 0 }
}

const ex = (E: number) => PX0 + (E / EMAX) * (PX1 - PX0)
const ty = (T: number) => PY0 - ((T - TLO) / (THI - TLO)) * (PY0 - PY1)

// Thermal speed: set by temperature alone. It does NOT jump at a plateau —
// that is the whole point of latent heat.
const speedOf = (T: number) => 0.45 + 1.55 * ((T - TLO) / (THI - TLO))

const COLS = 8
const ROWS = 5
const N = COLS * ROWS

type Molecule = {
  x: number
  y: number
  vx: number
  vy: number
  ax: number // lattice anchor
  ay: number
  ph: number // jitter phase offset
}

function makeMolecules(): Molecule[] {
  return Array.from({ length: N }, (_, k) => {
    const i = k % COLS
    const j = Math.floor(k / COLS)
    const ax = BX0 + 40 + i * 30
    const ay = BY1 - 30 - j * 30
    return { x: ax, y: ay, vx: 0, vy: 0, ax, ay, ph: Math.random() * Math.PI * 2 }
  })
}

// A fixed, shuffled melting order so the lattice dissolves patchily rather
// than row by row. Returns rank[i] = position of molecule i in the queue.
function meltRank(): number[] {
  const a = Array.from({ length: N }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  const rank = new Array<number>(N)
  a.forEach((m, pos) => {
    rank[m] = pos
  })
  return rank
}

const SOLID = '#60A5FA'
const LIQUID = '#FB923C'
const GAS = '#A78BFA'
const GOLD = '#F59E0B'

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  rate: { default: 5, min: 1, max: 12, step: 1 },
}

export function PhaseTransitionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const molRef = useRef<Molecule[]>(makeMolecules())
  const rankRef = useRef<number[]>(meltRank())
  const energyRef = useRef(0)
  const rateRef = useRef(5)
  const tickRef = useRef(0)

  const [energy, setEnergy] = useState(0)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('phase-transition', SPEC)
  const { rate } = params
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const E = energyRef.current
    const s = stateAt(E)

    ctx.clearRect(0, 0, W, H)

    // --- Molecule box -------------------------------------------------
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(BX0, BY0, BX1 - BX0, BY1 - BY0)

    // Burner glow underneath the box — energy is always going in.
    const glow = ctx.createLinearGradient(0, BY1, 0, BY1 - 40)
    glow.addColorStop(0, 'rgba(251,146,60,0.22)')
    glow.addColorStop(1, 'rgba(251,146,60,0)')
    ctx.fillStyle = glow
    ctx.fillRect(BX0 + 1, BY1 - 40, BX1 - BX0 - 2, 39)

    const mols = molRef.current
    const rank = rankRef.current
    const t = tickRef.current

    // How many molecules have left the ordered phase / left the liquid.
    const nFree = s.phase === 'solid' ? 0 : s.phase === 'melting' ? Math.round(s.frac * N) : N
    const nGas =
      s.phase === 'boiling' ? Math.round(s.frac * N) : s.phase === 'gas' ? N : 0

    mols.forEach((m, i) => {
      const free = rank[i] < nFree
      const gassy = rank[i] < nGas
      const col = gassy ? GAS : free ? LIQUID : SOLID
      ctx.beginPath()
      ctx.arc(m.x, m.y, 4.6, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
      if (!free) {
        // Lattice tether: the bond that latent heat has to pay to break.
        ctx.beginPath()
        ctx.arc(m.ax, m.ay, 8.5, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(96,165,250,0.22)'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    })

    // Liquid surface line while there is still liquid in the box
    if (nFree > nGas) {
      const lvl = BY1 - 8 - (BY1 - 8 - (BY0 + 96)) * ((nFree - nGas) / N)
      ctx.strokeStyle = 'rgba(251,146,60,0.35)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(BX0 + 2, lvl)
      ctx.lineTo(BX1 - 2, lvl)
      ctx.stroke()
      ctx.setLineDash([])
    }

    const label: Record<Phase, string> = {
      solid: 'SOLID · ice',
      melting: 'MELTING · solid + liquid at 0 °C',
      liquid: 'LIQUID · water',
      boiling: 'BOILING · liquid + vapour at 100 °C',
      gas: 'GAS · steam',
    }
    const labelCol: Record<Phase, string> = {
      solid: SOLID,
      melting: GOLD,
      liquid: LIQUID,
      boiling: GOLD,
      gas: GAS,
    }
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = labelCol[s.phase]
    ctx.fillText(label[s.phase], BX0, 26)

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.42)'
    ctx.fillText(`mean molecular speed set by T = ${s.T.toFixed(1)} °C`, BX0, BY1 + 16)

    // --- Latent-heat accumulator --------------------------------------
    const bx = BX0
    const by = BY1 + 26
    const bw = BX1 - BX0
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(bx, by, bw, 10)
    if (s.latentTotal > 0) {
      ctx.fillStyle = GOLD
      ctx.fillRect(bx, by, bw * (s.latentDone / s.latentTotal), 10)
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = GOLD
      ctx.fillText(
        `latent heat absorbed  ${Math.round(s.latentDone)} / ${s.latentTotal} J g⁻¹`,
        bx,
        by + 24
      )
    } else {
      ctx.font = '10px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.3)'
      ctx.fillText('no phase change — every joule raises T', bx, by + 24)
    }

    // --- Heating curve -------------------------------------------------
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PX0, PY1 - 10)
    ctx.lineTo(PX0, PY0)
    ctx.lineTo(PX1, PY0)
    ctx.stroke()

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('T (°C)', PX0 - 4, PY1 - 16)
    ctx.fillText('energy added (J per gram)', PX0 + 78, PY0 + 26)
    for (const tv of [0, 100]) {
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.fillText(`${tv}`, PX0 - 22, ty(tv) + 3)
      ctx.strokeStyle = 'rgba(255,245,235,0.08)'
      ctx.beginPath()
      ctx.moveTo(PX0, ty(tv))
      ctx.lineTo(PX1, ty(tv))
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('0', PX0 - 2, PY0 + 12)
    ctx.fillText(`${Math.round(EMAX)}`, PX1 - 22, PY0 + 12)

    // Full curve, faint
    const path = (upto: number) => {
      ctx.beginPath()
      let started = false
      for (let e = 0; e <= upto + 0.001; e += 4) {
        const q = Math.min(e, upto)
        const p = stateAt(q)
        const X = ex(q)
        const Y = ty(p.T)
        if (!started) {
          ctx.moveTo(X, Y)
          started = true
        } else ctx.lineTo(X, Y)
      }
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(251,146,60,0.18)'
    ctx.lineWidth = 2
    path(EMAX)

    // Plateaus called out in gold
    ctx.strokeStyle = 'rgba(245,158,11,0.35)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(ex(C1), ty(0))
    ctx.lineTo(ex(C2), ty(0))
    ctx.moveTo(ex(C3), ty(100))
    ctx.lineTo(ex(C4), ty(100))
    ctx.stroke()

    // Traversed part, bright
    ctx.strokeStyle = LIQUID
    ctx.lineWidth = 2.4
    if (E > 0) path(E)

    // Live marker
    ctx.beginPath()
    ctx.arc(ex(E), ty(s.T), 4.6, 0, Math.PI * 2)
    ctx.fillStyle = labelCol[s.phase]
    ctx.fill()
    if (s.latentTotal > 0) {
      ctx.beginPath()
      ctx.arc(ex(E), ty(s.T), 8 + 2.5 * Math.sin(t * 0.12), 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(245,158,11,0.5)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText(`${Math.round(E)} J g⁻¹`, PX0 + 6, PY1 - 16)
    ctx.fillStyle = labelCol[s.phase]
    ctx.fillText(`T = ${s.T.toFixed(1)} °C`, PX0 + 96, PY1 - 16)

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.32)'
    ctx.fillText('fusion', ex(C1) + 2, ty(0) - 8)
    ctx.fillText('vaporisation', ex(C3) + 2, ty(100) - 8)
  }, [])

  const step = useCallback(() => {
    const E = energyRef.current
    const s = stateAt(E)
    const sp = speedOf(s.T)
    const mols = molRef.current
    const rank = rankRef.current
    const t = tickRef.current

    const nFree = s.phase === 'solid' ? 0 : s.phase === 'melting' ? Math.round(s.frac * N) : N
    const nGas = s.phase === 'boiling' ? Math.round(s.frac * N) : s.phase === 'gas' ? N : 0

    // Liquid occupies the bottom of the box; the level falls as it boils away.
    const liqTop = BY0 + 96
    const liqBot = BY1 - 8

    mols.forEach((m, i) => {
      const free = rank[i] < nFree
      const gassy = rank[i] < nGas

      if (!free) {
        // Locked on a lattice site: it vibrates, it does not travel.
        const amp = 0.7 + 3.2 * ((s.T - TLO) / (THI - TLO))
        m.x = m.ax + Math.sin(t * 0.16 + m.ph) * amp
        m.y = m.ay + Math.cos(t * 0.13 + m.ph * 1.7) * amp
        m.vx = 0
        m.vy = 0
        return
      }

      if (m.vx === 0 && m.vy === 0) {
        const a = Math.random() * Math.PI * 2
        m.vx = Math.cos(a) * sp
        m.vy = Math.sin(a) * sp
      }

      if (gassy) {
        // Free flight through the whole vessel, same thermal speed.
        m.x += m.vx
        m.y += m.vy
      } else {
        // Liquid: mobile but still touching its neighbours, so the path
        // wanders and stays under the surface.
        const a = (Math.random() - 0.5) * 0.8
        const nvx = m.vx * Math.cos(a) - m.vy * Math.sin(a)
        const nvy = m.vx * Math.sin(a) + m.vy * Math.cos(a)
        m.vx = nvx
        m.vy = nvy
        m.x += m.vx * 0.75
        m.y += m.vy * 0.75
        if (m.y < liqTop) {
          m.y = liqTop
          m.vy = Math.abs(m.vy)
        }
        if (m.y > liqBot) {
          m.y = liqBot
          m.vy = -Math.abs(m.vy)
        }
      }

      // Renormalise to the temperature-set speed, then bounce off the walls.
      const mag = Math.hypot(m.vx, m.vy) || 1
      m.vx = (m.vx / mag) * sp
      m.vy = (m.vy / mag) * sp
      if (m.x < BX0 + 6) {
        m.x = BX0 + 6
        m.vx = Math.abs(m.vx)
      }
      if (m.x > BX1 - 6) {
        m.x = BX1 - 6
        m.vx = -Math.abs(m.vx)
      }
      if (m.y < BY0 + 6) {
        m.y = BY0 + 6
        m.vy = Math.abs(m.vy)
      }
      if (m.y > BY1 - 6) {
        m.y = BY1 - 6
        m.vy = -Math.abs(m.vy)
      }
    })

    tickRef.current += 1
  }, [])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      energyRef.current = Math.min(EMAX, energyRef.current + rateRef.current * 3)
      step()
      draw()
      if (tickRef.current % 4 === 0) setEnergy(energyRef.current)
      if (energyRef.current >= EMAX) {
        setEnergy(EMAX)
        setRunning(false)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  useEffect(() => {
    rateRef.current = rate
  }, [rate])

  useEffect(() => {
    if (!running) draw()
  }, [running, draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    molRef.current = makeMolecules()
    rankRef.current = meltRank()
    energyRef.current = 0
    tickRef.current = 0
    setEnergy(0)
    draw()
  }

  const s = stateAt(energy)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Heating one gram of ice from −30 °C
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
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: Heating one gram of ice from −30 °C. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (energyRef.current >= EMAX) reset()
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-teal text-bg-base text-xs font-medium hover:bg-accent-teal/90 transition-colors"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Heat
            </>
          )}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Burner:</span>
          <input
            type="range"
            min={SPEC.rate.min}
            max={SPEC.rate.max}
            step={SPEC.rate.step}
            value={rate}
            onChange={e => set('rate', +e.target.value)}
            className="w-28 accent-accent-teal"
          />
          <span className="font-mono text-text-secondary">{rate}</span>
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary font-mono">
          {Math.round(energy)} J g⁻¹ · {s.T.toFixed(1)} °C ·{' '}
          {s.latentTotal > 0 ? `${Math.round(s.frac * 100)}% converted` : s.phase}
        </WidgetStatus>
      </div>
    </div>
  )
}
