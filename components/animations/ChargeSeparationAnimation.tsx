'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

const CYAN = '#22D3EE' // field / breakdown accent
const BLUE = '#60A5FA' // negative charge
const ORANGE = '#F59E0B' // positive charge
const CRYSTAL = '#CFF6FF' // light ice crystal
const GRAUPEL = '#9CA3AF' // heavy graupel
const MUTE = 'rgba(245,240,232,0.5)'

// Deterministic PRNG — fixed seed, no Math.random / Date.now anywhere.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hex = (c: string, a: number) =>
  `${c}${Math.max(0, Math.min(255, Math.round(a * 255)))
    .toString(16)
    .padStart(2, '0')}`

// Cloud geometry.
const CLOUD_TOP = 40
const CLOUD_BOT = 250
const GROUND_Y = 320
const SEED = 0x11a7
const N = 42 // particles

// The field threshold at which air breaks down. Charge accumulates toward it.
const BREAKDOWN = 100 // arbitrary meter units (represents ~3 MV/m)

type Kind = 'crystal' | 'graupel'
type P = {
  kind: Kind
  x: number
  y: number
  phase: number // seed for horizontal wobble
  flash: number // collision flash timer
}

export function ChargeSeparationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const lastRef = useRef<number | null>(null)
  const frameRef = useRef(0)

  const [running, setRunning] = useState(false)
  // field is the accumulated charge separation, 0..~BREAKDOWN+
  const [field, setField] = useState(0)
  const fieldRef = useRef(0)

  const partsRef = useRef<P[]>([])
  const rand = useRef(mulberry32(SEED))

  const initParticles = useCallback(() => {
    const r = mulberry32(SEED)
    rand.current = r
    const arr: P[] = []
    for (let i = 0; i < N; i++) {
      const kind: Kind = i % 2 === 0 ? 'crystal' : 'graupel'
      arr.push({
        kind,
        x: 90 + r() * (W - 180),
        y: CLOUD_TOP + 20 + r() * (CLOUD_BOT - CLOUD_TOP - 40),
        phase: r() * Math.PI * 2,
        flash: 0,
      })
    }
    partsRef.current = arr
  }, [])

  const update = useCallback((steps: number) => {
    const r = rand.current
    const parts = partsRef.current
    const f = frameRef.current
    for (const p of parts) {
      // Crystals rise (light), graupel falls (heavy) — the updraft sorts them.
      const vy = p.kind === 'crystal' ? -0.7 : 0.85
      p.y += vy * steps
      p.x += Math.sin(p.phase + f * 0.04) * 0.4 * steps
      if (p.flash > 0) p.flash -= steps

      // Recycle particles that leave the cloud, so the churn continues.
      if (p.kind === 'crystal' && p.y < CLOUD_TOP + 12) {
        p.y = CLOUD_BOT - 14
        p.x = 90 + r() * (W - 180)
      }
      if (p.kind === 'graupel' && p.y > CLOUD_BOT - 12) {
        p.y = CLOUD_TOP + 14
        p.x = 90 + r() * (W - 180)
      }
    }

    // Detect crystal/graupel collisions → charge transfer → field grows.
    let gained = 0
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i]
      if (a.kind !== 'crystal') continue
      for (let j = 0; j < parts.length; j++) {
        const b = parts[j]
        if (b.kind !== 'graupel') continue
        const dx = a.x - b.x
        const dy = a.y - b.y
        if (dx * dx + dy * dy < 100) {
          if (a.flash <= 0) {
            a.flash = 8
            b.flash = 8
            gained += 0.9
          }
        }
      }
    }
    fieldRef.current = Math.min(BREAKDOWN + 6, fieldRef.current + gained * steps)
  }, [])

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const f = frameRef.current
    const fld = fieldRef.current
    const frac = Math.min(1, fld / BREAKDOWN)

    // background
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    // ---- cloud body ----
    ctx.fillStyle = 'rgba(120,130,150,0.10)'
    ctx.beginPath()
    ctx.moveTo(70, CLOUD_BOT)
    ctx.lineTo(70, CLOUD_TOP + 40)
    ctx.quadraticCurveTo(70, CLOUD_TOP, 130, CLOUD_TOP)
    ctx.lineTo(W - 130, CLOUD_TOP)
    ctx.quadraticCurveTo(W - 70, CLOUD_TOP, W - 70, CLOUD_TOP + 40)
    ctx.lineTo(W - 70, CLOUD_BOT)
    ctx.closePath()
    ctx.fill()

    // ---- charge region tints: positive top, negative base ----
    const topGrad = ctx.createLinearGradient(0, CLOUD_TOP, 0, CLOUD_TOP + 80)
    topGrad.addColorStop(0, hex(ORANGE, 0.16 * (0.4 + 0.6 * frac)))
    topGrad.addColorStop(1, hex(ORANGE, 0))
    ctx.fillStyle = topGrad
    ctx.fillRect(70, CLOUD_TOP, W - 140, 80)

    const botGrad = ctx.createLinearGradient(0, CLOUD_BOT - 80, 0, CLOUD_BOT)
    botGrad.addColorStop(0, hex(BLUE, 0))
    botGrad.addColorStop(1, hex(BLUE, 0.20 * (0.4 + 0.6 * frac)))
    ctx.fillStyle = botGrad
    ctx.fillRect(70, CLOUD_BOT - 80, W - 140, 80)

    // charge symbols
    ctx.font = 'bold 13px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < 6; i++) {
      const cx = 110 + i * ((W - 220) / 5)
      ctx.fillStyle = hex(ORANGE, 0.35 + 0.5 * frac)
      ctx.fillText('+', cx, CLOUD_TOP + 18)
      ctx.fillStyle = hex(BLUE, 0.35 + 0.5 * frac)
      ctx.fillText('−', cx, CLOUD_BOT - 18)
    }

    // ---- particles ----
    for (const p of partsRef.current) {
      const isC = p.kind === 'crystal'
      const col = isC ? CRYSTAL : GRAUPEL
      const rr = isC ? 2.4 : 3.4
      if (p.flash > 0) {
        // collision spark
        ctx.fillStyle = hex(CYAN, 0.5 * (p.flash / 8))
        ctx.beginPath()
        ctx.arc(p.x, p.y, rr + 5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(p.x, p.y, rr, 0, Math.PI * 2)
      ctx.fillStyle = hex(col, 0.92)
      ctx.fill()
      // motion hint arrow
      const dir = isC ? -1 : 1
      ctx.strokeStyle = hex(col, 0.35)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x, p.y + dir * -6)
      ctx.stroke()
    }

    // ---- ground with induced positive charge under the cloud ----
    ctx.strokeStyle = 'rgba(245,240,232,0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, GROUND_Y)
    ctx.lineTo(W, GROUND_Y)
    ctx.stroke()
    ctx.fillStyle = 'rgba(80,70,55,0.5)'
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)
    ctx.font = 'bold 12px monospace'
    for (let i = 0; i < 7; i++) {
      const cx = 120 + i * ((W - 300) / 6)
      ctx.fillStyle = hex(ORANGE, 0.3 + 0.55 * frac)
      ctx.fillText('+', cx, GROUND_Y + 12)
    }
    ctx.textAlign = 'left'
    ctx.fillStyle = MUTE
    ctx.font = '9px monospace'
    ctx.fillText('induced + on ground', 12, GROUND_Y + 30)

    // labels
    ctx.fillStyle = hex(ORANGE, 0.8)
    ctx.font = '9px monospace'
    ctx.fillText('positive top (ice crystals rise ↑)', 80, CLOUD_TOP + 34)
    ctx.fillStyle = hex(BLUE, 0.85)
    ctx.fillText('negative base (graupel falls ↓)', 80, CLOUD_BOT - 34)

    // ---- field / breakdown meter on the right ----
    const mx = W - 44
    const mTop = CLOUD_TOP
    const mBot = CLOUD_BOT
    const mH = mBot - mTop
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fillRect(mx, mTop, 16, mH)
    // breakdown line
    ctx.strokeStyle = hex(CYAN, 0.9)
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(mx - 4, mTop)
    ctx.lineTo(mx + 22, mTop)
    ctx.stroke()
    ctx.setLineDash([])
    // fill
    const fh = mH * frac
    const near = frac > 0.92
    const barCol = near ? CYAN : frac > 0.6 ? ORANGE : BLUE
    ctx.fillStyle = hex(barCol, 0.85)
    ctx.fillRect(mx, mBot - fh, 16, fh)
    ctx.fillStyle = hex(CYAN, 0.9)
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('breakdown', mx + 8, mTop - 6)
    ctx.fillStyle = MUTE
    ctx.fillText('field', mx + 8, mBot + 12)
    ctx.textAlign = 'left'

    // breakdown glow when at threshold
    if (near) {
      const g = 0.5 + 0.5 * Math.sin(f * 0.3)
      ctx.strokeStyle = hex(CYAN, 0.5 * g)
      ctx.lineWidth = 2
      ctx.strokeRect(70, CLOUD_TOP, W - 140, CLOUD_BOT - CLOUD_TOP)
    }

    ctx.textBaseline = 'alphabetic'
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      initParticles()
      if (reduced) {
        // One static final frame: field at breakdown, charge fully separated.
        fieldRef.current = BREAKDOWN
        setField(BREAKDOWN)
        frameRef.current = 0
        render()
      } else {
        setRunning(true)
      }
    },
  })

  // devicePixelRatio-aware backing store.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.height = `${H}px`
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (partsRef.current.length === 0) initParticles()
    render()
  }, [render, initParticles])

  useEffect(() => {
    if (!running) {
      lastRef.current = null
      cancelAnimationFrame(rafRef.current)
      return
    }
    const loop = (t: number) => {
      if (lastRef.current === null) lastRef.current = t
      const dt = Math.min(64, t - lastRef.current)
      lastRef.current = t
      const steps = dt / 16.7
      frameRef.current += steps
      update(steps)
      render()
      setField(fieldRef.current)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, update, render])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    lastRef.current = null
    frameRef.current = 0
    fieldRef.current = 0
    setField(0)
    initParticles()
    render()
  }

  const pct = Math.round(Math.min(1, field / BREAKDOWN) * 100)
  const status =
    pct >= 100 ? 'air breaks down — spark!' : pct > 60 ? 'field rising fast' : 'separating charge'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-canvas">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: '#0F0D0A' }}
        />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-accent-blue">base: negative</span>
        <span className="text-accent-orange">top: positive</span>
        <span>
          field:{' '}
          <span style={{ color: CYAN }}>
            {pct}% of breakdown
          </span>
        </span>
        <span className="ml-auto" style={{ color: CYAN }}>
          {status}
        </span>
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
        <span className="ml-auto text-xs text-text-muted">
          updraft sorts ice by weight → collisions transfer charge → field climbs to breakdown
        </span>
      </div>
    </div>
  )
}
