'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 620
const H = 340
const CX = W / 2
const CY = H / 2
const SCALE = 27
const MAXR = 2.4

type C = { re: number; im: number }

const mod = (z: C) => Math.hypot(z.re, z.im)
const arg = (z: C) => Math.atan2(z.im, z.re)
const mul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
const add = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im })

const clampR = (z: C): C => {
  const r = mod(z)
  if (r <= MAXR || r === 0) return z
  const s = MAXR / r
  return { re: z.re * s, im: z.im * s }
}

const Z1_0: C = { re: 2, im: 0.6 }
const Z2_0: C = { re: 0.6, im: 1.6 }

const px = (z: C) => CX + z.re * SCALE
const py = (z: C) => CY - z.im * SCALE

const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const PINK = '#F472B6'
const GREEN = '#10B981'

const fmt = (z: C) => `${z.re >= 0 ? '' : '−'}${Math.abs(z.re).toFixed(2)} ${z.im >= 0 ? '+' : '−'} ${Math.abs(z.im).toFixed(2)}i`
const deg = (z: C) => Math.round((arg(z) * 180) / Math.PI)

export function ComplexPlaneAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [z1, setZ1] = useState<C>(Z1_0)
  const [z2, setZ2] = useState<C>(Z2_0)
  const z1Ref = useRef(z1)
  const z2Ref = useRef(z2)
  const animRef = useRef<number>(0)
  const dragRef = useRef<0 | 1 | 2>(0)

  useEffect(() => { z1Ref.current = z1 }, [z1])
  useEffect(() => { z2Ref.current = z2 }, [z2])

  const rotateByI = useCallback((reduced: boolean) => {
    cancelAnimationFrame(animRef.current)
    const start = z1Ref.current
    const r = mod(start)
    const a0 = arg(start)
    if (reduced) {
      setZ1({ re: r * Math.cos(a0 + Math.PI / 2), im: r * Math.sin(a0 + Math.PI / 2) })
      return
    }
    const t0 = performance.now()
    const dur = 650
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
      const a = a0 + (Math.PI / 2) * t
      setZ1({ re: r * Math.cos(a), im: r * Math.sin(a) })
      if (t < 1) animRef.current = requestAnimationFrame(step)
    }
    animRef.current = requestAnimationFrame(step)
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => { if (!reduced) rotateByI(false) },
  })

  const arrow = (ctx: CanvasRenderingContext2D, z: C, color: string, width: number) => {
    const x = px(z), y = py(z)
    ctx.beginPath()
    ctx.moveTo(CX, CY)
    ctx.lineTo(x, y)
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.stroke()
    const head = Math.atan2(CY - y, x - CX)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - 10 * Math.cos(head - 0.4), y + 10 * Math.sin(head - 0.4))
    ctx.lineTo(x - 10 * Math.cos(head + 0.4), y + 10 * Math.sin(head + 0.4))
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
  }

  const draw = useCallback((a: C, b: C) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const sum = add(a, b)
    const prod = mul(a, b)

    // Grid
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    ctx.lineWidth = 1
    for (let gx = CX % SCALE; gx <= W; gx += SCALE) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke()
    }
    for (let gy = CY % SCALE; gy <= H; gy += SCALE) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke()
    }

    // Unit circle reference
    ctx.beginPath()
    ctx.arc(CX, CY, SCALE, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(167,139,250,0.25)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, CY); ctx.lineTo(W, CY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(CX, 0); ctx.lineTo(CX, H); ctx.stroke()
    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.font = '10px monospace'
    ctx.fillText('Re', W - 20, CY - 6)
    ctx.fillText('Im', CX + 6, 12)
    ctx.fillText('1', CX + SCALE - 3, CY + 12)

    // Parallelogram for the sum (translation)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(16,185,129,0.5)'
    ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(px(a), py(a)); ctx.lineTo(px(sum), py(sum)); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(px(b), py(b)); ctx.lineTo(px(sum), py(sum)); ctx.stroke()
    ctx.setLineDash([])

    // Vectors
    arrow(ctx, sum, GREEN, 2)
    arrow(ctx, prod, PINK, 2)
    arrow(ctx, a, GOLD, 2.6)
    arrow(ctx, b, BLUE, 2.6)

    // Draggable handles + labels
    const handle = (z: C, color: string, label: string) => {
      const x = px(z), y = py(z)
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = color
      ctx.font = 'bold 11px monospace'
      ctx.fillText(label, x + 11, y - 8)
    }
    const dot = (z: C, color: string, label: string) => {
      const x = px(z), y = py(z)
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
      ctx.fillStyle = color
      ctx.font = 'bold 11px monospace'
      ctx.fillText(label, x + 9, y - 6)
    }
    dot(sum, GREEN, 'z₁+z₂')
    dot(prod, PINK, 'z₁·z₂')
    handle(a, GOLD, 'z₁')
    handle(b, BLUE, 'z₂')

    ctx.fillStyle = 'rgba(255,245,235,0.35)'
    ctx.font = '9px monospace'
    ctx.fillText('drag z₁ and z₂', 8, H - 10)
  }, [])

  useEffect(() => { draw(z1, z2) }, [z1, z2, draw])

  const pick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (W / rect.width)
    const my = (e.clientY - rect.top) * (H / rect.height)
    const d1 = Math.hypot(mx - px(z1Ref.current), my - py(z1Ref.current))
    const d2 = Math.hypot(mx - px(z2Ref.current), my - py(z2Ref.current))
    if (d1 < 20 && d1 <= d2) dragRef.current = 1
    else if (d2 < 20) dragRef.current = 2
    else dragRef.current = 0
    if (dragRef.current) canvas.setPointerCapture(e.pointerId)
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    cancelAnimationFrame(animRef.current)
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (W / rect.width)
    const my = (e.clientY - rect.top) * (H / rect.height)
    const z = clampR({ re: (mx - CX) / SCALE, im: (CY - my) / SCALE })
    if (dragRef.current === 1) setZ1(z); else setZ2(z)
  }

  const release = () => { dragRef.current = 0 }

  const reset = () => {
    cancelAnimationFrame(animRef.current)
    setZ1(Z1_0)
    setZ2(Z2_0)
    triggerReset()
  }

  const sum = add(z1, z2)
  const prod = mul(z1, z2)
  const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The complex plane</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg touch-none cursor-grab"
          style={{ background: '#0F0D0A' }}
          onPointerDown={pick}
          onPointerMove={move}
          onPointerUp={release}
          onPointerLeave={release}
        />
      </div>
      <div className="animation-controls">
        <button onClick={() => rotateByI(reduced())}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-violet text-bg-base text-xs font-medium hover:bg-accent-violet/90 transition-colors">
          Multiply z₁ by i
        </button>
        <div className="flex flex-col gap-0.5 text-xs font-mono">
          <span style={{ color: GOLD }}>z₁ = {fmt(z1)} · r={mod(z1).toFixed(2)} ∠{deg(z1)}°</span>
          <span style={{ color: BLUE }}>z₂ = {fmt(z2)} · r={mod(z2).toFixed(2)} ∠{deg(z2)}°</span>
        </div>
        <div className="flex flex-col gap-0.5 text-xs font-mono ml-auto">
          <span style={{ color: GREEN }}>z₁+z₂ = {fmt(sum)}</span>
          <span style={{ color: PINK }}>z₁·z₂ = {fmt(prod)} · r={mod(prod).toFixed(2)} ∠{deg(prod)}°</span>
        </div>
      </div>
    </div>
  )
}
