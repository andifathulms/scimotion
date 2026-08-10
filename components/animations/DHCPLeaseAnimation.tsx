'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw, Plus, Minus } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const RED = '#F87171'    // accent — the server / pool
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const CYAN = '#22D3EE'
const MUTE = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.28)'

const POOL_SIZE = 12
const BASE = 10 // addresses run 192.168.1.10 .. 192.168.1.21
const LEASE_MS = 16000 // demo lease; real leases run hours to days

const DEVICE_COLORS = [BLUE, GREEN, VIOLET, GOLD, CYAN]
const HOST_NAMES = ['laptop', 'phone', 'tablet', 'tv', 'watch', 'console', 'printer', 'speaker', 'thermostat', 'camera', 'doorbell', 'e-reader']

type Lease = { slot: number; color: string; host: string; total: number; remaining: number }

// Grid geometry for the pool of address slots.
const GRID_X = 208
const GRID_Y = 40
const COLS = 4
const CELL_W = 92
const CELL_H = 88
const SLOT_W = 82
const SLOT_H = 74
const slotX = (i: number) => GRID_X + (i % COLS) * CELL_W
const slotY = (i: number) => GRID_Y + Math.floor(i / COLS) * CELL_H

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export function DHCPLeaseAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const leasesRef = useRef<Lease[]>([])
  const hostCountRef = useRef(0)
  const autoRenewRef = useRef(false)
  const runningRef = useRef(false)
  const [autoRenew, setAutoRenew] = useState(false)
  const [running, setRunning] = useState(false)
  const [, force] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    const leases = leasesRef.current
    const bySlot = new Map<number, Lease>()
    for (const l of leases) bySlot.set(l.slot, l)

    // ---- server panel ----
    const SX = 16, SY = 40, SW = 168, SH = 232
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = `${RED}88`
    ctx.lineWidth = 1.4
    roundRect(ctx, SX, SY, SW, SH, 10)
    ctx.fill()
    ctx.stroke()
    ctx.textAlign = 'left'
    ctx.fillStyle = RED
    ctx.font = 'bold 12px monospace'
    ctx.fillText('DHCP server', SX + 14, SY + 26)
    ctx.fillStyle = MUTE
    ctx.font = '9px monospace'
    ctx.fillText('192.168.1.1', SX + 14, SY + 42)

    ctx.fillStyle = FAINT
    ctx.font = '10px monospace'
    ctx.fillText('address pool', SX + 14, SY + 70)
    ctx.fillStyle = MUTE
    ctx.font = '11px monospace'
    ctx.fillText('192.168.1.10', SX + 14, SY + 88)
    ctx.fillText('  – .21', SX + 14, SY + 104)

    const used = leases.length
    const free = POOL_SIZE - used
    ctx.font = 'bold 22px monospace'
    ctx.fillStyle = free === 0 ? RED : GREEN
    ctx.fillText(`${free}`, SX + 14, SY + 148)
    ctx.font = '10px monospace'
    ctx.fillStyle = MUTE
    ctx.fillText('free', SX + 44, SY + 148)
    ctx.fillStyle = FAINT
    ctx.fillText(`${used} of ${POOL_SIZE} leased`, SX + 14, SY + 168)

    // pool fill bar
    const barW = SW - 28
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    roundRect(ctx, SX + 14, SY + 182, barW, 8, 4); ctx.fill()
    ctx.fillStyle = free === 0 ? RED : GREEN
    roundRect(ctx, SX + 14, SY + 182, Math.max(0, (barW * used) / POOL_SIZE), 8, 4); ctx.fill()

    ctx.font = '9px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText(free === 0 ? 'pool exhausted' : 'leases returned on expiry', SX + 14, SY + 210)

    // ---- pool slots ----
    for (let i = 0; i < POOL_SIZE; i++) {
      const x = slotX(i), y = slotY(i)
      const lease = bySlot.get(i)
      const addr = `.${BASE + i}`
      if (!lease) {
        ctx.fillStyle = 'rgba(255,255,255,0.015)'
        ctx.strokeStyle = FAINT
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        roundRect(ctx, x, y, SLOT_W, SLOT_H, 8)
        ctx.fill(); ctx.stroke()
        ctx.setLineDash([])
        ctx.textAlign = 'center'
        ctx.fillStyle = MUTE
        ctx.font = '11px monospace'
        ctx.fillText(`192.168.1${addr}`, x + SLOT_W / 2, y + 30)
        ctx.fillStyle = FAINT
        ctx.font = '10px monospace'
        ctx.fillText('free', x + SLOT_W / 2, y + 50)
        continue
      }
      const frac = Math.max(0, Math.min(1, lease.remaining / lease.total))
      const secs = Math.ceil(lease.remaining / 1000)
      const renewing = autoRenewRef.current && frac <= 0.5
      const expiring = frac <= 0.25
      ctx.fillStyle = `${lease.color}1F`
      ctx.strokeStyle = expiring && !renewing ? RED : lease.color
      ctx.lineWidth = 2
      roundRect(ctx, x, y, SLOT_W, SLOT_H, 8)
      ctx.fill(); ctx.stroke()

      ctx.textAlign = 'center'
      ctx.fillStyle = lease.color
      ctx.font = 'bold 11px monospace'
      ctx.fillText(`192.168.1${addr}`, x + SLOT_W / 2, y + 22)
      ctx.fillStyle = MUTE
      ctx.font = '9px monospace'
      ctx.fillText(lease.host, x + SLOT_W / 2, y + 37)

      // countdown bar
      const cbW = SLOT_W - 16
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      roundRect(ctx, x + 8, y + 46, cbW, 6, 3); ctx.fill()
      ctx.fillStyle = renewing ? GREEN : expiring ? RED : lease.color
      roundRect(ctx, x + 8, y + 46, Math.max(0, cbW * frac), 6, 3); ctx.fill()

      ctx.font = '9px monospace'
      ctx.fillStyle = renewing ? GREEN : expiring ? RED : MUTE
      ctx.fillText(renewing ? `renewing · ${secs}s` : `lease ${secs}s`, x + SLOT_W / 2, y + 66)
    }

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }, [])

  // rAF: tick down every lease; renew at half-life or expire and free the slot.
  const loop = useCallback((last: number) => (now: number) => {
    const dt = now - last
    last = now
    const next: Lease[] = []
    for (const l of leasesRef.current) {
      let rem = l.remaining - dt
      if (autoRenewRef.current && rem <= l.total / 2) {
        rem = l.total // renew resets the clock — your address stays put
      }
      if (rem > 0) next.push({ ...l, remaining: rem })
      // else: lease expired, address returns to the pool (dropped)
    }
    leasesRef.current = next
    draw()
    force(x => x + 1)
    if (runningRef.current) rafRef.current = requestAnimationFrame(loop(last))
  }, [draw])

  const start = useCallback(() => {
    if (runningRef.current) return
    runningRef.current = true
    setRunning(true)
    rafRef.current = requestAnimationFrame(loop(performance.now()))
  }, [loop])

  const stop = useCallback(() => {
    runningRef.current = false
    setRunning(false)
    cancelAnimationFrame(rafRef.current)
  }, [])

  const addDevice = useCallback(() => {
    const taken = new Set(leasesRef.current.map(l => l.slot))
    let slot = -1
    for (let i = 0; i < POOL_SIZE; i++) if (!taken.has(i)) { slot = i; break }
    if (slot < 0) return // pool exhausted
    const n = hostCountRef.current
    hostCountRef.current += 1
    leasesRef.current = [
      ...leasesRef.current,
      {
        slot,
        color: DEVICE_COLORS[n % DEVICE_COLORS.length],
        host: HOST_NAMES[slot % HOST_NAMES.length],
        total: LEASE_MS,
        remaining: LEASE_MS,
      },
    ]
    if (!runningRef.current) start()
    else draw()
  }, [draw, start])

  const removeDevice = useCallback(() => {
    if (leasesRef.current.length === 0) return
    // Device leaves early — its address returns to the pool immediately.
    leasesRef.current = leasesRef.current.slice(1)
    draw()
  }, [draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      // Seed a few leases so the pool reads as "in use".
      const seed = [0, 1, 2].map((slot, n) => ({
        slot,
        color: DEVICE_COLORS[n % DEVICE_COLORS.length],
        host: HOST_NAMES[slot],
        total: LEASE_MS,
        remaining: reduced ? LEASE_MS * 0.6 : LEASE_MS,
      }))
      leasesRef.current = seed
      hostCountRef.current = 3
      if (reduced) draw()
      else start()
    },
  })

  const reset = useCallback(() => {
    stop()
    leasesRef.current = []
    hostCountRef.current = 0
    autoRenewRef.current = false
    setAutoRenew(false)
    triggerReset()
    draw()
  }, [draw, stop, triggerReset])

  useEffect(() => { draw() }, [draw])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const toggleRenew = () => {
    const v = !autoRenewRef.current
    autoRenewRef.current = v
    setAutoRenew(v)
    draw()
  }

  const full = leasesRef.current.length >= POOL_SIZE
  const empty = leasesRef.current.length === 0

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The address pool &amp; leases</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: The address pool &amp; leases. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono" style={{ color: MUTE }}>
        Each lease counts down (sped up to <span style={{ color: GOLD }}>16s</span> here — real leases run hours to days).
        When it hits zero the address returns to the pool and can be reassigned. Turn on{' '}
        <span style={{ color: GREEN }}>auto-renew</span> and watch active devices reset their clock at half-life instead of expiring.
      </div>

      <div className="animation-controls flex-wrap gap-2">
        <button
          onClick={addDevice}
          disabled={full}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
          style={{ background: RED, color: '#0F0D0A' }}
        >
          <Plus size={12} /> Add device
        </button>
        <button
          onClick={removeDevice}
          disabled={empty}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40"
          style={{ borderColor: BLUE, color: BLUE }}
        >
          <Minus size={12} /> Remove device
        </button>
        <button
          onClick={toggleRenew}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
          style={autoRenew
            ? { background: GREEN, color: '#0F0D0A', borderColor: GREEN }
            : { borderColor: 'var(--border, rgba(255,245,235,0.18))', color: MUTE }}
        >
          Auto-renew: {autoRenew ? 'on' : 'off'}
        </button>
        <span className="ml-auto text-xs text-text-muted">{running ? 'leases ticking…' : 'add a device to start'}</span>
      </div>
    </div>
  )
}
