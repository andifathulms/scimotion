'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

// Layout ---------------------------------------------------------------------
const W = 640
const H = 380
const PANEL_W = W / 2
const S = 34 // pixels per unit
// Panel origins (placed a little low-left so the transformed shapes stay visible).
const OX = PANEL_W / 2 - 12
const OY = H / 2 + 20

const C_A = '#F59E0B' // gold — transformation A (rotate)
const C_B = '#60A5FA' // blue — transformation B (shear)
const VIOLET = '#A78BFA' // field accent — the composed result shape

type Mat = [number, number, number, number] // rows [a b] / [c d]

// The two example transformations.
const A: Mat = [0, -1, 1, 0] // rotate 90° counter-clockwise
const B: Mat = [1, 1, 0, 1] // horizontal shear

// Matrix product P·Q (apply Q first, then P).
function mul(p: Mat, q: Mat): Mat {
  return [
    p[0] * q[0] + p[1] * q[2],
    p[0] * q[1] + p[1] * q[3],
    p[2] * q[0] + p[3] * q[2],
    p[2] * q[1] + p[3] * q[3],
  ]
}

const AB = mul(A, B) // "shear first, then rotate"
const BA = mul(B, A) // "rotate first, then shear"

const IDENTITY: Mat = [1, 0, 0, 1]

function lerp(m0: Mat, m1: Mat, t: number): Mat {
  return [
    m0[0] + (m1[0] - m0[0]) * t,
    m0[1] + (m1[1] - m0[1]) * t,
    m0[2] + (m1[2] - m0[2]) * t,
    m0[3] + (m1[3] - m0[3]) * t,
  ]
}

// An asymmetric "F" so any difference in the two orders is unmistakable.
const F_SHAPE: [number, number][] = [
  [0, 0],
  [0.32, 0],
  [0.32, 0.5],
  [0.62, 0.5],
  [0.62, 0.75],
  [0.32, 0.75],
  [0.32, 1.05],
  [0.78, 1.05],
  [0.78, 1.3],
  [0, 1.3],
]

export function MatrixCompositionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const pRef = useRef(0) // progress 0 → 2 (two stages)
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState(0)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        pRef.current = 2
        setPhase(2)
      } else {
        setRunning(true)
      }
    },
  })

  // Current matrix for a panel given its first-applied matrix (m1) and product (prod).
  const stageMat = useCallback((p: number, m1: Mat, prod: Mat): Mat => {
    if (p <= 1) return lerp(IDENTITY, m1, p) // stage 1: identity → first transform
    return lerp(m1, prod, p - 1) // stage 2: first transform → full product
  }, [])

  const draw = useCallback(
    (p: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr
        canvas.height = H * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      ctx.fillStyle = '#0F0D0A'
      ctx.fillRect(0, 0, W, H)

      // Divider
      ctx.strokeStyle = 'rgba(255,245,235,0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PANEL_W, 0)
      ctx.lineTo(PANEL_W, H)
      ctx.stroke()

      const drawPanel = (
        baseX: number,
        m: Mat,
        title: string,
        stageLabel: string,
        titleColor: string
      ) => {
        const ox = baseX + OX
        const px = (x: number, y: number) => ox + (m[0] * x + m[1] * y) * S
        const py = (x: number, y: number) => OY - (m[2] * x + m[3] * y) * S

        // Faint transformed grid
        const R = 5
        ctx.lineWidth = 1
        for (let g = -R; g <= R; g++) {
          ctx.strokeStyle = g === 0 ? 'rgba(255,245,235,0.22)' : 'rgba(255,245,235,0.06)'
          ctx.beginPath()
          ctx.moveTo(px(g, -R), py(g, -R))
          ctx.lineTo(px(g, R), py(g, R))
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(px(-R, g), py(-R, g))
          ctx.lineTo(px(R, g), py(R, g))
          ctx.stroke()
        }

        // The F shape
        ctx.beginPath()
        F_SHAPE.forEach(([x, y], i) => {
          const sx = px(x, y)
          const sy = py(x, y)
          if (i === 0) ctx.moveTo(sx, sy)
          else ctx.lineTo(sx, sy)
        })
        ctx.closePath()
        ctx.fillStyle = 'rgba(167,139,250,0.28)'
        ctx.fill()
        ctx.strokeStyle = VIOLET
        ctx.lineWidth = 2
        ctx.stroke()

        // Labels
        ctx.textAlign = 'center'
        ctx.font = 'bold 12px monospace'
        ctx.fillStyle = titleColor
        ctx.fillText(title, baseX + PANEL_W / 2, 22)
        ctx.font = '10px monospace'
        ctx.fillStyle = 'rgba(245,240,232,0.5)'
        ctx.fillText(stageLabel, baseX + PANEL_W / 2, 38)
        ctx.textAlign = 'left'
      }

      // Left: AB applied to x is A(Bx) — shear first, then rotate. Stage 1 → B, Stage 2 → AB.
      const leftStage = p <= 1 ? 'step 1: shear (B)' : 'step 2: then rotate (A)  ⇒ AB'
      drawPanel(0, stageMat(p, B, AB), 'AB:  shear, then rotate', leftStage, C_B)

      // Right: BA applied to x is B(Ax) — rotate first, then shear. Stage 1 → A, Stage 2 → BA.
      const rightStage = p <= 1 ? 'step 1: rotate (A)' : 'step 2: then shear (B)  ⇒ BA'
      drawPanel(PANEL_W, stageMat(p, A, BA), 'BA:  rotate, then shear', rightStage, C_A)
    },
    [stageMat]
  )

  useEffect(() => {
    if (!running) draw(pRef.current)
  }, [running, phase, draw])

  useEffect(() => {
    if (!running) return
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      pRef.current = Math.min(2, pRef.current + dt * 0.55)
      setPhase(pRef.current)
      draw(pRef.current)
      if (pRef.current >= 2) {
        setRunning(false)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const play = () => {
    pRef.current = 0
    setPhase(0)
    setRunning(true)
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    triggerReset()
    setRunning(false)
    pRef.current = 0
    setPhase(0)
    draw(0)
  }

  const fmt = (m: Mat) =>
    `[${m[0].toFixed(0)} ${m[1].toFixed(0)}; ${m[2].toFixed(0)} ${m[3].toFixed(0)}]`

  return (
    <div ref={ref} className="animation-block">
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          A <span style={{ color: C_A }}>rotate 90°</span> = {fmt(A)}
        </span>
        <span>
          B <span style={{ color: C_B }}>shear</span> = {fmt(B)}
        </span>
        <span>
          AB = <span style={{ color: VIOLET }}>{fmt(AB)}</span>
        </span>
        <span>
          BA = <span style={{ color: VIOLET }}>{fmt(BA)}</span>
        </span>
        <span className="text-accent-orange">AB ≠ BA — order matters</span>
      </div>

      <div className="mt-3">
        <canvas
          role="img"
          aria-label="Animated diagram: Matrix composition. Values are reported below the diagram."
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)', aspectRatio: `${W} / ${H}` }}
        />
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={play}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> Play
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <span className="text-xs text-text-muted">
          Both panels start from the same F. Shear-then-rotate (left) lands nowhere near
          rotate-then-shear (right).
        </span>
      </div>
    </div>
  )
}
