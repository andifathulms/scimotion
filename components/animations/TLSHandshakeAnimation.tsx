'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, SkipForward, Eye, EyeOff } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 380

// Palette
const RED = '#F87171'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const CYAN = '#22D3EE'
const INK = 'rgba(255,245,235,0.6)'
const MUTE = 'rgba(255,245,235,0.4)'
const FAINT = 'rgba(255,245,235,0.1)'

// Geometry: client on the left, server on the right, the wire between them,
// and the eavesdropper's capture log along the bottom.
const CLIENT_X = 78
const SERVER_X = 522
const WIRE_Y = 150

const HOST = 'shop.example.com'

// One step of the handshake / data exchange. `clear` messages travel the wire in
// readable form; encrypted ones are opaque ciphertext. `eve` is what the tap sees.
type Kind = 'hello' | 'cert' | 'keyshare' | 'appdata'
type Step = {
  kind: Kind
  dir: 1 | -1 // 1 = client→server, -1 = server→client
  label: string // shown on the packet
  clear: boolean // is the payload readable on the wire?
  color: string
  eve: string // the eavesdropper's capture line
  note: string // status caption while this step is in flight / just landed
}

const STEPS: Step[] = [
  {
    kind: 'hello',
    dir: 1,
    label: 'ClientHello',
    clear: true,
    color: GOLD,
    eve: `SNI: ${HOST}  ·  cipher list  ·  client random`,
    note: '1 · ClientHello — ciphers offered, and the hostname (SNI) sent in the clear',
  },
  {
    kind: 'cert',
    dir: -1,
    label: 'ServerHello + Certificate',
    clear: true,
    color: BLUE,
    eve: 'certificate + server public key  (public by design)',
    note: '2 · Server presents its certificate and public key — both are meant to be public',
  },
  {
    kind: 'keyshare',
    dir: 1,
    label: 'key share (ephemeral)',
    clear: true,
    color: VIOLET,
    eve: 'g^a  —  needs g^ab to get the key, and cannot',
    note: '3 · Ephemeral key exchange — public-key math lets both sides derive one shared secret',
  },
  {
    kind: 'appdata',
    dir: 1,
    label: '▓▓▓ encrypted',
    clear: false,
    color: GREEN,
    eve: '░░░░░░░░  ciphertext (symmetric)',
    note: '4 · Switch to fast symmetric crypto — the real data flows encrypted',
  },
  {
    kind: 'appdata',
    dir: -1,
    label: '▓▓▓ encrypted',
    clear: false,
    color: GREEN,
    eve: '░░░░░░░░  ciphertext (symmetric)',
    note: '4 · Switch to fast symmetric crypto — the real data flows encrypted',
  },
]

const FLIGHT_MS = 1100 // time for one packet to cross the wire

