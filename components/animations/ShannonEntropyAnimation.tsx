'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 320

const VIOLET = '#A78BFA'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const PINK = '#F472B6'
const GREEN = '#10B981'

const SYMBOLS = ['A', 'B', 'C', 'D'] as const
const BAR_COLORS = [VIOLET, GOLD, BLUE, PINK]

const DEFAULT_WEIGHTS = [25, 25, 25, 25]
const DEFAULT_BIAS = 0.5

// Left panel: probability bars
const BASE_Y = 196
const TOP_Y = 56
const BAR_W = 40
const BAR_GAP = 22
const BARS_X = 34

// Right panel: binary entropy curve
const CX0 = 356
const CX1 = 578
const CY0 = 60 // H = 1 bit
const CY1 = 196 // H = 0 bits

function normalize(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return weights.map(() => 1 / weights.length)
  return weights.map(w => w / total)
}

// Shannon entropy in bits: H = -sum p_i log2 p_i
function entropyBits(ps: number[]): number {
  return ps.reduce((acc, p) => (p > 0 ? acc - p * Math.log2(p) : acc), 0)
}

// Binary entropy H(p) = -p log2 p - (1-p) log2 (1-p)
function binaryEntropy(p: number): number {
  if (p <= 0 || p >= 1) return 0
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p)
}

