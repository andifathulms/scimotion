'use client'
import { useState, useEffect } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

type Phase = 0 | 1 | 2 | 3 | 4 | 5

function buildECGSegment(phase: Phase): number[] {
  if (phase === 2) return [60, 60, 55, 65, 60, 60] // P wave
  if (phase === 4) return [60, 55, 80, 10, 90, 55, 60, 60, 68, 60] // QRS + T
  return [60]
}

export function CardiacAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const [phase, setPhase] = useState<Phase>(0)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(800)
  const [ecgPoints, setEcgPoints] = useState<number[]>([60])
  const [signalPos, setSignalPos] = useState<{ x: number; y: number } | null>(null)

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setPhase(0)
    setEcgPoints([60])
    setSignalPos(null)
  }

  useEffect(() => {
    if (triggered && !running) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setPhase(4)
        setEcgPoints([60, 60, 55, 65, 60, 60, 55, 80, 10, 90, 55, 60, 60, 68, 60])
        return
      }
      setRunning(true)
    }
  }, [triggered]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setPhase(p => {
        const next = ((p + 1) % 6) as Phase
        const seg = buildECGSegment(next)
        setEcgPoints(pts => {
          const updated = [...pts, ...seg]
          return updated.length > 120 ? updated.slice(-120) : updated
        })
        if (next === 1) setSignalPos({ x: 290, y: 45 })
        else if (next === 2) setSignalPos({ x: 180, y: 55 })
        else if (next === 3) setSignalPos({ x: 230, y: 90 })
        else if (next === 4) setSignalPos({ x: 180, y: 130 })
        else setSignalPos(null)
        return next
      })
    }, speed)
    return () => clearInterval(id)
  }, [running, speed])

  const saColor = phase === 1 ? '#FB923C' : '#64748b'
  const avColor = phase === 3 ? '#FB923C' : '#64748b'
  const laColor = phase === 2 ? '#F472B6' : '#1E1A14'
  const raColor = phase === 2 ? '#F472B6' : '#1E1A14'
  const lvColor = phase === 4 ? '#DC2626' : '#252018'
  const rvColor = phase === 4 ? '#DC2626' : '#252018'

  const ecgPath = ecgPoints.map((y, i) => `${i * (500 / 120)},${y}`).join(' ')

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Cardiac Electrical Signal</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: 380 }}>
        {/* Heart diagram */}
        <svg viewBox="0 0 400 200" className="w-full" style={{ height: 200 }}>
          {/* Right atrium */}
          <rect x={220} y={20} width={110} height={80} rx={16} fill={raColor} stroke="#334155" strokeWidth={1} />
          <text x={275} y={65} textAnchor="middle" fontSize={10} fill="#94a3b8">Right Atrium</text>
          {/* Left atrium */}
          <rect x={70} y={20} width={110} height={80} rx={16} fill={laColor} stroke="#334155" strokeWidth={1} />
          <text x={125} y={65} textAnchor="middle" fontSize={10} fill="#94a3b8">Left Atrium</text>
          {/* Right ventricle */}
          <rect x={220} y={115} width={110} height={80} rx={16} fill={rvColor} stroke="#334155" strokeWidth={1} />
          <text x={275} y={160} textAnchor="middle" fontSize={10} fill="#94a3b8">Right Ventricle</text>
          {/* Left ventricle */}
          <rect x={70} y={115} width={110} height={80} rx={16} fill={lvColor} stroke="#334155" strokeWidth={1} />
          <text x={125} y={160} textAnchor="middle" fontSize={10} fill="#94a3b8">Left Ventricle</text>
          {/* SA node */}
          <circle cx={290} cy={45} r={8} fill={saColor} />
          <text x={290} y={38} textAnchor="middle" fontSize={8} fill="#e2e8f0">SA</text>
          {/* AV node */}
          <circle cx={200} cy={110} r={8} fill={avColor} />
          <text x={200} y={127} textAnchor="middle" fontSize={8} fill="#e2e8f0">AV</text>
          {/* Signal dot */}
          {signalPos && (
            <circle cx={signalPos.x} cy={signalPos.y} r={5} fill="#FB923C" opacity={0.9} />
          )}
        </svg>
        {/* ECG trace */}
        <div className="mt-2 rounded-lg overflow-hidden" style={{ background: '#020c07' }}>
          <svg viewBox="0 0 500 100" className="w-full" style={{ height: 100 }}>
            <polyline points={ecgPath} fill="none" stroke="#10B981" strokeWidth={1.5} />
          </svg>
        </div>
      </div>
      <div className="animation-controls">
        <button onClick={() => setRunning(r => !r)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Speed:</span>
          <input type="range" min={300} max={1500} step={100} value={1800 - speed} onChange={e => setSpeed(1800 - +e.target.value)} className="w-20 accent-accent-gold" />
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary capitalize">
          Phase: <strong className="text-accent-teal">{['Idle', 'SA Node fires', 'Atria contract', 'AV delay', 'Ventricles contract', 'Reset'][phase]}</strong>
        </WidgetStatus>
      </div>
    </div>
  )
}
