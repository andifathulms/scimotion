'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 380
const DURATION = 22 // seconds for the bolus to traverse the whole tract

const PINK = '#F472B6'
const BLUE = '#60A5FA'
const TEAL = '#10B981'
const ORANGE = '#FB923C'
const MUTED = 'rgba(245,240,232,0.22)'

type Stage = 'mouth' | 'esophagus' | 'stomach' | 'small' | 'large'

const STAGE_INFO: Record<Stage, { label: string; color: string; note: string }> = {
  mouth: { label: 'Mouth', color: BLUE, note: 'Chewing + salivary amylase begin carbohydrate digestion.' },
  esophagus: { label: 'Esophagus', color: MUTED, note: 'Peristalsis pushes the bolus down. No digestion or absorption.' },
  stomach: { label: 'Stomach', color: ORANGE, note: 'Acid + pepsin start protein digestion; muscular churning. Nutritionally, it absorbs almost nothing.' },
  small: { label: 'Small intestine', color: PINK, note: 'Pancreatic enzymes + bile finish carbs, proteins and fats — and villi absorb the monomers into the blood. MOST digestion and nearly ALL absorption happen here.' },
  large: { label: 'Large intestine', color: TEAL, note: 'Water reabsorption + gut microbiome; the residue is compacted into stool.' },
}

// Build the tract centreline as a polyline. Each segment carries the stage of
// its starting vertex. The small intestine is a long serpentine coil so the
// bolus spends most of its journey — and the animation emphasises — there.
type V = { x: number; y: number; s: Stage }
function buildPath() {
  const raw: V[] = [
    { x: 58, y: 38, s: 'mouth' },
    { x: 58, y: 64, s: 'esophagus' },
    { x: 58, y: 132, s: 'stomach' },
    { x: 96, y: 144, s: 'stomach' },
    { x: 132, y: 162, s: 'stomach' },
    { x: 152, y: 192, s: 'stomach' },
    { x: 128, y: 216, s: 'stomach' },
    { x: 98, y: 208, s: 'stomach' },
    { x: 94, y: 236, s: 'small' },
  ]
  // serpentine small intestine
  const xL = 80
  const xR = 448
  const rows = [256, 278, 300, 322]
  let prevX = 94
  raw.push({ x: prevX, y: rows[0], s: 'small' })
  for (let i = 0; i < rows.length; i++) {
    const y = rows[i]
    const goRight = i % 2 === 0
    const from = goRight ? xL : xR
    const to = goRight ? xR : xL
    raw.push({ x: from, y, s: 'small' })
    raw.push({ x: to, y, s: 'small' })
    if (i < rows.length - 1) raw.push({ x: to, y: rows[i + 1], s: 'small' })
    prevX = to
  }
  raw.push({ x: 300, y: rows[rows.length - 1], s: 'small' })
  // large intestine framing the coil: cecum, ascending, transverse, descending, rectum
  raw.push({ x: 300, y: 346, s: 'large' })
  raw.push({ x: 496, y: 346, s: 'large' })
  raw.push({ x: 496, y: 108, s: 'large' })
  raw.push({ x: 196, y: 108, s: 'large' })
  raw.push({ x: 196, y: 172, s: 'large' })
  raw.push({ x: 228, y: 200, s: 'large' })
  raw.push({ x: 228, y: 226, s: 'large' })

  const cum: number[] = [0]
  for (let i = 1; i < raw.length; i++) {
    const dx = raw[i].x - raw[i - 1].x
    const dy = raw[i].y - raw[i - 1].y
    cum.push(cum[i - 1] + Math.hypot(dx, dy))
  }
  const total = cum[cum.length - 1]
  // fraction at which each stage first ends
  const stageEnd: Record<Stage, number> = { mouth: 0, esophagus: 0, stomach: 0, small: 0, large: 1 }
  for (let i = 0; i < raw.length - 1; i++) {
    const s = raw[i].s
    stageEnd[s] = Math.max(stageEnd[s], cum[i + 1] / total)
  }
  return { pts: raw, cum, total, stageEnd }
}

const PATH = buildPath()

function posAt(sFrac: number): { x: number; y: number; stage: Stage } {
  const target = sFrac * PATH.total
  const { pts, cum } = PATH
  for (let i = 1; i < pts.length; i++) {
    if (cum[i] >= target) {
      const seg = cum[i] - cum[i - 1] || 1
      const t = (target - cum[i - 1]) / seg
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
        stage: pts[i - 1].s,
      }
    }
  }
  const last = pts[pts.length - 1]
  return { x: last.x, y: last.y, stage: 'large' }
}

// Piecewise progress metrics keyed to arc-length fraction. Absorption stays
// near zero until the small intestine, then climbs steeply — the whole point.
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}
function metricsAt(f: number) {
  const e = PATH.stageEnd
  let digestion: number
  let absorption: number
  if (f <= e.mouth) {
    digestion = lerp(0, 5, f / e.mouth)
    absorption = 0
  } else if (f <= e.esophagus) {
    digestion = 5
    absorption = 0
  } else if (f <= e.stomach) {
    digestion = lerp(5, 20, (f - e.esophagus) / (e.stomach - e.esophagus))
    absorption = lerp(0, 1, (f - e.esophagus) / (e.stomach - e.esophagus))
  } else if (f <= e.small) {
    digestion = lerp(20, 97, (f - e.stomach) / (e.small - e.stomach))
    absorption = lerp(1, 95, (f - e.stomach) / (e.small - e.stomach))
  } else {
    digestion = lerp(97, 100, (f - e.small) / (1 - e.small))
    absorption = lerp(95, 100, (f - e.small) / (1 - e.small))
  }
  return { digestion, absorption }
}

