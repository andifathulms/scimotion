'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

const COL = {
  accent: '#F87171', // red — the 2.4 GHz band (longer reach)
  gold: '#F59E0B',
  blue: '#60A5FA',
  violet: '#A78BFA',
  green: '#10B981',
  cyan: '#22D3EE', // 5 GHz band (faster, shorter reach)
  mute: 'rgba(255,245,235,0.5)',
  faint: 'rgba(255,245,235,0.1)',
}

// Signal / rate model. Received power falls with distance roughly as 1/r^2 in
// free space, i.e. 20·log10(d) of path loss. 5 GHz carries a larger fixed
// penalty (shorter reach) but unlocks wider channels and higher top rates.
const NOISE = -95 // dBm noise floor
const PTX = 62 // folded transmit + reference term (SNR in dB at d = 1 m, 2.4 GHz)
const PEN = { '2.4': 0, '5': 20 } as const
const D_MIN = 1
const D_MAX = 80

// SNR (dB) thresholds that unlock each modulation-and-coding tier, and the PHY
// rate (Mbps) each tier delivers on each band. Below the lowest threshold the
// device cannot associate at all — it is out of range.
const SNR_TH = [6, 11, 16, 21, 26, 32, 38, 45]
const RATE_24 = [2, 7, 14, 29, 58, 87, 116, 150]
const RATE_5 = [8, 29, 58, 120, 240, 360, 480, 650]

type Band = '2.4' | '5'

function snrAt(d: number, band: Band) {
  return PTX - 20 * Math.log10(Math.max(1, d)) - PEN[band]
}

function rssiAt(d: number, band: Band) {
  return NOISE + snrAt(d, band)
}

function tierAt(snr: number) {
  let t = -1
  for (let i = 0; i < SNR_TH.length; i++) if (snr >= SNR_TH[i]) t = i
  return t
}

function rateAt(d: number, band: Band) {
  const t = tierAt(snrAt(d, band))
  if (t < 0) return 0
  return (band === '2.4' ? RATE_24 : RATE_5)[t]
}

// Farthest distance the band can still associate — where its curve drops out.
function reach(band: Band) {
  let r = D_MIN
  for (let d = D_MIN; d <= D_MAX; d++) if (snrAt(d, band) >= SNR_TH[0]) r = d
  return r
}

const px = (d: number) => 60 + (d / D_MAX) * 500

