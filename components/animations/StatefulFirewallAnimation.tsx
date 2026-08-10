'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 320

// Palette
const RED = '#F87171'    // accent — the firewall / block
const GOLD = '#F59E0B'   // the stranger / unsolicited
const BLUE = '#60A5FA'   // inside host
const GREEN = '#10B981'  // allowed
const CYAN = '#22D3EE'   // the server you called
const MUTE = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.24)'

const INSIDE_IP = '192.168.1.10'
const SERVER_IP = '93.184.216.34'
const STRANGER_IP = '203.0.113.66'
const PORT = 443

// Geometry
const HOST_X = 26, HOST_W = 150, HOST_Y = 96, HOST_H = 90
const hostCX = HOST_X + HOST_W / 2
const hostCY = HOST_Y + HOST_H / 2

const FW_X = 286, FW_W = 30, FW_Y = 60, FW_H = 180
const fwCX = FW_X + FW_W / 2

const NET_X = 424, NET_W = 150
const netCX = NET_X + NET_W / 2
const SERVER_CY = 96
const STRANGER_CY = 236

const LEG_MS = 720

type Mode = 'stateful' | 'stateless'
type StatelessRule = 'block-inbound' | 'allow-inbound'

// A connection recorded in the stateful firewall's state table.
type Conn = { peer: string; port: number }

type Kind = 'outbound' | 'inbound'
type Phase =
  | 'idle'
  | 'out-1'    // host -> firewall (SYN out)
  | 'out-2'    // firewall -> server
  | 'rep-1'    // server -> firewall (reply)
  | 'rep-2'    // firewall -> host (reply delivered)
  | 'in-1'     // stranger -> firewall (unsolicited SYN)
  | 'in-2'     // firewall -> host (allowed in)
  | 'block'    // dropped at firewall
  | 'done'

type Flight = { kind: Kind; phase: Phase; t: number; peerCY: number }