export function DigestiveTractAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [running, setRunning] = useState(false)
  const [reducedStatic, setReducedStatic] = useState(false)
  const [readout, setReadout] = useState({ stage: 'mouth' as Stage, dig: 0, abs: 0, pct: 0 })
  const progRef = useRef(0) // 0..1 along the tract
  const lastRef = useRef({ stage: 'mouth' as Stage, dig: -1, abs: -1 })

  const setup = useCallback((): CanvasRenderingContext2D | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const bw = Math.round(W * dpr)
    const bh = Math.round(H * dpr)
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw
      canvas.height = bh
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return ctx
  }, [])

  const drawScene = useCallback((p: number) => {
    const ctx = setup()
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    const active = posAt(p).stage

    // glow behind the small-intestine coil to emphasise it
    ctx.save()
    ctx.strokeStyle = 'rgba(244,114,182,0.14)'
    ctx.lineWidth = 26
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    let started = false
    for (let i = 1; i < PATH.pts.length; i++) {
      if (PATH.pts[i - 1].s === 'small') {
        if (!started) { ctx.moveTo(PATH.pts[i - 1].x, PATH.pts[i - 1].y); started = true }
        ctx.lineTo(PATH.pts[i].x, PATH.pts[i].y)
      }
    }
    ctx.stroke()
    ctx.restore()

    // tract tube, coloured per stage
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let i = 1; i < PATH.pts.length; i++) {
      const s = PATH.pts[i - 1].s
      const info = STAGE_INFO[s]
      const isActive = s === active
      ctx.strokeStyle = info.color
      ctx.globalAlpha = isActive ? 1 : s === 'small' ? 0.8 : 0.55
      ctx.lineWidth = s === 'small' ? 13 : 11
      ctx.beginPath()
      ctx.moveTo(PATH.pts[i - 1].x, PATH.pts[i - 1].y)
      ctx.lineTo(PATH.pts[i].x, PATH.pts[i].y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // bolus position + a trailing peristaltic squeeze
    const pos = posAt(p)
    const trail = posAt(Math.max(0, p - 0.012))
    ctx.strokeStyle = 'rgba(245,240,232,0.65)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(trail.x, trail.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()

    ctx.fillStyle = '#F5F0E8'
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, 6.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = STAGE_INFO[pos.stage].color
    ctx.lineWidth = 2.5
    ctx.stroke()

    // stage callouts
    ctx.font = '11px monospace'
    ctx.textAlign = 'left'
    const label = (text: string, x: number, y: number, s: Stage) => {
      ctx.fillStyle = s === active ? STAGE_INFO[s].color : 'rgba(245,240,232,0.42)'
      ctx.fillText(text, x, y)
    }
    label('Mouth', 74, 40, 'mouth')
    label('Esophagus', 74, 100, 'esophagus')
    label('Stomach', 168, 178, 'stomach')
    label('Large intestine', 336, 100, 'large')

    // small-intestine emphasis banner
    ctx.textAlign = 'center'
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = active === 'small' ? PINK : 'rgba(244,114,182,0.75)'
    ctx.fillText('SMALL INTESTINE — most digestion + nearly all absorption', W / 2, 356)
  }, [setup])

  const pushReadout = useCallback((p: number) => {
    const stage = posAt(p).stage
    const m = metricsAt(p)
    const dig = Math.round(m.digestion)
    const abs = Math.round(m.absorption)
    const l = lastRef.current
    if (l.stage !== stage || l.dig !== dig || l.abs !== abs) {
      lastRef.current = { stage, dig, abs }
      setReadout({ stage, dig, abs, pct: Math.round(p * 100) })
    }
  }, [])

  // static (reduced-motion) frame: bolus mid small-intestine
  useEffect(() => {
    if (!reducedStatic) return
    progRef.current = 0.62
    drawScene(0.62)
    pushReadout(0.62)
  }, [reducedStatic, drawScene, pushReadout])

  // animation loop
  useEffect(() => {
    if (!running || reducedStatic) return
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      progRef.current += dt / DURATION
      if (progRef.current >= 1) progRef.current = 0 // loop the journey
      drawScene(progRef.current)
      pushReadout(progRef.current)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [running, reducedStatic, drawScene, pushReadout])

  // paint an idle frame
  useEffect(() => {
    if (running || reducedStatic) return
    drawScene(progRef.current)
    pushReadout(progRef.current)
  }, [running, reducedStatic, drawScene, pushReadout])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setReducedStatic(true); return }
      setRunning(true)
    },
  })

  const reset = () => {
    triggerReset()
    setRunning(false)
    setReducedStatic(false)
    progRef.current = 0
    lastRef.current = { stage: 'mouth', dig: -1, abs: -1 }
    drawScene(0)
    pushReadout(0)
  }

  const info = STAGE_INFO[readout.stage]

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · The bolus travels the tract
        </span>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          Stage: <strong style={{ color: info.color }}>{info.label}</strong>
        </span>
        <span>
          chemical digestion <strong className="text-accent-gold">{readout.dig}%</strong>
        </span>
        <span>
          nutrient absorption <strong style={{ color: PINK }}>{readout.abs}%</strong>
        </span>
        <span className="w-full text-text-muted">{info.note}</span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { setReducedStatic(false); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
    </div>
  )
}
