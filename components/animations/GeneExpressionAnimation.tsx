'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

// One short gene, followed all the way from DNA to a peptide.
// Coding (sense) strand, its template complement, and the mRNA copy.
const CODING = 'ATGGCCTATGGTAAGTAA'
const TEMPLATE = 'TACCGGATACCATTCATT'
const MRNA = 'AUGGCCUAUGGUAAGUAA'
const NT = MRNA.length            // 18
const N_CODON = NT / 3            // 6

// Per-codon biology for this specific message. `anti` is the aligned tRNA
// anticodon (base-paired complement of each mRNA base).
type CodonInfo = { aa: string; name: string; anti: string; color: string; stop?: boolean }
const CODONS: CodonInfo[] = [
  { aa: 'Met', name: 'Methionine · start', anti: 'UAC', color: '#A3E635' },
  { aa: 'Ala', name: 'Alanine', anti: 'CGG', color: '#60A5FA' },
  { aa: 'Tyr', name: 'Tyrosine', anti: 'AUA', color: '#A78BFA' },
  { aa: 'Gly', name: 'Glycine', anti: 'CCA', color: '#F59E0B' },
  { aa: 'Lys', name: 'Lysine', anti: 'UUC', color: '#F472B6' },
  { aa: 'STOP', name: 'Stop — release', anti: '—', color: '#EF6F6F', stop: true },
]

const C_MRNA = '#A3E635'    // lime  — the RNA copy (primary series)
const C_POL = '#A78BFA'     // violet — RNA polymerase
const C_RIBO = '#60A5FA'    // blue  — ribosome
const C_TRNA = '#F59E0B'    // gold  — tRNA
const C_STOP = '#EF6F6F'    // red   — stop / release
const DIM = 'rgba(245,240,232,0.4)'
const FAINT = 'rgba(245,240,232,0.14)'

const NX0 = 60              // centre-x of nucleotide 0
const NW = 29               // px per nucleotide

const Y_CODE = 70           // coding DNA strand
const Y_TEMPL = 100         // template DNA strand
const Y_MRNA = 152          // mRNA
const Y_PEP = 96            // peptide beads (above their codon)

const TOTAL = 2 * N_CODON   // 6 transcription + 6 translation "events"
const SPEED = 0.028

function ntX(i: number): number {
  return NX0 + i * NW
}
function codonX(k: number): number {
  return NX0 + (3 * k + 1) * NW
}

