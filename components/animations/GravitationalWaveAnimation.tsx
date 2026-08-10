'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

// Left panel: the inspiralling binary. Right panel: a ring of freely-floating
// test masses that the passing wave stretches and squeezes (the "plus" polarization).
// Bottom strip: the strain waveform h(t) scrolling right, building into the chirp.
const BX = 152 // binary centre
const BY = 108
const RX = 452 // test-mass ring centre
const RY = 108
const RR = 60 // undeformed ring radius (px)

const WX0 = 40 // waveform strip
const WX1 = 560
const WBASE = 292
const WAMP = 54

const HISTORY_MAX = 262
const DX_HIST = (WX1 - WX0) / HISTORY_MAX

// Inspiral: the orbit decays, so the separation shrinks, the orbital frequency
// climbs (Kepler: ω ∝ a^-3/2), and the strain amplitude rises — the chirp.
const T_INSPIRAL = 7.0 // seconds of on-screen inspiral before merger
const T_RING = 1.4 // ringdown hold before the loop restarts
const SEP_MAX = 50
const SEP_MIN = 13
const OMEGA0 = 1.3
const omegaOf = (sep: number) => OMEGA0 * Math.pow(SEP_MAX / sep, 1.5)
// GW frequency is twice the orbital frequency; ringdown rings near the merger rate.
const RING_OMEGA = 2 * omegaOf(SEP_MIN)

const ACCENT = '#818CF8' // indigo
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const CYAN = '#22D3EE'

const sepOf = (p: number) => SEP_MIN + (SEP_MAX - SEP_MIN) * Math.pow(1 - p, 0.7)

