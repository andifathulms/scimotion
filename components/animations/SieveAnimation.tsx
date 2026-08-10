'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

type Cell = { value: number; isPrime: boolean; isEliminated: boolean; isCurrent: boolean }

function buildCells(limit: number): Cell[] {
  return Array.from({ length: limit - 1 }, (_, i) => ({
    value: i + 2, isPrime: false, isEliminated: false, isCurrent: false,
  }))
}

export function SieveAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const [limit, setLimit] = useState(50)
  const [speed, setSpeed] = useState(200)
  const [cells, setCells] = useState<Cell[]>(() => buildCells(50))
  const [running, setRunning] = useState(false)
  const [primeCount, setPrimeCount] = useState(0)
  const stateRef = useRef({ primes: [] as number[], currentPrime: 2, multipleIdx: 2, cells: buildCells(50) })

  const resetAll = useCallback(() => {
    triggerReset()
    const fresh = buildCells(limit)
    stateRef.current = { primes: [], currentPrime: 2, multipleIdx: 2, cells: fresh }
    setCells(fresh)
    setRunning(false)
    setPrimeCount(0)
  }, [limit, triggerReset])

  useEffect(() => { resetAll() }, [limit]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (triggered && !running) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const c = buildCells(limit)
        const sieve = new Array(limit + 1).fill(true)
        for (let p = 2; p * p <= limit; p++) {
          if (sieve[p]) for (let m = p * p; m <= limit; m += p) sieve[m] = false
        }
        c.forEach(cell => {
          if (sieve[cell.value]) cell.isPrime = true
          else cell.isEliminated = true
        })
        setCells([...c])
        setPrimeCount(c.filter(cell => cell.isPrime).length)
        return
      }
      setRunning(true)
    }
  }, [triggered]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const s = stateRef.current
      let { currentPrime, multipleIdx, cells: currentCells } = s
      const maxMultiple = Math.floor(limit / currentPrime)

      if (currentPrime > Math.sqrt(limit) + 1) {
        const updated = currentCells.map(c => ({
          ...c,
          isCurrent: false,
          isPrime: !c.isEliminated && !c.isPrime ? true : c.isPrime,
        }))
        setCells(updated)
        setPrimeCount(updated.filter(c => c.isPrime).length)
        setRunning(false)
        return
      }

      currentCells = currentCells.map(c => ({
        ...c,
        isCurrent: c.value === currentPrime,
        isPrime: c.value === currentPrime ? true : c.isPrime,
      }))

      if (multipleIdx <= maxMultiple) {
        const target = currentPrime * multipleIdx
        currentCells = currentCells.map(c => ({
          ...c,
          isEliminated: c.value === target ? true : c.isEliminated,
        }))
        multipleIdx++
        stateRef.current = { ...s, multipleIdx, cells: currentCells }
      } else {
        let next = currentPrime + 1
        while (next <= limit && currentCells.find(c => c.value === next)?.isEliminated) next++
        currentPrime = next
        multipleIdx = 2
        stateRef.current = { ...s, currentPrime, multipleIdx, cells: currentCells }
      }

      setCells([...currentCells])
      setPrimeCount(currentCells.filter(c => c.isPrime).length)
    }, speed)
    return () => clearInterval(id)
  }, [running, speed, limit])

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Sieve of Eratosthenes
        </span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: 260 }}>
        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))' }}>
          {cells.map(cell => (
            <div
              key={cell.value}
              className={`flex items-center justify-center rounded text-xs font-mono h-8 transition-all duration-150 border ${
                cell.isCurrent
                  ? 'bg-accent-orange/20 border-accent-orange text-accent-orange font-bold'
                  : cell.isPrime
                  ? 'bg-accent-gold/15 border-accent-gold/40 text-accent-gold'
                  : cell.isEliminated
                  ? 'bg-transparent border-border text-text-muted line-through opacity-30'
                  : 'bg-bg-hover border-border text-text-secondary'
              }`}
            >
              {cell.value}
            </div>
          ))}
        </div>
      </div>
      <div className="animation-controls">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Limit:</span>
          <input type="range" min={20} max={150} value={limit} onChange={e => setLimit(+e.target.value)} className="w-20 accent-accent-gold" />
          <span>{limit}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Speed:</span>
          <input type="range" min={50} max={500} step={50} value={600 - speed} onChange={e => setSpeed(600 - +e.target.value)} className="w-20 accent-accent-gold" />
        </label>
        <span className="ml-auto text-xs text-text-secondary">Primes found: <strong className="text-accent-gold">{primeCount}</strong></span>
      </div>
    </div>
  )
}
