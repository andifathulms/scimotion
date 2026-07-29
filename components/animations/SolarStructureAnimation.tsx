'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340
const CX = 210
const CY = 170
const R = 150

const ACCENT = '#818CF8' // field accent, indigo
const BG = '#0F0D0A'

type Layer = {
  key: string
  name: string
  // radius as a fraction of the solar radius R (inner, outer)
  inner: number
  outer: number
  color: string
  temp: string
  role: string
}

// Concentric structure, inner -> outer. Radii are schematic but ordered correctly.
const LAYERS: Layer[] = [
  { key: 'core', name: 'Core', inner: 0, outer: 0.25, color: '#FDE68A', temp: '~15,000,000 K', role: 'The only place fusion happens. Hydrogen fuses to helium, releasing the energy that powers the entire Sun.' },
  { key: 'radiative', name: 'Radiative zone', inner: 0.25, outer: 0.7, color: '#F59E0B', temp: '~7,000,000 → 2,000,000 K', role: 'So dense that energy travels only as radiation, absorbed and re-emitted in a random walk. A photon takes ~10,000–170,000 years to cross it.' },
  { key: 'convective', name: 'Convective zone', inner: 0.7, outer: 1.0, color: '#EA580C', temp: '~2,000,000 → 5,800 K', role: 'Cool enough that plasma boils. Giant cells of hot gas rise, cool, and sink, physically carrying heat to the surface.' },
  { key: 'photosphere', name: 'Photosphere', inner: 1.0, outer: 1.04, color: '#FBBF24', temp: '~5,800 K', role: 'The visible surface, where the gas finally becomes transparent and light escapes into space toward Earth.' },
  { key: 'chromosphere', name: 'Chromosphere', inner: 1.04, outer: 1.1, color: '#F472B6', temp: '~6,000 → 20,000 K', role: 'A thin reddish layer above the surface, visible as a rim during a total eclipse.' },
  { key: 'corona', name: 'Corona', inner: 1.1, outer: 1.42, color: '#A5B4FC', temp: '~1,000,000+ K', role: "The tenuous outer atmosphere — bizarrely far hotter than the surface below, heated by the Sun's tangled magnetic field. It streams outward as the solar wind." },
]

// Deterministic PRNG (mulberry32). Seeded from a counter so every render is identical
// and no Math.random / Date is used.
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A packet of energy on its slow crawl out of the Sun. State advances one step per
// frame, seeded from `tick` so the whole path is reproducible.
type Packet = { r: number; theta: number; years: number; phase: 'radiative' | 'convective' | 'escaped' }

function stepPacket(p: Packet, tick: number): Packet {
  if (p.phase === 'escaped') return p

  if (p.phase === 'radiative') {
    const rand = seeded(tick * 2654435761)
    // Random walk: a mostly-random direction with a faint outward bias, capturing
    // how energy staggers outward through the opaque, dense radiative zone.
    const dir = rand() * Math.PI * 2
    const stepR = 0.012 + rand() * 0.006
    const outwardBias = 0.010
    const nr = p.r + Math.cos(dir) * stepR + outwardBias
    const nt = p.theta + Math.sin(dir) * 0.28
    // Each staggering step stands in for a large slice of the ~100,000-year crawl.
    const years = p.years + 900 + rand() * 400
    if (nr >= 0.7) return { r: 0.7, theta: nt, years, phase: 'convective' }
    return { r: Math.max(0.25, nr), theta: nt, years, phase: 'radiative' }
  }

  // Convective zone: rise briskly and almost straight to the surface.
  const nr = p.r + 0.02
  const years = p.years + 0.02
  if (nr >= 1.0) return { r: 1.0, theta: p.theta, years, phase: 'escaped' }
  return { r: nr, theta: p.theta, years, phase: 'convective' }
}

const START_PACKET: Packet = { r: 0.25, theta: -0.6, years: 0, phase: 'radiative' }

