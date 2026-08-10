'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

// The one server, at one IP, that hosts every site below.
const SERVER_IP = '93.184.216.34'

type Site = {
  host: string
  color: string
  title: string
  body: string
  // Paths this virtual host actually serves; anything else is a 404.
  paths: string[]
}

const SITES: Site[] = [
  { host: 'blog.example.com', color: BLUE, title: 'The Example Blog', body: '<h1>Latest posts</h1>', paths: ['/', '/posts', '/about'] },
  { host: 'shop.example.com', color: GREEN, title: 'Example Shop', body: '<h1>Today’s deals</h1>', paths: ['/', '/cart', '/deals'] },
  { host: 'news.example.com', color: GOLD, title: 'Example News', body: '<h1>Breaking news</h1>', paths: ['/', '/world', '/tech'] },
  { host: 'wiki.example.com', color: VIOLET, title: 'Example Wiki', body: '<h1>Encyclopedia</h1>', paths: ['/', '/search'] },
]

const PATHS = ['/', '/posts', '/cart', '/tech', '/missing']

// Phases of a single request/response cycle, measured in virtual milliseconds.
type Phase = 'idle' | 'flight-out' | 'server' | 'flight-back' | 'done'

const OUT_MS = 900
const THINK_MS = 600
const BACK_MS = 900

