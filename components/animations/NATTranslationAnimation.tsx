'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const RED = '#F87171'    // accent — the router / translation
const GOLD = '#F59E0B'   // the public side (ports, public IP)
const BLUE = '#60A5FA'   // device .11
const GREEN = '#10B981'  // device .12
const VIOLET = '#A78BFA' // device .13
const CYAN = '#22D3EE'   // the internet / server
const MUTE = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.28)'

const PUBLIC_IP = '203.0.113.7'
const SERVER_IP = '198.51.100.9'

type Device = { priv: string; port: number; color: string; label: string }
const DEVICES: Device[] = [
  { priv: '192.168.1.11', port: 51001, color: BLUE, label: '.11' },
  { priv: '192.168.1.12', port: 52344, color: GREEN, label: '.12' },
  { priv: '192.168.1.13', port: 53870, color: VIOLET, label: '.13' },
]

// A row of the NAT translation table.
type Row = { dev: number; privPort: number; pubPort: number; forward?: boolean }

// The packet currently in flight.
type Phase =
  | 'idle'
  | 'out-lan'   // device -> router (private src)
  | 'out-wan'   // router -> server (rewritten src)
  | 'reply-wan' // server -> router (dst = public)
  | 'reply-lan' // router -> device (translated back)
  | 'in-wan'    // unsolicited: server -> router
  | 'in-lan'    // unsolicited delivered via port-forward
  | 'drop'      // unsolicited dropped at router
  | 'done'

type Flight = { kind: 'out' | 'in'; dev: number; pubPort: number; phase: Phase; t: number }

// Geometry.
const DEV_X = 22
const DEV_W = 168
const DEV_H = 56
const DEV_Y = [26, 132, 238]
const devCY = (i: number) => DEV_Y[i] + DEV_H / 2

const RTR_X = 268
const RTR_Y = 116
const RTR_W = 92
const RTR_H = 108
const rtrCX = RTR_X + RTR_W / 2
const rtrCY = RTR_Y + RTR_H / 2

const SRV_X = 470
const SRV_Y = 128
const SRV_W = 110
const SRV_H = 84
const srvCX = SRV_X + SRV_W / 2
const srvCY = SRV_Y + SRV_H / 2

