'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw, Send } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const RED = '#F87171'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const CYAN = '#22D3EE'
const MUTE = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.28)'

const ATTACKER = 'mail.evil.example'
const SPOOFED = 'security@bank.example'
const DOMAIN = 'bank.example'

// A single request/response cycle, in virtual milliseconds.
type Phase = 'idle' | 'flight' | 'check' | 'done'
const FLIGHT_MS = 900
const CHECK_MS = 1500

// The three verification steps a receiver runs when auth is on.
type Check = { name: string; question: string; color: string }
const CHECKS: Check[] = [
  { name: 'SPF', question: `is ${ATTACKER} allowed to send for ${DOMAIN}?`, color: BLUE },
  { name: 'DKIM', question: `valid signature from ${DOMAIN}?`, color: VIOLET },
  { name: 'DMARC', question: `policy for a message failing checks?`, color: CYAN },
]

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  label: string
) {
  ctx.fillStyle = 'rgba(255,255,255,0.02)'
  ctx.strokeStyle = `${color}88`
  ctx.lineWidth = 1.4
  roundRect(ctx, x, y, w, h, 8)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = color
  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(label, x + 12, y + 16)
}

export function EmailSpoofingAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef<Phase>('idle')
  const clockRef = useRef(0)
  const authRef = useRef(false)

  const [auth, setAuth] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    authRef.current = auth
  }, [auth])

  // Layout: attacker box left, receiver box right, wire between.
  const attX = 24
  const recX = 424
  const boxW = 152
  const boxTop = 96
  const boxH = 150
  const wireY = 130
  const wireX0 = attX + boxW
  const wireX1 = recX

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    const ph = phaseRef.current
    const t = clockRef.current
    const on = authRef.current

    // ---- title ----
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText('A forged From line claims to be a trusted domain. Does the receiver verify it?', attX, 22)

    // ---- the forged message (top-left) ----
    ctx.font = '10px monospace'
    ctx.fillStyle = MUTE
    ctx.fillText('the message', attX, 44)
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText(`From: ${SPOOFED}`, attX, 60)
    ctx.font = '10px monospace'
    ctx.fillStyle = RED
    ctx.fillText(`(really sent by ${ATTACKER})`, attX, 74)

    // ---- attacker box ----
    drawBox(ctx, attX, boxTop, boxW, boxH, RED, 'ATTACKER')
    ctx.font = '10px monospace'
    ctx.fillStyle = RED
    ctx.textAlign = 'left'
    ctx.fillText(ATTACKER, attX + 12, boxTop + 38)
    ctx.fillStyle = FAINT
    ctx.font = '9px monospace'
    ctx.fillText('owns no part of', attX + 12, boxTop + 56)
    ctx.fillStyle = MUTE
    ctx.fillText(DOMAIN, attX + 12, boxTop + 70)
    ctx.fillStyle = FAINT
    ctx.fillText('no private key', attX + 12, boxTop + 92)
    ctx.fillText('for its DKIM sig', attX + 12, boxTop + 105)

    // ---- receiver box ----
    drawBox(ctx, recX, boxTop, boxW, boxH, CYAN, 'RECEIVER')
    ctx.font = '10px monospace'
    ctx.fillStyle = CYAN
    ctx.textAlign = 'left'
    ctx.fillText('incoming mail', recX + 12, boxTop + 38)
    ctx.fillStyle = FAINT
    ctx.font = '9px monospace'
    ctx.fillText(on ? 'auth: SPF+DKIM+DMARC' : 'auth: OFF — trusts', recX + 12, boxTop + 56)
    ctx.fillText(on ? 'checks each message' : 'the From line', recX + 12, boxTop + 70)

    // outcome badge inside receiver box once done
    if (ph === 'done') {
      const accepted = !on
      const oy = boxTop + 92
      ctx.fillStyle = accepted ? `${RED}22` : `${GREEN}22`
      ctx.strokeStyle = accepted ? RED : GREEN
      ctx.lineWidth = 1.2
      roundRect(ctx, recX + 12, oy, boxW - 24, 44, 5)
      ctx.fill()
      ctx.stroke()
      ctx.textAlign = 'center'
      ctx.fillStyle = accepted ? RED : GREEN
      ctx.font = 'bold 12px monospace'
      ctx.fillText(accepted ? '→ INBOX' : '✕ REJECTED', recX + boxW / 2, oy + 20)
      ctx.font = '8px monospace'
      ctx.fillStyle = accepted ? RED : GREEN
      ctx.fillText(accepted ? 'phish delivered' : 'DMARC: reject', recX + boxW / 2, oy + 34)
    }

    // ---- the wire ----
    ctx.strokeStyle = 'rgba(245,240,232,0.16)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(wireX0, wireY)
    ctx.lineTo(wireX1, wireY)
    ctx.stroke()

    // ---- packet in flight ----
    if (ph === 'flight') {
      const px = wireX0 + (wireX1 - wireX0) * Math.min(1, t / FLIGHT_MS)
      ctx.fillStyle = GOLD
      ctx.beginPath()
      ctx.arc(px, wireY, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = GOLD
      ctx.fillText('forged mail', px, wireY - 12)
    }

    // ---- verification panel (bottom) ----
    const py = 262
    if (ph === 'check' || ph === 'done') {
      if (on) {
        // reveal checks progressively during 'check'
        const revealed =
          ph === 'done' ? CHECKS.length : Math.min(CHECKS.length, Math.floor((t / CHECK_MS) * CHECKS.length) + 1)
        CHECKS.forEach((c, i) => {
          const cx = attX + i * 190
          const shown = i < revealed
          // SPF fails, DKIM fails, DMARC verdict = reject — all shown in red.
          ctx.textAlign = 'left'
          ctx.fillStyle = shown ? c.color : FAINT
          ctx.font = 'bold 10px monospace'
          ctx.fillText(c.name, cx, py)
          ctx.font = '8px monospace'
          ctx.fillStyle = shown ? MUTE : FAINT
          ctx.fillText(c.question, cx, py + 13)
          if (shown) {
            ctx.fillStyle = RED
            ctx.font = 'bold 9px monospace'
            ctx.fillText(i === 2 ? '⇒ reject' : '✕ fail', cx, py + 28)
          }
        })
      } else {
        ctx.textAlign = 'left'
        ctx.fillStyle = RED
        ctx.font = '11px monospace'
        ctx.fillText('No checks run. The receiver believes the From line and delivers the message.', attX, py + 8)
        ctx.fillStyle = FAINT
        ctx.font = '9px monospace'
        ctx.fillText('This is exactly how phishing lands: the one field a human trusts is unverified.', attX, py + 24)
      }
    } else if (ph === 'idle') {
      ctx.textAlign = 'left'
      ctx.fillStyle = FAINT
      ctx.font = '11px monospace'
      ctx.fillText('Press Send. Then flip authentication and send the identical message again.', attX, py + 8)
    }

    // ---- status flash while checking ----
    if (ph === 'check' && on) {
      ctx.textAlign = 'center'
      ctx.fillStyle = GOLD
      ctx.font = '10px monospace'
      ctx.fillText('verifying against DNS records…', (recX + recX + boxW) / 2, boxTop - 8)
    }
  }, [attX, recX, boxW, boxTop, boxH, wireY, wireX0, wireX1])

  // Advance the clock.
  useEffect(() => {
    if (phase === 'idle' || phase === 'done') {
      draw()
      return
    }
    let last = performance.now()
    const loop = (now: number) => {
      const dt = now - last
      last = now
      clockRef.current += dt
      const ph = phaseRef.current
      // when auth is off, skip the (empty) check phase quickly
      const dur = ph === 'flight' ? FLIGHT_MS : authRef.current ? CHECK_MS : 500
      if (clockRef.current >= dur) {
        clockRef.current = 0
        const next: Phase = ph === 'flight' ? 'check' : 'done'
        phaseRef.current = next
        setPhase(next)
        if (next === 'done') {
          draw()
          return
        }
      }
      setTick(x => x + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase, draw])

  useEffect(() => {
    draw()
  }, [draw, tick])

  const send = () => {
    cancelAnimationFrame(rafRef.current)
    clockRef.current = 0
    phaseRef.current = 'flight'
    setPhase('flight')
  }

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        phaseRef.current = 'done'
        setPhase('done')
      } else {
        send()
      }
    },
  })

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    clockRef.current = 0
    phaseRef.current = 'idle'
    setPhase('idle')
    triggerReset()
  }

  const running = phase === 'flight' || phase === 'check'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Spoofing, and the checks that catch it
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: Spoofing, and the checks that catch it. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={send}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors disabled:opacity-40"
        >
          <Send size={12} /> Send
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={auth}
            onChange={e => {
              setAuth(e.target.checked)
              reset()
            }}
            className="accent-accent-gold"
          />
          <span>SPF · DKIM · DMARC</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary">
          verdict:{' '}
          <strong style={{ color: auth ? GREEN : RED }}>{auth ? 'rejected' : 'delivered'}</strong>
        </span>
      </div>
    </div>
  )
}