export function HTTPRequestAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef<Phase>('idle')
  const clockRef = useRef(0)

  const [siteIdx, setSiteIdx] = useState(0)
  const [path, setPath] = useState('/')
  const [phase, setPhase] = useState<Phase>('idle')
  const [tick, setTick] = useState(0)

  const site = SITES[siteIdx]
  const found = useMemo(() => site.paths.includes(path), [site, path])
  const status = found ? '200 OK' : '404 Not Found'
  const statusColor = found ? GREEN : RED

  // Layout: browser box on the left, server box on the right, wire between them.
  const browserX = 24
  const serverX = 430
  const boxW = 146
  const boxTop = 92
  const boxH = 168
  const wireY = 176
  const wireX0 = browserX + boxW
  const wireX1 = serverX

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    const ph = phaseRef.current
    const t = clockRef.current

    // ---- title / instruction ----
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText('One TCP connection is already open. The browser sends a request; the server answers.', browserX, 22)

    // ---- the request being composed (top-left panel) ----
    ctx.font = '11px monospace'
    ctx.fillStyle = MUTE
    ctx.fillText('HTTP request', browserX, 44)
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = RED
    ctx.fillText(`GET ${path} HTTP/1.1`, browserX, 62)
    ctx.font = '11px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText(`Host: ${site.host}`, browserX, 78)

    // ---- browser box ----
    drawBox(ctx, browserX, boxTop, boxW, boxH, RED, 'BROWSER')
    ctx.font = '10px monospace'
    ctx.fillStyle = MUTE
    ctx.textAlign = 'left'
    ctx.fillText('resolved via DNS', browserX + 12, boxTop + 34)
    ctx.fillStyle = CYAN
    ctx.fillText(`→ ${SERVER_IP}`, browserX + 12, boxTop + 50)
    // Rendered page appears here once the response is back.
    if (ph === 'done') {
      const py = boxTop + 78
      ctx.fillStyle = 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = found ? site.color : RED
      ctx.lineWidth = 1
      roundRect(ctx, browserX + 12, py, boxW - 24, 66, 5)
      ctx.fill()
      ctx.stroke()
      if (found) {
        ctx.fillStyle = site.color
        ctx.font = 'bold 10px monospace'
        ctx.fillText(site.title, browserX + 22, py + 22)
        ctx.fillStyle = MUTE
        ctx.font = '9px monospace'
        ctx.fillText('rendered page', browserX + 22, py + 40)
        ctx.fillStyle = FAINT
        ctx.fillRect(browserX + 22, py + 48, boxW - 60, 3)
        ctx.fillRect(browserX + 22, py + 55, boxW - 76, 3)
      } else {
        ctx.fillStyle = RED
        ctx.font = 'bold 13px monospace'
        ctx.fillText('404', browserX + 22, py + 30)
        ctx.font = '9px monospace'
        ctx.fillStyle = MUTE
        ctx.fillText('no such page', browserX + 22, py + 48)
      }
    }

    // ---- server box: ONE IP, MANY sites ----
    drawBox(ctx, serverX, boxTop, boxW, boxH, CYAN, 'SERVER')
    ctx.font = '10px monospace'
    ctx.fillStyle = CYAN
    ctx.textAlign = 'left'
    ctx.fillText(`IP ${SERVER_IP}`, serverX + 12, boxTop + 34)
    ctx.fillStyle = FAINT
    ctx.fillText('hosts many sites:', serverX + 12, boxTop + 50)
    // List the virtual hosts; the requested one lights up while the server "thinks".
    const routing = ph === 'server' || ph === 'flight-back' || ph === 'done'
    SITES.forEach((s, i) => {
      const ly = boxTop + 68 + i * 22
      const active = routing && i === siteIdx
      ctx.fillStyle = active ? `${s.color}22` : 'rgba(255,255,255,0.02)'
      ctx.strokeStyle = active ? s.color : 'rgba(245,240,232,0.12)'
      ctx.lineWidth = active ? 1.6 : 1
      roundRect(ctx, serverX + 12, ly, boxW - 24, 18, 4)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = active ? s.color : FAINT
      ctx.font = active ? 'bold 9px monospace' : '9px monospace'
      ctx.fillText(s.host, serverX + 20, ly + 13)
    })

    // ---- the wire ----
    ctx.strokeStyle = 'rgba(245,240,232,0.16)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(wireX0, wireY)
    ctx.lineTo(wireX1, wireY)
    ctx.stroke()

    // ---- the packet in flight ----
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
      const col = outbound ? RED : statusColor
      const label = outbound ? `GET ${path}` : status
      // arrow direction
      ctx.fillStyle = col
      ctx.strokeStyle = col
      ctx.beginPath()
      ctx.arc(px, wireY, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(label, px, wireY - 12)
      // little direction chevron
      const dir = outbound ? 1 : -1
      ctx.beginPath()
      ctx.moveTo(px + dir * 10, wireY - 4)
      ctx.lineTo(px + dir * 16, wireY)
      ctx.lineTo(px + dir * 10, wireY + 4)
      ctx.stroke()
    }

    // ---- server "thinking" flash ----
    if (ph === 'server') {
      ctx.fillStyle = GOLD
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('reading Host header → routing', (serverX + serverX + boxW) / 2, boxTop - 8)
    }

    // ---- response panel (bottom) once done ----
    ctx.textAlign = 'left'
    const ry = 278
    if (ph === 'done') {
      ctx.font = '11px monospace'
      ctx.fillStyle = MUTE
      ctx.fillText('HTTP response', browserX, ry)
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = statusColor
      ctx.fillText(`HTTP/1.1 ${status}`, browserX, ry + 18)
      ctx.font = '11px monospace'
      ctx.fillStyle = FAINT
      if (found) {
        ctx.fillText(`Content-Type: text/html   —   served by ${site.host}`, browserX, ry + 34)
        ctx.fillStyle = site.color
        ctx.fillText(site.body, browserX, ry + 50)
      } else {
        ctx.fillText(`${site.host} has no resource at ${path}`, browserX, ry + 34)
      }
    } else if (ph === 'idle') {
      ctx.font = '11px monospace'
      ctx.fillStyle = FAINT
      ctx.fillText('Press Send — then change the Host and watch one IP answer as a different site.', browserX, ry + 18)
    }
  }, [site, siteIdx, path, found, status, statusColor, browserX, serverX, boxW, boxTop, boxH, wireY, wireX0, wireX1])

  // Advance the animation clock.
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
      const dur = ph === 'flight-out' ? OUT_MS : ph === 'server' ? THINK_MS : BACK_MS
      if (clockRef.current >= dur) {
        clockRef.current = 0
        const next: Phase = ph === 'flight-out' ? 'server' : ph === 'server' ? 'flight-back' : 'done'
        phaseRef.current = next
        setPhase(next)
        if (next === 'done') { draw(); return }
      }
      setTick(x => x + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase, draw])

  useEffect(() => { draw() }, [draw, tick])

  const send = () => {
    cancelAnimationFrame(rafRef.current)
    clockRef.current = 0
    phaseRef.current = 'flight-out'
    setPhase('flight-out')
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

  const running = phase === 'flight-out' || phase === 'server' || phase === 'flight-back'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · One request, one IP, many sites</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={send}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors disabled:opacity-40"
        >
          <Send size={12} /> Send
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Host:</span>
          <select
            value={siteIdx}
            onChange={e => { setSiteIdx(+e.target.value); reset() }}
            className="px-2 py-1 rounded border border-border bg-bg-surface text-xs text-text-secondary"
          >
            {SITES.map((s, i) => <option key={s.host} value={i}>{s.host}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Path:</span>
          <select
            value={path}
            onChange={e => { setPath(e.target.value); reset() }}
            className="px-2 py-1 rounded border border-border bg-bg-surface text-xs text-text-secondary"
          >
            {PATHS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          same IP <strong className="text-accent-cyan">{SERVER_IP}</strong> →{' '}
          <strong style={{ color: found ? GREEN : RED }}>{status}</strong>
        </span>
      </div>
    </div>
  )
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
