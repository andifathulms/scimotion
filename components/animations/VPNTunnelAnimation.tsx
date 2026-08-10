'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

// Palette
const RED = '#F87171'    // accent — the tunnel / VPN
const GOLD = '#F59E0B'   // the outer (public) wrapper + gateway public IP
const BLUE = '#60A5FA'   // the remote laptop
const VIOLET = '#A78BFA' // the inner (private) packet
const GREEN = '#10B981'  // the private server + reply
const MUTE = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.26)'

const PRIV_SERVER = '10.0.0.5'
const GATE_PUBLIC = '203.0.113.9'
const LAPTOP = 'remote laptop'

// Geometry: laptop (left) → public internet → VPN gateway → private server (right).
const DEV_X = 18
const DEV_W = 104
const DEV_Y = 116
const DEV_H = 88
const devR = DEV_X + DEV_W // 122
const devCX = DEV_X + DEV_W / 2

const GATE_X = 372
const GATE_W = 76
const GATE_Y = 120
const GATE_H = 80
const gateL = GATE_X
const gateR = GATE_X + GATE_W // 448
const gateCX = GATE_X + GATE_W / 2

const SRV_X = 500
const SRV_W = 88
const SRV_Y = 124
const SRV_H = 72
const srvL = SRV_X
const srvCX = SRV_X + SRV_W / 2

const WIRE_Y = 160
const FLIGHT_MS = 1200

type Mode = 'vpn' | 'off'
type Seg = 'dev-gate' | 'gate-srv' | 'srv-gate' | 'gate-dev' | 'dev-mid'

type Step = {
  seg: Seg
  dir: 1 | -1
  wrapped: boolean
  outerLabel: string
  innerLabel: string
  color: string
  drop?: boolean
  caption: string
}

// With the VPN: wrap → carry → unwrap → deliver, then the mirror image for the reply.
const VPN_STEPS: Step[] = [
  {
    seg: 'dev-gate',
    dir: 1,
    wrapped: true,
    outerLabel: `outer · dst ${GATE_PUBLIC}`,
    innerLabel: `dst ${PRIV_SERVER}`,
    color: GOLD,
    caption: '1 · Encapsulate — the private packet (dst 10.0.0.5) is sealed inside an outer packet addressed to the gateway, then carried across the public internet.',
  },
  {
    seg: 'gate-srv',
    dir: 1,
    wrapped: false,
    outerLabel: '',
    innerLabel: `dst ${PRIV_SERVER}`,
    color: VIOLET,
    caption: '2 · Unwrap — the gateway strips the outer wrapper and the inner packet emerges onto the private network, reaching the server as if the laptop were plugged in locally.',
  },
  {
    seg: 'srv-gate',
    dir: -1,
    wrapped: false,
    outerLabel: '',
    innerLabel: 'reply → laptop',
    color: GREEN,
    caption: '3 · The server answers, sending its reply back across the private network toward the gateway.',
  },
  {
    seg: 'gate-dev',
    dir: -1,
    wrapped: true,
    outerLabel: `outer · dst ${LAPTOP}`,
    innerLabel: 'reply',
    color: GOLD,
    caption: '4 · The reply is wrapped the same way, tunnelled back across the public internet, and unwrapped at the laptop. A packet within a packet reached a place the outer network cannot route to.',
  },
]

// Without the VPN: a bare private-addressed packet has nowhere to go.
const OFF_STEPS: Step[] = [
  {
    seg: 'dev-mid',
    dir: 1,
    wrapped: false,
    outerLabel: '',
    innerLabel: `dst ${PRIV_SERVER}`,
    color: RED,
    drop: true,
    caption: 'Without a VPN, a packet for a private 10.x address is unroutable on the public internet — no backbone router will forward it. Dropped.',
  },
]

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function segEnds(seg: Seg): [number, number] {
  switch (seg) {
    case 'dev-gate': return [devR, gateL]
    case 'gate-srv': return [gateR, srvL]
    case 'srv-gate': return [srvL, gateR]
    case 'gate-dev': return [gateL, devR]
    case 'dev-mid': return [devR, 250]
  }
}

