'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340
const G = 9.8

// Overflow ("eureka") can, filled exactly to the spout: whatever the object
// displaces spills into the side cup, so overflow volume = displaced volume.
const TANK_L = 50
const TANK_R = 320
const BRIM_Y = 96 // water surface = spout height
const TANK_BOTTOM = 300
const CUP_L = 388
const CUP_R = 476
const CUP_TOP = 150
const CUP_BOTTOM = 300

const EMERALD = '#10B981' // displaced fluid / buoyancy
const ORANGE = '#FB923C' // object weight
const WATER = '#38BDF8'
const STEEL = '#B8C0CC'

const RHO_WATER = 1.0 // g/cm³
const RHO_STEEL = 7.85
const MASS_G = 800 // grams of steel — identical for both shapes

// Same mass of steel, two shapes:
//  cube — solid, sinks; displaces only its own small volume
//  boat — hollow hull, floats; displaces its OWN WEIGHT of water (much more)
const CUBE_VOL = MASS_G / RHO_STEEL // ≈ 101.9 cm³ (fully submerged when it sinks)
const BOAT_DISP = MASS_G / RHO_WATER // = 800 cm³ (floats when it displaces its weight)
const CUP_CAP = 900 // cm³ mapped to a full cup

type Shape = 'cube' | 'boat'

function model(shape: Shape) {
  const dispVol = shape === 'cube' ? CUBE_VOL : BOAT_DISP
  const dispWeight = (dispVol / 1000) * G // kg-of-water × g → N
  const objWeight = (MASS_G / 1000) * G // N
  const floats = dispWeight >= objWeight - 1e-6
  return { dispVol, dispWeight, objWeight, floats }
}

