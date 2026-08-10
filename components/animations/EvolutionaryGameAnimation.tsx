'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'
import { EquationReadout } from '@/components/EquationReadout'

const W = 600
const H = 300

const PINK = '#F472B6'   // always defect
const BLUE = '#60A5FA'   // always cooperate
const GREEN = '#10B981'  // tit-for-tat
const VIOLET = '#A78BFA'
const GOLD = '#F59E0B'

// Plot geometry
const PX = 52
const PY = 40
const PW = 372
const PH = 210
const PANEL_X = 452

const GENS = 300

const NAMES = ['Always defect', 'Always cooperate', 'Tit-for-tat']
const SHORT = ['ALLD', 'ALLC', 'TFT']
const COLORS = [PINK, BLUE, GREEN]

// One round of the Prisoner's Dilemma: T > R > P > S.
const T = 5, R = 3, P = 1, S = 0

// Total payoff to strategy i when it meets strategy j over `n` rounds.
// ALLD milks ALLC forever, but only gets one free defection against TFT before
// being punished for every remaining round — that is where cooperation's
// foothold comes from.
function payoff(i: number, j: number, n: number): number {
  if (i === 0 && j === 0) return P * n
  if (i === 0 && j === 1) return T * n
  if (i === 0 && j === 2) return T + P * (n - 1)
  if (i === 1 && j === 0) return S * n
  if (i === 1) return R * n
  if (i === 2 && j === 0) return S + P * (n - 1)
  return R * n
}

function matrix(n: number): number[][] {
  const m: number[][] = []
  for (let i = 0; i < 3; i++) {
    const row: number[] = []
    for (let j = 0; j < 3; j++) row.push(payoff(i, j, n))
    m.push(row)
  }
  return m
}

// One step of the replicator equation, discretised: strategies that score above
// the population average grow, the rest shrink.
function step(x: number[], m: number[][], dt: number): number[] {
  const f = [0, 0, 0]
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) f[i] += x[j] * m[i][j]
  const fbar = x[0] * f[0] + x[1] * f[1] + x[2] * f[2]
  const next = x.map((xi, i) => Math.max(0, xi + dt * xi * (f[i] - fbar)))
  const s = next[0] + next[1] + next[2]
  return s > 0 ? next.map(v => v / s) : [1 / 3, 1 / 3, 1 / 3]
}

function fitness(x: number[], m: number[][]): number[] {
  const f = [0, 0, 0]
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) f[i] += x[j] * m[i][j]
  return f
}

// The starting mix and the match length. Whether tit-for-tat wins is decided by
// the interaction of the two, and the interesting configurations are the ones
// near the boundary — which is precisely the sort of value nobody reproduces
// from a description.
const SPEC = {
  rounds: { default: 10, min: 1, max: 30, step: 1, symbol: 'n' },
  initD: { default: 50, min: 0, max: 100, step: 1, unit: '%' },
  initC: { default: 20, min: 0, max: 100, step: 1, unit: '%' },
}

