'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

// Standard genetic code (NCBI translation table 1). Bases ordered U,C,A,G on
// every position, so the string reads out in the canonical codon-table order.
const ORDER = 'UCAG'
const AAS =
  'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG'

function aaOf(codon: string): string {
  const b1 = ORDER.indexOf(codon[0])
  const b2 = ORDER.indexOf(codon[1])
  const b3 = ORDER.indexOf(codon[2])
  if (b1 < 0 || b2 < 0 || b3 < 0) return '?'
  return AAS[b1 * 16 + b2 * 4 + b3]
}

type AAMeta = { three: string; name: string; cls: keyof typeof CLASS_COLOR }
const AA: Record<string, AAMeta> = {
  F: { three: 'Phe', name: 'Phenylalanine', cls: 'hydro' },
  L: { three: 'Leu', name: 'Leucine', cls: 'hydro' },
  I: { three: 'Ile', name: 'Isoleucine', cls: 'hydro' },
  M: { three: 'Met', name: 'Methionine (start)', cls: 'hydro' },
  V: { three: 'Val', name: 'Valine', cls: 'hydro' },
  A: { three: 'Ala', name: 'Alanine', cls: 'hydro' },
  G: { three: 'Gly', name: 'Glycine', cls: 'hydro' },
  P: { three: 'Pro', name: 'Proline', cls: 'hydro' },
  W: { three: 'Trp', name: 'Tryptophan', cls: 'hydro' },
  S: { three: 'Ser', name: 'Serine', cls: 'polar' },
  T: { three: 'Thr', name: 'Threonine', cls: 'polar' },
  C: { three: 'Cys', name: 'Cysteine', cls: 'polar' },
  Y: { three: 'Tyr', name: 'Tyrosine', cls: 'polar' },
  N: { three: 'Asn', name: 'Asparagine', cls: 'polar' },
  Q: { three: 'Gln', name: 'Glutamine', cls: 'polar' },
  D: { three: 'Asp', name: 'Aspartate', cls: 'acid' },
  E: { three: 'Glu', name: 'Glutamate', cls: 'acid' },
  K: { three: 'Lys', name: 'Lysine', cls: 'basic' },
  R: { three: 'Arg', name: 'Arginine', cls: 'basic' },
  H: { three: 'His', name: 'Histidine', cls: 'basic' },
  '*': { three: 'Stop', name: 'Stop codon', cls: 'stop' },
}

const CLASS_COLOR = {
  hydro: '#A3E635',   // lime  — nonpolar / hydrophobic
  polar: '#60A5FA',   // blue  — polar uncharged
  acid: '#A78BFA',    // violet — acidic
  basic: '#F59E0B',   // gold  — basic
  stop: '#EF6F6F',    // red   — stop
} as const

const DIM = 'rgba(245,240,232,0.4)'
const FAINT = 'rgba(245,240,232,0.12)'
const INK = 'rgba(245,240,232,0.85)'

const REF = 'GAA'                 // reference codon: Glu

// Table geometry (left half of the canvas).
const TX = 30
const TY = 46
const BLOCK_W = 78
const CELL_H = 12
const BLOCK_H = CELL_H * 4        // 48

function classColor(codon: string): string {
  const a = aaOf(codon)
  const m = AA[a]
  return m ? CLASS_COLOR[m.cls] : DIM
}

type Kind = 'reference' | 'silent' | 'missense' | 'nonsense'
function classify(codon: string): Kind {
  if (codon === REF) return 'reference'
  const a = aaOf(codon)
  if (a === '*') return 'nonsense'
  if (a === aaOf(REF)) return 'silent'
  return 'missense'
}
const KIND_COLOR: Record<Kind, string> = {
  reference: DIM,
  silent: '#A3E635',
  missense: '#F59E0B',
  nonsense: '#EF6F6F',
}
const KIND_TEXT: Record<Kind, string> = {
  reference: 'no change',
  silent: 'SILENT',
  missense: 'MISSENSE',
  nonsense: 'NONSENSE',
}

