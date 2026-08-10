'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 336

const RED = '#F87171'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const CYAN = '#22D3EE'

type Tier = { name: string; refer: string }
type NameSpec = { tiers: Tier[]; ip: string; ttl: number }

const NAMES: Record<string, NameSpec> = {
  'www.example.com': {
    tiers: [
      { name: 'Root  ( . )', refer: 'ask the .com servers' },
      { name: '.com TLD server', refer: 'ask example.com nameservers' },
      { name: 'example.com nameserver', refer: '' },
    ],
    ip: '93.184.216.34',
    ttl: 3600,
  },
  'lapor.go.id': {
    tiers: [
      { name: 'Root  ( . )', refer: 'ask the .id servers' },
      { name: '.id TLD server', refer: 'ask go.id nameservers' },
      { name: 'go.id nameserver', refer: '' },
    ],
    ip: '103.94.221.10',
    ttl: 1800,
  },
}

type Step =
  | { kind: 'query'; tier: number }
  | { kind: 'refer'; tier: number }
  | { kind: 'answer'; tier: number }
  | { kind: 'cache' }
  | { kind: 'again-query' }
  | { kind: 'hit' }

function buildSteps(spec: NameSpec): Step[] {
  const steps: Step[] = []
  const last = spec.tiers.length - 1
  for (let i = 0; i <= last; i++) {
    steps.push({ kind: 'query', tier: i })
    steps.push(i < last ? { kind: 'refer', tier: i } : { kind: 'answer', tier: i })
  }
  steps.push({ kind: 'cache' })
  steps.push({ kind: 'again-query' })
  steps.push({ kind: 'hit' })
  return steps
}

// Resolver + cache on the left, the three server tiers stacked on the right.
const RES = { x: 26, y: 122, w: 132, h: 58 }
const CACHE = { x: 26, y: 214, w: 132, h: 54 }
const SRV = { x: 402, w: 176, h: 60 }
const SRV_Y = [22, 118, 214]

function tierColor(i: number): string {
  return [BLUE, VIOLET, GREEN][i] ?? BLUE
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  dashed: boolean
) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2
  ctx.setLineDash(dashed ? [5, 4] : [])
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.setLineDash([])
  const ang = Math.atan2(y2 - y1, x2 - x1)
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - 9 * Math.cos(ang - 0.4), y2 - 9 * Math.sin(ang - 0.4))
  ctx.lineTo(x2 - 9 * Math.cos(ang + 0.4), y2 - 9 * Math.sin(ang + 0.4))
  ctx.closePath()
  ctx.fill()
}

