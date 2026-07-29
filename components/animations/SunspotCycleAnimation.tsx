'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340
const BG = '#0F0D0A'

const ACCENT = '#818CF8' // field accent, indigo

// Disk (left) shows the current spot pattern; the graph (right) shows sunspot number
// over the ~11-year cycle.
const DISK_CX = 150
const DISK_CY = 150
const DISK_R = 110

const GRAPH_X = 300
const GRAPH_Y = 60
const GRAPH_W = 280
const GRAPH_H = 180

const CYCLE_YEARS = 11
const FULL = 220 // frames per simulated year -> whole cycle in view

// Deterministic PRNG (mulberry32) seeded from an index. No Math.random / Date used.
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Smooth sunspot-number envelope: near zero at minimum, peaking mid-cycle.
function sunspotNumber(phase: number) {
  // phase in [0,1); a raised, sharpened sine so maxima are pronounced.
  const s = Math.sin(Math.PI * phase)
  return Math.pow(Math.max(0, s), 1.4)
}

type Spot = { lat: number; lon: number; size: number }

// Spots for a given cycle phase. Latitude drifts from ~high (±30°) toward the
// equator as the cycle advances — the butterfly pattern. Deterministic per phase bin.
function spotsForPhase(phase: number): Spot[] {
  const count = Math.round(sunspotNumber(phase) * 9)
  const rand = seeded(Math.floor(phase * 40) * 97 + 7)
  const baseLat = 30 * (1 - phase) + 5 // high early, near equator late
  const spots: Spot[] = []
  for (let i = 0; i < count; i++) {
    const hemi = rand() < 0.5 ? 1 : -1
    const lat = hemi * (baseLat + (rand() - 0.5) * 10)
    const lon = (rand() - 0.5) * 140 // degrees from central meridian
    const size = 3 + rand() * 5
    spots.push({ lat, lon, size })
  }
  return spots
}

