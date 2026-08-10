'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const RED = '#F87171'    // accent
const GOLD = '#F59E0B'   // Discover
const BLUE = '#60A5FA'   // Offer
const VIOLET = '#A78BFA' // Request
const GREEN = '#10B981'  // Ack / configured
const MUTE = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.28)'

// The lease the server hands out — realistic private (RFC 1918) values.
const LEASE = {
  ip: '192.168.1.42',
  mask: '255.255.255.0',
  gw: '192.168.1.1',
  dns: '192.168.1.1',
}

type Dir = 'out' | 'in'
type Step = {
  letter: string
  name: string
  dir: Dir
  color: string
  broadcast: boolean
  src: string
  dst: string
  note: string
}

// The four beats of DORA. `dir` is relative to the client (out = client→server).
const STEPS: Step[] = [
  {
    letter: 'D', name: 'DHCPDISCOVER', dir: 'out', color: GOLD, broadcast: true,
    src: '0.0.0.0', dst: '255.255.255.255',
    note: 'The client has no address yet, so it broadcasts to the whole local link: "is any DHCP server out there?"',
  },
  {
    letter: 'O', name: 'DHCPOFFER', dir: 'in', color: BLUE, broadcast: false,
    src: LEASE.gw, dst: LEASE.ip,
    note: 'A server answers with a concrete offer: a specific address plus the subnet mask, default gateway, and DNS server.',
  },
  {
    letter: 'R', name: 'DHCPREQUEST', dir: 'out', color: VIOLET, broadcast: true,
    src: '0.0.0.0', dst: '255.255.255.255',
    note: 'The client formally requests that offered address — still a broadcast, so any other server learns its offer was not taken.',
  },
  {
    letter: 'A', name: 'DHCPACK', dir: 'in', color: GREEN, broadcast: false,
    src: LEASE.gw, dst: LEASE.ip,
    note: 'The server acknowledges and commits the lease. The client is now fully configured and can reach the internet.',
  },
]

// Geometry.
const DEV_X = 24
const DEV_Y = 66
const DEV_W = 180
const DEV_H = 208
const SRV_X = 396
const SRV_Y = 66
const SRV_W = 180
const SRV_H = 208
const LANE_Y = 44               // where packets travel
const DEV_EDGE = DEV_X + DEV_W  // 204
const SRV_EDGE = SRV_X          // 396