export function DisplacementAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const pRef = useRef(0) // 0 → 1 lowering progress
  const runningRef = useRef(false)
  const lastRef = useRef<number | null>(null)
  const dprRef = useRef(1)

  const [shape, setShape] = useState<Shape>('cube')
  const shapeRef = useRef<Shape>('cube')
  useEffect(() => { shapeRef.current = shape }, [shape])

  const [readout, setReadout] = useState(() => ({ ...model('cube'), disp: 0 }))

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = dprRef.current
    if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    const shp = shapeRef.current
    const m = model(shp)
    const p = pRef.current
    const dispNow = m.dispVol * p

    // --- Tank walls + spout ---
    ctx.strokeStyle = 'rgba(245,240,232,0.25)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(TANK_L, BRIM_Y - 30)
    ctx.lineTo(TANK_L, TANK_BOTTOM)
    ctx.lineTo(TANK_R, TANK_BOTTOM)
    ctx.lineTo(TANK_R, BRIM_Y)
    ctx.stroke()
    // spout lip
    ctx.beginPath()
    ctx.moveTo(TANK_R, BRIM_Y)
    ctx.lineTo(TANK_R + 24, BRIM_Y)
    ctx.lineTo(TANK_R + 24, BRIM_Y + 8)
    ctx.stroke()

    // --- Water in tank (always brim-full; excess spills) ---
    ctx.fillStyle = WATER
    ctx.globalAlpha = 0.22
    ctx.fillRect(TANK_L, BRIM_Y, TANK_R - TANK_L, TANK_BOTTOM - BRIM_Y)
    ctx.globalAlpha = 1
    ctx.strokeStyle = WATER
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(TANK_L, BRIM_Y); ctx.lineTo(TANK_R, BRIM_Y); ctx.stroke()

    // --- Object ---
    if (shp === 'cube') {
      const side = Math.cbrt(CUBE_VOL) * 9.9 // cm → px, purely visual
      const x = (TANK_L + TANK_R) / 2 - side / 2
      const yStart = 30
      const yEnd = TANK_BOTTOM - side // sinks to the floor
      const y = yStart + (yEnd - yStart) * p
      ctx.fillStyle = STEEL
      ctx.fillRect(x, y, side, side)
      ctx.strokeStyle = 'rgba(245,240,232,0.55)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(x, y, side, side)
      ctx.fillStyle = 'rgba(15,13,10,0.85)'
      ctx.font = '10px monospace'
      ctx.fillText('steel', x + side / 2 - 14, y + side / 2 + 3)
    } else {
      // hollow hull — wide, floats sitting in the surface
      const bw = 150
      const bh = 54
      const x = (TANK_L + TANK_R) / 2 - bw / 2
      const yStart = 24
      const yEnd = BRIM_Y - bh * 0.32 // floats: most of the hull below the surface
      const y = yStart + (yEnd - yStart) * p
      ctx.strokeStyle = STEEL
      ctx.fillStyle = STEEL
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + 14, y + bh)
      ctx.lineTo(x + bw - 14, y + bh)
      ctx.lineTo(x + bw, y)
      ctx.stroke()
      ctx.fillStyle = 'rgba(184,192,204,0.16)'
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + 14, y + bh)
      ctx.lineTo(x + bw - 14, y + bh)
      ctx.lineTo(x + bw, y)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgba(245,240,232,0.6)'
      ctx.font = '10px monospace'
      ctx.fillText('same 800 g of steel', x + 20, y - 6)
    }

    // --- Overflow stream into the cup ---
    if (p > 0.02) {
      ctx.strokeStyle = EMERALD
      ctx.globalAlpha = 0.55
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(TANK_R + 20, BRIM_Y + 6)
      ctx.quadraticCurveTo(TANK_R + 44, BRIM_Y + 40, CUP_L + 20, CUP_TOP - 6)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // --- Cup + displaced fluid it caught ---
    ctx.strokeStyle = 'rgba(245,240,232,0.25)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(CUP_L, CUP_TOP)
    ctx.lineTo(CUP_L, CUP_BOTTOM)
    ctx.lineTo(CUP_R, CUP_BOTTOM)
    ctx.lineTo(CUP_R, CUP_TOP)
    ctx.stroke()
    const fillFrac = Math.min(1, dispNow / CUP_CAP)
    const fillH = fillFrac * (CUP_BOTTOM - CUP_TOP)
    ctx.fillStyle = EMERALD
    ctx.globalAlpha = 0.35
    ctx.fillRect(CUP_L, CUP_BOTTOM - fillH, CUP_R - CUP_L, fillH)
    ctx.globalAlpha = 1
    ctx.strokeStyle = EMERALD
    ctx.lineWidth = 1.5
    if (fillH > 0) { ctx.beginPath(); ctx.moveTo(CUP_L, CUP_BOTTOM - fillH); ctx.lineTo(CUP_R, CUP_BOTTOM - fillH); ctx.stroke() }
    ctx.fillStyle = 'rgba(16,185,129,0.9)'
    ctx.font = '10px monospace'
    ctx.fillText('overflow', CUP_L + 12, CUP_TOP - 8)

    // --- Force comparison bars ---
    const bx = 388
    const by = 40
    const bmax = 150
    const fmax = Math.max(m.objWeight, m.dispWeight, 1)
    const nowDispWeight = (dispNow / 1000) * G
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('weights (N)', bx, by - 8)
    const bar = (y: number, val: number, color: string, label: string) => {
      ctx.fillStyle = 'rgba(255,245,235,0.06)'
      ctx.fillRect(bx, y, bmax, 14)
      ctx.fillStyle = color
      ctx.fillRect(bx, y, Math.min(bmax, (val / fmax) * bmax), 14)
      ctx.fillStyle = 'rgba(245,240,232,0.8)'
      ctx.fillText(label, bx, y + 26)
    }
    bar(by, m.objWeight, ORANGE, 'object weight ' + m.objWeight.toFixed(1))
    bar(by + 40, nowDispWeight, EMERALD, 'displaced-water weight ' + nowDispWeight.toFixed(1))

    setReadout({ ...m, disp: dispNow })
  }, [])

  useEffect(() => {
    dprRef.current = typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 1) : 1
  }, [])

  useEffect(() => { draw() }, [draw])

  const { ref } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { pRef.current = 1; draw(); return }
    },
  })

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const play = () => {
    if (pRef.current >= 1) pRef.current = 0
    lastRef.current = null
    runningRef.current = true
    rafRef.current = requestAnimationFrame(function step(t) {
      if (lastRef.current === null) lastRef.current = t
      const dt = Math.min(48, t - lastRef.current) / 1000
      lastRef.current = t
      pRef.current = Math.min(1, pRef.current + dt / 2.2)
      draw()
      if (pRef.current < 1) rafRef.current = requestAnimationFrame(step)
      else runningRef.current = false
    })
  }

  const reset = () => {
    runningRef.current = false
    cancelAnimationFrame(rafRef.current)
    pRef.current = 0
    lastRef.current = null
    draw()
  }

  const chooseShape = (s: Shape) => {
    setShape(s); shapeRef.current = s
    reset()
  }

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Archimedes&rsquo; overflow can</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: 200 }}>
        <canvas role="img" aria-label="Animated diagram: Archimedes&rsquo; overflow can. Values are reported below the diagram." ref={canvasRef} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)', aspectRatio: `${W} / ${H}` }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span style={{ color: EMERALD }}>V_displaced = {readout.disp.toFixed(0)} cm³</span>
        <span style={{ color: EMERALD }}>displaced-water wt = {((readout.disp / 1000) * G).toFixed(2)} N</span>
        <span style={{ color: ORANGE }}>object weight = {readout.objWeight.toFixed(2)} N</span>
        <span>→ <strong style={{ color: readout.floats ? EMERALD : ORANGE }}>{readout.floats ? 'Floats' : 'Sinks'}</strong></span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={play}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> Play
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-surface border border-border text-text-secondary hover:bg-bg-hover"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Shape:</span>
          <button
            onClick={() => chooseShape('cube')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
            style={shape === 'cube'
              ? { background: EMERALD, color: '#0F0D0A', borderColor: EMERALD }
              : { background: 'transparent', borderColor: 'var(--border, #3a352c)' }}
          >
            Solid cube
          </button>
          <button
            onClick={() => chooseShape('boat')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
            style={shape === 'boat'
              ? { background: EMERALD, color: '#0F0D0A', borderColor: EMERALD }
              : { background: 'transparent', borderColor: 'var(--border, #3a352c)' }}
          >
            Boat (same mass)
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-text-muted">
        Both objects are the <strong className="text-text-secondary">same 800 g of steel</strong>. The solid cube displaces only
        its own tiny volume, so the water it pushes aside weighs far less than the cube — it <strong style={{ color: ORANGE }}>sinks</strong>.
        Beaten into a hull, that same steel displaces about eight times more water; once the displaced water weighs as much as the
        boat, the forces balance and it <strong style={{ color: EMERALD }}>floats</strong>.
      </p>
    </div>
  )
}
