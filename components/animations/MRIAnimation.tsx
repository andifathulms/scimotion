'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 340

const PINK = '#F472B6'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const DIM = 'rgba(245,240,232,0.35)'
const FAINT = 'rgba(255,245,235,0.10)'

// Hydrogen's reduced gyromagnetic ratio, in MHz per tesla.
const GAMMA_BAR = 42.58

// Relaxation constants (ms) roughly in the range of soft tissue at 1.5 T,
// and a hard 90-degree pulse one millisecond long.
const T1 = 900
const T2 = 80
const PULSE_MS = 1
const W1 = Math.PI / 2 / PULSE_MS // rad/ms, so w1 * PULSE_MS = 90 degrees

// Stage lengths in real seconds, and how fast simulated time runs in each stage.
const RANDOM_S = 1.8
const ALIGN_S = 1.8
const PULSE_RATE = 0.75 // ms of pulse per second on screen
const FID_RATE = 95 // ms of free precession per second on screen
const FID_END = 360 // ms

// Panel geometry
const SP_X = 14
const SP_Y = 30
const VEC_CX = 300
const VEC_CY = 118
const VEC_R = 62
const PR_X0 = 412
const PR_X1 = 590
const PR_Y0 = 40
const PR_Y1 = 186
const FID_X0 = 14
const FID_X1 = 586
const FID_Y = 282
const FID_AMP = 46

type Stage = 'random' | 'align' | 'pulse' | 'fid'
type Vec = { x: number; y: number; z: number }

// Deterministic pseudo-random so the spin cloud is stable across resets.
const hash = (i: number) => {
  const s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453
  return s - Math.floor(s)
}

// Transverse magnetisation left immediately after a rectangular pulse of
// duration PULSE_MS, as a function of the off-resonance detuning (rad/ms).
// This is the classic rotation-about-the-effective-field result.
const excitation = (dw: number) => {
  const weff = Math.sqrt(W1 * W1 + dw * dw)
  if (weff === 0) return 0
  return Math.abs((W1 / weff) * Math.sin(weff * PULSE_MS))
}

// Oblique projection of the (x, y, z) magnetisation frame onto the canvas.
const AX = { x: -0.60, y: 0.34 }
const AY = { x: 0.94, y: 0.20 }
const project = (v: Vec) => ({
  px: VEC_CX + (v.x * AX.x + v.y * AY.x) * VEC_R,
  py: VEC_CY - v.z * VEC_R + (v.x * AX.y + v.y * AY.y) * VEC_R,
})

const detuneToPx = (d: number) => PR_X0 + ((d + 1) / 2) * (PR_X1 - PR_X0)
const ampToPy = (a: number) => PR_Y1 - a * (PR_Y1 - PR_Y0)

function arrow(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  width: number,
  head: number
) {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  if (len < head) return
  const ux = dx / len
  const uy = dy / len
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 - ux * head - uy * head * 0.45, y1 - uy * head + ux * head * 0.45)
  ctx.lineTo(x1 - ux * head + uy * head * 0.45, y1 - uy * head - ux * head * 0.45)
  ctx.closePath()
  ctx.fill()
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  b0: { default: 1.5, min: 0.5, max: 3, step: 0.1 },
  detune: { default: 0, min: -1, max: 1, step: 0.02 },
}

