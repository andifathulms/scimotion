'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const GREEN = '#10B981'

const DIM = 'rgba(245,240,232,0.42)'
const FAINT_LINE = 'rgba(255,245,235,0.12)'

type Bit = 0 | 1
type Mode = 'half' | 'full' | 'ripple'

const NBITS = 4

// One full-adder: sum = a XOR b XOR cin, carry-out = majority(a, b, cin).
function fullAdd(a: Bit, b: Bit, cin: Bit): { s: Bit; cout: Bit } {
  const s = ((a ^ b ^ cin) & 1) as Bit
  const cout = (((a & b) | (cin & (a ^ b))) & 1) as Bit
  return { s, cout }
}

function toBits(n: number): Bit[] {
  return Array.from({ length: NBITS }, (_, i) => ((n >> i) & 1) as Bit)
}
function fromBits(bits: Bit[]): number {
  return bits.reduce<number>((acc, bit, i) => acc + (bit << i), 0)
}

export function AdderAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<Mode>('half')
  // single-bit inputs for half / full adder
  const [a1, setA1] = useState<Bit>(1)
  const [b1, setB1] = useState<Bit>(1)
  const [cin1, setCin1] = useState<Bit>(0)
  // multi-bit inputs for the ripple adder
  const [aBits, setABits] = useState<Bit[]>(toBits(13))
  const [bBits, setBBits] = useState<Bit[]>(toBits(6))
  const [step, setStep] = useState(NBITS) // bits resolved so far, LSB->MSB
  const [playing, setPlaying] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setStep(NBITS); return }
      setMode('ripple')
      setStep(0)
      setPlaying(true)
    },
  })

  useEffect(() => {
    if (!playing || mode !== 'ripple') return
    const id = window.setInterval(() => {
      setStep(prev => {
        if (prev >= NBITS) { setPlaying(false); return prev }
        return prev + 1
      })
    }, 850)
    return () => window.clearInterval(id)
  }, [playing, mode])

  const drawBox = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, color: string, lit: boolean) => {
      ctx.fillStyle = lit ? `${color}22` : 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = lit ? color : FAINT_LINE
      ctx.lineWidth = lit ? 1.8 : 1
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, 6)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = lit ? color : DIM
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, x + w / 2, y + h / 2)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    },
    []
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    const wireCol = (v: Bit) => (v ? GREEN : DIM)
    const bitNode = (x: number, y: number, v: Bit, label: string) => {
      ctx.beginPath()
      ctx.arc(x, y, 12, 0, Math.PI * 2)
      ctx.fillStyle = v ? `${GREEN}33` : 'rgba(26,23,18,0.9)'
      ctx.fill()
      ctx.strokeStyle = wireCol(v)
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = wireCol(v)
      ctx.font = 'bold 12px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(v), x, y)
      ctx.fillStyle = DIM
      ctx.font = '10px monospace'
      ctx.fillText(label, x, y - 20)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }
    const wire = (x1: number, y1: number, x2: number, y2: number, v: Bit) => {
      ctx.strokeStyle = wireCol(v)
      ctx.lineWidth = v ? 2.5 : 1.5
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }

    // ---- heading ----
    ctx.textAlign = 'left'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = BLUE

    if (mode === 'half') {
      ctx.fillText('Half adder — two bits in, a sum bit and a carry bit out', 16, 24)
      ctx.font = '10px monospace'
      ctx.fillStyle = DIM
      ctx.fillText('S = A XOR B      C = A AND B', 16, 42)

      const s = (a1 ^ b1) as Bit
      const c = ((a1 & b1) & 1) as Bit

      bitNode(70, 120, a1, 'A')
      bitNode(70, 210, b1, 'B')

      // A feeds XOR and AND
      wire(82, 120, 210, 110, a1)
      wire(82, 120, 210, 200, a1)
      // B feeds XOR and AND
      wire(82, 210, 210, 130, b1)
      wire(82, 210, 210, 220, b1)

      drawBox(ctx, 210, 96, 90, 44, 'XOR', VIOLET, true)
      drawBox(ctx, 210, 186, 90, 44, 'AND', GOLD, true)

      wire(300, 118, 400, 118, s)
      wire(300, 208, 400, 208, c)
      bitNode(414, 118, s, 'SUM')
      bitNode(414, 208, c, 'CARRY')

      ctx.fillStyle = DIM
      ctx.font = '11px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`${a1} + ${b1}  =  carry ${c}, sum ${s}   (binary ${c}${s} = ${c * 2 + s})`, 16, 314)
    } else if (mode === 'full') {
      ctx.fillText('Full adder — adds a carry-in too, so adders can chain', 16, 24)
      ctx.font = '10px monospace'
      ctx.fillStyle = DIM
      ctx.fillText('two half adders + an OR: S = A XOR B XOR Cin', 16, 42)

      const s1 = (a1 ^ b1) as Bit
      const c1 = ((a1 & b1) & 1) as Bit
      const s = (s1 ^ cin1) as Bit
      const c2 = ((s1 & cin1) & 1) as Bit
      const cout = ((c1 | c2) & 1) as Bit

      bitNode(60, 90, a1, 'A')
      bitNode(60, 150, b1, 'B')
      bitNode(60, 250, cin1, 'Cin')

      wire(72, 90, 170, 108, a1)
      wire(72, 150, 170, 128, b1)
      drawBox(ctx, 170, 96, 74, 44, 'HA₁', BLUE, true)

      // s1 -> HA2, c1 -> OR
      wire(244, 108, 320, 108, s1)
      wire(72, 250, 320, 140, cin1)
      drawBox(ctx, 320, 96, 74, 44, 'HA₂', BLUE, true)

      wire(244, 128, 300, 230, c1)
      wire(357, 140, 340, 210, c2)
      drawBox(ctx, 300, 210, 64, 40, 'OR', GOLD, true)

      wire(394, 118, 470, 118, s)
      wire(364, 230, 470, 230, cout)
      bitNode(484, 118, s, 'SUM')
      bitNode(484, 230, cout, 'Cout')

      ctx.fillStyle = DIM
      ctx.font = '11px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`${a1} + ${b1} + ${cin1}  =  carry ${cout}, sum ${s}   (binary ${cout}${s} = ${cout * 2 + s})`, 16, 322)
    } else {
      // ---- ripple-carry adder ----
      ctx.fillText('4-bit ripple-carry adder — carries flow LSB → MSB', 16, 24)

      // compute per-bit results
      const carries: Bit[] = new Array(NBITS + 1).fill(0) as Bit[]
      const sums: Bit[] = new Array(NBITS).fill(0) as Bit[]
      for (let i = 0; i < NBITS; i++) {
        const { s, cout } = fullAdd(aBits[i], bBits[i], carries[i])
        sums[i] = s
        carries[i + 1] = cout
      }

      const colX = (i: number) => 120 + (NBITS - 1 - i) * 92 // i=3 leftmost (MSB)
      const rowA = 66
      const rowB = 92
      const faY = 150
      const faH = 52
      const faW = 58
      const rowS = 262

      // column labels
      ctx.font = '10px monospace'
      ctx.fillStyle = DIM
      ctx.textAlign = 'right'
      ctx.fillText('A', 40, rowA + 4)
      ctx.fillText('B', 40, rowB + 4)
      ctx.fillText('S', 40, rowS + 4)
      ctx.textAlign = 'left'

      for (let i = 0; i < NBITS; i++) {
        const x = colX(i)
        const resolved = i < step
        // a_i, b_i bits (top)
        ctx.font = '13px monospace'
        ctx.textAlign = 'center'
        ctx.fillStyle = aBits[i] ? GREEN : DIM
        ctx.fillText(String(aBits[i]), x, rowA + 4)
        ctx.fillStyle = bBits[i] ? GREEN : DIM
        ctx.fillText(String(bBits[i]), x, rowB + 4)
        // wires into FA
        wire(x, rowB + 8, x - 8, faY, aBits[i])
        wire(x, rowB + 8, x + 8, faY, bBits[i])
        // FA block
        drawBox(ctx, x - faW / 2, faY, faW, faH, `FA${i}`, resolved ? BLUE : VIOLET, resolved)
        // sum bit (bottom)
        wire(x, faY + faH, x, rowS - 12, resolved ? sums[i] : 0)
        ctx.font = 'bold 15px monospace'
        ctx.fillStyle = resolved ? (sums[i] ? GREEN : GOLD) : DIM
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(resolved ? String(sums[i]) : '?', x, rowS)
        ctx.textBaseline = 'alphabetic'
      }

      // carry arrows between blocks (carry-out of i -> carry-in of i+1, to the left)
      for (let i = 0; i < NBITS; i++) {
        const x = colX(i)
        const known = i < step
        const cv = carries[i + 1]
        if (i < NBITS - 1) {
          const fromX = x - faW / 2
          const toX = colX(i + 1) + faW / 2
          ctx.strokeStyle = known ? (cv ? GOLD : DIM) : FAINT_LINE
          ctx.lineWidth = known && cv ? 2.5 : 1.5
          ctx.beginPath()
          ctx.moveTo(fromX, faY + faH / 2)
          ctx.lineTo(toX, faY + faH / 2)
          ctx.stroke()
          // arrowhead pointing left
          ctx.fillStyle = known ? (cv ? GOLD : DIM) : FAINT_LINE
          ctx.beginPath()
          ctx.moveTo(toX, faY + faH / 2)
          ctx.lineTo(toX + 7, faY + faH / 2 - 4)
          ctx.lineTo(toX + 7, faY + faH / 2 + 4)
          ctx.closePath()
          ctx.fill()
          if (known) {
            ctx.font = 'bold 10px monospace'
            ctx.fillStyle = cv ? GOLD : DIM
            ctx.textAlign = 'center'
            ctx.fillText(String(cv), (fromX + toX) / 2, faY + faH / 2 - 8)
            ctx.textAlign = 'left'
          }
        }
      }

      // carry-in at LSB (fixed 0) and carry-out at MSB (overflow)
      const lsbX = colX(0)
      ctx.strokeStyle = DIM
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(lsbX + faW / 2 + 30, faY + faH / 2)
      ctx.lineTo(lsbX + faW / 2, faY + faH / 2)
      ctx.stroke()
      ctx.fillStyle = DIM
      ctx.font = '9px monospace'
      ctx.textAlign = 'left'
      ctx.fillText('Cin=0', lsbX + faW / 2 + 34, faY + faH / 2 + 3)

      const msbX = colX(NBITS - 1)
      const overflow = carries[NBITS]
      const overKnown = step >= NBITS
      wire(msbX - faW / 2, faY + faH / 2, msbX - faW / 2 - 26, faY + faH / 2, overKnown ? overflow : 0)
      ctx.font = '9px monospace'
      ctx.fillStyle = overKnown && overflow ? PINK : DIM
      ctx.textAlign = 'right'
      ctx.fillText(overKnown ? `carry-out ${overflow}` : 'carry-out ?', msbX - faW / 2 - 30, faY + faH / 2 + 3)
      ctx.textAlign = 'left'

      // decimal check at bottom
      const av = fromBits(aBits)
      const bv = fromBits(bBits)
      const total = step >= NBITS ? av + bv : null
      ctx.font = '11px monospace'
      ctx.fillStyle = step >= NBITS ? GREEN : GOLD
      ctx.textAlign = 'left'
      if (total !== null) {
        const binStr = (overflow ? '1' : '') + sums.slice().reverse().join('')
        ctx.fillText(`${av} + ${bv} = ${total}    binary ${binStr}`, 16, 320)
      } else {
        ctx.fillText(`adding bit ${step} of ${NBITS}… carry rippling left`, 16, 320)
      }
    }
  }, [mode, a1, b1, cin1, aBits, bBits, step, drawBox])

  useEffect(() => { draw() }, [draw])

  const reset = () => {
    triggerReset()
    setPlaying(false)
    setStep(NBITS)
  }

  const toggleABit = (i: number) => {
    setPlaying(false)
    setStep(NBITS)
    setABits(prev => prev.map((v, j) => (j === i ? ((v ? 0 : 1) as Bit) : v)))
  }
  const toggleBBit = (i: number) => {
    setPlaying(false)
    setStep(NBITS)
    setBBits(prev => prev.map((v, j) => (j === i ? ((v ? 0 : 1) as Bit) : v)))
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Building addition from gates</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="font-mono">view:</span>
          {(['half', 'full', 'ripple'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setPlaying(false); setStep(NBITS) }}
              className={`rounded border px-2 py-1 font-mono transition-colors ${mode === m ? 'border-accent-blue text-accent-blue' : 'border-white/10 text-text-muted hover:text-text-secondary'}`}
            >
              {m === 'half' ? 'half adder' : m === 'full' ? 'full adder' : 'ripple 4-bit'}
            </button>
          ))}
        </div>

        {mode === 'half' && (
          <div className="flex items-center gap-2 text-xs text-text-muted ml-auto">
            <button onClick={() => setA1(v => (v ? 0 : 1))} className="rounded border border-white/10 px-2 py-1 font-mono hover:text-text-secondary transition-colors">A = {a1}</button>
            <button onClick={() => setB1(v => (v ? 0 : 1))} className="rounded border border-white/10 px-2 py-1 font-mono hover:text-text-secondary transition-colors">B = {b1}</button>
          </div>
        )}

        {mode === 'full' && (
          <div className="flex items-center gap-2 text-xs text-text-muted ml-auto">
            <button onClick={() => setA1(v => (v ? 0 : 1))} className="rounded border border-white/10 px-2 py-1 font-mono hover:text-text-secondary transition-colors">A = {a1}</button>
            <button onClick={() => setB1(v => (v ? 0 : 1))} className="rounded border border-white/10 px-2 py-1 font-mono hover:text-text-secondary transition-colors">B = {b1}</button>
            <button onClick={() => setCin1(v => (v ? 0 : 1))} className="rounded border border-white/10 px-2 py-1 font-mono hover:text-text-secondary transition-colors">Cin = {cin1}</button>
          </div>
        )}

        {mode === 'ripple' && (
          <>
            <div className="flex items-center gap-3 text-xs text-text-muted ml-auto">
              <div className="flex items-center gap-1">
                <span className="font-mono w-4">A</span>
                {aBits.slice().reverse().map((v, ri) => {
                  const i = NBITS - 1 - ri
                  return (
                    <button key={i} onClick={() => toggleABit(i)} className={`w-6 rounded border px-0 py-1 font-mono transition-colors ${v ? 'border-accent-green text-accent-green' : 'border-white/10 text-text-muted hover:text-text-secondary'}`}>{v}</button>
                  )
                })}
              </div>
              <div className="flex items-center gap-1">
                <span className="font-mono w-4">B</span>
                {bBits.slice().reverse().map((v, ri) => {
                  const i = NBITS - 1 - ri
                  return (
                    <button key={i} onClick={() => toggleBBit(i)} className={`w-6 rounded border px-0 py-1 font-mono transition-colors ${v ? 'border-accent-green text-accent-green' : 'border-white/10 text-text-muted hover:text-text-secondary'}`}>{v}</button>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-muted w-full justify-end">
              <button
                onClick={() => { if (step >= NBITS) setStep(0); setPlaying(p => !p) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-blue text-bg-base text-xs font-medium hover:bg-accent-blue/90 transition-colors"
              >
                {playing ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Ripple</>}
              </button>
              <button
                onClick={() => { setPlaying(false); setStep(s => Math.min(NBITS, s + 1)) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors"
              >
                <ChevronRight size={12} /> Step
              </button>
              <span className="text-text-secondary font-medium">{step}/{NBITS}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
