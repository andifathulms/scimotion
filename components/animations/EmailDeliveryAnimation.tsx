'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const RED = '#F87171'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const CYAN = '#22D3EE'
const FAINT = 'rgba(245,240,232,0.28)'

const FROM = 'alice@example.com'
const TO = 'bob@company.com'
const SENDER_MX = 'mail.example.com'
const RECIP_MX = 'mx.company.com'

// The four nodes of the store-and-forward path, left to right.
type Node = { x: number; label: string; sub: string; color: string }
const NODE_W = 116
const NODE_H = 66
const NODE_Y = 150
const NODES: Node[] = [
  { x: 20, label: "Alice's client", sub: FROM, color: RED },
  { x: 168, label: 'Sender mail server', sub: SENDER_MX, color: BLUE },
  { x: 316, label: 'Recipient mail server', sub: RECIP_MX, color: VIOLET },
  { x: 464, label: "Bob's client", sub: TO, color: GREEN },
]

// Each step is one action along the path.
type Step =
  | { kind: 'submit' } //     0 -> 1  SMTP submission
  | { kind: 'mx' } //         DNS MX lookup at node 1
  | { kind: 'relay' } //      1 -> 2  SMTP relay
  | { kind: 'store' } //      message waits at node 2
  | { kind: 'fetch' } //      2 -> 3  IMAP/POP fetch

const STEPS: Step[] = [
  { kind: 'submit' },
  { kind: 'mx' },
  { kind: 'relay' },
  { kind: 'store' },
  { kind: 'fetch' },
]

