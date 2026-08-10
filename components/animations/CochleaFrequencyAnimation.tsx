'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

// Colours: pink is Medicine's accent and the primary series.
const PINK = '#F472B6'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const INK = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(255,245,235,0.10)'

// The uncoiled basilar membrane spans MX0 (base, left) to MX1 (apex, right).
// Position maps to frequency logarithmically across the audible range: the base
// is stiff and narrow (high frequency), the apex is floppy and wide (low).
const MX0 = 48
const MX1 = 560
const MID = 118 // vertical centre of the membrane
const FHI = 20000
const FLO = 20

// A tone's characteristic place: pos in [0,1] from base to apex.
const placeOfFreq = (f: number) => Math.log10(FHI / f) / Math.log10(FHI / FLO)
const posToPx = (pos: number) => MX0 + pos * (MX1 - MX0)
const pxToPos = (px: number) => (px - MX0) / (MX1 - MX0)

// Membrane half-width: narrow/stiff at the base, wide/floppy at the apex.
const halfWidth = (pos: number) => 5 + pos * 17

// The travelling-wave envelope for a tone peaking at characteristic place p0.
// Basal side (pos < p0) builds gradually; apical side (pos > p0) collapses
// sharply — the asymmetric shape von Bekesy observed.
function bump(pos: number, p0: number) {
  const d = pos - p0
  if (d <= 0) return Math.exp(-((d / 0.26) ** 2))
  return Math.exp(-((d / 0.055) ** 2))
}

// Phase accumulates faster toward the peak, so the ripples bunch up there.
const phaseAt = (pos: number) => 2 * Math.PI * (5 * pos + 9 * pos * pos)

type Tone = { freq: number; amp: number; color: string }
type Mode = 'pure' | 'chord' | 'harmonics'

function buildTones(mode: Mode, pureFreq: number, nHarm: number): Tone[] {
  if (mode === 'pure') return [{ freq: pureFreq, amp: 1, color: PINK }]
  if (mode === 'chord') {
    // A major triad around the middle of the keyboard: root, major third, fifth.
    return [
      { freq: 262, amp: 1, color: PINK },
      { freq: 330, amp: 0.85, color: BLUE },
      { freq: 392, amp: 0.85, color: GREEN },
    ]
  }
  // A single note (220 Hz) plus its integer-multiple overtones, fading with n.
  const colors = [PINK, GOLD, BLUE, VIOLET, GREEN]
  return Array.from({ length: nHarm }, (_, i) => {
    const n = i + 1
    return { freq: 220 * n, amp: 1 / n, color: colors[i % colors.length] }
  }).filter((t) => t.freq <= FHI)
}

