'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

const LIME = '#A3E635'      // viral genome / provirus
const C_MEMB = '#60A5FA'    // blue  — host cell / chromosome
const C_CAPSID = '#F59E0B'  // gold  — capsid
const C_STRESS = '#FB923C'  // orange — induction trigger
const C_BURST = '#F87171'   // red   — lysis
const DIM = 'rgba(245,240,232,0.42)'

const SPEED = 0.0026

type Mode = 'lytic' | 'lysogenic'

// Lytic stage boundaries (fractions of p)
const LY_COPY = 0.22
const LY_BURST = 0.72

// Lysogenic stage boundaries
const LG_INTEGRATE = 0.14
const LG_DIVIDE = 0.30
const LG_TRIGGER = 0.72
const LG_BURST = 0.86

// One bacterium: rounded body, circular chromosome, optional integrated provirus,
// optional free viral genome copies, optional lysis burst (0..1).
function bacterium(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  opts: { provirus?: boolean; copies?: number; burst?: number; excising?: number }
) {
  const rx = 46 * s
  const ry = 34 * s
  const burst = opts.burst ?? 0

  // body
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(96,165,250,0.06)'
  ctx.fill()
  if (burst > 0.55) {
    ctx.strokeStyle = `${C_BURST}88`
    ctx.lineWidth = 2
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + burst
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx + burst * 8, ry + burst * 8, 0, a, a + Math.PI / 6)
      ctx.stroke()
    }
  } else {
    ctx.strokeStyle = C_MEMB
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // circular chromosome
  const cr = 20 * s
  ctx.strokeStyle = burst > 0.55 ? `${C_MEMB}66` : C_MEMB
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, cr, 0, Math.PI * 2)
  ctx.stroke()

  // integrated provirus — a lime arc riding on the chromosome loop
  if (opts.provirus) {
    ctx.strokeStyle = LIME
    ctx.lineWidth = 3.4
    ctx.beginPath()
    ctx.arc(cx, cy, cr, -0.5, 0.9)
    ctx.stroke()
  }

  // provirus excising back into a free loop
  if (opts.excising && opts.excising > 0) {
    const e = opts.excising
    ctx.strokeStyle = LIME
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.arc(cx + e * 18, cy - e * 14, 7 * s + e * 3, 0, Math.PI * 2)
    ctx.stroke()
  }

  // free viral genome copies floating in the cytoplasm
  const copies = opts.copies ?? 0
  for (let i = 0; i < copies; i++) {
    const a = i * 2.399
    const rr = (10 + (i % 3) * 9) * s
    const gx = cx + Math.cos(a) * rr
    const gy = cy + Math.sin(a) * rr
    ctx.strokeStyle = LIME
    ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.arc(gx, gy, 5 * s, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function freeVirion(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * Math.PI / 3
    const px = x + r * Math.cos(a)
    const py = y + r * Math.sin(a)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = `${C_CAPSID}2a`
  ctx.fill()
  ctx.strokeStyle = C_CAPSID
  ctx.lineWidth = 1.6
  ctx.stroke()
}

export function LyticLysogenicAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [p, setP] = useState(0)
  const [running, setRunning] = useState(false)
  const [mode, setMode] = useState<Mode>('lysogenic')

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
    ctx.font = '10px monospace'
    ctx.lineJoin = 'round'
    ctx.textAlign = 'center'

    let stage = ''
    let desc = ''
    let stageColor = LIME

    if (mode === 'lytic') {
      // Incoming genome, then rapid copying, then burst — one central cell.
      const cx = W / 2
      const cy = 168
      if (p < LY_COPY) {
        stage = 'Infection'
        desc = 'Viral genome enters, staying separate from the host chromosome.'
        stageColor = LIME
        const f = p / LY_COPY
        bacterium(ctx, cx, cy, 1.4, { copies: 1 })
        // genome flying in from the left
        const gx = 70 + (cx - 60 - 70) * Math.min(1, f * 1.2)
        ctx.strokeStyle = LIME
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(gx, cy - 40, 6, 0, Math.PI * 2)
        ctx.stroke()
      } else if (p < LY_BURST) {
        stage = 'Replication'
        desc = 'The host machinery is forced to churn out copies — dozens per cell.'
        stageColor = C_CAPSID
        const f = (p - LY_COPY) / (LY_BURST - LY_COPY)
        const n = 1 + Math.floor(f * 11)
        bacterium(ctx, cx, cy, 1.4, { copies: n })
      } else {
        stage = 'Lysis'
        desc = 'The cell bursts within hours, releasing a swarm of new virions.'
        stageColor = C_BURST
        const f = (p - LY_BURST) / (1 - LY_BURST)
        bacterium(ctx, cx, cy, 1.4, { burst: f })
        for (let i = 0; i < 12; i++) {
          const a = i * (Math.PI * 2 / 12)
          const rr = 40 + f * 200
          freeVirion(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 9)
        }
      }
    } else {
      // Lysogenic: integrate, replicate passively through divisions, then induce.
      if (p < LG_INTEGRATE) {
        stage = 'Infection'
        desc = 'The genome enters the cell, exactly as in the lytic path.'
        stageColor = LIME
        const cx = W / 2
        const cy = 168
        const f = p / LG_INTEGRATE
        bacterium(ctx, cx, cy, 1.4, { copies: 1 })
        const gx = 70 + (cx - 60 - 70) * Math.min(1, f * 1.2)
        ctx.strokeStyle = LIME
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(gx, cy - 40, 6, 0, Math.PI * 2)
        ctx.stroke()
      } else if (p < LG_DIVIDE) {
        stage = 'Integration'
        desc = 'The viral genome splices into the host chromosome as a silent provirus.'
        stageColor = LIME
        bacterium(ctx, W / 2, 168, 1.4, { provirus: true })
        ctx.fillStyle = LIME
        ctx.fillText('provirus (integrated, silent)', W / 2, 260)
      } else if (p < LG_TRIGGER) {
        stage = 'Passive replication'
        const f = (p - LG_DIVIDE) / (LG_TRIGGER - LG_DIVIDE)
        const gen = Math.min(3, Math.floor(f * 4))
        const n = Math.pow(2, gen)
        desc = `The provirus is copied with the chromosome at every division — carried into all ${n} descendant cells.`
        stageColor = LIME
        // layout n cells in a grid within the scene box
        const cols = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 2 : 4
        const rows = Math.ceil(n / cols)
        const bw = 520 / cols
        const bh = 210 / rows
        const s = Math.min(bw / 110, bh / 90, 1.4)
        for (let i = 0; i < n; i++) {
          const c = i % cols
          const r = Math.floor(i / cols)
          const cx = 40 + bw * (c + 0.5)
          const cy = 70 + bh * (r + 0.5)
          bacterium(ctx, cx, cy, s, { provirus: true })
        }
        ctx.fillStyle = DIM
        ctx.fillText(`generation ${gen} · ${n} cell${n === 1 ? '' : 's'}, every one carries the provirus`, W / 2, H - 26)
      } else if (p < LG_BURST) {
        stage = 'Induction'
        desc = 'A stress signal (UV, chemicals) flips the switch — the provirus excises and goes lytic.'
        stageColor = C_STRESS
        const cx = W / 2
        const cy = 168
        const f = (p - LG_TRIGGER) / (LG_BURST - LG_TRIGGER)
        bacterium(ctx, cx, cy, 1.4, { provirus: f < 0.5, excising: f >= 0.5 ? (f - 0.5) * 2 : 0 })
        // lightning stress bolt
        ctx.strokeStyle = C_STRESS
        ctx.lineWidth = 2.2
        ctx.beginPath()
        ctx.moveTo(cx - 120, 60)
        ctx.lineTo(cx - 98, 92)
        ctx.lineTo(cx - 112, 96)
        ctx.lineTo(cx - 88, 128)
        ctx.stroke()
        ctx.fillStyle = C_STRESS
        ctx.fillText('stress trigger', cx - 104, 48)
      } else {
        stage = 'Lysis'
        desc = 'Now identical to the lytic ending: copy, assemble, and burst.'
        stageColor = C_BURST
        const cx = W / 2
        const cy = 168
        const f = (p - LG_BURST) / (1 - LG_BURST)
        bacterium(ctx, cx, cy, 1.4, { burst: f })
        for (let i = 0; i < 12; i++) {
          const a = i * (Math.PI * 2 / 12)
          const rr = 40 + f * 200
          freeVirion(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 9)
        }
      }
    }

    // header label
    ctx.textAlign = 'left'
    ctx.fillStyle = mode === 'lytic' ? C_BURST : LIME
    ctx.font = '11px monospace'
    ctx.fillText(mode === 'lytic' ? 'LYTIC PATH' : 'LYSOGENIC PATH', 16, 22)

    // progress bar
    ctx.fillStyle = 'rgba(245,240,232,0.12)'
    ctx.fillRect(14, H - 12, W - 28, 3)
    ctx.fillStyle = stageColor
    ctx.fillRect(14, H - 12, (W - 28) * p, 3)

    // expose current stage text for the readout via canvas title-less approach: nothing here
    ctx.font = '10px monospace'
    ctx.fillStyle = stageColor
    ctx.textAlign = 'center'
    ctx.fillText(stage, W / 2, 40)
    void desc
  }, [p, mode])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(rafRef.current); return }
    const loop = () => {
      setP(prev => {
        const next = prev + SPEED
        if (next >= 1) { setRunning(false); return 1 }
        return next
      })
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const { ref } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setP(1); return }
      setRunning(true)
    },
  })

  const toggle = () => {
    if (p >= 1) setP(0)
    setRunning(r => !r)
  }
  const resetAll = () => {
    setRunning(false)
    setP(0)
  }
  const pick = (m: Mode) => {
    setMode(m)
    setRunning(false)
    setP(0)
  }

  // readout description mirrors the current stage
  const readout = (() => {
    if (mode === 'lytic') {
      if (p < LY_COPY) return { s: 'Infection', d: 'Genome enters, kept separate from the host chromosome.', c: LIME }
      if (p < LY_BURST) return { s: 'Replication', d: 'Host machinery is forced to mass-produce virions immediately.', c: C_CAPSID }
      return { s: 'Lysis', d: 'The cell bursts within hours, releasing new virions.', c: C_BURST }
    }
    if (p < LG_INTEGRATE) return { s: 'Infection', d: 'Genome enters — same first move as the lytic path.', c: LIME }
    if (p < LG_DIVIDE) return { s: 'Integration', d: 'Genome splices into the host DNA as a silent provirus.', c: LIME }
    if (p < LG_TRIGGER) return { s: 'Passive replication', d: 'Provirus is copied at every division, riding along in every descendant.', c: LIME }
    if (p < LG_BURST) return { s: 'Induction', d: 'Stress flips the switch: the provirus excises and turns lytic.', c: C_STRESS }
    return { s: 'Lysis', d: 'Identical lytic ending — copy, assemble, burst.', c: C_BURST }
  })()

  const modeBtn = (m: Mode, label: string) => (
    <button
      onClick={() => pick(m)}
      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
      style={
        mode === m
          ? { background: LIME, color: '#0F0D0A', borderColor: LIME }
          : { background: 'transparent', color: 'var(--color-text-secondary)', borderColor: 'var(--color-border)' }
      }
    >
      {label}
    </button>
  )

  return (
    <div className="animation-block" ref={ref}>
      <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
        <span style={{ color: readout.c }}>{readout.s}</span>
        <span>{readout.d}</span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> {p >= 1 ? 'Replay' : 'Play'}</>}
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border text-text-secondary hover:text-text-primary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <div className="ml-auto flex items-center gap-2">
          {modeBtn('lytic', 'Lytic')}
          {modeBtn('lysogenic', 'Lysogenic')}
        </div>
      </div>
    </div>
  )
}
