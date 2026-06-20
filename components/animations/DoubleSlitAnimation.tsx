'use client'
import { useState, useEffect, useRef } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

type Dot = { y: number; opacity: number }
type Mode = 'particle' | 'wave'

function sampleInterference(): number {
  const k = 0.15
  while (true) {
    const y = Math.random() * 280 - 140
    const prob = Math.cos(k * y) ** 2
    if (Math.random() < prob) return y + 150
  }
}

export function DoubleSlitAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const [dots, setDots] = useState<Dot[]>([])
  const [mode, setMode] = useState<Mode>('wave')
  const [speed, setSpeed] = useState(5)
  const [running, setRunning] = useState(false)
  const dotsRef = useRef<Dot[]>([])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    dotsRef.current = []
    setDots([])
  }

  useEffect(() => {
    if (triggered && !running) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const result: Dot[] = Array.from({ length: 300 }, () => ({
          y: mode === 'wave' ? sampleInterference() : Math.random() * 280 + 10,
          opacity: 0.7,
        }))
        setDots(result)
        return
      }
      setRunning(true)
    }
  }, [triggered]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      for (let i = 0; i < speed; i++) {
        const y = mode === 'wave' ? sampleInterference() : Math.random() * 280 + 10
        dotsRef.current = [...dotsRef.current, { y, opacity: 0.7 }].slice(-400)
      }
      setDots([...dotsRef.current])
    }, 50)
    return () => clearInterval(id)
  }, [running, speed, mode])

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Double-Slit Experiment</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: 310 }}>
        <svg viewBox="0 0 500 300" className="w-full" style={{ height: 300, background: '#0F0D0A', borderRadius: 8 }}>
          {/* Particle gun */}
          <rect x={10} y={130} width={40} height={40} rx={4} fill="#F59E0B" opacity={0.6} />
          <text x={30} y={148} textAnchor="middle" fontSize={8} fill="#F5F0E8" opacity={0.7}>GUN</text>

          {/* Barrier */}
          <rect x={200} y={0} width={8} height={110} fill="#334155" />
          <rect x={200} y={130} width={8} height={40} fill="#334155" />
          <rect x={200} y={190} width={8} height={110} fill="#334155" />
          <text x={204} y={295} textAnchor="middle" fontSize={7} fill="#64748b">slits</text>

          {/* Detector screen */}
          <rect x={460} y={0} width={8} height={300} rx={2} fill="#334155" opacity={0.6} />

          {/* Dots */}
          {dots.map((d, i) => (
            <circle key={i} cx={450 + (i % 5)} cy={d.y} r={1.5} fill="#10B981" opacity={d.opacity} />
          ))}
        </svg>
      </div>
      <div className="animation-controls">
        <button onClick={() => setRunning(r => !r)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(['particle', 'wave'] as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); resetAll() }}
              className={`px-3 py-1.5 capitalize transition-colors ${mode === m ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Speed:</span>
          <input type="range" min={1} max={20} value={speed} onChange={e => setSpeed(+e.target.value)} className="w-20 accent-accent-gold" />
        </div>
        <span className="ml-auto text-xs text-text-secondary">Particles detected: <strong className="text-accent-teal">{dots.length}</strong></span>
      </div>
    </div>
  )
}
