'use client'
import { useState, useEffect, useRef } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

type Wave = { freq: number; amp: number }
const COLORS = ['#F59E0B', '#A78BFA', '#10B981']
const W = 600, H = 200

function drawWaves(canvas: HTMLCanvasElement, waves: Wave[], cursor: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, W, H)

  const getPoints = (waveIdx: number | null) => {
    return Array.from({ length: W }, (_, px) => {
      const t = (px / W) * 4 * Math.PI
      const y = waveIdx === null
        ? waves.reduce((sum, w) => sum + w.amp * Math.sin(w.freq * t), 0)
        : waves[waveIdx].amp * Math.sin(waves[waveIdx].freq * t)
      return H / 2 - y * (H / 3)
    })
  }

  waves.forEach((_, i) => {
    const pts = getPoints(i)
    ctx.beginPath()
    ctx.strokeStyle = COLORS[i] + '88'
    ctx.lineWidth = 1.5
    pts.forEach((y, x) => x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
    ctx.stroke()
  })

  const composite = getPoints(null)
  ctx.beginPath()
  ctx.strokeStyle = '#F5F0E8'
  ctx.lineWidth = 2
  composite.forEach((y, x) => x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
  ctx.stroke()

  if (cursor >= 0) {
    ctx.beginPath()
    ctx.strokeStyle = '#FB923C'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.moveTo(cursor, 0)
    ctx.lineTo(cursor, H)
    ctx.stroke()
    ctx.setLineDash([])
  }
}

export function FourierAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [waves, setWaves] = useState<Wave[]>([
    { freq: 1, amp: 0.8 },
    { freq: 3, amp: 0.4 },
    { freq: 5, amp: 0.2 },
  ])
  const [running, setRunning] = useState(false)
  const [cursor, setCursor] = useState(-1)

  useEffect(() => {
    if (canvasRef.current) drawWaves(canvasRef.current, waves, cursor)
  }, [waves, cursor])

  useEffect(() => {
    if (triggered && !running) {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setRunning(true)
    }
  }, [triggered]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running) return
    let x = 0
    const id = setInterval(() => {
      x = (x + 3) % W
      setCursor(x)
    }, 30)
    return () => clearInterval(id)
  }, [running])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setCursor(-1)
    setWaves([{ freq: 1, amp: 0.8 }, { freq: 3, amp: 0.4 }, { freq: 5, amp: 0.2 }])
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Fourier Transform</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: 280 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
        {/* Spectrum bars */}
        <div className="mt-4 flex items-end gap-3 h-16 px-2">
          {waves.map((w, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className="w-6 rounded-t transition-all duration-150"
                style={{ height: `${w.amp * 56}px`, background: COLORS[i] }}
              />
              <span className="text-[10px] text-text-muted">{w.freq}Hz</span>
            </div>
          ))}
        </div>
      </div>
      <div className="animation-controls flex-wrap">
        <button onClick={() => setRunning(r => !r)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex flex-col gap-2 w-full mt-2">
          {waves.map((w, i) => (
            <div key={i} className="flex items-center gap-3 text-xs text-text-muted">
              <span className="w-16" style={{ color: COLORS[i] }}>Wave {i + 1}</span>
              <span>Freq:</span>
              <input type="range" min={0.5} max={5} step={0.5} value={w.freq}
                onChange={e => setWaves(ws => ws.map((wv, j) => j === i ? { ...wv, freq: +e.target.value } : wv))}
                className="w-20 accent-accent-gold"
              />
              <span>{w.freq}Hz</span>
              <span className="ml-2">Amp:</span>
              <input type="range" min={0} max={1} step={0.1} value={w.amp}
                onChange={e => setWaves(ws => ws.map((wv, j) => j === i ? { ...wv, amp: +e.target.value } : wv))}
                className="w-20 accent-accent-gold"
              />
              <span>{w.amp.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
