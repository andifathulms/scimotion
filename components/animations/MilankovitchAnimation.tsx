'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 380

const PLOT_L = 52
const PLOT_R = W - 14

// Three stacked component strips, then the composite panel beneath them.
const STRIP_H = 52
const STRIP_GAP = 10
const S1_T = 26                                   // eccentricity
const S2_T = S1_T + STRIP_H + STRIP_GAP           // obliquity
const S3_T = S2_T + STRIP_H + STRIP_GAP           // precession index
const COMP_T = S3_T + STRIP_H + 30                // composite insolation
const COMP_B = H - 26

// Time axis: thousands of years before present (kyr BP), oldest on the left.
const T_OLD = 800
const T_NOW = 0

const C_ACCENT = '#22D3EE' // cyan   — composite 65°N insolation
const C_GOLD = '#F59E0B'   // gold   — eccentricity
const C_BLUE = '#60A5FA'   // blue   — obliquity
const C_VIOLET = '#A78BFA' // violet — precession
const C_GREEN = '#10B981'  // green  — envelope / present-day marker

// ---------------------------------------------------------------------------
// Orbital elements. These reproduce the real periods, ranges and present-day
// phases; they are not an integration of a full orbital solution.
// ---------------------------------------------------------------------------

const E_MEAN = 0.028

// Eccentricity: 405 kyr term plus the ~95/124 kyr pair, range ≈ 0.003–0.058.
function ecc(t: number): number {
  return (
    E_MEAN +
    0.0118 * Math.cos((2 * Math.PI * (t - 60)) / 405) +
    0.0095 * Math.cos((2 * Math.PI * (t - 22)) / 95) +
    0.0082 * Math.cos((2 * Math.PI * (t - 48)) / 124)
  )
}

// Obliquity: 41 kyr, 22.1°–24.5°, maximum ~9 kyr BP so today reads ≈ 23.5°.
function obliq(t: number): number {
  return 23.3 + 1.15 * Math.cos((2 * Math.PI * (t - 9)) / 41)
}

// Climatic precession index e·sin(ϖ). Two terms give the 23/19 kyr split.
// Today perihelion falls in northern winter, so the index is near a maximum
// and northern summers are correspondingly weak.
function precPhase(t: number): number {
  return 0.62 * Math.cos((2 * Math.PI * t) / 23.7) + 0.38 * Math.cos((2 * Math.PI * t) / 19.1)
}

function precIndex(t: number, eccOn: boolean): number {
  return (eccOn ? ecc(t) : E_MEAN) * precPhase(t)
}

// Sensitivities of 65°N midsummer daily-mean insolation, in W m^-2.
const Q_BASE = 495
const K_OBLIQ = 17    // per degree of obliquity
const K_PREC = 1150   // per unit of e·sin(ϖ)

function insolation(t: number, oblOn: boolean, precOn: boolean, eccOn: boolean): number {
  const o = oblOn ? K_OBLIQ * (obliq(t) - 23.3) : 0
  const p = precOn ? -K_PREC * precIndex(t, eccOn) : 0
  return Q_BASE + o + p
}

const KYR_PER_FRAME = 2.2

