'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

// Backbone (an ethyl tail, R–) drawn as a zig-zag on the left; the terminal
// carbon "vertex" V is where every functional group attaches.
const VX = 250 // terminal (attachment) carbon x
const VY = 196 // terminal carbon y
const ZIG = [
  [96, 196],
  [134, 168],
  [172, 196],
  [210, 168],
  [VX, VY],
] as const

// Element colours.
const C_C = 'rgba(245,240,232,0.55)' // carbon backbone — muted
const C_H = 'rgba(245,240,232,0.30)' // hydrogen — faint
const C_O = '#60A5FA' // oxygen — blue
const C_N = '#A78BFA' // nitrogen — violet
const C_X = '#10B981' // halogen — green
const ACCENT = '#FB923C'

type Atom = { x: number; y: number; el: string; color: string }
type Bond = { a: [number, number]; b: [number, number]; order: number }

type Group = {
  key: string
  handle: string // the group written as a fragment, e.g. "–OH"
  groupName: string // hydroxyl, carboxyl, ...
  family: string
  suffix: string // how it renames the parent
  example: string // a concrete member
  behaviour: string
  color: string
  atoms: Atom[]
  bonds: Bond[]
}

// Each group's extra atoms/bonds hang off the vertex carbon V at (VX, VY).
const GROUPS: Group[] = [
  {
    key: 'alkane',
    handle: '–H',
    groupName: 'none (parent)',
    family: 'Alkane',
    suffix: '-ane',
    example: 'Ethane · C₂H₆',
    behaviour: 'Bare carbon backbone. Nonpolar and inert — it burns, but little else.',
    color: C_H,
    atoms: [{ x: VX + 42, y: VY - 24, el: 'H', color: C_H }],
    bonds: [{ a: [VX, VY], b: [VX + 42, VY - 24], order: 1 }],
  },
  {
    key: 'alcohol',
    handle: '–OH',
    groupName: 'hydroxyl',
    family: 'Alcohol',
    suffix: '-ol',
    example: 'Ethanol · C₂H₆O',
    behaviour: 'The O–H hydrogen-bonds: higher boiling point, dissolves in water, mildly acidic.',
    color: C_O,
    atoms: [
      { x: VX + 44, y: VY - 26, el: 'O', color: C_O },
      { x: VX + 82, y: VY - 40, el: 'H', color: C_H },
    ],
    bonds: [
      { a: [VX, VY], b: [VX + 44, VY - 26], order: 1 },
      { a: [VX + 44, VY - 26], b: [VX + 82, VY - 40], order: 1 },
    ],
  },
  {
    key: 'aldehyde',
    handle: '–CHO',
    groupName: 'carbonyl (terminal)',
    family: 'Aldehyde',
    suffix: '-al',
    example: 'Ethanal · C₂H₄O',
    behaviour: 'A polar C=O at the chain end. Reactive, and easily oxidised to an acid.',
    color: ACCENT,
    atoms: [
      { x: VX + 30, y: VY - 44, el: 'O', color: C_O },
      { x: VX + 44, y: VY + 4, el: 'H', color: C_H },
    ],
    bonds: [
      { a: [VX, VY], b: [VX + 30, VY - 44], order: 2 },
      { a: [VX, VY], b: [VX + 44, VY + 4], order: 1 },
    ],
  },
  {
    key: 'ketone',
    handle: '>C=O',
    groupName: 'carbonyl (internal)',
    family: 'Ketone',
    suffix: '-one',
    example: 'Propanone · C₃H₆O',
    behaviour: 'A polar C=O between two carbons. Polar and reactive, but resists oxidation.',
    color: ACCENT,
    atoms: [
      { x: VX, y: VY - 48, el: 'O', color: C_O },
      { x: VX + 42, y: VY + 24, el: 'C', color: C_C },
    ],
    bonds: [
      { a: [VX, VY], b: [VX, VY - 48], order: 2 },
      { a: [VX, VY], b: [VX + 42, VY + 24], order: 1 },
    ],
  },
  {
    key: 'acid',
    handle: '–COOH',
    groupName: 'carboxyl',
    family: 'Carboxylic acid',
    suffix: '-oic acid',
    example: 'Ethanoic acid · C₂H₄O₂',
    behaviour: 'C=O next to O–H makes the proton easy to give up — a weak acid.',
    color: C_O,
    atoms: [
      { x: VX + 4, y: VY - 46, el: 'O', color: C_O },
      { x: VX + 46, y: VY - 24, el: 'O', color: C_O },
      { x: VX + 84, y: VY - 36, el: 'H', color: C_H },
    ],
    bonds: [
      { a: [VX, VY], b: [VX + 4, VY - 46], order: 2 },
      { a: [VX, VY], b: [VX + 46, VY - 24], order: 1 },
      { a: [VX + 46, VY - 24], b: [VX + 84, VY - 36], order: 1 },
    ],
  },
  {
    key: 'amine',
    handle: '–NH₂',
    groupName: 'amino',
    family: 'Amine',
    suffix: '-amine',
    example: 'Ethylamine · C₂H₇N',
    behaviour: "Nitrogen's lone pair grabs a proton — a weak base, the mirror of an acid.",
    color: C_N,
    atoms: [
      { x: VX + 44, y: VY - 26, el: 'N', color: C_N },
      { x: VX + 84, y: VY - 38, el: 'H', color: C_H },
      { x: VX + 52, y: VY + 16, el: 'H', color: C_H },
    ],
    bonds: [
      { a: [VX, VY], b: [VX + 44, VY - 26], order: 1 },
      { a: [VX + 44, VY - 26], b: [VX + 84, VY - 38], order: 1 },
      { a: [VX + 44, VY - 26], b: [VX + 52, VY + 16], order: 1 },
    ],
  },
  {
    key: 'halo',
    handle: '–Cl',
    groupName: 'halo',
    family: 'Haloalkane',
    suffix: 'chloro-',
    example: 'Chloroethane · C₂H₅Cl',
    behaviour: 'A polar C–Cl bond, and Cl leaves easily — the classic substitution handle.',
    color: C_X,
    atoms: [{ x: VX + 46, y: VY - 26, el: 'Cl', color: C_X }],
    bonds: [{ a: [VX, VY], b: [VX + 46, VY - 26], order: 1 }],
  },
]

