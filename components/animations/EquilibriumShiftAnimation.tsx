'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

// Layout ---------------------------------------------------------------------
const W = 620
const H = 320
const VES = { x: 14, y: 40, w: 300, h: 262 } // reaction vessel
const BARS = { x: 344, y: 40, w: 262, h: 262 } // rate + amount readouts

// Kinetics of A ⇌ B. Rate constants are fixed, so K = kf/kr is an invariant of
// the whole widget — only the *position* (how many A vs B) ever moves.
const KF = 0.020 // forward rate constant  A -> B
const KR = 0.010 // reverse rate constant  B -> A
const K_EQ = KF / KR // = 2.0, the equilibrium constant, forever

const R = 4.6
const CAP = 120 // vessel can hold at most this many particles

// Colours
const ORANGE = '#FB923C' // field accent — species A
const BLUE = '#60A5FA' // species B
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const FADE = 'rgba(245,240,232,'

// Deterministic PRNG (mulberry32). No Math.random / Date — reproducible frames.
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEED = 0x51c0ffee

type Mol = { x: number; y: number; vx: number; vy: number; b: boolean; flash: number }

type Stress = { label: string; species: 'A' | 'B'; sign: 1 | -1; n: number } | null

export function EquilibriumShiftAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const rngRef = useRef(makeRng(SEED))
  const molsRef = useRef<Mol[]>([])
  const stressRef = useRef<Stress>(null)
  const flashRef = useRef(0) // frames left of the "stress applied" banner

  const [running, setRunning] = useState(false)
  const [readout, setReadout] = useState({ a: 0, b: 0, q: 0, dir: 'at equilibrium' })

  // Seed the vessel with a mixture already at equilibrium: with K = 2, two
  // thirds of the particles are B. 60 total -> 20 A, 40 B.
  const seedMols = useCallback(() => {
    const rng = rngRef.current
    const total = 60
    const mols: Mol[] = []
    for (let i = 0; i < total; i++) {
      const a = rng() * Math.PI * 2
      const s = 0.7 + rng() * 0.9
      mols.push({
        x: VES.x + R + 2 + rng() * (VES.w - 2 * R - 4),
        y: VES.y + R + 2 + rng() * (VES.h - 2 * R - 4),
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        b: i % 3 !== 0, // ~2/3 are B
        flash: 0,
      })
    }
    molsRef.current = mols
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  const counts = useCallback(() => {
    const mols = molsRef.current
    let nB = 0
    for (const m of mols) if (m.b) nB++
    return { nA: mols.length - nB, nB }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'

    const { nA, nB } = counts()

    // ---- Vessel ----
    ctx.strokeStyle = FADE + '0.18)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(VES.x, VES.y, VES.w, VES.h)
    ctx.fillStyle = FADE + '0.55)'
    ctx.fillText('sealed vessel   A ⇌ B', VES.x, VES.y - 12)

    for (const m of molsRef.current) {
      if (m.flash > 0) {
        ctx.beginPath()
        ctx.arc(m.x, m.y, R + 5 * (m.flash / 14), 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(245,158,11,${0.5 * (m.flash / 14)})`
        ctx.lineWidth = 1.25
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(m.x, m.y, R, 0, Math.PI * 2)
      ctx.fillStyle = m.b ? BLUE : ORANGE
      ctx.fill()
    }

    // legend inside vessel
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = ORANGE
    ctx.fillText(`● A ${nA}`, VES.x + 8, VES.y + VES.h - 12)
    ctx.fillStyle = BLUE
    ctx.fillText(`● B ${nB}`, VES.x + 74, VES.y + VES.h - 12)

    // "stress applied" banner
    if (flashRef.current > 0 && stressRef.current) {
      const alpha = Math.min(1, flashRef.current / 30)
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = `rgba(251,146,60,${alpha})`
      ctx.fillText(stressRef.current.label, VES.x + 8, VES.y + 16)
    }

    // ---- Right panel: forward vs reverse rate bars ----
    const rf = KF * nA
    const rr = KR * nB
    const rMax = Math.max(rf, rr, 0.6) * 1.15
    const barTop = BARS.y + 6
    const barH = 26
    const bar = (y: number, val: number, max: number, color: string, label: string) => {
      ctx.fillStyle = FADE + '0.5)'
      ctx.font = '10px monospace'
      ctx.fillText(label, BARS.x, y - 4)
      ctx.fillStyle = FADE + '0.08)'
      ctx.fillRect(BARS.x, y, BARS.w, barH)
      ctx.fillStyle = color
      ctx.fillRect(BARS.x, y, Math.min(1, val / max) * BARS.w, barH)
      ctx.fillStyle = '#0F0D0A'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(val.toFixed(2), BARS.x + Math.min(1, val / max) * BARS.w - 6, y + 17)
      ctx.textAlign = 'left'
    }
    bar(barTop + 14, rf, rMax, GOLD, 'forward rate  kf·[A]')
    bar(barTop + 14 + barH + 30, rr, rMax, VIOLET, 'reverse rate  kr·[B]')

    // Q vs K meter
    const q = nA > 0 ? nB / nA : Infinity
    const my = barTop + 14 + 2 * (barH + 30) + 18
    ctx.font = '10px monospace'
    ctx.fillStyle = FADE + '0.5)'
    ctx.fillText('Q = [B]/[A]  vs  K (fixed)', BARS.x, my - 4)
    const mScale = 4 // meter spans Q from 0..4
    const mW = BARS.w
    ctx.fillStyle = FADE + '0.08)'
    ctx.fillRect(BARS.x, my, mW, 16)
    // K marker
    const kx = BARS.x + Math.min(1, K_EQ / mScale) * mW
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(kx, my - 4)
    ctx.lineTo(kx, my + 20)
    ctx.stroke()
    ctx.fillStyle = GOLD
    ctx.font = 'bold 9px monospace'
    ctx.fillText('K=2.0', kx - 14, my - 6)
    // Q marker
    const qx = BARS.x + Math.min(1, (Number.isFinite(q) ? q : mScale) / mScale) * mW
    ctx.fillStyle = q > K_EQ ? BLUE : q < K_EQ ? ORANGE : GOLD
    ctx.beginPath()
    ctx.arc(qx, my + 8, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = 'bold 9px monospace'
    ctx.fillText('Q', qx - 3, my + 32)

    return { nA, nB, q }
  }, [counts])

  const init = useCallback(() => {
    rngRef.current = makeRng(SEED)
    seedMols()
    stressRef.current = null
    flashRef.current = 0
    const { nA, nB } = counts()
    setReadout({ a: nA, b: nB, q: nA > 0 ? nB / nA : Infinity, dir: 'at equilibrium' })
    draw()
  }, [seedMols, counts, draw])

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    if (!running) return
    let frame = 0
    const tick = () => {
      const rng = rngRef.current
      const mols = molsRef.current

      // Apply a pending stress once, at the top of a frame.
      const st = stressRef.current
      if (st && st.n > 0) {
        if (st.sign === 1 && mols.length < CAP) {
          // add particles of the chosen species
          const a = rng() * Math.PI * 2
          const s = 0.7 + rng() * 0.9
          mols.push({
            x: VES.x + R + 2 + rng() * (VES.w - 2 * R - 4),
            y: VES.y + R + 2 + rng() * (VES.h - 2 * R - 4),
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s,
            b: st.species === 'B',
            flash: 14,
          })
          st.n -= 1
        } else if (st.sign === -1) {
          // remove a particle of the chosen species, if any exist
          const idx = mols.findIndex(m => m.b === (st.species === 'B'))
          if (idx >= 0) mols.splice(idx, 1)
          st.n -= 1
        } else {
          st.n = 0
        }
        if (st.n === 0) stressRef.current = null
      }

      // Move + interconvert.
      for (const m of mols) {
        m.x += m.vx
        m.y += m.vy
        if (m.x < VES.x + R) { m.x = VES.x + R; m.vx = -m.vx }
        if (m.x > VES.x + VES.w - R) { m.x = VES.x + VES.w - R; m.vx = -m.vx }
        if (m.y < VES.y + R) { m.y = VES.y + R; m.vy = -m.vy }
        if (m.y > VES.y + VES.h - R) { m.y = VES.y + VES.h - R; m.vy = -m.vy }
        if (m.flash > 0) m.flash -= 1
        // Each molecule flips with probability set by the rate constant of its
        // current side. The ratio KF/KR fixes K; nothing here can change it.
        const p = m.b ? KR : KF
        if (rng() < p) {
          m.b = !m.b
          m.flash = 14
        }
      }

      if (flashRef.current > 0) flashRef.current -= 1

      const r = draw()
      if (r) {
        frame++
        if (frame % 5 === 0) {
          const q = r.nA > 0 ? r.nB / r.nA : Infinity
          const dir =
            Math.abs(q - K_EQ) < 0.06
              ? 'at equilibrium (Q≈K)'
              : q < K_EQ
                ? 'shifting → products (Q<K)'
                : 'shifting → reactants (Q>K)'
          setReadout({ a: r.nA, b: r.nB, q, dir })
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const applyStress = (s: NonNullable<Stress>) => {
    stressRef.current = { ...s }
    flashRef.current = 60
    setRunning(true)
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    init()
  }

  const qTxt = Number.isFinite(readout.q) ? readout.q.toFixed(2) : '∞'

  return (
    <div ref={ref} className="animation-block">
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          [A] <span style={{ color: ORANGE }}>{readout.a}</span> · [B]{' '}
          <span style={{ color: BLUE }}>{readout.b}</span>
        </span>
        <span>
          Q <span className="text-accent-blue">{qTxt}</span> · K{' '}
          <span className="text-accent-gold">2.00 (fixed)</span>
        </span>
        <span>{readout.dir}</span>
      </div>

      <div className="mt-3">
        <canvas
          role="img"
          aria-label="Animated diagram: Equilibrium shift. Values are reported below the diagram."
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)', aspectRatio: `${W} / ${H}` }}
        />
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => applyStress({ label: '+ added A  (Q<K → shifts to B)', species: 'A', sign: 1, n: 18 })}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          Add A
        </button>
        <button
          onClick={() => applyStress({ label: '+ added B  (Q>K → shifts to A)', species: 'B', sign: 1, n: 18 })}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          Add B
        </button>
        <button
          onClick={() => applyStress({ label: '− removed B  (Q<K → shifts to B)', species: 'B', sign: -1, n: 14 })}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          Remove B
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <span className="text-xs text-text-muted">
          Apply a stress: Q leaves K, the system shifts partway back — never all the way.
        </span>
      </div>
    </div>
  )
}