export function SunspotCycleAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(false)
  const [frame, setFrame] = useState(0)

  const frameRef = useRef(0)
  const rafRef = useRef(0)

  const { ref } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Static: park at solar maximum (mid-cycle) with a full spot pattern.
        frameRef.current = Math.round(0.5 * CYCLE_YEARS * FULL)
        setFrame(frameRef.current)
        setPlaying(false)
      } else {
        setPlaying(true)
      }
    },
  })

  const draw = useCallback((f: number) => {
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

    const yearsElapsed = f / FULL
    const phase = (yearsElapsed % CYCLE_YEARS) / CYCLE_YEARS
    const cycleIndex = Math.floor(yearsElapsed / CYCLE_YEARS)
    // Magnetic polarity flips every cycle -> 22-year magnetic period.
    const polarity = cycleIndex % 2 === 0 ? '+ / −' : '− / +'

    // --- Solar disk ---
    const grd = ctx.createRadialGradient(DISK_CX - 25, DISK_CY - 25, 10, DISK_CX, DISK_CY, DISK_R)
    grd.addColorStop(0, '#FDE68A')
    grd.addColorStop(0.7, '#FBBF24')
    grd.addColorStop(1, '#EA580C')
    ctx.fillStyle = grd
    ctx.beginPath(); ctx.arc(DISK_CX, DISK_CY, DISK_R, 0, Math.PI * 2); ctx.fill()

    // Equator guide.
    ctx.strokeStyle = 'rgba(15,13,10,0.25)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(DISK_CX - DISK_R, DISK_CY); ctx.lineTo(DISK_CX + DISK_R, DISK_CY); ctx.stroke()
    ctx.setLineDash([])

    // Spots (cooler/darker patches). Project lat/lon onto the disk.
    for (const s of spotsForPhase(phase)) {
      const latR = (s.lat * Math.PI) / 180
      const lonR = (s.lon * Math.PI) / 180
      const x = DISK_CX + Math.sin(lonR) * Math.cos(latR) * DISK_R
      const y = DISK_CY - Math.sin(latR) * DISK_R
      // Umbra (dark core) + penumbra (lighter halo).
      ctx.fillStyle = 'rgba(120,60,20,0.55)'
      ctx.beginPath(); ctx.ellipse(x, y, s.size * 1.6, s.size, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(40,20,10,0.9)'
      ctx.beginPath(); ctx.ellipse(x, y, s.size, s.size * 0.65, 0, 0, Math.PI * 2); ctx.fill()
    }

    ctx.fillStyle = 'rgba(255,245,235,0.7)'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('solar disk', DISK_CX, DISK_CY + DISK_R + 20)
    ctx.textAlign = 'left'

    // --- Sunspot-number graph ---
    ctx.strokeStyle = 'rgba(255,245,235,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(GRAPH_X, GRAPH_Y)
    ctx.lineTo(GRAPH_X, GRAPH_Y + GRAPH_H)
    ctx.lineTo(GRAPH_X + GRAPH_W, GRAPH_Y + GRAPH_H)
    ctx.stroke()

    ctx.fillStyle = 'rgba(255,245,235,0.5)'
    ctx.font = '10px monospace'
    ctx.fillText('sunspot number', GRAPH_X + 4, GRAPH_Y - 6)
    ctx.save()
    ctx.translate(GRAPH_X - 8, GRAPH_Y + GRAPH_H + 16)
    ctx.fillText('0', 0, 0)
    ctx.restore()

    // Two full cycles of the curve as a faint reference.
    ctx.strokeStyle = 'rgba(129,140,248,0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let px = 0; px <= GRAPH_W; px++) {
      const ph = ((px / GRAPH_W) * 2) % 1
      const v = sunspotNumber(ph)
      const gx = GRAPH_X + px
      const gy = GRAPH_Y + GRAPH_H - v * (GRAPH_H - 12)
      if (px === 0) ctx.moveTo(gx, gy); else ctx.lineTo(gx, gy)
    }
    ctx.stroke()

    // Progress marker: current position within the two-cycle window.
    const windowPos = (yearsElapsed % (2 * CYCLE_YEARS)) / (2 * CYCLE_YEARS)
    const mx = GRAPH_X + windowPos * GRAPH_W
    const mv = sunspotNumber(phase)
    const my = GRAPH_Y + GRAPH_H - mv * (GRAPH_H - 12)
    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.beginPath(); ctx.moveTo(mx, GRAPH_Y); ctx.lineTo(mx, GRAPH_Y + GRAPH_H); ctx.stroke()
    ctx.fillStyle = ACCENT
    ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill()

    // Min / max labels.
    ctx.fillStyle = 'rgba(255,245,235,0.45)'
    ctx.font = '9px monospace'
    const isMax = mv > 0.75
    const isMin = mv < 0.15
    ctx.fillStyle = isMax ? ACCENT : isMin ? '#F472B6' : 'rgba(255,245,235,0.45)'
    ctx.fillText(isMax ? 'solar maximum' : isMin ? 'solar minimum' : 'ramping', mx - 22, GRAPH_Y + GRAPH_H + 14)

    // Polarity note.
    ctx.fillStyle = 'rgba(255,245,235,0.6)'
    ctx.font = '10px monospace'
    ctx.fillText(`N/S magnetic polarity: ${polarity}  (flips each cycle)`, GRAPH_X, GRAPH_Y + GRAPH_H + 34)
  }, [])

  useEffect(() => { draw(frame) }, [draw, frame])

  useEffect(() => {
    if (!playing) return
    const loop = () => {
      frameRef.current += 1
      setFrame(frameRef.current)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing])

  const reset = () => {
    setPlaying(false)
    cancelAnimationFrame(rafRef.current)
    frameRef.current = 0
    setFrame(0)
  }

  const yearsElapsed = frame / FULL
  const phase = (yearsElapsed % CYCLE_YEARS) / CYCLE_YEARS
  const cycleIndex = Math.floor(yearsElapsed / CYCLE_YEARS)
  const ssn = sunspotNumber(phase)
  const yearInCycle = (phase * CYCLE_YEARS).toFixed(1)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The 11-year solar cycle</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: BG }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>cycle: <span style={{ color: ACCENT }}>#{cycleIndex + 1}</span></span>
        <span>year in cycle: <span style={{ color: ACCENT }}>{yearInCycle} / {CYCLE_YEARS}</span></span>
        <span>relative sunspot number: <span style={{ color: ACCENT }}>{(ssn * 100).toFixed(0)}%</span></span>
        <span className="text-text-muted">{ssn > 0.75 ? 'maximum' : ssn < 0.15 ? 'minimum' : 'rising/falling'}</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setPlaying(p => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: ACCENT, color: BG }}>
          <Play size={12} /> {playing ? 'Pause' : 'Play'}
        </button>
        <button onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary">
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <p className="mt-2 text-xs text-text-muted">
        Spots emerge at high latitudes early in each cycle and drift toward the equator (the butterfly pattern),
        peaking at <strong style={{ color: ACCENT }}>solar maximum</strong> and fading at minimum.
        Each spot is a cooler (~3,800 K), magnetically choked patch — dark only by contrast.
        At every cycle&rsquo;s end the Sun&rsquo;s magnetic polarity <strong style={{ color: ACCENT }}>reverses</strong>, so the full magnetic period is ~22 years.
      </p>
    </div>
  )
}