export function SignalRangeAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0)
  const [running, setRunning] = useState(false)
  const [dist, setDist] = useState(12)
  const [band, setBand] = useState<Band>('5')

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const AP = { x: 60, y: 92 }
    const rssi = rssiAt(dist, band)
    const snr = snrAt(dist, band)
    const rate = rateAt(dist, band)
    const bandCol = band === '2.4' ? COL.accent : COL.cyan

    // Title.
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.65)'
    ctx.fillText('› drag the device away from the access point — watch signal and rate fall', 16, 22)

    // Coverage bars for each band (how far each reaches along the track).
    const barY24 = 52
    const barY5 = 62
    ctx.fillStyle = 'rgba(248,113,113,0.25)'
    ctx.fillRect(60, barY24, px(reach('2.4')) - 60, 5)
    ctx.fillStyle = 'rgba(34,211,238,0.3)'
    ctx.fillRect(60, barY5, px(reach('5')) - 60, 5)
    ctx.font = '8px monospace'
    ctx.fillStyle = COL.accent
    ctx.fillText('2.4 GHz reach', px(reach('2.4')) - 68, barY24 - 2)
    ctx.fillStyle = COL.cyan
    ctx.fillText('5 GHz reach', px(reach('5')) - 58, barY5 + 13)

    // Expanding signal pulses from the access point.
    for (let k = 0; k < 3; k++) {
      const pr = ((phaseRef.current + k * 40) % 120)
      ctx.beginPath()
      ctx.arc(AP.x, AP.y, pr, -Math.PI / 2.2, Math.PI / 2.2)
      ctx.strokeStyle = `rgba(${band === '2.4' ? '248,113,113' : '34,211,238'},${Math.max(0, 0.5 - pr / 240)})`
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Track line.
    ctx.beginPath()
    ctx.moveTo(60, AP.y)
    ctx.lineTo(560, AP.y)
    ctx.strokeStyle = COL.faint
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = COL.mute
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ;[0, 20, 40, 60, 80].forEach(m => {
      ctx.fillText(`${m}m`, px(m), AP.y + 20)
      ctx.beginPath()
      ctx.moveTo(px(m), AP.y - 3)
      ctx.lineTo(px(m), AP.y + 3)
      ctx.strokeStyle = COL.faint
      ctx.stroke()
    })

    // Access point.
    ctx.beginPath()
    ctx.arc(AP.x, AP.y, 14, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(96,165,250,0.15)'
    ctx.fill()
    ctx.strokeStyle = COL.blue
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = COL.blue
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('AP', AP.x, AP.y)

    // Device marker.
    const dx = px(dist)
    const connected = rate > 0
    ctx.beginPath()
    ctx.arc(dx, AP.y, 11, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(26,23,18,0.95)'
    ctx.fill()
    ctx.strokeStyle = connected ? bandCol : COL.mute
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = connected ? bandCol : COL.mute
    ctx.font = 'bold 9px monospace'
    ctx.fillText('▮', dx, AP.y)

    // Readout panel.
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    const rx = 60
    const ry = 132
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = bandCol
    ctx.fillText(`${band} GHz`, rx, ry)
    ctx.font = '11px monospace'
    ctx.fillStyle = COL.mute
    ctx.fillText(`distance   ${dist} m`, rx, ry + 20)
    ctx.fillText(`RSSI       ${Math.round(rssi)} dBm`, rx, ry + 36)
    ctx.fillText(`SNR        ${Math.max(0, Math.round(snr))} dB`, rx, ry + 52)
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = connected ? COL.green : COL.accent
    ctx.fillText(connected ? `PHY rate   ${rate} Mbps` : 'PHY rate   — out of range', rx, ry + 74)

    // Signal-strength bars (RSSI mapped to 0..5 bars).
    const bars = Math.max(0, Math.min(5, Math.round((rssi + 90) / 8)))
    const bx = 320
    for (let i = 0; i < 5; i++) {
      const bh = 6 + i * 4
      ctx.fillStyle = i < bars ? bandCol : COL.faint
      ctx.fillRect(bx + i * 9, ry + 4 - bh, 6, bh)
    }
    ctx.fillStyle = COL.mute
    ctx.font = '8px monospace'
    ctx.fillText('signal', bx + 6, ry + 18)

    // Rate-vs-distance chart (both bands, marker at current distance).
    const cx0 = 60
    const cy0 = 230
    const cw = 500
    const ch = 100
    const maxRate = 650
    ctx.strokeStyle = COL.faint
    ctx.lineWidth = 1
    ctx.strokeRect(cx0, cy0, cw, ch)
    ctx.fillStyle = COL.mute
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('PHY rate vs distance', cx0, cy0 - 6)
    ctx.textAlign = 'right'
    ctx.fillText('650', cx0 - 4, cy0 + 6)
    ctx.fillText('0', cx0 - 4, cy0 + ch)

    const plot = (b: Band, color: string) => {
      ctx.beginPath()
      let started = false
      for (let d = D_MIN; d <= D_MAX; d++) {
        const r = rateAt(d, b)
        const X = cx0 + (d / D_MAX) * cw
        const Y = cy0 + ch - (r / maxRate) * ch
        if (r <= 0) {
          started = false
          continue
        }
        if (!started) {
          ctx.moveTo(X, Y)
          started = true
        } else {
          ctx.lineTo(X, Y)
        }
      }
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()
    }
    plot('2.4', COL.accent)
    plot('5', COL.cyan)

    // Marker at current distance.
    const mX = cx0 + (dist / D_MAX) * cw
    ctx.beginPath()
    ctx.moveTo(mX, cy0)
    ctx.lineTo(mX, cy0 + ch)
    ctx.strokeStyle = 'rgba(255,245,235,0.35)'
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.setLineDash([])
    if (rate > 0) {
      const mY = cy0 + ch - (rate / maxRate) * ch
      ctx.beginPath()
      ctx.arc(mX, mY, 4, 0, Math.PI * 2)
      ctx.fillStyle = bandCol
      ctx.fill()
    }

    // Chart legend.
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = COL.accent
    ctx.fillText('— 2.4 GHz (farther, slower)', cx0 + 8, cy0 + 14)
    ctx.fillStyle = COL.cyan
    ctx.fillText('— 5 GHz (faster, shorter)', cx0 + 8, cy0 + 28)
  }, [dist, band])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const loop = () => {
      phaseRef.current += 1.4
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
      else draw()
    },
  })

  useEffect(() => {
    draw()
  }, [draw])

  // Drag the device along the track to change distance.
  const setFromClientX = (clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scale = W / rect.width
    const x = (clientX - rect.left) * scale
    const d = Math.round(((x - 60) / 500) * D_MAX)
    setDist(Math.max(D_MIN, Math.min(D_MAX, d)))
  }
  const draggingRef = useRef(false)
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = true
    setFromClientX(e.clientX)
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingRef.current) setFromClientX(e.clientX)
  }
  const onUp = () => {
    draggingRef.current = false
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    setDist(12)
    setBand('5')
    triggerReset()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Signal, distance &amp; rate</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas
          role="img"
          aria-label="Animated diagram: Signal, distance &amp; rate. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          className="w-full rounded-lg cursor-pointer touch-none"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(['2.4', '5'] as const).map(b => (
            <button key={b} onClick={() => setBand(b)}
              className={`px-3 py-1.5 uppercase font-mono tracking-wide transition-colors ${band === b ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {b} GHz
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          distance
          <input type="range" min={D_MIN} max={D_MAX} value={dist}
            onChange={e => setDist(Number(e.target.value))} className="accent-accent" />
          <span className="font-mono tabular-nums w-10">{dist} m</span>
        </label>
      </div>
    </div>
  )
}
