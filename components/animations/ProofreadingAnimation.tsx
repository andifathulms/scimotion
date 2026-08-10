'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

// --- Fidelity model ------------------------------------------------------
// Errors per base pair, starting from what hydrogen-bonding energetics alone
// would give, then multiplied down by each successive layer.
const RAW = 1e-2
const GAIN = [1e-3, 1e-2, 1e-2]          // selectivity, proofreading, mismatch repair
const GENOME = 3.2e9                      // bp in a haploid human genome

const LAYERS = [
  { key: 'sel', short: 'Base selection', long: 'active-site geometry rejects the wrong nucleotide', color: '#60A5FA', x: 208 },
  { key: 'pro', short: 'Proofreading', long: "3′→5′ exonuclease excises a base just misinserted", color: '#A78BFA', x: 330 },
  { key: 'mmr', short: 'Mismatch repair', long: 'MutS/MSH scans the finished duplex for bulges', color: '#10B981', x: 452 },
] as const

// Demo catch probabilities — vastly lower than the real ones so that escapes are
// actually visible on screen. The numeric readout uses the true rates above.
const CATCH = [0.7, 0.9, 0.97]

const C_ERR = '#F472B6'
const C_OK = 'rgba(245,240,232,0.30)'
const DIM = 'rgba(245,240,232,0.42)'

const LANE = 196            // y of the nucleotide stream
const SPAWN = 24            // frames between nucleotides
const SPEED = 1.9           // px per frame
const N_PARTICLES = 46
const START_X = 40
const EXIT_X = 566

// Deterministic pseudo-random in [0,1) so toggling a layer never reshuffles the run.
function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}

const IS_ERROR = Array.from({ length: N_PARTICLES }, (_, i) => hash(i) < 0.26)
const ROLL = Array.from({ length: N_PARTICLES }, (_, i) => hash(i + 500))
const BASE = Array.from({ length: N_PARTICLES }, (_, i) => 'ACGT'[Math.floor(hash(i + 900) * 4)])

function expFmt(v: number): string {
  const e = Math.round(Math.log10(v))
  return `10${String(e).replace('-', '⁻').replace(/[0-9]/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])}`
}

