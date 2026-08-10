'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 380

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'

const SEA = 122
const SURF = 150 // top of lithosphere / sea floor
const LITHO = 34 // plate thickness

type Mode = 'subduction' | 'ridge' | 'hotspot'

const INFO: Record<Mode, { label: string; example: string; mech: string }> = {
  subduction: { label: 'SUBDUCTION ZONE', example: 'e.g. Andes · Cascades · Japan', mech: 'water lowers the mantle’s melting point (flux melting)' },
  ridge: { label: 'MID-OCEAN RIDGE', example: 'e.g. Mid-Atlantic Ridge · Iceland', mech: 'plates diverge → decompression melting of upwelling mantle' },
  hotspot: { label: 'HOTSPOT', example: 'e.g. Hawaii · Yellowstone', mech: 'a fixed mantle plume; the plate drifts over it' },
}

function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, col: string, w = 2) {
  const a = Math.atan2(y2 - y1, x2 - x1)
  ctx.strokeStyle = col
  ctx.fillStyle = col
  ctx.lineWidth = w
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  const h = 6
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - h * Math.cos(a - 0.4), y2 - h * Math.sin(a - 0.4))
  ctx.lineTo(x2 - h * Math.cos(a + 0.4), y2 - h * Math.sin(a + 0.4))
  ctx.closePath()
  ctx.fill()
}

