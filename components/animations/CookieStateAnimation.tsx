'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw, Send, Cookie, XCircle } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 320

const RED = '#F87171'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const GREEN = '#10B981'
const MUTE = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.28)'

// A token the browser stores after a Set-Cookie and re-sends on every request.
const SESSION_ID = 'sid=a3f9'

type LogLine = { text: string; color: string }

const browserX = 24
const serverX = 430
const boxW = 146
const boxTop = 60
const boxH = 150
const wireY = 132
const wireX0 = browserX + boxW
const wireX1 = serverX

type Phase = 'idle' | 'flight-out' | 'flight-back' | 'done'
const OUT_MS = 760
const BACK_MS = 760

export function CookieStateAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const clockRef = useRef(0)
  const phaseRef = useRef<Phase>('idle')

  // Does the browser currently hold the session cookie?
  const [hasCookie, setHasCookie] = useState(false)
  // How many items the *server* believes this session added (only tracked with a cookie).
  const [cart, setCart] = useState(0)
  const [reqCount, setReqCount] = useState(0)
  const [log, setLog] = useState<LogLine[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [tick, setTick] = useState(0)

  // The request/response content for the current in-flight exchange.
  const pending = useRef<{ setCookie: boolean; recognised: boolean; cartAfter: number }>({
    setCookie: false,
    recognised: false,
    cartAfter: 0,
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    const ph = phaseRef.current
    const t = clockRef.current
    const recognised = hasCookie

    // ---- header ----
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText('HTTP keeps no memory. A cookie is a token the browser stores and re-sends.', browserX, 22)

    // ---- browser box ----
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = `${RED}88`
    ctx.lineWidth = 1.4
    roundRect(ctx, browserX, boxTop, boxW, boxH, 8)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = RED
    ctx.font = 'bold 10px monospace'
    ctx.fillText('BROWSER', browserX + 12, boxTop + 16)

    // cookie jar
    ctx.font = '10px monospace'
    ctx.fillStyle = MUTE
    ctx.fillText('cookie store', browserX + 12, boxTop + 40)
    if (hasCookie) {
      ctx.fillStyle = `${GOLD}22`
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 1.2
      roundRect(ctx, browserX + 12, boxTop + 50, boxW - 24, 30, 5)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = GOLD
      ctx.font = 'bold 11px monospace'
      ctx.fillText(SESSION_ID, browserX + 22, boxTop + 69)
    } else {
      ctx.strokeStyle = 'rgba(245,240,232,0.14)'
      ctx.setLineDash([4, 3])
      ctx.lineWidth = 1
      roundRect(ctx, browserX + 12, boxTop + 50, boxW - 24, 30, 5)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = FAINT
      ctx.font = '10px monospace'
      ctx.fillText('(empty)', browserX + 22, boxTop + 69)
    }

    // ---- server box ----
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = `${BLUE}88`
    ctx.lineWidth = 1.4
    roundRect(ctx, serverX, boxTop, boxW, boxH, 8)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = BLUE
    ctx.font = 'bold 10px monospace'
    ctx.fillText('SERVER', serverX + 12, boxTop + 16)

    ctx.font = '10px monospace'
    ctx.fillStyle = MUTE
    ctx.fillText('sees this request as:', serverX + 12, boxTop + 40)
    const who = recognised ? 'known session' : 'a stranger'
    ctx.fillStyle = recognised ? GREEN : RED
    ctx.font = 'bold 11px monospace'
    ctx.fillText(who, serverX + 12, boxTop + 58)
    ctx.font = '10px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText(recognised ? `session ${SESSION_ID.split('=')[1]}` : 'no cookie attached', serverX + 12, boxTop + 74)

    // cart state (only meaningful with a session)
    ctx.fillStyle = MUTE
    ctx.fillText('cart for session:', serverX + 12, boxTop + 100)
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = recognised ? GREEN : FAINT
    ctx.fillText(recognised ? `${cart} item${cart === 1 ? '' : 's'}` : '— (nobody to store for)', serverX + 12, boxTop + 118)

    // ---- wire ----
    ctx.strokeStyle = 'rgba(245,240,232,0.16)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(wireX0, wireY)
    ctx.lineTo(wireX1, wireY)
    ctx.stroke()

    // ---- packet in flight ----
    let px: number | null = null
    let outbound = true
    if (ph === 'flight-out') {
      px = wireX0 + (wireX1 - wireX0) * Math.min(1, t / OUT_MS)
      outbound = true
    } else if (ph === 'flight-back') {
      px = wireX1 - (wireX1 - wireX0) * Math.min(1, t / BACK_MS)
      outbound = false
    }
    if (px !== null) {
      let label: string
      let col: string
      if (outbound) {
        // request carries the Cookie header only if the browser holds one
        label = hasCookie ? `Cookie: ${SESSION_ID}` : 'GET /  (no cookie)'
        col = hasCookie ? GOLD : RED
      } else {
        label = pending.current.setCookie ? `Set-Cookie: ${SESSION_ID}` : '200 OK'
        col = pending.current.setCookie ? GOLD : pending.current.recognised ? GREEN : RED
      }
      ctx.fillStyle = col
      ctx.strokeStyle = col
      ctx.beginPath()
      ctx.arc(px, wireY, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(label, px, wireY - 12)
      const dir = outbound ? 1 : -1
      ctx.beginPath()
      ctx.moveTo(px + dir * 10, wireY - 4)
      ctx.lineTo(px + dir * 16, wireY)
      ctx.lineTo(px + dir * 10, wireY + 4)
      ctx.stroke()
    }

    // ---- request log ----
    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    ctx.fillStyle = MUTE
    ctx.fillText('request log', browserX, 238)
    const lines = log.slice(-4)
    lines.forEach((l, i) => {
      ctx.fillStyle = l.color
      ctx.fillText(`› ${l.text}`, browserX, 256 + i * 16)
    })
    if (lines.length === 0) {
      ctx.fillStyle = FAINT
      ctx.fillText('Press Send with no cookie — the server greets a stranger every time.', browserX, 256)
    }
  }, [hasCookie, cart, log])

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
      const dur = ph === 'flight-out' ? OUT_MS : BACK_MS
      if (clockRef.current >= dur) {
        clockRef.current = 0
        if (ph === 'flight-out') {
          phaseRef.current = 'flight-back'
          setPhase('flight-back')
        } else {
          // response arrives — apply its effects
          const p = pending.current
          if (p.setCookie) setHasCookie(true)
          setCart(p.cartAfter)
          phaseRef.current = 'done'
          setPhase('done')
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

  useEffect(() => { draw() }, [draw, tick])

  const pushLog = (text: string, color: string) =>
    setLog(prev => [...prev.slice(-3), { text, color }])

  // A plain page request: recognised only if a cookie is already held.
  const sendRequest = () => {
    if (phase === 'flight-out' || phase === 'flight-back') return
    const n = reqCount + 1
    setReqCount(n)
    pending.current = { setCookie: false, recognised: hasCookie, cartAfter: cart }
    pushLog(
      hasCookie
        ? `#${n} GET / + Cookie → 200, welcome back (cart ${cart})`
        : `#${n} GET / no cookie → 200, hello stranger`,
      hasCookie ? GREEN : RED
    )
    clockRef.current = 0
    phaseRef.current = 'flight-out'
    setPhase('flight-out')
  }

  // Log in: the server issues a Set-Cookie, starting the session.
  const login = () => {
    if (phase === 'flight-out' || phase === 'flight-back') return
    if (hasCookie) return
    const n = reqCount + 1
    setReqCount(n)
    pending.current = { setCookie: true, recognised: false, cartAfter: 0 }
    pushLog(`#${n} POST /login → 200 Set-Cookie ${SESSION_ID}`, GOLD)
    clockRef.current = 0
    phaseRef.current = 'flight-out'
    setPhase('flight-out')
  }

  // Add to cart: only persists if the session cookie identifies the user.
  const addToCart = () => {
    if (phase === 'flight-out' || phase === 'flight-back') return
    const n = reqCount + 1
    setReqCount(n)
    const after = hasCookie ? cart + 1 : 0
    pending.current = { setCookie: false, recognised: hasCookie, cartAfter: after }
    pushLog(
      hasCookie
        ? `#${n} POST /cart + Cookie → item saved (cart ${after})`
        : `#${n} POST /cart no cookie → server can't attribute it, lost`,
      hasCookie ? GREEN : RED
    )
    clockRef.current = 0
    phaseRef.current = 'flight-out'
    setPhase('flight-out')
  }

  const clearCookie = () => {
    cancelAnimationFrame(rafRef.current)
    setHasCookie(false)
    setCart(0)
    phaseRef.current = 'done'
    setPhase('done')
    pushLog('browser cleared cookie — the server will forget you', RED)
  }

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: () => { /* static until the reader drives it */ },
  })

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setHasCookie(false)
    setCart(0)
    setReqCount(0)
    setLog([])
    clockRef.current = 0
    phaseRef.current = 'idle'
    setPhase('idle')
    triggerReset()
  }

  const busy = phase === 'flight-out' || phase === 'flight-back'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Statelessness and cookies</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: Statelessness and cookies. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={sendRequest}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors disabled:opacity-40"
        >
          <Send size={12} /> Send request
        </button>
        <button
          onClick={login}
          disabled={busy || hasCookie}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors disabled:opacity-40"
        >
          <Cookie size={12} /> Log in (Set-Cookie)
        </button>
        <button
          onClick={addToCart}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors disabled:opacity-40"
        >
          + Add to cart
        </button>
        <button
          onClick={clearCookie}
          disabled={busy || !hasCookie}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors disabled:opacity-40"
        >
          <XCircle size={12} /> Clear cookie
        </button>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          {hasCookie
            ? <>session <strong className="text-accent-gold">active</strong></>
            : <>server sees a <strong style={{ color: RED }}>stranger</strong></>}
        </WidgetStatus>
      </div>
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