const LAN_MS = 720
const WAN_MS = 720

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export function NATTranslationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const flightRef = useRef<Flight | null>(null)
  const [table, setTable] = useState<Row[]>([])
  const tableRef = useRef<Row[]>([])
  const nextPortRef = useRef(40001)
  const [phase, setPhase] = useState<Phase>('idle')
  const [tick, setTick] = useState(0)
  const [active, setActive] = useState<number | null>(null) // active pub port for highlight

  tableRef.current = table

  // Ensure a mapping row exists for a device; return its public port.
  const ensureRow = useCallback((dev: number): number => {
    const existing = tableRef.current.find(r => r.dev === dev && !r.forward)
    if (existing) return existing.pubPort
    const pubPort = nextPortRef.current
    nextPortRef.current += 1
    const row: Row = { dev, privPort: DEVICES[dev].port, pubPort }
    setTable(prev => [...prev, row])
    return pubPort
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    const f = flightRef.current
    const ph: Phase = f ? f.phase : 'idle'

    // ---- section labels ----
    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText('LAN · private (RFC 1918)', DEV_X, 16)
    ctx.textAlign = 'center'
    ctx.fillText('router · NAT', rtrCX, 16)
    ctx.textAlign = 'right'
    ctx.fillText('internet · public', SRV_X + SRV_W, 16)

    // ---- wires ----
    ctx.strokeStyle = 'rgba(245,240,232,0.14)'
    ctx.lineWidth = 1.5
    for (let i = 0; i < DEVICES.length; i++) {
      ctx.beginPath()
      ctx.moveTo(DEV_X + DEV_W, devCY(i))
      ctx.lineTo(RTR_X, rtrCY)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(RTR_X + RTR_W, rtrCY)
    ctx.lineTo(SRV_X, srvCY)
    ctx.stroke()

    // ---- devices ----
    DEVICES.forEach((d, i) => {
      const on = f !== null && f.dev === i && ph !== 'idle' && ph !== 'done'
      ctx.fillStyle = 'rgba(255,255,255,0.02)'
      ctx.strokeStyle = on ? d.color : `${d.color}66`
      ctx.lineWidth = on ? 2 : 1.2
      roundRect(ctx, DEV_X, DEV_Y[i], DEV_W, DEV_H, 8)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = d.color
      ctx.font = 'bold 13px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(d.priv, DEV_X + 12, DEV_Y[i] + 24)
      ctx.fillStyle = MUTE
      ctx.font = '10px monospace'
      ctx.fillText(`port ${d.port}`, DEV_X + 12, DEV_Y[i] + 42)
    })

    // ---- router ----
    const rtrActive = ph === 'drop' || ph === 'out-lan' || ph === 'reply-lan'
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = rtrActive ? RED : `${RED}88`
    ctx.lineWidth = rtrActive ? 2.2 : 1.4
    roundRect(ctx, RTR_X, RTR_Y, RTR_W, RTR_H, 10)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = RED
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('NAT', rtrCX, RTR_Y + 26)
    ctx.fillStyle = GOLD
    ctx.font = '10px monospace'
    ctx.fillText(PUBLIC_IP, rtrCX, RTR_Y + 62)
    ctx.fillStyle = FAINT
    ctx.font = '9px monospace'
    ctx.fillText('one public IP', rtrCX, RTR_Y + 78)

    // ---- server / internet ----
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = `${CYAN}88`
    ctx.lineWidth = 1.4
    roundRect(ctx, SRV_X, SRV_Y, SRV_W, SRV_H, 8)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = CYAN
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('server', srvCX, SRV_Y + 30)
    ctx.fillStyle = MUTE
    ctx.font = '10px monospace'
    ctx.fillText(SERVER_IP, srvCX, SRV_Y + 50)

    // ---- packet in flight ----
    if (f && ph !== 'idle' && ph !== 'done') {
      const d = DEVICES[f.dev]
      let ax = 0, ay = 0, bx = 0, by = 0, prog = 0, label = '', col = d.color
      if (ph === 'out-lan') {
        ax = DEV_X + DEV_W; ay = devCY(f.dev); bx = RTR_X; by = rtrCY
        prog = f.t / LAN_MS
        label = `src ${d.priv}:${d.port}`
        col = d.color
      } else if (ph === 'out-wan') {
        ax = RTR_X + RTR_W; ay = rtrCY; bx = SRV_X; by = srvCY
        prog = f.t / WAN_MS
        label = `src ${PUBLIC_IP}:${f.pubPort}`
        col = GOLD
      } else if (ph === 'reply-wan') {
        ax = SRV_X; ay = srvCY; bx = RTR_X + RTR_W; by = rtrCY
        prog = f.t / WAN_MS
        label = `dst ${PUBLIC_IP}:${f.pubPort}`
        col = GOLD
      } else if (ph === 'reply-lan') {
        ax = RTR_X; ay = rtrCY; bx = DEV_X + DEV_W; by = devCY(f.dev)
        prog = f.t / LAN_MS
        label = `dst ${d.priv}:${d.port}`
        col = d.color
      } else if (ph === 'in-wan') {
        ax = SRV_X; ay = srvCY; bx = RTR_X + RTR_W; by = rtrCY
        prog = f.t / WAN_MS
        label = `dst ${PUBLIC_IP}:${f.pubPort}`
        col = GOLD
      } else if (ph === 'in-lan') {
        ax = RTR_X; ay = rtrCY; bx = DEV_X + DEV_W; by = devCY(f.dev)
        prog = f.t / LAN_MS
        label = `dst ${d.priv}:${d.port}`
        col = d.color
      } else if (ph === 'drop') {
        ax = RTR_X + RTR_W; ay = rtrCY; bx = RTR_X + RTR_W; by = rtrCY
        prog = 1
        label = ''
        col = RED
      }
      const t = Math.max(0, Math.min(1, prog))
      const px = ax + (bx - ax) * t
      const py = ay + (by - ay) * t
      if (ph !== 'drop') {
        const g = ctx.createRadialGradient(px, py, 0, px, py, 16)
        g.addColorStop(0, `${col}88`)
        g.addColorStop(1, `${col}00`)
        ctx.beginPath(); ctx.arc(px, py, 16, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
        ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill()
        ctx.fillStyle = col
        ctx.font = '10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(label, px, py - 14)
      }
    }

    // ---- translation flash at router ----
    if (ph === 'out-lan' || ph === 'reply-lan') {
      ctx.fillStyle = RED
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(ph === 'out-lan' ? 'rewrite src → public' : 'translate back', rtrCX, RTR_Y - 6)
    }

    // ---- dropped packet marker ----
    if (ph === 'drop') {
      const cx = RTR_X + RTR_W + 6
      const cy = rtrCY
      ctx.strokeStyle = RED
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(cx - 7, cy - 7); ctx.lineTo(cx + 7, cy + 7)
      ctx.moveTo(cx + 7, cy - 7); ctx.lineTo(cx - 7, cy + 7)
      ctx.stroke()
      ctx.fillStyle = RED
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'left'
      ctx.fillText('no table entry — dropped', cx + 16, cy + 4)
    }

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }, [])

  // rAF driver — self-scheduling for the lifetime of one flight phase chain.
  useEffect(() => {
    const f = flightRef.current
    if (!f || phase === 'idle' || phase === 'done') {
      draw()
      return
    }
    let last = performance.now()
    const loop = (now: number) => {
      const cur = flightRef.current
      if (!cur) return
      const dt = now - last
      last = now
      cur.t += dt
      const ph = cur.phase
      const dur =
        ph === 'out-lan' || ph === 'reply-lan' || ph === 'in-lan' ? LAN_MS
        : ph === 'drop' ? 1100
        : WAN_MS
      if (cur.t >= dur) {
        cur.t = 0
        let next: Phase = 'done'
        if (cur.kind === 'out') {
          next = ph === 'out-lan' ? 'out-wan'
            : ph === 'out-wan' ? 'reply-wan'
            : ph === 'reply-wan' ? 'reply-lan'
            : 'done'
        } else {
          // unsolicited inbound
          const fwd = tableRef.current.find(r => r.forward && r.pubPort === cur.pubPort)
          if (ph === 'in-wan') next = fwd ? 'in-lan' : 'drop'
          else next = 'done'
        }
        cur.phase = next
        setPhase(next)
        if (next === 'done') {
          setActive(null)
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

  useEffect(() => { draw() }, [draw, tick, table, active])

  const sendFrom = useCallback((dev: number) => {
    cancelAnimationFrame(rafRef.current)
    const pubPort = ensureRow(dev)
    setActive(pubPort)
    flightRef.current = { kind: 'out', dev, pubPort, phase: 'out-lan', t: 0 }
    setPhase('out-lan')
  }, [ensureRow])

  const unsolicited = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    // Aim at a fixed inbound port; delivered only if a port-forward row exists.
    const fwd = tableRef.current.find(r => r.forward)
    const pubPort = fwd ? fwd.pubPort : 40080
    const dev = fwd ? fwd.dev : 2
    setActive(fwd ? pubPort : null)
    flightRef.current = { kind: 'in', dev, pubPort, phase: 'in-wan', t: 0 }
    setPhase('in-wan')
  }, [])

  const addForward = useCallback(() => {
    setTable(prev => {
      if (prev.some(r => r.forward)) return prev
      return [...prev, { dev: 2, privPort: DEVICES[2].port, pubPort: 40080, forward: true }]
    })
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Show the end state directly: one mapping, no motion.
        const pubPort = ensureRow(0)
        setActive(pubPort)
        flightRef.current = { kind: 'out', dev: 0, pubPort, phase: 'done', t: 0 }
        setPhase('done')
      } else {
        sendFrom(0)
      }
    },
  })

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    flightRef.current = null
    nextPortRef.current = 40001
    setActive(null)
    setTable([])
    setPhase('idle')
    triggerReset()
    setTick(x => x + 1)
  }, [triggerReset])

  const busy = phase !== 'idle' && phase !== 'done'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · One public IP, many devices</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>

      {/* NAT translation table (accumulates as you send) */}
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono">
        <div className="text-text-muted mb-1">NAT translation table @ {PUBLIC_IP}</div>
        {table.length === 0 ? (
          <div style={{ color: FAINT }}>empty — send a packet to create a mapping</div>
        ) : (
          <div className="flex flex-col gap-1">
            {table.map(row => {
              const d = DEVICES[row.dev]
              const isActive = active !== null && row.pubPort === active
              return (
                <div
                  key={`${row.pubPort}-${row.forward ? 'f' : 'd'}`}
                  className="flex items-center gap-2 px-1 rounded"
                  style={{ background: isActive ? 'rgba(248,113,113,0.10)' : 'transparent' }}
                >
                  <span style={{ color: d.color }}>{d.priv}:{row.privPort}</span>
                  <span style={{ color: MUTE }}>↔</span>
                  <span style={{ color: GOLD }}>{PUBLIC_IP}:{row.pubPort}</span>
                  {row.forward && <span style={{ color: RED }}>· port-forward (inbound allowed)</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="animation-controls flex-wrap gap-2">
        {DEVICES.map((d, i) => (
          <button
            key={d.priv}
            onClick={() => sendFrom(i)}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
            style={{ background: d.color, color: '#0F0D0A' }}
          >
            Send from {d.label}
          </button>
        ))}
        <button
          onClick={unsolicited}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40"
          style={{ borderColor: GOLD, color: GOLD }}
        >
          Unsolicited inbound
        </button>
        <button
          onClick={addForward}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 text-text-muted"
          style={{ borderColor: 'var(--border, rgba(255,245,235,0.18))' }}
        >
          Add port-forward
        </button>
      </div>
    </div>
  )
}