export function EvolutionaryGameAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const histRef = useRef<number[][]>([])
  const [running, setRunning] = useState(false)
  const [tick, setTick] = useState(0)

  const { params, set, reset: resetParams, permalink, isDefault, restored } = useWidgetParams('evogame', SPEC)
  const { rounds, initD, initC } = params

  const start = useMemo(() => {
    const d = initD
    const c = initC
    const t = Math.max(0, 100 - d - c)
    const s = d + c + t
    return [d / s, c / s, t / s]
  }, [initD, initC])

  const m = useMemo(() => matrix(rounds), [rounds])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const hist = histRef.current
    const cur = hist.length > 0 ? hist[hist.length - 1] : start

    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('POPULATION SHARE', PX, PY - 14)

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PX + 0.5, PY)
    ctx.lineTo(PX + 0.5, PY + PH)
    ctx.lineTo(PX + PW, PY + PH)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'right'
    for (const [v, lab] of [[0, '0%'], [0.5, '50%'], [1, '100%']] as Array<[number, string]>) {
      const y = PY + PH - v * PH
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
    ctx.fillText('generations →', PX + PW / 2, PY + PH + 18)

    // Legend
    ctx.textAlign = 'left'
    let lx = PX
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = COLORS[i]
      ctx.fillRect(lx, PY + PH + 34, 8, 8)
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.font = '9px monospace'
      ctx.fillText(NAMES[i], lx + 13, PY + PH + 42)
      lx += 16 + ctx.measureText(NAMES[i]).width
    }

    // Stacked area chart of the three shares over time
    const n = hist.length
    if (n > 1) {
      const xAt = (k: number) => PX + (k / (GENS - 1)) * PW
      let base = new Array<number>(n).fill(0)
      for (let sIdx = 0; sIdx < 3; sIdx++) {
        const top = hist.map((h, k) => base[k] + h[sIdx])
        ctx.beginPath()
        ctx.moveTo(xAt(0), PY + PH - base[0] * PH)
        for (let k = 0; k < n; k++) ctx.lineTo(xAt(k), PY + PH - top[k] * PH)
        for (let k = n - 1; k >= 0; k--) ctx.lineTo(xAt(k), PY + PH - base[k] * PH)
        ctx.closePath()
        ctx.fillStyle = `${COLORS[sIdx]}59`
        ctx.fill()
        ctx.beginPath()
        for (let k = 0; k < n; k++) {
          const y = PY + PH - top[k] * PH
          if (k === 0) ctx.moveTo(xAt(k), y)
          else ctx.lineTo(xAt(k), y)
        }
        ctx.strokeStyle = COLORS[sIdx]
        ctx.lineWidth = 1.6
        ctx.stroke()
        base = top
      }

      // Playhead
      const hx = xAt(n - 1)
      ctx.strokeStyle = 'rgba(245,240,232,0.35)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(hx, PY)
      ctx.lineTo(hx, PY + PH)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`gen ${n - 1}`, Math.min(hx + 5, PX + PW - 46), PY + 11)
    }

    // ---- Right panel: current mix + fitness --------------------------
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PANEL_X - 16, 18)
    ctx.lineTo(PANEL_X - 16, H - 18)
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('MIX NOW', PANEL_X, 34)

    const f = fitness(cur, m)
    const fmax = Math.max(...f, 1e-9)
    for (let i = 0; i < 3; i++) {
      const y = 52 + i * 46
      ctx.fillStyle = COLORS[i]
      ctx.fillRect(PANEL_X, y - 8, 8, 8)
      ctx.fillStyle = 'rgba(245,240,232,0.6)'
      ctx.font = '9px monospace'
      ctx.fillText(SHORT[i], PANEL_X + 14, y)
      ctx.textAlign = 'right'
      ctx.fillStyle = COLORS[i]
      ctx.font = 'bold 11px monospace'
      ctx.fillText(`${(cur[i] * 100).toFixed(1)}%`, W - 20, y)
      ctx.textAlign = 'left'

      const bw = W - 20 - PANEL_X
      ctx.fillStyle = 'rgba(255,245,235,0.07)'
      ctx.fillRect(PANEL_X, y + 6, bw, 7)
      ctx.fillStyle = `${COLORS[i]}CC`
      ctx.fillRect(PANEL_X, y + 6, bw * cur[i], 7)

      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.font = '8px monospace'
      ctx.fillText(`fitness ${f[i].toFixed(1)}`, PANEL_X, y + 26)
      // Fitness tick relative to the best-scoring strategy
      ctx.strokeStyle = f[i] >= fmax - 1e-9 ? GOLD : 'rgba(255,245,235,0.15)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(PANEL_X + 78, y + 23)
      ctx.lineTo(PANEL_X + 78 + (bw - 78) * (f[i] / fmax), y + 23)
      ctx.stroke()
    }

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '9px monospace'
    ctx.fillText(`${rounds} round${rounds === 1 ? '' : 's'} per match`, PANEL_X, 214)
    ctx.fillStyle = VIOLET
    ctx.fillText(
      rounds === 1 ? 'one-shot: defection wins' : 'shadow of the future',
      PANEL_X,
      230
    )

    const winner = cur.indexOf(Math.max(...cur))
    if (cur[winner] > 0.985) {
      ctx.fillStyle = COLORS[winner]
      ctx.font = 'bold 10px monospace'
      ctx.fillText(`${SHORT[winner]} fixates`, PANEL_X, 258)
    } else {
      ctx.fillStyle = 'rgba(245,240,232,0.3)'
      ctx.font = '9px monospace'
      ctx.fillText('coexisting', PANEL_X, 258)
    }
  }, [start, m, rounds])

  const restart = useCallback((fill: boolean) => {
    let x = start
    const hist = [x]
    if (fill) {
      for (let k = 1; k < GENS; k++) {
        x = step(x, m, 0.02)
        hist.push(x)
      }
    }
    histRef.current = hist
    setTick(t => t + 1)
  }, [start, m])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      restart(reduced)
      if (!reduced) setRunning(true)
    },
  })

  // Changing the game or the starting mix invalidates the run.
  useEffect(() => {
    restart(false)
    setRunning(false)
  }, [restart])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const loop = () => {
      const hist = histRef.current
      if (hist.length >= GENS) {
        setRunning(false)
        draw()
        return
      }
      for (let k = 0; k < 2 && hist.length < GENS; k++) {
        hist.push(step(hist[hist.length - 1], m, 0.02))
      }
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, m, draw, tick])

  useEffect(() => {
    draw()
  }, [draw, tick])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    resetParams()
    triggerReset()
  }

  const initT = Math.max(0, 100 - initD - initC)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Replicator dynamics</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-x-4 gap-y-2">
        <button
          onClick={() => {
            if (histRef.current.length >= GENS) restart(false)
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Evolve</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Rounds/match <span className="text-accent-gold">n</span></span>
          <input type="range" min={SPEC.rounds.min} max={SPEC.rounds.max} step={SPEC.rounds.step} value={rounds}
            onChange={e => set('rounds', +e.target.value)}
            className="w-24 accent-accent-violet" />
          <span className="font-mono text-text-secondary w-6">{rounds}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span style={{ color: PINK }}>ALLD</span>
          <input type="range" min={SPEC.initD.min} max={SPEC.initD.max} step={SPEC.initD.step} value={initD}
            onChange={e => set('initD', Math.min(+e.target.value, 100 - initC))}
            className="w-20 accent-accent-gold" />
          <span className="font-mono text-text-secondary w-8">{initD}%</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span style={{ color: BLUE }}>ALLC</span>
          <input type="range" min={SPEC.initC.min} max={SPEC.initC.max} step={SPEC.initC.step} value={initC}
            onChange={e => set('initC', Math.min(+e.target.value, 100 - initD))}
            className="w-20 accent-accent-gold" />
          <span className="font-mono text-text-secondary w-8">{initC}%</span>
        </label>
        <span className="text-xs font-mono" style={{ color: GREEN }}>TFT {initT}%</span>
      </div>
      <div className="animation-readout">
        {/* n is what decides whether reciprocity can pay: tit-for-tat only beats
              defection once a match is long enough for retaliation to cost more
              than the one round of exploitation it followed. */}
        <EquationReadout
          formula="TFT resists ALLD when n > (T − R) / (R − P)"
          bindings={[{ symbol: 'n', value: String(rounds) }]}
          result={
            rounds > (T - R) / (R - P)
              ? `satisfied (n > ${((T - R) / (R - P)).toFixed(0)})`
              : `not satisfied (needs n > ${((T - R) / (R - P)).toFixed(0)})`
          }
          assumption={`threshold computed from this widget's own payoff matrix (T=${T}, R=${R}, P=${P}), so it moves if the payoffs do`}
        />
      </div>
    </div>
  )
}
