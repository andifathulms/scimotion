'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const KEYS = ['apple', 'mango', 'cherry', 'plum', 'fig', 'pear', 'kiwi', 'lemon', 'grape', 'olive']
const MISSING = 'papaya'

const W = 600
const CAP_MAX = 12
const OX = 12
const OY = 56
const ROW = 26
const H = OY + CAP_MAX * ROW + 20

const NODE_W = 62
const NODE_GAP = 8
const CHAIN_X = 74

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const GREEN = '#10B981'

// Deterministic string hash (Java's 31-multiplier, kept in unsigned 32-bit space).
function hashKey(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0
  return h
}

type Step =
  | { kind: 'insert'; key: string; bucket: number }
  | { kind: 'probe'; key: string; bucket: number; pos: number; hit: boolean }
  | { kind: 'miss'; key: string; bucket: number }

function buildSteps(capacity: number, lookup: string): Step[] {
  const buckets: string[][] = Array.from({ length: capacity }, () => [])
  const steps: Step[] = []
  for (const key of KEYS) {
    const b = hashKey(key) % capacity
    buckets[b].push(key)
    steps.push({ kind: 'insert', key, bucket: b })
  }
  const lb = hashKey(lookup) % capacity
  const chain = buckets[lb]
  let found = false
  for (let pos = 0; pos < chain.length; pos++) {
    const hit = chain[pos] === lookup
    steps.push({ kind: 'probe', key: lookup, bucket: lb, pos, hit })
    if (hit) { found = true; break }
  }
  if (!found) steps.push({ kind: 'miss', key: lookup, bucket: lb })
  return steps
}

