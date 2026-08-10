'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

const CX = 350
const CY = 188
const R = 128

const LIME = '#A3E635'      // viral genome
const C_CAPSID = '#F59E0B'  // gold  — capsid protein
const C_MEMB = '#60A5FA'    // blue  — host membrane
const C_RIBO = '#A78BFA'    // violet — host ribosome
const C_RECEPTOR = '#10B981'// teal  — surface receptor
const DIM = 'rgba(245,240,232,0.42)'

const SPEED = 0.0032        // progress per frame
const N_NEW = 6             // new virions built inside the cell

type Step = { key: string; t0: number; label: string; desc: string; color: string }
const STEPS: Step[] = [
  { key: 'attach', t0: 0.0, label: '1 · Attachment', desc: 'The virus docks onto a matching surface receptor — host-specific, like a key fitting one lock.', color: C_RECEPTOR },
  { key: 'entry', t0: 0.17, label: '2 · Entry', desc: 'The genome (DNA or RNA) enters the cell. The empty protein capsid is left behind.', color: LIME },
  { key: 'copy', t0: 0.32, label: '3 · Host machinery hijacked', desc: 'The HOST ribosomes and enzymes copy the viral genome and build new capsid proteins.', color: C_RIBO },
  { key: 'assemble', t0: 0.60, label: '4 · Assembly', desc: 'New genomes and capsids self-assemble into complete virions.', color: C_CAPSID },
  { key: 'lysis', t0: 0.82, label: '5 · Lysis & release', desc: 'The cell bursts, freeing the virions. The host cell did every bit of the work.', color: '#F87171' },
]

function stepAt(p: number): number {
  let idx = 0
  for (let i = 0; i < STEPS.length; i++) if (p >= STEPS[i].t0) idx = i
  return idx
}

// A short genetic-material squiggle centred on (x, y).
function genome(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, color: string, w: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let i = 0; i <= len; i++) {
    const gx = x - len * 0.45 + i * 0.9
    const gy = y + Math.sin(i * 0.7) * 3.4
    if (i === 0) ctx.moveTo(gx, gy)
    else ctx.lineTo(gx, gy)
  }
  ctx.stroke()
}

// A complete virion: hexagonal capsid, spikes, a fleck of genome inside.
function virion(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, withGenome: boolean) {
  ctx.save()
  // spikes
  ctx.strokeStyle = C_CAPSID
  ctx.lineWidth = 1.4
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    ctx.lineTo(x + Math.cos(a) * (r + 4), y + Math.sin(a) * (r + 4))
    ctx.stroke()
  }
  // capsid
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
  ctx.lineWidth = 1.8
  ctx.stroke()
  if (withGenome) {
    ctx.strokeStyle = LIME
    ctx.lineWidth = 1.6
    ctx.beginPath()
    for (let i = 0; i <= 8; i++) {
      const gx = x - 4 + i * 1
      const gy = y + Math.sin(i * 1.1) * 2.4
      if (i === 0) ctx.moveTo(gx, gy)
      else ctx.lineTo(gx, gy)
    }
    ctx.stroke()
  }
  ctx.restore()
}

