'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300
const PERIOD = 150 // frames per function scene

const LIME = '#A3E635'
const BLUE = '#60A5FA'
const AMBER = '#FBBF24'
const TEAL = '#34D399'
const RED = '#DC2626'
const INK = 'rgba(245,240,232,0.55)'
const INK_DIM = 'rgba(245,240,232,0.3)'

type Fn = {
  name: string
  desc: string
  color: string
}

const FUNCS: Fn[] = [
  { name: 'Fermenting fiber → SCFAs', desc: 'microbes ferment dietary fiber into short-chain fatty acids: energy + gut-health signals', color: LIME },
  { name: 'Synthesizing vitamins', desc: 'gut microbes manufacture vitamin K and several B vitamins', color: AMBER },
  { name: 'Training the immune system', desc: 'microbial contact calibrates immune cells to tolerate friend and attack foe', color: BLUE },
  { name: 'Colonization resistance', desc: 'a packed commensal community leaves no niche for an invading pathogen', color: TEAL },
]

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Fixed, deterministic scatter of resident microbes for the crowding scene.
const CROWD: Array<{ x: number; y: number; r: number; c: string }> = (() => {
  const rng = mulberry32(0xc0ffee)
  const pal = [BLUE, TEAL, AMBER, '#A78BFA', '#22D3EE', '#F472B6']
  const out: Array<{ x: number; y: number; r: number; c: string }> = []
  for (let i = 0; i < 46; i++) {
    out.push({
      x: 150 + rng() * 400,
      y: 90 + rng() * 150,
      r: 9 + rng() * 5,
      c: pal[Math.floor(rng() * pal.length)],
    })
  }
  return out
})()

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke?: string) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.lineWidth = 1.5
    ctx.strokeStyle = stroke
    ctx.stroke()
  }
}

// A small rod-shaped microbe.
function microbe(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.beginPath()
  ctx.ellipse(x, y, 14, 8, 0, 0, Math.PI * 2)
  ctx.fillStyle = `${color}CC`
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = color
  ctx.stroke()
}