export function ProofreadingAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setTick(N_PARTICLES * SPAWN + 400); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [tick, setTick] = useState(0)
  const [on, setOn] = useState<[boolean, boolean, boolean]>([true, true, true])

  const rate = on.reduce((r, enabled, i) => (enabled ? r * GAIN[i] : r), RAW)
  const perGenome = rate * GENOME

  // Where a given error particle is stopped: 0..2 = a gate, 3 = escapes as a mutation.
  const stopIndex = useCallback((i: number) => {
    for (let g = 0; g < 3; g++) if (on[g] && ROLL[i] < CATCH[g]) return g
    return 3
  }, [on])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.lineJoin = 'round'

    // --- Log-scale error-rate meter ----------------------------------------
    const mL = 62
    const mR = W - 22
    const mY = 54
    const xForRate = (r: number) => mL + ((-Math.log10(r) - 1) / 9) * (mR - mL)

    ctx.fillStyle = DIM
    ctx.fillText('errors per base pair', 14, 24)
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(245,240,232,0.12)'
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.moveTo(mL, mY)
    ctx.lineTo(mR, mY)
    ctx.stroke()

    ctx.beginPath()
    ctx.strokeStyle = C_ERR
    ctx.lineWidth = 8
    ctx.moveTo(mL, mY)
    ctx.lineTo(xForRate(rate), mY)
    ctx.stroke()
    ctx.lineCap = 'butt'

    ctx.textAlign = 'center'
    for (let e = 1; e <= 10; e++) {
      const x = xForRate(Math.pow(10, -e))
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.18)'
      ctx.lineWidth = 1
      ctx.moveTo(x, mY + 7)
      ctx.lineTo(x, mY + 11)
      ctx.stroke()
      if (e % 3 === 1 || e === 9) {
        ctx.fillStyle = DIM
        ctx.fillText(expFmt(Math.pow(10, -e)), x, mY + 22)
      }
    }

    // Marker + value at the current rate.
    const mx = xForRate(rate)
    ctx.beginPath()
    ctx.arc(mx, mY, 6, 0, Math.PI * 2)
    ctx.fillStyle = '#0F0D0A'
    ctx.fill()
    ctx.strokeStyle = C_ERR
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = C_ERR
    ctx.fillText(expFmt(rate), mx, mY - 12)
    ctx.textAlign = 'left'

    ctx.fillStyle = DIM
    ctx.fillText(
      `≈ ${perGenome >= 1000 ? perGenome.toExponential(1) : perGenome < 10 ? perGenome.toFixed(1) : Math.round(perGenome).toLocaleString()} uncorrected errors per genome copied`,
      14,
      mY + 44
    )

    // --- Gates --------------------------------------------------------------
    LAYERS.forEach((L, g) => {
      const enabled = on[g]
      ctx.save()
      ctx.globalAlpha = enabled ? 1 : 0.28
      ctx.beginPath()
      ctx.strokeStyle = L.color
      ctx.lineWidth = enabled ? 2 : 1.25
      if (!enabled) ctx.setLineDash([4, 4])
      ctx.moveTo(L.x, LANE - 34)
      ctx.lineTo(L.x, LANE + 34)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = L.color
      ctx.textAlign = 'center'
      ctx.fillText(L.short, L.x, LANE - 42)
      ctx.font = '9px monospace'
      ctx.fillStyle = enabled ? 'rgba(245,240,232,0.45)' : 'rgba(245,240,232,0.3)'
      const words = L.long.split(' ')
      const mid = Math.ceil(words.length / 2)
      ctx.fillText(words.slice(0, mid).join(' '), L.x, LANE + 48)
      ctx.fillText(words.slice(mid).join(' '), L.x, LANE + 59)
      ctx.font = '10px monospace'
      ctx.textAlign = 'left'
      ctx.restore()
    })

    // --- Template lane -------------------------------------------------------
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(245,240,232,0.14)'
    ctx.lineWidth = 1
    ctx.moveTo(20, LANE + 22)
    ctx.lineTo(EXIT_X + 10, LANE + 22)
    ctx.stroke()
    ctx.fillStyle = DIM
    ctx.fillText('incoming', 16, LANE - 42)
    ctx.textAlign = 'right'
    ctx.fillText('into the genome →', W - 14, LANE - 42)
    ctx.textAlign = 'left'

    // --- Nucleotides ---------------------------------------------------------
    let escaped = 0
    const caught = [0, 0, 0]
    for (let i = 0; i < N_PARTICLES; i++) {
      const age = tick - i * SPAWN
      if (age < 0) continue
      const isErr = IS_ERROR[i]
      const stop = isErr ? stopIndex(i) : 3
      const limit = stop < 3 ? LAYERS[stop].x : EXIT_X
      const x = Math.min(START_X + age * SPEED, limit)
      const held = x >= limit

      if (held && stop < 3) caught[stop]++
      if (held && isErr && stop === 3) escaped++
      if (held && !isErr) continue    // correct bases leave the field at the right edge

      const color = isErr ? (held && stop < 3 ? LAYERS[stop].color : C_ERR) : C_OK
      // Rejected bases get kicked out of the lane.
      const bounce = held && stop < 3 ? Math.min(26, (age - (limit - START_X) / SPEED) * 1.1) : 0
      const y = LANE - bounce

      ctx.beginPath()
      ctx.arc(x, y, isErr ? 7 : 5.5, 0, Math.PI * 2)
      ctx.fillStyle = `${isErr ? color : '#F5F0E8'}22`
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = isErr ? 1.6 : 1
      ctx.stroke()
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.fillText(BASE[i], x, y + 3.5)
      ctx.textAlign = 'left'

      if (isErr && !held) {
        ctx.beginPath()
        ctx.strokeStyle = `${C_ERR}66`
        ctx.lineWidth = 1
        ctx.arc(x, y, 11, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // --- Escaped mutations pile up at the right ------------------------------
    ctx.fillStyle = escaped > 0 ? C_ERR : 'rgba(245,240,232,0.28)'
    ctx.textAlign = 'right'
    ctx.fillText(`${escaped} mutation${escaped === 1 ? '' : 's'} fixed`, W - 14, H - 12)
    ctx.textAlign = 'left'
    ctx.fillStyle = DIM
    ctx.fillText('pink = wrong base · error frequency exaggerated to be visible', 14, H - 12)
  }, [tick, on, rate, perGenome, stopIndex])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }
    const loop = () => {
      setTick(prev => prev + 1)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  const toggle = (g: number) =>
    setOn(prev => prev.map((v, i) => (i === g ? !v : v)) as [boolean, boolean, boolean])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setTick(0)
    setOn([true, true, true])
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Fidelity in Layers</span>
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-pink text-bg-base text-xs font-medium hover:bg-accent-pink/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        {LAYERS.map((L, g) => (
          <button
            key={L.key}
            onClick={() => toggle(g)}
            className="px-2 py-1 rounded text-xs font-medium border transition-colors"
            style={
              on[g]
                ? { color: L.color, borderColor: `${L.color}45`, background: `${L.color}14` }
                : { color: 'rgba(245,240,232,0.4)', borderColor: 'rgba(245,240,232,0.15)', background: 'rgba(245,240,232,0.04)' }
            }
          >
            {on[g] ? '✓' : '✕'} {L.short}
          </button>
        ))}
        <span className="ml-auto text-xs text-text-secondary">
          error rate <strong className="text-accent-pink">{rate.toExponential(0)}</strong> ·{' '}
          <strong className="text-text-primary">
            {perGenome >= 1000 ? perGenome.toExponential(1) : perGenome < 10 ? perGenome.toFixed(1) : Math.round(perGenome).toLocaleString()}
          </strong>{' '}
          per genome
        </span>
      </div>
    </div>
  )
}