export function ViralReplicationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [p, setP] = useState(0)
  const [running, setRunning] = useState(false)

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

    const idx = stepAt(p)
    const key = STEPS[idx].key
    const attachP = { x: CX - R - 6, y: CY }

    // --- Host cell -----------------------------------------------------------
    const bursting = key === 'lysis'
    const burstF = bursting ? Math.min(1, (p - STEPS[4].t0) / (1 - STEPS[4].t0)) : 0

    // cytoplasm
    ctx.beginPath()
    ctx.arc(CX, CY, R, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(96,165,250,0.05)'
    ctx.fill()

    // membrane — solid until lysis, then drawn as retreating broken arcs
    if (!bursting) {
      ctx.beginPath()
      ctx.arc(CX, CY, R, 0, Math.PI * 2)
      ctx.strokeStyle = C_MEMB
      ctx.lineWidth = 2.4
      ctx.stroke()
    } else {
      ctx.strokeStyle = `${C_MEMB}${burstF > 0.6 ? '55' : 'aa'}`
      ctx.lineWidth = 2.2
      for (let s = 0; s < 10; s++) {
        const a0 = s * (Math.PI / 5) + burstF * 0.3
        ctx.beginPath()
        ctx.arc(CX, CY, R + burstF * 10, a0, a0 + Math.PI / 8)
        ctx.stroke()
      }
    }

    // receptors around the rim; the docking one (left) is highlighted
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6
      const rx = CX + Math.cos(a) * R
      const ry = CY + Math.sin(a) * R
      const active = Math.abs(a - Math.PI) < 0.01
      ctx.strokeStyle = active && idx === 0 ? C_RECEPTOR : `${C_RECEPTOR}66`
      ctx.lineWidth = active ? 2.2 : 1.4
      ctx.beginPath()
      ctx.moveTo(rx, ry)
      ctx.lineTo(rx + Math.cos(a) * 7, ry + Math.sin(a) * 7)
      ctx.stroke()
    }
    ctx.fillStyle = DIM
    ctx.textAlign = 'center'
    ctx.fillText('host cell', CX, CY + R - 10)
    ctx.fillStyle = C_RECEPTOR
    ctx.fillText('receptor', attachP.x - 18, attachP.y - 12)
    ctx.textAlign = 'left'

    // --- Host ribosomes (do the actual synthesis) ----------------------------
    const glow = key === 'copy'
    for (let i = 0; i < 7; i++) {
      const a = i * 2.399
      const rr = 44 + (i % 3) * 26
      const rx = CX + Math.cos(a) * rr
      const ry = CY + Math.sin(a) * rr
      ctx.beginPath()
      ctx.arc(rx, ry, glow ? 5 : 3.4, 0, Math.PI * 2)
      ctx.fillStyle = glow ? C_RIBO : `${C_RIBO}88`
      ctx.fill()
    }
    if (glow) {
      ctx.fillStyle = C_RIBO
      ctx.textAlign = 'center'
      ctx.fillText('host ribosomes at work', CX, CY - R + 20)
      ctx.textAlign = 'left'
    }

    // --- Step-specific overlays ---------------------------------------------
    if (key === 'attach') {
      const f = Math.min(1, p / STEPS[1].t0)
      const vx = 60 + (attachP.x - 60) * f
      const vy = (CY - 64) + (attachP.y - (CY - 64)) * f
      virion(ctx, vx, vy, 15, true)
    } else if (key === 'entry') {
      const f = (p - STEPS[1].t0) / (STEPS[2].t0 - STEPS[1].t0)
      virion(ctx, attachP.x - 4, attachP.y, 15, false) // empty capsid left outside
      const gx = attachP.x + (CX - attachP.x) * Math.min(1, f * 1.1)
      genome(ctx, gx, CY, 26, LIME, 2.4)
      ctx.fillStyle = LIME
      ctx.textAlign = 'center'
      ctx.fillText('genome enters', gx, CY - 14)
      ctx.textAlign = 'left'
    } else if (key === 'copy') {
      const f = (p - STEPS[2].t0) / (STEPS[3].t0 - STEPS[2].t0)
      const nGenome = 1 + Math.floor(f * 5)
      const nCapsid = Math.floor(f * 5)
      for (let i = 0; i < nGenome; i++) {
        const a = i * 1.9 + 0.4
        const rr = 30 + (i % 3) * 30
        genome(ctx, CX + Math.cos(a) * rr, CY + Math.sin(a) * rr, 20, LIME, 2)
      }
      for (let i = 0; i < nCapsid; i++) {
        const a = i * 2.3 + 2.2
        const rr = 46 + (i % 2) * 34
        virion(ctx, CX + Math.cos(a) * rr, CY + Math.sin(a) * rr, 9, false)
      }
    } else if (key === 'assemble') {
      const f = (p - STEPS[3].t0) / (STEPS[4].t0 - STEPS[3].t0)
      const nDone = Math.floor(f * N_NEW + 0.001)
      for (let i = 0; i < N_NEW; i++) {
        const a = i * (Math.PI * 2 / N_NEW)
        const rr = 74
        virion(ctx, CX + Math.cos(a) * rr, CY + Math.sin(a) * rr, 12, i < nDone)
      }
    } else if (key === 'lysis') {
      for (let i = 0; i < N_NEW; i++) {
        const a = i * (Math.PI * 2 / N_NEW)
        const rr = 74 + burstF * (R + 60)
        const vx = CX + Math.cos(a) * rr
        const vy = CY + Math.sin(a) * rr
        virion(ctx, vx, vy, 12, true)
      }
      ctx.fillStyle = '#F87171'
      ctx.textAlign = 'center'
      ctx.fillText('lysis — virions released', CX, 24)
      ctx.textAlign = 'left'
    }

    // progress bar
    ctx.fillStyle = 'rgba(245,240,232,0.12)'
    ctx.fillRect(14, H - 12, W - 28, 3)
    ctx.fillStyle = LIME
    ctx.fillRect(14, H - 12, (W - 28) * p, 3)
  }, [p])

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

  const cur = STEPS[stepAt(p)]

  return (
    <div className="animation-block" ref={ref}>
      <canvas role="img" aria-label="Animated diagram: Viral replication. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
        <span style={{ color: cur.color }}>{cur.label}</span>
        <span>{cur.desc}</span>
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
        <span className="ml-auto text-xs text-text-muted">the lytic cycle · host cell does the work</span>
      </div>
    </div>
  )
}