const STEP_MS = 900

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export function DHCPHandshakeAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const timerRef = useRef<number | undefined>(undefined)
  // stage: number of COMPLETED steps (0..4). progress: in-flight fraction of the next step.
  const stageRef = useRef(0)
  const progRef = useRef(0)
  const flyingRef = useRef(false)
  const autoRef = useRef(false)
  const [stage, setStage] = useState(0)
  const [flying, setFlying] = useState(false)
  const [, force] = useState(0)

  // How each config field should render given how far we've progressed.
  const fieldState = (): 'none' | 'offered' | 'leased' => {
    const shownOffer = stageRef.current >= 2 || (stageRef.current === 1 && flyingRef.current)
    if (stageRef.current >= 4) return 'leased'
    if (shownOffer) return 'offered'
    return 'none'
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    const stg = stageRef.current
    const configured = stg >= 4
    const fs = fieldState()

    // ---- link / broadcast lane ----
    ctx.strokeStyle = 'rgba(245,240,232,0.14)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(DEV_EDGE, LANE_Y)
    ctx.lineTo(SRV_EDGE, LANE_Y)
    ctx.stroke()
    ctx.fillStyle = FAINT
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('local network link · Ethernet broadcast domain', (DEV_EDGE + SRV_EDGE) / 2, LANE_Y - 12)

    // ---- device ----
    const devActive = flyingRef.current && STEPS[stg]?.dir === 'out'
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = configured ? GREEN : devActive ? STEPS[stg].color : `${RED}88`
    ctx.lineWidth = configured || devActive ? 2.2 : 1.4
    roundRect(ctx, DEV_X, DEV_Y, DEV_W, DEV_H, 10)
    ctx.fill()
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.fillStyle = configured ? GREEN : RED
    ctx.font = 'bold 12px monospace'
    ctx.fillText('your device', DEV_X + 14, DEV_Y + 24)
    ctx.fillStyle = MUTE
    ctx.font = '9px monospace'
    ctx.fillText('MAC a4:83:e7:2c:1b:09', DEV_X + 14, DEV_Y + 40)

    // config fields
    const fields: [string, string][] = [
      ['IP', LEASE.ip],
      ['mask', LEASE.mask],
      ['gateway', LEASE.gw],
      ['DNS', LEASE.dns],
    ]
    let fy = DEV_Y + 66
    for (const [k, v] of fields) {
      ctx.fillStyle = MUTE
      ctx.font = '10px monospace'
      ctx.fillText(k, DEV_X + 14, fy)
      if (fs === 'none') {
        ctx.fillStyle = FAINT
        ctx.font = '11px monospace'
        ctx.fillText('— none —', DEV_X + 78, fy)
      } else {
        ctx.fillStyle = fs === 'leased' ? GREEN : FAINT
        ctx.font = fs === 'leased' ? 'bold 11px monospace' : '11px monospace'
        ctx.fillText(v, DEV_X + 78, fy)
      }
      fy += 26
    }
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    if (configured) {
      ctx.fillStyle = GREEN
      ctx.fillText('✓ configured · leased 24h', DEV_X + DEV_W / 2, DEV_Y + DEV_H - 12)
    } else if (fs === 'offered') {
      ctx.fillStyle = BLUE
      ctx.fillText('offered — not yet leased', DEV_X + DEV_W / 2, DEV_Y + DEV_H - 12)
    } else {
      ctx.fillStyle = RED
      ctx.fillText('address-less', DEV_X + DEV_W / 2, DEV_Y + DEV_H - 12)
    }

    // ---- server ----
    const srvActive = flyingRef.current && STEPS[stg]?.dir === 'in'
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = srvActive ? STEPS[stg].color : `${BLUE}88`
    ctx.lineWidth = srvActive ? 2.2 : 1.4
    roundRect(ctx, SRV_X, SRV_Y, SRV_W, SRV_H, 10)
    ctx.fill()
    ctx.stroke()
    ctx.textAlign = 'left'
    ctx.fillStyle = BLUE
    ctx.font = 'bold 12px monospace'
    ctx.fillText('DHCP server', SRV_X + 14, SRV_Y + 24)
    ctx.fillStyle = MUTE
    ctx.font = '9px monospace'
    ctx.fillText('192.168.1.1', SRV_X + 14, SRV_Y + 40)

    ctx.font = '10px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText('address pool', SRV_X + 14, SRV_Y + 66)
    ctx.fillStyle = MUTE
    ctx.font = '10px monospace'
    ctx.fillText('192.168.1.2 – .254', SRV_X + 14, SRV_Y + 82)
    ctx.font = '9px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText('hands out on request:', SRV_X + 14, SRV_Y + 108)
    ctx.fillStyle = configured ? GREEN : MUTE
    ctx.font = '10px monospace'
    ctx.fillText(`• ${LEASE.ip}`, SRV_X + 20, SRV_Y + 126)
    ctx.fillText('• mask + gateway', SRV_X + 20, SRV_Y + 144)
    ctx.fillText('• DNS resolver', SRV_X + 20, SRV_Y + 162)
    ctx.textAlign = 'center'
    ctx.font = '9px monospace'
    ctx.fillStyle = configured ? GREEN : FAINT
    ctx.fillText(configured ? '.42 removed from pool' : 'leases from pool', SRV_X + SRV_W / 2, SRV_Y + SRV_H - 12)

    // ---- packet in flight ----
    if (flyingRef.current && stg < STEPS.length) {
      const s = STEPS[stg]
      const t = Math.max(0, Math.min(1, progRef.current))
      const ax = s.dir === 'out' ? DEV_EDGE : SRV_EDGE
      const bx = s.dir === 'out' ? SRV_EDGE : DEV_EDGE
      const px = ax + (bx - ax) * t
      const py = LANE_Y
      const g = ctx.createRadialGradient(px, py, 0, px, py, 18)
      g.addColorStop(0, `${s.color}99`)
      g.addColorStop(1, `${s.color}00`)
      ctx.beginPath(); ctx.arc(px, py, 18, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill()
      ctx.fillStyle = s.color
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(s.name, px, py - 16)
      ctx.fillStyle = MUTE
      ctx.font = '9px monospace'
      ctx.fillText(`${s.src} → ${s.dst}${s.broadcast ? '  (broadcast)' : ''}`, px, py + 22)
    }

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }, [])

  // Animate one step's packet, then mark the step complete.
  const runStep = useCallback(() => {
    if (stageRef.current >= STEPS.length) { autoRef.current = false; return }
    flyingRef.current = true
    setFlying(true)
    progRef.current = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = now - last
      last = now
      progRef.current += dt / STEP_MS
      if (progRef.current >= 1) {
        progRef.current = 1
        draw()
        flyingRef.current = false
        stageRef.current += 1
        setFlying(false)
        setStage(stageRef.current)
        if (autoRef.current && stageRef.current < STEPS.length) {
          timerRef.current = window.setTimeout(runStep, 650)
        } else {
          autoRef.current = false
        }
        return
      }
      draw()
      force(x => x + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [draw])

  const stepOnce = useCallback(() => {
    if (flyingRef.current || stageRef.current >= STEPS.length) return
    autoRef.current = false
    runStep()
  }, [runStep])

  const playAll = useCallback(() => {
    if (flyingRef.current) return
    if (stageRef.current >= STEPS.length) {
      // restart
      stageRef.current = 0
      setStage(0)
    }
    autoRef.current = true
    runStep()
  }, [runStep])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Show the finished, configured end state without motion.
        stageRef.current = STEPS.length
        setStage(STEPS.length)
        draw()
      } else {
        playAll()
      }
    },
  })

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    autoRef.current = false
    flyingRef.current = false
    progRef.current = 0
    stageRef.current = 0
    setFlying(false)
    setStage(0)
    triggerReset()
    draw()
  }, [draw, triggerReset])

  useEffect(() => { draw() }, [draw, stage, flying])
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }, [])

  const done = stage >= STEPS.length
  const current = flying ? STEPS[stage] : done ? null : STEPS[stage]

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The DORA exchange</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: The DORA exchange. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      {/* Step tracker + narration */}
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono">
        <div className="flex items-center gap-2 mb-1">
          {STEPS.map((s, i) => {
            const active = flying ? i === stage : i === stage - 1
            const complete = i < stage
            return (
              <span
                key={s.letter}
                className="px-2 py-0.5 rounded border"
                style={{
                  borderColor: complete || active ? s.color : 'var(--border, rgba(255,245,235,0.14))',
                  color: complete || active ? s.color : FAINT,
                  background: active ? `${s.color}14` : 'transparent',
                }}
              >
                {s.letter} · {s.name.replace('DHCP', '')}
              </span>
            )
          })}
        </div>
        <div style={{ color: done ? GREEN : MUTE }}>
          {done
            ? 'Lease complete — the device went from address-less to fully configured and can now reach the internet.'
            : current
              ? current.note
              : 'The device just joined the link with no address. Press Step or Play to run Discover → Offer → Request → Ack.'}
        </div>
      </div>

      <div className="animation-controls flex-wrap gap-2">
        <button
          onClick={playAll}
          disabled={flying}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
          style={{ background: RED, color: '#0F0D0A' }}
        >
          <Play size={12} /> {done ? 'Replay' : 'Play all'}
        </button>
        <button
          onClick={stepOnce}
          disabled={flying || done}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40"
          style={{ borderColor: VIOLET, color: VIOLET }}
        >
          <ChevronRight size={12} /> Step
        </button>
        <span className="ml-auto text-xs text-text-muted">Step through Discover → Offer → Request → Ack</span>
      </div>
    </div>
  )
}
