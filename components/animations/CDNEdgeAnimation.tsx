'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw, Flame } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const RED = '#F87171'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const GREEN = '#10B981'
const CYAN = '#22D3EE'
const VIOLET = '#A78BFA'
const MUTE = 'rgba(245,240,232,0.4)'

// one-way latencies (ms). The user sits beside the edge; the origin is far away.
const MS_USER_EDGE = 3
const MS_EDGE_ORIGIN = 85

const USER = { x: 58, y: 150 }
const EDGE = { x: 250, y: 150 }
const ORIGIN = { x: 540, y: 150 }

type Leg = { from: { x: number; y: number }; to: { x: number; y: number }; color: string; ms: number; caches?: boolean }

// visual duration for a leg with `ms` of real latency (scaled so the long
// origin hop visibly drags while the short edge hop is a flick).
function visDur(ms: number): number {
  return 240 + ms * 3.4
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

export function CDNEdgeAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [warm, setWarm] = useState(false)
  const [lastLatency, setLastLatency] = useState<number | null>(null)
  const [wasHit, setWasHit] = useState<boolean | null>(null)
  const [reqCount, setReqCount] = useState(0)

  // animation state kept in refs so the rAF loop never goes stale
  const legsRef = useRef<Leg[]>([])
  const legIdxRef = useRef(0)
  const legStartRef = useRef(0)
  const accumRef = useRef(0)
  const runningRef = useRef(false)
  const rafRef = useRef(0)
  const warmRef = useRef(false)
  const hitRef = useRef(false)
  const statusRef = useRef('Press Request — the first hit is a MISS to the distant origin.')

  const draw = useCallback((packet: { x: number; y: number } | null) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, r)
    }

    // header
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = RED
    ctx.fillText('GET  /logo.png', 20, 22)

    // link: user — edge (near) and edge — origin (far)
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.lineWidth = 1
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(USER.x + 30, USER.y)
    ctx.lineTo(EDGE.x - 34, EDGE.y)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,245,235,0.1)'
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.moveTo(EDGE.x + 34, EDGE.y)
    ctx.lineTo(ORIGIN.x - 30, ORIGIN.y)
    ctx.stroke()
    ctx.setLineDash([])

    // distance labels on the links
    ctx.textAlign = 'center'
    ctx.font = '9px monospace'
    ctx.fillStyle = MUTE
    ctx.fillText('near · a few ms', (USER.x + EDGE.x) / 2, EDGE.y - 12)
    ctx.fillText('far · ~85 ms each way', (EDGE.x + ORIGIN.x) / 2, ORIGIN.y - 12)

    // user
    ctx.beginPath()
    ctx.arc(USER.x, USER.y, 22, 0, Math.PI * 2)
    ctx.fillStyle = `${BLUE}22`
    ctx.strokeStyle = BLUE
    ctx.lineWidth = 1.6
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = BLUE
    ctx.font = 'bold 11px monospace'
    ctx.fillText('you', USER.x, USER.y + 4)

    // edge PoP (warm glows)
    if (warmRef.current) {
      ctx.beginPath()
      ctx.arc(EDGE.x, EDGE.y, 40, 0, Math.PI * 2)
      ctx.fillStyle = `${GOLD}12`
      ctx.fill()
    }
    roundRect(EDGE.x - 34, EDGE.y - 26, 68, 52, 9)
    ctx.fillStyle = warmRef.current ? `${GOLD}26` : 'rgba(255,255,255,0.04)'
    ctx.strokeStyle = warmRef.current ? GOLD : RED
    ctx.lineWidth = 1.8
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = warmRef.current ? GOLD : RED
    ctx.font = 'bold 11px monospace'
    ctx.fillText('edge', EDGE.x, EDGE.y - 4)
    ctx.font = '9px monospace'
    ctx.fillStyle = warmRef.current ? GOLD : MUTE
    ctx.fillText(warmRef.current ? 'cached' : 'empty', EDGE.x, EDGE.y + 12)

    // origin
    roundRect(ORIGIN.x - 30, ORIGIN.y - 28, 60, 56, 9)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.strokeStyle = VIOLET
    ctx.lineWidth = 1.6
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = VIOLET
    ctx.font = 'bold 11px monospace'
    ctx.fillText('origin', ORIGIN.x, ORIGIN.y - 4)
    ctx.font = '9px monospace'
    ctx.fillStyle = MUTE
    ctx.fillText('source', ORIGIN.x, ORIGIN.y + 12)

    // the travelling request/response packet
    if (packet) {
      ctx.beginPath()
      ctx.arc(packet.x, packet.y, 7, 0, Math.PI * 2)
      const pc = legsRef.current[legIdxRef.current]?.color ?? RED
      ctx.fillStyle = pc
      ctx.fill()
    }

    // running latency meter
    ctx.textAlign = 'left'
    ctx.font = 'bold 12px monospace'
    const meter = runningRef.current ? Math.round(accumRef.current) : lastLatency
    if (meter !== null) {
      const col = hitRef.current ? GREEN : GOLD
      ctx.fillStyle = col
      ctx.fillText(`latency: ${meter} ms`, 20, H - 40)
    }

    // status line
    ctx.font = '11px monospace'
    ctx.fillStyle = hitRef.current ? GREEN : runningRef.current ? RED : MUTE
    ctx.fillText(statusRef.current, 20, H - 16)
  }, [lastLatency])

  // main animation loop
  const tick = useCallback(() => {
    const legs = legsRef.current
    const i = legIdxRef.current
    if (i >= legs.length) {
      runningRef.current = false
      hitRef.current = warmRef.current && legs.length === 2
      const hit = legs.length === 2
      setWasHit(hit)
      setLastLatency(Math.round(accumRef.current))
      statusRef.current = hit
        ? `cache HIT — served from the nearby edge in ${Math.round(accumRef.current)} ms. The origin was never touched.`
        : `cache MISS filled — origin answered, edge cached it. Every request after this is a fast HIT.`
      draw(null)
      return
    }
    const leg = legs[i]
    const now = performance.now()
    const dur = visDur(leg.ms)
    const raw = Math.min(1, (now - legStartRef.current) / dur)
    const t = easeInOut(raw)
    const px = leg.from.x + (leg.to.x - leg.from.x) * t
    const py = leg.from.y + (leg.to.y - leg.from.y) * t
    // latency accrues across the leg
    const accrued = accumRef.current + leg.ms * raw
    const savedAccum = accumRef.current
    accumRef.current = accrued
    draw({ x: px, y: py })
    accumRef.current = savedAccum

    if (raw >= 1) {
      accumRef.current += leg.ms
      if (leg.caches) {
        warmRef.current = true
        setWarm(true)
      }
      legIdxRef.current += 1
      legStartRef.current = now
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [draw])

  const startRequest = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const hit = warmRef.current
    hitRef.current = false
    accumRef.current = 0
    legIdxRef.current = 0
    legStartRef.current = performance.now()
    runningRef.current = true
    setReqCount(c => c + 1)
    if (hit) {
      statusRef.current = 'cache HIT in progress — the edge already has it, serving locally…'
      legsRef.current = [
        { from: USER, to: EDGE, color: RED, ms: MS_USER_EDGE },
        { from: EDGE, to: USER, color: GREEN, ms: MS_USER_EDGE },
      ]
    } else {
      statusRef.current = 'cache MISS — edge is empty, forwarding all the way to the origin…'
      legsRef.current = [
        { from: USER, to: EDGE, color: RED, ms: MS_USER_EDGE },
        { from: EDGE, to: ORIGIN, color: GOLD, ms: MS_EDGE_ORIGIN },
        { from: ORIGIN, to: EDGE, color: CYAN, ms: MS_EDGE_ORIGIN, caches: true },
        { from: EDGE, to: USER, color: GREEN, ms: MS_USER_EDGE },
      ]
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  const expireCache = () => {
    cancelAnimationFrame(rafRef.current)
    runningRef.current = false
    hitRef.current = false
    warmRef.current = false
    setWarm(false)
    statusRef.current = 'cache expired (TTL elapsed) — the next request is a MISS again.'
    setWasHit(null)
    setLastLatency(null)
    accumRef.current = 0
    draw(null)
  }

  const { ref } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        warmRef.current = true
        setWarm(true)
        hitRef.current = true
        setWasHit(true)
        setLastLatency(2 * MS_USER_EDGE)
        statusRef.current = `cache HIT — served from the nearby edge in ${2 * MS_USER_EDGE} ms.`
        draw(null)
        return
      }
      startRequest()
    },
  })

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    runningRef.current = false
    hitRef.current = false
    warmRef.current = false
    setWarm(false)
    setWasHit(null)
    setLastLatency(null)
    setReqCount(0)
    accumRef.current = 0
    statusRef.current = 'Press Request — the first hit is a MISS to the distant origin.'
    draw(null)
  }

  useEffect(() => {
    draw(null)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Cache miss to the origin, then hits at the edge
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={startRequest}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          <Play size={12} /> Request
        </button>
        <button
          onClick={expireCache}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors"
        >
          <Flame size={12} /> Expire cache
        </button>
        <span className="text-xs text-text-muted">
          edge:{' '}
          <strong style={{ color: warm ? GOLD : RED }}>{warm ? 'warm (cached)' : 'cold (empty)'}</strong>
        </span>
        <span className="ml-auto text-xs text-text-secondary">
          requests: <strong style={{ color: RED }}>{reqCount}</strong>
          {lastLatency !== null && wasHit !== null && (
            <>
              {' · '}last:{' '}
              <strong style={{ color: wasHit ? GREEN : GOLD }}>
                {lastLatency} ms {wasHit ? 'HIT' : 'MISS'}
              </strong>
            </>
          )}
        </span>
      </div>
    </div>
  )
}