export function ShannonEntropyAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const revealRef = useRef(0)
  const [phase, setPhase] = useState(0)
  const [weights, setWeights] = useState<number[]>(DEFAULT_WEIGHTS)
  const [bias, setBias] = useState(DEFAULT_BIAS)

  const probs = normalize(weights)
  const hNow = entropyBits(probs)
  const hMax = Math.log2(SYMBOLS.length)

  const setWeight = (i: number, v: number) => {
    setWeights(prev => prev.map((w, j) => (j === i ? v : w)))
  }

  const draw = useCallback((reveal: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const ps = normalize(weights)
    const hVal = entropyBits(ps)
    const maxH = Math.log2(SYMBOLS.length)
    const barSpan = BASE_Y - TOP_Y

    // ---- Left panel: the distribution -------------------------------
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('SYMBOL PROBABILITIES', 24, 26)

    // p = 1 reference line and the uniform reference line
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(24, BASE_Y + 0.5)
    ctx.lineTo(24 + SYMBOLS.length * (BAR_W + BAR_GAP), BASE_Y + 0.5)
    ctx.stroke()

    const uniformY = BASE_Y - (1 / SYMBOLS.length) * barSpan
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(255,245,235,0.16)'
    ctx.beginPath()
    ctx.moveTo(24, uniformY)
    ctx.lineTo(24 + SYMBOLS.length * (BAR_W + BAR_GAP), uniformY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.font = '8px monospace'
    ctx.fillText('uniform 1/4', 24, uniformY - 4)

    ps.forEach((p, i) => {
      const x = BARS_X + i * (BAR_W + BAR_GAP)
      const h = p * barSpan * reveal
      ctx.fillStyle = BAR_COLORS[i]
      ctx.globalAlpha = 0.85
      ctx.fillRect(x, BASE_Y - h, BAR_W, h)
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(255,245,235,0.18)'
      ctx.strokeRect(x + 0.5, BASE_Y - h + 0.5, BAR_W, h)

      ctx.textAlign = 'center'
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = BAR_COLORS[i]
      ctx.fillText(SYMBOLS[i], x + BAR_W / 2, BASE_Y + 16)

      ctx.font = '9px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.55)'
      ctx.fillText(p.toFixed(3), x + BAR_W / 2, BASE_Y + 30)

      // Self-information (surprise) of this symbol, in bits
      ctx.fillStyle = 'rgba(245,240,232,0.32)'
      const surprise = p > 0 ? -Math.log2(p) : Infinity
      ctx.fillText(
        Number.isFinite(surprise) ? `${surprise.toFixed(2)}b` : '∞',
        x + BAR_W / 2,
        BASE_Y + 43
      )
      ctx.textAlign = 'left'
    })

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.28)'
    ctx.fillText('surprise −log₂ p per symbol', 24, BASE_Y + 58)

    // Entropy readout with a filled meter against the 2-bit ceiling
    const meterX = 24
    const meterY = BASE_Y + 70
    const meterW = 268
    ctx.fillStyle = 'rgba(255,245,235,0.07)'
    ctx.fillRect(meterX, meterY, meterW, 10)
    ctx.fillStyle = GREEN
    ctx.fillRect(meterX, meterY, meterW * (hVal / maxH) * reveal, 10)
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.strokeRect(meterX + 0.5, meterY + 0.5, meterW, 10)

    ctx.font = 'bold 22px monospace'
    ctx.fillStyle = GREEN
    ctx.fillText(`H = ${hVal.toFixed(3)} bits`, meterX, meterY + 38)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText(`ceiling log₂ 4 = 2.000 bits`, meterX, meterY + 52)

    // ---- Right panel: binary entropy curve ---------------------------
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('ONE BIASED COIN: H(p)', 330, 26)

    const cx = (p: number) => CX0 + p * (CX1 - CX0)
    const cy = (h: number) => CY1 - h * (CY1 - CY0)

    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(CX0, CY0 - 10)
    ctx.lineTo(CX0, CY1)
    ctx.lineTo(CX1, CY1)
    ctx.stroke()

    // 1-bit ceiling
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(245,158,11,0.35)'
    ctx.beginPath()
    ctx.moveTo(CX0, cy(1))
    ctx.lineTo(CX1, cy(1))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,158,11,0.7)'
    ctx.font = '8px monospace'
    ctx.fillText('1 bit', CX1 - 26, cy(1) - 4)

    // The curve itself, drawn in progressively
    ctx.beginPath()
    const steps = 200
    const shown = Math.max(2, Math.round(steps * reveal))
    for (let i = 0; i <= shown; i++) {
      const p = i / steps
      const px = cx(p)
      const py = cy(binaryEntropy(p))
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.strokeStyle = GREEN
    ctx.lineWidth = 2
    ctx.stroke()

    // Marker at the current bias
    const mx = cx(bias)
    const my = cy(binaryEntropy(bias))
    ctx.setLineDash([2, 3])
    ctx.strokeStyle = 'rgba(255,245,235,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(mx, my)
    ctx.lineTo(mx, CY1)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = GOLD
    ctx.beginPath()
    ctx.arc(mx, my, 4.5, 0, Math.PI * 2)
    ctx.fill()

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.textAlign = 'center'
    ctx.fillText('0', CX0, CY1 + 14)
    ctx.fillText('0.5', cx(0.5), CY1 + 14)
    ctx.fillText('1', CX1, CY1 + 14)
    ctx.fillText('p (probability of heads)', (CX0 + CX1) / 2, CY1 + 28)
    ctx.textAlign = 'left'

    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText(`H(${bias.toFixed(2)}) = ${binaryEntropy(bias).toFixed(3)} bits`, 330, BASE_Y + 70)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('fair coin costs exactly 1 question;', 330, BASE_Y + 86)
    ctx.fillText('a loaded coin costs less than one.', 330, BASE_Y + 99)
  }, [weights, bias])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      revealRef.current = reduced ? 1 : 0
      setPhase(p => p + 1)
    },
  })

  useEffect(() => {
    const tick = () => {
      if (revealRef.current < 1) {
        revealRef.current = Math.min(1, revealRef.current + 0.03)
        draw(revealRef.current)
        rafRef.current = requestAnimationFrame(tick)
      } else {
        draw(1)
      }
    }
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, phase])

  const reset = () => {
    triggerReset()
    setWeights(DEFAULT_WEIGHTS)
    setBias(DEFAULT_BIAS)
    revealRef.current = 0
    setPhase(p => p + 1)
  }

  const accents = ['accent-accent-violet', 'accent-accent-gold', 'accent-accent-blue', 'accent-accent-pink']

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Entropy of a distribution</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Entropy of a distribution. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-x-4 gap-y-2">
        {SYMBOLS.map((s, i) => (
          <label key={s} className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="font-mono" style={{ color: BAR_COLORS[i] }}>{s}</span>
            <input
              type="range" min={0} max={100} step={1} value={weights[i]}
              onChange={e => setWeight(i, +e.target.value)}
              className={`w-16 ${accents[i]}`}
            />
            <span className="font-mono text-text-secondary w-9">{probs[i].toFixed(2)}</span>
          </label>
        ))}
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Coin bias p</span>
          <input
            type="range" min={0.01} max={0.99} step={0.01} value={bias}
            onChange={e => setBias(+e.target.value)}
            className="w-24 accent-accent-teal"
          />
          <span className="font-mono text-text-secondary w-9">{bias.toFixed(2)}</span>
        </label>
        <WidgetStatus className="ml-auto text-xs font-mono" style={{ color: hNow > hMax - 0.02 ? GREEN : VIOLET }}>
          H = {hNow.toFixed(3)} / {hMax.toFixed(0)} bits
        </WidgetStatus>
      </div>
    </div>
  )
}