export function MilankovitchAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setCursor(T_NOW); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [cursor, setCursor] = useState(T_OLD)
  const [eccOn, setEccOn] = useState(true)
  const [oblOn, setOblOn] = useState(true)
  const [precOn, setPrecOn] = useState(true)

  const xFor = useCallback(
    (t: number) => PLOT_L + ((T_OLD - t) / (T_OLD - T_NOW)) * (PLOT_R - PLOT_L),
    []
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'
    ctx.lineJoin = 'round'

    const axis = 'rgba(255,245,235,0.15)'
    const label = 'rgba(245,240,232,0.42)'

    // ---- shared time gridlines ----
    ctx.strokeStyle = 'rgba(245,240,232,0.06)'
    ctx.lineWidth = 1
    for (let t = 800; t >= 0; t -= 100) {
      ctx.beginPath()
      ctx.moveTo(xFor(t), S1_T)
      ctx.lineTo(xFor(t), COMP_B)
      ctx.stroke()
    }

    // ---- helper: one component strip ----
    const strip = (
      top: number,
      title: string,
      colour: string,
      lo: number,
      hi: number,
      f: (t: number) => number,
      active: boolean,
      readFmt: (v: number) => string
    ) => {
      const bot = top + STRIP_H
      const y = (v: number) => bot - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * STRIP_H

      ctx.strokeStyle = axis
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PLOT_L, top)
      ctx.lineTo(PLOT_L, bot)
      ctx.lineTo(PLOT_R, bot)
      ctx.stroke()

      ctx.textAlign = 'left'
      ctx.fillStyle = active ? colour : 'rgba(245,240,232,0.25)'
      ctx.fillText(title, PLOT_L + 2, top - 4)

      ctx.textAlign = 'right'
      ctx.fillStyle = label
      ctx.fillText(readFmt(hi), PLOT_L - 5, top + 7)
      ctx.fillText(readFmt(lo), PLOT_L - 5, bot + 3)
      ctx.textAlign = 'left'

      ctx.beginPath()
      ctx.strokeStyle = active ? colour : 'rgba(245,240,232,0.18)'
      ctx.lineWidth = active ? 1.8 : 1
      let started = false
      for (let t = T_OLD; t >= cursor; t -= 1.5) {
        const px = xFor(t)
        const py = y(f(t))
        if (!started) { ctx.moveTo(px, py); started = true } else ctx.lineTo(px, py)
      }
      ctx.stroke()

      if (cursor > T_NOW) {
        ctx.beginPath()
        ctx.arc(xFor(cursor), y(f(cursor)), 3, 0, Math.PI * 2)
        ctx.fillStyle = active ? colour : 'rgba(245,240,232,0.3)'
        ctx.fill()
      }
    }

    strip(S1_T, 'eccentricity  e  ·  ~100 & 405 kyr', C_GOLD, 0, 0.06,
      t => (eccOn ? ecc(t) : E_MEAN), eccOn, v => v.toFixed(2))

    strip(S2_T, 'obliquity  ε  ·  41 kyr', C_BLUE, 22, 24.6,
      t => (oblOn ? obliq(t) : 23.3), oblOn, v => `${v.toFixed(1)}°`)

    strip(S3_T, 'precession index  e·sin ϖ  ·  19 & 23 kyr', C_VIOLET, -0.06, 0.06,
      t => (precOn ? precIndex(t, eccOn) : 0), precOn, v => v.toFixed(2))

    // Envelope on the precession strip: ±e, the amplitude eccentricity permits.
    if (precOn) {
      const bot = S3_T + STRIP_H
      const y = (v: number) => bot - ((Math.max(-0.06, Math.min(0.06, v)) + 0.06) / 0.12) * STRIP_H
      ctx.strokeStyle = `${C_GREEN}70`
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      for (const sign of [1, -1]) {
        ctx.beginPath()
        let started = false
        for (let t = T_OLD; t >= T_NOW; t -= 3) {
          const px = xFor(t)
          const py = y(sign * (eccOn ? ecc(t) : E_MEAN))
          if (!started) { ctx.moveTo(px, py); started = true } else ctx.lineTo(px, py)
        }
        ctx.stroke()
      }
      ctx.setLineDash([])
      ctx.fillStyle = `${C_GREEN}CC`
      ctx.textAlign = 'right'
      ctx.fillText('envelope = ±e', PLOT_R - 2, S3_T + 10)
      ctx.textAlign = 'left'
    }

    // ---- composite panel ----
    const Q_LO = 370
    const Q_HI = 570
    const qy = (v: number) =>
      COMP_B - ((Math.max(Q_LO, Math.min(Q_HI, v)) - Q_LO) / (Q_HI - Q_LO)) * (COMP_B - COMP_T)

    ctx.strokeStyle = axis
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PLOT_L, COMP_T)
    ctx.lineTo(PLOT_L, COMP_B)
    ctx.lineTo(PLOT_R, COMP_B)
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.fillStyle = C_ACCENT
    ctx.fillText('composite  ·  65°N midsummer insolation (W m⁻²)', PLOT_L + 2, COMP_T - 6)

    ctx.textAlign = 'right'
    ctx.fillStyle = label
    for (const v of [400, 450, 500, 550]) {
      ctx.fillText(`${v}`, PLOT_L - 5, qy(v) + 3)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.06)'
      ctx.moveTo(PLOT_L, qy(v))
      ctx.lineTo(PLOT_R, qy(v))
      ctx.stroke()
    }
    ctx.textAlign = 'left'

    ctx.beginPath()
    ctx.strokeStyle = C_ACCENT
    ctx.lineWidth = 2
    let started = false
    for (let t = T_OLD; t >= cursor; t -= 0.8) {
      const px = xFor(t)
      const py = qy(insolation(t, oblOn, precOn, eccOn))
      if (!started) { ctx.moveTo(px, py); started = true } else ctx.lineTo(px, py)
    }
    ctx.stroke()

    if (cursor > T_NOW) {
      ctx.beginPath()
      ctx.arc(xFor(cursor), qy(insolation(cursor, oblOn, precOn, eccOn)), 3.5, 0, Math.PI * 2)
      ctx.fillStyle = C_ACCENT
      ctx.fill()
    }

    // Present-day reference tick on the composite.
    const qNow = insolation(0, oblOn, precOn, eccOn)
    ctx.strokeStyle = `${C_GREEN}55`
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.moveTo(PLOT_L, qy(qNow))
    ctx.lineTo(PLOT_R, qy(qNow))
    ctx.stroke()
    ctx.setLineDash([])

    // ---- time axis labels ----
    ctx.textAlign = 'center'
    ctx.fillStyle = label
    for (let t = 800; t >= 0; t -= 100) {
      ctx.fillText(t === 0 ? 'now' : `${t}`, xFor(t), COMP_B + 14)
    }
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('kyr before present', PLOT_L + 2, H - 4)

    // ---- moving cursor line ----
    if (cursor > T_NOW) {
      ctx.strokeStyle = 'rgba(245,240,232,0.28)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(xFor(cursor), S1_T)
      ctx.lineTo(xFor(cursor), COMP_B)
      ctx.stroke()
    }
  }, [cursor, eccOn, oblOn, precOn, xFor])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(rafRef.current); return }
    const loop = () => {
      setCursor(prev => {
        const next = prev - KYR_PER_FRAME
        if (next <= T_NOW) { setRunning(false); return T_NOW }
        return next
      })
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setCursor(T_OLD)
    setEccOn(true)
    setOblOn(true)
    setPrecOn(true)
  }

  const toggle = (on: boolean, colour: string, text: string, fn: () => void) => (
    <button
      onClick={fn}
      className="px-2 py-1 rounded text-xs font-medium border transition-colors"
      style={{
        color: on ? colour : 'rgba(245,240,232,0.35)',
        borderColor: on ? `${colour}55` : 'rgba(245,240,232,0.15)',
        background: on ? `${colour}14` : 'transparent',
      }}
    >
      {text}
    </button>
  )

  const at = Math.max(T_NOW, cursor)
  const q = insolation(at, oblOn, precOn, eccOn)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Three orbital cycles summing to one insolation curve</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { if (cursor <= T_NOW) setCursor(T_OLD); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-1.5">
          {toggle(eccOn, C_GOLD, 'eccentricity', () => setEccOn(v => !v))}
          {toggle(oblOn, C_BLUE, 'obliquity', () => setOblOn(v => !v))}
          {toggle(precOn, C_VIOLET, 'precession', () => setPrecOn(v => !v))}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Scrub:</span>
          <input
            type="range" min={T_NOW} max={T_OLD} step={1}
            value={T_OLD - cursor}
            onChange={e => { setRunning(false); setCursor(T_OLD - +e.target.value) }}
            className="w-28 accent-accent-blue"
          />
        </div>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          {at === 0 ? 'now' : `${at.toFixed(0)} kyr BP`} · e={ecc(at).toFixed(3)} · ε={obliq(at).toFixed(1)}° · Q={q.toFixed(0)} W m⁻²
        </span>
      </div>
    </div>
  )
}
