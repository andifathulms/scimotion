'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 320

const XA = 205
const XB = 395
const YMID = 132
const BOND_A = 1.4 // internuclear distance in angstrom, for the dipole estimate

const DX_MAX = 3.3

// Density buffer (half scale in x, drawn back up).
const DW = 300
const DH = 96
const DECAY = 15

// --- continuum bar ---
const BAR_L = 60
const BAR_R = W - 60
const BAR_Y = 250
const BAR_W = BAR_R - BAR_L

type Pair = { name: string; a: string; b: string; dx: number }

const PAIRS: Pair[] = [
  { name: 'H–H', a: 'H', b: 'H', dx: 0 },
  { name: 'C–H', a: 'H', b: 'C', dx: 0.35 },
  { name: 'H–Cl', a: 'H', b: 'Cl', dx: 0.96 },
  { name: 'O–H', a: 'H', b: 'O', dx: 1.24 },
  { name: 'Na–Cl', a: 'Na', b: 'Cl', dx: 2.23 },
  { name: 'Li–F', a: 'Li', b: 'F', dx: 2.98 },
]

// Pauling's estimate of ionic character from the electronegativity difference.
const ionicity = (dx: number) => 1 - Math.exp(-0.25 * dx * dx)

const dxToX = (dx: number) => BAR_L + (dx / DX_MAX) * BAR_W

function regime(dx: number): { label: string; color: string } {
  if (dx < 0.4) return { label: 'essentially nonpolar covalent', color: '#10B981' }
  if (dx < 1.7) return { label: 'polar covalent', color: '#FB923C' }
  return { label: 'essentially ionic', color: '#60A5FA' }
}

