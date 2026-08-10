'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300
const ORANGE = '#FB923C'

// Compact element-symbol table (Z = 1..94) so the daughter nuclide is named correctly.
const SYMBOLS = [
  '', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne',
  'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
  'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr',
  'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn',
  'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd',
  'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb',
  'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
  'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th',
  'Pa', 'U', 'Np', 'Pu',
]

const sym = (z: number) => SYMBOLS[z] ?? `Z${z}`

// Parent nuclide: radium-226 (Z = 88, A = 226). Its real alpha decay gives radon-222.
const PARENT_Z = 88
const PARENT_A = 226

type Mode = 'alpha' | 'beta' | 'gamma'

const MODES: Record<Mode, {
  label: string
  particle: string
  dZ: number
  dA: number
  color: string
  stopIndex: number   // which barrier stops it: 0 paper, 1 aluminium, 2 lead
  note: string
}> = {
  alpha: { label: 'Alpha', particle: 'helium-4 nucleus (2p + 2n)', dZ: -2, dA: -4, color: '#F87171', stopIndex: 0, note: 'stopped by paper' },
  beta:  { label: 'Beta',  particle: 'electron (n → p)',       dZ: +1, dA: 0,  color: '#60A5FA', stopIndex: 1, note: 'stopped by aluminium' },
  gamma: { label: 'Gamma', particle: 'high-energy photon',          dZ: 0,  dA: 0,  color: '#A78BFA', stopIndex: 2, note: 'needs lead' },
}

// Barrier screens on the right, at fixed x positions.
const BARRIERS = [
  { label: 'paper', x: 300, color: '#D9C9A8' },
  { label: 'aluminium', x: 400, color: '#9CA3AF' },
  { label: 'lead', x: 500, color: '#6B7280' },
]

const NUCLEUS_X = 130
const NUCLEUS_Y = 130
const NUCLEUS_R = 46

// Fixed nucleon layout (deterministic — no random) drawn as a cluster.
const NUCLEONS = (() => {
  const pts: { x: number; y: number; proton: boolean }[] = []
  const rings = [
    { r: 0, n: 1 },
    { r: 16, n: 6 },
    { r: 30, n: 10 },
    { r: 42, n: 13 },
  ]
  let k = 0
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 + ring.r * 0.11
      pts.push({ x: Math.cos(a) * ring.r, y: Math.sin(a) * ring.r, proton: k % 2 === 0 })
      k++
    }
  }
  return pts
})()

