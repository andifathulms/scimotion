'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

// Layout ---------------------------------------------------------------------
const W = 620
const H = 300
const EX = 232 // enzyme centre x
const EY = 150 // enzyme centre y
const ER = 66 // enzyme radius
const SITE_X = EX + ER * 0.46 // where the substrate nestles into the active site
const START_X = W - 54 // where a fresh substrate enters from

// Colours
const LIME = '#A3E635' // field accent — products
const C_ENZ = '#60A5FA' // blue — the enzyme body
const C_SUB = '#A78BFA' // violet — the substrate
const C_SITE = '#F59E0B' // gold — the active site cleft

// The catalytic cycle as an ordered set of phases. `speed` is progress per
// frame, so each phase advances deterministically — no timers, no randomness.
type PhaseName = 'approach' | 'bind' | 'catalyze' | 'release'
const PHASES: { name: PhaseName; speed: number; label: string }[] = [
  { name: 'approach', speed: 0.016, label: 'free enzyme · substrate approaching' },
  { name: 'bind', speed: 0.022, label: 'induced fit · active site flexes to grip & strain' },
  { name: 'catalyze', speed: 0.02, label: 'ES complex → substrate converted to products' },
  { name: 'release', speed: 0.018, label: 'products released · enzyme returns unchanged' },
]

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t)
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Draw the enzyme body with an active-site cleft on its right. `grip` in [0,1]
// closes the cleft (induced fit) and adds a small squeeze that strains whatever
// is held. The outline is identical every cycle — the enzyme is never changed.
function drawEnzyme(ctx: CanvasRenderingContext2D, grip: number) {
  const mouth = lerp(0.62, 0.2, grip) // half-angle of the open cleft (radians)
  const squeeze = Math.sin(grip * Math.PI) * 4

  ctx.beginPath()
  const steps = 96
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI + (i / steps) * 2 * Math.PI
    // Cleft carved out of the right side (angles near 0).
    let r = ER
    if (Math.abs(a) < mouth) {
      const d = Math.abs(a) / mouth // 0 at centre of mouth, 1 at its lips
      r = ER - (ER * 0.42 + squeeze) * (1 - d * d)
    }
    const px = EX + Math.cos(a) * r
    const py = EY + Math.sin(a) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = 'rgba(96,165,250,0.16)'
  ctx.fill()
  ctx.strokeStyle = C_ENZ
  ctx.lineWidth = 2
  ctx.stroke()

  // Active-site marker at the mouth
  ctx.beginPath()
  ctx.arc(SITE_X, EY, 4, 0, Math.PI * 2)
  ctx.fillStyle = C_SITE
  ctx.fill()

  ctx.font = '11px monospace'
  ctx.fillStyle = 'rgba(96,165,250,0.8)'
  ctx.textAlign = 'center'
  ctx.fillText('E', EX - 14, EY + 4)
  ctx.fillStyle = 'rgba(245,240,232,0.35)'
  ctx.fillText('(unchanged)', EX - 14, EY + 20)
}