export function GeneticCodeAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const [codon, setCodon] = useState(REF)
  const [reveal, setReveal] = useState(0)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setReveal(1); return }
      setReveal(0.0001)
    },
  })

  // Gentle reveal sweep of the table on scroll-in.
  useEffect(() => {
    if (reveal <= 0 || reveal >= 1) return
    const loop = () => {
      setReveal(r => {
        const n = r + 0.05
        return n >= 1 ? 1 : n
      })
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [reveal])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'

    // ---- Title -----------------------------------------------------------
    ctx.textAlign = 'left'
    ctx.fillStyle = INK
    ctx.font = 'bold 11px monospace'
    ctx.fillText('The genetic code — 64 codons, 20 amino acids', 12, 16)
    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('same colour = same chemical class; repeats = redundancy', 12, 30)

    // ---- Column headers (2nd base) ---------------------------------------
    ctx.textAlign = 'center'
    for (let s = 0; s < 4; s++) {
      ctx.fillStyle = DIM
      ctx.font = '9px monospace'
      ctx.fillText(`2nd:${ORDER[s]}`, TX + s * BLOCK_W + BLOCK_W / 2, TY - 6)
    }

    const rev = Math.max(0, Math.min(1, reveal))
    const shown = Math.floor(rev * 64 + 0.5)
    let cellIdx = 0

    for (let f = 0; f < 4; f++) {
      // Row header (1st base)
      ctx.fillStyle = DIM
      ctx.font = '9px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(`1st:${ORDER[f]}`, TX - 4, TY + f * BLOCK_H + BLOCK_H / 2)
      ctx.textAlign = 'center'

      for (let s = 0; s < 4; s++) {
        for (let t = 0; t < 4; t++) {
          const cd = `${ORDER[f]}${ORDER[s]}${ORDER[t]}`
          const x = TX + s * BLOCK_W
          const y = TY + f * BLOCK_H + t * CELL_H
          cellIdx++
          if (cellIdx > shown) continue

          const col = classColor(cd)
          const isCur = cd === codon
          const isRef = cd === REF
          ctx.fillStyle = isCur ? `${col}` : `${col}22`
          ctx.fillRect(x + 1, y + 1, BLOCK_W - 2, CELL_H - 1)
          if (isCur || isRef) {
            ctx.strokeStyle = isCur ? INK : DIM
            ctx.lineWidth = isCur ? 1.5 : 1
            ctx.strokeRect(x + 1, y + 1, BLOCK_W - 2, CELL_H - 1)
          }
          const a = aaOf(cd)
          const label = a === '*' ? 'Stop' : `${AA[a].three}`
          ctx.fillStyle = isCur ? '#0F0D0A' : col
          ctx.font = '9px monospace'
          ctx.textAlign = 'left'
          ctx.fillText(cd, x + 5, y + CELL_H / 2 + 1)
          ctx.textAlign = 'right'
          ctx.fillText(label, x + BLOCK_W - 5, y + CELL_H / 2 + 1)
          ctx.textAlign = 'center'
        }
      }
    }
    // 3rd-base note
    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('3rd base within each block: U C A G, top → bottom', TX - 6, TY + BLOCK_H * 4 + 16)

    // ---- Mutation panel (right) ------------------------------------------
    const PX = 388
    ctx.textAlign = 'left'
    ctx.fillStyle = INK
    ctx.font = 'bold 11px monospace'
    ctx.fillText('Point mutation', PX, 52)
    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    ctx.fillText(`reference codon  ${REF} → ${AA[aaOf(REF)].three}`, PX, 68)

    // three base tiles
    const tileY = 82
    for (let i = 0; i < 3; i++) {
      const tx = PX + i * 44
      const changed = codon[i] !== REF[i]
      ctx.fillStyle = changed ? '#F59E0B22' : 'rgba(245,240,232,0.05)'
      ctx.fillRect(tx, tileY, 38, 40)
      ctx.strokeStyle = changed ? '#F59E0B' : FAINT
      ctx.lineWidth = changed ? 1.5 : 1
      ctx.strokeRect(tx, tileY, 38, 40)
      ctx.fillStyle = changed ? '#F59E0B' : INK
      ctx.font = 'bold 18px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(codon[i], tx + 19, tileY + 21)
      ctx.fillStyle = DIM
      ctx.font = '8px monospace'
      ctx.fillText(`pos ${i + 1}`, tx + 19, tileY + 33)
      ctx.textAlign = 'left'
    }

    // resulting amino acid
    const aa = aaOf(codon)
    const col = classColor(codon)
    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    ctx.fillText('produces', PX, 146)
    ctx.beginPath()
    ctx.fillStyle = col
    ctx.arc(PX + 12, 166, 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0F0D0A'
    ctx.font = 'bold 8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(aa === '*' ? '■' : AA[aa].three, PX + 12, 166)
    ctx.textAlign = 'left'
    ctx.fillStyle = col
    ctx.font = 'bold 12px monospace'
    ctx.fillText(aa === '*' ? 'Stop codon' : AA[aa].name, PX + 30, 166)

    // classification badge
    const kind = classify(codon)
    const kcol = KIND_COLOR[kind]
    const subs = [0, 1, 2].filter(i => codon[i] !== REF[i]).length
    ctx.fillStyle = `${kcol}1f`
    ctx.fillRect(PX, 188, 190, 30)
    ctx.strokeStyle = kcol
    ctx.lineWidth = 1.5
    ctx.strokeRect(PX, 188, 190, 30)
    ctx.fillStyle = kcol
    ctx.font = 'bold 14px monospace'
    ctx.fillText(KIND_TEXT[kind], PX + 10, 204)
    ctx.fillStyle = DIM
    ctx.font = '8px monospace'
    ctx.fillText(
      kind === 'reference' ? 'unmutated' : subs === 1 ? '1-base change' : `${subs}-base change`,
      PX + 118, 204,
    )

    // one-line meaning
    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    const msg =
      kind === 'silent' ? 'redundancy absorbed it — protein unchanged'
      : kind === 'missense' ? 'one amino acid swapped — may or may not matter'
      : kind === 'nonsense' ? 'premature stop — the protein is truncated'
      : 'change a base with the buttons below'
    ctx.fillText(msg, PX, 236)
  }, [codon, reveal])

  useEffect(() => { draw() }, [draw])

  const cycle = (pos: number) => {
    setCodon(prev => {
      const cur = ORDER.indexOf(prev[pos])
      const next = ORDER[(cur + 1) % 4]
      return prev.slice(0, pos) + next + prev.slice(pos + 1)
    })
  }

  const resetAll = () => {
    triggerReset()
    setCodon(REF)
    setReveal(1)
  }

  const presets: { label: string; codon: string; color: string }[] = [
    { label: 'silent', codon: 'GAG', color: KIND_COLOR.silent },
    { label: 'missense', codon: 'GGA', color: KIND_COLOR.missense },
    { label: 'nonsense', codon: 'UAA', color: KIND_COLOR.nonsense },
  ]

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The code & its mutations</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-2">
        {[0, 1, 2].map(p => (
          <button
            key={p}
            onClick={() => cycle(p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-lime text-bg-base text-xs font-medium hover:bg-accent-lime/90 transition-colors"
          >
            mutate base {p + 1}: <span className="font-mono font-bold">{codon[p]}</span>
          </button>
        ))}
        <span className="text-xs text-text-muted px-1">examples:</span>
        {presets.map(pr => (
          <button
            key={pr.label}
            onClick={() => setCodon(pr.codon)}
            className="px-2 py-1 rounded border text-xs font-medium transition-colors"
            style={{ color: pr.color, borderColor: `${pr.color}55`, background: `${pr.color}12` }}
          >
            {pr.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-text-secondary">
          codon <strong className="font-mono" style={{ color: '#A3E635' }}>{codon}</strong>
        </span>
      </div>
    </div>
  )
}