export function ElectronegativityAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bufRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0)

  const [dx, setDx] = useState(0)
  const [pair, setPair] = useState<Pair>(PAIRS[0])
  const [custom, setCustom] = useState(false)
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setDx(1.24); setPair(PAIRS[3]); return }
      setRunning(true)
    },
  })

  const drawCloud = useCallback((ctx: CanvasRenderingContext2D, lam: number) => {
    let buf = bufRef.current
    if (!buf) {
      buf = document.createElement('canvas')
      buf.width = DW
      buf.height = DH
      bufRef.current = buf
    }
    const bctx = buf.getContext('2d')
    if (!bctx) return

    const bxA = XA / 2
    const bxB = XB / 2
    const by = DH / 2
    // Amplitudes chosen so the electron probability on B is (1 + lam) / 2.
    const cA = Math.sqrt(Math.max(0, (1 - lam) / 2))
    const cB = Math.sqrt((1 + lam) / 2)

    const rho = new Float32Array(DW * DH)
    let peak = 1e-9
    for (let y = 0; y < DH; y++) {
      for (let x = 0; x < DW; x++) {
        const dA = Math.hypot(x - bxA, (y - by) * 1.05)
        const dB = Math.hypot(x - bxB, (y - by) * 1.05)
        const psi = cA * Math.exp(-dA / DECAY) + cB * Math.exp(-dB / DECAY)
        const p = psi * psi
        rho[y * DW + x] = p
        if (p > peak) peak = p
      }
    }

    const img = bctx.createImageData(DW, DH)
    const data = img.data
    for (let i = 0; i < DW * DH; i++) {
      const v = Math.min(1, rho[i] / (peak * 0.5))
      const a = Math.pow(v, 1.3)
      data[i * 4] = 251
      data[i * 4 + 1] = 146
      data[i * 4 + 2] = 60
      data[i * 4 + 3] = Math.round(a * 205)
    }
    bctx.putImageData(img, 0, 0)
    ctx.drawImage(buf, 0, YMID - DH, W, DH * 2)
  }, [])

  const draw = useCallback((d: number, p: Pair, isCustom: boolean) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const lam = ionicity(d)
    const reg = regime(d)
    const mu = lam * 4.803 * BOND_A // debye
    const labelA = isCustom ? 'A' : p.a
    const labelB = isCustom ? 'B' : p.b

    // Bond axis
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(XA, YMID)
    ctx.lineTo(XB, YMID)
    ctx.stroke()

    drawCloud(ctx, lam)

    // Nuclei + labels + partial charges
    const nuclei: [number, string, number][] = [
      [XA, labelA, +lam],
      [XB, labelB, -lam],
    ]
    for (const [nx, label, q] of nuclei) {
      ctx.beginPath()
      ctx.arc(nx, YMID, 15, 0, Math.PI * 2)
      ctx.fillStyle = '#0F0D0A'
      ctx.fill()
      ctx.strokeStyle = q > 0 ? '#F59E0B' : '#60A5FA'
      ctx.lineWidth = 1.8
      ctx.stroke()
      ctx.font = 'bold 13px monospace'
      ctx.fillStyle = '#F5F0E8'
      ctx.textAlign = 'center'
      ctx.fillText(label, nx, YMID + 5)

      // Partial charge label, fading in with the asymmetry
      const alpha = Math.min(1, lam * 4)
      if (alpha > 0.02) {
        ctx.font = '12px monospace'
        ctx.fillStyle = q > 0
          ? `rgba(245,158,11,${alpha.toFixed(3)})`
          : `rgba(96,165,250,${alpha.toFixed(3)})`
        ctx.fillText(`${q > 0 ? 'δ+' : 'δ−'} ${Math.abs(q).toFixed(2)}e`, nx, YMID - 30)
      }
    }

    // Dipole arrow (chemistry convention: crossed tail at δ+, head at δ−)
    if (lam > 0.005) {
      const ay = YMID + 52
      const len = 30 + lam * 60
      const x0 = (XA + XB) / 2 - len / 2
      const x1 = (XA + XB) / 2 + len / 2
      ctx.strokeStyle = '#A78BFA'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x0, ay)
      ctx.lineTo(x1, ay)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x0, ay - 6)
      ctx.lineTo(x0, ay + 6)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x1, ay)
      ctx.lineTo(x1 - 9, ay - 5)
      ctx.lineTo(x1 - 9, ay + 5)
      ctx.closePath()
      ctx.fillStyle = '#A78BFA'
      ctx.fill()
      ctx.font = '10px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`μ ≈ ${mu.toFixed(2)} D`, x1 + 10, ay + 4)
    }

    // Header readouts
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = '#FB923C'
    ctx.fillText(`Δχ = ${d.toFixed(2)}`, 16, 22)
    ctx.fillStyle = 'rgba(255,245,235,0.5)'
    ctx.fillText(`ionic character ≈ ${(lam * 100).toFixed(0)}%`, 16, 38)
    ctx.textAlign = 'right'
    ctx.fillStyle = reg.color
    ctx.fillText(reg.label, W - 16, 22)
    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.font = '10px monospace'
    ctx.fillText(isCustom ? 'custom pair' : `example: ${p.name}`, W - 16, 38)

    // ---- continuum bar ----
    const grad = ctx.createLinearGradient(BAR_L, 0, BAR_R, 0)
    grad.addColorStop(0, '#10B981')
    grad.addColorStop(0.35, '#FB923C')
    grad.addColorStop(1, '#60A5FA')
    ctx.fillStyle = grad
    ctx.globalAlpha = 0.55
    ctx.fillRect(BAR_L, BAR_Y, BAR_W, 12)
    ctx.globalAlpha = 1

    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(255,245,235,0.35)'
    ctx.lineWidth = 1
    for (const cut of [0.4, 1.7]) {
      const cx = dxToX(cut)
      ctx.beginPath()
      ctx.moveTo(cx, BAR_Y - 6)
      ctx.lineTo(cx, BAR_Y + 18)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.font = '9px monospace'
      ctx.fillStyle = 'rgba(255,245,235,0.4)'
      ctx.textAlign = 'center'
      ctx.fillText(cut.toFixed(1), cx, BAR_Y + 29)
      ctx.setLineDash([3, 3])
    }
    ctx.setLineDash([])

    // Example ticks
    ctx.font = '9px monospace'
    for (const q of PAIRS) {
      const qx = dxToX(q.dx)
      ctx.beginPath()
      ctx.arc(qx, BAR_Y + 6, 2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,245,235,0.55)'
      ctx.fill()
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(255,245,235,0.35)'
      ctx.fillText(q.name, qx, BAR_Y - 10)
    }

    // Marker
    const mx = dxToX(d)
    ctx.beginPath()
    ctx.moveTo(mx, BAR_Y - 2)
    ctx.lineTo(mx - 5, BAR_Y - 11)
    ctx.lineTo(mx + 5, BAR_Y - 11)
    ctx.closePath()
    ctx.fillStyle = '#F5F0E8'
    ctx.fill()
    ctx.fillRect(mx - 1, BAR_Y, 2, 12)

    ctx.textAlign = 'center'
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.fillText('the dashed cutoffs are a convention, not a law — nothing changes discontinuously', W / 2, H - 12)
  }, [drawCloud])

  useEffect(() => {
    if (!running) return
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      phaseRef.current += dt * 0.22
      const s = 0.5 - 0.5 * Math.cos(phaseRef.current * Math.PI * 2)
      const d = s * 3.1
      setDx(d)
      setCustom(true)
      draw(d, PAIRS[0], true)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => {
    if (!running) draw(dx, pair, custom)
  }, [running, dx, pair, custom, draw])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    phaseRef.current = 0
    setRunning(false)
    setDx(0)
    setPair(PAIRS[0])
    setCustom(false)
    triggerReset()
  }

  const lam = ionicity(dx)
  const reg = regime(dx)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Covalent to ionic is a continuum</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls">
        <button
          onClick={() => setRunning(x => !x)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Δχ:</span>
          <input
            type="range"
            min={0}
            max={DX_MAX}
            step={0.01}
            value={dx}
            onChange={e => { setRunning(false); setCustom(true); setDx(+e.target.value) }}
            className="w-28 accent-accent-gold"
            aria-label="Electronegativity difference"
          />
          <span className="font-mono w-10">{dx.toFixed(2)}</span>
        </div>
        <select
          value={custom ? 'custom' : pair.name}
          onChange={e => {
            const found = PAIRS.find(q => q.name === e.target.value)
            if (!found) return
            setRunning(false)
            setCustom(false)
            setPair(found)
            setDx(found.dx)
          }}
          className="px-2 py-1.5 rounded-lg border border-border bg-bg-surface text-xs text-text-secondary">
          {PAIRS.map(q => (
            <option key={q.name} value={q.name}>{q.name}</option>
          ))}
          <option value="custom">custom</option>
        </select>
        <span className="ml-auto font-mono text-xs" style={{ color: reg.color }}>
          {(lam * 100).toFixed(0)}% ionic
        </span>
      </div>
    </div>
  )
}
