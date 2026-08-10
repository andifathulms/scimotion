'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const X0 = 50            // left end of the propagation axis
const X1 = 570           // right end
const AX = 160           // the propagation axis sits on this line
const E_AMP = 58         // pixels of electric-field amplitude (drawn vertical)
const B_AMP = 48         // pixels of magnetic-field amplitude (drawn skewed)
const BUX = 0.858        // unit vector for the "into the page" B axis
const BUY = 0.514
const SPEED = 150        // pixels per second — this drawing's speed of light
const PROBE = 300        // fixed point where the induction relation is read off

const DEFAULT_FREQ = 1.2 // arbitrary units; wavelength is 240/freq pixels

const GREEN = '#10B981'
const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'

const lambdaOf = (freq: number) => 240 / freq

export function ElectromagneticWaveAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => { if (!reduced) setRunning(true) },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(0)
  const lastRef = useRef<number | null>(null)

  const [running, setRunning] = useState(false)
  const [freq, setFreq] = useState(DEFAULT_FREQ)
  const [slope, setSlope] = useState(0)

  const draw = useCallback((t: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const lambda = lambdaOf(freq)
    const k = (Math.PI * 2) / lambda
    const omega = k * SPEED
    const phase = (x: number) => k * (x - X0) - omega * t

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    // Faint grid
    ctx.strokeStyle = 'rgba(255,245,235,0.035)'
    ctx.lineWidth = 1
    for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke() }
    for (let gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke() }

    // Propagation axis
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255,245,235,0.22)'
    ctx.lineWidth = 1
    ctx.moveTo(X0 - 16, AX); ctx.lineTo(X1 + 16, AX)
    ctx.stroke()

    // Field vectors along the axis (sparse sticks), drawn under the curves
    for (let x = X0; x <= X1; x += 20) {
      const s = Math.sin(phase(x))
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(16,185,129,0.35)'
      ctx.lineWidth = 1.25
      ctx.moveTo(x, AX); ctx.lineTo(x, AX - E_AMP * s)
      ctx.stroke()
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(96,165,250,0.32)'
      ctx.moveTo(x, AX); ctx.lineTo(x + BUX * B_AMP * s, AX + BUY * B_AMP * s)
      ctx.stroke()
    }

    // The B curve (skewed axis — it points into the page)
    ctx.beginPath()
    ctx.strokeStyle = BLUE
    ctx.lineWidth = 2
    for (let x = X0; x <= X1; x += 2) {
      const s = Math.sin(phase(x))
      const px = x + BUX * B_AMP * s
      const py = AX + BUY * B_AMP * s
      if (x === X0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // The E curve (vertical)
    ctx.beginPath()
    ctx.strokeStyle = GREEN
    ctx.lineWidth = 2.25
    for (let x = X0; x <= X1; x += 2) {
      const py = AX - E_AMP * Math.sin(phase(x))
      if (x === X0) ctx.moveTo(x, py); else ctx.lineTo(x, py)
    }
    ctx.stroke()

    // Direction of travel
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(X1 - 34, AX); ctx.lineTo(X1 + 8, AX); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(X1 + 16, AX); ctx.lineTo(X1 + 6, AX - 5); ctx.lineTo(X1 + 6, AX + 5)
    ctx.closePath()
    ctx.fillStyle = GOLD
    ctx.fill()
    ctx.fillText('c', X1 - 6, AX - 8)

    // ---- the probe: where the induction relation is read off ----
    const p = phase(PROBE)
    const cosp = Math.cos(p)
    const eProbe = AX - E_AMP * Math.sin(p)
    const bProbeX = PROBE + BUX * B_AMP * Math.sin(p)
    const bProbeY = AX + BUY * B_AMP * Math.sin(p)

    ctx.save()
    ctx.setLineDash([3, 4])
    ctx.strokeStyle = 'rgba(245,240,232,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PROBE, AX - E_AMP - 8); ctx.lineTo(PROBE, AX + 44); ctx.stroke()
    ctx.restore()

    ctx.fillStyle = GREEN
    ctx.beginPath(); ctx.arc(PROBE, eProbe, 4.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = BLUE
    ctx.beginPath(); ctx.arc(bProbeX, bProbeY, 4.5, 0, Math.PI * 2); ctx.fill()

    // Tangent to E at the probe — its steepness IS the rate B changes.
    const tanLen = 34
    const dy = -E_AMP * k * cosp
    const norm = Math.hypot(1, dy) || 1
    ctx.strokeStyle = 'rgba(167,139,250,0.9)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(PROBE - tanLen / norm, eProbe - (tanLen * dy) / norm)
    ctx.lineTo(PROBE + tanLen / norm, eProbe + (tanLen * dy) / norm)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('probe', PROBE - 16, AX + 58)

    // ---- readout panel: ∂E/∂x and −∂B/∂t, always identical ----
    const BX = 372, BY = 10, BW = 214, BH = 74
    ctx.fillStyle = 'rgba(255,245,235,0.035)'
    ctx.fillRect(BX, BY, BW, BH)
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.lineWidth = 1
    ctx.strokeRect(BX + 0.5, BY + 0.5, BW - 1, BH - 1)

    const mid = BX + 138
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.beginPath(); ctx.moveTo(mid, BY + 18); ctx.lineTo(mid, BY + 60); ctx.stroke()

    const bar = (y: number, color: string, label: string) => {
      ctx.fillStyle = 'rgba(245,240,232,0.55)'
      ctx.fillText(label, BX + 10, y + 4)
      ctx.fillStyle = color
      const len = 42 * cosp
      ctx.fillRect(len >= 0 ? mid : mid + len, y - 5, Math.abs(len), 10)
    }
    bar(BY + 26, GREEN, '∂E/∂x')
    bar(BY + 50, BLUE, '−∂B/∂t')
    ctx.fillStyle = VIOLET
    ctx.fillText('equal, always — Faraday', BX + 10, BY + 70)

    // Legend
    ctx.fillStyle = GREEN
    ctx.fillText('E  electric field', 14, 24)
    ctx.fillStyle = BLUE
    ctx.fillText('B  magnetic field (into the page)', 14, 40)
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('E ⟂ B ⟂ direction of travel — and both peak at the same instant', 14, H - 18)

    setSlope(cosp)
  }, [freq])

  useEffect(() => { draw(tRef.current) }, [draw])

  useEffect(() => {
    if (!running) {
      lastRef.current = null
      cancelAnimationFrame(rafRef.current)
      return
    }
    const loop = (now: number) => {
      if (lastRef.current === null) lastRef.current = now
      const dt = Math.min(64, now - lastRef.current) / 1000
      lastRef.current = now
      tRef.current += dt
      draw(tRef.current)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setFreq(DEFAULT_FREQ)
    tRef.current = 0
    lastRef.current = null
    draw(0)
  }

  const lambda = lambdaOf(freq)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · E and B holding each other up</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Frequency:</span>
          <input
            type="range" min={0.6} max={2.6} step={0.05} value={freq}
            onChange={ev => setFreq(+ev.target.value)}
            className="w-36 accent-accent-gold"
          />
          <span className="text-text-secondary font-medium">{freq.toFixed(2)}× · λ = {lambda.toFixed(0)} px</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary">
          at the probe: <strong className="text-accent-violet">∂E/∂x = −∂B/∂t = {slope.toFixed(2)}</strong>
        </span>
      </div>
    </div>
  )
}
