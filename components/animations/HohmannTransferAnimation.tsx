'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw, Flame } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 420
const BG = '#0F0D0A'
const CX = 300
const CY = 210

const INDIGO = '#818CF8'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const GREEN = '#10B981'
const ORANGE = '#FB923C'
const DIM = 'rgba(245,240,232,0.45)'
const FAINT = 'rgba(255,245,235,0.10)'

// --- Geometry (px). Planet at the focus; periapsis of the transfer sits to the
// right, apoapsis to the left. ---
const R1 = 74 // low circular orbit radius
const R2 = 176 // high circular orbit radius
const A_T = (R1 + R2) / 2 // transfer-ellipse semi-major axis
const E_T = (R2 - R1) / (R2 + R1) // transfer-ellipse eccentricity
const C_T = A_T * E_T // focus offset = (R2 - R1)/2

// --- Physics (schematic GM). Angular rate n = sqrt(GM/a^3); vis-viva speed
// v = sqrt(GM (2/r - 1/a)). Absolute values are scaled so the low orbit reads
// like low Earth orbit (~7.7 km/s); the RATIOS between orbits are exact. ---
const GM = 120000
const N1 = Math.sqrt(GM / (R1 * R1 * R1)) // low-orbit angular rate
const N2 = Math.sqrt(GM / (R2 * R2 * R2)) // high-orbit angular rate (slower)
const NT = Math.sqrt(GM / (A_T * A_T * A_T)) // transfer angular rate
const VSCALE = 7.7 / Math.sqrt(GM / R1) // km/s per model-speed unit

function visViva(r: number, a: number): number {
  return VSCALE * Math.sqrt(GM * (2 / r - 1 / a))
}

// Solve Kepler's equation M = E - e sin E for the eccentric anomaly.
function solveE(M: number, e: number): number {
  let E = M
  for (let i = 0; i < 6; i++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  }
  return E
}

type Phase = 'low' | 'transfer' | 'high'

// Screen position for a given orbit + mean anomaly. Periapsis points +x (right).
function positionOnEllipse(M: number, a: number, e: number): { x: number; y: number; r: number; nu: number } {
  const E = solveE(M, e)
  const r = a * (1 - e * Math.cos(E))
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2))
  // Focus at planet centre; periapsis toward +x. Screen y grows downward.
  const x = CX + r * Math.cos(nu)
  const y = CY - r * Math.sin(nu)
  return { x, y, r, nu }
}

function circlePos(M: number, radius: number): { x: number; y: number } {
  return { x: CX + radius * Math.cos(M), y: CY - radius * Math.sin(M) }
}

