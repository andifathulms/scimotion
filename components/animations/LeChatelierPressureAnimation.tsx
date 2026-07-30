'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

// Gas equilibrium  2A(g) ⇌ B(g)   — two gas molecules on the left, one on the
// right. Compressing favours the side with FEWER molecules (B). The reaction is
// endothermic (heat + 2A ⇌ B is written the other way; here forward is
// exothermic-free choice) — we take the FORWARD direction 2A -> B as ENDOTHERMIC
// so that heating raises K and shifts toward B, and cooling lowers K.
const W = 620
const H = 320

// The vessel is a movable piston. Its width encodes the volume.
const VES_Y = 46
const VES_H = 210
const VES_X0 = 20
const VES_WMAX = 420 // volume = 1.0 (low pressure)
const VES_WMIN = 210 // volume = 0.5 (compressed, high pressure)

const R = 5
const A_COL = '#FB923C' // field accent — reactant A (needs two to react)
const B_COL = '#60A5FA' // product B
const GOLD = '#F59E0B'
const FADE = 'rgba(245,240,232,'

// Deterministic PRNG (mulberry32). No Math.random / Date.
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
const SEED = 0x9e3779b1

type Mol = { x: number; y: number; vx: number; vy: number; b: boolean; flash: number }

export function LeChatelierPressureAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const rngRef = useRef(makeRng(SEED))
  const molsRef = useRef<Mol[]>([])
  const vesWRef = useRef(VES_WMAX) // eased vessel width
  const compressRef = useRef(false)
  const tempRef = useRef(300) // eased temperature (K)

  const [compress, setCompress] = useState(false)
  const [hot, setHot] = useState(false)
  const [running, setRunning] = useState(false)
  const [readout, setReadout] = useState({ a: 0, b: 0, kChanged: false, note: '' })

  const targetW = useCallback(() => (compressRef.current ? VES_WMIN : VES_WMAX), [])

  // Temperature sets K for the endothermic forward reaction: hotter -> larger K.
  const kOf = useCallback((T: number) => 1.2 * Math.exp((T - 300) / 90), [])

  const seedMols = useCallback(() => {
    const rng = rngRef.current
    // start with 30 A + 15 B (i.e. plenty of both), already near equilibrium
    const mols: Mol[] = []
    const w = vesWRef.current
    const push = (b: boolean) => {
      const a = rng() * Math.PI * 2
      const s = 0.9 + rng() * 1.1
      mols.push({
        x: VES_X0 + R + 2 + rng() * (w - 2 * R - 4),
        y: VES_Y + R + 2 + rng() * (VES_H - 2 * R - 4),
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        b,
        flash: 0,
      })
    }
    for (let i = 0; i < 30; i++) push(false)
    for (let i = 0; i < 15; i++) push(true)
    molsRef.current = mols
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  const counts = useCallback(() => {
    let nB = 0
    for (const m of molsRef.current) if (m.b) nB++
    return { nA: molsRef.current.length - nB, nB }
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

    const w = vesWRef.current
    const T = tempRef.current
    const { nA, nB } = counts()

    // heading
    ctx.fillStyle = FADE + '0.55)'
    ctx.fillText('2 A(g) ⇌ B(g)     forward is endothermic (heat + 2A ⇌ B)', VES_X0, VES_Y - 14)

    // vessel walls + piston
    ctx.strokeStyle = FADE + '0.18)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(VES_X0, VES_Y, w, VES_H)
    // piston head (the movable right wall)
    ctx.fillStyle = compressRef.current ? 'rgba(251,146,60,0.22)' : FADE + '0.10)'
    ctx.fillRect(VES_X0 + w, VES_Y - 6, 12, VES_H + 12)
    ctx.strokeStyle = FADE + '0.35)'
    ctx.strokeRect(VES_X0 + w, VES_Y - 6, 12, VES_H + 12)
    // piston arrow
    ctx.fillStyle = FADE + '0.5)'
    ctx.fillText(compressRef.current ? 'piston ←' : 'piston →', VES_X0 + w - 34, VES_Y - 14)

    // molecules (heat = faster shimmer, drawn via velocity already scaled)
    for (const m of molsRef.current) {
      if (m.flash > 0) {
        ctx.beginPath()
        ctx.arc(m.x, m.y, R + 5 * (m.flash / 14), 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(245,158,11,${0.5 * (m.flash / 14)})`
        ctx.lineWidth = 1.25
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(m.x, m.y, m.b ? R + 1.5 : R, 0, Math.PI * 2)
      ctx.fillStyle = m.b ? B_COL : A_COL
      ctx.fill()
    }

    // right info column
    const ix = VES_X0 + VES_WMAX + 30
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = A_COL
    ctx.fillText(`● A ${nA}`, ix, VES_Y + 10)
    ctx.fillStyle = B_COL
    ctx.fillText(`● B ${nB}`, ix, VES_Y + 30)

    ctx.font = '10px monospace'
    ctx.fillStyle = FADE + '0.5)'
    ctx.fillText('volume', ix, VES_Y + 62)
    ctx.fillStyle = GOLD
    const vol = (w - VES_WMIN) / (VES_WMAX - VES_WMIN) // 0..1
    ctx.fillText(`${(0.5 + 0.5 * vol).toFixed(2)}`, ix + 56, VES_Y + 62)

    ctx.fillStyle = FADE + '0.5)'
    ctx.fillText('temp', ix, VES_Y + 84)
    ctx.fillStyle = tempRef.current > 305 ? '#F87171' : GOLD
    ctx.fillText(`${T.toFixed(0)} K`, ix + 56, VES_Y + 84)

    ctx.fillStyle = FADE + '0.5)'
    ctx.fillText('K (=[B]/[A]²)', ix, VES_Y + 106)
    ctx.fillStyle = GOLD
    ctx.fillText(kOf(T).toFixed(2), ix + 84, VES_Y + 106)

    // pressure hint bar
    const pr = 1 / (0.5 + 0.5 * vol) // higher when compressed
    ctx.fillStyle = FADE + '0.5)'
    ctx.fillText('pressure', ix, VES_Y + 138)
    ctx.fillStyle = FADE + '0.08)'
    ctx.fillRect(ix, VES_Y + 144, 150, 12)
    ctx.fillStyle = compressRef.current ? '#F87171' : A_COL
    ctx.fillRect(ix, VES_Y + 144, Math.min(1, (pr - 1) / 1.0) * 150 + 20, 12)

    return { nA, nB }
  }, [counts, kOf])

  const init = useCallback(() => {
    rngRef.current = makeRng(SEED)
    compressRef.current = false
    tempRef.current = 300
    vesWRef.current = VES_WMAX
    setCompress(false)
    setHot(false)
    seedMols()
    const { nA, nB } = counts()
    setReadout({ a: nA, b: nB, kChanged: false, note: 'at equilibrium' })
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

      // ease vessel width toward its target (volume change)
      const tw = targetW()
      vesWRef.current += (tw - vesWRef.current) * 0.08
      if (Math.abs(tw - vesWRef.current) < 0.4) vesWRef.current = tw
      const w = vesWRef.current

      // ease temperature
      const tt = hot ? 360 : 300
      tempRef.current += (tt - tempRef.current) * 0.05
      if (Math.abs(tt - tempRef.current) < 0.3) tempRef.current = tt
      const T = tempRef.current

      const mols = molsRef.current
      // speed scale from temperature (kinetic theory): hotter = faster.
      const speed = Math.sqrt(T / 300)

      for (const m of mols) {
        m.x += m.vx * speed
        m.y += m.vy * speed
        if (m.x < VES_X0 + R) { m.x = VES_X0 + R; m.vx = -m.vx }
        if (m.x > VES_X0 + w - R) { m.x = VES_X0 + w - R; m.vx = -m.vx }
        if (m.y < VES_Y + R) { m.y = VES_Y + R; m.vy = -m.vy }
        if (m.y > VES_Y + VES_H - R) { m.y = VES_Y + VES_H - R; m.vy = -m.vy }
        if (m.flash > 0) m.flash -= 1
      }

      // Reaction: the target equilibrium depends BOTH on K(T) and on volume.
      // Position measured by fraction that is B. Compressing (smaller volume)
      // pushes toward fewer molecules (B); heating raises K, also toward B.
      const nB = mols.reduce((s, m) => s + (m.b ? 1 : 0), 0)
      const nA = mols.length - nB
      const vol = 0.5 + 0.5 * ((w - VES_WMIN) / (VES_WMAX - VES_WMIN)) // 0.5..1
      // Concentration-based drive: want [B]/[A]^2 = K. With volume V, converting
      // A->B is favoured at small V. Use a simple stochastic drive.
      const K = kOf(T)
      // effective "pressure toward products" grows as volume shrinks
      const drive = K / (vol * vol)
      // probability weighting between forward (2A->B) and reverse (B->2A)
      const pF = 0.010 * Math.min(3, drive) // needs a partner A, handled below
      const pR = 0.010

      // forward: pick pairs of A and fuse into one B (removes an A, converts one)
      for (let i = 0; i < mols.length; i++) {
        const m = mols[i]
        if (!m.b) {
          if (nA >= 2 && rng() < pF) {
            // find a partner A
            const j = mols.findIndex((o, k) => k !== i && !o.b)
            if (j >= 0) {
              m.b = true
              m.flash = 14
              mols.splice(j, 1)
              break // one reaction event per frame keeps counts readable
            }
          }
        } else {
          if (rng() < pR) {
            // reverse: B -> 2A : convert this B to A and add one A
            m.b = false
            m.flash = 14
            const a = rng() * Math.PI * 2
            const s = 0.9 + rng() * 1.1
            mols.push({
              x: Math.min(VES_X0 + w - R - 2, m.x + 8),
              y: m.y,
              vx: Math.cos(a) * s,
              vy: Math.sin(a) * s,
              b: false,
              flash: 14,
            })
            break
          }
        }
      }

      const r = draw()
      if (r) {
        frame++
        if (frame % 6 === 0) {
          const kChanged = tempRef.current > 305
          const note = hot
            ? 'heating → shifts to B, K increased'
            : compressRef.current
              ? 'compressed → shifts to B (fewer molecules), K unchanged'
              : 'at equilibrium'
          setReadout({ a: r.nA, b: r.nB, kChanged, note })
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, hot, targetW, kOf, draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    init()
  }

  return (
    <div ref={ref} className="animation-block">
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          A <span style={{ color: A_COL }}>{readout.a}</span> · B{' '}
          <span style={{ color: B_COL }}>{readout.b}</span>
        </span>
        <span>
          K{' '}
          <span className={readout.kChanged ? 'text-accent-orange' : 'text-accent-gold'}>
            {readout.kChanged ? 'changed (temperature)' : 'unchanged'}
          </span>
        </span>
        <span>{readout.note}</span>
      </div>

      <div className="mt-3">
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: '#0F0D0A', aspectRatio: `${W} / ${H}` }}
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
          onClick={() => {
            setCompress(v => {
              compressRef.current = !v
              return !v
            })
            setRunning(true)
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: compress ? A_COL : 'rgba(255,245,235,0.08)',
            color: compress ? '#1A1712' : 'rgba(245,240,232,0.7)',
          }}
        >
          Pressure: {compress ? 'HIGH (compressed)' : 'low'}
        </button>
        <button
          onClick={() => {
            setHot(v => !v)
            setRunning(true)
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: hot ? '#F87171' : 'rgba(255,245,235,0.08)',
            color: hot ? '#1A1712' : 'rgba(245,240,232,0.7)',
          }}
        >
          Temp: {hot ? '360 K (hot)' : '300 K'}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <span className="text-xs text-text-muted">
          Compress: shift to B, K unchanged. Heat: shift to B and K actually rises.
        </span>
      </div>
    </div>
  )
}
