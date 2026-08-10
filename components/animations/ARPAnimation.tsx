'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw, Radio, Send } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

const COL = {
  accent: '#F87171', // red — the data frame delivered by MAC
  gold: '#F59E0B',   // the cached mapping
  blue: '#60A5FA',   // the asking host
  violet: '#A78BFA',
  green: '#10B981',  // the owner and its reply
  cyan: '#22D3EE',   // the broadcast ARP request
  mute: 'rgba(255,245,235,0.5)',
  faint: 'rgba(255,245,235,0.12)',
}

type Pt = { x: number; y: number }
type Host = { ip: string; mac: string; x: number; y: number }

// Host A asks; B..D listen. B owns the target IP.
const HOST_A: Host = { ip: '192.168.1.10', mac: '3C:5A:B4:1A:2E:01', x: 78, y: 180 }
const CENTER: Pt = { x: 300, y: 180 } // the shared local link / switch
const OTHERS: Host[] = [
  { ip: '192.168.1.20', mac: '1A:2B:3C:4D:5E:6F', x: 512, y: 74 },  // the owner
  { ip: '192.168.1.30', mac: 'B8:27:EB:9A:10:30', x: 512, y: 180 },
  { ip: '192.168.1.40', mac: 'D4:6D:6D:55:77:40', x: 512, y: 286 },
]
const TARGET_IP = '192.168.1.20'
const OWNER = 0 // index into OTHERS

const LEG_MS = 560

type Frame = {
  route: Pt[]
  leg: number
  t: number
  done: boolean
  color: string
  label: string
  onArrive?: number // OTHERS index this pulse lands on (for broadcast highlighting)
}

type Stage = 'idle' | 'request' | 'reply' | 'deliver'

type Sim = {
  stage: Stage
  frames: Frame[]
}

