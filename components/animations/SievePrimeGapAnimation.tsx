'use client'
import { useState, useMemo, useEffect } from 'react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'

type ViewMode = 'gaps' | 'density'

function computePrimes(limit: number): number[] {
  const sieve = new Array(limit + 1).fill(true)
  sieve[0] = sieve[1] = false
  for (let p = 2; p * p <= limit; p++) {
    if (sieve[p]) for (let m = p * p; m <= limit; m += p) sieve[m] = false
  }
  return Array.from({ length: limit - 1 }, (_, i) => i + 2).filter(n => sieve[n])
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  limit: { default: 150, min: 50, max: 500, step: 50 },
}

export function SievePrimeGapAnimation() {
  const { ref, triggered } = useAnimationTrigger()
  const { params, set } = useWidgetParams('sieve-prime-gap', SPEC)
  const { limit } = params
  const [view, setView] = useState<ViewMode>('gaps')
  const [showEstimate, setShowEstimate] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const primes = useMemo(() => computePrimes(limit), [limit])

  const gaps = useMemo(() => {
    const result: { from: number; to: number; gap: number }[] = []
    for (let i = 1; i < primes.length; i++) {
      result.push({ from: primes[i - 1], to: primes[i], gap: primes[i] - primes[i - 1] })
    }
    return result
  }, [primes])

  const maxGap = useMemo(() => Math.max(...gaps.map(g => g.gap), 1), [gaps])

  useEffect(() => {
    if (!triggered) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { setRevealed(true); return }
    const t = setTimeout(() => setRevealed(true), 50)
    return () => clearTimeout(t)
  }, [triggered])

  const gapColor = (gap: number) => {
    if (gap === 2) return '#A78BFA'
    if (gap <= 6) return '#F59E0B'
    return '#60A5FA'
  }

  const svgW = 500
  const svgH = 160
  const pad = { left: 40, right: 10, top: 10, bottom: 30 }
  const chartW = svgW - pad.left - pad.right
  const chartH = svgH - pad.top - pad.bottom

  const estimateCurvePoints = useMemo(() => {
    if (!showEstimate || view !== 'density') return ''
    return Array.from({ length: 50 }, (_, i) => {
      const x_val = ((i + 1) / 50) * limit
      const est = x_val > 1 ? x_val / Math.log(x_val) : 0
      const x = pad.left + (x_val / limit) * chartW
      const y = pad.top + chartH - (est / primes.length) * chartH
      return `${x},${y}`
    }).join(' ')
  }, [showEstimate, view, limit, primes.length, chartW, chartH, pad.left, pad.top])

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <span style={{ fontSize: 12 }}>◆</span> Interactive · Prime Distribution
        </span>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(['gaps', 'density'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 transition-colors capitalize ${view === v ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}
            >
              {v === 'gaps' ? 'Gap Chart' : 'Density Plot'}
            </button>
          ))}
        </div>
      </div>

      <div className="animation-canvas" style={{ minHeight: 220 }}>
        {view === 'gaps' ? (
          <div>
            <div className="flex items-end gap-[2px] overflow-x-auto pb-2" style={{ height: 140 }}>
              {gaps.map((g, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 rounded-t transition-all duration-500"
                  style={{
                    width: Math.max(4, Math.min(16, 400 / gaps.length)),
                    height: revealed ? `${(g.gap / maxGap) * 120}px` : '0px',
                    background: gapColor(g.gap),
                    transitionDelay: revealed ? `${Math.min(i * 4, 400)}ms` : '0ms',
                  }}
                  title={`Gap ${g.gap}: ${g.from} → ${g.to}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-text-muted flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#A78BFA' }} />
                Twin primes (gap=2)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#F59E0B' }} />
                Small gaps (≤6)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#60A5FA' }} />
                Larger gaps
              </span>
            </div>
          </div>
        ) : (
          <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ height: svgH }}>
            {/* Axes */}
            <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + chartH} stroke="rgba(255,245,235,0.15)" strokeWidth={1} />
            <line x1={pad.left} y1={pad.top + chartH} x2={pad.left + chartW} y2={pad.top + chartH} stroke="rgba(255,245,235,0.15)" strokeWidth={1} />
            <text x={pad.left + chartW / 2} y={svgH - 2} textAnchor="middle" fontSize={9} fill="rgba(245,240,232,0.4)">n (prime value)</text>
            <text x={10} y={pad.top + chartH / 2} textAnchor="middle" fontSize={9} fill="rgba(245,240,232,0.4)" transform={`rotate(-90 10 ${pad.top + chartH / 2})`}>π(n)</text>

            {/* Dots */}
            {revealed && primes.map((p, i) => (
              <circle
                key={p}
                cx={pad.left + (p / limit) * chartW}
                cy={pad.top + chartH - (i / primes.length) * chartH}
                r={1.5}
                fill="#F59E0B"
                opacity={0.6}
              />
            ))}

            {/* Estimate curve */}
            {showEstimate && estimateCurvePoints && (
              <polyline
                points={estimateCurvePoints}
                fill="none"
                stroke="#10B981"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}
          </svg>
        )}
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Limit:</span>
          <input type="range" min={SPEC.limit.min} max={SPEC.limit.max} step={SPEC.limit.step} value={limit}
            onChange={e => set('limit', +e.target.value)}
            className="w-24 accent-accent-gold"
          />
          <span>{limit}</span>
        </label>
        {view === 'density' && (
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={showEstimate}
              onChange={e => setShowEstimate(e.target.checked)}
              className="accent-accent-teal"
            />
            Show π(n) ≈ n/ln(n)
          </label>
        )}
        <span className="ml-auto text-xs text-text-secondary">
          {primes.length} primes · {gaps.filter(g => g.gap === 2).length} twin pairs
        </span>
      </div>
    </div>
  )
}
