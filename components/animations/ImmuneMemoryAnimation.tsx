'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw, Syringe, Zap } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 320

// Plot area (logical coordinates; the backing store is scaled for devicePixelRatio)
const PL = 46
const PR = 18
const PT = 30
const PB = 44
const PX0 = PL
const PX1 = W - PR
const PY0 = PT
const PY1 = H - PB

// Timeline (arbitrary "days") and antibody titre (arbitrary units)
const T_MAX = 120
const Y_MAX = 110
const T_VAX = 15          // vaccine given
const T_PRIMARY_END = 62  // memory established, animation pauses here
const T_EXP = 72          // real pathogen encountered
const T_END = 118
const TH = 25             // protective antibody level

const C_AB = '#F472B6'    // pink   — vaccinated antibody curve
const C_GHOST = '#F59E0B' // gold   — unvaccinated (ghost) antibody curve
const C_MEM = '#A78BFA'   // violet — memory cells
const C_TH = '#60A5FA'    // blue   — protective threshold
const C_ILL = '#EF4444'   // red    — illness window

type Phase = 'idle' | 'primary' | 'memory' | 'secondary' | 'done'
type Stats = { peakV: number; sickDays: number; vaxProtectDay: number; phase: Phase }

const DAYS_PER_FRAME = 1.1

// A rise-then-decay pulse that leaves a persisting memory floor once it wanes.
// x is time since the triggering event. A is peak height, `lag` the delay before
// antibodies appear, `peakT` the time-to-peak after the lag, `k` the sharpness.
function pulse(
  x: number,
  A: number,
  lag: number,
  peakT: number,
  k: number,
  floor: number,
  floorLag: number,
  floorRamp: number
): number {
  if (x <= 0) return 0
  let p = 0
  if (x > lag) {
    const xr = x - lag
    p = A * Math.pow(xr / peakT, k) * Math.exp(k * (1 - xr / peakT))
  }
  let f = 0
  if (x > floorLag) f = floor * Math.min(1, (x - floorLag) / floorRamp)
  return Math.max(p, f)
}

// Vaccinated titre: a slow, low PRIMARY bump at the vaccine, then a fast, tall
// SECONDARY spike once the real pathogen arrives (memory cells already exist).
function vaxAb(t: number, exposed: boolean): number {
  let c = pulse(t - T_VAX, 32, 6, 16, 2.2, 8, 10, 8)
  if (exposed) c += pulse(t - T_EXP, 92, 2, 6, 2.6, 20, 4, 5)
  return c
}

// Unvaccinated titre: flat until the first real exposure, then the SAME slow,
// weak primary response — but now the pathogen is loose while it develops.
function unvaxAb(t: number): number {
  return pulse(t - T_EXP, 32, 6, 16, 2.2, 8, 10, 8)
}

// First day after exposure on which a curve reaches the protective level.
function daysToProtection(fn: (d: number) => number): number {
  for (let d = 0; d <= 60; d += 0.5) if (fn(d) >= TH) return d
  return Infinity
}

