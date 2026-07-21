'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const LIME = '#A3E635'   // pale morph  — allele A
const VIOLET = '#A78BFA' // dark morph  — allele a
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'

const MAX_GENS = 160
const SLOTS = 60          // organisms actually drawn (a sample of the population)
const FRAMES_PER_GEN = 3

// Organism panel
const OX = 14
const OY = 28
const OW = W - 28
const OH = 104

// Environment strip + frequency plot
const PX = 44
const PW = 488
const SY = 138
const SH = 10
const PY = 170
const PH = 92

// Deterministic jitter/permutation so the layout never jumps between renders.
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

type Slot = { x: number; y: number; wobble: number }

const SLOTS_XY: Slot[] = Array.from({ length: SLOTS }, (_, i) => {
  const col = i % 15
  const row = Math.floor(i / 15)
  return {
    x: 36 + col * 38 + (hash(i) - 0.5) * 8,
    y: 50 + row * 22 + (hash(i + 41) - 0.5) * 7,
    wobble: hash(i + 907),
  }
})

// Which slots carry the pale allele, in a fixed scrambled order, so that a
// frequency of 0.4 speckles the panel instead of filling it left-to-right.
const FILL_ORDER = Array.from({ length: SLOTS }, (_, i) => i).sort(
  (a, b) => hash(a + 5) - hash(b + 5)
)

// Bark speckles — fixed positions, brightness set by the environment.
const SPECKLES = Array.from({ length: 90 }, (_, i) => ({
  x: OX + hash(i * 3 + 1) * OW,
  y: OY + hash(i * 3 + 2) * OH,
  r: 0.6 + hash(i * 3 + 3) * 1.8,
}))

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

// Bark colour: env = +1 lichen-pale, env = -1 soot-dark.
function barkColor(env: number): string {
  const t = (env + 1) / 2
  const r = Math.round(lerp(17, 47, t))
  const g = Math.round(lerp(15, 45, t))
  const b = Math.round(lerp(13, 30, t))
  return `rgb(${r},${g},${b})`
}

// How conspicuous each morph is against the current bark. A conspicuous moth is
// the one a bird finds; that is the entire selective mechanism in this model.
function conspicuous(env: number, pale: boolean): number {
  const m = pale ? -env : env      // +1 = stands out, -1 = camouflaged
  return (m + 1) / 2
}

