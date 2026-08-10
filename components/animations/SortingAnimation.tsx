'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw, Shuffle } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

type Step = { type: 'compare' | 'swap'; indices: [number, number] }
type Algorithm = 'Bubble Sort' | 'Insertion Sort' | 'Merge Sort' | 'Quick Sort'

function randomArray() {
  return Array.from({ length: 20 }, () => Math.floor(Math.random() * 96) + 5)
}

function* bubbleSort(arr: number[]): Generator<Step> {
  const a = [...arr]
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < a.length - i - 1; j++) {
      yield { type: 'compare', indices: [j, j + 1] }
      if (a[j] > a[j + 1]) {
        yield { type: 'swap', indices: [j, j + 1] }
        ;[a[j], a[j + 1]] = [a[j + 1], a[j]]
      }
    }
  }
}

function* insertionSort(arr: number[]): Generator<Step> {
  const a = [...arr]
  for (let i = 1; i < a.length; i++) {
    let j = i
    while (j > 0) {
      yield { type: 'compare', indices: [j - 1, j] }
      if (a[j - 1] > a[j]) {
        yield { type: 'swap', indices: [j - 1, j] }
        ;[a[j - 1], a[j]] = [a[j], a[j - 1]]
        j--
      } else break
    }
  }
}

function* quickSort(arr: number[], lo = 0, hi = arr.length - 1): Generator<Step> {
  if (lo >= hi) return
  const pivot = arr[hi]
  let i = lo
  for (let j = lo; j < hi; j++) {
    yield { type: 'compare', indices: [j, hi] }
    if (arr[j] <= pivot) {
      if (i !== j) {
        yield { type: 'swap', indices: [i, j] }
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      i++
    }
  }
  yield { type: 'swap', indices: [i, hi] }
  ;[arr[i], arr[hi]] = [arr[hi], arr[i]]
  yield* quickSort(arr, lo, i - 1)
  yield* quickSort(arr, i + 1, hi)
}

function* mergeSort(arr: number[], lo = 0, hi = arr.length - 1): Generator<Step> {
  if (lo >= hi) return
  const mid = Math.floor((lo + hi) / 2)
  yield* mergeSort(arr, lo, mid)
  yield* mergeSort(arr, mid + 1, hi)
  const left = arr.slice(lo, mid + 1)
  const right = arr.slice(mid + 1, hi + 1)
  let i = 0, j = 0, k = lo
  while (i < left.length && j < right.length) {
    yield { type: 'compare', indices: [lo + i, mid + 1 + j] }
    if (left[i] <= right[j]) {
      arr[k++] = left[i++]
    } else {
      arr[k++] = right[j++]
      yield { type: 'swap', indices: [k - 1, k - 2] }
    }
  }
  while (i < left.length) arr[k++] = left[i++]
  while (j < right.length) arr[k++] = right[j++]
}

export function SortingAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const [arr, setArr] = useState<number[]>(() => randomArray())
  const [algorithm, setAlgorithm] = useState<Algorithm>('Bubble Sort')
  const [speed, setSpeed] = useState(100)
  const [running, setRunning] = useState(false)
  const [highlighted, setHighlighted] = useState<[number, number] | null>(null)
  const [sorted, setSorted] = useState<Set<number>>(new Set())
  const [comparisons, setComparisons] = useState(0)
  const [swaps, setSwaps] = useState(0)
  const genRef = useRef<Generator<Step> | null>(null)
  const arrRef = useRef([...arr])

  const makeGenerator = useCallback((a: number[]) => {
    const copy = [...a]
    arrRef.current = copy
    switch (algorithm) {
      case 'Bubble Sort': return bubbleSort(copy)
      case 'Insertion Sort': return insertionSort(copy)
      case 'Quick Sort': return quickSort(copy)
      case 'Merge Sort': return mergeSort(copy)
    }
  }, [algorithm])

  const resetAll = useCallback(() => {
    triggerReset()
    setRunning(false)
    setHighlighted(null)
    setSorted(new Set())
    setComparisons(0)
    setSwaps(0)
    genRef.current = null
  }, [triggerReset])

  const doShuffle = () => {
    resetAll()
    const fresh = randomArray()
    setArr(fresh)
    arrRef.current = [...fresh]
  }

  useEffect(() => {
    if (triggered && !running && !genRef.current) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const copy = [...arr].sort((a, b) => a - b)
        setArr(copy)
        return
      }
      genRef.current = makeGenerator(arr)
      setRunning(true)
    }
  }, [triggered]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running || !genRef.current) return
    const id = setInterval(() => {
      const result = genRef.current!.next()
      if (result.done) {
        setRunning(false)
        setHighlighted(null)
        setSorted(new Set(arrRef.current.map((_, i) => i)))
        return
      }
      const step = result.value
      setHighlighted(step.indices)
      if (step.type === 'compare') {
        setComparisons(c => c + 1)
      } else {
        setSwaps(s => s + 1)
        const [i, j] = step.indices
        ;[arrRef.current[i], arrRef.current[j]] = [arrRef.current[j], arrRef.current[i]]
        setArr([...arrRef.current])
      }
    }, speed)
    return () => clearInterval(id)
  }, [running, speed])

  const maxVal = Math.max(...arr)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Sorting Algorithms</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: 200 }}>
        <svg viewBox={`0 0 ${arr.length * 22} 150`} className="w-full" style={{ height: 150 }}>
          {arr.map((v, i) => {
            const h = (v / maxVal) * 140
            const isComparing = highlighted?.includes(i)
            const isSorted = sorted.has(i)
            return (
              <rect
                key={i}
                x={i * 22 + 1}
                y={150 - h}
                width={20}
                height={h}
                rx={2}
                fill={isComparing ? '#FB923C' : isSorted ? '#10B981' : '#F59E0B'}
                className="transition-all duration-75"
              />
            )
          })}
        </svg>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (!genRef.current) { genRef.current = makeGenerator(arr) }
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button onClick={doShuffle} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors">
          <Shuffle size={12} /> Shuffle
        </button>
        <select
          value={algorithm}
          onChange={e => { resetAll(); setAlgorithm(e.target.value as Algorithm) }}
          className="px-2 py-1.5 rounded-lg border border-border bg-bg-surface text-xs text-text-secondary"
        >
          {(['Bubble Sort', 'Insertion Sort', 'Merge Sort', 'Quick Sort'] as Algorithm[]).map(a => <option key={a}>{a}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Speed:</span>
          <input type="range" min={20} max={300} step={10} value={320 - speed} onChange={e => setSpeed(320 - +e.target.value)} className="w-20 accent-accent-gold" />
        </label>
        <WidgetStatus className="text-xs text-text-secondary">
          Comparisons: <strong className="text-accent-orange">{comparisons}</strong> · Swaps: <strong className="text-accent-teal">{swaps}</strong>
        </WidgetStatus>
      </div>
    </div>
  )
}