export function GravitationalWaveAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number | null>(null)

  const stageRef = useRef<'inspiral' | 'ring'>('inspiral')
  const clockRef = useRef(0) // seconds inside the current stage
  const phaseRef = useRef(0) // accumulated orbital phase
  const historyRef = useRef<number[]>([])

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1 inspiral, held at 1 during ring
  const [freqRel, setFreqRel] = useState(1) // GW frequency relative to the start

  const push = (v: number) => {
    const h = historyRef.current
    h.push(v)
    if (h.length > HISTORY_MAX) h.shift()
  }

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    const inspiral = stageRef.current === 'inspiral'
    const p = inspiral ? Math.min(clockRef.current / T_INSPIRAL, 1) : 1
    const rt = inspiral ? 0 : clockRef.current
    const ph = phaseRef.current

    // Strain fraction that deforms the test-mass ring (exaggerated so it reads).
    const s = inspiral
      ? (0.05 + 0.3 * p) * Math.cos(2 * ph)
      : 0.34 * Math.exp(-rt * 3.2) * Math.cos(RING_OMEGA * rt)

    // ---- radiating ripples from the binary ----
    const frac = (ph / Math.PI) % 1 // one crest per GW cycle
    for (let k = 0; k < 5; k++) {
      const r = ((k + frac) / 5) * 132
      const op = 0.28 * (1 - r / 140)
      if (op <= 0) continue
      ctx.strokeStyle = `rgba(129,140,248,${op.toFixed(3)})`
      ctx.lineWidth = 1.25
      ctx.beginPath(); ctx.arc(BX, BY, r + 10, 0, Math.PI * 2); ctx.stroke()
    }

    // ---- the binary (or the merged remnant) ----
    if (inspiral) {
      const sep = sepOf(p)
      const m1x = BX + sep * Math.cos(ph)
      const m1y = BY + sep * Math.sin(ph)
      const m2x = BX - sep * Math.cos(ph)
      const m2y = BY - sep * Math.sin(ph)
      // faint orbit guide
      ctx.strokeStyle = 'rgba(255,245,235,0.10)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(BX, BY, sep, 0, Math.PI * 2); ctx.stroke()
      const drawMass = (x: number, y: number, col: string) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, 16)
        g.addColorStop(0, col)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#000'
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = col; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke()
      }
      drawMass(m1x, m1y, GOLD)
      drawMass(m2x, m2y, BLUE)
    } else {
      // merger flash + single remnant
      const flash = Math.exp(-rt * 4)
      const g = ctx.createRadialGradient(BX, BY, 0, BX, BY, 40)
      g.addColorStop(0, `rgba(167,139,250,${(0.6 * flash).toFixed(3)})`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(BX, BY, 40, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#000'
      ctx.beginPath(); ctx.arc(BX, BY, 14, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = VIOLET; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(BX, BY, 14, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = VIOLET
      ctx.textAlign = 'center'
      ctx.fillText('merged — ringdown', BX, BY + 40)
      ctx.textAlign = 'left'
    }
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('inspiralling binary', BX - 46, 22)

    // ---- the ring of test masses (plus polarization) ----
    // Undeformed reference ring.
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.setLineDash([3, 4])
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(RX, RY, RR, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])

    // Deformed ring outline: x scales by (1+s), y by (1−s).
    ctx.strokeStyle = `${ACCENT}66`
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let a = 0; a <= 64; a++) {
      const th = (a / 64) * Math.PI * 2
      const px = RX + RR * Math.cos(th) * (1 + s)
      const py = RY + RR * Math.sin(th) * (1 - s)
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()

    for (let k = 0; k < 12; k++) {
      const th = (k / 12) * Math.PI * 2
      const px = RX + RR * Math.cos(th) * (1 + s)
      const py = RY + RR * Math.sin(th) * (1 - s)
      ctx.fillStyle = k === 0 || k === 6 ? GOLD : CYAN
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.textAlign = 'center'
    ctx.fillText('free test masses', RX, 22)
    ctx.fillStyle = s >= 0 ? GOLD : ACCENT
    ctx.fillText(s >= 0 ? '↔ stretched horizontally' : '↕ stretched vertically', RX, RY + RR + 22)
    ctx.textAlign = 'left'

    // ---- the strain waveform h(t) ----
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(WX0, WBASE); ctx.lineTo(WX1, WBASE); ctx.stroke()

    const hist = historyRef.current
    ctx.strokeStyle = ACCENT
    ctx.lineWidth = 2
    ctx.beginPath()
    hist.forEach((v, i) => {
      const x = WX0 + i * DX_HIST
      const y = WBASE - v * WAMP
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.stroke()
    // leading dot
    if (hist.length) {
      const x = WX0 + (hist.length - 1) * DX_HIST
      const y = WBASE - hist[hist.length - 1] * WAMP
      ctx.fillStyle = PINK
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('strain h(t) — amplitude and frequency both rise into the merger: the chirp', WX0, WBASE + 30)

    // readouts
    const omega = inspiral ? omegaOf(sepOf(p)) : RING_OMEGA
    setProgress(p)
    setFreqRel(omega / OMEGA0)
  }, [])

  const advance = useCallback((dt: number) => {
    if (stageRef.current === 'inspiral') {
      clockRef.current += dt
      const p = Math.min(clockRef.current / T_INSPIRAL, 1)
      const omega = omegaOf(sepOf(p))
      phaseRef.current += omega * dt
      push((0.12 + 0.9 * p) * Math.sin(2 * phaseRef.current))
      if (p >= 1) { stageRef.current = 'ring'; clockRef.current = 0 }
    } else {
      clockRef.current += dt
      const rt = clockRef.current
      push(Math.exp(-rt * 3.2) * Math.sin(RING_OMEGA * rt))
      if (rt > T_RING) {
        stageRef.current = 'inspiral'
        clockRef.current = 0
        phaseRef.current = 0
        historyRef.current = []
      }
    }
  }, [])

  useEffect(() => { render() }, [render])

  useEffect(() => {
    if (!running) { lastRef.current = null; cancelAnimationFrame(rafRef.current); return }
    const loop = (now: number) => {
      if (lastRef.current === null) lastRef.current = now
      const dt = Math.min(48, now - lastRef.current) / 1000
      lastRef.current = now
      advance(dt)
      render()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, advance, render])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Seed a representative mid-chirp still frame without animating.
        stageRef.current = 'inspiral'
        clockRef.current = T_INSPIRAL * 0.62
        phaseRef.current = 0
        historyRef.current = []
        let phi = 0
        for (let i = 0; i < HISTORY_MAX; i++) {
          const pp = (i / HISTORY_MAX) * 0.62
          phi += omegaOf(sepOf(pp)) * 0.045
          historyRef.current.push((0.12 + 0.9 * pp) * Math.sin(2 * phi))
        }
        phaseRef.current = phi
        render()
        return
      }
      setRunning(true)
    },
  })

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    stageRef.current = 'inspiral'
    clockRef.current = 0
    phaseRef.current = 0
    historyRef.current = []
    lastRef.current = null
    render()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The inspiral chirp stretches space</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: ACCENT, color: '#0F0D0A' }}
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play the inspiral</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>inspiral:</span>
          <div className="w-32 h-1.5 rounded bg-white/10 overflow-hidden">
            <div className="h-full" style={{ width: `${Math.round(progress * 100)}%`, background: GOLD }} />
          </div>
          <span className="font-mono text-text-secondary">{Math.round(progress * 100)}%</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          GW frequency <strong className="font-mono" style={{ color: ACCENT }}>×{freqRel.toFixed(1)}</strong> the starting value
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Two compact masses spiral inward, radiating gravitational waves. Watch the ring of free test masses on the right:
        as each wave passes it stretches horizontally, then vertically — it never gets pushed sideways, only rhythmically
        <strong> squeezed and stretched</strong>. As the orbit decays the wave gets both louder (bigger amplitude) and
        higher-pitched (rising frequency) — the chirp — until the black holes merge and the signal rings down.
      </p>
    </div>
  )
}
