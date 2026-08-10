'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 340

const RED = '#F87171'    // pool drained the wasteful way (one IP per device)
const GOLD = '#F59E0B'   // the port multiplier / headroom
const GREEN = '#10B981'  // NAT: one IP per whole network
const BLUE = '#60A5FA'   // devices
const CYAN = '#22D3EE'   // IPv6
const MUTE = 'rgba(245,240,232,0.55)'
const FAINT = 'rgba(245,240,232,0.28)'

// A small representative pool. The real IPv4 pool is ~4.3 billion, but always
// finite — this toy allocation makes "finite" visible.
const POOL = 24
const PER_NET = 8 // devices per home network

// Pool grid geometry.
const GX = 316
const GY = 66
const COLS = 6
const ROWS = 4
const CELL = 40
const PAD = 5

export function AddressExhaustionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startRef = useRef<number>(0)
  const [networks, setNetworks] = useState(1)
  const [natOn, setNatOn] = useState(true)
  const [playing, setPlaying] = useState(false)

  const draw = useCallback((nets: number, nat: boolean) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    const totalDevices = nets * PER_NET
    const used = nat ? nets : totalDevices
    const filled = Math.min(used, POOL)
    const over = Math.max(0, used - POOL)

    // ---- left: home networks ----
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = MUTE
    ctx.fillText('home networks', 20, 24)

    const shown = Math.min(nets, 4)
    for (let n = 0; n < shown; n++) {
      const bx = 20 + (n % 2) * 130
      const by = 38 + Math.floor(n / 2) * 96
      ctx.fillStyle = 'rgba(255,255,255,0.02)'
      ctx.strokeStyle = nat ? `${GREEN}88` : `${RED}88`
      ctx.lineWidth = 1.3
      ctx.beginPath(); ctx.roundRect(bx, by, 116, 82, 8); ctx.fill(); ctx.stroke()
      // device dots (8 per network)
      for (let d = 0; d < PER_NET; d++) {
        const dx = bx + 20 + (d % 4) * 24
        const dy = by + 20 + Math.floor(d / 4) * 22
        ctx.beginPath(); ctx.arc(dx, dy, 4, 0, Math.PI * 2)
        ctx.fillStyle = BLUE; ctx.fill()
      }
      ctx.fillStyle = nat ? GREEN : RED
      ctx.font = '9px monospace'
      ctx.fillText(nat ? '1 public IP' : `${PER_NET} public IPs`, bx + 8, by + 76)
    }
    if (nets > 4) {
      ctx.fillStyle = MUTE
      ctx.font = '11px monospace'
      ctx.fillText(`+ ${nets - 4} more`, 20, 232)
    }

    // ---- right: the finite address pool ----
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = MUTE
    ctx.fillText('IPv4 address pool (finite)', GX, GY - 12)

    for (let i = 0; i < POOL; i++) {
      const c = i % COLS
      const r = Math.floor(i / COLS)
      const x = GX + c * CELL
      const y = GY + r * CELL
      const isFilled = i < filled
      ctx.beginPath(); ctx.roundRect(x, y, CELL - PAD, CELL - PAD, 5)
      if (isFilled) {
        ctx.fillStyle = nat ? `${GREEN}44` : `${RED}44`
        ctx.strokeStyle = nat ? GREEN : RED
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.02)'
        ctx.strokeStyle = FAINT
      }
      ctx.lineWidth = 1.2
      ctx.fill(); ctx.stroke()
    }

    // overflow marker
    if (over > 0) {
      ctx.fillStyle = RED
      ctx.font = 'bold 12px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`pool exhausted · ${over} devices with no address`, GX, GY + ROWS * CELL + 8)
    }

    // ---- bottom band: counters, port multiplier, IPv6 ----
    const by = 258
    ctx.textAlign = 'left'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = nat ? GREEN : RED
    ctx.fillText(`public IPs used: ${used}${over > 0 ? ` (${POOL} + ${over} over)` : ` / ${POOL}`}`, 20, by)
    ctx.fillStyle = BLUE
    ctx.font = '11px monospace'
    ctx.fillText(`devices online: ${totalDevices}`, 20, by + 20)

    ctx.fillStyle = GOLD
    ctx.font = '11px monospace'
    ctx.fillText('1 public IP × 2¹⁶ ports ≈ 65,536 simultaneous connections', 20, by + 46)
    ctx.fillStyle = CYAN
    ctx.fillText('IPv6: 2¹²⁸ addresses — enough to give every device its own again', 20, by + 66)

    ctx.textAlign = 'left'
  }, [])

  // Scripted intro: drain the pool without NAT, then switch NAT on.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const steps: { t: number; done: boolean; run: () => void }[] = [
      { t: 0, done: false, run: () => { setNatOn(false); setNetworks(1) } },
      { t: 600, done: false, run: () => setNetworks(2) },
      { t: 1200, done: false, run: () => setNetworks(3) },
      { t: 1800, done: false, run: () => setNetworks(4) },
      { t: 2900, done: false, run: () => setNatOn(true) },
    ]
    startRef.current = performance.now()
    const loop = (now: number) => {
      const el = now - startRef.current
      let more = false
      for (const s of steps) {
        if (!s.done && el >= s.t) { s.done = true; s.run() }
        if (!s.done) more = true
      }
      if (more) raf = requestAnimationFrame(loop)
      else setPlaying(false)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  useEffect(() => { draw(networks, natOn) }, [networks, natOn, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setNatOn(true)
        setNetworks(4)
      } else {
        setNetworks(1)
        setPlaying(true)
      }
    },
  })

  const addNetwork = useCallback(() => {
    setPlaying(false)
    setNetworks(n => Math.min(n + 1, 24))
  }, [])

  const toggleNat = useCallback(() => {
    setPlaying(false)
    setNatOn(v => !v)
  }, [])

  const reset = useCallback(() => {
    setPlaying(false)
    setNetworks(1)
    setNatOn(true)
    triggerReset()
  }, [triggerReset])

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · How NAT stretches a scarce pool</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: How NAT stretches a scarce pool. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={addNetwork}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: BLUE, color: '#0F0D0A' }}
        >
          + Home network ({PER_NET} devices)
        </button>
        <button
          onClick={toggleNat}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: natOn ? GREEN : RED, color: '#0F0D0A' }}
        >
          NAT: {natOn ? 'on' : 'off'}
        </button>
        <WidgetStatus className="ml-auto text-xs text-text-muted">
          {natOn
            ? 'Each network shares one public address.'
            : 'Every device demands its own — the pool drains fast.'}
        </WidgetStatus>
      </div>
    </div>
  )
}