// Rounded-rect path (avoids relying on CanvasRenderingContext2D.roundRect,
// which is not in every TS DOM lib version).
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function GeneExpressionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const [prog, setProg] = useState(0)
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setProg(TOTAL); return }
      setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '12px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    const transcribing = prog < N_CODON
    const tProg = Math.min(N_CODON, prog)                 // 0..6 codons transcribed
    const ntShown = tProg * 3                             // mRNA nt laid so far
    const rProg = Math.max(0, prog - N_CODON)             // 0..6 codons translated

    // ---- Phase banner -----------------------------------------------------
    ctx.textAlign = 'left'
    ctx.fillStyle = transcribing ? C_POL : C_RIBO
    ctx.font = 'bold 11px monospace'
    ctx.fillText(
      transcribing ? 'NUCLEUS · transcription' : 'CYTOPLASM · translation',
      14, 18,
    )
    ctx.font = '10px monospace'
    ctx.fillStyle = DIM
    ctx.fillText(
      transcribing ? 'DNA stays home — only the mRNA copy travels' : 'the mRNA was exported; the ribosome reads it',
      14, 32,
    )
    ctx.font = '12px monospace'
    ctx.textAlign = 'center'

    if (transcribing) {
      // ---- DNA duplex ------------------------------------------------------
      ctx.strokeStyle = FAINT
      ctx.lineWidth = 1
      for (let i = 0; i < NT; i++) {
        ctx.beginPath()
        ctx.moveTo(ntX(i), Y_CODE + 8)
        ctx.lineTo(ntX(i), Y_TEMPL - 8)
        ctx.stroke()
      }
      for (let i = 0; i < NT; i++) {
        ctx.fillStyle = 'rgba(245,240,232,0.7)'
        ctx.fillText(CODING[i], ntX(i), Y_CODE)
        ctx.fillStyle = DIM
        ctx.fillText(TEMPLATE[i], ntX(i), Y_TEMPL)
      }
      ctx.textAlign = 'left'
      ctx.fillStyle = DIM
      ctx.font = '10px monospace'
      ctx.fillText("5′  coding strand", ntX(0) - 6, Y_CODE - 20)
      ctx.fillText("3′  template strand (read by polymerase)", ntX(0) - 6, Y_TEMPL + 20)
      ctx.font = '12px monospace'
      ctx.textAlign = 'center'

      // ---- Growing mRNA ----------------------------------------------------
      const whole = Math.floor(ntShown + 1e-6)
      for (let i = 0; i < whole; i++) {
        ctx.fillStyle = C_MRNA
        ctx.fillText(MRNA[i], ntX(i), Y_MRNA)
        // pairing tick up to template
        ctx.strokeStyle = 'rgba(163,230,53,0.25)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(ntX(i), Y_TEMPL + 8)
        ctx.lineTo(ntX(i), Y_MRNA - 8)
        ctx.stroke()
      }
      ctx.textAlign = 'left'
      ctx.fillStyle = C_MRNA
      ctx.font = '10px monospace'
      ctx.fillText("5′  mRNA (uses U, not T)", ntX(0) - 6, Y_MRNA + 18)
      ctx.font = '12px monospace'
      ctx.textAlign = 'center'

      // ---- RNA polymerase --------------------------------------------------
      const polX = ntX(0) + ntShown * NW
      ctx.fillStyle = `${C_POL}22`
      ctx.strokeStyle = C_POL
      ctx.lineWidth = 1.5
      rrect(ctx, polX - 34, Y_CODE - 12, 68, Y_MRNA - Y_CODE + 24, 10)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = C_POL
      ctx.fillText('RNA', polX, Y_TEMPL + 30)
      ctx.fillText('polymerase', polX, Y_TEMPL + 44)
      // direction arrow
      ctx.strokeStyle = C_POL
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(polX + 40, Y_CODE - 20)
      ctx.lineTo(polX + 58, Y_CODE - 20)
      ctx.moveTo(polX + 52, Y_CODE - 24)
      ctx.lineTo(polX + 58, Y_CODE - 20)
      ctx.lineTo(polX + 52, Y_CODE - 16)
      ctx.stroke()
    } else {
      // ===== TRANSLATION ====================================================
      // Full mRNA with codon boxes.
      const cur = Math.min(N_CODON - 1, Math.floor(rProg))
      for (let k = 0; k < N_CODON; k++) {
        const done = k < Math.floor(rProg)
        const active = k === cur
        ctx.strokeStyle = active ? C_RIBO : done ? 'rgba(163,230,53,0.4)' : FAINT
        ctx.lineWidth = active ? 1.5 : 1
        const x0 = ntX(3 * k) - 13
        rrect(ctx, x0, Y_MRNA - 15, NW * 3 - 3, 30, 5)
        ctx.stroke()
      }
      for (let i = 0; i < NT; i++) {
        ctx.fillStyle = C_MRNA
        ctx.fillText(MRNA[i], ntX(i), Y_MRNA)
      }
      ctx.textAlign = 'left'
      ctx.fillStyle = C_MRNA
      ctx.font = '10px monospace'
      ctx.fillText("5′  mRNA", ntX(0) - 6, Y_MRNA + 22)
      ctx.font = '12px monospace'
      ctx.textAlign = 'center'

      // ---- Peptide chain already built (beads above their codons) ---------
      const placed = Math.min(5, Math.floor(rProg))    // codons 0..4 add a residue
      let prevX = 0, prevY = 0
      for (let k = 0; k < placed; k++) {
        const x = codonX(k)
        if (k > 0) {
          ctx.strokeStyle = 'rgba(245,240,232,0.45)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(prevX, prevY)
          ctx.lineTo(x, Y_PEP)
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.fillStyle = CODONS[k].color
        ctx.arc(x, Y_PEP, 11, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#0F0D0A'
        ctx.font = 'bold 9px monospace'
        ctx.fillText(CODONS[k].aa, x, Y_PEP)
        ctx.font = '12px monospace'
        prevX = x; prevY = Y_PEP
      }
      // N-terminus label
      if (placed > 0) {
        ctx.fillStyle = DIM
        ctx.font = '9px monospace'
        ctx.fillText('N', codonX(0) - 20, Y_PEP)
        ctx.font = '12px monospace'
      }

      // ---- Ribosome over the current codon (follows the read head) --------
      const rx = ntX(0) + (rProg * 3 + 1) * NW
      ctx.fillStyle = `${C_RIBO}22`
      ctx.strokeStyle = `${C_RIBO}88`
      ctx.lineWidth = 1.5
      rrect(ctx, rx - 62, Y_MRNA - 44, 124, 40, 14)   // large subunit
      ctx.fill(); ctx.stroke()
      ctx.fillStyle = `${C_RIBO}22`
      rrect(ctx, rx - 58, Y_MRNA + 6, 116, 34, 14)     // small subunit
      ctx.fill(); ctx.stroke()
      ctx.fillStyle = C_RIBO
      ctx.font = '10px monospace'
      ctx.fillText('ribosome', rx, Y_MRNA + 52)
      ctx.font = '12px monospace'

      // ---- Current codon: tRNA delivery or release ------------------------
      const info = CODONS[cur]
      const frac = rProg - Math.floor(rProg)            // 0..1 within this codon
      const cx = codonX(cur)
      if (!info.stop) {
        // tRNA rises from below carrying its amino acid, anticodon pairs the codon.
        const riseY = Y_MRNA + 96 - Math.min(1, frac * 1.6) * 78   // docks near mRNA
        // stem
        ctx.strokeStyle = C_TRNA
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(cx, Y_MRNA + 22)
        ctx.lineTo(cx, riseY + 14)
        ctx.stroke()
        // anticodon (paired under the codon)
        ctx.fillStyle = C_TRNA
        ctx.font = '10px monospace'
        ctx.fillText(info.anti, cx, Y_MRNA + 30)
        ctx.font = '12px monospace'
        // amino-acid cargo bead
        ctx.beginPath()
        ctx.fillStyle = info.color
        ctx.arc(cx, riseY, 11, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#0F0D0A'
        ctx.font = 'bold 9px monospace'
        ctx.fillText(info.aa, cx, riseY)
        ctx.font = '10px monospace'
        ctx.fillStyle = C_TRNA
        ctx.fillText('tRNA', cx + 26, riseY)
        ctx.font = '12px monospace'
      } else {
        // Release factor: no amino acid, chain lets go.
        ctx.beginPath()
        ctx.fillStyle = `${C_STOP}33`
        ctx.strokeStyle = C_STOP
        ctx.lineWidth = 1.5
        ctx.arc(cx, Y_MRNA + 40, 12, 0, Math.PI * 2)
        ctx.fill(); ctx.stroke()
        ctx.fillStyle = C_STOP
        ctx.font = '10px monospace'
        ctx.fillText('release', cx, Y_MRNA + 62)
        ctx.fillText('factor', cx, Y_MRNA + 74)
        ctx.font = '12px monospace'
      }

      // ---- Handoff to folding, once the chain is complete -----------------
      if (prog >= TOTAL) {
        const lastX = codonX(4)
        const fx = 552, fy = Y_PEP
        ctx.strokeStyle = C_MRNA
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(lastX + 14, fy)
        ctx.lineTo(fx - 26, fy)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(fx - 32, fy - 4)
        ctx.lineTo(fx - 26, fy)
        ctx.lineTo(fx - 32, fy + 4)
        ctx.stroke()
        // a little folded coil
        ctx.strokeStyle = C_MRNA
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(fx - 12, fy + 8)
        ctx.bezierCurveTo(fx + 8, fy + 2, fx - 8, fy - 12, fx + 6, fy - 8)
        ctx.bezierCurveTo(fx + 16, fy - 4, fx + 2, fy + 10, fx + 14, fy + 6)
        ctx.stroke()
        ctx.fillStyle = DIM
        ctx.font = '9px monospace'
        ctx.textAlign = 'right'
        ctx.fillText('folds → 3-D protein', fx + 20, fy + 20)
        ctx.textAlign = 'center'
        ctx.font = '12px monospace'
      }
    }
  }, [prog])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }
    const loop = () => {
      setProg(prev => {
        const next = prev + SPEED
        if (next >= TOTAL) { setRunning(false); return TOTAL }
        return next
      })
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  const step = () => {
    setRunning(false)
    setProg(prev => Math.min(TOTAL, Math.floor(prev + 1e-6) + 1))
  }

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setProg(0)
  }

  // Readout
  const transcribing = prog < N_CODON
  const codonsTranscribed = Math.min(N_CODON, Math.floor(prog + 1e-6))
  const readIdx = Math.min(N_CODON - 1, Math.max(0, Math.floor(prog - N_CODON)))
  const placed = Math.min(5, Math.max(0, Math.floor(prog - N_CODON)))
  const chain = CODONS.slice(0, placed).map(c => c.aa).join('-') || '—'
  const done = prog >= TOTAL

  const status = done
    ? 'Peptide complete — Met-Ala-Tyr-Gly-Lys, ready to fold'
    : transcribing
    ? `Transcribing — ${codonsTranscribed * 3}/${NT} bases copied into mRNA`
    : CODONS[readIdx].stop
    ? 'Stop codon reached — no tRNA fits, the chain is released'
    : `Translating codon ${readIdx + 1} — ${MRNA.slice(readIdx * 3, readIdx * 3 + 3)} → ${CODONS[readIdx].name}`
  const badge = done ? C_MRNA : transcribing ? C_POL : CODONS[readIdx].stop ? C_STOP : C_RIBO

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · DNA → mRNA → protein</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { if (done) setProg(0); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-lime text-bg-base text-xs font-medium hover:bg-accent-lime/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={step}
          disabled={done}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs font-medium hover:text-text-primary transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <ChevronRight size={12} /> Step
        </button>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={{ color: badge, borderColor: `${badge}30`, background: `${badge}10` }}
        >
          {status}
        </span>
        <span className="ml-auto text-xs text-text-secondary">
          chain: <strong className="font-mono" style={{ color: C_MRNA }}>{chain}</strong>
        </span>
      </div>
    </div>
  )
}
