'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

// --- colours ----------------------------------------------------------------
const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const SNOW = '#E2F0F8'
const PINK = '#F472B6'
const MUTE = 'rgba(245,240,232,0.4)'

// --- reservoirs -------------------------------------------------------------
// V in km^3, F (the through-flux) in km^3/yr. Residence time tau = V / F.
// Numbers are approximate real global values (USGS / Trenberth et al.).
type Res = { key: string; name: string; V: number; F: number; color: string }

const RES: Res[] = [
  { key: 'atmosphere', name: 'Atmosphere', V: 12_900, F: 495_000, color: CYAN },
  { key: 'rivers', name: 'Rivers', V: 2_120, F: 45_000, color: PINK },
  { key: 'soil', name: 'Soil moisture', V: 16_500, F: 71_000, color: GREEN },
  { key: 'lakes', name: 'Lakes', V: 176_000, F: 3_500, color: VIOLET },
  { key: 'groundwater', name: 'Groundwater', V: 23_400_000, F: 15_600, color: GOLD },
  { key: 'ice', name: 'Ice caps & glaciers', V: 24_064_000, F: 2_400, color: SNOW },
  { key: 'ocean', name: 'Ocean (deep)', V: 1_338_000_000, F: 419_000, color: BLUE },
]

const TOTAL_V = RES.reduce((s, r) => s + r.V, 0)
const tauYears = (r: Res) => r.V / r.F

// --- layout -----------------------------------------------------------------
const ROW_Y0 = 74
const ROW_H = 30
const BAR_X = 118
const BAR_MAX = 150

// Log-scaled bar length so every reservoir is visible despite a 10^5 range.
const barLen = (V: number) => {
  const lv = Math.log10(V)
  return 6 + ((lv - 3) / (9.2 - 3)) * BAR_MAX
}

// Residence-time axis: log scale in years, from ~1 day to 1,000,000 yr.
const AX_L = 62
const AX_R = 560
const AX_Y = 330
const LOG_LO = Math.log10(1 / 365.25) // one day, in years
const LOG_HI = 6 // one million years
const tauToX = (yr: number) => {
  const l = Math.max(LOG_LO, Math.min(LOG_HI, Math.log10(yr)))
  return AX_L + ((l - LOG_LO) / (LOG_HI - LOG_LO)) * (AX_R - AX_L)
}

// One turnover of the animated ring takes tau * SCALE frames, so the tiny fast
// atmosphere visibly whirs while the giant slow reservoirs sit frozen.
const SPIN_SCALE = 3000

function fmtVol(V: number): string {
  return `${V.toLocaleString('en-US')} km³`
}
function fmtTau(yr: number): string {
  const days = yr * 365.25
  if (days < 400) return `${days.toFixed(0)} days`
  return `${Math.round(yr).toLocaleString('en-US')} yr`
}
function fmtPct(V: number): string {
  const p = (V / TOTAL_V) * 100
  if (p >= 0.1) return `${p.toFixed(1)}%`
  return `${p.toPrecision(1)}%`
}

