'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 320

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

const SEA = 58 // sea level, px
const FRAMES_PER_MYR = 70 // model clock: ~1.2 s of wall time per million years

type Mode = 'divergent' | 'ocean-continent' | 'continent-continent' | 'transform'

type ModeInfo = {
  id: Mode
  short: string
  title: string
  landform: string
  example: string
  quakes: string
  y0: number // depth-zero line, px
  kpp: number // px per km of depth
  ticks: number[]
}

const MODES: ModeInfo[] = [
  {
    id: 'divergent',
    short: 'Divergent',
    title: 'Divergent · mid-ocean ridge',
    landform: 'rift valley + new ocean floor',
    example: 'Mid-Atlantic Ridge, East African Rift',
    quakes: 'shallow only, < ~20 km, on the axis',
    y0: 85,
    kpp: 1.6,
    ticks: [0, 10, 20, 30],
  },
  {
    id: 'ocean-continent',
    short: 'Convergent O–C',
    title: 'Convergent · ocean under continent',
    landform: 'trench + volcanic arc',
    example: 'Peru–Chile trench, Andes',
    quakes: 'shallow to ~660 km down the slab',
    y0: 118,
    kpp: 0.26,
    ticks: [0, 100, 300, 660],
  },
  {
    id: 'continent-continent',
    short: 'Convergent C–C',
    title: 'Convergent · continent meets continent',
    landform: 'mountain belt with a crustal root',
    example: 'India–Eurasia, the Himalaya',
    quakes: 'mostly < 70 km, a few to ~300 km',
    y0: 76,
    kpp: 0.42,
    ticks: [0, 50, 150, 300],
  },
  {
    id: 'transform',
    short: 'Transform',
    title: 'Transform · plates slide past',
    landform: 'strike-slip fault, no crust made or lost',
    example: 'San Andreas fault, oceanic fracture zones',
    quakes: 'shallow, < ~20 km, on a vertical plane',
    y0: 96,
    kpp: 4.5,
    ticks: [0, 10, 20, 30],
  },
]

const infoFor = (m: Mode): ModeInfo => MODES.find(x => x.id === m) ?? MODES[0]

// ---------------------------------------------------------------------------
// Deterministic pseudo-random earthquake catalogues (one per boundary type).
// A seeded LCG keeps the same picture on every mount.
// ---------------------------------------------------------------------------
type Quake = { x: number; d: number; mag: number; ph: number }

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function buildQuakes(mode: Mode): Quake[] {
  const r = lcg(mode.length * 7919 + 13)
  const out: Quake[] = []
  const n = 44
  for (let i = 0; i < n; i++) {
    const u = r()
    const v = r()
    let x = 300
    let d = 5
    if (mode === 'divergent') {
      x = 300 + (v - 0.5) * 70
      d = 2 + u * 14
    } else if (mode === 'ocean-continent') {
      // Wadati–Benioff zone: dense and shallow near the trench, thinning with depth.
      d = 8 + 650 * Math.pow(u, 1.7)
      x = 330 + 0.3 * d + (v - 0.5) * 26
    } else if (mode === 'continent-continent') {
      d = 4 + 290 * Math.pow(u, 2.4)
      x = 300 + (v - 0.5) * 190
    } else {
      x = 300 + (v - 0.5) * 16
      d = 2 + u * 17
    }
    out.push({ x, d, mag: 2.6 + r() * 3.6, ph: r() })
  }
  return out
}

const QUAKES: Record<Mode, Quake[]> = {
  divergent: buildQuakes('divergent'),
  'ocean-continent': buildQuakes('ocean-continent'),
  'continent-continent': buildQuakes('continent-continent'),
  transform: buildQuakes('transform'),
}

const quakeColor = (d: number) => (d < 70 ? GOLD : d < 300 ? BLUE : VIOLET)

