'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 270

const X0 = 44
const X1 = 556
const MID = 132
const SAMPLES = 128
const NMODES = 8

// Angular frequency of the fundamental, in rad per simulated second.
const W1 = 2
const GAMMA = 0.5
// The shaker touches the string a short way in from the left end, so it couples
// to every mode (a drive exactly at a node would never excite that harmonic).
const XDRIVE = 0.13
const SCALE = 190
const DT = 0.016

const GREEN = '#10B981'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'

type Mode = { c: number; phi: number }

// Steady-state response of every normal mode to a sinusoidal drive at omega.
function modesFor(omega: number): Mode[] {
  const out: Mode[] = []
  for (let n = 1; n <= NMODES; n++) {
    const wn = n * W1
    const b = Math.sin(n * Math.PI * XDRIVE)
    const re = wn * wn - omega * omega
    const im = GAMMA * omega
    out.push({ c: b / Math.sqrt(re * re + im * im), phi: Math.atan2(im, re) })
  }
  return out
}

const shapeAt = (modes: Mode[], t: number, omega: number, u: number) => {
  let y = 0
  for (let n = 1; n <= NMODES; n++) {
    const m = modes[n - 1]
    y += m.c * Math.sin(n * Math.PI * u) * Math.cos(omega * t - m.phi)
  }
  return y
}

export function StandingWaveAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [ratio, setRatio] = useState(1)

  const tRef = useRef(0)
  const ratioRef = useRef(1)
  const envRef = useRef<number[]>(new Array(SAMPLES + 1).fill(0))

  useEffect(() => {
    ratioRef.current = ratio
  }, [ratio])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: (reduced) => {
      if (!reduced) setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const r = ratioRef.current
    const omega = r * W1
    const modes = modesFor(omega)
    const t = tRef.current
    const env = envRef.current

    // Which harmonic, if any, is the drive locked onto?
    const nearest = Math.max(1, Math.min(NMODES, Math.round(r)))
    const locked = Math.abs(r - nearest) < 0.07

    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'

    // ---- end supports -----------------------------------------------------
    ctx.strokeStyle = 'rgba(245,240,232,0.35)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(X0, MID - 96)
    ctx.lineTo(X0, MID + 96)
    ctx.moveTo(X1, MID - 96)
    ctx.lineTo(X1, MID + 96)
    ctx.stroke()

    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(X0, MID)
    ctx.lineTo(X1, MID)
    ctx.stroke()
    ctx.setLineDash([])

    // ---- envelope traced out by the motion --------------------------------
    const px = (i: number) => X0 + (i / SAMPLES) * (X1 - X0)
    ctx.beginPath()
    for (let i = 0; i <= SAMPLES; i++) ctx.lineTo(px(i), MID - env[i] * SCALE)
    ctx.strokeStyle = `${GOLD}55`
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.beginPath()
    for (let i = 0; i <= SAMPLES; i++) ctx.lineTo(px(i), MID + env[i] * SCALE)
    ctx.stroke()

    // ---- nodes and antinodes of the nearest harmonic ----------------------
    if (locked) {
      for (let k = 0; k <= nearest; k++) {
        const x = X0 + (k / nearest) * (X1 - X0)
        ctx.beginPath()
        ctx.arc(x, MID, 4, 0, Math.PI * 2)
        ctx.fillStyle = VIOLET
        ctx.fill()
      }
      for (let k = 0; k < nearest; k++) {
        const x = X0 + ((k + 0.5) / nearest) * (X1 - X0)
        ctx.strokeStyle = `${BLUE}44`
        ctx.setLineDash([2, 3])
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, MID - 70)
        ctx.lineTo(x, MID + 70)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // ---- the string itself ------------------------------------------------
    ctx.beginPath()
    for (let i = 0; i <= SAMPLES; i++) {
      const y = shapeAt(modes, t, omega, i / SAMPLES)
      ctx.lineTo(px(i), MID - y * SCALE)
    }
    ctx.strokeStyle = GREEN
    ctx.lineWidth = 2.5
    ctx.stroke()

    // ---- the shaker -------------------------------------------------------
    const sx = X0 + XDRIVE * (X1 - X0)
    const sy = MID - shapeAt(modes, t, omega, XDRIVE) * SCALE
    ctx.beginPath()
    ctx.arc(sx, sy, 4.5, 0, Math.PI * 2)
    ctx.fillStyle = GOLD
    ctx.fill()
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('driver', sx - 12, MID + 84)

    // ---- readout ----------------------------------------------------------
    ctx.fillStyle = locked ? GREEN : 'rgba(245,240,232,0.35)'
    ctx.fillText(
      locked
        ? `LOCKED · harmonic n = ${nearest} · ${nearest} ${nearest === 1 ? 'antinode' : 'antinodes'} · ${nearest + 1} nodes`
        : 'off resonance · no stable pattern, the string just churns',
      X0,
      26
    )
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText(`f / f₁ = ${r.toFixed(2)}`, X0, 42)

    // harmonic ladder along the bottom
    for (let n = 1; n <= 5; n++) {
      const bx = X0 + (n - 1) * 46
      const on = locked && nearest === n
      ctx.fillStyle = on ? GOLD : 'rgba(255,245,235,0.12)'
      ctx.fillRect(bx, H - 26, 38, 4)
      ctx.fillStyle = on ? GOLD : 'rgba(245,240,232,0.3)'
      ctx.fillText(`${n}f₁`, bx + 11, H - 10)
    }
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('harmonics sit at exact integer multiples: 1 : 2 : 3 : 4 : 5', X0 + 244, H - 12)
  }, [])

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(animRef.current)
      return
    }
    const loop = () => {
      tRef.current += DT
      const omega = ratioRef.current * W1
      const modes = modesFor(omega)
      const env = envRef.current
      for (let i = 0; i <= SAMPLES; i++) {
        const y = Math.abs(shapeAt(modes, tRef.current, omega, i / SAMPLES))
        env[i] = Math.max(y, env[i] * 0.985)
      }
      draw()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running, draw])

  useEffect(() => {
    envRef.current = new Array(SAMPLES + 1).fill(0)
    draw()
  }, [ratio, running, draw])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    tRef.current = 0
    envRef.current = new Array(SAMPLES + 1).fill(0)
    setRatio(1)
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Standing Waves on a String</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Drive f/f₁:</span>
          <input type="range" min={0.4} max={5.4} step={0.01} value={ratio}
            onChange={e => setRatio(+e.target.value)}
            className="w-40 accent-accent-gold"
          />
          <span>{ratio.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setRatio(n)}
              className={`px-2 py-1 rounded-md text-[11px] transition-colors ${
                ratio === n ? 'bg-accent-gold text-bg-base' : 'bg-white/5 text-text-muted hover:text-text-secondary'
              }`}
            >
              n={n}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
