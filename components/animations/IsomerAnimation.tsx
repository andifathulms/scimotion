'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const C_C = 'rgba(245,240,232,0.6)'
const C_H = 'rgba(245,240,232,0.32)'
const C_O = '#60A5FA'
const C_X = '#10B981'
const ACCENT = '#FB923C'
const GOLD = '#F59E0B'

type Atom = { x: number; y: number; el: string; color: string }
type Bond = { a: number; b: number; order: number } // indices into atoms
type Mol = { name: string; bp: number; note: string; atoms: Atom[]; bonds: Bond[] }
type Mode = {
  key: string
  formula: string
  kind: 'isomers' | 'chiral'
  mols: Mol[]
  bpNote: string
}

const C = (x: number, y: number): Atom => ({ x, y, el: 'C', color: C_C })

const MODES: Mode[] = [
  {
    key: 'C4H10',
    formula: 'C₄H₁₀',
    kind: 'isomers',
    bpNote: 'straight vs branched → different boiling points',
    mols: [
      {
        name: 'n-butane (straight chain)',
        bp: -0.5,
        note: 'A long chain packs closely, so molecules cling harder and it boils higher.',
        atoms: [C(200, 190), C(260, 150), C(320, 190), C(380, 150)],
        bonds: [
          { a: 0, b: 1, order: 1 },
          { a: 1, b: 2, order: 1 },
          { a: 2, b: 3, order: 1 },
        ],
      },
      {
        name: '2-methylpropane (branched)',
        bp: -11.7,
        note: 'A compact, ball-like shape touches its neighbours less, so it boils lower.',
        atoms: [C(290, 100), C(290, 165), C(232, 205), C(348, 205)],
        bonds: [
          { a: 0, b: 1, order: 1 },
          { a: 1, b: 2, order: 1 },
          { a: 1, b: 3, order: 1 },
        ],
      },
    ],
  },
  {
    key: 'C2H6O',
    formula: 'C₂H₆O',
    kind: 'isomers',
    bpNote: 'alcohol vs ether → radically different substances',
    mols: [
      {
        name: 'ethanol (an alcohol)',
        bp: 78.4,
        note: 'The O–H hydrogen-bonds strongly — a drinkable liquid at room temperature.',
        atoms: [
          C(225, 175),
          C(290, 150),
          { x: 350, y: 175, el: 'O', color: C_O },
          { x: 395, y: 152, el: 'H', color: C_H },
        ],
        bonds: [
          { a: 0, b: 1, order: 1 },
          { a: 1, b: 2, order: 1 },
          { a: 2, b: 3, order: 1 },
        ],
      },
      {
        name: 'dimethyl ether (an ether)',
        bp: -24,
        note: 'No O–H to hydrogen-bond — a gas, an anaesthetic, nothing like ethanol.',
        atoms: [
          C(225, 160),
          { x: 300, y: 160, el: 'O', color: C_O },
          C(375, 160),
        ],
        bonds: [
          { a: 0, b: 1, order: 1 },
          { a: 1, b: 2, order: 1 },
        ],
      },
    ],
  },
  {
    key: 'chiral',
    formula: 'CHFClBr',
    kind: 'chiral',
    bpNote: 'mirror images — same formula, same bonds, opposite handedness',
    mols: [
      {
        name: 'left hand',
        bp: 0,
        note: '',
        atoms: [
          C(170, 165),
          { x: 170, y: 100, el: 'F', color: C_X },
          { x: 228, y: 148, el: 'Cl', color: C_X },
          { x: 195, y: 222, el: 'Br', color: C_X },
          { x: 112, y: 185, el: 'H', color: C_H },
        ],
        bonds: [
          { a: 0, b: 1, order: 1 },
          { a: 0, b: 2, order: 1 },
          { a: 0, b: 3, order: 1 },
          { a: 0, b: 4, order: 1 },
        ],
      },
      {
        name: 'right hand',
        bp: 0,
        note: '',
        atoms: [
          C(430, 165),
          { x: 430, y: 100, el: 'F', color: C_X },
          { x: 372, y: 148, el: 'Cl', color: C_X },
          { x: 405, y: 222, el: 'Br', color: C_X },
          { x: 488, y: 185, el: 'H', color: C_H },
        ],
        bonds: [
          { a: 0, b: 1, order: 1 },
          { a: 0, b: 2, order: 1 },
          { a: 0, b: 3, order: 1 },
          { a: 0, b: 4, order: 1 },
        ],
      },
    ],
  },
]

function drawBond(ctx: CanvasRenderingContext2D, p: Atom, q: Atom, order: number, color: string) {
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  if (order === 1) {
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(q.x, q.y)
    ctx.stroke()
    return
  }
  const dx = q.x - p.x
  const dy = q.y - p.y
  const len = Math.hypot(dx, dy) || 1
  const ox = (-dy / len) * 3
  const oy = (dx / len) * 3
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(p.x + ox * s, p.y + oy * s)
    ctx.lineTo(q.x + ox * s, q.y + oy * s)
    ctx.stroke()
  }
}

function drawMol(ctx: CanvasRenderingContext2D, m: Mol) {
  for (const b of m.bonds) drawBond(ctx, m.atoms[b.a], m.atoms[b.b], b.order, C_C)
  for (const a of m.atoms) {
    ctx.beginPath()
    ctx.arc(a.x, a.y, 13, 0, Math.PI * 2)
    ctx.fillStyle = '#0F0D0A'
    ctx.fill()
    ctx.strokeStyle = a.color
    ctx.lineWidth = 1.6
    ctx.stroke()
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = a.el === 'H' ? C_H : '#F5F0E8'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(a.el, a.x, a.y + 1)
  }
}

