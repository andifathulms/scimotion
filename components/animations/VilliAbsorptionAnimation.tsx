'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 320
const N = 52 // digested monomers raining onto the wall

const PINK = '#F472B6'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const TEAL = '#10B981'

const FLAT_SURFACE = 214 // y of a smooth, flat gut wall
const VILLI_BASE = 236 // y where villi columns spring from
const VILLI_TIP = 96 // y the villi tips reach up into the lumen
const N_VILLI = 15

// Absorbed monomers dock, then sink into the capillary bed below. Villi expose
// a folded surface right up in the lumen, so a monomer is captured after a short
// fall and a brief dock; a flat wall offers a thin surface far below, so capture
// is slow and molecules pile up — that gap is the surface-area story.
const DOCK_VILLI = 4
const DOCK_FLAT = 46

type Kind = 0 | 1 | 2 // sugar, amino acid, fatty acid
const KIND_COLOR = [GOLD, BLUE, TEAL]
const KIND_LABEL = ['sugars', 'amino acids', 'fatty acids']

type Particle = {
  x: number
  baseX: number
  y: number
  vy: number
  kind: Kind
  docked: boolean
  dwell: number
  absorbed: boolean
  spawnY: number
}

// deterministic hash -> [0,1): no Math.random / Date
function h(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

function makeParticles(): Particle[] {
  const arr: Particle[] = []
  for (let i = 0; i < N; i++) {
    const x = 24 + h(i, 1) * (W - 48)
    const spawnY = -h(i, 2) * 260 // staggered above the lumen
    arr.push({
      x,
      baseX: x,
      y: spawnY,
      vy: 0.8 + h(i, 3) * 0.9,
      kind: (i % 3) as Kind,
      docked: false,
      dwell: 0,
      absorbed: false,
      spawnY,
    })
  }
  return arr
}

// villus centreline x at index, and a per-villus tip height for an organic look
function villusX(i: number) {
  return ((i + 0.5) / N_VILLI) * W
}
function villusTip(i: number) {
  return VILLI_TIP + 10 * Math.sin(i * 1.7)
}

export function VilliAbsorptionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [villi, setVilli] = useState(true)
  const [running, setRunning] = useState(false)
  const [reducedStatic, setReducedStatic] = useState(false)
  const [absorbed, setAbsorbed] = useState(0)
  const villiRef = useRef(villi)
  const particlesRef = useRef<Particle[]>(makeParticles())
  const absorbedRef = useRef(0)
  useEffect(() => { villiRef.current = villi }, [villi])

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

  const drawWall = useCallback((ctx: CanvasRenderingContext2D, hasVilli: boolean) => {
    // blood / lymph bed at the bottom
    ctx.fillStyle = 'rgba(96,165,250,0.10)'
    ctx.fillRect(0, VILLI_BASE, W, H - VILLI_BASE)
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('blood capillaries + lacteal (lymph)', 10, H - 10)

    if (hasVilli) {
      for (let i = 0; i < N_VILLI; i++) {
        const cx = villusX(i)
        const tip = villusTip(i)
        const wdt = (W / N_VILLI) * 0.66
        // villus body
        ctx.fillStyle = 'rgba(244,114,182,0.20)'
        ctx.strokeStyle = 'rgba(244,114,182,0.55)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx - wdt / 2, VILLI_BASE)
        ctx.lineTo(cx - wdt / 2, tip + 8)
        ctx.arc(cx, tip + 8, wdt / 2, Math.PI, 0)
        ctx.lineTo(cx + wdt / 2, VILLI_BASE)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        // capillary loop inside the villus
        ctx.strokeStyle = 'rgba(239,68,68,0.55)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx - 3, VILLI_BASE)
        ctx.lineTo(cx - 3, tip + 16)
        ctx.arc(cx, tip + 16, 3, Math.PI, 0)
        ctx.lineTo(cx + 3, VILLI_BASE)
        ctx.stroke()
        // microvilli brush border at the tip
        ctx.strokeStyle = 'rgba(244,114,182,0.8)'
        ctx.lineWidth = 1
        for (let m = 0; m < 7; m++) {
          const mx = cx - wdt / 2 + (m / 6) * wdt
          ctx.beginPath()
          ctx.moveTo(mx, tip + 6)
          ctx.lineTo(mx, tip - 2)
          ctx.stroke()
        }
      }
      ctx.fillStyle = PINK
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('villi + microvilli — folded wall, huge surface', W / 2, VILLI_TIP - 22)
    } else {
      ctx.fillStyle = 'rgba(244,114,182,0.18)'
      ctx.fillRect(0, FLAT_SURFACE, W, VILLI_BASE - FLAT_SURFACE)
      ctx.strokeStyle = 'rgba(244,114,182,0.6)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, FLAT_SURFACE)
      ctx.lineTo(W, FLAT_SURFACE)
      ctx.stroke()
      ctx.fillStyle = 'rgba(244,114,182,0.85)'
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('flat wall — one thin absorptive line', W / 2, FLAT_SURFACE - 12)
    }
  }, [])

  const drawScene = useCallback(() => {
    const ctx = setup()
    if (!ctx) return
    const hasVilli = villiRef.current
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    // lumen label
    ctx.fillStyle = 'rgba(245,240,232,0.30)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('lumen — digested monomers', 10, 16)

    drawWall(ctx, hasVilli)

    for (const p of particlesRef.current) {
      if (p.y < -4) continue
      ctx.globalAlpha = p.absorbed ? 0.5 : 1
      ctx.fillStyle = KIND_COLOR[p.kind]
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }, [setup, drawWall])

  const tick = useCallback(() => {
    const hasVilli = villiRef.current
    const dock = hasVilli ? DOCK_VILLI : DOCK_FLAT
    const captureY = (p: Particle) => {
      if (!hasVilli) return FLAT_SURFACE
      // nearest villus tip governs where this monomer is caught
      const i = Math.max(0, Math.min(N_VILLI - 1, Math.round((p.baseX / W) * N_VILLI - 0.5)))
      return villusTip(i) + 10
    }
    for (const p of particlesRef.current) {
      if (p.absorbed) {
        p.y += 2.4 // sink into the blood/lymph
        if (p.y > H + 8) {
          // respawn at the top of the lumen
          p.y = p.spawnY
          p.docked = false
          p.dwell = 0
          p.absorbed = false
          p.x = p.baseX
        }
        continue
      }
      if (!p.docked) {
        p.y += p.vy
        const cy = captureY(p)
        if (p.y >= cy) {
          p.y = cy
          p.docked = true
          p.dwell = 0
        }
      } else {
        p.dwell += 1
        if (p.dwell >= dock) {
          p.absorbed = true
          absorbedRef.current += 1
        }
      }
    }
    if (absorbedRef.current !== absorbed) setAbsorbed(absorbedRef.current)
  }, [absorbed])

  useEffect(() => {
    if (!reducedStatic) return
    // advance a fixed number of deterministic frames, then paint one frame
    particlesRef.current = makeParticles()
    absorbedRef.current = 0
    for (let f = 0; f < 220; f++) tick()
    drawScene()
    setAbsorbed(absorbedRef.current)
  }, [reducedStatic, tick, drawScene])

  useEffect(() => {
    if (!running || reducedStatic) return
    let raf = 0
    const step = () => {
      tick()
      drawScene()
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [running, reducedStatic, tick, drawScene])

  // repaint on idle / toggle
  useEffect(() => {
    if (running || reducedStatic) return
    drawScene()
  }, [running, reducedStatic, villi, drawScene])

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
    particlesRef.current = makeParticles()
    absorbedRef.current = 0
    setAbsorbed(0)
    setVilli(true)
    villiRef.current = true
    drawScene()
  }

  const surfaceMult = villi ? 600 : 1
  const rateWord = villi ? 'fast' : 'slow'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Absorption across the gut wall
        </span>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          Wall: <strong style={{ color: PINK }}>{villi ? 'villi + microvilli' : 'flat'}</strong>
        </span>
        <span>
          relative surface area <strong className="text-accent-gold">{surfaceMult}&times;</strong>
        </span>
        <span>
          absorption <strong style={{ color: PINK }}>{rateWord}</strong>
        </span>
        <span>
          monomers absorbed <strong className="text-accent-teal">{absorbed}</strong>
        </span>
        <span className="w-full flex flex-wrap gap-x-4 gap-y-1 text-text-muted">
          {KIND_LABEL.map((l, i) => (
            <span key={l} className="flex items-center gap-1">
              <span style={{ width: 8, height: 8, borderRadius: 8, background: KIND_COLOR[i], display: 'inline-block' }} />
              {l}
            </span>
          ))}
        </span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { setReducedStatic(false); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={() => setVilli(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          Wall: {villi ? 'villi' : 'flat'}
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