export function VPNTunnelAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const clockRef = useRef(0)
  const stepRef = useRef(-1)
  const progRef = useRef(0)
  const modeRef = useRef<Mode>('vpn')

  const [running, setRunning] = useState(false)
  const [mode, setMode] = useState<Mode>('vpn')
  const [tick, setTick] = useState(0)

  const steps = () => (modeRef.current === 'vpn' ? VPN_STEPS : OFF_STEPS)

  const drawPacket = useCallback(
    (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: Step, faded: boolean) => {
      const a = faded ? 0.35 : 1
      if (s.wrapped) {
        // Outer public wrapper …
        const ow = 132, oh = 46
        ctx.globalAlpha = a
        ctx.fillStyle = `${GOLD}1F`
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 1.6
        roundRect(ctx, cx - ow / 2, cy - oh / 2, ow, oh, 8)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = GOLD
        ctx.font = 'bold 9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(s.outerLabel, cx, cy - oh / 2 - 5)
        // … containing the inner private packet.
        const iw = 94, ih = 22
        ctx.fillStyle = `${VIOLET}2A`
        ctx.strokeStyle = VIOLET
        ctx.lineWidth = 1.4
        roundRect(ctx, cx - iw / 2, cy - ih / 2, iw, ih, 5)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = VIOLET
        ctx.font = 'bold 9px monospace'
        ctx.fillText(s.innerLabel, cx, cy + 3)
        ctx.globalAlpha = 1
      } else {
        const pw = 108, ph = 26
        ctx.globalAlpha = a
        ctx.fillStyle = `${s.color}22`
        ctx.strokeStyle = s.color
        ctx.lineWidth = 1.5
        roundRect(ctx, cx - pw / 2, cy - ph / 2, pw, ph, 6)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = s.color
        ctx.font = 'bold 9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(s.innerLabel, cx, cy + 3)
        ctx.globalAlpha = 1
      }
    },
    []
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    const m = modeRef.current
    const arr = m === 'vpn' ? VPN_STEPS : OFF_STEPS
    const step = stepRef.current
    const prog = progRef.current

    // ---- zone labels ----
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = FAINT
    ctx.fillText('public internet', (devR + gateL) / 2, 28)
    ctx.fillText('private LAN', (gateR + srvL) / 2 + 20, 28)

    // ---- the tunnel over the public segment (only with VPN) ----
    if (m === 'vpn') {
      ctx.fillStyle = 'rgba(248,113,113,0.06)'
      ctx.strokeStyle = `${RED}66`
      ctx.lineWidth = 1.2
      roundRect(ctx, devR + 4, WIRE_Y - 34, gateL - devR - 8, 68, 14)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = RED
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('encrypted VPN tunnel', (devR + gateL) / 2, WIRE_Y - 40)
    }

    // ---- wires ----
    ctx.strokeStyle = 'rgba(245,240,232,0.16)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(devR, WIRE_Y); ctx.lineTo(gateL, WIRE_Y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(gateR, WIRE_Y); ctx.lineTo(srvL, WIRE_Y); ctx.stroke()

    // ---- remote laptop ----
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = `${BLUE}99`
    ctx.lineWidth = 1.5
    roundRect(ctx, DEV_X, DEV_Y, DEV_W, DEV_H, 10)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = BLUE
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('laptop', devCX, DEV_Y + 22)
    ctx.fillStyle = MUTE
    ctx.font = '9px monospace'
    ctx.fillText('at home', devCX, DEV_Y + 38)
    ctx.fillStyle = FAINT
    ctx.fillText('wants 10.0.0.5', devCX, DEV_Y + 66)

    // ---- VPN gateway ----
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = m === 'vpn' ? RED : `${RED}66`
    ctx.lineWidth = m === 'vpn' ? 2.2 : 1.4
    roundRect(ctx, GATE_X, GATE_Y, GATE_W, GATE_H, 10)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = RED
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('VPN', gateCX, GATE_Y + 22)
    ctx.fillText('gateway', gateCX, GATE_Y + 36)
    ctx.fillStyle = GOLD
    ctx.font = '9px monospace'
    ctx.fillText(GATE_PUBLIC, gateCX, GATE_Y + 60)

    // ---- private server ----
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = `${GREEN}99`
    ctx.lineWidth = 1.5
    roundRect(ctx, SRV_X, SRV_Y, SRV_W, SRV_H, 8)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = GREEN
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('server', srvCX, SRV_Y + 26)
    ctx.fillStyle = MUTE
    ctx.font = '10px monospace'
    ctx.fillText(PRIV_SERVER, srvCX, SRV_Y + 46)

    // ---- packet in flight ----
    if (step >= 0 && step < arr.length) {
      const s = arr[step]
      const [x0, x1] = segEnds(s.seg)
      const px = x0 + (x1 - x0) * prog
      if (s.drop && prog >= 1) {
        // drop marker
        ctx.strokeStyle = RED
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(px - 8, WIRE_Y - 8); ctx.lineTo(px + 8, WIRE_Y + 8)
        ctx.moveTo(px + 8, WIRE_Y - 8); ctx.lineTo(px - 8, WIRE_Y + 8)
        ctx.stroke()
        ctx.fillStyle = RED
        ctx.font = 'bold 10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('unroutable — dropped', px, WIRE_Y + 28)
      } else {
        drawPacket(ctx, px, WIRE_Y, s, false)
      }
    }

    // ---- caption ----
    ctx.textAlign = 'center'
    ctx.font = '10px monospace'
    if (step === -1) {
      ctx.fillStyle = MUTE
      ctx.fillText(
        m === 'vpn'
          ? 'Press Run (or Step) to send a packet through the tunnel.'
          : 'Press Run (or Step) to try reaching 10.0.0.5 with no VPN.',
        W / 2, H - 40
      )
    } else if (step >= arr.length) {
      ctx.fillStyle = m === 'vpn' ? GREEN : RED
      ctx.fillText(
        m === 'vpn'
          ? 'Round trip complete — a private address was reached across the public internet.'
          : 'The private network is simply unreachable from out here.',
        W / 2, H - 40
      )
    } else {
      const s = arr[step]
      ctx.fillStyle = s.color
      // wrap caption across up to two lines
      const words = s.caption.split(' ')
      const lines: string[] = []
      let cur = ''
      for (const word of words) {
        const test = cur ? `${cur} ${word}` : word
        if (test.length > 72) { lines.push(cur); cur = word } else cur = test
      }
      if (cur) lines.push(cur)
      lines.slice(0, 3).forEach((ln, i) => ctx.fillText(ln, W / 2, H - 52 + i * 14))
    }

    ctx.textAlign = 'left'
  }, [drawPacket])

  const beginStep = (i: number) => {
    stepRef.current = i
    progRef.current = 0
    clockRef.current = 0
  }

  useEffect(() => {
    if (!running) { draw(); return }
    let last = performance.now()
    const loop = (now: number) => {
      const dt = now - last
      last = now
      clockRef.current += dt
      progRef.current = Math.min(1, clockRef.current / FLIGHT_MS)
      if (progRef.current >= 1) {
        const next = stepRef.current + 1
        if (next >= steps().length) {
          stepRef.current = steps().length
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

  useEffect(() => { draw() }, [draw, tick])

  const run = () => {
    if (stepRef.current >= steps().length || stepRef.current === -1) beginStep(0)
    setRunning(true)
  }

  const stepOnce = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    let cur = stepRef.current
    if (cur === -1 || cur >= steps().length) cur = -1
    const next = cur + 1
    if (next >= steps().length) {
      stepRef.current = steps().length
      progRef.current = 1
      draw()
      return
    }
    stepRef.current = next
    progRef.current = 1
    draw()
  }

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        stepRef.current = steps().length
        progRef.current = 1
        draw()
      } else {
        run()
      }
    },
  })

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    stepRef.current = -1
    progRef.current = 0
    clockRef.current = 0
    setRunning(false)
    triggerReset()
    draw()
  }, [draw, triggerReset])

  const toggleMode = () => {
    cancelAnimationFrame(rafRef.current)
    const v: Mode = modeRef.current === 'vpn' ? 'off' : 'vpn'
    modeRef.current = v
    setMode(v)
    stepRef.current = -1
    progRef.current = 0
    clockRef.current = 0
    setRunning(false)
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · A packet inside a packet</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: A packet inside a packet. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => (running ? setRunning(false) : run())}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: RED, color: '#0F0D0A' }}
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
          onClick={toggleMode}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
          style={{ borderColor: mode === 'vpn' ? RED : GOLD, color: mode === 'vpn' ? RED : GOLD }}
        >
          {mode === 'vpn' ? 'VPN: on' : 'VPN: off'}
        </button>
      </div>
    </div>
  )
}