export function StatefulFirewallAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const flightRef = useRef<Flight | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [, setTick] = useState(0)
  const [mode, setMode] = useState<Mode>('stateful')
  const modeRef = useRef<Mode>(mode)
  modeRef.current = mode
  const [slRule, setSlRule] = useState<StatelessRule>('allow-inbound')
  const slRuleRef = useRef<StatelessRule>(slRule)
  slRuleRef.current = slRule
  const [conns, setConns] = useState<Conn[]>([])
  const connsRef = useRef<Conn[]>([])
  connsRef.current = conns
  const [event, setEvent] = useState('Initiate a connection, or try an unsolicited inbound one.')

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'
    const f = flightRef.current
    const ph: Phase = f ? f.phase : 'idle'

    // region labels
    ctx.font = '10px monospace'
    ctx.fillStyle = FAINT
    ctx.textAlign = 'left'
    ctx.fillText('your network', HOST_X, 30)
    ctx.textAlign = 'center'
    ctx.fillText(`firewall · ${modeRef.current}`, fwCX, 30)
    ctx.textAlign = 'right'
    ctx.fillText('the internet', NET_X + NET_W, 30)

    // wires
    ctx.strokeStyle = 'rgba(245,240,232,0.12)'
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.moveTo(HOST_X + HOST_W, hostCY); ctx.lineTo(FW_X, hostCY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(FW_X + FW_W, SERVER_CY); ctx.lineTo(NET_X, SERVER_CY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(FW_X + FW_W, STRANGER_CY); ctx.lineTo(NET_X, STRANGER_CY); ctx.stroke()

    // inside host
    const hostOn = f !== null && (f.kind === 'outbound' || ph === 'in-2')
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = hostOn ? BLUE : `${BLUE}66`
    ctx.lineWidth = hostOn ? 2 : 1.2
    ctx.beginPath(); ctx.roundRect(HOST_X, HOST_Y, HOST_W, HOST_H, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = BLUE
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('your laptop', hostCX, HOST_Y + 26)
    ctx.fillStyle = MUTE
    ctx.font = '10px monospace'
    ctx.fillText(INSIDE_IP, hostCX, HOST_Y + 46)

    // firewall
    ctx.fillStyle = 'rgba(248,113,113,0.10)'
    ctx.strokeStyle = RED
    ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.roundRect(FW_X, FW_Y, FW_W, FW_H, 6); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = 'rgba(248,113,113,0.35)'
    ctx.lineWidth = 0.8
    for (let y = FW_Y + 10; y < FW_Y + FW_H - 6; y += 13) {
      ctx.beginPath(); ctx.moveTo(FW_X, y); ctx.lineTo(FW_X + FW_W, y); ctx.stroke()
    }

    // server (the peer you called)
    const srvOn = f !== null && f.kind === 'outbound'
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = srvOn ? CYAN : `${CYAN}66`
    ctx.lineWidth = srvOn ? 2 : 1.2
    ctx.beginPath(); ctx.roundRect(NET_X, SERVER_CY - 30, NET_W, 60, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = CYAN
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('server you called', netCX, SERVER_CY - 6)
    ctx.fillStyle = MUTE
    ctx.font = '9px monospace'
    ctx.fillText(`${SERVER_IP}:${PORT}`, netCX, SERVER_CY + 12)

    // stranger (unsolicited)
    const strOn = f !== null && f.kind === 'inbound'
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = strOn ? GOLD : `${GOLD}66`
    ctx.lineWidth = strOn ? 2 : 1.2
    ctx.beginPath(); ctx.roundRect(NET_X, STRANGER_CY - 30, NET_W, 60, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = GOLD
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('a stranger', netCX, STRANGER_CY - 6)
    ctx.fillStyle = MUTE
    ctx.font = '9px monospace'
    ctx.fillText(STRANGER_IP, netCX, STRANGER_CY + 12)

    // packet in flight
    if (f && ph !== 'idle' && ph !== 'done' && ph !== 'block') {
      let ax = 0, ay = 0, bx = 0, by = 0, prog = 0, col = BLUE, label = ''
      if (ph === 'out-1') {
        ax = HOST_X + HOST_W; ay = hostCY; bx = FW_X; by = hostCY
        col = BLUE; label = `SYN → :${PORT}`
      } else if (ph === 'out-2') {
        ax = FW_X + FW_W; ay = hostCY; bx = NET_X; by = SERVER_CY
        col = BLUE; label = `SYN → :${PORT}`
      } else if (ph === 'rep-1') {
        ax = NET_X; ay = SERVER_CY; bx = FW_X + FW_W; by = hostCY
        col = GREEN; label = 'reply'
      } else if (ph === 'rep-2') {
        ax = FW_X; ay = hostCY; bx = HOST_X + HOST_W; by = hostCY
        col = GREEN; label = 'reply delivered'
      } else if (ph === 'in-1') {
        ax = NET_X; ay = STRANGER_CY; bx = FW_X + FW_W; by = STRANGER_CY
        col = GOLD; label = `SYN → :${PORT}`
      } else if (ph === 'in-2') {
        ax = FW_X; ay = STRANGER_CY; bx = HOST_X + HOST_W; by = hostCY
        col = RED; label = 'stranger let in'
      }
      prog = Math.max(0, Math.min(1, f.t / LEG_MS))
      const px = ax + (bx - ax) * prog
      const py = ay + (by - ay) * prog
      const g = ctx.createRadialGradient(px, py, 0, px, py, 15)
      g.addColorStop(0, `${col}88`); g.addColorStop(1, `${col}00`)
      ctx.beginPath(); ctx.arc(px, py, 15, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill()
      ctx.fillStyle = col
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(label, px, py - 13)
    }

    // blocked marker at the firewall
    if (ph === 'block') {
      const cx = fwCX
      const cy = STRANGER_CY
      ctx.strokeStyle = RED
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(cx - 8, cy - 8); ctx.lineTo(cx + 8, cy + 8)
      ctx.moveTo(cx + 8, cy - 8); ctx.lineTo(cx - 8, cy + 8)
      ctx.stroke()
      ctx.fillStyle = RED
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('BLOCKED', cx, cy + 26)
    }

    // event line
    ctx.fillStyle = 'rgba(245,240,232,0.62)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`› ${event}`, 16, H - 12)

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }, [event])

  // rAF driver over the current flight's phase chain
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
      cur.t += now - last
      last = now
      const dur = cur.phase === 'block' ? 1100 : LEG_MS
      if (cur.t >= dur) {
        cur.t = 0
        const next = advance(cur)
        cur.phase = next
        setPhase(next)
        if (next === 'done') { draw(); return }
      }
      setTick(t => t + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
    // advance is stable via closure below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, draw])

  // Decide the next phase and emit an event message.
  const advance = useCallback((cur: Flight): Phase => {
    const ph = cur.phase
    if (cur.kind === 'outbound') {
      if (ph === 'out-1') {
        // firewall sees an outbound connection; stateful records it
        if (modeRef.current === 'stateful') {
          setConns(prev =>
            prev.some(c => c.peer === SERVER_IP && c.port === PORT)
              ? prev
              : [...prev, { peer: SERVER_IP, port: PORT }])
          setEvent('outbound allowed — stateful firewall records the connection in its state table')
        } else {
          setEvent('outbound allowed — stateless filter keeps no memory of it')
        }
        return 'out-2'
      }
      if (ph === 'out-2') { setEvent('server received the request and sends its reply back'); return 'rep-1' }
      if (ph === 'rep-1') {
        // does the reply get in?
        if (modeRef.current === 'stateful') {
          setEvent('reply matches a recorded connection → automatically allowed in')
          return 'rep-2'
        }
        // stateless
        if (slRuleRef.current === 'allow-inbound') {
          setEvent('stateless "allow inbound" lets the reply in — but it can\'t tell replies from strangers')
          return 'rep-2'
        }
        setEvent('stateless "block inbound" drops the reply too — your own connection is broken')
        return 'block'
      }
      if (ph === 'rep-2') { setEvent('connection complete — the round trip succeeded'); return 'done' }
    } else {
      // unsolicited inbound
      if (ph === 'in-1') {
        if (modeRef.current === 'stateful') {
          setEvent('no matching outbound state → the unsolicited connection is blocked')
          return 'block'
        }
        if (slRuleRef.current === 'allow-inbound') {
          setEvent('stateless "allow inbound" can\'t tell this is unsolicited → the stranger gets in')
          return 'in-2'
        }
        setEvent('stateless "block inbound" drops it — but this same rule also drops your replies')
        return 'block'
      }
      if (ph === 'in-2') { setEvent('the stranger opened a connection to your machine — not what you want'); return 'done' }
    }
    return 'done'
  }, [])

  useEffect(() => { draw() }, [draw, conns])

  const busy = phase !== 'idle' && phase !== 'done'

  const startOutbound = useCallback(() => {
    if (busy) return
    cancelAnimationFrame(rafRef.current)
    flightRef.current = { kind: 'outbound', phase: 'out-1', t: 0, peerCY: SERVER_CY }
    setEvent('you initiate an outbound connection to the server')
    setPhase('out-1')
  }, [busy])

  const startInbound = useCallback(() => {
    if (busy) return
    cancelAnimationFrame(rafRef.current)
    flightRef.current = { kind: 'inbound', phase: 'in-1', t: 0, peerCY: STRANGER_CY }
    setEvent('a stranger attempts an unsolicited inbound connection')
    setPhase('in-1')
  }, [busy])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) startOutbound()
      else draw()
    },
  })

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    flightRef.current = null
    setConns([])
    setPhase('idle')
    setEvent('Initiate a connection, or try an unsolicited inbound one.')
    triggerReset()
    setTick(t => t + 1)
  }, [triggerReset])

  const setModeSafe = (m: Mode) => {
    if (busy) return
    setMode(m)
    setConns([])
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Memory of connections</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      {/* mode + state table */}
      <div className="flex flex-wrap items-stretch gap-2">
        <div className="flex rounded-lg overflow-hidden border border-border text-xs">
          {(['stateful', 'stateless'] as Mode[]).map(m => (
            <button key={m} onClick={() => setModeSafe(m)} disabled={busy}
              className="px-3 py-1.5 font-medium transition-colors disabled:opacity-40"
              style={{
                background: mode === m ? RED : 'transparent',
                color: mode === m ? '#0F0D0A' : 'var(--text-muted, rgba(245,240,232,0.6))',
              }}>
              {m}
            </button>
          ))}
        </div>
        {mode === 'stateless' && (
          <div className="flex rounded-lg overflow-hidden border border-border text-xs">
            {(['allow-inbound', 'block-inbound'] as StatelessRule[]).map(r => (
              <button key={r} onClick={() => !busy && setSlRule(r)} disabled={busy}
                className="px-3 py-1.5 font-mono transition-colors disabled:opacity-40"
                style={{
                  background: slRule === r ? GOLD : 'transparent',
                  color: slRule === r ? '#0F0D0A' : 'var(--text-muted, rgba(245,240,232,0.6))',
                }}>
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono">
        <div className="text-text-muted mb-1">
          {mode === 'stateful' ? 'connection state table' : 'stateless filter · no connection memory'}
        </div>
        {mode === 'stateless' ? (
          <div style={{ color: FAINT }}>every packet judged alone against a fixed rule — replies and strangers look identical</div>
        ) : conns.length === 0 ? (
          <div style={{ color: FAINT }}>empty — initiate an outbound connection to record one</div>
        ) : (
          <div className="flex flex-col gap-1">
            {conns.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span style={{ color: BLUE }}>{INSIDE_IP}</span>
                <span style={{ color: MUTE }}>↔</span>
                <span style={{ color: CYAN }}>{c.peer}:{c.port}</span>
                <span style={{ color: GREEN }}>· established (return traffic allowed)</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="animation-controls flex-wrap gap-2">
        <button onClick={startOutbound} disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
          style={{ background: BLUE, color: '#0F0D0A' }}>
          Initiate outbound (:{PORT})
        </button>
        <button onClick={startInbound} disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40"
          style={{ borderColor: GOLD, color: GOLD }}>
          Unsolicited inbound (:{PORT})
        </button>
      </div>
    </div>
  )
}