function cone(ctx: CanvasRenderingContext2D, x: number, baseY: number, half: number, height: number, active: number) {
  ctx.beginPath()
  ctx.moveTo(x - half, baseY)
  ctx.lineTo(x, baseY - height)
  ctx.lineTo(x + half, baseY)
  ctx.closePath()
  ctx.fillStyle = active > 0 ? '#3a2c1f' : '#2c2620'
  ctx.fill()
  if (active > 0) {
    // glowing crater + puff
    ctx.fillStyle = `rgba(255,150,60,${active})`
    ctx.beginPath()
    ctx.arc(x, baseY - height, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function VolcanoSettingAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const runningRef = useRef(false)
  const phaseRef = useRef(0)
  const modeRef = useRef<Mode>('subduction')
  const [mode, setMode] = useState<Mode>('subduction')
  const [running, setRunning] = useState(false)

  const setupCanvas = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [])

  const bg = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)
    // mantle
    const man = ctx.createLinearGradient(0, SURF, 0, H)
    man.addColorStop(0, '#3a1c10')
    man.addColorStop(1, '#6b2a12')
    ctx.fillStyle = man
    ctx.fillRect(0, SURF, W, H - SURF)
    // sea
    ctx.fillStyle = 'rgba(56,110,170,0.28)'
    ctx.fillRect(0, SEA, W, SURF - SEA)
    ctx.strokeStyle = 'rgba(120,180,240,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, SEA)
    ctx.lineTo(W, SEA)
    ctx.stroke()
  }, [])

  const drawSubduction = useCallback((ctx: CanvasRenderingContext2D, ph: number) => {
    const trench = 330
    // right (continental, thicker) plate
    ctx.fillStyle = '#4a4038'
    ctx.beginPath()
    ctx.moveTo(trench, SURF)
    ctx.lineTo(W, SURF)
    ctx.lineTo(W, SURF + LITHO + 12)
    ctx.lineTo(trench + 20, SURF + LITHO + 12)
    ctx.closePath()
    ctx.fill()
    // left (oceanic) plate + subducting slab
    ctx.fillStyle = '#3b3a3f'
    ctx.beginPath()
    ctx.moveTo(0, SURF)
    ctx.lineTo(trench, SURF)
    ctx.lineTo(trench + 90, SURF + 110)
    ctx.lineTo(trench + 118, SURF + 96)
    ctx.lineTo(trench - 20, SURF)
    ctx.lineTo(0, SURF - 0)
    ctx.lineTo(0, SURF + LITHO)
    ctx.lineTo(trench - 40, SURF + LITHO)
    ctx.closePath()
    ctx.fill()
    // slab band emphasised
    ctx.strokeStyle = '#2b2a2f'
    ctx.lineWidth = LITHO
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(trench - 10, SURF + LITHO / 2)
    ctx.lineTo(trench + 100, SURF + 100)
    ctx.stroke()
    ctx.lineCap = 'butt'

    // plate motion arrow
    arrow(ctx, 60, SURF + LITHO / 2, 150, SURF + LITHO / 2, CYAN, 2)
    ctx.fillStyle = CYAN
    ctx.font = '8px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('oceanic plate →', 40, SURF - 6)

    // water released from slab, rising into the mantle wedge
    for (let i = 0; i < 5; i++) {
      const prog = (ph * 0.012 + i * 0.2) % 1
      const sx = trench + 20 + i * 16
      const sy = SURF + 90 - prog * 70
      ctx.fillStyle = `rgba(96,165,250,${0.85 * (1 - prog)})`
      ctx.beginPath()
      ctx.arc(sx, sy, 2.4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = BLUE
    ctx.font = '8px monospace'
    ctx.fillText('H₂O ↑', trench + 26, SURF + 96)

    // melt zone in the wedge
    const meltX = 430
    ctx.fillStyle = 'rgba(255,140,60,0.22)'
    ctx.beginPath()
    ctx.ellipse(meltX, SURF + 70, 34, 20, 0, 0, Math.PI * 2)
    ctx.fill()

    // magma rising to the arc volcano
    for (let i = 0; i < 3; i++) {
      const prog = (ph * 0.014 + i * 0.33) % 1
      const my = SURF + 60 - prog * 55
      ctx.fillStyle = `rgba(255,160,70,${0.9 * (1 - prog * 0.6)})`
      ctx.beginPath()
      ctx.arc(meltX, my, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // arc volcano
    const erupt = 0.4 + 0.4 * Math.max(0, Math.sin(ph * 0.05))
    cone(ctx, meltX, SURF, 26, 42, erupt)
    for (let i = 0; i < 6; i++) {
      const p = (ph * 0.02 + i * 0.16) % 1
      ctx.fillStyle = `rgba(150,140,135,${0.5 * (1 - p)})`
      ctx.beginPath()
      ctx.arc(meltX + Math.sin((ph * 0.04 + i) ) * 8, SURF - 42 - p * 55, 2 + p * 3, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('mantle wedge', meltX - 4, SURF + 96)
    ctx.fillText('arc volcano', meltX, SURF - 50)
  }, [])

  const drawRidge = useCallback((ctx: CanvasRenderingContext2D, ph: number) => {
    const axis = 300
    // two plates with a gap at the axis
    ctx.fillStyle = '#3b3a3f'
    ctx.fillRect(0, SURF, axis - 14, LITHO)
    ctx.fillRect(axis + 14, SURF, W - axis - 14, LITHO)

    // spreading arrows
    arrow(ctx, axis - 40, SURF + LITHO / 2, axis - 110, SURF + LITHO / 2, CYAN, 2)
    arrow(ctx, axis + 40, SURF + LITHO / 2, axis + 110, SURF + LITHO / 2, CYAN, 2)
    ctx.fillStyle = CYAN
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('← plate', axis - 80, SURF - 6)
    ctx.fillText('plate →', axis + 80, SURF - 6)

    // upwelling mantle (decompression) — rising columns toward the axis
    for (let i = 0; i < 5; i++) {
      const prog = (ph * 0.01 + i * 0.2) % 1
      const y = H - 30 - prog * (H - 30 - SURF - 6)
      const spread = 40 * (1 - prog)
      for (const s of [-1, 0, 1]) {
        ctx.fillStyle = `rgba(255,150,70,${0.7 * (0.3 + prog * 0.7)})`
        ctx.beginPath()
        ctx.arc(axis + s * spread * 0.6, y, 2.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // decompression melt lens
    ctx.fillStyle = 'rgba(255,140,60,0.22)'
    ctx.beginPath()
    ctx.ellipse(axis, SURF + 55, 30, 34, 0, 0, Math.PI * 2)
    ctx.fill()

    // new crust erupting at the ridge crest (submarine)
    const glow = 0.5 + 0.4 * Math.max(0, Math.sin(ph * 0.06))
    ctx.fillStyle = `rgba(255,150,60,${glow})`
    ctx.beginPath()
    ctx.moveTo(axis - 16, SURF + 4)
    ctx.lineTo(axis, SURF - 14)
    ctx.lineTo(axis + 16, SURF + 4)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.font = '8px monospace'
    ctx.fillText('decompression melt', axis, SURF + 100)
    ctx.fillText('new ocean crust', axis, SURF - 22)
  }, [])

  const drawHotspot = useCallback((ctx: CanvasRenderingContext2D, ph: number) => {
    const plume = 250
    const spacing = 92
    const drift = (ph * 0.35) % spacing

    // single drifting plate
    ctx.fillStyle = '#3b3a3f'
    ctx.fillRect(0, SURF, W, LITHO)
    arrow(ctx, 430, SURF + LITHO / 2, 520, SURF + LITHO / 2, CYAN, 2)
    ctx.fillStyle = CYAN
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('plate motion →', 475, SURF - 6)

    // fixed mantle plume
    for (let i = 0; i < 9; i++) {
      const prog = (ph * 0.012 + i / 9) % 1
      const y = H - 8 - prog * (H - 8 - SURF - 2)
      const wob = Math.sin(prog * 6 + ph * 0.03) * 6
      ctx.fillStyle = `rgba(255,150,70,${0.35 + 0.55 * prog})`
      ctx.beginPath()
      ctx.arc(plume + wob, y, 3 + prog * 3, 0, Math.PI * 2)
      ctx.fill()
    }
    // plume head pooling under the plate
    ctx.fillStyle = 'rgba(255,140,60,0.3)'
    ctx.beginPath()
    ctx.ellipse(plume, SURF + LITHO + 8, 30, 12, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.font = '8px monospace'
    ctx.fillText('fixed plume', plume, H - 12)

    // island chain: carried right as the plate drifts, ageing away from the plume
    for (let i = -1; i < 4; i++) {
      const x = plume + i * spacing + drift
      if (x < 20 || x > W - 10) continue
      const dist = Math.abs(x - plume)
      const active = dist < spacing * 0.5 ? 1 - dist / (spacing * 0.5) : 0
      const erode = Math.min(1, (x - plume) / (spacing * 3)) // older to the right = smaller
      const half = 20 * (1 - 0.5 * Math.max(0, erode))
      const hgt = 30 * (1 - 0.6 * Math.max(0, erode))
      cone(ctx, x, SURF, half, hgt, active * (0.5 + 0.4 * Math.max(0, Math.sin(ph * 0.06))))
    }
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.textAlign = 'left'
    ctx.font = '8px monospace'
    ctx.fillText('active', plume - 14, SURF - 34)
    ctx.textAlign = 'right'
    ctx.fillText('older, extinct →', W - 14, SURF - 34)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    setupCanvas(ctx, canvas)
    const ph = phaseRef.current
    const md = modeRef.current

    bg(ctx)
    if (md === 'subduction') drawSubduction(ctx, ph)
    else if (md === 'ridge') drawRidge(ctx, ph)
    else drawHotspot(ctx, ph)

    // title + caption
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = CYAN
    ctx.fillText(INFO[md].label, 12, 18)
    ctx.font = '8px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText(INFO[md].mech, 12, 32)
    ctx.textAlign = 'right'
    ctx.font = '9px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText(INFO[md].example, W - 12, 18)
  }, [setupCanvas, bg, drawSubduction, drawRidge, drawHotspot])

  const ensureLoop = useCallback(() => {
    if (rafRef.current) return
    const loop = () => {
      if (!runningRef.current) {
        rafRef.current = 0
        return
      }
      phaseRef.current += 1
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [draw])

  const { ref } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        phaseRef.current = 120 // one representative static frame
        draw()
        return
      }
      runningRef.current = true
      setRunning(true)
      ensureLoop()
    },
  })

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const selectMode = (md: Mode) => {
    modeRef.current = md
    setMode(md)
    draw()
  }

  const togglePlay = () => {
    const next = !runningRef.current
    runningRef.current = next
    setRunning(next)
    if (next) ensureLoop()
  }

  const reset = () => {
    runningRef.current = false
    setRunning(false)
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    phaseRef.current = 0
    draw()
  }

  const modes: Mode[] = ['subduction', 'ridge', 'hotspot']

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Compare the three settings
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={togglePlay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          {modes.map(md => (
            <button
              key={md}
              onClick={() => selectMode(md)}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
              style={
                mode === md
                  ? { background: CYAN, color: '#0F0D0A' }
                  : { boxShadow: `inset 0 0 0 1px ${CYAN}55`, color: 'var(--color-text-secondary, #cbd5e1)' }
              }
            >
              {INFO[md].label.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>setting: <span style={{ color: CYAN }}>{INFO[mode].label}</span></span>
        <span>melting: {INFO[mode].mech}</span>
        <span style={{ color: GOLD }}>{INFO[mode].example}</span>
      </div>
    </div>
  )
}
