'use client'
import { useEffect, useRef, useState, useMemo } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const BLUE = '#60A5FA'
const TEAL = '#10B981'
const GOLD = '#F59E0B'
const RED = '#F87171'

// Hamming(7,4): parity bits live at the power-of-two positions 1, 2, 4; the four
// data bits sit at 3, 5, 6, 7. Each parity check covers the positions whose index
// has the corresponding bit set, which is exactly the classic three-circle Venn
// layout. When one bit flips, the three checks' pass/fail pattern reads out as a
// binary number — the SYNDROME — that equals the position of the flipped bit.
const PARITY_POS = [1, 2, 4]

// which positions each parity check covers
const COVER: Record<number, number[]> = {
  1: [1, 3, 5, 7],
  2: [2, 3, 6, 7],
  4: [4, 5, 6, 7],
}

// Venn coordinates for each of the 7 positions (viewBox 0 0 480 380)
const COORD: Record<number, { x: number; y: number }> = {
  1: { x: 135, y: 140 },
  2: { x: 345, y: 140 },
  3: { x: 240, y: 120 },
  4: { x: 240, y: 330 },
  5: { x: 165, y: 235 },
  6: { x: 315, y: 235 },
  7: { x: 240, y: 200 },
}

const CIRCLES = [
  { check: 1, cx: 185, cy: 165, color: BLUE },
  { check: 2, cx: 295, cy: 165, color: TEAL },
  { check: 4, cx: 240, cy: 255, color: GOLD },
]
const R = 105

// encode 4 data bits at positions 3,5,6,7 into a valid 7-bit codeword (even parity)
function encode(d3: number, d5: number, d6: number, d7: number): number[] {
  const b = [0, 0, 0, 0, 0, 0, 0, 0] // index 1..7
  b[3] = d3; b[5] = d5; b[6] = d6; b[7] = d7
  b[1] = b[3] ^ b[5] ^ b[7]
  b[2] = b[3] ^ b[6] ^ b[7]
  b[4] = b[5] ^ b[6] ^ b[7]
  return b
}

const ENCODED = encode(1, 0, 1, 1) // -> 0110011