export function ARPAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const simRef = useRef<Sim>({ stage: 'idle', frames: [] })
  const cachedRef = useRef<boolean>(false)
  const heardRef = useRef<Record<number, 'nomatch' | 'match'>>({})
  const deliveredRef = useRef<boolean>(false)
  const noteRef = useRef<string>('Host A knows the IP 192.168.1.20 but not its MAC. Resolve it to send.')

  const [running, setRunning] = useState(false)
  const [, force] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sim = simRef.current
    ctx.clearRect(0, 0, W, H)

    // Links: A to the shared medium, and the medium out to each other host.
    const links: [Pt, Pt][] = [[HOST_A, CENTER], ...OTHERS.map(o => [CENTER, o] as [Pt, Pt])]
    for (const [a, b] of links) {
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = COL.faint
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Shared medium node in the middle.
    ctx.beginPath()
    ctx.arc(CENTER.x, CENTER.y, 12, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(26,23,18,0.95)'
    ctx.fill()
    ctx.strokeStyle = COL.mute
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = COL.mute
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('LAN', CENTER.x, CENTER.y - 22)

    // Host A box.
    drawHost(ctx, HOST_A, COL.blue, 'rgba(96,165,250,0.14)', 'asking host')

    // Other hosts.
    OTHERS.forEach((o, i) => {
      const heard = heardRef.current[i]
      let stroke: string = COL.mute
      let fill = 'rgba(26,23,18,0.9)'
      let tag = 'on the LAN'
      if (heard === 'match') { stroke = COL.green; fill = 'rgba(16,185,129,0.14)'; tag = "that's me! I'll reply" }
      else if (heard === 'nomatch') { stroke = COL.mute; fill = 'rgba(26,23,18,0.9)'; tag = 'not my IP → ignore' }
      if (deliveredRef.current && i === OWNER) { stroke = COL.accent; fill = 'rgba(248,113,113,0.12)'; tag = 'frame delivered' }
      drawHost(ctx, o, stroke, fill, tag)
    })

    // Frames in flight.
    for (const f of sim.frames) {
      if (f.done) continue
      const a = f.route[f.leg]
      const b = f.route[f.leg + 1]
      if (!a || !b) continue
      const x = a.x + (b.x - a.x) * f.t
      const y = a.y + (b.y - a.y) * f.t
      const w = Math.max(30, f.label.length * 6 + 12)
      ctx.beginPath()
      ctx.roundRect(x - w / 2, y - 9, w, 18, 4)
      ctx.fillStyle = f.color
      ctx.fill()
      ctx.fillStyle = '#0F0D0A'
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(f.label, x, y)
    }

    // ARP cache panel (Host A's memory).
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '9px monospace'
    ctx.fillStyle = COL.mute
    ctx.fillText("A's ARP cache", 16, 300)
    ctx.beginPath()
    ctx.roundRect(16, 308, 240, 26, 5)
    ctx.fillStyle = cachedRef.current ? 'rgba(245,158,11,0.10)' : 'rgba(255,255,255,0.02)'
    ctx.fill()
    ctx.strokeStyle = cachedRef.current ? COL.gold : COL.faint
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = cachedRef.current ? COL.gold : COL.mute
    ctx.font = '10px monospace'
    ctx.textBaseline = 'middle'
    ctx.fillText(
      cachedRef.current ? `${TARGET_IP} → ${OTHERS[OWNER].mac}` : `${TARGET_IP} → ?  (empty)`,
      26, 321,
    )

    // Status note.
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.7)'
    ctx.fillText(`› ${noteRef.current}`, 16, 24)
  }, [])

  const step = useCallback((dt: number): boolean => {
    const sim = simRef.current
    let allDone = sim.frames.length > 0
    for (const f of sim.frames) {
      if (f.done) continue
      f.t += dt / LEG_MS
      while (f.t >= 1 && !f.done) {
        f.t -= 1
        f.leg += 1
        if (f.leg >= f.route.length - 1) {
          f.done = true
          if (f.onArrive !== undefined) {
            heardRef.current[f.onArrive] = f.onArrive === OWNER ? 'match' : 'nomatch'
          }
        }
      }
      if (!f.done) allDone = false
    }

    if (!allDone) return false

    if (sim.stage === 'request') {
      // The broadcast has reached everyone; only the owner answers.
      noteRef.current = `${TARGET_IP} answers (unicast): "I am at ${OTHERS[OWNER].mac}." Everyone else stays silent.`
      sim.stage = 'reply'
      sim.frames = [{
        route: [OTHERS[OWNER], CENTER, HOST_A],
        leg: 0, t: 0, done: false,
        color: COL.green,
        label: `is-at ${OTHERS[OWNER].mac.slice(-5)}`,
      }]
      force(x => x + 1)
      return false
    }

    if (sim.stage === 'reply') {
      // Host A caches the mapping, then sends the real frame by MAC.
      cachedRef.current = true
      noteRef.current = `A caches ${TARGET_IP} → ${OTHERS[OWNER].mac}, then sends the data frame straight to that MAC.`
      sim.stage = 'deliver'
      sim.frames = [{
        route: [HOST_A, CENTER, OTHERS[OWNER]],
        leg: 0, t: 0, done: false,
        color: COL.accent,
        label: `frame → ${OTHERS[OWNER].mac.slice(-5)}`,
      }]
      force(x => x + 1)
      return false
    }

    // deliver finished.
    deliveredRef.current = true
    noteRef.current = `Delivered to ${OTHERS[OWNER].mac}. The mapping is cached — a second send needs no broadcast.`
    sim.stage = 'idle'
    sim.frames = []
    force(x => x + 1)
    return true
  }, [])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const loop = () => {
      const finished = step(16)
      draw()
      if (finished) { setRunning(false); return }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  const resolve = useCallback((useCache: boolean) => {
    cancelAnimationFrame(rafRef.current)
    const sim = simRef.current
    heardRef.current = {}
    deliveredRef.current = false

    if (useCache && cachedRef.current) {
      noteRef.current = `A already has ${TARGET_IP} → ${OTHERS[OWNER].mac} cached → no ARP, straight to a unicast frame.`
      sim.stage = 'deliver'
      sim.frames = [{
        route: [HOST_A, CENTER, OTHERS[OWNER]],
        leg: 0, t: 0, done: false,
        color: COL.accent,
        label: `frame → ${OTHERS[OWNER].mac.slice(-5)}`,
      }]
    } else {
      cachedRef.current = false
      noteRef.current = `A broadcasts an ARP request to EVERY host: "Who has ${TARGET_IP}? Tell 192.168.1.10."`
      sim.stage = 'request'
      sim.frames = OTHERS.map((_, i) => ({
        route: [HOST_A, CENTER, OTHERS[i]],
        leg: 0, t: 0, done: false,
        color: COL.cyan,
        label: `who has .${TARGET_IP.split('.')[3]}?`,
        onArrive: i,
      }))
    }
    force(x => x + 1)
    setRunning(true)
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) resolve(false)
      else draw()
    },
  })

  useEffect(() => { draw() }, [draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    simRef.current = { stage: 'idle', frames: [] }
    cachedRef.current = false
    heardRef.current = {}
    deliveredRef.current = false
    noteRef.current = 'Host A knows the IP 192.168.1.20 but not its MAC. Resolve it to send.'
    triggerReset()
    force(x => x + 1)
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · ARP resolving an IP to a MAC</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => resolve(false)}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
          style={{ background: COL.cyan, color: '#0F0D0A' }}
        >
          <Radio size={12} /> Resolve &amp; send (broadcast)
        </button>
        <button
          onClick={() => resolve(true)}
          disabled={running || !cachedRef.current}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
          style={{ background: COL.accent, color: '#0F0D0A' }}
        >
          <Send size={12} /> Send again (use cache)
        </button>
        <span className="text-xs text-text-muted">Broadcast to find the MAC, then unicast; the second send skips the broadcast.</span>
      </div>
    </div>
  )
}

function drawHost(ctx: CanvasRenderingContext2D, h: Host, stroke: string, fill: string, tag: string) {
  ctx.beginPath()
  ctx.roundRect(h.x - 66, h.y - 24, 132, 48, 7)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.75
  ctx.stroke()
  ctx.fillStyle = stroke
  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(h.ip, h.x, h.y - 8)
  ctx.font = '9px monospace'
  ctx.fillStyle = COL.mute
  ctx.fillText(h.mac, h.x, h.y + 5)
  ctx.font = '8px monospace'
  ctx.fillStyle = stroke
  ctx.fillText(tag, h.x, h.y + 17)
}
