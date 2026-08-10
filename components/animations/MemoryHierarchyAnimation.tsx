'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 380

const BLUE = '#60A5FA'
const GREEN = '#10B981'
const RED = '#F87171'
const GOLD = '#F59E0B'
const INK = 'rgba(255,245,235,0.62)'
const FAINT = 'rgba(255,245,235,0.10)'

type Level = {
  name: string
  size: string
  time: number // access time in ns for this level
  timeLabel: string
  width: number // relative bar width 0..1 (grows down the stack)
}

// Each level is bigger and slower than the one above it.
const LEVELS: Level[] = [
  { name: 'Registers', size: '~1 KB', time: 0.3, timeLabel: '~0.3 ns', width: 0.16 },
  { name: 'L1 cache', size: '~64 KB', time: 1, timeLabel: '~1 ns', width: 0.28 },
  { name: 'L2 cache', size: '~512 KB', time: 4, timeLabel: '~4 ns', width: 0.42 },
  { name: 'L3 cache', size: '~8 MB', time: 15, timeLabel: '~15 ns', width: 0.58 },
  { name: 'RAM', size: '~16 GB', time: 100, timeLabel: '~100 ns', width: 0.78 },
  { name: 'Disk', size: '~1 TB', time: 10_000_000, timeLabel: '~10 ms', width: 1.0 },
]

// The "fast" level a request hits on a cache hit (L1), and the "slow" backing
// store it must reach on a miss (RAM). Used for the average-access-time readout.
const FAST = LEVELS[1]
const SLOW = LEVELS[4]

const PAD_T = 30
const PAD_B = 20
const ROW_GAP = 8
const ROW_H = (H - PAD_T - PAD_B - ROW_GAP * (LEVELS.length - 1)) / LEVELS.length

// Deterministic demo: a request that MISSES the fast levels and is served by RAM,
// then the block is pulled UP into the cache. Phases progress with `t` (0..1).
// 0.00–0.55  probe downward through levels (miss at each until SLOW)
// 0.55–0.72  found at RAM (slow) — flash
// 0.72–1.00  pull the block up into L1
const HIT_LEVEL = LEVELS.indexOf(SLOW)

function rowY(i: number): number {
  return PAD_T + i * (ROW_H + ROW_GAP)
}

function barGeom(level: Level): { x: number; w: number } {
  const maxW = W - 200
  const w = 40 + level.width * (maxW - 40)
  const x = 150
  return { x, w }
}