function drawMoth(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  vis: number,
  marked: boolean
) {
  ctx.save()
  ctx.globalAlpha = 0.3 + 0.7 * vis
  ctx.fillStyle = `${color}55`
  ctx.strokeStyle = color
  ctx.lineWidth = 1.1
  ctx.beginPath()
  ctx.ellipse(x - 4.6, y, 6.2, 3.6, -0.55, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(x + 4.6, y, 6.2, 3.6, 0.55, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(x, y, 1.8, 5.4, 0, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()

  if (marked) {
    ctx.save()
    ctx.globalAlpha = 0.75
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 1
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.arc(x, y, 11, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }
}

// One Wright–Fisher generation: selection sets the expected frequency, then a
// finite sample of N gametes adds the sampling noise we call drift.
function stepGeneration(p: number, env: number, s: number, N: number): number {
  if (p <= 0) return 0
  if (p >= 1) return 1
  const sEff = s * env               // >0 favours the pale allele
  const wPale = sEff >= 0 ? 1 : 1 + sEff
  const wDark = sEff >= 0 ? 1 - sEff : 1
  const mean = (p * wPale) / (p * wPale + (1 - p) * wDark)
  let k = 0
  for (let i = 0; i < N; i++) if (Math.random() < mean) k++
  return k / N
}

export function NaturalSelectionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const frameRef = useRef(0)
  const histRef = useRef<number[]>([0.15])
  const envHistRef = useRef<number[]>([0.8])

  const [running, setRunning] = useState(false)
  const [tick, setTick] = useState(0)

  const [env, setEnv] = useState(80)   // −100 (sooty) … +100 (lichen-pale)
  const [sel, setSel] = useState(20)   // selection coefficient × 100
  const [popN, setPopN] = useState(200)

  const paramsRef = useRef({ env: 0.8, s: 0.2, N: 200 })
  useEffect(() => {
    paramsRef.current = { env: env / 100, s: sel / 100, N: popN }
  }, [env, sel, popN])

  const envF = env / 100
  const s = sel / 100

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const hist = histRef.current
    const envHist = envHistRef.current
    const p = hist[hist.length - 1]
    const gen = hist.length - 1

    // ---- Bark + population ------------------------------------------------
    ctx.fillStyle = barkColor(envF)
    ctx.fillRect(OX, OY, OW, OH)
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.strokeRect(OX + 0.5, OY + 0.5, OW - 1, OH - 1)

    const speckleAlpha = 0.05 + 0.09 * ((envF + 1) / 2)
    ctx.fillStyle = `rgba(245,240,232,${speckleAlpha.toFixed(3)})`
    for (const sp of SPECKLES) {
      ctx.beginPath()
      ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText(
      envF > 0.15 ? 'lichen-pale bark' : envF < -0.15 ? 'soot-darkened bark' : 'mottled bark — neither morph hides',
      OX,
      22
    )
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText(`generation ${gen}`, W - OX, 22)

    const paleCount = Math.round(p * SLOTS)
    const paleSet = new Set(FILL_ORDER.slice(0, paleCount))
    const visPale = conspicuous(envF, true)
    const visDark = conspicuous(envF, false)
    const drift = running ? Math.sin(tick * 0.05) : 0
    for (let i = 0; i < SLOTS; i++) {
      const slot = SLOTS_XY[i]
      const pale = paleSet.has(i)
      const vis = pale ? visPale : visDark
      const marked = s > 0.02 && vis > 0.78
      drawMoth(
        ctx,
        slot.x + drift * (slot.wobble - 0.5) * 3,
        slot.y + drift * (slot.wobble - 0.5) * 2,
        pale ? LIME : VIOLET,
        vis,
        marked
      )
    }

    // ---- Environment history strip ---------------------------------------
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'right'
    ctx.fillText('env', PX - 8, SY + 8)
    ctx.textAlign = 'left'
    const colW = PW / (MAX_GENS - 1)
    for (let k = 0; k < envHist.length; k++) {
      ctx.fillStyle = barkColor(envHist[k])
      ctx.fillRect(PX + k * colW, SY, Math.max(1.2, colW + 0.6), SH)
    }
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.lineWidth = 1
    ctx.strokeRect(PX + 0.5, SY + 0.5, PW - 1, SH - 1)

    // ---- Frequency plot ---------------------------------------------------
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '10px monospace'
    ctx.fillText('FREQUENCY OF THE PALE ALLELE  p', PX, PY - 8)

    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.beginPath()
    ctx.moveTo(PX + 0.5, PY)
    ctx.lineTo(PX + 0.5, PY + PH)
    ctx.lineTo(PX + PW, PY + PH)
    ctx.stroke()

    ctx.font = '9px monospace'
    for (const [v, lab] of [[0, '0'], [0.5, '0.5'], [1, '1']] as Array<[number, string]>) {
      const y = PY + PH - v * PH
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(245,240,232,0.3)'
      ctx.fillText(lab, PX - 8, y + 3)
      if (v > 0) {
        ctx.strokeStyle = 'rgba(255,245,235,0.06)'
        ctx.beginPath()
        ctx.moveTo(PX, y)
        ctx.lineTo(PX + PW, y)
        ctx.stroke()
      }
    }
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('generations →', PX + PW / 2, PY + PH + 16)

    const xAt = (k: number) => PX + (k / (MAX_GENS - 1)) * PW
    const yAt = (v: number) => PY + PH - v * PH

    if (hist.length > 1) {
      ctx.beginPath()
      ctx.moveTo(xAt(0), yAt(hist[0]))
      for (let k = 1; k < hist.length; k++) ctx.lineTo(xAt(k), yAt(hist[k]))
      ctx.strokeStyle = LIME
      ctx.lineWidth = 1.8
      ctx.stroke()
      ctx.lineTo(xAt(hist.length - 1), yAt(0))
      ctx.lineTo(xAt(0), yAt(0))
      ctx.closePath()
      ctx.fillStyle = `${LIME}1F`
      ctx.fill()
    }

    const hx = xAt(hist.length - 1)
    const hy = yAt(p)
    ctx.beginPath()
    ctx.arc(hx, hy, 3, 0, Math.PI * 2)
    ctx.fillStyle = LIME
    ctx.fill()
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = hx > PX + PW - 60 ? 'right' : 'left'
    ctx.fillStyle = LIME
    ctx.fillText(`p = ${p.toFixed(3)}`, hx > PX + PW - 60 ? hx - 8 : hx + 8, hy - 7)

    // Status line
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    const sEff = s * envF
    if (p >= 1 || p <= 0) {
      ctx.fillStyle = p >= 1 ? LIME : VIOLET
      ctx.fillText(p >= 1 ? 'pale allele FIXED (p = 1)' : 'pale allele LOST (p = 0)', PX, PY + PH + 30)
    } else if (Math.abs(sEff) < 0.005) {
      ctx.fillStyle = BLUE
      ctx.fillText('s ≈ 0 — no selection: every step here is drift', PX, PY + PH + 30)
    } else {
      ctx.fillStyle = GOLD
      ctx.fillText(
        `selection coefficient s = ${Math.abs(sEff).toFixed(3)} against the ${sEff > 0 ? 'dark' : 'pale'} morph`,
        PX,
        PY + PH + 30
      )
    }
  }, [envF, s, running, tick])

  useEffect(() => {
    draw()
  }, [draw, tick])

  useEffect(() => {
    if (!running) return
    const loop = () => {
      frameRef.current += 1
      if (frameRef.current % FRAMES_PER_GEN === 0) {
        const hist = histRef.current
        if (hist.length >= MAX_GENS) {
          setRunning(false)
          return
        }
        const cur = paramsRef.current
        hist.push(stepGeneration(hist[hist.length - 1], cur.env, cur.s, cur.N))
        envHistRef.current.push(cur.env)
      }
      setTick(t => t + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // No motion: compute the sweep in one shot and show the finished run.
        const hist = histRef.current
        const cur = paramsRef.current
        while (hist.length < 90) {
          hist.push(stepGeneration(hist[hist.length - 1], cur.env, cur.s, cur.N))
          envHistRef.current.push(cur.env)
        }
        setTick(t => t + 1)
        return
      }
      setRunning(true)
    },
  })

  const restart = () => {
    histRef.current = [0.15]
    envHistRef.current = [paramsRef.current.env]
    frameRef.current = 0
    setTick(t => t + 1)
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    setEnv(80)
    setSel(20)
    setPopN(200)
    paramsRef.current = { env: 0.8, s: 0.2, N: 200 }
    histRef.current = [0.15]
    envHistRef.current = [0.8]
    frameRef.current = 0
    triggerReset()
    setTick(t => t + 1)
  }

  const done = histRef.current.length >= MAX_GENS

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Selection in a population</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-x-4 gap-y-2">
        <button
          onClick={() => {
            if (done) restart()
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> {done ? 'Run again' : 'Evolve'}</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Bark</span>
          <input type="range" min={-100} max={100} step={1} value={env}
            onChange={e => setEnv(+e.target.value)}
            className="w-28 accent-accent-violet" />
          <span className="font-mono text-text-secondary w-12">{env > 15 ? 'pale' : env < -15 ? 'sooty' : 'mottled'}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Selection s</span>
          <input type="range" min={0} max={50} step={1} value={sel}
            onChange={e => setSel(+e.target.value)}
            className="w-24 accent-accent-gold" />
          <span className="font-mono text-text-secondary w-10">{(sel / 100).toFixed(2)}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Pop N</span>
          <input type="range" min={20} max={600} step={10} value={popN}
            onChange={e => setPopN(+e.target.value)}
            className="w-24 accent-accent-blue" />
          <span className="font-mono text-text-secondary w-8">{popN}</span>
        </label>
        <span className="text-xs" style={{ color: LIME }}>pale</span>
        <span className="text-xs" style={{ color: VIOLET }}>dark</span>
      </div>
    </div>
  )
}
