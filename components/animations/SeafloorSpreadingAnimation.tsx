'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300
const RIDGE = 300 // x of the ridge axis
const PX_PER_KM = 0.45
const HALF_PX = 288 // widest flank we can draw
const MAX_KM = HALF_PX / PX_PER_KM // 640 km
const START_MA = 6.0 // model starts 6 Myr before present
const MA_PER_SEC = 0.26

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'

// The real geomagnetic polarity timescale for the last 6 Myr (ages in Ma,
// after Cande & Kent 1995 / GTS2012). `n` marks normal polarity — the same
// sense as today's field — and the named subchrons are the short excursions
// that make the pattern recognisable rather than regular.
type Chron = { t0: number; t1: number; n: boolean; name: string }

const CHRONS: Chron[] = [
  { t0: 0, t1: 0.781, n: true, name: 'Brunhes' },
  { t0: 0.781, t1: 0.988, n: false, name: 'Matuyama' },
  { t0: 0.988, t1: 1.072, n: true, name: 'Jaramillo' },
  { t0: 1.072, t1: 1.173, n: false, name: 'Matuyama' },
  { t0: 1.173, t1: 1.185, n: true, name: 'Cobb Mountain' },
  { t0: 1.185, t1: 1.778, n: false, name: 'Matuyama' },
  { t0: 1.778, t1: 1.945, n: true, name: 'Olduvai' },
  { t0: 1.945, t1: 2.128, n: false, name: 'Matuyama' },
  { t0: 2.128, t1: 2.148, n: true, name: 'Réunion' },
  { t0: 2.148, t1: 2.581, n: false, name: 'Matuyama' },
  { t0: 2.581, t1: 3.032, n: true, name: 'Gauss' },
  { t0: 3.032, t1: 3.116, n: false, name: 'Kaena' },
  { t0: 3.116, t1: 3.207, n: true, name: 'Gauss' },
  { t0: 3.207, t1: 3.33, n: false, name: 'Mammoth' },
  { t0: 3.33, t1: 3.596, n: true, name: 'Gauss' },
  { t0: 3.596, t1: 4.187, n: false, name: 'Gilbert' },
  { t0: 4.187, t1: 4.3, n: true, name: 'Cochiti' },
  { t0: 4.3, t1: 4.493, n: false, name: 'Gilbert' },
  { t0: 4.493, t1: 4.631, n: true, name: 'Nunivak' },
  { t0: 4.631, t1: 4.799, n: false, name: 'Gilbert' },
  { t0: 4.799, t1: 4.896, n: true, name: 'Sidufjall' },
  { t0: 4.896, t1: 4.997, n: false, name: 'Gilbert' },
  { t0: 4.997, t1: 5.235, n: true, name: 'Thvera' },
  { t0: 5.235, t1: 6.033, n: false, name: 'Gilbert' },
]

const chronAt = (t: number): Chron =>
  CHRONS.find(c => t >= c.t0 && t < c.t1) ?? CHRONS[CHRONS.length - 1]

// Layout bands
const PROF_TOP = 54
const PROF_ZERO = 88
const STRIPE_TOP = 122
const STRIPE_BOT = 166
const SEAFLOOR = 196
const AXIS = 262

