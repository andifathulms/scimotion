'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360
const SEA_Y = 150 // ocean surface
const FLOOR_Y = 320
const OCEAN_L = 40
const OCEAN_R = 560

// field accent cyan
const CYAN = '#22D3EE'
const WARM = '#F97316' // warm water / warm pool
const COOL = '#3B82F6' // cold water / upwelling
const TEAL = '#2DD4BF' // circulation
const GOLD = '#F59E0B' // trade winds
const RAIN = '#38BDF8' // rainfall

type Mode = 'normal' | 'elnino' | 'lanina'
const targetFor = (m: Mode) => (m === 'elnino' ? 1 : m === 'lanina' ? -1 : 0)

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, size: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-size, -size * 0.55)
  ctx.lineTo(-size, size * 0.55)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()
}

// animated dashed line with arrowhead at (x2,y2)
function flowLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  color: string, alpha: number, dashPhase: number, width: number
) {
  if (alpha <= 0.02) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.setLineDash([7, 6])
  ctx.lineDashOffset = dashPhase
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.setLineDash([])
  arrowHead(ctx, x2, y2, Math.atan2(y2 - y1, x2 - x1), 6.5, color)
  ctx.restore()
}

export function WalkerCirculationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const sRef = useRef(0)          // -1 La Niña … 0 Normal … +1 El Niño
  const phaseRef = useRef(0)
  const modeRef = useRef<Mode>('normal')
  const reducedRef = useRef(false)

  const [mode, setMode] = useState<Mode>('normal')
  const [sDisp, setSDisp] = useState(0)
  const { ref, triggered } = useAnimationTrigger({
    onTrigger: reduced => {
      reducedRef.current = reduced
      if (reduced) sRef.current = targetFor(modeRef.current)
    },
  })

  useEffect(() => { modeRef.current = mode }, [mode])

  const draw = useCallback(() => {
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

    const s = sRef.current
    const ph = phaseRef.current

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)
    ctx.font = '10px monospace'

    // --- derived geometry ---
    // thermocline endpoints (y: smaller = shallower/nearer surface)
    const westTh = clamp(238 - s * 34, 190, 268)   // deep in west normally
    const eastTh = clamp(178 + s * 34, 150, 250)    // shallow in east normally
    // rising branch (rain) location: west in normal, slides east in El Niño
    const rainX = clamp(150 + (s >= 0 ? s * 190 : s * 45), 90, 360)
    // trade wind strength (+easterly, −reversed)
    const wind = 1 - s * 1.15
    // Peru upwelling strength (east)
    const upwell = clamp(1 - s, 0, 1.5)

    // --- sky ---
    ctx.fillStyle = 'rgba(56,189,248,0.05)'
    ctx.fillRect(0, 0, W, SEA_Y)

    // --- ocean: cold base ---
    ctx.fillStyle = 'rgba(59,130,246,0.16)'
    ctx.fillRect(OCEAN_L, SEA_Y, OCEAN_R - OCEAN_L, FLOOR_Y - SEA_Y)

    // --- warm layer above thermocline (clipped) ---
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(OCEAN_L, SEA_Y)
    ctx.lineTo(OCEAN_R, SEA_Y)
    ctx.lineTo(OCEAN_R, eastTh)
    ctx.lineTo(OCEAN_L, westTh)
    ctx.closePath()
    ctx.clip()
    const grad = ctx.createLinearGradient(OCEAN_L, 0, OCEAN_R, 0)
    // warm pool concentrated around rainX
    const wp = rainX / W
    grad.addColorStop(clamp(wp - 0.35, 0, 1), 'rgba(249,115,22,0.10)')
    grad.addColorStop(clamp(wp, 0.01, 0.99), 'rgba(249,115,22,0.42)')
    grad.addColorStop(clamp(wp + 0.35, 0, 1), 'rgba(249,115,22,0.10)')
    ctx.fillStyle = grad
    ctx.fillRect(OCEAN_L, SEA_Y, OCEAN_R - OCEAN_L, 130)
    ctx.restore()

    // --- thermocline line ---
    ctx.beginPath()
    ctx.moveTo(OCEAN_L, westTh)
    ctx.lineTo(OCEAN_R, eastTh)
    ctx.strokeStyle = CYAN
    ctx.lineWidth = 2
    ctx.setLineDash([5, 4])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = CYAN
    ctx.textAlign = 'center'
    ctx.fillText('thermocline', (OCEAN_L + OCEAN_R) / 2, (westTh + eastTh) / 2 - 6)

    // --- ocean surface line ---
    ctx.beginPath()
    ctx.moveTo(OCEAN_L, SEA_Y)
    ctx.lineTo(OCEAN_R, SEA_Y)
    ctx.strokeStyle = 'rgba(56,189,248,0.55)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // --- landmasses ---
    ctx.fillStyle = 'rgba(120,110,90,0.55)'
    // west: Indonesia / Australia
    ctx.beginPath()
    ctx.moveTo(0, SEA_Y)
    ctx.lineTo(OCEAN_L, SEA_Y)
    ctx.lineTo(OCEAN_L - 6, SEA_Y - 22)
    ctx.lineTo(0, SEA_Y - 14)
    ctx.closePath()
    ctx.fill()
    // east: Peru / Andes (taller)
    ctx.beginPath()
    ctx.moveTo(W, SEA_Y)
    ctx.lineTo(OCEAN_R, SEA_Y)
    ctx.lineTo(OCEAN_R + 10, SEA_Y - 60)
    ctx.lineTo(W, SEA_Y - 78)
    ctx.closePath()
    ctx.fill()

    // --- Walker circulation cell ---
    const topY = 46
    const eL = clamp(rainX - 120, 70, 300)
    const eR = clamp(rainX + 130, 300, 540)
    const dp = -ph * 1.6
    // rising branch
    flowLine(ctx, rainX, SEA_Y - 6, rainX, topY + 8, TEAL, 0.85, dp, 2)
    // aloft, spreading both ways
    flowLine(ctx, rainX, topY, eR, topY, TEAL, 0.7, dp, 2)
    flowLine(ctx, rainX, topY, eL, topY, TEAL, 0.7, dp, 2)
    // sinking branches
    flowLine(ctx, eR, topY + 8, eR, SEA_Y - 8, TEAL, 0.6, dp, 2)
    flowLine(ctx, eL, topY + 8, eL, SEA_Y - 8, TEAL, 0.45, dp, 2)
    ctx.fillStyle = 'rgba(45,212,191,0.85)'
    ctx.textAlign = 'center'
    ctx.fillText('Walker circulation', rainX, topY - 6)

    // --- trade winds (surface) ---
    const wAbs = Math.abs(wind)
    const wDir = wind >= 0 ? -1 : 1 // easterly → arrow points left (−x)
    const wcolor = GOLD
    for (let i = 0; i < 3; i++) {
      const y = 128 + i * 8
      const x1 = 120
      const x2 = 440
      const from = wDir < 0 ? x2 : x1
      const to = wDir < 0 ? x1 : x2
      flowLine(ctx, from, y, to, y, wcolor, clamp(0.25 + wAbs * 0.45, 0, 0.9), wDir < 0 ? ph : -ph, 1.6)
    }
    ctx.fillStyle = GOLD
    ctx.textAlign = 'center'
    ctx.fillText(wind >= 0 ? 'trade winds (easterly)' : 'winds reversed (westerly)', 280, 118)

    // --- Peru upwelling (east) ---
    if (upwell > 0.05) {
      for (let i = 0; i < 2; i++) {
        const x = 512 + i * 14
        flowLine(ctx, x, eastTh, x, SEA_Y + 4, COOL, clamp(upwell * 0.7, 0, 0.9), ph * 1.2, 1.6)
      }
      ctx.fillStyle = COOL
      ctx.textAlign = 'right'
      ctx.fillText('upwelling', OCEAN_R - 4, SEA_Y + 26)
      ctx.fillText('(cold, nutrient-rich)', OCEAN_R - 4, SEA_Y + 38)
    } else {
      ctx.fillStyle = 'rgba(148,163,184,0.7)'
      ctx.textAlign = 'right'
      ctx.fillText('upwelling shut off', OCEAN_R - 4, SEA_Y + 26)
      ctx.fillText('(fishery collapses)', OCEAN_R - 4, SEA_Y + 38)
    }

    // --- rain clouds over rising branch ---
    ctx.fillStyle = 'rgba(226,232,240,0.8)'
    ctx.beginPath()
    ctx.ellipse(rainX, 70, 34, 12, 0, 0, Math.PI * 2)
    ctx.ellipse(rainX - 20, 74, 20, 9, 0, 0, Math.PI * 2)
    ctx.ellipse(rainX + 22, 74, 22, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    for (let i = 0; i < 7; i++) {
      const rx = rainX - 30 + i * 10
      const off = ((ph * 2 + i * 13) % 40)
      ctx.strokeStyle = RAIN
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(rx, 84 + off)
      ctx.lineTo(rx - 2, 92 + off)
      ctx.stroke()
    }
    ctx.fillStyle = RAIN
    ctx.textAlign = 'center'
    ctx.fillText('heavy rainfall', rainX, 108)

    // --- warm pool label ---
    ctx.fillStyle = WARM
    ctx.textAlign = 'center'
    ctx.fillText('warm pool', clamp(rainX, 90, 470), (SEA_Y + (rainX <= 300 ? westTh : eastTh)) / 2 + 4)

    // --- side labels ---
    ctx.fillStyle = 'rgba(226,232,240,0.7)'
    ctx.textAlign = 'left'
    ctx.fillText('WEST', 4, FLOOR_Y - 4)
    ctx.fillText('Indonesia / Australia', 4, FLOOR_Y + 10)
    ctx.textAlign = 'right'
    ctx.fillText('EAST', W - 4, FLOOR_Y - 4)
    ctx.fillText('Peru', W - 4, FLOOR_Y + 10)
  }, [])

  // continuous loop: ease s toward target + animate dashes
  useEffect(() => {
    if (!triggered) return
    if (reducedRef.current) {
      sRef.current = targetFor(modeRef.current)
      draw()
      return
    }
    const loop = () => {
      const tgt = targetFor(modeRef.current)
      sRef.current += (tgt - sRef.current) * 0.06
      phaseRef.current += 1
      if (phaseRef.current % 6 === 0) setSDisp(sRef.current)
      draw()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [triggered, draw])

  const wind = 1 - sDisp * 1.15
  const tilt = (238 - sDisp * 34) - (178 + sDisp * 34) // west − east depth
  const upwell = clamp(1 - sDisp, 0, 1.5)

  const btn = (m: Mode, label: string) => (
    <button
      onClick={() => setMode(m)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
      style={
        mode === m
          ? { background: CYAN, color: '#0F0D0A' }
          : { background: 'rgba(245,240,232,0.05)', color: 'rgba(245,240,232,0.65)' }
      }
    >
      {label}
    </button>
  )

  return (
    <div ref={ref} className="animation-block">
      <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)', aspectRatio: `${W} / ${H}` }} />
      <div className="mt-3 px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>state: <span style={{ color: CYAN }}>{mode === 'elnino' ? 'El Niño (warm)' : mode === 'lanina' ? 'La Niña (cool)' : 'Neutral'}</span></span>
        <span>trades: {wind >= 0 ? `easterly ${(wind).toFixed(2)}` : `reversed ${wind.toFixed(2)}`}</span>
        <span>thermocline tilt (W−E): {tilt.toFixed(0)} m-eq</span>
        <span>Peru upwelling: {upwell < 0.1 ? 'off' : `${upwell.toFixed(2)}`}</span>
      </div>
      <div className="animation-controls flex-wrap gap-3 mt-3">
        <span className="flex items-center gap-1.5 text-xs text-text-muted"><Play size={13} /> phase</span>
        {btn('normal', 'Normal')}
        {btn('elnino', 'El Niño')}
        {btn('lanina', 'La Niña')}
      </div>
    </div>
  )
}