export function HashTableAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setIdx(totalRef.current - 1); return }
      setIdx(-1)
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [capacity, setCapacity] = useState(8)
  const [lookup, setLookup] = useState('grape')
  const [idx, setIdx] = useState(-1)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(520)

  const steps = useMemo(() => buildSteps(capacity, lookup), [capacity, lookup])
  const totalRef = useRef(steps.length)
  useEffect(() => { totalRef.current = steps.length }, [steps.length])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const cur = idx >= 0 && idx < steps.length ? steps[idx] : null

    // how many keys have been placed so far
    let placed = 0
    for (let k = 0; k <= idx && k < steps.length; k++) if (steps[k].kind === 'insert') placed++

    const buckets: string[][] = Array.from({ length: capacity }, () => [])
    for (let i = 0; i < placed; i++) buckets[hashKey(KEYS[i]) % capacity].push(KEYS[i])

    // ---- header: the hash computation for the key in play ----
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = '11px monospace'
    if (cur) {
      const h = hashKey(cur.key)
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.fillText(`hash("${cur.key}")`, OX, 16)
      ctx.fillStyle = GOLD
      ctx.fillText(`= ${h}`, OX + 112, 16)
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.fillText(`% ${capacity}`, OX + 112 + 96, 16)
      ctx.fillStyle = cur.kind === 'insert' ? BLUE : VIOLET
      ctx.fillText(`→ bucket ${cur.bucket}`, OX + 112 + 152, 16)
    } else {
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.fillText('Press Play — each key is hashed, then dropped into hash(key) % capacity', OX, 16)
    }

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('bucket', OX + 4, 38)
    ctx.fillText('chain →', CHAIN_X, 38)

    // ---- buckets ----
    for (let b = 0; b < capacity; b++) {
      const y = OY + b * ROW
      const isTarget = cur?.bucket === b
      const boxFill = isTarget ? `${GOLD}22` : 'rgba(255,255,255,0.03)'
      const boxStroke = isTarget ? GOLD : 'rgba(255,245,235,0.12)'

      ctx.fillStyle = boxFill
      ctx.strokeStyle = boxStroke
      ctx.lineWidth = isTarget ? 1.6 : 1
      ctx.beginPath()
      ctx.roundRect(OX, y, 46, ROW - 6, 5)
      ctx.fill()
      ctx.stroke()

      ctx.textAlign = 'center'
      ctx.font = isTarget ? 'bold 11px monospace' : '11px monospace'
      ctx.fillStyle = isTarget ? GOLD : 'rgba(245,240,232,0.5)'
      ctx.fillText(String(b), OX + 23, y + (ROW - 6) / 2)
      ctx.textAlign = 'left'

      const chain = buckets[b]
      if (chain.length === 0) {
        ctx.font = '10px monospace'
        ctx.fillStyle = 'rgba(245,240,232,0.18)'
        ctx.fillText('empty', CHAIN_X, y + (ROW - 6) / 2)
        continue
      }

      for (let p = 0; p < chain.length; p++) {
        const x = CHAIN_X + p * (NODE_W + NODE_GAP)
        if (x + NODE_W > W - 6) break

        const key = chain[p]
        const isNew = cur?.kind === 'insert' && cur.key === key && cur.bucket === b
        const isProbed = cur?.kind === 'probe' && cur.bucket === b && cur.pos === p
        const isSeen = cur?.kind === 'probe' && cur.bucket === b && p < cur.pos
        const isHit = cur?.kind === 'probe' && cur.bucket === b && cur.pos === p && cur.hit

        let fill = 'rgba(255,255,255,0.04)'
        let stroke = 'rgba(255,245,235,0.14)'
        let text = 'rgba(245,240,232,0.65)'
        if (isSeen) { fill = `${PINK}18`; stroke = `${PINK}66`; text = PINK }
        if (isNew) { fill = `${BLUE}33`; stroke = BLUE; text = BLUE }
        if (isProbed) { fill = `${VIOLET}33`; stroke = VIOLET; text = VIOLET }
        if (isHit) { fill = `${GREEN}33`; stroke = GREEN; text = GREEN }

        // link from the bucket / previous node
        ctx.strokeStyle = isProbed || isSeen ? `${VIOLET}88` : 'rgba(255,245,235,0.16)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(p === 0 ? OX + 46 : x - NODE_GAP, y + (ROW - 6) / 2)
        ctx.lineTo(x, y + (ROW - 6) / 2)
        ctx.stroke()

        ctx.fillStyle = fill
        ctx.strokeStyle = stroke
        ctx.lineWidth = isNew || isProbed ? 1.6 : 1
        ctx.beginPath()
        ctx.roundRect(x, y, NODE_W, ROW - 6, 5)
        ctx.fill()
        ctx.stroke()

        ctx.fillStyle = text
        ctx.font = isNew || isProbed ? 'bold 10px monospace' : '10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(key, x + NODE_W / 2, y + (ROW - 6) / 2)
        ctx.textAlign = 'left'
      }

      if (chain.length > 1) {
        const lastX = CHAIN_X + chain.length * (NODE_W + NODE_GAP)
        if (lastX + 40 < W) {
          ctx.font = '9px monospace'
          ctx.fillStyle = chain.length >= 3 ? PINK : 'rgba(245,240,232,0.25)'
          ctx.fillText(`×${chain.length}`, lastX, y + (ROW - 6) / 2)
        }
      }
    }

    // ---- status line ----
    ctx.font = '11px monospace'
    const sy = H - 8
    if (cur?.kind === 'insert') {
      ctx.fillStyle = BLUE
      ctx.fillText(
        buckets[cur.bucket].length > 1
          ? `collision — "${cur.key}" joins ${buckets[cur.bucket].length - 1} key(s) already in bucket ${cur.bucket}`
          : `"${cur.key}" lands in empty bucket ${cur.bucket}`,
        OX, sy
      )
    } else if (cur?.kind === 'probe') {
      ctx.fillStyle = cur.hit ? GREEN : VIOLET
      ctx.fillText(
        cur.hit
          ? `found "${cur.key}" after ${cur.pos + 1} comparison${cur.pos ? 's' : ''} in the chain`
          : `walking bucket ${cur.bucket}: link ${cur.pos + 1} is not "${cur.key}" — keep going`,
        OX, sy
      )
    } else if (cur?.kind === 'miss') {
      ctx.fillStyle = PINK
      ctx.fillText(`"${cur.key}" is absent — the whole chain in bucket ${cur.bucket} was checked`, OX, sy)
    } else {
      ctx.fillStyle = 'rgba(245,240,232,0.3)'
      ctx.fillText('Insert all 10 keys, then look one up by walking its chain', OX, sy)
    }
  }, [idx, steps, capacity])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setIdx(i => {
        if (i >= steps.length - 1) { setRunning(false); return i }
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

  const placedCount = useMemo(() => {
    let n = 0
    for (let k = 0; k <= idx && k < steps.length; k++) if (steps[k].kind === 'insert') n++
    return n
  }, [idx, steps])

  const longest = useMemo(() => {
    const counts = new Array<number>(capacity).fill(0)
    for (const key of KEYS) counts[hashKey(key) % capacity]++
    return Math.max(...counts)
  }, [capacity])

  const alpha = (KEYS.length / capacity).toFixed(2)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Buckets, collisions, chains</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Buckets, collisions, chains. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { if (idx >= steps.length - 1) setIdx(-1); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={stepOnce}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors"
        >
          <ChevronRight size={12} /> Step
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Look up:</span>
          <select
            value={lookup}
            onChange={e => { setLookup(e.target.value); setIdx(-1); setRunning(false) }}
            className="px-2 py-1 rounded border border-border bg-bg-surface text-xs text-text-secondary"
          >
            {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            <option value={MISSING}>{MISSING} (absent)</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Speed:</span>
          <input
            type="range" min={120} max={900} step={40} value={1020 - speed}
            onChange={e => setSpeed(1020 - +e.target.value)}
            className="w-20 accent-accent-gold"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Capacity:</span>
          <input
            type="range" min={4} max={CAP_MAX} step={1} value={capacity}
            onChange={e => { setCapacity(+e.target.value); setIdx(-1); setRunning(false) }}
            className="w-24 accent-accent-blue"
          />
          <span className="text-text-secondary font-medium">{capacity}</span>
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          Placed <strong className="text-accent-gold">{placedCount}</strong> / {KEYS.length}
          <span className="ml-3">α = {alpha}</span>
          <span className="ml-3" style={{ color: longest >= 3 ? PINK : undefined }}>longest chain {longest}</span>
        </WidgetStatus>
      </div>
    </div>
  )
}