export function ImmuneMemoryAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(0)
  const targetRef = useRef(0)

  const [phase, setPhase] = useState<Phase>('idle')
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<Stats>({ peakV: 0, sickDays: 0, vaxProtectDay: 0, phase: 'idle' })

  const computeStats = useCallback((ph: Phase): Stats => {
    const exposed = ph === 'secondary' || ph === 'done'
    const peakV = vaxAb(T_EXP + 6, exposed)
    const vaxProtectDay = daysToProtection(d => vaxAb(T_EXP + d, exposed))
    const sickStart = daysToProtection(d => unvaxAb(T_EXP + d))
    const sickDays = Number.isFinite(sickStart) ? sickStart : 30
    return { peakV: Math.round(peakV), sickDays: Math.round(sickDays), vaxProtectDay: Math.round(vaxProtectDay * 10) / 10, phase: ph }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    const xOf = (t: number) => PX0 + (t / T_MAX) * (PX1 - PX0)
    const yOf = (a: number) => PY1 - (Math.min(a, Y_MAX) / Y_MAX) * (PY1 - PY0)

    const exposed = phase === 'secondary' || phase === 'done'
    const showGhost = exposed
    const tCur = tRef.current

    // --- Axes ---
    ctx.strokeStyle = 'rgba(245,240,232,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PX0, PY0 - 6)
    ctx.lineTo(PX0, PY1)
    ctx.lineTo(PX1, PY1)
    ctx.stroke()

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.textAlign = 'right'
    ctx.save()
    ctx.translate(13, (PY0 + PY1) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillText('antibody level', 0, 0)
    ctx.restore()
    ctx.textAlign = 'left'
    ctx.fillText('time →', PX1 - 44, PY1 + 26)

    // --- Protective threshold ---
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = `${C_TH}88`
    ctx.beginPath()
    ctx.moveTo(PX0, yOf(TH))
    ctx.lineTo(PX1, yOf(TH))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = C_TH
    ctx.font = '9px monospace'
    ctx.fillText('protective level', PX0 + 4, yOf(TH) - 4)

    // --- Event markers ---
    const marker = (t: number, label: string, color: string) => {
      if (tCur < t - 0.5) return
      ctx.strokeStyle = `${color}66`
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(xOf(t), PY0 - 6)
      ctx.lineTo(xOf(t), PY1)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.fillText(label, xOf(t), PY0 - 10)
      ctx.textAlign = 'left'
    }
    if (phase !== 'idle') marker(T_VAX, 'vaccine', C_AB)
    if (exposed) marker(T_EXP, 'exposure', C_GHOST)

    // --- Illness window (unvaccinated: pathogen loose until antibodies catch up) ---
    if (showGhost) {
      const sickEnd = Math.min(tCur, T_EXP + stats.sickDays)
      if (sickEnd > T_EXP) {
        ctx.fillStyle = `${C_ILL}18`
        ctx.fillRect(xOf(T_EXP), PY0, xOf(sickEnd) - xOf(T_EXP), PY1 - PY0)
        if (tCur >= T_EXP + stats.sickDays - 0.5) {
          ctx.fillStyle = C_ILL
          ctx.font = '9px monospace'
          ctx.textAlign = 'center'
          ctx.fillText('illness', (xOf(T_EXP) + xOf(sickEnd)) / 2, PY0 + 12)
          ctx.textAlign = 'left'
        }
      }
    }

    // --- Curve plotting helper ---
    const plot = (fn: (t: number) => number, color: string, width: number, dash: boolean) => {
      ctx.beginPath()
      let started = false
      for (let t = 0; t <= tCur; t += 0.5) {
        const x = xOf(t)
        const y = yOf(fn(t))
        if (!started) {
          ctx.moveTo(x, y)
          started = true
        } else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = color
      ctx.lineWidth = width
      if (dash) ctx.setLineDash([5, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Unvaccinated ghost first (drawn behind)
    if (showGhost) plot(unvaxAb, C_GHOST, 1.6, true)
    // Vaccinated curve
    if (phase !== 'idle') plot(t => vaxAb(t, exposed), C_AB, 2.4, false)

    // --- Memory-cell label, once the primary response has settled ---
    if (tCur > T_VAX + 34 && (phase === 'memory' || phase === 'primary' || exposed)) {
      const mx = xOf((T_VAX + T_EXP) / 2)
      const my = yOf(vaxAb((T_VAX + T_EXP) / 2, false))
      for (let i = 0; i < 4; i++) {
        ctx.beginPath()
        ctx.arc(mx - 18 + i * 12, my - 12, 2.6, 0, Math.PI * 2)
        ctx.fillStyle = `${C_MEM}CC`
        ctx.fill()
      }
      ctx.fillStyle = C_MEM
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('memory B & T cells persist', mx, my - 20)
      ctx.textAlign = 'left'
    }

    // --- Idle prompt ---
    if (phase === 'idle') {
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.font = '12px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Vaccinate to prime the immune system', (PX0 + PX1) / 2, (PY0 + PY1) / 2)
      ctx.textAlign = 'left'
    }

    // --- Legend ---
    const ly = H - 12
    ctx.font = '9px monospace'
    const legend: [string, string, boolean][] = [
      [C_AB, 'vaccinated', false],
      [C_GHOST, 'unvaccinated', true],
      [C_MEM, 'memory cells', false],
    ]
    let lx = PX0
    for (const [color, label, dash] of legend) {
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      if (dash) ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(lx, ly - 3)
      ctx.lineTo(lx + 14, ly - 3)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(245,240,232,0.55)'
      ctx.fillText(label, lx + 18, ly)
      lx += 18 + ctx.measureText(label).width + 16
    }
  }, [phase, stats.sickDays])

  useEffect(() => { draw() }, [draw])

  const startAnim = useCallback((target: number, endPhase: Phase) => {
    targetRef.current = target
    setRunning(true)
    const tick = () => {
      tRef.current = Math.min(targetRef.current, tRef.current + DAYS_PER_FRAME)
      if (tRef.current >= targetRef.current - 1e-6) {
        setRunning(false)
        setPhase(endPhase)
        setStats(computeStats(endPhase))
        draw()
        return
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }, [computeStats, draw])

  const vaccinate = useCallback(() => {
    tRef.current = 0
    setPhase('primary')
    setStats(computeStats('primary'))
    startAnim(T_PRIMARY_END, 'memory')
  }, [computeStats, startAnim])

  const expose = useCallback(() => {
    setPhase('secondary')
    setStats(computeStats('secondary'))
    startAnim(T_END, 'done')
  }, [computeStats, startAnim])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        tRef.current = T_END
        setPhase('done')
        setStats(computeStats('done'))
        draw()
        return
      }
      vaccinate()
    },
  })

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    tRef.current = 0
    setPhase('idle')
    setStats({ peakV: 0, sickDays: 0, vaxProtectDay: 0, phase: 'idle' })
    triggerReset()
  }

  const primaryAction = () => {
    if (phase === 'idle') vaccinate()
    else if (phase === 'memory') expose()
    else if (phase === 'done') { tRef.current = 0; vaccinate() }
  }

  const btnLabel =
    phase === 'idle' ? <><Syringe size={12} /> Vaccinate</>
      : phase === 'primary' ? <>Priming…</>
        : phase === 'memory' ? <><Zap size={12} /> Expose to pathogen</>
          : phase === 'secondary' ? <>Responding…</>
            : <><RotateCcw size={12} /> Replay</>

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label" style={{ color: C_AB }}><Play size={13} /> Interactive · Primary vs Secondary Response</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Primary vs Secondary Response. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={primaryAction}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          style={{ background: C_AB, color: '#0F0D0A' }}
        >
          {btnLabel}
        </button>
        <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1 ml-auto">
          {stats.phase === 'idle' && <span>prime immunity, then expose</span>}
          {(stats.phase === 'primary' || stats.phase === 'memory') && (
            <span>primary response: slow, weak — building memory</span>
          )}
          {(stats.phase === 'secondary' || stats.phase === 'done') && (
            <>
              <span style={{ color: C_AB }}>vaccinated: protected in ~{stats.vaxProtectDay}d</span>
              <span style={{ color: C_GHOST }}>unvaccinated: ~{stats.sickDays}d ill</span>
              <span>peak titre {stats.peakV}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