export function EnzymeCycleAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0) // index into PHASES
  const tRef = useRef(0) // progress within the current phase, 0..1
  const turnoverRef = useRef(0)

  const [running, setRunning] = useState(false)
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [turnover, setTurnover] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const phase = PHASES[phaseRef.current]
    const t = tRef.current

    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    // Grip (induced fit) profile across the cycle.
    let grip = 0
    if (phase.name === 'approach') grip = 0
    else if (phase.name === 'bind') grip = easeInOut(t)
    else if (phase.name === 'catalyze') grip = 1
    else grip = 1 - easeInOut(t) // release: cleft reopens

    drawEnzyme(ctx, grip)

    // Substrate / product rendering ------------------------------------------
    ctx.textAlign = 'center'
    ctx.font = '11px monospace'

    if (phase.name === 'approach') {
      const sx = lerp(START_X, SITE_X + 22, easeInOut(t))
      ctx.beginPath()
      ctx.arc(sx, EY, 13, 0, Math.PI * 2)
      ctx.fillStyle = C_SUB
      ctx.fill()
      ctx.fillStyle = '#1A1712'
      ctx.fillText('S', sx, EY + 4)
    } else if (phase.name === 'bind') {
      // Settle into the site; a squeeze shows the substrate being strained.
      const sx = lerp(SITE_X + 22, SITE_X + 6, easeInOut(t))
      const strain = Math.sin(easeInOut(t) * Math.PI) * 3
      ctx.beginPath()
      ctx.ellipse(sx, EY, 13 + strain, 13 - strain, 0, 0, Math.PI * 2)
      ctx.fillStyle = C_SUB
      ctx.fill()
      ctx.fillStyle = '#1A1712'
      ctx.fillText('S', sx, EY + 4)
    } else if (phase.name === 'catalyze') {
      // Substrate splits into two products; colour blends violet → lime.
      const sep = easeInOut(t) * 15
      const mix = easeInOut(t)
      const col = `rgb(${Math.round(lerp(167, 163, mix))},${Math.round(lerp(139, 230, mix))},${Math.round(lerp(250, 53, mix))})`
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(SITE_X + 8, EY + s * sep, 9, 0, Math.PI * 2)
        ctx.fillStyle = col
        ctx.fill()
      }
      if (t > 0.5) {
        ctx.fillStyle = 'rgba(163,230,53,0.9)'
        ctx.fillText('P', SITE_X + 8, EY - sep - 12)
        ctx.fillText('P', SITE_X + 8, EY + sep + 20)
      }
    } else {
      // release: two products drift away to the right.
      const px = lerp(SITE_X + 8, START_X + 10, easeInOut(t))
      const alpha = 1 - t * 0.4
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(px, EY + s * 16, 9, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(163,230,53,${alpha})`
        ctx.fill()
        ctx.fillStyle = '#1A1712'
        ctx.fillText('P', px, EY + s * 16 + 4)
      }
    }

    // Phase caption
    ctx.textAlign = 'center'
    ctx.font = '12px monospace'
    ctx.fillStyle = LIME
    ctx.fillText(phase.label, W / 2, 30)

    // Step ribbon (which stage of the cycle we are in)
    ctx.font = '10px monospace'
    const names = PHASES.map(p => p.name)
    const totalW = 300
    const x0 = W / 2 - totalW / 2
    for (let i = 0; i < names.length; i++) {
      const cx = x0 + (i + 0.5) * (totalW / names.length)
      const active = i === phaseRef.current
      ctx.beginPath()
      ctx.arc(cx, H - 26, 5, 0, Math.PI * 2)
      ctx.fillStyle = active ? LIME : 'rgba(245,240,232,0.2)'
      ctx.fill()
      ctx.fillStyle = active ? 'rgba(245,240,232,0.8)' : 'rgba(245,240,232,0.3)'
      ctx.fillText(names[i], cx, H - 8)
      if (i < names.length - 1) {
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(245,240,232,0.15)'
        ctx.lineWidth = 1
        ctx.moveTo(cx + 6, H - 26)
        ctx.lineTo(cx + totalW / names.length - 6, H - 26)
        ctx.stroke()
      }
    }

    // Turnover badge
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(`turnovers: ${turnoverRef.current}`, 16, 24)
  }, [])

  useEffect(() => {
    draw()
  }, [draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // One static frame: enzyme mid-release, having already turned over once.
        phaseRef.current = 3
        tRef.current = 0.6
        turnoverRef.current = 1
        setPhaseIdx(3)
        setTurnover(1)
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    if (!running) return
    const tick = () => {
      const phase = PHASES[phaseRef.current]
      tRef.current += phase.speed
      if (tRef.current >= 1) {
        tRef.current = 0
        const last = phaseRef.current === PHASES.length - 1
        if (last) {
          turnoverRef.current += 1 // a full cycle completed — enzyme reused
          setTurnover(turnoverRef.current)
        }
        phaseRef.current = (phaseRef.current + 1) % PHASES.length
        setPhaseIdx(phaseRef.current)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    triggerReset()
    setRunning(false)
    phaseRef.current = 0
    tRef.current = 0
    turnoverRef.current = 0
    setPhaseIdx(0)
    setTurnover(0)
    draw()
  }

  return (
    <div ref={ref} className="animation-block">
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          stage: <span style={{ color: LIME }}>{PHASES[phaseIdx].name}</span>
        </span>
        <span>
          turnovers: <span className="text-accent-gold">{turnover}</span>
        </span>
        <span>enzyme molecules consumed: <span style={{ color: LIME }}>0</span></span>
      </div>

      <div className="mt-3">
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: '#0F0D0A', aspectRatio: `${W} / ${H}` }}
        />
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <span className="text-xs text-text-muted">
          One enzyme, many cycles: the turnover counter climbs while zero enzyme is ever used up.
        </span>
      </div>
    </div>
  )
}