export function TLSHandshakeAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const clockRef = useRef(0)
  const stepRef = useRef(-1) // -1 = idle, 0..STEPS.length-1 in flight, STEPS.length = done
  const progRef = useRef(0) // 0..1 progress of the current packet across the wire
  const eveRef = useRef<string[]>([])
  const showEveRef = useRef(true)

  const [running, setRunning] = useState(false)
  const [showEve, setShowEve] = useState(true)
  const [tick, setTick] = useState(0)

  const keyEstablished = () => stepRef.current > 2 // session key derived once key share lands

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    const step = stepRef.current
    const prog = progRef.current
    const established = keyEstablished()

    // ---- endpoint columns ----
    ctx.textAlign = 'center'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = RED
    ctx.fillText('CLIENT', CLIENT_X, 30)
    ctx.fillStyle = CYAN
    ctx.fillText('SERVER', SERVER_X, 30)
    ctx.font = '9px monospace'
    ctx.fillStyle = MUTE
    ctx.fillText('your browser', CLIENT_X, 44)
    ctx.fillText(HOST, SERVER_X, 44)

    // endpoint boxes
    drawBox(ctx, CLIENT_X - 58, 54, 116, 150, RED)
    drawBox(ctx, SERVER_X - 58, 54, 116, 150, CYAN)

    // ---- the shared session key at each endpoint (appears once derived) ----
    for (const cx of [CLIENT_X, SERVER_X]) {
      const ky = 176
      if (established) {
        ctx.fillStyle = `${GOLD}22`
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 1.4
        roundRect(ctx, cx - 46, ky - 16, 92, 26, 6)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = GOLD
        ctx.font = 'bold 9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('shared key', cx, ky - 3)
        ctx.font = '8px monospace'
        ctx.fillStyle = MUTE
        ctx.fillText('(symmetric)', cx, ky + 6)
      } else {
        ctx.strokeStyle = FAINT
        ctx.lineWidth = 1
        roundRect(ctx, cx - 46, ky - 16, 92, 26, 6)
        ctx.stroke()
        ctx.fillStyle = FAINT
        ctx.font = '8px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('no shared key yet', cx, ky)
      }
    }

    // small key-role captions inside the boxes
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = MUTE
    ctx.fillText('keeps secret a', CLIENT_X, 74)
    ctx.fillStyle = VIOLET
    ctx.fillText('private key + cert', SERVER_X, 74)

    // ---- the wire ----
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(CLIENT_X + 58, WIRE_Y)
    ctx.lineTo(SERVER_X - 58, WIRE_Y)
    ctx.stroke()
    ctx.fillStyle = FAINT
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('the open wire (TCP)', W / 2, WIRE_Y - 46)

    // ---- packet in flight ----
    if (step >= 0 && step < STEPS.length) {
      const s = STEPS[step]
      const x0 = s.dir === 1 ? CLIENT_X + 58 : SERVER_X - 58
      const x1 = s.dir === 1 ? SERVER_X - 58 : CLIENT_X + 58
      const px = x0 + (x1 - x0) * prog
      const opaque = !s.clear
      const col = s.color

      // packet body
      ctx.fillStyle = opaque ? `${col}33` : `${col}22`
      ctx.strokeStyle = col
      ctx.lineWidth = 1.5
      const bw = 118
      roundRect(ctx, px - bw / 2, WIRE_Y - 12, bw, 24, 6)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = col
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(s.label, px, WIRE_Y + 3)
      // direction chevron
      const dir = s.dir
      ctx.strokeStyle = col
      ctx.beginPath()
      ctx.moveTo(px + dir * (bw / 2 + 2), WIRE_Y - 4)
      ctx.lineTo(px + dir * (bw / 2 + 8), WIRE_Y)
      ctx.lineTo(px + dir * (bw / 2 + 2), WIRE_Y + 4)
      ctx.stroke()
      // a little tap line dropping to Eve
      if (showEveRef.current) {
        ctx.strokeStyle = FAINT
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.moveTo(px, WIRE_Y + 12)
        ctx.lineTo(px, 236)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // ---- status caption ----
    ctx.textAlign = 'center'
    ctx.font = '10px monospace'
    if (step === -1) {
      ctx.fillStyle = MUTE
      ctx.fillText('Press Run (or Step) to open a TLS connection.', W / 2, WIRE_Y - 26)
    } else if (step >= STEPS.length) {
      ctx.fillStyle = GREEN
      ctx.fillText('Encrypted channel open — public key bootstrapped it, symmetric key does the work.', W / 2, WIRE_Y - 26)
    } else {
      ctx.fillStyle = STEPS[step].color
      ctx.fillText(STEPS[step].note, W / 2, WIRE_Y - 26)
    }

    // ---- eavesdropper capture panel ----
    if (showEveRef.current) {
      const ex = 40
      const ey = 236
      const ew = W - 80
      const eh = 116
      ctx.fillStyle = 'rgba(248,113,113,0.05)'
      ctx.strokeStyle = `${RED}66`
      ctx.lineWidth = 1.2
      roundRect(ctx, ex, ey, ew, eh, 8)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = RED
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'left'
      ctx.fillText('EAVESDROPPER on the wire — everything it captures:', ex + 12, ey + 18)

      ctx.font = '9px monospace'
      const lines = eveRef.current
      if (lines.length === 0) {
        ctx.fillStyle = MUTE
        ctx.fillText('…nothing yet', ex + 12, ey + 40)
      }
      lines.slice(-5).forEach((ln, i) => {
        const isCipher = ln.startsWith('░')
        ctx.fillStyle = isCipher ? MUTE : INK
        ctx.fillText(`› ${ln}`, ex + 12, ey + 38 + i * 15)
      })

      // verdict
      ctx.font = 'bold 9px monospace'
      ctx.fillStyle = established ? GREEN : GOLD
      ctx.textAlign = 'right'
      const verdict = established
        ? 'session key never crossed the wire — data is unreadable'
        : 'sees handshake metadata, but no session key'
      ctx.fillText(verdict, ex + ew - 12, ey + eh - 10)
    } else {
      ctx.fillStyle = FAINT
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('(eavesdropper hidden — toggle it back on to see what the tap captures)', W / 2, 300)
    }
  }, [])

  // Record what Eve captures the instant a packet lands.
  const capture = (step: number) => {
    if (step < 0 || step >= STEPS.length) return
    eveRef.current = [...eveRef.current, STEPS[step].eve]
  }

  const beginStep = (i: number) => {
    stepRef.current = i
    progRef.current = 0
    clockRef.current = 0
  }

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    let last = performance.now()
    const loop = (now: number) => {
      const dt = now - last
      last = now
      clockRef.current += dt
      progRef.current = Math.min(1, clockRef.current / FLIGHT_MS)
      if (progRef.current >= 1) {
        capture(stepRef.current)
        const next = stepRef.current + 1
        if (next >= STEPS.length) {
          stepRef.current = STEPS.length
          setRunning(false)
          draw()
          return
        }
        beginStep(next)
      }
      draw()
      setTick(t => t + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => {
    draw()
  }, [draw, tick])

  const run = () => {
    if (stepRef.current >= STEPS.length || stepRef.current === -1) {
      eveRef.current = []
      beginStep(0)
    }
    setRunning(true)
  }

  // Advance exactly one step and land it (no auto-run).
  const stepOnce = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    let cur = stepRef.current
    if (cur === -1 || cur >= STEPS.length) {
      eveRef.current = []
      cur = -1
    }
    const next = cur + 1
    if (next >= STEPS.length) {
      // finish: land the last step
      capture(STEPS.length - 1)
      stepRef.current = STEPS.length
      progRef.current = 1
      draw()
      return
    }
    stepRef.current = next
    progRef.current = 1
    capture(next)
    draw()
  }

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Land everything immediately for reduced-motion users.
        eveRef.current = STEPS.map(s => s.eve)
        stepRef.current = STEPS.length
        progRef.current = 1
        draw()
      } else {
        run()
      }
    },
  })

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    stepRef.current = -1
    progRef.current = 0
    clockRef.current = 0
    eveRef.current = []
    setRunning(false)
    triggerReset()
    draw()
  }

  const toggleEve = () => {
    const v = !showEve
    setShowEve(v)
    showEveRef.current = v
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The TLS handshake</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: The TLS handshake. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => (running ? setRunning(false) : run())}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <button
          onClick={stepOnce}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors disabled:opacity-40"
        >
          <SkipForward size={12} /> Step
        </button>
        <button
          onClick={toggleEve}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs hover:bg-bg-hover transition-colors"
        >
          {showEve ? <><EyeOff size={12} /> Hide eavesdropper</> : <><Eye size={12} /> Show eavesdropper</>}
        </button>
      </div>
    </div>
  )
}

function drawBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = 'rgba(255,255,255,0.02)'
  ctx.strokeStyle = `${color}88`
  ctx.lineWidth = 1.4
  roundRect(ctx, x, y, w, h, 8)
  ctx.fill()
  ctx.stroke()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