export function CochleaFrequencyAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const timeRef = useRef(0)

  const [running, setRunning] = useState(false)
  const [mode, setMode] = useState<Mode>('pure')
  const [pureFreq, setPureFreq] = useState(2000)
  const [nHarm, setNHarm] = useState(4)

  const paramsRef = useRef({ mode, pureFreq, nHarm })
  useEffect(() => {
    paramsRef.current = { mode, pureFreq, nHarm }
  }, [mode, pureFreq, nHarm])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: (reduced) => {
      if (!reduced) setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const p = paramsRef.current
    const tones = buildTones(p.mode, p.pureFreq, p.nHarm)
    const t = timeRef.current

    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'

    // ---- frequency axis labels along the base ----------------------------
    const ticks = [20, 100, 500, 2000, 8000, 20000]
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    for (const f of ticks) {
      const x = posToPx(placeOfFreq(f))
      ctx.beginPath()
      ctx.moveTo(x, 214)
      ctx.lineTo(x, 222)
      ctx.stroke()
      ctx.fillStyle = INK
      const label = f >= 1000 ? `${f / 1000}k` : `${f}`
      ctx.fillText(label, x - 8, 234)
    }
    ctx.fillStyle = INK
    ctx.fillText('base · stiff · HIGH freq', MX0, 250)
    ctx.textAlign = 'right'
    ctx.fillText('LOW freq · floppy · apex', MX1, 250)
    ctx.textAlign = 'left'

    // ---- membrane outline (tapering strip) -------------------------------
    ctx.beginPath()
    for (let px = MX0; px <= MX1; px += 4) {
      const y = MID - halfWidth(pxToPos(px))
      if (px === MX0) ctx.moveTo(px, y)
      else ctx.lineTo(px, y)
    }
    for (let px = MX1; px >= MX0; px -= 4) {
      const y = MID + halfWidth(pxToPos(px))
      ctx.lineTo(px, y)
    }
    ctx.closePath()
    ctx.strokeStyle = 'rgba(245,240,232,0.18)'
    ctx.lineWidth = 1
    ctx.stroke()

    // ---- total envelope at each position ---------------------------------
    const N = MX1 - MX0
    const env = new Float64Array(N + 1)
    for (let i = 0; i <= N; i++) {
      const pos = i / N
      let e = 0
      for (const tone of tones) e += tone.amp * bump(pos, placeOfFreq(tone.freq))
      env[i] = e
    }

    // Fill the envelope as a faint pink region — the standing extent of motion.
    ctx.beginPath()
    ctx.moveTo(MX0, MID)
    for (let i = 0; i <= N; i++) {
      const px = MX0 + i
      ctx.lineTo(px, MID - env[i] * 62)
    }
    for (let i = N; i >= 0; i--) {
      const px = MX0 + i
      ctx.lineTo(px, MID + env[i] * 62)
    }
    ctx.closePath()
    ctx.fillStyle = `${PINK}1F`
    ctx.fill()

    // The instantaneous travelling wave rippling inside that envelope.
    ctx.beginPath()
    for (let i = 0; i <= N; i++) {
      const px = MX0 + i
      const pos = i / N
      const disp = env[i] * Math.sin(phaseAt(pos) - t * 6) * 60
      const y = MID - disp
      if (i === 0) ctx.moveTo(px, y)
      else ctx.lineTo(px, y)
    }
    ctx.strokeStyle = PINK
    ctx.lineWidth = 2
    ctx.stroke()

    // Mirror line for the lower edge of the ripple.
    ctx.beginPath()
    for (let i = 0; i <= N; i++) {
      const px = MX0 + i
      const pos = i / N
      const disp = env[i] * Math.sin(phaseAt(pos) - t * 6) * 60
      const y = MID + disp
      if (i === 0) ctx.moveTo(px, y)
      else ctx.lineTo(px, y)
    }
    ctx.strokeStyle = `${PINK}55`
    ctx.lineWidth = 1
    ctx.stroke()

    // ---- peak markers: where each frequency lands ------------------------
    for (const tone of tones) {
      const p0 = placeOfFreq(tone.freq)
      const x = posToPx(p0)
      const peak = tone.amp * 62
      ctx.setLineDash([2, 3])
      ctx.strokeStyle = `${tone.color}66`
      ctx.beginPath()
      ctx.moveTo(x, MID - peak - 4)
      ctx.lineTo(x, 214)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(x, MID - peak, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = tone.color
      ctx.fill()
      ctx.fillStyle = tone.color
      ctx.textAlign = 'center'
      const label = tone.freq >= 1000 ? `${Math.round(tone.freq / 10) / 100}k` : `${Math.round(tone.freq)}`
      ctx.fillText(`${label}Hz`, x, MID - peak - 8)
      ctx.textAlign = 'left'
    }

    // ---- header captions -------------------------------------------------
    ctx.fillStyle = INK
    ctx.fillText('basilar membrane — uncoiled', MX0, 22)
    ctx.textAlign = 'right'
    ctx.fillStyle = tones.length > 1 ? GOLD : PINK
    ctx.fillText(
      tones.length > 1
        ? `${tones.length} frequencies → ${tones.length} places · a mechanical Fourier transform`
        : 'one frequency → one place',
      MX1,
      22
    )
    ctx.textAlign = 'left'
  }, [])

  const loop = useCallback(() => {
    timeRef.current += 0.03
    draw()
    animRef.current = requestAnimationFrame(loop)
  }, [draw])

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(animRef.current)
      return
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running, loop])

  // Redraw immediately when parameters change while paused.
  useEffect(() => {
    draw()
  }, [mode, pureFreq, nHarm, draw])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setMode('pure')
    setPureFreq(2000)
    setNHarm(4)
    timeRef.current = 0
    draw()
  }

  const activePlace = placeOfFreq(pureFreq)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Cochlea as a Frequency Analyzer
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Cochlea as a Frequency Analyzer. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning((r) => !r)}
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
        <div className="flex items-center gap-1.5">
          {(['pure', 'chord', 'harmonics'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                mode === m ? 'bg-accent-gold text-bg-base' : 'bg-white/5 text-text-muted hover:text-text-secondary'
              }`}
            >
              {m === 'pure' ? 'Pure tone' : m === 'chord' ? 'Chord' : 'Harmonics'}
            </button>
          ))}
        </div>
        {mode === 'pure' && (
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <span>Frequency:</span>
            <input
              type="range"
              min={Math.log10(50)}
              max={Math.log10(18000)}
              step={0.01}
              value={Math.log10(pureFreq)}
              onChange={(e) => setPureFreq(Math.round(Math.pow(10, +e.target.value)))}
              className="w-32 accent-accent-gold"
            />
            <span className="tabular-nums" style={{ color: PINK }}>
              {pureFreq >= 1000 ? `${(pureFreq / 1000).toFixed(2)} kHz` : `${pureFreq} Hz`}
            </span>
          </label>
        )}
        {mode === 'harmonics' && (
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <span>Overtones:</span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={nHarm}
              onChange={(e) => setNHarm(+e.target.value)}
              className="w-24 accent-accent-gold"
            />
            <span className="tabular-nums">{nHarm}</span>
          </label>
        )}
        <span className="ml-auto text-xs text-text-secondary">
          {mode === 'pure' ? (
            <>
              peaks at <strong style={{ color: PINK }}>{Math.round(activePlace * 100)}%</strong> toward the apex
            </>
          ) : (
            <>
              spread out by <strong className="text-accent-gold">location</strong>
            </>
          )}
        </span>
      </div>
    </div>
  )
}