export function SeafloorSpreadingAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const lastRef = useRef<number | null>(null)
  const tauRef = useRef(START_MA) // model time, Ma before present

  const [rate, setRate] = useState(4) // half-spreading rate, cm/yr
  const [probe, setProbe] = useState(180) // probe distance from the axis, km
  const [running, setRunning] = useState(false)
  const [tau, setTau] = useState(START_MA)

  const rateRef = useRef(rate)
  const probeRef = useRef(probe)
  useEffect(() => {
    rateRef.current = rate
  }, [rate])
  useEffect(() => {
    probeRef.current = probe
  }, [probe])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const t = tauRef.current
    const kmPerMyr = rateRef.current * 10 // 1 cm/yr === 10 km/Myr, exactly
    const dOf = (s: number) => (s - t) * kmPerMyr // km from the axis
    const now = chronAt(t)

    ctx.clearRect(0, 0, W, H)

    // faint grid
    ctx.strokeStyle = 'rgba(255,245,235,0.035)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }

    // ---- polarity sampled per pixel (used for both barcode and profile) ----
    const pol = new Float32Array(W)
    for (const c of CHRONS) {
      const s0 = Math.max(c.t0, t)
      if (c.t1 <= s0) continue
      const d0 = dOf(s0)
      const d1 = Math.min(dOf(c.t1), MAX_KM)
      if (d1 <= d0) continue
      const p0 = d0 * PX_PER_KM
      const p1 = d1 * PX_PER_KM
      for (let px = Math.floor(p0); px < p1; px++) {
        const v = c.n ? 1 : -1
        if (RIDGE + px < W) pol[RIDGE + px] = v
        if (RIDGE - px - 1 >= 0) pol[RIDGE - px - 1] = v
      }
    }

    // ---- barcode of stripes ----
    for (let x = 0; x < W; x++) {
      if (pol[x] === 0) continue
      ctx.fillStyle = pol[x] > 0 ? 'rgba(34,211,238,0.85)' : 'rgba(167,139,250,0.35)'
      ctx.fillRect(x, STRIPE_TOP, 1, STRIPE_BOT - STRIPE_TOP)
    }
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, STRIPE_TOP + 0.5, W - 1, STRIPE_BOT - STRIPE_TOP - 1)

    // tiny compass arrows inside the wider stripes
    ctx.font = '8px monospace'
    for (const c of CHRONS) {
      const s0 = Math.max(c.t0, t)
      if (c.t1 <= s0) continue
      const p0 = dOf(s0) * PX_PER_KM
      const p1 = Math.min(dOf(c.t1), MAX_KM) * PX_PER_KM
      if (p1 - p0 < 13) continue
      const mid = (p0 + p1) / 2
      ctx.fillStyle = c.n ? 'rgba(15,13,10,0.85)' : 'rgba(245,240,232,0.55)'
      for (const s of [1, -1]) {
        ctx.fillText(c.n ? '↑' : '↓', RIDGE + s * mid - 2, STRIPE_BOT - 15)
      }
    }

    // ---- magnetometer anomaly profile (smoothed, as a towed magnetometer sees it) ----
    const K = 6
    ctx.beginPath()
    ctx.moveTo(0, PROF_ZERO)
    for (let x = 0; x < W; x++) {
      let s = 0
      let n = 0
      for (let k = -K; k <= K; k++) {
        const i = x + k
        if (i < 0 || i >= W) continue
        s += pol[i]
        n++
      }
      const v = n ? s / n : 0
      ctx.lineTo(x, PROF_ZERO - v * 26)
    }
    ctx.lineTo(W, PROF_ZERO)
    ctx.closePath()
    ctx.fillStyle = 'rgba(96,165,250,0.16)'
    ctx.fill()
    ctx.strokeStyle = BLUE
    ctx.lineWidth = 1.4
    ctx.beginPath()
    for (let x = 0; x < W; x++) {
      let s = 0
      let n = 0
      for (let k = -K; k <= K; k++) {
        const i = x + k
        if (i < 0 || i >= W) continue
        s += pol[i]
        n++
      }
      const v = n ? s / n : 0
      if (x === 0) ctx.moveTo(x, PROF_ZERO - v * 26)
      else ctx.lineTo(x, PROF_ZERO - v * 26)
    }
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.setLineDash([3, 4])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, PROF_ZERO)
    ctx.lineTo(W, PROF_ZERO)
    ctx.stroke()
    ctx.setLineDash([])

    // ---- ridge cross-section ----
    ctx.beginPath()
    ctx.moveTo(0, SEAFLOOR + 16)
    for (let x = 0; x <= W; x += 4) {
      const s = Math.min(1, Math.abs(x - RIDGE) / 300)
      ctx.lineTo(x, SEAFLOOR + 16 * Math.sqrt(s))
    }
    ctx.lineTo(W, AXIS - 8)
    ctx.lineTo(0, AXIS - 8)
    ctx.closePath()
    ctx.fillStyle = 'rgba(34,211,238,0.12)'
    ctx.fill()
    ctx.strokeStyle = `${CYAN}AA`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let x = 0; x <= W; x += 4) {
      const s = Math.min(1, Math.abs(x - RIDGE) / 300)
      ctx.lineTo(x, SEAFLOOR + 16 * Math.sqrt(s))
    }
    ctx.stroke()

    const glow = ctx.createRadialGradient(RIDGE, SEAFLOOR + 14, 2, RIDGE, SEAFLOOR + 14, 34)
    glow.addColorStop(0, 'rgba(245,158,11,0.6)')
    glow.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(RIDGE, SEAFLOOR + 14, 34, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(RIDGE, SEAFLOOR + 12, 16, 6, 0, 0, Math.PI * 2)
    ctx.fillStyle = GOLD
    ctx.fill()

    // spreading arrows
    ctx.strokeStyle = CYAN
    ctx.fillStyle = CYAN
    for (const s of [1, -1]) {
      const x0 = RIDGE + s * 40
      const x1 = RIDGE + s * (40 + 4 * rateRef.current)
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(x0, SEAFLOOR - 12)
      ctx.lineTo(x1, SEAFLOOR - 12)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x1 + s * 6, SEAFLOOR - 12)
      ctx.lineTo(x1, SEAFLOOR - 16)
      ctx.lineTo(x1, SEAFLOOR - 8)
      ctx.closePath()
      ctx.fill()
    }

    // ---- distance axis ----
    ctx.strokeStyle = 'rgba(255,245,235,0.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, AXIS)
    ctx.lineTo(W, AXIS)
    ctx.stroke()
    ctx.font = '8px monospace'
    for (let km = 0; km <= MAX_KM; km += 100) {
      for (const s of [1, -1]) {
        const x = RIDGE + s * km * PX_PER_KM
        if (x < 4 || x > W - 4) continue
        ctx.beginPath()
        ctx.moveTo(x, AXIS)
        ctx.lineTo(x, AXIS + 4)
        ctx.stroke()
        ctx.fillStyle = 'rgba(245,240,232,0.35)'
        ctx.fillText(`${km}`, x - (km ? 9 : 3), AXIS + 14)
        if (km === 0) break
      }
    }
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('km from the ridge axis', 232, AXIS + 26)

    // ---- probe ----
    const px = RIDGE + probeRef.current * PX_PER_KM
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 1.2
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(px, PROF_TOP - 6)
    ctx.lineTo(px, AXIS)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(RIDGE - probeRef.current * PX_PER_KM, STRIPE_TOP)
    ctx.lineTo(RIDGE - probeRef.current * PX_PER_KM, STRIPE_BOT)
    ctx.stroke()
    ctx.setLineDash([])

    // ---- headings ----
    ctx.font = '11px monospace'
    ctx.fillStyle = CYAN
    ctx.fillText('Vine–Matthews: the seafloor as a tape recorder', 12, 18)

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('magnetometer anomaly', 12, PROF_TOP - 4)
    ctx.fillText('polarity recorded in the crust', 12, STRIPE_TOP - 4)

    // present-field indicator
    ctx.fillStyle = now.n ? CYAN : VIOLET
    ctx.font = '9px monospace'
    ctx.fillText(
      `field now: ${now.n ? 'normal ↑' : 'reversed ↓'}  (${now.name})`,
      420,
      18
    )
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText(`${t.toFixed(2)} Ma before present`, 420, 30)
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        tauRef.current = 0
        setTau(0)
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    draw()
  }, [draw, rate, probe])

  useEffect(() => {
    if (!running) {
      lastRef.current = null
      cancelAnimationFrame(rafRef.current)
      return
    }
    const loop = (ts: number) => {
      if (lastRef.current === null) lastRef.current = ts
      const dt = Math.min(64, ts - lastRef.current)
      lastRef.current = ts
      const next = tauRef.current - (dt / 1000) * MA_PER_SEC
      if (next <= 0) {
        tauRef.current = 0
        setTau(0)
        setRunning(false)
        draw()
        return
      }
      tauRef.current = next
      setTau(next)
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    lastRef.current = null
    tauRef.current = START_MA
    setTau(START_MA)
    setRate(4)
    rateRef.current = 4
    setProbe(180)
    probeRef.current = 180
    draw()
  }

  const kmPerMyr = rate * 10
  const age = probe / kmPerMyr // Myr since that crust left the axis
  const formed = tau + age
  const readable = formed <= 6.033
  const chron = chronAt(formed)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Magnetic stripes and the age of the seafloor
        </span>
        <button
          onClick={resetAll}
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
          style={{ background: '#0F0D0A' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (tauRef.current <= 0) {
              tauRef.current = START_MA
              setTau(START_MA)
            }
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Play
            </>
          )}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Half-rate:</span>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={rate}
            onChange={e => setRate(+e.target.value)}
            className="w-28 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">{rate} cm/yr</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Probe:</span>
          <input
            type="range"
            min={0}
            max={Math.round(MAX_KM)}
            step={5}
            value={probe}
            onChange={e => setProbe(+e.target.value)}
            className="w-32 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">{probe} km</span>
        </div>
      </div>
      <div className="animation-controls flex-wrap gap-3 text-xs text-text-muted">
        <span>
          model clock: <strong className="font-mono text-text-secondary">{tau.toFixed(2)} Ma</strong> before
          present
        </span>
        <span className="ml-auto">
          crust {probe} km out is{' '}
          <strong className="font-mono" style={{ color: GOLD }}>
            {age.toFixed(2)} Myr
          </strong>{' '}
          old ·{' '}
          {readable ? (
            <>
              formed in the{' '}
              <strong style={{ color: chron.n ? CYAN : VIOLET }}>
                {chron.name} {chron.n ? '(normal)' : '(reversed)'}
              </strong>
            </>
          ) : (
            <span>older than this 6 Myr window</span>
          )}
        </span>
      </div>
    </div>
  )
}