export function IsomerAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastRef = useRef(0)
  const modeRef = useRef(0)
  const varRef = useRef(0)

  const [mode, setMode] = useState(0)
  const [variant, setVariant] = useState(0)
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) return
      setRunning(true)
    },
  })

  const draw = useCallback((mi: number, vi: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const mode = MODES[mi]
    ctx.clearRect(0, 0, W, H)

    // Header: the shared formula
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('same molecular formula', W / 2, 26)
    ctx.font = 'bold 22px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText(mode.formula, W / 2, 52)

    if (mode.kind === 'chiral') {
      drawMol(ctx, mode.mols[0])
      drawMol(ctx, mode.mols[1])
      // mirror line
      ctx.strokeStyle = 'rgba(245,240,232,0.3)'
      ctx.setLineDash([5, 5])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(W / 2, 80)
      ctx.lineTo(W / 2, 250)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.font = '10px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.fillText('mirror', W / 2, 96)

      ctx.font = 'bold 13px monospace'
      ctx.fillStyle = ACCENT
      ctx.fillText('enantiomers — non-superimposable', W / 2, 278)
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.65)'
      ctx.fillText('Identical formula, identical bonds, identical boiling point.', W / 2, 298)
      ctx.fillText('But your body is chiral too, so it can tell left from right.', W / 2, 314)
      return
    }

    // isomer mode: draw the selected structure
    const m = mode.mols[vi]
    drawMol(ctx, m)

    ctx.textAlign = 'center'
    ctx.font = 'bold 14px monospace'
    ctx.fillStyle = ACCENT
    ctx.fillText(m.name, W / 2, 250)
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.fillText(m.note, W / 2, 270)

    // boiling-point axis comparing the two isomers
    const bps = mode.mols.map(x => x.bp)
    const lo = Math.min(...bps) - 20
    const hi = Math.max(...bps) + 20
    const AX_L = 90
    const AX_R = W - 90
    const AX_Y = 306
    const toX = (t: number) => AX_L + ((t - lo) / (hi - lo)) * (AX_R - AX_L)
    ctx.strokeStyle = 'rgba(245,240,232,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(AX_L, AX_Y)
    ctx.lineTo(AX_R, AX_Y)
    ctx.stroke()
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('boiling point', 20, AX_Y + 3)
    mode.mols.forEach((x, i) => {
      const px = toX(x.bp)
      const on = i === vi
      ctx.beginPath()
      ctx.arc(px, AX_Y, on ? 5 : 3.5, 0, Math.PI * 2)
      ctx.fillStyle = on ? GOLD : 'rgba(245,240,232,0.4)'
      ctx.fill()
      ctx.textAlign = 'center'
      ctx.font = on ? 'bold 10px monospace' : '10px monospace'
      ctx.fillStyle = on ? GOLD : 'rgba(245,240,232,0.45)'
      ctx.fillText(`${x.bp > 0 ? '+' : ''}${x.bp.toFixed(1)}°C`, px, AX_Y - 10)
    })
  }, [])

  useEffect(() => {
    if (!running) return
    lastRef.current = performance.now()
    const tick = (now: number) => {
      if (now - lastRef.current > 1800) {
        lastRef.current = now
        if (MODES[modeRef.current].kind === 'isomers') {
          varRef.current = varRef.current === 0 ? 1 : 0
          setVariant(varRef.current)
        }
      }
      draw(modeRef.current, varRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => {
    if (!running) draw(mode, variant)
  }, [running, mode, variant, draw])

  const pickMode = (i: number) => {
    setRunning(false)
    modeRef.current = i
    varRef.current = 0
    setMode(i)
    setVariant(0)
  }
  const pickVariant = (i: number) => {
    setRunning(false)
    varRef.current = i
    setVariant(i)
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    modeRef.current = 0
    varRef.current = 0
    setMode(0)
    setVariant(0)
    triggerReset()
  }

  const cur = MODES[mode]

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Same atoms, different molecule</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls">
        <button
          onClick={() => setRunning(x => !x)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-1.5">
          {MODES.map((mo, i) => (
            <button
              key={mo.key}
              onClick={() => pickMode(i)}
              className={`px-2 py-1 rounded-md border text-xs font-mono transition-colors ${
                i === mode
                  ? 'border-accent-gold bg-accent-gold/15 text-text-primary'
                  : 'border-border text-text-secondary hover:bg-bg-hover'
              }`}>
              {mo.formula}
            </button>
          ))}
        </div>
        {cur.kind === 'isomers' && (
          <div className="flex items-center gap-1.5">
            {cur.mols.map((m, i) => (
              <button
                key={m.name}
                onClick={() => pickVariant(i)}
                className={`px-2 py-1 rounded-md border text-xs transition-colors ${
                  i === variant
                    ? 'border-accent-gold bg-accent-gold/15 text-text-primary'
                    : 'border-border text-text-secondary hover:bg-bg-hover'
                }`}>
                {i === 0 ? 'A' : 'B'}
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto font-mono text-xs text-text-muted hidden sm:inline">{cur.bpNote}</span>
      </div>
    </div>
  )
}