function drawBond(ctx: CanvasRenderingContext2D, b: Bond, color: string) {
  const [x1, y1] = b.a
  const [x2, y2] = b.b
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  if (b.order === 1) {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    return
  }
  // Double bond: two parallel lines offset perpendicular to the bond.
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ox = (-dy / len) * 3
  const oy = (dx / len) * 3
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(x1 + ox * s, y1 + oy * s)
    ctx.lineTo(x2 + ox * s, y2 + oy * s)
    ctx.stroke()
  }
}

function drawAtom(ctx: CanvasRenderingContext2D, a: Atom) {
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

export function FunctionalGroupAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const idxRef = useRef(1)
  const lastRef = useRef(0)

  const [idx, setIdx] = useState(1)
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        idxRef.current = 1
        setIdx(1)
        return
      }
      setRunning(true)
    },
  })

  const draw = useCallback((gi: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const g = GROUPS[gi]
    ctx.clearRect(0, 0, W, H)

    // Title
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('same carbon backbone  R–  +  one functional group', 20, 26)

    // --- backbone zig-zag ---
    ctx.strokeStyle = C_C
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(ZIG[0][0], ZIG[0][1])
    for (let i = 1; i < ZIG.length; i++) ctx.lineTo(ZIG[i][0], ZIG[i][1])
    ctx.stroke()

    // "R" bracket label over the tail
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.textAlign = 'center'
    ctx.fillText('R  (carbon chain)', 150, 236)

    // --- the functional group ---
    for (const b of g.bonds) drawBond(ctx, b, g.color)
    // vertex carbon
    drawAtom(ctx, { x: VX, y: VY, el: 'C', color: C_C })
    for (const a of g.atoms) drawAtom(ctx, a)

    // Highlight ring around the group region
    ctx.beginPath()
    ctx.arc(VX + 34, VY - 22, 62, 0, Math.PI * 2)
    ctx.strokeStyle = `${g.color === C_H ? 'rgba(245,240,232,0.25)' : g.color}55`
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = g.color === C_H ? 'rgba(245,240,232,0.5)' : g.color
    ctx.textAlign = 'center'
    ctx.fillText(g.handle, VX + 34, VY - 90)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText(g.groupName, VX + 34, VY - 76)

    // --- info panel (bottom) ---
    const py = 276
    ctx.textAlign = 'left'
    ctx.font = 'bold 15px monospace'
    ctx.fillStyle = g.color === C_H ? '#F5F0E8' : g.color
    ctx.fillText(g.family, 24, py)

    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(`names end in  ${g.suffix}`, 24, py + 20)
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText(g.example, 24, py + 38)

    // behaviour, right-aligned block
    ctx.font = '11px monospace'
    ctx.fillStyle = ACCENT
    ctx.fillText('characteristic behaviour', 300, py)
    ctx.fillStyle = 'rgba(245,240,232,0.7)'
    ctx.font = '11px monospace'
    // simple word wrap
    const words = g.behaviour.split(' ')
    let line = ''
    let ly = py + 20
    for (const w of words) {
      const test = line ? `${line} ${w}` : w
      if (ctx.measureText(test).width > 276 && line) {
        ctx.fillText(line, 300, ly)
        line = w
        ly += 16
      } else {
        line = test
      }
    }
    if (line) ctx.fillText(line, 300, ly)

    // footer takeaway
    ctx.textAlign = 'center'
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('swap the handle, swap the chemistry — the functional group decides how the molecule behaves', W / 2, H - 10)
  }, [])

  useEffect(() => {
    if (!running) return
    lastRef.current = performance.now()
    const tick = (now: number) => {
      if (now - lastRef.current > 1600) {
        lastRef.current = now
        idxRef.current = (idxRef.current + 1) % GROUPS.length
        setIdx(idxRef.current)
      }
      draw(idxRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => {
    if (!running) draw(idx)
  }, [running, idx, draw])

  const pick = (i: number) => {
    setRunning(false)
    idxRef.current = i
    setIdx(i)
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    idxRef.current = 1
    setIdx(1)
    triggerReset()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · One backbone, many families</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls">
        <button
          onClick={() => setRunning(x => !x)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Cycle</>}
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          {GROUPS.map((g, i) => (
            <button
              key={g.key}
              onClick={() => pick(i)}
              className={`px-2 py-1 rounded-md border text-xs font-mono transition-colors ${
                i === idx
                  ? 'border-accent-gold bg-accent-gold/15 text-text-primary'
                  : 'border-border text-text-secondary hover:bg-bg-hover'
              }`}>
              {g.handle}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-xs text-text-muted">{GROUPS[idx].family}</span>
      </div>
    </div>
  )
}