// ---------------------------------------------------------------------------
// Small drawing helpers
// ---------------------------------------------------------------------------
function arrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 1.6,
  head = 6
) {
  const a = Math.atan2(y2 - y1, x2 - x1)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - head * Math.cos(a - 0.42), y2 - head * Math.sin(a - 0.42))
  ctx.lineTo(x2 - head * Math.cos(a + 0.42), y2 - head * Math.sin(a + 0.42))
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color = 'rgba(245,240,232,0.55)',
  size = 9
) {
  ctx.font = `${size}px monospace`
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

// A convection cell drawn as dots circulating round an ellipse.
function convection(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  dir: number,
  phase: number,
  alpha = 0.32
) {
  ctx.strokeStyle = `rgba(34,211,238,${alpha * 0.35})`
  ctx.lineWidth = 1
  ctx.setLineDash([3, 5])
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])

  const N = 14
  for (let i = 0; i < N; i++) {
    const th = dir * 2 * Math.PI * (phase + i / N)
    const x = cx + rx * Math.cos(th)
    const y = cy + ry * Math.sin(th)
    ctx.beginPath()
    ctx.arc(x, y, 1.6, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(34,211,238,${alpha})`
    ctx.fill()
  }
}

function mantleBackdrop(ctx: CanvasRenderingContext2D, top: number) {
  ctx.fillStyle = 'rgba(167,139,250,0.05)'
  ctx.fillRect(0, top, W, H - top)
  ctx.strokeStyle = 'rgba(255,245,235,0.04)'
  ctx.lineWidth = 1
  for (let y = top + 24; y < H; y += 26) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
}

function depthAxis(ctx: CanvasRenderingContext2D, info: ModeInfo) {
  ctx.strokeStyle = 'rgba(255,245,235,0.12)'
  ctx.lineWidth = 1
  for (const t of info.ticks) {
    const y = info.y0 + t * info.kpp
    if (y > H - 6) continue
    ctx.beginPath()
    ctx.moveTo(4, y)
    ctx.lineTo(11, y)
    ctx.stroke()
    label(ctx, `${t}`, 13, y + 3, 'rgba(245,240,232,0.3)', 8)
  }
  label(ctx, 'km', 4, info.y0 - 6, 'rgba(245,240,232,0.3)', 8)
}

// ---------------------------------------------------------------------------
// Boundary-type scenes
// ---------------------------------------------------------------------------

// Real ocean floor deepens as the square root of crustal age (Parsons & Sclater,
// 1977), so the flanks of the ridge are drawn with a sqrt profile.
const bathy = (x: number) => {
  const s = Math.min(1, Math.abs(x - 300) / 300)
  const rift = Math.abs(x - 300) < 13 ? 9 * (1 - Math.abs(x - 300) / 13) : 0
  return 76 + 20 * Math.sqrt(s) + rift
}
const lithBase = (x: number) => {
  const s = Math.min(1, Math.abs(x - 300) / 300)
  return bathy(x) + 12 + 36 * Math.sqrt(s)
}

function drawDivergent(ctx: CanvasRenderingContext2D, phase: number, drift: number) {
  mantleBackdrop(ctx, 100)
  convection(ctx, 190, 212, 96, 62, -1, phase)
  convection(ctx, 410, 212, 96, 62, 1, phase)

  // water column
  ctx.beginPath()
  ctx.moveTo(0, SEA)
  for (let x = 0; x <= W; x += 4) ctx.lineTo(x, bathy(x))
  ctx.lineTo(W, SEA)
  ctx.closePath()
  ctx.fillStyle = 'rgba(96,165,250,0.10)'
  ctx.fill()

  // lithosphere (crust + mantle lid)
  ctx.beginPath()
  for (let x = 0; x <= W; x += 4) ctx.lineTo(x, bathy(x))
  for (let x = W; x >= 0; x -= 4) ctx.lineTo(x, lithBase(x))
  ctx.closePath()
  ctx.fillStyle = 'rgba(34,211,238,0.13)'
  ctx.fill()
  ctx.strokeStyle = `${CYAN}AA`
  ctx.lineWidth = 1.6
  ctx.beginPath()
  for (let x = 0; x <= W; x += 4) ctx.lineTo(x, bathy(x))
  ctx.stroke()

  // isochron ticks drifting away from the axis: the crust itself moving
  for (let k = 0; k < 16; k++) {
    const off = ((k * 34 + drift) % 544) + 8
    for (const s of [1, -1]) {
      const x = 300 + s * off
      if (x < 4 || x > W - 4) continue
      ctx.strokeStyle = 'rgba(245,240,232,0.16)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, bathy(x))
      ctx.lineTo(x, lithBase(x))
      ctx.stroke()
    }
  }

  // magma beneath the axis
  const glow = ctx.createRadialGradient(300, 104, 2, 300, 104, 40)
  glow.addColorStop(0, 'rgba(245,158,11,0.55)')
  glow.addColorStop(1, 'rgba(245,158,11,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(300, 104, 40, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(300, 102, 22, 8, 0, 0, Math.PI * 2)
  ctx.fillStyle = GOLD
  ctx.fill()

  arrow(ctx, 300, 128, 300, 100, GOLD, 1.4)
  arrow(ctx, 250, 70, 190, 70, CYAN)
  arrow(ctx, 350, 70, 410, 70, CYAN)
  arrow(ctx, 336, 92, 372, 96, GOLD, 1.2, 5)

  label(ctx, 'sea level', 8, SEA - 4, 'rgba(96,165,250,0.6)')
  label(ctx, 'rift valley on the axis', 232, 46, CYAN)
  label(ctx, 'new crust', 276, 122, GOLD)
  label(ctx, 'ridge push', 340, 86, GOLD, 8)
  label(ctx, 'asthenosphere (ductile, convecting)', 200, H - 12, 'rgba(167,139,250,0.55)')
  label(ctx, 'lithosphere thickens as it cools and ages →', 330, 150, 'rgba(245,240,232,0.35)', 8)
}

const slabX = (d: number) => 330 + 0.3 * d
const slabY = (d: number) => 118 + 0.26 * d

function drawOceanContinent(ctx: CanvasRenderingContext2D, phase: number, drift: number) {
  mantleBackdrop(ctx, 100)
  convection(ctx, 300, 214, 168, 66, 1, phase)

  // surface profile
  const surf = (x: number) => {
    if (x < 292) return 96
    if (x < 330) return 96 + ((x - 292) / 38) * 22
    if (x < 372) return 118 - ((x - 330) / 42) * 68
    return 50
  }

  // water
  ctx.beginPath()
  ctx.moveTo(0, SEA)
  for (let x = 0; x <= 372; x += 3) ctx.lineTo(x, Math.max(SEA, surf(x)))
  ctx.lineTo(372, SEA)
  ctx.closePath()
  ctx.fillStyle = 'rgba(96,165,250,0.10)'
  ctx.fill()

  // downgoing slab, drawn as a thick stroke along the Benioff surface
  ctx.lineCap = 'round'
  ctx.lineWidth = 24
  ctx.strokeStyle = 'rgba(34,211,238,0.16)'
  ctx.beginPath()
  ctx.moveTo(330, 124)
  for (let d = 0; d <= 660; d += 20) ctx.lineTo(slabX(d), slabY(d) + 8)
  ctx.stroke()
  ctx.lineWidth = 2
  ctx.strokeStyle = `${CYAN}CC`
  ctx.beginPath()
  ctx.moveTo(330, 118)
  for (let d = 0; d <= 660; d += 20) ctx.lineTo(slabX(d), slabY(d))
  ctx.stroke()
  ctx.lineCap = 'butt'

  // oceanic lithosphere
  ctx.beginPath()
  ctx.moveTo(0, 96)
  ctx.lineTo(330, 118)
  ctx.lineTo(330, 142)
  ctx.lineTo(0, 128)
  ctx.closePath()
  ctx.fillStyle = 'rgba(34,211,238,0.16)'
  ctx.fill()
  ctx.strokeStyle = `${CYAN}AA`
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(0, 96)
  ctx.lineTo(330, 118)
  ctx.stroke()

  // continental plate: thick, buoyant, standing above sea level
  ctx.beginPath()
  ctx.moveTo(336, 116)
  ctx.lineTo(372, 50)
  ctx.lineTo(W, 50)
  ctx.lineTo(W, 128)
  ctx.lineTo(370, 128)
  ctx.closePath()
  ctx.fillStyle = 'rgba(16,185,129,0.16)'
  ctx.fill()
  ctx.strokeStyle = `${GREEN}BB`
  ctx.lineWidth = 1.6
  ctx.stroke()

  // volcanic arc, fed from ~110 km down the slab where the slab dehydrates
  const md = 110
  ctx.setLineDash([3, 4])
  ctx.strokeStyle = `${GOLD}99`
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(slabX(md), slabY(md))
  ctx.quadraticCurveTo(384, 110, 398, 50)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(382, 50)
  ctx.lineTo(398, 22)
  ctx.lineTo(414, 50)
  ctx.closePath()
  ctx.fillStyle = GOLD
  ctx.fill()
  const puff = 3 + 2 * Math.sin(phase * 2 * Math.PI * 3)
  ctx.beginPath()
  ctx.arc(398, 16, puff, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(245,158,11,0.35)'
  ctx.fill()

  // plate motion ticks on the incoming ocean plate
  for (let k = 0; k < 10; k++) {
    const x = ((k * 34 + drift) % 320) + 4
    ctx.strokeStyle = 'rgba(245,240,232,0.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, 96 + (x / 330) * 22)
    ctx.lineTo(x, 128)
    ctx.stroke()
  }

  arrow(ctx, 150, 76, 250, 78, CYAN)
  arrow(ctx, 540, 76, 470, 74, GREEN)
  arrow(ctx, slabX(430), slabY(430), slabX(560), slabY(560), GOLD, 2, 7)

  label(ctx, 'trench', 300, 138, 'rgba(245,240,232,0.55)')
  label(ctx, 'volcanic arc', 424, 30, GOLD)
  label(ctx, 'slab pull (dominant driver)', 388, 264, GOLD)
  label(ctx, 'oceanic plate', 90, 90, CYAN)
  label(ctx, 'continental plate', 452, 66, GREEN)
  label(ctx, 'asthenosphere', 60, H - 12, 'rgba(167,139,250,0.55)')
}

function drawContinentContinent(ctx: CanvasRenderingContext2D, phase: number, drift: number) {
  mantleBackdrop(ctx, 120)
  convection(ctx, 170, 232, 96, 54, 1, phase, 0.24)
  convection(ctx, 430, 232, 96, 54, -1, phase, 0.24)

  const g = (x: number) => Math.exp(-Math.pow((x - 300) / 52, 2))
  const top = (x: number) => 76 - 42 * g(x)
  const base = (x: number) => 116 + 80 * g(x)

  ctx.beginPath()
  for (let x = 0; x <= W; x += 3) ctx.lineTo(x, top(x))
  for (let x = W; x >= 0; x -= 3) ctx.lineTo(x, base(x))
  ctx.closePath()
  ctx.fillStyle = 'rgba(16,185,129,0.15)'
  ctx.fill()
  ctx.strokeStyle = `${GREEN}CC`
  ctx.lineWidth = 1.8
  ctx.beginPath()
  for (let x = 0; x <= W; x += 3) ctx.lineTo(x, top(x))
  ctx.stroke()
  ctx.strokeStyle = 'rgba(16,185,129,0.5)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  for (let x = 0; x <= W; x += 3) ctx.lineTo(x, base(x))
  ctx.stroke()

  // thrust-stacked layers riding toward the suture
  for (let k = 0; k < 9; k++) {
    const off = ((k * 32 + drift) % 288) + 6
    for (const s of [1, -1]) {
      const x = 300 + s * off
      if (x < 4 || x > W - 4) continue
      ctx.strokeStyle = 'rgba(245,240,232,0.13)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, top(x))
      ctx.lineTo(x, base(x))
      ctx.stroke()
    }
  }

  ctx.setLineDash([4, 4])
  ctx.strokeStyle = `${GOLD}AA`
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.moveTo(300, top(300))
  ctx.lineTo(300, base(300))
  ctx.stroke()
  ctx.setLineDash([])

  arrow(ctx, 120, 60, 210, 60, GREEN)
  arrow(ctx, 480, 60, 390, 60, GREEN)

  label(ctx, 'suture zone', 306, 60, GOLD)
  label(ctx, 'mountain belt', 236, 26, GREEN)
  label(ctx, 'crustal root — the crust doubles in thickness', 210, 208, 'rgba(245,240,232,0.45)', 8)
  label(ctx, 'neither plate subducts: continental crust is too buoyant', 128, H - 12, 'rgba(245,240,232,0.4)')
}

function drawTransform(ctx: CanvasRenderingContext2D, phase: number, drift: number) {
  // Map view across the top: the fault trace and a stream offset by slip.
  ctx.fillStyle = 'rgba(255,245,235,0.03)'
  ctx.fillRect(0, 4, W, 74)
  ctx.strokeStyle = 'rgba(255,245,235,0.08)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 4.5, W - 1, 73)

  const slip = 20 + (drift % 46)
  ctx.strokeStyle = `${GOLD}CC`
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(300, 8)
  ctx.lineTo(300, 74)
  ctx.stroke()

  ctx.strokeStyle = BLUE
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(120, 30)
  ctx.lineTo(300, 30)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(300, 30 + slip * 0.5)
  ctx.lineTo(500, 30 + slip * 0.5)
  ctx.stroke()
  ctx.setLineDash([2, 3])
  ctx.strokeStyle = 'rgba(96,165,250,0.4)'
  ctx.beginPath()
  ctx.moveTo(300, 30)
  ctx.lineTo(300, 30 + slip * 0.5)
  ctx.stroke()
  ctx.setLineDash([])

  arrow(ctx, 200, 62, 200, 46, CYAN, 1.4, 5)
  arrow(ctx, 400, 46, 400, 62, CYAN, 1.4, 5)
  label(ctx, 'map view: an offset stream', 8, 16, 'rgba(245,240,232,0.45)')
  label(ctx, 'fault trace', 306, 16, GOLD)

  // Cross-section beneath.
  mantleBackdrop(ctx, 190)
  ctx.beginPath()
  ctx.rect(0, 96, W, 94)
  ctx.fillStyle = 'rgba(34,211,238,0.12)'
  ctx.fill()
  ctx.strokeStyle = `${CYAN}AA`
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(0, 96)
  ctx.lineTo(W, 96)
  ctx.stroke()

  ctx.strokeStyle = `${GOLD}DD`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(300, 96)
  ctx.lineTo(300, 186)
  ctx.stroke()
  ctx.setLineDash([4, 4])
  ctx.lineWidth = 1.3
  ctx.strokeStyle = 'rgba(245,158,11,0.5)'
  ctx.beginPath()
  ctx.moveTo(300, 186)
  ctx.lineTo(300, 250)
  ctx.stroke()
  ctx.setLineDash([])

  // motion into / out of the page
  const wob = 1 + 0.6 * Math.sin(phase * 2 * Math.PI)
  for (const [cx, into] of [
    [170, 0],
    [430, 1],
  ] as [number, number][]) {
    ctx.beginPath()
    ctx.arc(cx, 140, 11 * wob * 0.5 + 8, 0, Math.PI * 2)
    ctx.strokeStyle = CYAN
    ctx.lineWidth = 1.6
    ctx.stroke()
    ctx.beginPath()
    if (into) {
      ctx.moveTo(cx - 7, 133)
      ctx.lineTo(cx + 7, 147)
      ctx.moveTo(cx + 7, 133)
      ctx.lineTo(cx - 7, 147)
    } else {
      ctx.arc(cx, 140, 3, 0, Math.PI * 2)
    }
    ctx.strokeStyle = CYAN
    ctx.fillStyle = CYAN
    if (into) ctx.stroke()
    else ctx.fill()
    label(
      ctx,
      into ? 'away from you' : 'toward you',
      cx - 34,
      168,
      'rgba(245,240,232,0.45)'
    )
  }

  label(ctx, 'seismogenic crust (brittle)', 12, 112, CYAN)
  label(ctx, 'ductile shear below ~20 km', 316, 232, 'rgba(245,158,11,0.6)')
  label(ctx, 'no crust created, none destroyed', 176, H - 12, 'rgba(245,240,232,0.4)')
}

// ---------------------------------------------------------------------------

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  rate: { default: 5, min: 2, max: 10, step: 1 },
}

export function PlateTectonicsAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const lastRef = useRef<number | null>(null)
  const frameRef = useRef(0)
  const myrRef = useRef(0)

  const [mode, setMode] = useState<Mode>('divergent')
  const { params, set, permalink, isDefault, restored } = useWidgetParams('plate-tectonics', SPEC)
  const { rate } = params
  const [running, setRunning] = useState(false)
  const [clock, setClock] = useState(0) // model time, Myr

  const modeRef = useRef(mode)
  const rateRef = useRef(rate)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  useEffect(() => {
    rateRef.current = rate
  }, [rate])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const m = modeRef.current
    const info = infoFor(m)
    const f = frameRef.current
    const phase = (f / 260) % 1
    const drift = (f * rateRef.current) / 26

    ctx.clearRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(255,245,235,0.035)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }

    if (m === 'divergent') drawDivergent(ctx, phase, drift)
    else if (m === 'ocean-continent') drawOceanContinent(ctx, phase, drift)
    else if (m === 'continent-continent') drawContinentContinent(ctx, phase, drift)
    else drawTransform(ctx, phase, drift)

    // earthquake foci
    for (const q of QUAKES[m]) {
      const y = info.y0 + q.d * info.kpp
      if (y > H - 4 || y < 2) continue
      const cycle = (phase * 2.2 + q.ph) % 1
      const pop = cycle < 0.3 ? 1 - cycle / 0.3 : 0
      const col = quakeColor(q.d)
      const r = 1.3 + (q.mag - 2.6) * 0.7
      ctx.beginPath()
      ctx.arc(q.x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = `${col}88`
      ctx.fill()
      if (pop > 0.02) {
        ctx.beginPath()
        ctx.arc(q.x, y, r + 7 * (1 - pop), 0, Math.PI * 2)
        ctx.strokeStyle = `${col}${Math.floor(pop * 200)
          .toString(16)
          .padStart(2, '0')}`
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
    }

    depthAxis(ctx, info)

    ctx.font = '11px monospace'
    ctx.fillStyle = CYAN
    ctx.fillText(info.title, 12, 18)
    label(ctx, `${rateRef.current.toFixed(0)} cm/yr`, 12, 32, 'rgba(245,240,232,0.45)', 10)

    // depth legend
    const keys: [string, string][] = [
      ['shallow < 70 km', GOLD],
      ['70–300 km', BLUE],
      ['> 300 km', VIOLET],
    ]
    keys.forEach(([t, c], i) => {
      const x = 404
      const y = 296 - i * 12
      ctx.beginPath()
      ctx.arc(x, y - 3, 3, 0, Math.PI * 2)
      ctx.fillStyle = c
      ctx.fill()
      label(ctx, t, x + 8, y, 'rgba(245,240,232,0.45)', 8)
    })
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        frameRef.current = 120
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    draw()
  }, [draw, mode, rate])

  useEffect(() => {
    if (!running) {
      lastRef.current = null
      cancelAnimationFrame(rafRef.current)
      return
    }
    const loop = (t: number) => {
      if (lastRef.current === null) lastRef.current = t
      const dt = Math.min(64, t - lastRef.current)
      lastRef.current = t
      const steps = dt / 16.7
      frameRef.current += steps
      myrRef.current += steps / FRAMES_PER_MYR
      setClock(myrRef.current)
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    lastRef.current = null
    frameRef.current = 0
    myrRef.current = 0
    setClock(0)
    setMode('divergent')
    modeRef.current = 'divergent'
    set('rate', 5)
    rateRef.current = 5
    draw()
  }

  const info = infoFor(mode)
  // 1 cm/yr is exactly 10 km per million years.
  const displacement = rate * 10 * clock

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Plate boundaries in cross-section
        </span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button
            onClick={resetAll}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: Plate boundaries in cross-section. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Play
            </>
          )}
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                mode === m.id
                  ? 'bg-accent-cyan/20 text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
              style={mode === m.id ? { boxShadow: `inset 0 0 0 1px ${CYAN}` } : undefined}
            >
              {m.short}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Rate:</span>
          <input
            type="range"
            min={SPEC.rate.min}
            max={SPEC.rate.max}
            step={SPEC.rate.step}
            value={rate}
            onChange={e => set('rate', +e.target.value)}
            className="w-28 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">{rate} cm/yr</span>
        </label>
      </div>
      <div className="animation-controls flex-wrap gap-3 text-xs text-text-muted">
        <span>
          landform: <strong style={{ color: CYAN }}>{info.landform}</strong>
        </span>
        <span>
          quakes: <strong className="text-text-secondary">{info.quakes}</strong>
        </span>
        <span className="ml-auto font-mono">
          {clock.toFixed(1)} Myr · {Math.round(displacement).toLocaleString('en-US')} km ·{' '}
          {info.example}
        </span>
      </div>
    </div>
  )
}
