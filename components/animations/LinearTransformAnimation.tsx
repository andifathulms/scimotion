'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

// Layout ---------------------------------------------------------------------
const W = 600
const H = 380
const CX = W / 2
const CY = H / 2 + 6
const S = 44 // pixels per unit

const VIOLET = '#A78BFA' // field accent
const C_I = '#F59E0B' // gold — î, first column
const C_J = '#60A5FA' // blue — ĵ, second column
const C_FLIP = '#F472B6' // pink — orientation reversed (negative determinant)

type Mat = [number, number, number, number] // a, b, c, d  (rows: [a b] / [c d])

const IDENTITY: Mat = [1, 0, 0, 1]

const PRESETS: { name: string; m: Mat }[] = [
  { name: 'Rotate 90°', m: [0, -1, 1, 0] },
  { name: 'Scale', m: [1.8, 0, 0, 0.6] },
  { name: 'Shear', m: [1, 1, 0, 1] },
  { name: 'Reflect', m: [-1, 0, 0, 1] },
]

// Linear interpolation of the four entries: identity → target.
function lerpMat(t: number, m: Mat): Mat {
  return [
    IDENTITY[0] + (m[0] - IDENTITY[0]) * t,
    IDENTITY[1] + (m[1] - IDENTITY[1]) * t,
    IDENTITY[2] + (m[2] - IDENTITY[2]) * t,
    IDENTITY[3] + (m[3] - IDENTITY[3]) * t,
  ]
}

function det(m: Mat): number {
  return m[0] * m[3] - m[1] * m[2]
}

