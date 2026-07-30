'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360
const BG = '#0F0D0A'

const INDIGO = '#818CF8'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const ROCK = '#B99B7C'
const DIM = 'rgba(245,240,232,0.42)'
const FAINT = 'rgba(255,245,235,0.12)'

const MIDX = W / 2

// Fixed, deterministic irregular outlines (no Math.random). Radii per vertex.
const ASTEROID_SHAPE = [1.0, 0.78, 1.05, 0.7, 0.95, 0.82, 1.08, 0.72, 0.9, 0.85, 1.02, 0.75]
const NUCLEUS_SHAPE = [0.92, 0.8, 1.0, 0.86, 0.94, 0.82, 0.98, 0.88]

// A fixed dust-grain pattern for the comet coma, seeded from indices.
const GRAINS = Array.from({ length: 26 }, (_, i) => ({
  a: (i * 2.399963) % (Math.PI * 2), // golden-angle spread, deterministic
  r: 0.35 + ((i * 37) % 100) / 100 * 0.6,
  s: 0.6 + ((i * 53) % 100) / 100 * 1.2,
}))

function drawBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  shape: number[],
  rot: number,
) {
  ctx.beginPath()
  for (let i = 0; i <= shape.length; i++) {
    const idx = i % shape.length
    const ang = rot + (i / shape.length) * Math.PI * 2
    const rr = radius * shape[idx]
    const x = cx + Math.cos(ang) * rr
    const y = cy + Math.sin(ang) * rr
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

export function CometAsteroidAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const pRef = useRef(0) // warmth: 0 = cold/far, 1 = near the Sun
  const spinRef = useRef(0)
  const playingRef = useRef(false)

  const [playing, setPlaying] = useState(false)
  const [warmth, setWarmth] = useState(0)

  const draw = useCallback((p: number, spin: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    // divider
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(MIDX, 40)
    ctx.lineTo(MIDX, H - 12)
    ctx.stroke()

    // ---------- LEFT PANEL: ASTEROID ----------
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = ROCK
    ctx.fillText('ASTEROID — rocky', MIDX / 2, 26)
    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('main belt, 2–3.3 AU (Mars ↔ Jupiter)', MIDX / 2, 40)

    const ax = MIDX / 2
    const ay = 168
    // rocky body — cratered, unchanged by heat
    drawBlob(ctx, ax, ay, 44, ASTEROID_SHAPE, spin * 0.3)
    const rg = ctx.createRadialGradient(ax - 14, ay - 14, 4, ax, ay, 52)
    rg.addColorStop(0, '#C9AE8E')
    rg.addColorStop(1, '#6E5B45')
    ctx.fillStyle = rg
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 1
    ctx.stroke()
    // a few fixed craters
    const craters = [[-16, -8, 7], [10, 4, 9], [-4, 18, 5], [20, -14, 5]]
    for (const [dx, dy, cr] of craters) {
      const a2 = spin * 0.3
      const rx = ax + dx * Math.cos(a2) - dy * Math.sin(a2)
      const ry = ay + dx * Math.sin(a2) + dy * Math.cos(a2)
      ctx.fillStyle = 'rgba(60,48,36,0.55)'
      ctx.beginPath()
      ctx.arc(rx, ry, cr, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    ctx.fillText('rock + metal · no ice', ax, ay + 74)
    ctx.fillStyle = ROCK
    ctx.font = '10px monospace'
    ctx.fillText('heated: stays a bare, inert rock', ax, ay + 92)
    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    ctx.fillText('no coma · no tail', ax, ay + 106)

    // ---------- RIGHT PANEL: COMET ----------
    ctx.textAlign = 'center'
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = INDIGO
    ctx.fillText('COMET — icy', MIDX + MIDX / 2, 26)
    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('Kuiper Belt / Oort Cloud → falls inward', MIDX + MIDX / 2, 40)

    // A small Sun on the far right so "anti-sunward" points left, into the panel.
    const sunX = W - 18
    const sunY = 168
    const glow = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 30)
    glow.addColorStop(0, 'rgba(245,158,11,0.5)')
    glow.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(sunX, sunY, 30, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = GOLD
    ctx.beginPath()
    ctx.arc(sunX, sunY, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = DIM
    ctx.font = '8px monospace'
    ctx.fillText('Sun', sunX, sunY + 20)

    const cx = MIDX + 70
    const cy = 168
    // Tails point away from the Sun (to the left) and grow with warmth.
    const tailLen = Math.pow(p, 1.3) * 150
    if (tailLen > 3) {
      // dust tail — broad, curved, yellowish
      const dg = ctx.createLinearGradient(cx, cy, cx - tailLen, cy)
      dg.addColorStop(0, 'rgba(230,200,110,0.45)')
      dg.addColorStop(1, 'rgba(230,200,110,0)')
      ctx.fillStyle = dg
      ctx.beginPath()
      ctx.moveTo(cx, cy - 6)
      ctx.quadraticCurveTo(cx - tailLen * 0.6, cy - 6 - tailLen * 0.12, cx - tailLen, cy + tailLen * 0.14)
      ctx.quadraticCurveTo(cx - tailLen * 0.6, cy + 10, cx, cy + 6)
      ctx.closePath()
      ctx.fill()
      // ion tail — straight, bluish, anti-sunward
      const ig = ctx.createLinearGradient(cx, cy, cx - tailLen * 1.15, cy)
      ig.addColorStop(0, 'rgba(96,165,250,0.7)')
      ig.addColorStop(1, 'rgba(96,165,250,0)')
      ctx.strokeStyle = ig
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx - tailLen * 1.15, cy - tailLen * 0.05)
      ctx.stroke()
    }

    // coma — grows with warmth as ices sublime
    const comaR = 10 + p * 34
    if (p > 0.02) {
      const cg = ctx.createRadialGradient(cx, cy, 2, cx, cy, comaR)
      cg.addColorStop(0, `rgba(180,205,255,${0.15 + p * 0.5})`)
      cg.addColorStop(1, 'rgba(180,205,255,0)')
      ctx.fillStyle = cg
      ctx.beginPath()
      ctx.arc(cx, cy, comaR, 0, Math.PI * 2)
      ctx.fill()
      // subliming dust grains, deterministic
      for (const g of GRAINS) {
        const gr = comaR * g.r
        const gx = cx + Math.cos(g.a + spin * 0.2) * gr
        const gy = cy + Math.sin(g.a + spin * 0.2) * gr
        ctx.fillStyle = `rgba(220,225,240,${0.15 + p * 0.35})`
        ctx.beginPath()
        ctx.arc(gx, gy, g.s * (0.5 + p * 0.7), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // nucleus — dirty snowball, always present
    drawBlob(ctx, cx, cy, 12, NUCLEUS_SHAPE, spin * 0.3)
    const ng = ctx.createRadialGradient(cx - 4, cy - 4, 1, cx, cy, 14)
    ng.addColorStop(0, '#DCE4F0')
    ng.addColorStop(1, '#6A7284')
    ctx.fillStyle = ng
    ctx.fill()

    ctx.fillStyle = DIM
    ctx.textAlign = 'center'
    ctx.font = '9px monospace'
    ctx.fillText('ice + dust ("dirty snowball")', cx, cy + 74)
    ctx.fillStyle = INDIGO
    ctx.font = '10px monospace'
    ctx.fillText(p < 0.15 ? 'cold & far: dark, inert nucleus' : 'heated: ices SUBLIME → coma + tails', cx, cy + 92)
    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    ctx.fillText('not burning — evaporating', cx, cy + 106)

    // warmth gauge across the bottom
    ctx.textAlign = 'left'
    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    ctx.fillText('warming as it nears the Sun →', 16, H - 22)
    const gx0 = 16
    const gw = W - 32
    ctx.strokeStyle = FAINT
    ctx.strokeRect(gx0, H - 16, gw, 6)
    const wg = ctx.createLinearGradient(gx0, 0, gx0 + gw, 0)
    wg.addColorStop(0, BLUE)
    wg.addColorStop(1, GOLD)
    ctx.fillStyle = wg
    ctx.fillRect(gx0, H - 16, gw * p, 6)
  }, [])

  useEffect(() => {
    const loop = () => {
      if (playingRef.current) {
        pRef.current = Math.min(1, pRef.current + 0.006)
        setWarmth(pRef.current)
        if (pRef.current >= 1) {
          playingRef.current = false
          setPlaying(false)
        }
      }
      spinRef.current += 0.01
      draw(pRef.current, spinRef.current)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        pRef.current = 1
        setWarmth(1)
        playingRef.current = false
        draw(1, 0)
        return
      }
      pRef.current = 0
      setWarmth(0)
      playingRef.current = true
      setPlaying(true)
    },
  })

  const toggle = () => {
    if (pRef.current >= 1) {
      pRef.current = 0
      setWarmth(0)
    }
    playingRef.current = !playingRef.current
    setPlaying(playingRef.current)
  }

  const reset = () => {
    playingRef.current = false
    setPlaying(false)
    pRef.current = 0
    setWarmth(0)
    draw(0, spinRef.current)
    triggerReset()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Bring both toward the Sun and see who changes</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: BG }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>warmth: <span style={{ color: INDIGO }}>{Math.round(warmth * 100)}%</span></span>
        <span>asteroid: <span style={{ color: ROCK }}>rock/metal · unchanged</span></span>
        <span>comet: <span className="text-accent-blue">{warmth < 0.15 ? 'inert ice' : 'coma + tails'}</span></span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {playing ? <><Pause size={12} /> Pause</> : <><Play size={12} /> {warmth >= 1 ? 'Replay' : 'Play'}</>}
        </button>
        <span className="text-xs text-text-muted font-mono ml-auto self-center">
          {warmth < 0.15 ? 'both dark and inert, far from the Sun'
            : warmth < 0.7 ? 'only the icy comet reacts to the heat'
            : 'comet blazing; asteroid still just rock'}
        </span>
      </div>
    </div>
  )
}