export function WaterReservoirAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const frameRef = useRef(0)

  const [sel, setSel] = useState('atmosphere')
  const selRef = useRef('atmosphere')
  useEffect(() => {
    selRef.current = sel
  }, [sel])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const frame = frameRef.current
    const selKey = selRef.current

    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'

    // ---- to-scale proportion bar ----
    const pbX = 16
    const pbW = 500
    const pbY = 20
    const pbH = 16
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('Every drop of water on Earth, to scale', pbX, pbY - 6)
    let cx = pbX
    for (const seg of [
      { V: RES.find(r => r.key === 'ocean')!.V, color: BLUE, label: 'ocean 96.5%' },
      { V: RES.find(r => r.key === 'ice')!.V, color: SNOW, label: 'ice 1.7%' },
      { V: RES.find(r => r.key === 'groundwater')!.V, color: GOLD, label: 'gw 1.7%' },
    ]) {
      const w = (seg.V / TOTAL_V) * pbW
      ctx.fillStyle = `${seg.color}CC`
      ctx.fillRect(cx, pbY, w, pbH)
      if (w > 26) {
        ctx.fillStyle = seg.color === SNOW ? 'rgba(15,13,10,0.8)' : 'rgba(15,13,10,0.85)'
        ctx.fillText(seg.label, cx + 4, pbY + 11)
      }
      cx += w
    }
    // everything else is a sub-pixel sliver
    ctx.strokeStyle = MUTE
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx, pbY - 3)
    ctx.lineTo(cx, pbY + pbH + 3)
    ctx.stroke()
    ctx.fillStyle = MUTE
    ctx.fillText('← all fresh surface water + the atmosphere: < 0.02%', cx + 6, pbY + 11)

    // ---- reservoir rows: log-scaled size + turnover ring ----
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('reservoir', 16, ROW_Y0 - 10)
    ctx.fillText('size (log scale)', BAR_X, ROW_Y0 - 10)
    ctx.fillText('turnover', 300, ROW_Y0 - 10)

    RES.forEach((r, i) => {
      const y = ROW_Y0 + i * ROW_H
      const on = r.key === selKey
      if (on) {
        ctx.fillStyle = `${r.color}14`
        ctx.fillRect(10, y - 12, 350, ROW_H - 4)
      }
      ctx.fillStyle = on ? r.color : 'rgba(245,240,232,0.7)'
      ctx.textAlign = 'left'
      ctx.fillText(r.name, 16, y + 3)

      // log-scaled size bar
      const len = barLen(r.V)
      ctx.fillStyle = on ? r.color : `${r.color}88`
      ctx.fillRect(BAR_X, y - 5, len, 9)
      ctx.fillStyle = MUTE
      ctx.fillText(fmtPct(r.V), BAR_X + len + 5, y + 3)

      // turnover ring: dot orbiting at rate 1 / tau
      const ringX = 324
      const ringY = y - 1
      ctx.beginPath()
      ctx.arc(ringX, ringY, 8, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(245,240,232,0.14)'
      ctx.lineWidth = 1
      ctx.stroke()
      const period = tauYears(r) * SPIN_SCALE
      const ang = (frame / period) * Math.PI * 2 - Math.PI / 2
      ctx.beginPath()
      ctx.arc(ringX + Math.cos(ang) * 8, ringY + Math.sin(ang) * 8, 2.4, 0, Math.PI * 2)
      ctx.fillStyle = r.color
      ctx.fill()
    })

    // ---- residence-time computation card for the selected reservoir ----
    const r = RES.find(x => x.key === selKey)!
    const cardX = 372
    const cardY = 68
    const cardW = 212
    ctx.strokeStyle = `${r.color}55`
    ctx.lineWidth = 1.25
    ctx.beginPath()
    ctx.rect(cardX, cardY, cardW, 118)
    ctx.fillStyle = `${r.color}0E`
    ctx.fill()
    ctx.stroke()
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('RESIDENCE TIME', cardX + 12, cardY + 18)
    ctx.font = '11px monospace'
    ctx.fillStyle = r.color
    ctx.fillText('τ = V / F', cardX + 12, cardY + 40)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.7)'
    ctx.fillText(`V = ${fmtVol(r.V)}`, cardX + 12, cardY + 60)
    ctx.fillText(`F = ${r.F.toLocaleString('en-US')} km³/yr`, cardX + 12, cardY + 76)
    ctx.font = '15px monospace'
    ctx.fillStyle = r.color
    ctx.fillText(`τ ≈ ${fmtTau(tauYears(r))}`, cardX + 12, cardY + 102)
    ctx.font = '9px monospace'

    // ---- residence-time log axis with every reservoir marked ----
    ctx.strokeStyle = 'rgba(255,245,235,0.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(AX_L, AX_Y)
    ctx.lineTo(AX_R, AX_Y)
    ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.textAlign = 'left'
    ctx.fillText('residence time  (log scale)', AX_L, AX_Y - 40)

    const ticks: [number, string][] = [
      [1 / 365.25, '1 day'],
      [1 / 12, '1 mo'],
      [1, '1 yr'],
      [100, '100 yr'],
      [10_000, '10 kyr'],
      [1_000_000, '1 Myr'],
    ]
    for (const [yr, label] of ticks) {
      const x = tauToX(yr)
      ctx.strokeStyle = 'rgba(255,245,235,0.12)'
      ctx.beginPath()
      ctx.moveTo(x, AX_Y - 4)
      ctx.lineTo(x, AX_Y + 4)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.textAlign = 'center'
      ctx.fillText(label, x, AX_Y + 15)
    }

    RES.forEach(res => {
      const x = tauToX(tauYears(res))
      const on = res.key === selKey
      ctx.beginPath()
      ctx.arc(x, AX_Y, on ? 5 : 3, 0, Math.PI * 2)
      ctx.fillStyle = res.color
      ctx.fill()
      if (on) {
        ctx.strokeStyle = res.color
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, AX_Y - 6)
        ctx.lineTo(x, AX_Y - 22)
        ctx.stroke()
        ctx.fillStyle = res.color
        ctx.textAlign = 'center'
        ctx.fillText(`${res.name}: ${fmtTau(tauYears(res))}`, x, AX_Y - 26)
      }
    })
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  const [running, setRunning] = useState(false)

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      frameRef.current += 1
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => {
    if (!running) draw()
  }, [sel, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    frameRef.current = 0
    setSel('atmosphere')
    selRef.current = 'atmosphere'
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Reservoirs and residence times
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
      <div className="animation-controls flex-wrap gap-2">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? 'Pause' : 'Play'}
        </button>
        {RES.map(r => (
          <button
            key={r.key}
            onClick={() => setSel(r.key)}
            className="px-2 py-1 rounded text-xs font-medium border transition-colors"
            style={
              sel === r.key
                ? { color: r.color, borderColor: `${r.color}55`, background: `${r.color}14` }
                : {
                    color: 'rgba(245,240,232,0.5)',
                    borderColor: 'rgba(245,240,232,0.15)',
                    background: 'rgba(245,240,232,0.04)',
                  }
            }
          >
            {r.name}
          </button>
        ))}
      </div>
    </div>
  )
}