export function DNSResolutionAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setIdx(totalRef.current - 1)
        return
      }
      setIdx(-1)
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [name, setName] = useState<keyof typeof NAMES>('www.example.com')
  const [idx, setIdx] = useState(-1)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(720)

  const spec = NAMES[name]
  const steps = useMemo(() => buildSteps(spec), [spec])
  const totalRef = useRef(steps.length)
  useEffect(() => {
    totalRef.current = steps.length
  }, [steps.length])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const cur = idx >= 0 && idx < steps.length ? steps[idx] : null
    const cached =
      cur !== null &&
      (cur.kind === 'cache' || cur.kind === 'again-query' || cur.kind === 'hit')
    const secondPhase = cur !== null && (cur.kind === 'again-query' || cur.kind === 'hit')

    // how far down the tree we have walked so far
    let reached = -1
    for (let k = 0; k <= idx && k < steps.length; k++) {
      const s = steps[k]
      if (s.kind === 'query' || s.kind === 'refer' || s.kind === 'answer') reached = Math.max(reached, s.tier)
    }
    const answered = steps.slice(0, idx + 1).some(s => s.kind === 'answer')

    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, r)
    }

    // ---- header ----
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = RED
    ctx.fillText(`resolve  ${name}`, 20, 18)

    // ---- resolver box ----
    const resActive =
      cur !== null && (cur.kind === 'query' || cur.kind === 'refer' || cur.kind === 'again-query' || cur.kind === 'hit')
    roundRect(RES.x, RES.y, RES.w, RES.h, 8)
    ctx.fillStyle = resActive ? `${RED}22` : 'rgba(255,255,255,0.03)'
    ctx.strokeStyle = resActive ? RED : 'rgba(255,245,235,0.18)'
    ctx.lineWidth = resActive ? 1.8 : 1
    ctx.fill()
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.fillStyle = RED
    ctx.font = 'bold 12px monospace'
    ctx.fillText('recursive', RES.x + RES.w / 2, RES.y + 24)
    ctx.fillText('resolver', RES.x + RES.w / 2, RES.y + 40)

    // ---- cache box ----
    roundRect(CACHE.x, CACHE.y, CACHE.w, CACHE.h, 8)
    ctx.fillStyle = cached ? `${CYAN}1F` : 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = cached ? CYAN : 'rgba(255,245,235,0.12)'
    ctx.lineWidth = secondPhase ? 1.8 : 1
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = cached ? CYAN : 'rgba(245,240,232,0.35)'
    ctx.font = '11px monospace'
    ctx.fillText('cache', CACHE.x + CACHE.w / 2, CACHE.y + 20)
    if (cached) {
      ctx.font = '10px monospace'
      ctx.fillText(`${name.split('.')[0]}… → ${spec.ip}`, CACHE.x + CACHE.w / 2, CACHE.y + 36)
      ctx.fillStyle = GOLD
      ctx.fillText(`TTL ${spec.ttl}s`, CACHE.x + CACHE.w / 2, CACHE.y + 49)
    } else {
      ctx.font = '9px monospace'
      ctx.fillText('(empty)', CACHE.x + CACHE.w / 2, CACHE.y + 36)
    }

    // link resolver → cache
    ctx.strokeStyle = cached ? `${CYAN}66` : 'rgba(255,245,235,0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(RES.x + RES.w / 2, RES.y + RES.h)
    ctx.lineTo(CACHE.x + CACHE.w / 2, CACHE.y)
    ctx.stroke()

    // ---- server tiers ----
    for (let i = 0; i < spec.tiers.length; i++) {
      const y = SRV_Y[i]
      const col = tierColor(i)
      const visited = reached >= i
      const active =
        cur !== null &&
        (cur.kind === 'query' || cur.kind === 'refer' || cur.kind === 'answer') &&
        cur.tier === i
      roundRect(SRV.x, y, SRV.w, SRV.h, 8)
      ctx.fillStyle = active ? `${col}2A` : visited ? `${col}14` : 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = active ? col : visited ? `${col}88` : 'rgba(255,245,235,0.14)'
      ctx.lineWidth = active ? 1.8 : 1
      ctx.fill()
      ctx.stroke()

      ctx.textAlign = 'left'
      ctx.fillStyle = visited || active ? col : 'rgba(245,240,232,0.5)'
      ctx.font = 'bold 11px monospace'
      ctx.fillText(spec.tiers[i].name, SRV.x + 12, y + 22)

      ctx.font = '10px monospace'
      if (i < spec.tiers.length - 1) {
        ctx.fillStyle = active || visited ? GOLD : 'rgba(245,240,232,0.3)'
        ctx.fillText(`↳ ${spec.tiers[i].refer}`, SRV.x + 12, y + 42)
      } else {
        ctx.fillStyle = answered ? GREEN : 'rgba(245,240,232,0.3)'
        ctx.fillText(`↳ ${spec.ip}  (authoritative)`, SRV.x + 12, y + 42)
      }
    }

    // ---- the live arrow for the current step ----
    const resRight = RES.x + RES.w
    const resCy = RES.y + RES.h / 2
    if (cur?.kind === 'query') {
      const y = SRV_Y[cur.tier] + SRV.h / 2
      drawArrow(ctx, resRight + 4, resCy, SRV.x - 4, y, RED, false)
    } else if (cur?.kind === 'refer') {
      const y = SRV_Y[cur.tier] + SRV.h / 2
      drawArrow(ctx, SRV.x - 4, y, resRight + 4, resCy, GOLD, true)
    } else if (cur?.kind === 'answer') {
      const y = SRV_Y[cur.tier] + SRV.h / 2
      drawArrow(ctx, SRV.x - 4, y, resRight + 4, resCy, GREEN, false)
    } else if (cur?.kind === 'again-query' || cur?.kind === 'hit') {
      // resolver ↔ cache, no server touched
      drawArrow(ctx, RES.x + RES.w / 2 - 18, RES.y + RES.h, CACHE.x + CACHE.w / 2 - 18, CACHE.y, CYAN, false)
      drawArrow(ctx, CACHE.x + CACHE.w / 2 + 18, CACHE.y, RES.x + RES.w / 2 + 18, RES.y + RES.h, GREEN, false)
    }

    // ---- status line ----
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    const sy = H - 12
    const set = (color: string, msg: string) => {
      ctx.fillStyle = color
      ctx.fillText(msg, 20, sy)
    }
    if (cur?.kind === 'query') set(RED, `resolver asks ${spec.tiers[cur.tier].name.trim()}: where is ${name}?`)
    else if (cur?.kind === 'refer') set(GOLD, `referral — "${spec.tiers[cur.tier].refer}". One step further down the tree.`)
    else if (cur?.kind === 'answer') set(GREEN, `authoritative answer: ${name} → ${spec.ip}. The walk is done.`)
    else if (cur?.kind === 'cache') set(CYAN, `resolver caches ${name} → ${spec.ip} for ${spec.ttl}s (its TTL).`)
    else if (cur?.kind === 'again-query') set(CYAN, `same name, second lookup — check the cache first…`)
    else if (cur?.kind === 'hit') set(GREEN, `cache hit — ${spec.ip} returned instantly. No servers contacted.`)
    else set('rgba(245,240,232,0.4)', 'Press Play — the resolver walks root → TLD → authoritative, then caches the answer.')
  }, [idx, steps, spec, name])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setIdx(i => {
        if (i >= steps.length - 1) {
          setRunning(false)
          return i
        }
        return i + 1
      })
    }, speed)
    return () => clearInterval(id)
  }, [running, speed, steps.length])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setIdx(-1)
  }

  const stepOnce = () => {
    setRunning(false)
    setIdx(i => Math.min(i + 1, steps.length - 1))
  }

  const hops = useMemo(() => {
    let n = 0
    for (let k = 0; k <= idx && k < steps.length; k++) if (steps[k].kind === 'query') n++
    return n
  }, [idx, steps])

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Walking the tree, then the cache
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Walking the tree, then the cache. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (idx >= steps.length - 1) setIdx(-1)
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Play
            </>
          )}
        </button>
        <button
          onClick={stepOnce}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors"
        >
          <ChevronRight size={12} /> Step
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Name:</span>
          <select
            value={name}
            onChange={e => {
              setName(e.target.value as keyof typeof NAMES)
              setIdx(-1)
              setRunning(false)
            }}
            className="px-2 py-1 rounded border border-border bg-bg-surface text-xs text-text-secondary"
          >
            {Object.keys(NAMES).map(k => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Speed:</span>
          <input
            type="range"
            min={220}
            max={1100}
            step={40}
            value={1320 - speed}
            onChange={e => setSpeed(1320 - +e.target.value)}
            className="w-20 accent-accent-gold"
          />
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          server queries: <strong style={{ color: RED }}>{Math.min(hops, spec.tiers.length)}</strong>
        </WidgetStatus>
      </div>
    </div>
  )
}