export function HammingCodeAnimation() {
  const [received, setReceived] = useState<number[]>(() => ENCODED.slice())
  const [reduced, setReduced] = useState(false)
  const [glow, setGlow] = useState(0)
  const rafRef = useRef<number | null>(null)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: r => {
      setReduced(r)
      // demonstrate by injecting a single-bit error at position 5
      setReceived(prev => {
        const next = prev.slice()
        next[5] = next[5] ^ 1
        return next
      })
    },
  })

  const { c1, c2, c4, syndrome, corrected, numFlips } = useMemo(() => {
    const _c1 = received[1] ^ received[3] ^ received[5] ^ received[7]
    const _c2 = received[2] ^ received[3] ^ received[6] ^ received[7]
    const _c4 = received[4] ^ received[5] ^ received[6] ^ received[7]
    const s = _c4 * 4 + _c2 * 2 + _c1
    const corr = received.slice()
    if (s !== 0) corr[s] = corr[s] ^ 1
    let flips = 0
    for (let i = 1; i <= 7; i++) if (received[i] !== ENCODED[i]) flips++
    return { c1: _c1, c2: _c2, c4: _c4, syndrome: s, corrected: corr, numFlips: flips }
  }, [received])

  const checks = [
    { check: 1, fail: c1 === 1, color: BLUE },
    { check: 2, fail: c2 === 1, color: TEAL },
    { check: 4, fail: c4 === 1, color: GOLD },
  ]

  // pulse the identified error bit
  useEffect(() => {
    if (reduced || syndrome === 0) {
      setGlow(0)
      return
    }
    const start = performance.now()
    const loop = (t: number) => {
      const phase = ((t - start) % 1200) / 1200
      setGlow((Math.sin(phase * Math.PI * 2) + 1) / 2)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [reduced, syndrome])

  const flip = (pos: number) => {
    setReceived(prev => {
      const next = prev.slice()
      next[pos] = next[pos] ^ 1
      return next
    })
  }

  const applyCorrection = () => setReceived(corrected.slice())

  const reset = () => {
    triggerReset()
    setReceived(ENCODED.slice())
    setGlow(0)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Hamming(7,4) syndrome decoding</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas" style={{ minHeight: 300 }}>
        <svg viewBox="0 0 480 380" className="w-full rounded-lg" style={{ background: '#0F0D0A', maxHeight: 380 }} role="img" aria-label="Hamming(7,4) Venn diagram of three parity checks over seven bit positions">
          {/* parity-check circles */}
          {CIRCLES.map(c => {
            const failed = c.check === 1 ? c1 === 1 : c.check === 2 ? c2 === 1 : c4 === 1
            return (
              <circle
                key={c.check}
                cx={c.cx}
                cy={c.cy}
                r={R}
                fill={`${c.color}0F`}
                stroke={failed ? RED : c.color}
                strokeWidth={failed ? 2.6 : 1.4}
                strokeDasharray={failed ? '6 4' : undefined}
              />
            )
          })}
          {/* circle labels */}
          <text x={70} y={90} fill={BLUE} fontSize={11} fontFamily="monospace" fontWeight="bold">check p1</text>
          <text x={360} y={90} fill={TEAL} fontSize={11} fontFamily="monospace" fontWeight="bold">check p2</text>
          <text x={200} y={368} fill={GOLD} fontSize={11} fontFamily="monospace" fontWeight="bold">check p4</text>

          {/* bit tokens */}
          {[1, 2, 3, 4, 5, 6, 7].map(pos => {
            const { x, y } = COORD[pos]
            const isParity = PARITY_POS.includes(pos)
            const isError = syndrome === pos
            const base = isParity ? GOLD : BLUE
            const stroke = isError ? RED : base
            return (
              <g key={pos} onClick={() => flip(pos)} style={{ cursor: 'pointer' }}>
                {isError && (
                  <circle cx={x} cy={y} r={26} fill="none" stroke={RED} strokeWidth={2} opacity={0.3 + 0.6 * glow} />
                )}
                <circle cx={x} cy={y} r={18} fill="#1A1712" stroke={stroke} strokeWidth={isError ? 2.6 : 1.8} />
                <text x={x} y={y} fill={received[pos] ? stroke : 'rgba(245,240,232,0.5)'} fontSize={15} fontWeight="bold" fontFamily="monospace" textAnchor="middle" dominantBaseline="central">
                  {received[pos]}
                </text>
                <text x={x} y={y - 24} fill="rgba(245,240,232,0.55)" fontSize={9} fontFamily="monospace" textAnchor="middle">
                  {isParity ? 'P' : 'D'}{pos}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>c4c2c1 = <span style={{ color: BLUE }}>{c4}{c2}{c1}</span></span>
        <span>syndrome = <span style={{ color: syndrome ? RED : TEAL }}>{syndrome}</span></span>
        <span>
          {syndrome === 0
            ? (numFlips === 0 ? 'no error detected' : 'no single-bit error found')
            : `bit ${syndrome} is flipped → correct it`}
        </span>
        {numFlips > 1 && (
          <span style={{ color: GOLD }}>({numFlips} bits flipped — one syndrome can only fix ONE)</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-mono">
        {checks.map(ch => (
          <span
            key={ch.check}
            className="px-2 py-1 rounded border"
            style={{ borderColor: ch.fail ? RED : ch.color, color: ch.fail ? RED : ch.color }}
          >
            p{ch.check} covers {COVER[ch.check].join(',')} : {ch.fail ? 'FAIL' : 'ok'}
          </span>
        ))}
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <span className="text-xs text-text-muted self-center">Click any bit above to inject noise.</span>
        <button
          onClick={applyCorrection}
          disabled={syndrome === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base ml-auto disabled:opacity-40"
        >
          <Play size={12} /> Correct bit {syndrome || '-'}
        </button>
      </div>
    </div>
  )
}