function nodeCenter(i: number) {
  return { x: NODES[i].x + NODE_W / 2, y: NODE_Y + NODE_H / 2 }
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export function EmailDeliveryAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [idx, setIdx] = useState(-1)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(1000)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setIdx(STEPS.length - 1)
        return
      }
      setIdx(-1)
      setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    const cur = idx >= 0 && idx < STEPS.length ? STEPS[idx] : null

    // How far along the path the message has travelled (index of the node it rests on).
    let atNode = 0
    let stored = false
    let delivered = false
    for (let k = 0; k <= idx && k < STEPS.length; k++) {
      const s = STEPS[k]
      if (s.kind === 'submit') atNode = 1
      else if (s.kind === 'relay') atNode = 2
      else if (s.kind === 'store') stored = true
      else if (s.kind === 'fetch') {
        atNode = 3
        delivered = true
      }
    }

    // ---- header ----
    ctx.textAlign = 'left'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = RED
    ctx.fillText(`deliver  ${FROM}  →  ${TO}`, 20, 20)
    ctx.font = '10px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText('store-and-forward: a relay through servers, not a direct link', 20, 36)

    // ---- the wire linking the four nodes ----
    ctx.strokeStyle = 'rgba(245,240,232,0.14)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(NODES[0].x + NODE_W, NODE_Y + NODE_H / 2)
    ctx.lineTo(NODES[3].x, NODE_Y + NODE_H / 2)
    ctx.stroke()

    // ---- nodes ----
    NODES.forEach((n, i) => {
      const reached = atNode >= i
      const active =
        (cur?.kind === 'submit' && (i === 0 || i === 1)) ||
        (cur?.kind === 'mx' && i === 1) ||
        (cur?.kind === 'relay' && (i === 1 || i === 2)) ||
        (cur?.kind === 'store' && i === 2) ||
        (cur?.kind === 'fetch' && (i === 2 || i === 3))
      roundRect(ctx, n.x, NODE_Y, NODE_W, NODE_H, 8)
      ctx.fillStyle = active ? `${n.color}26` : reached ? `${n.color}12` : 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = active ? n.color : reached ? `${n.color}88` : 'rgba(245,240,232,0.16)'
      ctx.lineWidth = active ? 1.8 : 1
      ctx.fill()
      ctx.stroke()

      // little icon: client = laptop dot, server = stacked disks
      const isServer = i === 1 || i === 2
      ctx.fillStyle = reached || active ? n.color : 'rgba(245,240,232,0.4)'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(isServer ? '▤ server' : '▢ client', n.x + NODE_W / 2, NODE_Y + 18)
      ctx.font = '9px monospace'
      ctx.fillStyle = reached || active ? 'rgba(245,240,232,0.75)' : 'rgba(245,240,232,0.4)'
      ctx.fillText(n.label, n.x + NODE_W / 2, NODE_Y + 36)
      ctx.font = '8px monospace'
      ctx.fillStyle = reached || active ? GOLD : FAINT
      ctx.fillText(n.sub, n.x + NODE_W / 2, NODE_Y + 52)
    })

    // ---- stored badge on recipient server ----
    if (stored && !delivered) {
      const n = NODES[2]
      ctx.fillStyle = GOLD
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('✉ waiting', n.x + NODE_W / 2, NODE_Y - 8)
    }
    if (delivered) {
      const n = NODES[3]
      ctx.fillStyle = GREEN
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('✉ delivered', n.x + NODE_W / 2, NODE_Y - 8)
    }

    // ---- DNS MX lookup box (above the sender server) ----
    const dnsX = NODES[1].x - 2
    const dnsY = 66
    const dnsActive = cur?.kind === 'mx'
    const dnsDone = atNode >= 2 || dnsActive
    roundRect(ctx, dnsX, dnsY, 160, 40, 7)
    ctx.fillStyle = dnsActive ? `${CYAN}22` : dnsDone ? `${CYAN}12` : 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = dnsActive ? CYAN : dnsDone ? `${CYAN}77` : 'rgba(245,240,232,0.14)'
    ctx.lineWidth = dnsActive ? 1.8 : 1
    ctx.fill()
    ctx.stroke()
    ctx.textAlign = 'left'
    ctx.fillStyle = dnsActive || dnsDone ? CYAN : FAINT
    ctx.font = 'bold 9px monospace'
    ctx.fillText('DNS  MX lookup', dnsX + 10, dnsY + 16)
    ctx.font = '8px monospace'
    ctx.fillStyle = dnsActive || dnsDone ? 'rgba(245,240,232,0.7)' : FAINT
    ctx.fillText(`company.com  MX → ${RECIP_MX}`, dnsX + 10, dnsY + 30)
    // dashed link from sender server up to the DNS box
    if (dnsActive || dnsDone) {
      ctx.strokeStyle = dnsActive ? CYAN : `${CYAN}55`
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(NODES[1].x + NODE_W / 2, NODE_Y)
      ctx.lineTo(dnsX + 80, dnsY + 40)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // ---- the live arrow for the current step ----
    if (cur?.kind === 'submit') {
      const a = nodeCenter(0)
      const b = nodeCenter(1)
      drawArrow(ctx, a.x + NODE_W / 2 - 4, a.y, b.x - NODE_W / 2 + 4, b.y, RED, false)
      ctx.fillStyle = RED
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('SMTP submit', (a.x + b.x) / 2, a.y - 12)
    } else if (cur?.kind === 'relay') {
      const a = nodeCenter(1)
      const b = nodeCenter(2)
      drawArrow(ctx, a.x + NODE_W / 2 - 4, a.y, b.x - NODE_W / 2 + 4, b.y, BLUE, false)
      ctx.fillStyle = BLUE
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('SMTP relay', (a.x + b.x) / 2, a.y - 12)
    } else if (cur?.kind === 'fetch') {
      const a = nodeCenter(2)
      const b = nodeCenter(3)
      // fetch is a pull: client reaches back to the server
      drawArrow(ctx, b.x - NODE_W / 2 + 4, a.y, a.x + NODE_W / 2 - 4, a.y, GREEN, true)
      ctx.fillStyle = GREEN
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('IMAP / POP fetch', (a.x + b.x) / 2, a.y - 12)
    }

    // ---- status line ----
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    const sy = H - 16
    const set = (color: string, msg: string) => {
      ctx.fillStyle = color
      ctx.fillText(msg, 20, sy)
    }
    if (cur?.kind === 'submit') set(RED, `1 · Alice's client hands the message to her mail server (SMTP submission).`)
    else if (cur?.kind === 'mx') set(CYAN, `2 · Her server asks DNS for company.com's MX record → ${RECIP_MX}.`)
    else if (cur?.kind === 'relay') set(BLUE, `3 · The message is relayed to the recipient's mail server (SMTP).`)
    else if (cur?.kind === 'store') set(GOLD, `4 · Stored. The message waits in Bob's mailbox — his device may be offline.`)
    else if (cur?.kind === 'fetch') set(GREEN, `5 · Bob's client fetches the waiting message (IMAP/POP). Now delivered.`)
    else set('rgba(245,240,232,0.4)', 'Press Play — follow one message hop by hop through the mail servers.')

    // step counter
    ctx.textAlign = 'right'
    ctx.fillStyle = FAINT
    ctx.font = '10px monospace'
    ctx.fillText(`hop ${Math.max(0, atNode)} of 3`, W - 20, sy)
  }, [idx])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setIdx(i => {
        if (i >= STEPS.length - 1) {
          setRunning(false)
          return i
        }
        return i + 1
      })
    }, speed)
    return () => clearInterval(id)
  }, [running, speed])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setIdx(-1)
  }

  const stepOnce = () => {
    setRunning(false)
    setIdx(i => Math.min(i + 1, STEPS.length - 1))
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Store-and-forward, hop by hop
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (idx >= STEPS.length - 1) setIdx(-1)
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
          <span>Speed:</span>
          <input
            type="range"
            min={400}
            max={1600}
            step={100}
            value={2000 - speed}
            onChange={e => setSpeed(2000 - +e.target.value)}
            className="w-20 accent-accent-gold"
          />
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          servers in the path: <strong style={{ color: RED }}>2</strong>
        </span>
      </div>
    </div>
  )
}