export function DecayModesAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const progRef = useRef(0)      // 0..1 emission progress
  const modeRef = useRef<Mode>('alpha')
  const decayedFlag = useRef(false)

  const [mode, setMode] = useState<Mode>('alpha')
  const [decayed, setDecayed] = useState(false)
  const [, forceTick] = useState(0)

  const fire = useCallback((newMode: Mode) => {
    cancelAnimationFrame(animRef.current)
    modeRef.current = newMode
    setMode(newMode)
    setDecayed(false)
    progRef.current = 0
    decayedFlag.current = false
    const loop = () => {
      progRef.current = Math.min(1, progRef.current + 0.02)
      if (progRef.current >= 0.45 && !decayedFlag.current) {
        decayedFlag.current = true
        setDecayed(true)
      }
      forceTick(t => t + 1)
      if (progRef.current < 1) animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
  }, [])

  const { ref } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { progRef.current = 1; setDecayed(true); forceTick(t => t + 1) }
      else fire('alpha')
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    const m = MODES[modeRef.current]
    const p = progRef.current

    // Barriers
    for (let i = 0; i < BARRIERS.length; i++) {
      const b = BARRIERS[i]
      ctx.fillStyle = i <= m.stopIndex ? `${b.color}` : `${b.color}66`
      ctx.fillRect(b.x - 5, 40, 10, 170)
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(245,240,232,0.55)'
      ctx.save()
      ctx.translate(b.x, 226)
      ctx.fillText(b.label, 0, 0)
      ctx.restore()
    }

    // Nucleus body glow
    ctx.beginPath()
    ctx.arc(NUCLEUS_X, NUCLEUS_Y, NUCLEUS_R + 4, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(251,146,60,0.08)'
    ctx.fill()

    // Nucleons — after alpha, two protons + two neutrons have left
    const removed = modeRef.current === 'alpha' && p > 0.15
    for (let i = 0; i < NUCLEONS.length; i++) {
      const nuc = NUCLEONS[i]
      // In beta decay, flip the outermost neutron to a proton once emitted
      let proton = nuc.proton
      if (modeRef.current === 'beta' && p > 0.4 && i === NUCLEONS.length - 1) proton = true
      // Drop the last 4 nucleons to represent the departed alpha cluster
      if (removed && i >= NUCLEONS.length - 4) continue
      ctx.beginPath()
      ctx.arc(NUCLEUS_X + nuc.x, NUCLEUS_Y + nuc.y, 6, 0, Math.PI * 2)
      ctx.fillStyle = proton ? '#F97316' : '#3B82F6'
      ctx.fill()
    }

    // Nucleus label
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(245,240,232,0.85)'
    const shownZ = decayed ? PARENT_Z + m.dZ : PARENT_Z
    const shownA = decayed ? PARENT_A + m.dA : PARENT_A
    ctx.fillText(`${sym(shownZ)}-${shownA}`, NUCLEUS_X, NUCLEUS_Y + NUCLEUS_R + 22)
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.font = '9px monospace'
    ctx.fillText(`Z=${shownZ}  A=${shownA}`, NUCLEUS_X, NUCLEUS_Y + NUCLEUS_R + 36)

    // Emitted particle travelling right, stopping at its barrier
    if (p > 0.05) {
      const stopX = BARRIERS[m.stopIndex].x
      const startX = NUCLEUS_X + NUCLEUS_R
      const px = startX + (stopX - startX) * Math.min(1, p / 0.9)
      const py = NUCLEUS_Y
      if (modeRef.current === 'gamma') {
        // wavy photon
        ctx.strokeStyle = m.color
        ctx.lineWidth = 2
        ctx.beginPath()
        for (let x = startX; x <= px; x += 3) {
          const yy = py + Math.sin((x - startX) * 0.35) * 6
          if (x === startX) ctx.moveTo(x, yy)
          else ctx.lineTo(x, yy)
        }
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.arc(px, py, modeRef.current === 'alpha' ? 8 : 5, 0, Math.PI * 2)
        ctx.fillStyle = m.color
        ctx.fill()
        if (modeRef.current === 'alpha') {
          ctx.fillStyle = '#0F0D0A'
          ctx.font = '8px monospace'
          ctx.fillText('α', px, py + 3)
        } else {
          ctx.fillStyle = '#0F0D0A'
          ctx.font = 'bold 8px monospace'
          ctx.fillText('−', px, py + 3)
        }
      }
    }

    // Legend for nucleon colours
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = '#F97316'
    ctx.fillText('● proton', 14, 270)
    ctx.fillStyle = '#3B82F6'
    ctx.fillText('● neutron', 90, 270)
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('emitted → penetrating power increases to the right', 180, 270)
  }, [decayed])

  useEffect(() => { draw() }, [draw])

  useEffect(() => () => cancelAnimationFrame(animRef.current), [])

  const reset = () => {
    cancelAnimationFrame(animRef.current)
    progRef.current = 0
    decayedFlag.current = false
    setDecayed(false)
    forceTick(t => t + 1)
  }

  const m = MODES[mode]
  const dZ = decayed ? PARENT_Z + m.dZ : PARENT_Z
  const dA = decayed ? PARENT_A + m.dA : PARENT_A

  return (
    <div className="animation-block" ref={ref}>
      <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />

      <div className="mt-3 px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>mode: <strong style={{ color: m.color }}>{m.label}</strong></span>
        <span>emits: {m.particle}</span>
        <span>
          {sym(PARENT_Z)}-{PARENT_A} {decayed ? '→' : '…'}{' '}
          {decayed ? <strong style={{ color: ORANGE }}>{sym(dZ)}-{dA}</strong> : '(fire to decay)'}
        </span>
        <span className="text-text-muted">penetration: {m.note}</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        {(Object.keys(MODES) as Mode[]).map(k => {
          const active = mode === k
          return (
            <button
              key={k}
              onClick={() => fire(k)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={active
                ? { background: ORANGE, color: '#0F0D0A' }
                : { background: 'var(--bg-hover, #26221c)', color: 'var(--text-secondary, #cbb89a)' }}
            >
              <Play size={12} /> {MODES[k].label}
            </button>
          )
        })}
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <p className="mt-2 text-xs text-text-muted">
        Alpha (Z−2, A−4) is heavy and stopped by paper; beta turns a neutron into a proton (Z+1, A same)
        and needs aluminium; gamma is a photon that changes neither Z nor A and slips through everything but lead.
      </p>
    </div>
  )
}