export function MRIAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const lastRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('m-r-i', SPEC)
  const { b0, detune } = params
  const [flip, setFlip] = useState(0) // achieved flip readout, degrees

  const detuneRef = useRef(0)
  const simRef = useRef<{
    stage: Stage
    clock: number
    tMs: number
    m: Vec
    phi: number
    peak: number
  }>({ stage: 'random', clock: 0, tMs: 0, m: { x: 0, y: 0, z: 0 }, phi: 0, peak: 0 })
  const fidRef = useRef<{ t: number; v: number }[]>([])

  useEffect(() => {
    detuneRef.current = detune
  }, [detune])

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

    const s = simRef.current
    const d = detuneRef.current
    const dw = 2 * Math.PI * d // rad/ms
    const b0On = s.stage !== 'random'
    const alignP = s.stage === 'random' ? 0 : s.stage === 'align' ? Math.min(1, s.clock / ALIGN_S) : 1

    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'

    // ---- panel separators -------------------------------------------------
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(196, 24)
    ctx.lineTo(196, 200)
    ctx.moveTo(404, 24)
    ctx.lineTo(404, 200)
    ctx.moveTo(14, 214)
    ctx.lineTo(586, 214)
    ctx.stroke()

    // ---- panel A: the proton ensemble -------------------------------------
    ctx.fillStyle = DIM
    ctx.fillText('hydrogen spins', SP_X, 22)

    // The direction the ensemble is aligning toward, drawn in the (y, z) plane.
    const my = s.m.y
    const mz = s.m.z
    const mag = Math.hypot(my, mz)
    const tx = mag > 0.01 ? my / mag : 0
    const ty = mag > 0.01 ? -mz / mag : -1

    let sumX = 0
    let sumY = 0
    for (let i = 0; i < 24; i++) {
      const col = i % 4
      const row = (i - col) / 4
      const cx = SP_X + 20 + col * 42 + (hash(i) - 0.5) * 10
      const cy = SP_Y + 14 + row * 28 + (hash(i + 71) - 0.5) * 8

      const a = hash(i + 13) * Math.PI * 2
      const rx = Math.cos(a)
      const ry = Math.sin(a)
      const j = (hash(i + 200) - 0.5) * 0.55
      const jx = tx * Math.cos(j) - ty * Math.sin(j)
      const jy = tx * Math.sin(j) + ty * Math.cos(j)

      let vx = rx * (1 - alignP) + jx * alignP
      let vy = ry * (1 - alignP) + jy * alignP
      const vl = Math.hypot(vx, vy) || 1
      vx /= vl
      vy /= vl
      sumX += vx
      sumY += vy

      const L = 11
      arrow(ctx, cx - vx * L * 0.5, cy - vy * L * 0.5, cx + vx * L * 0.5, cy + vy * L * 0.5, b0On ? PINK : DIM, 1.4, 4)
    }

    const net = Math.hypot(sumX, sumY) / 24
    ctx.fillStyle = b0On ? PINK : DIM
    ctx.fillText(`net M ≈ ${net.toFixed(2)}`, SP_X, 190)
    ctx.fillStyle = b0On ? GOLD : 'rgba(245,240,232,0.22)'
    ctx.fillText(b0On ? `B₀ = ${b0.toFixed(1)} T  ↑` : 'B₀ off', SP_X, 176)

    // ---- panel B: the magnetisation vector --------------------------------
    ctx.fillStyle = DIM
    ctx.fillText('net magnetisation M', 210, 22)

    // transverse plane
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i <= 60; i++) {
      const th = (i / 60) * Math.PI * 2
      const p = project({ x: Math.cos(th), y: Math.sin(th), z: 0 })
      if (i === 0) ctx.moveTo(p.px, p.py)
      else ctx.lineTo(p.px, p.py)
    }
    ctx.stroke()

    // axes
    const zTop = project({ x: 0, y: 0, z: 1.15 })
    const yEnd = project({ x: 0, y: 1.15, z: 0 })
    const xEnd = project({ x: 1.15, y: 0, z: 0 })
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.beginPath()
    ctx.moveTo(VEC_CX, VEC_CY)
    ctx.lineTo(zTop.px, zTop.py)
    ctx.moveTo(VEC_CX, VEC_CY)
    ctx.lineTo(yEnd.px, yEnd.py)
    ctx.moveTo(VEC_CX, VEC_CY)
    ctx.lineTo(xEnd.px, xEnd.py)
    ctx.stroke()
    ctx.fillStyle = DIM
    ctx.fillText('z ∥ B₀', zTop.px - 6, zTop.py - 4)
    ctx.fillText('y', yEnd.px + 3, yEnd.py + 3)
    ctx.fillText('x', xEnd.px - 10, xEnd.py + 8)

    // the displayed vector: precession is folded in as a visible rotation of
    // the transverse component (the real thing spins tens of millions of times
    // a second, far too fast to draw).
    const cph = Math.cos(s.phi)
    const sph = Math.sin(s.phi)
    const disp: Vec = {
      x: s.m.x * cph - s.m.y * sph,
      y: s.m.x * sph + s.m.y * cph,
      z: s.m.z,
    }

    // precession trail
    const mxy = Math.hypot(s.m.x, s.m.y)
    if (mxy > 0.02 && s.stage === 'fid') {
      ctx.strokeStyle = `${VIOLET}55`
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i <= 48; i++) {
        const th = s.phi - (i / 48) * Math.PI * 1.6
        const p = project({ x: mxy * Math.cos(th), y: mxy * Math.sin(th), z: s.m.z })
        if (i === 0) ctx.moveTo(p.px, p.py)
        else ctx.lineTo(p.px, p.py)
      }
      ctx.stroke()
    }

    // transverse shadow
    const shadow = project({ x: disp.x, y: disp.y, z: 0 })
    ctx.strokeStyle = `${PINK}44`
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(VEC_CX, VEC_CY)
    ctx.lineTo(shadow.px, shadow.py)
    ctx.stroke()
    ctx.setLineDash([])

    const tip = project(disp)
    arrow(ctx, VEC_CX, VEC_CY, tip.px, tip.py, PINK, 2.5, 8)

    // RF field during the pulse
    if (s.stage === 'pulse') {
      const b1 = project({ x: 0.75, y: 0, z: 0 })
      arrow(ctx, VEC_CX, VEC_CY, b1.px, b1.py, GOLD, 2, 7)
      ctx.fillStyle = GOLD
      ctx.fillText('B₁ (RF)', b1.px - 24, b1.py + 14)
    }

    ctx.fillStyle = PINK
    ctx.fillText(`|Mxy| = ${mxy.toFixed(2)}`, 212, 178)
    ctx.fillStyle = BLUE
    ctx.fillText(`Mz = ${s.m.z.toFixed(2)}`, 212, 190)

    // ---- panel C: excitation vs detuning ----------------------------------
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PR_X0, PR_Y0 - 8)
    ctx.lineTo(PR_X0, PR_Y1)
    ctx.lineTo(PR_X1, PR_Y1)
    ctx.stroke()
    ctx.fillStyle = DIM
    ctx.fillText('tip achieved |Mxy|', PR_X0 + 4, PR_Y0 - 12)
    ctx.fillText('−1', PR_X0 - 2, PR_Y1 + 13)
    ctx.fillText('0', detuneToPx(0) - 3, PR_Y1 + 13)
    ctx.fillText('+1 kHz off Larmor', detuneToPx(0.28), PR_Y1 + 13)

    ctx.setLineDash([3, 4])
    ctx.strokeStyle = `${VIOLET}55`
    ctx.beginPath()
    ctx.moveTo(detuneToPx(0), PR_Y0 - 8)
    ctx.lineTo(detuneToPx(0), PR_Y1)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.beginPath()
    for (let i = 0; i <= 180; i++) {
      const dd = -1 + (i / 180) * 2
      const px = detuneToPx(dd)
      const py = ampToPy(excitation(2 * Math.PI * dd))
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.strokeStyle = GREEN
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(detuneToPx(d), ampToPy(excitation(dw)), 4, 0, Math.PI * 2)
    ctx.fillStyle = GOLD
    ctx.fill()
    ctx.fillStyle = DIM
    ctx.fillText('resonance', detuneToPx(0) + 4, PR_Y0 + 4)

    // ---- panel D: the free induction decay --------------------------------
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(FID_X0, FID_Y)
    ctx.lineTo(FID_X1, FID_Y)
    ctx.stroke()

    const buf = fidRef.current
    const tToPx = (t: number) => FID_X0 + (t / FID_END) * (FID_X1 - FID_X0)

    // T2 envelope, anchored to the amplitude the pulse actually produced
    if (s.peak > 0.01) {
      ctx.strokeStyle = `${VIOLET}66`
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i <= 120; i++) {
        const t = (i / 120) * FID_END
        const e = s.peak * Math.exp(-t / T2)
        const px = tToPx(t)
        if (i === 0) ctx.moveTo(px, FID_Y - e * FID_AMP)
        else ctx.lineTo(px, FID_Y - e * FID_AMP)
      }
      ctx.stroke()
      ctx.beginPath()
      for (let i = 0; i <= 120; i++) {
        const t = (i / 120) * FID_END
        const e = s.peak * Math.exp(-t / T2)
        const px = tToPx(t)
        if (i === 0) ctx.moveTo(px, FID_Y + e * FID_AMP)
        else ctx.lineTo(px, FID_Y + e * FID_AMP)
      }
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = VIOLET
      ctx.fillText(`e^(−t/T₂),  T₂ = ${T2} ms`, tToPx(T2) + 6, FID_Y - s.peak * FID_AMP * 0.37 - 6)
      ctx.strokeStyle = `${VIOLET}44`
      ctx.beginPath()
      ctx.moveTo(tToPx(T2), FID_Y - s.peak * FID_AMP * 0.37)
      ctx.lineTo(tToPx(T2), FID_Y + FID_AMP * 0.2)
      ctx.stroke()
    }

    if (buf.length > 1) {
      ctx.beginPath()
      buf.forEach((p, i) => {
        const px = tToPx(p.t)
        const py = FID_Y - p.v * FID_AMP
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.strokeStyle = PINK
      ctx.lineWidth = 1.6
      ctx.stroke()
    }

    ctx.fillStyle = PINK
    ctx.fillText('free induction decay — the signal the coil actually hears', FID_X0, 232)
    ctx.fillStyle = DIM
    ctx.fillText('0', FID_X0, FID_Y + FID_AMP + 12)
    ctx.fillText(`${FID_END} ms`, FID_X1 - 34, FID_Y + FID_AMP + 12)

    // stage caption
    const caption =
      s.stage === 'random'
        ? 'No field: spins point every which way, and they cancel.'
        : s.stage === 'align'
          ? 'B₀ on: a slight excess aligns along z — a net magnetisation appears.'
          : s.stage === 'pulse'
            ? 'RF pulse: B₁ tips M away from z, but only if it is on resonance.'
            : 'Precession and decay: transverse signal dies with T₂, Mz regrows with T₁.'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(caption, FID_X0, 210)
  }, [b0])

  const step = useCallback((dt: number) => {
    const s = simRef.current
    const dw = 2 * Math.PI * detuneRef.current // rad/ms

    // Split the Bloch evolution into three exact pieces per substep — rotation
    // about the RF axis, rotation about z from the off-resonance term, and
    // relaxation — so the magnetisation never gains norm from integration error.
    const bloch = (dtMs: number, pulseOn: boolean) => {
      if (dtMs <= 0) return
      const n = Math.max(1, Math.ceil(dtMs / 0.01))
      const h = dtMs / n
      const ca = Math.cos(W1 * h)
      const sa = Math.sin(W1 * h)
      const cb = Math.cos(dw * h)
      const sb = Math.sin(dw * h)
      const e2 = Math.exp(-h / T2)
      const e1 = Math.exp(-h / T1)
      const m = s.m
      for (let i = 0; i < n; i++) {
        if (pulseOn) {
          const y = m.y * ca + m.z * sa
          const z = m.z * ca - m.y * sa
          m.y = y
          m.z = z
        }
        const x = m.x * cb + m.y * sb
        const y2 = m.y * cb - m.x * sb
        m.x = x
        m.y = y2
        m.x *= e2
        m.y *= e2
        m.z = 1 + (m.z - 1) * e1
      }
    }

    s.clock += dt

    if (s.stage === 'random') {
      s.m = { x: 0, y: 0, z: 0 }
      if (s.clock >= RANDOM_S) {
        s.stage = 'align'
        s.clock = 0
      }
      return
    }

    if (s.stage === 'align') {
      s.m = { x: 0, y: 0, z: Math.min(1, s.clock / ALIGN_S) }
      if (s.clock >= ALIGN_S) {
        s.stage = 'pulse'
        s.clock = 0
        s.tMs = 0
        s.phi = 0
        s.m = { x: 0, y: 0, z: 1 }
        fidRef.current = []
      }
      return
    }

    if (s.stage === 'pulse') {
      const dMs = Math.min(dt * PULSE_RATE, PULSE_MS - s.tMs)
      bloch(dMs, true)
      s.tMs += dMs
      if (s.tMs >= PULSE_MS - 1e-6) {
        s.stage = 'fid'
        s.clock = 0
        s.tMs = 0
        s.peak = Math.hypot(s.m.x, s.m.y)
      }
      return
    }

    // fid
    const dMs = dt * FID_RATE
    bloch(dMs, false)
    s.tMs += dMs
    s.phi += (2 * Math.PI * dMs) / 34
    const amp = Math.hypot(s.m.x, s.m.y)
    const buf = fidRef.current
    buf.push({ t: Math.min(s.tMs, FID_END), v: amp * Math.cos(s.phi) })
    if (buf.length > 900) buf.shift()

    if (s.tMs >= FID_END) {
      // Repeat the excitation, exactly as a real sequence does every TR.
      s.stage = 'pulse'
      s.clock = 0
      s.tMs = 0
      s.phi = 0
      s.m.x = 0
      s.m.y = 0
      fidRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(animRef.current)
      return
    }
    lastRef.current = 0
    let frames = 0
    const loop = (now: number) => {
      const prev = lastRef.current || now
      lastRef.current = now
      const dt = Math.min(0.05, (now - prev) / 1000)
      step(dt)
      draw()
      if (++frames % 6 === 0) {
        const m = simRef.current.m
        setFlip((Math.atan2(Math.hypot(m.x, m.y), m.z) * 180) / Math.PI)
      }
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running, step, draw])

  useEffect(() => {
    draw()
  }, [detune, b0, running, draw])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    simRef.current = { stage: 'random', clock: 0, tMs: 0, m: { x: 0, y: 0, z: 0 }, phi: 0, peak: 0 }
    fidRef.current = []
    setFlip(0)
    draw()
  }

  const larmor = GAMMA_BAR * b0
  const tipPct = Math.round(excitation(2 * Math.PI * detune) * 100)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Spin, Tip, Relax</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Field B₀:</span>
          <input type="range" min={SPEC.b0.min} max={SPEC.b0.max} step={SPEC.b0.step} value={b0}
            onChange={e => set('b0', +e.target.value)}
            className="w-24 accent-accent-gold"
          />
          <span>{b0.toFixed(1)} T</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>RF detuning:</span>
          <input type="range" min={SPEC.detune.min} max={SPEC.detune.max} step={SPEC.detune.step} value={detune}
            onChange={e => set('detune', +e.target.value)}
            className="w-28 accent-accent-gold"
          />
          <span>{detune >= 0 ? '+' : ''}{detune.toFixed(2)} kHz</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          Larmor <strong className="text-accent-gold">{larmor.toFixed(1)} MHz</strong> · tip{' '}
          <strong className="text-accent-gold">{tipPct}%</strong> · flip{' '}
          <strong className="text-accent-gold">{flip.toFixed(0)}°</strong>
        </span>
      </div>
    </div>
  )
}
