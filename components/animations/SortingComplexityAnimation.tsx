'use client'
import { useState, useRef, useCallback } from 'react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const SIZES = [10, 20, 40, 80, 160]

const ALGO_COLORS: Record<string, string> = {
  'Bubble Sort': '#60A5FA',
  'Insertion Sort': '#A78BFA',
  'Merge Sort': '#10B981',
  'Quick Sort': '#F59E0B',
}

function benchmarkBubble(arr: number[]): number {
  const a = [...arr]; let c = 0
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < a.length - i - 1; j++) { c++; if (a[j] > a[j+1]) [a[j], a[j+1]] = [a[j+1], a[j]] }
  return c
}

function benchmarkInsertion(arr: number[]): number {
  const a = [...arr]; let c = 0
  for (let i = 1; i < a.length; i++) {
    let j = i
    while (j > 0 && (c++, a[j-1] > a[j])) { [a[j-1], a[j]] = [a[j], a[j-1]]; j-- }
  }
  return c
}

function benchmarkMerge(arr: number[]): number {
  let c = 0
  function merge(a: number[], lo: number, hi: number) {
    if (lo >= hi) return
    const mid = Math.floor((lo + hi) / 2)
    merge(a, lo, mid); merge(a, mid+1, hi)
    const left = a.slice(lo, mid+1), right = a.slice(mid+1, hi+1)
    let i = 0, j = 0, k = lo
    while (i < left.length && j < right.length) { c++; a[k++] = left[i] <= right[j] ? left[i++] : right[j++] }
    while (i < left.length) a[k++] = left[i++]
    while (j < right.length) a[k++] = right[j++]
  }
  const a = [...arr]; merge(a, 0, a.length - 1); return c
}

function benchmarkQuick(arr: number[]): number {
  let c = 0
  function quick(a: number[], lo: number, hi: number) {
    if (lo >= hi) return
    const pivot = a[hi]; let i = lo
    for (let j = lo; j < hi; j++) { c++; if (a[j] <= pivot) { [a[i], a[j]] = [a[j], a[i]]; i++ } }
    ;[a[i], a[hi]] = [a[hi], a[i]]
    quick(a, lo, i-1); quick(a, i+1, hi)
  }
  const a = [...arr]; quick(a, 0, a.length - 1); return c
}

type Results = Record<string, number[]>

export function SortingComplexityAnimation() {
  const { ref } = useAnimationTrigger()
  const [results, setResults] = useState<Results | null>(null)
  const [visible, setVisible] = useState<Set<string>>(new Set(Object.keys(ALGO_COLORS)))
  const [showTheory, setShowTheory] = useState(false)
  const [ran, setRan] = useState(false)
  const animRef = useRef<number>(0)

  const runBenchmark = useCallback(() => {
    const res: Results = { 'Bubble Sort': [], 'Insertion Sort': [], 'Merge Sort': [], 'Quick Sort': [] }
    for (const n of SIZES) {
      const arr = Array.from({ length: n }, () => Math.floor(Math.random() * n * 10))
      res['Bubble Sort'].push(benchmarkBubble(arr))
      res['Insertion Sort'].push(benchmarkInsertion(arr))
      res['Merge Sort'].push(benchmarkMerge(arr))
      res['Quick Sort'].push(benchmarkQuick(arr))
    }
    setResults(res)
    setRan(true)
  }, [])

  const toggleAlgo = (name: string) => {
    setVisible(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const SVG_W = 500
  const SVG_H = 200
  const pad = { left: 48, right: 16, top: 10, bottom: 36 }
  const chartW = SVG_W - pad.left - pad.right
  const chartH = SVG_H - pad.top - pad.bottom

  const allValues = results
    ? Object.values(results).flat()
    : []
  const maxVal = allValues.length ? Math.max(...allValues) : 1

  const toX = (i: number) => pad.left + (i / (SIZES.length - 1)) * chartW
  const toY = (v: number) => pad.top + chartH - (v / maxVal) * chartH

  const theoryBubble = SIZES.map(n => (n * n) / 2)
  const theoryMerge = SIZES.map(n => n * Math.log2(n))
  const theoryMax = Math.max(...theoryBubble, ...theoryMerge)
  const theoryToY = (v: number) => pad.top + chartH - (v / theoryMax) * chartH

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <span style={{ fontSize: 12 }}>◆</span> Interactive · Algorithm Complexity Benchmark
        </span>
      </div>
      <div className="animation-canvas" style={{ minHeight: SVG_H + 20 }}>
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full" style={{ height: SVG_H }}>
          {/* Axes */}
          <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + chartH} stroke="rgba(255,245,235,0.12)" strokeWidth={1} />
          <line x1={pad.left} y1={pad.top + chartH} x2={pad.left + chartW} y2={pad.top + chartH} stroke="rgba(255,245,235,0.12)" strokeWidth={1} />

          {/* X axis labels */}
          {SIZES.map((n, i) => (
            <text key={n} x={toX(i)} y={pad.top + chartH + 16} textAnchor="middle" fontSize={9} fill="rgba(245,240,232,0.4)">
              {n}
            </text>
          ))}
          <text x={pad.left + chartW / 2} y={SVG_H - 2} textAnchor="middle" fontSize={9} fill="rgba(245,240,232,0.4)">
            Array size (n)
          </text>
          <text x={12} y={pad.top + chartH / 2} textAnchor="middle" fontSize={9} fill="rgba(245,240,232,0.4)" transform={`rotate(-90 12 ${pad.top + chartH / 2})`}>
            Comparisons
          </text>

          {/* Theory curves */}
          {showTheory && results && (
            <>
              <polyline
                points={SIZES.map((_, i) => `${toX(i)},${pad.top + chartH - (theoryBubble[i] / maxVal) * chartH}`).join(' ')}
                fill="none" stroke="rgba(96,165,250,0.3)" strokeWidth={1} strokeDasharray="5 3"
              />
              <polyline
                points={SIZES.map((_, i) => `${toX(i)},${pad.top + chartH - (theoryMerge[i] / maxVal) * chartH}`).join(' ')}
                fill="none" stroke="rgba(16,185,129,0.3)" strokeWidth={1} strokeDasharray="5 3"
              />
            </>
          )}

          {/* Result lines */}
          {results && Object.entries(results).map(([name, vals]) =>
            visible.has(name) ? (
              <g key={name}>
                <polyline
                  points={vals.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')}
                  fill="none"
                  stroke={ALGO_COLORS[name]}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {vals.map((v, i) => (
                  <circle key={i} cx={toX(i)} cy={toY(v)} r={3} fill={ALGO_COLORS[name]} />
                ))}
              </g>
            ) : null
          )}

          {/* Empty state */}
          {!results && (
            <text x={SVG_W / 2} y={SVG_H / 2} textAnchor="middle" fontSize={12} fill="rgba(245,240,232,0.3)">
              Press &quot;Run benchmark&quot; to compare
            </text>
          )}
        </svg>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={runBenchmark}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {ran ? '↺ Re-run' : '▶ Run benchmark'}
        </button>

        <div className="flex flex-wrap gap-2">
          {Object.entries(ALGO_COLORS).map(([name, color]) => (
            <button
              key={name}
              onClick={() => toggleAlgo(name)}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-opacity border"
              style={{
                color,
                borderColor: `${color}40`,
                background: visible.has(name) ? `${color}15` : 'transparent',
                opacity: visible.has(name) ? 1 : 0.4,
              }}
            >
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
              {name}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={showTheory}
            onChange={e => setShowTheory(e.target.checked)}
            className="accent-accent-gold"
          />
          Theoretical curves
        </label>
      </div>
    </div>
  )
}