export function SolarStructureAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selected, setSelected] = useState('radiative')
  const [playing, setPlaying] = useState(false)
  const [packet, setPacket] = useState<Packet>(START_PACKET)

  const packetRef = useRef<Packet>(START_PACKET)
  const tickRef = useRef(0)
  const rafRef = useRef(0)
  const frameRef = useRef(0)

  const { ref } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Static final frame: show the packet arrived at the surface.
        const done: Packet = { r: 1.0, theta: -0.6, years: 100000, phase: 'escaped' }
        packetRef.current = done
        setPacket(done)
        setPlaying(false)
      } else {
        setPlaying(true)
      }
    },
  })

  const draw = useCallback(
    (p: Packet, sel: string) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      if (canvas.width !== W * dpr) {
        canvas.width = W * dpr
        canvas.height = H * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      ctx.fillStyle = BG
      ctx.fillRect(0, 0, W, H)

      // Corona glow.
      const corona = LAYERS[5]
      const cg = ctx.createRadialGradient(CX, CY, R, CX, CY, R * corona.outer)
      cg.addColorStop(0, 'rgba(165,180,252,0.35)')
      cg.addColorStop(1, 'rgba(165,180,252,0)')
      ctx.fillStyle = cg
      ctx.beginPath(); ctx.arc(CX, CY, R * corona.outer, 0, Math.PI * 2); ctx.fill()

      // Draw layers outer -> inner so inner ones sit on top.
      for (let i = LAYERS.length - 1; i >= 0; i--) {
        const L = LAYERS[i]
        const isSel = L.key === sel
        ctx.beginPath(); ctx.arc(CX, CY, R * L.outer, 0, Math.PI * 2)
        ctx.fillStyle = L.color
        ctx.globalAlpha = isSel ? 0.95 : 0.6
        ctx.fill()
        ctx.globalAlpha = 1
        if (isSel) {
          ctx.lineWidth = 2
          ctx.strokeStyle = ACCENT
          ctx.beginPath(); ctx.arc(CX, CY, R * L.outer, 0, Math.PI * 2); ctx.stroke()
        }
      }

      // Convection cells: schematic granulation ticks near the surface.
      ctx.strokeStyle = 'rgba(15,13,10,0.4)'
      ctx.lineWidth = 1
      for (let a = 0; a < 40; a++) {
        const ang = (a / 40) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(CX + Math.cos(ang) * R * 0.72, CY + Math.sin(ang) * R * 0.72)
        ctx.lineTo(CX + Math.cos(ang) * R * 0.99, CY + Math.sin(ang) * R * 0.99)
        ctx.stroke()
      }

      // Layer boundary rings (subtle).
      ctx.strokeStyle = 'rgba(15,13,10,0.35)'
      for (const frac of [0.25, 0.7, 1.0]) {
        ctx.beginPath(); ctx.arc(CX, CY, R * frac, 0, Math.PI * 2); ctx.stroke()
      }

      // The energy packet.
      const px = CX + Math.cos(p.theta) * R * p.r
      const py = CY + Math.sin(p.theta) * R * p.r
      const hg = ctx.createRadialGradient(px, py, 0, px, py, 12)
      hg.addColorStop(0, 'rgba(255,255,255,0.95)')
      hg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = hg
      ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill()

      // Escaped: a ray heading toward Earth (8 minutes).
      if (p.phase === 'escaped') {
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 2
        ctx.setLineDash([6, 5])
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(W - 20, py)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = ACCENT
        ctx.font = '11px monospace'
        ctx.fillText('→ 8 min to Earth', W - 150, py - 8)
      }

      // Labels for each layer down the right side.
      ctx.font = '11px monospace'
      ctx.textAlign = 'left'
      const lx = 400
      let ly = 40
      for (const L of LAYERS) {
        const isSel = L.key === sel
        ctx.fillStyle = isSel ? ACCENT : 'rgba(255,245,235,0.55)'
        ctx.beginPath(); ctx.arc(lx - 12, ly - 4, 4, 0, Math.PI * 2)
        ctx.fillStyle = L.color; ctx.fill()
        ctx.fillStyle = isSel ? ACCENT : 'rgba(255,245,235,0.6)'
        ctx.fillText(L.name, lx, ly)
        ly += 26
      }
    },
    []
  )

  // Draw on state changes that are not driven by the rAF loop (selection, static).
  useEffect(() => { draw(packet, selected) }, [draw, packet, selected])

  useEffect(() => {
    if (!playing) return
    const loop = () => {
      frameRef.current += 1
      // Advance the packet a few sub-steps per frame so the crawl reads smoothly.
      if (frameRef.current % 2 === 0) {
        let p = packetRef.current
        if (p.phase === 'escaped') {
          // Pause briefly on arrival, then restart the journey.
          tickRef.current += 1
          if (tickRef.current > 90) {
            tickRef.current = 0
            p = START_PACKET
          }
        } else {
          tickRef.current += 1
          p = stepPacket(p, tickRef.current)
        }
        packetRef.current = p
        setPacket(p)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing])

  const reset = () => {
    setPlaying(false)
    cancelAnimationFrame(rafRef.current)
    tickRef.current = 0
    frameRef.current = 0
    packetRef.current = START_PACKET
    setPacket(START_PACKET)
  }

  const sel = LAYERS.find(L => L.key === selected) ?? LAYERS[1]
  const yearsOut = Math.min(packet.years, 170000)
  const phaseLabel =
    packet.phase === 'radiative' ? 'random walk in radiative zone'
      : packet.phase === 'convective' ? 'rising through convective zone'
        : 'escaped at the photosphere'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Inside the Sun</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: BG }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>core: <span style={{ color: ACCENT }}>~1.5×10⁷ K</span></span>
        <span>surface: <span style={{ color: ACCENT }}>~5,800 K</span></span>
        <span>escape crawl: <span style={{ color: ACCENT }}>~{Math.round(yearsOut).toLocaleString()} yr</span></span>
        <span className="text-text-muted">({phaseLabel})</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setPlaying(p => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: ACCENT, color: BG }}>
          <Play size={12} /> {playing ? 'Pause' : 'Play'} energy crawl
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          {LAYERS.map(L => (
            <button key={L.key} onClick={() => setSelected(L.key)}
              className="px-2 py-1 rounded-md text-xs font-medium transition-colors border"
              style={selected === L.key
                ? { background: ACCENT, color: BG, borderColor: ACCENT }
                : { background: 'transparent', color: 'var(--text-muted, #9ca3af)', borderColor: 'var(--border, #333)' }}>
              {L.name}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 text-xs text-text-muted">
        <strong style={{ color: ACCENT }}>{sel.name}</strong> · <span className="font-mono">{sel.temp}</span> — {sel.role}
      </p>
    </div>
  )
}