export function MemoryHierarchyAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(0)
  const startRef = useRef(0)
  const [running, setRunning] = useState(false)
  const [hitRate, setHitRate] = useState(0.95)
  const hitRateRef = useRef(0.95)

  const avg = hitRate * FAST.time + (1 - hitRate) * SLOW.time

  const draw = useCallback((t: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    // Title.
    ctx.fillStyle = BLUE
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('the memory hierarchy', 16, 18)
    ctx.fillStyle = INK
    ctx.font = '9px monospace'
    ctx.textAlign = 'right'
    ctx.fillText('smaller + faster ↑   larger + slower ↓', W - 16, 18)

    // Request-probe position: which level is currently being examined.
    // Probe travels from top to HIT_LEVEL over t in [0, 0.55].
    const probeT = Math.min(t / 0.55, 1)
    const probeLevel = probeT * HIT_LEVEL
    const found = t >= 0.55
    const pulling = t >= 0.72
    // Pull-up progress: block rises from HIT_LEVEL to L1 (index 1).
    const pullT = pulling ? Math.min((t - 0.72) / 0.28, 1) : 0
    const blockLevel = HIT_LEVEL + (1 - HIT_LEVEL) * pullT

    LEVELS.forEach((lvl, i) => {
      const y = rowY(i)
      const { x, w } = barGeom(lvl)

      const beingProbed = !found && Math.abs(i - probeLevel) < 0.5
      const isHit = found && i === HIT_LEVEL
      const nowCached = pulling && i === 1 && pullT > 0.6

      // Bar.
      let fill = FAINT
      let stroke = 'rgba(255,245,235,0.18)'
      if (beingProbed) {
        fill = 'rgba(248,113,113,0.16)'
        stroke = RED
      }
      if (isHit) {
        fill = 'rgba(245,158,11,0.18)'
        stroke = GOLD
      }
      if (nowCached) {
        fill = 'rgba(16,185,129,0.18)'
        stroke = GREEN
      }
      ctx.fillStyle = fill
      ctx.strokeStyle = stroke
      ctx.lineWidth = beingProbed || isHit || nowCached ? 2 : 1
      roundRect(ctx, x, y, w, ROW_H, 6)
      ctx.fill()
      ctx.stroke()

      // Left label: level name.
      ctx.textAlign = 'left'
      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = beingProbed ? RED : isHit ? GOLD : nowCached ? GREEN : 'rgba(255,245,235,0.85)'
      ctx.fillText(lvl.name, 16, y + ROW_H / 2 + 4)

      // In-bar: size.
      ctx.fillStyle = INK
      ctx.font = '9px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(lvl.size, x + 10, y + ROW_H / 2 + 3)

      // Right label: access time.
      ctx.textAlign = 'right'
      ctx.font = '10px monospace'
      ctx.fillStyle = beingProbed ? RED : 'rgba(255,245,235,0.7)'
      ctx.fillText(lvl.timeLabel, W - 16, y + ROW_H / 2 + 4)

      if (beingProbed) {
        ctx.textAlign = 'center'
        ctx.font = '8px monospace'
        ctx.fillStyle = RED
        ctx.fillText('miss', x + w / 2, y + ROW_H / 2 + 3)
      }
    })

    // The moving request block (a cache line) travelling with the probe / pull.
    const curLevel = pulling ? blockLevel : found ? HIT_LEVEL : probeLevel
    const y = rowY(Math.floor(curLevel)) + (curLevel - Math.floor(curLevel)) * (ROW_H + ROW_GAP)
    const dotColor = pulling ? GREEN : found ? GOLD : BLUE
    ctx.fillStyle = dotColor
    ctx.beginPath()
    ctx.arc(132, y + ROW_H / 2, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0F0D0A'
    ctx.font = 'bold 8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('req', 132, y + ROW_H / 2 + 3)

    // Status caption.
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = INK
    let caption = 'probing top-down for the requested block…'
    if (found && !pulling) caption = `miss all the way down — served by ${SLOW.name} (${SLOW.timeLabel})`
    else if (pulling && pullT < 1) caption = 'pulling the block UP into the cache (L1)'
    else if (pulling && pullT >= 1) caption = 'block now cached in L1 — next access is a fast hit'
    ctx.fillText(caption, 16, H - 6)
  }, [])

  const loop = useCallback((ts: number) => {
    if (!startRef.current) startRef.current = ts
    const elapsed = (ts - startRef.current) / 1000
    const dur = 4.5
    const t = Math.min(elapsed / dur, 1)
    tRef.current = t
    draw(t)
    if (t < 1) {
      rafRef.current = requestAnimationFrame(loop)
    } else {
      setRunning(false)
    }
  }, [draw])

  useEffect(() => {
    if (!running) return
    startRef.current = 0
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, loop])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        tRef.current = 1
        draw(1)
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    draw(tRef.current)
  }, [draw])

  const play = () => {
    cancelAnimationFrame(rafRef.current)
    tRef.current = 0
    startRef.current = 0
    setRunning(true)
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    tRef.current = 0
    startRef.current = 0
    triggerReset()
    draw(0)
  }

  const onHitRate = (v: number) => {
    hitRateRef.current = v
    setHitRate(v)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label" style={{ color: BLUE }}><Play size={13} /> Interactive · Memory Hierarchy</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: Memory Hierarchy. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>T_avg = h·T_fast + (1−h)·T_slow</span>
        <span>hit rate h = <strong style={{ color: BLUE }}>{(hitRate * 100).toFixed(0)}%</strong></span>
        <span>T_fast = {FAST.time} ns</span>
        <span>T_slow = {SLOW.time} ns</span>
        <span>avg latency = <strong style={{ color: avg < 20 ? GREEN : GOLD }}>{avg.toFixed(2)} ns</strong></span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={play}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base">
          <Play size={12} /> Play request
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Hit rate:</span>
          <input type="range" min={0} max={100} step={1} value={Math.round(hitRate * 100)}
            onChange={e => onHitRate(+e.target.value / 100)}
            className="w-28 accent-accent-blue" />
          <span className="text-text-secondary">{(hitRate * 100).toFixed(0)}%</span>
        </label>
      </div>
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