export function LinearTransformAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(0)

  const [running, setRunning] = useState(false)
  const [t, setT] = useState(0)
  const [mat, setMat] = useState<Mat>(PRESETS[2].m) // shear by default

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        tRef.current = 1
        setT(1)
      } else {
        setRunning(true)
      }
    },
  })

  const draw = useCallback(
    (tt: number, target: Mat) => {
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

      const m = lerpMat(tt, target)
      const [a, b, c, d] = m

      // Map a plane point through the current matrix to screen pixels.
      const px = (x: number, y: number) => CX + (a * x + b * y) * S
      const py = (x: number, y: number) => CY - (c * x + d * y) * S

      // Transformed grid — straight lines stay straight under a linear map.
      const R = 7
      ctx.lineWidth = 1
      for (let g = -R; g <= R; g++) {
        const major = g === 0
        ctx.strokeStyle = major ? 'rgba(255,245,235,0.28)' : 'rgba(255,245,235,0.07)'
        // vertical family (constant x)
        ctx.beginPath()
        ctx.moveTo(px(g, -R), py(g, -R))
        ctx.lineTo(px(g, R), py(g, R))
        ctx.stroke()
        // horizontal family (constant y)
        ctx.beginPath()
        ctx.moveTo(px(-R, g), py(-R, g))
        ctx.lineTo(px(R, g), py(R, g))
        ctx.stroke()
      }

      // Transformed unit square — its signed area IS the determinant.
      const dNow = det(m)
      const flipped = dNow < 0
      ctx.beginPath()
      ctx.moveTo(px(0, 0), py(0, 0))
      ctx.lineTo(px(1, 0), py(1, 0))
      ctx.lineTo(px(1, 1), py(1, 1))
      ctx.lineTo(px(0, 1), py(0, 1))
      ctx.closePath()
      ctx.fillStyle = flipped ? 'rgba(244,114,182,0.20)' : 'rgba(167,139,250,0.22)'
      ctx.fill()
      ctx.strokeStyle = flipped ? C_FLIP : VIOLET
      ctx.lineWidth = 1.5
      ctx.stroke()

      // |det| label at the centre of the parallelogram.
      const midX = (px(0, 0) + px(1, 1)) / 2
      const midY = (py(0, 0) + py(1, 1)) / 2
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = flipped ? C_FLIP : VIOLET
      ctx.fillText(`area ${Math.abs(dNow).toFixed(2)}`, midX, midY + 4)
      ctx.textAlign = 'left'

      // Basis vectors: î → first column (a, c), ĵ → second column (b, d).
      const arrow = (ex: number, ey: number, color: string, label: string) => {
        const x1 = px(ex, ey)
        const y1 = py(ex, ey)
        ctx.strokeStyle = color
        ctx.fillStyle = color
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(CX, CY)
        ctx.lineTo(x1, y1)
        ctx.stroke()
        const ang = Math.atan2(y1 - CY, x1 - CX)
        const head = 10
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x1 - head * Math.cos(ang - 0.4), y1 - head * Math.sin(ang - 0.4))
        ctx.lineTo(x1 - head * Math.cos(ang + 0.4), y1 - head * Math.sin(ang + 0.4))
        ctx.closePath()
        ctx.fill()
        ctx.font = 'bold 13px monospace'
        ctx.fillText(label, x1 + 8, y1 - 6)
      }
      // î is the image of (1,0) = first column; ĵ is the image of (0,1) = second column.
      arrow(0, 1, C_J, 'ĵ')
      arrow(1, 0, C_I, 'î')
    },
    []
  )

  // Kick off / static redraw.
  useEffect(() => {
    if (!running) draw(t, mat)
  }, [running, t, mat, draw])

  useEffect(() => {
    if (!running) return
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      tRef.current = Math.min(1, tRef.current + dt * 0.7)
      setT(tRef.current)
      draw(tRef.current, mat)
      if (tRef.current >= 1) {
        setRunning(false)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, mat, draw])

  const play = () => {
    tRef.current = 0
    setT(0)
    setRunning(true)
  }

  const applyPreset = (m: Mat) => {
    setRunning(false)
    setMat(m)
    tRef.current = 0
    setT(0)
  }

  const setEntry = (i: number, v: number) => {
    setRunning(false)
    setMat(prev => {
      const next = [...prev] as Mat
      next[i] = v
      return next
    })
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    triggerReset()
    setRunning(false)
    setMat(PRESETS[2].m)
    tRef.current = 0
    setT(0)
  }

  const shown = lerpMat(t, mat)
  const dShown = det(shown)

  const slider = (label: string, i: number) => (
    <div className="flex items-center gap-1.5 text-xs text-text-muted">
      <span className="font-mono">{label}</span>
      <input
        type="range"
        min={-2}
        max={2}
        step={0.1}
        value={mat[i]}
        onChange={e => setEntry(i, +e.target.value)}
        className="w-14"
        style={{ accentColor: VIOLET }}
      />
      <span className="font-mono w-8">{mat[i].toFixed(1)}</span>
    </div>
  )

  return (
    <div ref={ref} className="animation-block">
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          M = [ <span style={{ color: C_I }}>{shown[0].toFixed(2)}</span>{' '}
          <span style={{ color: C_J }}>{shown[1].toFixed(2)}</span> ;{' '}
          <span style={{ color: C_I }}>{shown[2].toFixed(2)}</span>{' '}
          <span style={{ color: C_J }}>{shown[3].toFixed(2)}</span> ]
        </span>
        <span>
          <span style={{ color: C_I }}>î → ({shown[0].toFixed(1)}, {shown[2].toFixed(1)})</span> ·{' '}
          <span style={{ color: C_J }}>ĵ → ({shown[1].toFixed(1)}, {shown[3].toFixed(1)})</span>
        </span>
        <span>
          det ={' '}
          <span style={{ color: dShown < 0 ? C_FLIP : VIOLET }}>{dShown.toFixed(2)}</span>
          {dShown < 0 ? ' (flipped)' : dShown === 0 ? ' (collapsed)' : ''}
        </span>
      </div>

      <div className="mt-3">
        <canvas
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
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map(p => (
            <button
              key={p.name}
              onClick={() => applyPreset(p.m)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-surface border border-border text-text-secondary"
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {slider('a', 0)}
          {slider('b', 1)}
          {slider('c', 2)}
          {slider('d', 3)}
        </div>
      </div>
    </div>
  )
}