export function HohmannTransferAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const phaseRef = useRef<Phase>('low')
  const mRef = useRef(0)
  const autoRef = useRef(false)
  const runningRef = useRef(false)
  const flashRef = useRef(0) // burn-flash countdown (frames)

  const [phase, setPhase] = useState<Phase>('low')
  const [atApoapsis, setAtApoapsis] = useState(false)
  const [readout, setReadout] = useState({ r: R1, v: visViva(R1, R1), a: R1 })

  const publish = useCallback((ph: Phase, r: number, a: number) => {
    setReadout({ r, v: visViva(r, a), a })
  }, [])

  const draw = useCallback((ph: Phase, M: number, flash: number) => {
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
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    // Low circular orbit.
    ctx.strokeStyle = ph === 'low' ? BLUE : 'rgba(96,165,250,0.3)'
    ctx.lineWidth = ph === 'low' ? 2 : 1
    ctx.beginPath(); ctx.arc(CX, CY, R1, 0, Math.PI * 2); ctx.stroke()

    // High circular orbit.
    ctx.strokeStyle = ph === 'high' ? GREEN : 'rgba(16,185,129,0.3)'
    ctx.lineWidth = ph === 'high' ? 2 : 1
    ctx.beginPath(); ctx.arc(CX, CY, R2, 0, Math.PI * 2); ctx.stroke()

    // Transfer ellipse (centre offset by C_T toward apoapsis on the left).
    ctx.strokeStyle = ph === 'transfer' ? GOLD : 'rgba(245,158,11,0.28)'
    ctx.lineWidth = ph === 'transfer' ? 2 : 1
    ctx.setLineDash(ph === 'transfer' ? [] : [4, 5])
    ctx.beginPath()
    ctx.ellipse(CX - C_T, CY, A_T, A_T * Math.sqrt(1 - E_T * E_T), 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Burn markers: periapsis (burn 1, right) and apoapsis (burn 2, left).
    ctx.fillStyle = DIM
    ctx.font = '10px monospace'
    ctx.beginPath(); ctx.arc(CX + R1, CY, 3, 0, Math.PI * 2); ctx.fillStyle = ORANGE; ctx.fill()
    ctx.fillStyle = ORANGE
    ctx.fillText('burn 1 (prograde)', CX + R1 + 6, CY + 4)
    ctx.beginPath(); ctx.arc(CX - R2, CY, 3, 0, Math.PI * 2); ctx.fill()
    ctx.textAlign = 'right'
    ctx.fillText('burn 2 (circularise)', CX - R2 - 6, CY + 4)
    ctx.textAlign = 'left'

    // Planet.
    const grad = ctx.createRadialGradient(CX - 8, CY - 9, 4, CX, CY, 24)
    grad.addColorStop(0, '#3b4a6b')
    grad.addColorStop(1, '#141b2b')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(CX, CY, 24, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(96,165,250,0.5)'
    ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.arc(CX, CY, 24, 0, Math.PI * 2); ctx.stroke()

    // Spacecraft position.
    let pos: { x: number; y: number }
    if (ph === 'low') pos = circlePos(M, R1)
    else if (ph === 'high') pos = circlePos(M, R2)
    else pos = positionOnEllipse(M, A_T, E_T)

    // Burn flash.
    if (flash > 0) {
      const fg = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 22)
      fg.addColorStop(0, 'rgba(251,146,60,0.7)')
      fg.addColorStop(1, 'rgba(251,146,60,0)')
      ctx.fillStyle = fg
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 22, 0, Math.PI * 2); ctx.fill()
    }

    ctx.fillStyle = ph === 'transfer' ? GOLD : ph === 'high' ? GREEN : BLUE
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2); ctx.fill()

    // Phase badge.
    ctx.font = 'bold 12px monospace'
    const badge = ph === 'low' ? 'LOW CIRCULAR ORBIT — fast'
      : ph === 'transfer' ? 'TRANSFER ELLIPSE — coasting, slowing'
      : 'HIGH CIRCULAR ORBIT — slower'
    ctx.fillStyle = ph === 'transfer' ? GOLD : ph === 'high' ? GREEN : BLUE
    ctx.fillText(badge, 16, 24)

    ctx.font = '10px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText('the burn raises the OPPOSITE side of the orbit', 16, H - 12)
  }, [])

  const doBurn2 = useCallback(() => {
    // Circularise at apoapsis: switch to the high circular orbit at the apoapsis
    // point (left side, angle = π).
    phaseRef.current = 'high'
    mRef.current = Math.PI
    flashRef.current = 20
    setPhase('high')
    setAtApoapsis(false)
    publish('high', R2, R2)
  }, [publish])

  const doBurn1 = useCallback(() => {
    // Fire prograde at periapsis: enter the transfer ellipse at periapsis (M=0).
    phaseRef.current = 'transfer'
    mRef.current = 0
    flashRef.current = 20
    setPhase('transfer')
    setAtApoapsis(false)
    publish('transfer', R1, A_T)
  }, [publish])

  const loop = useCallback(() => {
    if (flashRef.current > 0) flashRef.current -= 1
    const ph = phaseRef.current

    if (ph === 'low') {
      const prev = mRef.current
      mRef.current += N1 * 0.9
      // In auto mode, burn 1 the moment we sweep through periapsis (angle 0).
      if (autoRef.current && Math.floor((prev) / (Math.PI * 2)) < Math.floor(mRef.current / (Math.PI * 2))) {
        mRef.current = 0
        doBurn1()
      } else {
        publish('low', R1, R1)
      }
    } else if (ph === 'transfer') {
      mRef.current += NT * 0.9
      if (mRef.current >= Math.PI) {
        mRef.current = Math.PI
        const p = positionOnEllipse(Math.PI, A_T, E_T)
        publish('transfer', p.r, A_T)
        if (autoRef.current) {
          doBurn2()
        } else {
          // Manual mode: hold at apoapsis, wait for burn 2.
          setAtApoapsis(true)
          runningRef.current = false
          draw('transfer', Math.PI, flashRef.current)
          return
        }
      } else {
        const p = positionOnEllipse(mRef.current, A_T, E_T)
        publish('transfer', p.r, A_T)
      }
    } else {
      mRef.current += N2 * 0.9
      publish('high', R2, R2)
    }

    draw(phaseRef.current, mRef.current, flashRef.current)
    rafRef.current = requestAnimationFrame(loop)
  }, [doBurn1, doBurn2, draw, publish])

  const start = useCallback(() => {
    if (runningRef.current) return
    runningRef.current = true
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(loop)
  }, [loop])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      phaseRef.current = 'low'
      mRef.current = 0
      autoRef.current = !reduced
      setPhase('low')
      setAtApoapsis(false)
      publish('low', R1, R1)
      if (reduced) {
        draw('low', 0, 0)
        return
      }
      start()
    },
  })

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const onPlay = () => {
    autoRef.current = true
    phaseRef.current = 'low'
    mRef.current = 0
    setPhase('low')
    setAtApoapsis(false)
    publish('low', R1, R1)
    runningRef.current = false
    start()
  }

  const onBurn1 = () => {
    if (phaseRef.current !== 'low') return
    autoRef.current = false
    doBurn1()
    start()
  }

  const onBurn2 = () => {
    if (phaseRef.current !== 'transfer' || !atApoapsis) return
    doBurn2()
    start()
  }

  const reset = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    runningRef.current = false
    autoRef.current = false
    triggerReset()
    phaseRef.current = 'low'
    mRef.current = 0
    flashRef.current = 0
    setPhase('low')
    setAtApoapsis(false)
    publish('low', R1, R1)
    draw('low', 0, 0)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Hohmann transfer: two burns to a higher orbit</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Hohmann transfer: two burns to a higher orbit. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: BG }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>phase: <span style={{ color: phase === 'transfer' ? GOLD : phase === 'high' ? GREEN : BLUE }}>{phase}</span></span>
        <span>altitude r: <span style={{ color: INDIGO }}>{readout.r.toFixed(0)} px</span></span>
        <span>speed: <span className="text-accent-orange">{readout.v.toFixed(2)} km/s</span></span>
        <span className="text-text-muted">low ≈ {visViva(R1, R1).toFixed(1)} · high ≈ {visViva(R2, R2).toFixed(1)} km/s</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={onPlay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> Play (auto)
        </button>
        <button
          onClick={onBurn1}
          disabled={phase !== 'low'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border text-text-secondary hover:bg-bg-hover disabled:opacity-40"
        >
          <Flame size={12} /> Burn 1
        </button>
        <button
          onClick={onBurn2}
          disabled={!atApoapsis}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border text-text-secondary hover:bg-bg-hover disabled:opacity-40"
        >
          <Flame size={12} /> Burn 2
        </button>
        <WidgetStatus className="text-xs text-text-muted font-mono ml-auto self-center">
          {phase === 'low' ? 'in low orbit — fire prograde at periapsis'
            : phase === 'transfer' ? (atApoapsis ? 'at apoapsis — circularise with burn 2' : 'coasting up the ellipse, slowing down')
            : 'circularised — higher orbit, but SLOWER'}
        </WidgetStatus>
      </div>
    </div>
  )
}
