'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

// Palette
const RED = '#F87171'    // accent — the tunnel / what is hidden
const GOLD = '#F59E0B'   // the VPN exit / provider
const BLUE = '#60A5FA'   // the laptop
const GREEN = '#10B981'  // readable / plaintext
const CYAN = '#22D3EE'   // destination server
const MUTE = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.26)'

const DEST = 'bank.example'
const EXIT_IP = '203.0.113.9'

// Geometry
const LAP_X = 66
const EXIT_X = 372
const DST_X = 534
const WIRE_Y = 74
const OBS_X = 200 // local observer taps the local segment here

const LOOP_MS = 2600

export function VPNEavesdropperAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const clockRef = useRef(0)
  const onRef = useRef(true)

  const [running, setRunning] = useState(false)
  const [on, setOn] = useState(true)
  const [tick, setTick] = useState(0)

  const drawNode = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    color: string,
    label: string,
    sub: string
  ) => {
    ctx.fillStyle = `${color}22`
    ctx.strokeStyle = color
    ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = color
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(label, x, y - r - 6)
    ctx.fillStyle = MUTE
    ctx.font = '8px monospace'
    ctx.fillText(sub, x, y + r + 12)
  }

  const drawPanel = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    title: string,
    lines: [string, boolean][] // [text, readable?]
  ) => {
    ctx.fillStyle = `${color}0D`
    ctx.strokeStyle = `${color}77`
    ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke()
    ctx.fillStyle = color
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(title, x + 12, y + 18)
    ctx.font = '9px monospace'
    lines.forEach(([t, readable], i) => {
      ctx.fillStyle = readable ? GREEN : MUTE
      ctx.fillText(`› ${t}`, x + 12, y + 36 + i * 15)
    })
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'
    const vpn = onRef.current

    // ---- the tunnel over the local segment (only with VPN) ----
    if (vpn) {
      ctx.fillStyle = 'rgba(248,113,113,0.06)'
      ctx.strokeStyle = `${RED}66`
      ctx.lineWidth = 1.2
      ctx.beginPath(); ctx.roundRect(LAP_X + 18, WIRE_Y - 16, EXIT_X - LAP_X - 36, 32, 12); ctx.fill(); ctx.stroke()
      ctx.fillStyle = RED
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('encrypted tunnel', (LAP_X + EXIT_X) / 2, WIRE_Y - 22)
    }

    // ---- wire ----
    ctx.strokeStyle = 'rgba(245,240,232,0.16)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(LAP_X + 16, WIRE_Y); ctx.lineTo(DST_X - 16, WIRE_Y); ctx.stroke()

    // ---- local observer tap ----
    ctx.strokeStyle = FAINT
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(OBS_X, WIRE_Y + 8); ctx.lineTo(OBS_X, 128); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = RED
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('local observer', OBS_X, 122)
    ctx.fillStyle = MUTE
    ctx.fillText('(café wifi / ISP)', OBS_X, 132)

    // ---- nodes ----
    drawNode(ctx, LAP_X, WIRE_Y, 14, BLUE, 'laptop', 'you')
    if (vpn) drawNode(ctx, EXIT_X, WIRE_Y, 14, GOLD, 'VPN exit', EXIT_IP)
    drawNode(ctx, DST_X, WIRE_Y, 14, CYAN, 'server', DEST)

    // ---- moving packet ----
    const t = (clockRef.current % LOOP_MS) / LOOP_MS
    const px = LAP_X + 16 + (DST_X - 16 - LAP_X - 16) * t
    const encrypted = vpn && px < EXIT_X
    const col = encrypted ? RED : GREEN
    ctx.fillStyle = `${col}22`
    ctx.strokeStyle = col
    ctx.lineWidth = 1.4
    const pw = encrypted ? 58 : 96
    ctx.beginPath(); ctx.roundRect(px - pw / 2, WIRE_Y - 9, pw, 18, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = col
    ctx.font = 'bold 8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(encrypted ? '▓▓ opaque' : `GET ${DEST}`, px, WIRE_Y + 3)

    // ---- capture panels ----
    const localLines: [string, boolean][] = vpn
      ? [
          [`tunnel → ${EXIT_IP}`, false],
          ['destination: hidden', false],
          ['content: ▓▓ ciphertext', false],
        ]
      : [
          [`destination: ${DEST}`, true],
          ['GET /login  ·  cookies', true],
          ['content: readable', true],
        ]
    drawPanel(ctx, 30, 152, 262, 88, RED, 'What the LOCAL observer sees', localLines)

    const exitLines: [string, boolean][] = vpn
      ? [
          [`real destination: ${DEST}`, true],
          ['your content: readable', true],
          ['(destination sees exit IP)', true],
        ]
      : [
          ['no VPN in the path', false],
          [`destination ${DEST} sees`, true],
          ['your request directly', true],
        ]
    drawPanel(ctx, 308, 152, 262, 88, GOLD, vpn ? 'What the VPN PROVIDER (exit) sees' : 'What the DESTINATION sees', exitLines)

    // ---- verdict ----
    ctx.textAlign = 'center'
    ctx.font = 'bold 10px monospace'
    if (vpn) {
      ctx.fillStyle = RED
      ctx.fillText('The local network is blinded — but trust MOVED to the VPN provider, it did not vanish.', W / 2, 268)
      ctx.fillStyle = MUTE
      ctx.font = '9px monospace'
      ctx.fillText('The provider at the exit, and the destination server, still see your traffic. A VPN is not anonymity.', W / 2, 286)
    } else {
      ctx.fillStyle = GREEN
      ctx.fillText('No VPN: the local observer reads your destinations and content in the clear.', W / 2, 268)
      ctx.fillStyle = MUTE
      ctx.font = '9px monospace'
      ctx.fillText('Anyone on the local segment — the café, your ISP — sees where you go and what you send.', W / 2, 286)
    }

    // ---- toggle hint ----
    ctx.fillStyle = FAINT
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('Toggle the VPN and compare the two panels above.', W / 2, 318)

    ctx.textAlign = 'left'
  }, [])

  useEffect(() => {
    if (!running) { draw(); return }
    let last = performance.now()
    const loop = (now: number) => {
      const dt = now - last
      last = now
      clockRef.current += dt
      draw()
      setTick(t => t + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => { draw() }, [draw, tick])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
      else draw()
    },
  })

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    clockRef.current = 0
    setRunning(false)
    triggerReset()
    draw()
  }, [draw, triggerReset])

  const toggleVpn = () => {
    const v = !onRef.current
    onRef.current = v
    setOn(v)
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Who can see your traffic</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => (running ? setRunning(false) : setRunning(true))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: RED, color: '#0F0D0A' }}
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <button
          onClick={toggleVpn}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
          style={{ borderColor: on ? RED : GOLD, color: on ? RED : GOLD }}
        >
          {on ? 'VPN: on' : 'VPN: off'}
        </button>
      </div>
    </div>
  )
}