export function MicrobeFunctionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const frameRef = useRef(0)
  const fnRef = useRef(0)

  const [fn, setFn] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  const scene = useCallback((ctx: CanvasRenderingContext2D, idx: number, p: number) => {
    const ease = 0.5 - 0.5 * Math.cos(p * Math.PI * 2) // 0→1→0 smooth
    const gutWallY = 250

    // Gut lining along the bottom of every scene.
    ctx.fillStyle = 'rgba(163,230,53,0.05)'
    ctx.fillRect(0, gutWallY, W, H - gutWallY)
    ctx.strokeStyle = 'rgba(163,230,53,0.25)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, gutWallY)
    ctx.lineTo(W, gutWallY)
    ctx.stroke()
    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    ctx.fillStyle = INK_DIM
    ctx.fillText('gut wall', W - 8, gutWallY + 16)
    ctx.textAlign = 'left'

    if (idx === 0) {
      // ---- Fiber fermented into short-chain fatty acids ----
      const cluster = { x: 300, y: 150 }
      microbe(ctx, cluster.x - 18, cluster.y, LIME)
      microbe(ctx, cluster.x + 18, cluster.y + 6, LIME)
      microbe(ctx, cluster.x, cluster.y - 16, LIME)

      // Fiber polymer travelling in from the left, shrinking as it is consumed.
      const fx = 60 + (cluster.x - 120) * Math.min(1, p * 2)
      const remaining = Math.max(0, 6 - Math.round(Math.min(1, p * 2) * 6))
      ctx.strokeStyle = '#8B5E3C'
      ctx.lineWidth = 2
      for (let k = 0; k < remaining; k++) {
        const hx = fx - k * 16
        ctx.beginPath()
        ctx.arc(hx, 150, 6, 0, Math.PI * 2)
        ctx.fillStyle = '#C8A27C'
        ctx.fill()
        ctx.stroke()
      }
      ctx.fillStyle = INK
      ctx.font = '11px monospace'
      ctx.fillText('dietary fiber', 55, 128)

      // SCFA products released toward the gut wall in the second half.
      const rel = Math.max(0, (p - 0.5) * 2)
      const labels = ['butyrate', 'acetate', 'propionate']
      for (let k = 0; k < 3; k++) {
        const sx = cluster.x + (k - 1) * 40
        const sy = cluster.y + 20 + rel * (gutWallY - cluster.y - 20)
        circle(ctx, sx, sy, 6, LIME)
        ctx.fillStyle = LIME
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(labels[k], sx, sy - 10)
        ctx.textAlign = 'left'
      }
      if (rel > 0.85) {
        ctx.fillStyle = LIME
        ctx.font = '10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('energy + gut-health signals', W / 2, gutWallY + 34)
        ctx.textAlign = 'left'
      }
    } else if (idx === 1) {
      // ---- Vitamin synthesis ----
      microbe(ctx, 260, 170, AMBER)
      microbe(ctx, 300, 158, AMBER)
      microbe(ctx, 340, 172, AMBER)
      const vits = ['K', 'B12', 'B9']
      for (let k = 0; k < 3; k++) {
        const phase = (p + k / 3) % 1
        const vx = 260 + k * 40
        const vy = 158 - phase * 120
        ctx.beginPath()
        ctx.roundRect(vx - 12, vy - 9, 24, 18, 5)
        ctx.fillStyle = `${AMBER}22`
        ctx.fill()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = AMBER
        ctx.stroke()
        ctx.fillStyle = AMBER
        ctx.font = 'bold 10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(vits[k], vx, vy + 4)
        ctx.textAlign = 'left'
      }
      ctx.fillStyle = INK
      ctx.font = '11px monospace'
      ctx.fillText('vitamins the microbes make for you', 200, 60)
    } else if (idx === 2) {
      // ---- Immune training ----
      microbe(ctx, 190, 160, BLUE)
      ctx.fillStyle = INK
      ctx.font = '10px monospace'
      ctx.fillText('microbe', 168, 138)

      // Signalling molecules crossing to the immune cell.
      const imm = { x: 420, y: 160 }
      for (let k = 0; k < 3; k++) {
        const ph = (p * 1.4 + k / 3) % 1
        const mx = 210 + ph * (imm.x - 40 - 210)
        circle(ctx, mx, 160, 4, BLUE)
      }

      // The immune cell matures as training proceeds: receptors sharpen.
      const mature = ease
      circle(ctx, imm.x, imm.y, 26, `${BLUE}${mature > 0.5 ? '33' : '18'}`, BLUE)
      const spikes = 10
      for (let s = 0; s < spikes; s++) {
        const a = (s / spikes) * Math.PI * 2
        const len = 4 + mature * 8
        ctx.beginPath()
        ctx.moveTo(imm.x + Math.cos(a) * 26, imm.y + Math.sin(a) * 26)
        ctx.lineTo(imm.x + Math.cos(a) * (26 + len), imm.y + Math.sin(a) * (26 + len))
        ctx.strokeStyle = BLUE
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
      ctx.fillStyle = INK
      ctx.font = '10px monospace'
      ctx.fillText('immune cell', imm.x - 30, 118)
      ctx.fillStyle = mature > 0.6 ? LIME : INK_DIM
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(mature > 0.6 ? 'calibrated: tolerant + ready' : 'learning...', W / 2, 214)
      ctx.textAlign = 'left'
    } else {
      // ---- Colonization resistance ----
      for (const m of CROWD) circle(ctx, m.x, m.y, m.r, `${m.c}99`, m.c)

      // A pathogen probes in from the left, finds no space, and is pushed back.
      const px = 40 + ease * 90
      circle(ctx, px, 165, 12, `${RED}CC`, '#FCA5A5')
      ctx.fillStyle = RED
      ctx.font = '10px monospace'
      ctx.fillText('pathogen', px - 24, 145)
      if (ease > 0.6) {
        ctx.fillStyle = RED
        ctx.font = '10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('blocked — no niche to colonise', W / 2, 285)
        ctx.textAlign = 'left'
      }

      // Barrier shimmer at the edge of the commensal community.
      ctx.strokeStyle = `${TEAL}${ease > 0.6 ? '99' : '33'}`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(140, 80)
      ctx.lineTo(140, 245)
      ctx.stroke()
    }
  }, [])

  const draw = useCallback(
    (idx: number, p: number) => {
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

      const f = FUNCS[idx]
      ctx.font = '12px monospace'
      ctx.textAlign = 'left'
      ctx.fillStyle = f.color
      ctx.fillText(`${idx + 1}/4  ${f.name}`, 20, 26)

      scene(ctx, idx, p)
    },
    [scene]
  )

  // Draw the current scene at a representative frame when not animating.
  useEffect(() => {
    draw(fn, 0.5)
  }, [fn, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        draw(0, 0.5)
        return
      }
      setPlaying(true)
    },
  })

  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current)
      return
    }
    const tick = () => {
      frameRef.current += 1
      if (frameRef.current >= PERIOD) {
        frameRef.current = 0
        const nextFn = (fnRef.current + 1) % FUNCS.length
        fnRef.current = nextFn
        setFn(nextFn)
      }
      draw(fnRef.current, frameRef.current / PERIOD)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, draw])

  const selectFn = (i: number) => {
    setPlaying(false)
    frameRef.current = 0
    fnRef.current = i
    setFn(i)
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setPlaying(false)
    frameRef.current = 0
    fnRef.current = 0
    setFn(0)
    triggerReset()
  }

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span style={{ color: FUNCS[fn].color }}>{FUNCS[fn].name}</span>
        <span className="text-text-muted">{FUNCS[fn].desc}</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setPlaying(p => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {playing ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Play
            </>
          )}
        </button>

        <div className="flex items-center gap-1.5 flex-wrap text-xs text-text-muted">
          {FUNCS.map((f, i) => (
            <button
              key={f.name}
              onClick={() => selectFn(i)}
              className="px-2 py-1 rounded-md border transition-colors"
              style={
                fn === i
                  ? { color: '#0F0D0A', background: f.color, borderColor: 'transparent' }
                  : { color: 'rgba(245,240,232,0.55)', borderColor: 'rgba(245,240,232,0.15)' }
              }
            >
              {i + 1}
            </button>
          ))}
        </div>

        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors ml-auto"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
    </div>
  )
}
