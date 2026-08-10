'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 620
const H = 360

// --- palette (Biology accent = lime) ----------------------------------------
const LIME = '#A3E635'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const TEXT = 'rgba(245,240,232,'

// --- stage layout -----------------------------------------------------------
const PT = 74          // panel top
const PB = 184         // panel bottom

type Stage = {
  x0: number
  x1: number
  name: string
  sub: string
  color: string
  atp: number          // ATP produced directly at this stage
  carriers: string     // electron carriers produced
  p0: number           // progress at which this stage starts
  p1: number           // progress at which this stage ends
  needsO2: boolean
}

const STAGES: Stage[] = [
  { x0: 20, x1: 190, name: 'GLYCOLYSIS', sub: 'cytoplasm · no O₂ needed', color: LIME, atp: 2, carriers: '2 NADH', p0: 0.0, p1: 0.25, needsO2: false },
  { x0: 214, x1: 384, name: 'LINK + KREBS', sub: 'mitochondrial matrix', color: GOLD, atp: 2, carriers: '8 NADH · 2 FADH₂', p0: 0.25, p1: 0.55, needsO2: true },
  { x0: 408, x1: 600, name: 'ELECTRON TRANSPORT CHAIN', sub: 'inner membrane · needs O₂', color: BLUE, atp: 26, carriers: 'carriers → ATP', p0: 0.55, p1: 1.0, needsO2: true },
]

// ETC entry point, where carriers are cashed in.
const ETC_X = 430
const ETC_Y = PB - 6
// Fermentation sink (where glycolytic NADH is recycled for no ATP when O2 is off).
const FERM_X = 105
const FERM_Y = 300

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

// Cumulative ATP as a function of pipeline progress: 2 from glycolysis, 2 from
// Krebs (substrate level), 26 from the electron transport chain — ~30 in total.
function atpAt(p: number): number {
  let a = 2 * clamp01(p / 0.25)
  a += 2 * clamp01((p - 0.25) / 0.30)
  a += 26 * clamp01((p - 0.55) / 0.45)
  return a
}

type Carrier = { x: number; y: number; tx: number; ty: number; kind: 'NADH' | 'FADH2'; ferment: boolean }
type Spark = { x: number; y: number; life: number }

export function RespirationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const o2Ref = useRef(true)
  const progressRef = useRef(0)
  const glucoseRef = useRef(0)
  const tRef = useRef(0)
  const spawnRef = useRef(0)
  const carrierTimerRef = useRef(0)

  const carriersRef = useRef<Carrier[]>([])
  const sparksRef = useRef<Spark[]>([])

  const [o2, setO2] = useState(true)
  const [running, setRunning] = useState(false)
  const [atp, setAtp] = useState(0)
  const [glucose, setGlucose] = useState(0)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  useEffect(() => { o2Ref.current = o2 }, [o2])

  // --- drawing --------------------------------------------------------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const p = progressRef.current
    const hasO2 = o2Ref.current
    const curAtp = atpAt(p)

    ctx.clearRect(0, 0, W, H)

    // --- header -------------------------------------------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = hasO2 ? LIME : PINK
    ctx.fillText(hasO2 ? 'AEROBIC RESPIRATION' : 'ANAEROBIC — FERMENTATION', 14, 24)
    ctx.font = '9px monospace'
    ctx.fillStyle = `${TEXT}0.5)`
    ctx.fillText(
      hasO2
        ? 'one glucose fully oxidised · carriers cash in at the chain for the bulk of the ATP'
        : 'no final electron acceptor — everything past glycolysis has stalled',
      14, 40
    )

    // --- flow arrows between panels ----------------------------------------
    ctx.strokeStyle = `${TEXT}0.25)`
    ctx.lineWidth = 1.5
    for (const gap of [[190, 214], [384, 408]]) {
      const alive = hasO2 || gap[0] < 200
      ctx.strokeStyle = alive ? `${TEXT}0.3)` : 'rgba(244,114,182,0.35)'
      ctx.beginPath()
      ctx.moveTo(gap[0] + 2, PT + 34)
      ctx.lineTo(gap[1] - 4, PT + 34)
      ctx.moveTo(gap[1] - 9, PT + 30)
      ctx.lineTo(gap[1] - 4, PT + 34)
      ctx.lineTo(gap[1] - 9, PT + 38)
      ctx.stroke()
    }

    // --- stage panels -------------------------------------------------------
    for (const s of STAGES) {
      const active = p >= s.p0 && p < s.p1
      const done = p >= s.p1
      const stalled = s.needsO2 && !hasO2
      const w = s.x1 - s.x0
      const dim = stalled ? 0.28 : done ? 0.85 : active ? 1 : 0.6

      ctx.beginPath()
      ctx.roundRect(s.x0, PT, w, PB - PT, 8)
      ctx.fillStyle = stalled ? 'rgba(244,114,182,0.05)' : `${s.color}${active ? '26' : '18'}`
      ctx.fill()
      ctx.strokeStyle = stalled ? 'rgba(244,114,182,0.4)' : active ? s.color : `${s.color}77`
      ctx.lineWidth = active ? 2 : 1.25
      ctx.stroke()

      // progress fill inside the active panel
      if (active && !stalled) {
        const frac = clamp01((p - s.p0) / (s.p1 - s.p0))
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(s.x0, PT, w, PB - PT, 8)
        ctx.clip()
        ctx.fillStyle = `${s.color}1e`
        ctx.fillRect(s.x0, PT, w * frac, PB - PT)
        ctx.restore()
      }

      ctx.textAlign = 'center'
      const cx = (s.x0 + s.x1) / 2
      ctx.globalAlpha = dim
      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = stalled ? PINK : s.color
      ctx.fillText(s.name, cx, PT + 20)
      ctx.font = '8px monospace'
      ctx.fillStyle = `${TEXT}0.5)`
      ctx.fillText(s.sub, cx, PT + 34)

      // direct ATP badge
      ctx.font = 'bold 15px monospace'
      ctx.fillStyle = stalled ? 'rgba(244,114,182,0.6)' : s.color
      const shown = s.name.startsWith('ELECTRON') ? (hasO2 ? `+${s.atp}` : '+0') : (stalled ? '+0' : `+${s.atp}`)
      ctx.fillText(shown, cx, PT + 62)
      ctx.font = '8px monospace'
      ctx.fillStyle = `${TEXT}0.45)`
      ctx.fillText('ATP direct', cx, PT + 76)

      // carriers produced
      ctx.font = '8px monospace'
      ctx.fillStyle = stalled ? 'rgba(244,114,182,0.55)' : `${VIOLET}cc`
      ctx.fillText(stalled ? 'stalled' : s.carriers, cx, PT + 96)
      ctx.globalAlpha = 1
    }

    // --- fermentation sink (only relevant with O2 off) ----------------------
    if (!hasO2) {
      ctx.textAlign = 'center'
      ctx.font = '8px monospace'
      ctx.fillStyle = 'rgba(244,114,182,0.7)'
      ctx.fillText('NADH → lactate / ethanol', FERM_X, FERM_Y - 10)
      ctx.fillText('(NAD⁺ recycled, no ATP)', FERM_X, FERM_Y + 2)
    }

    // --- carriers in flight -------------------------------------------------
    for (const c of carriersRef.current) {
      const col = c.kind === 'NADH' ? VIOLET : BLUE
      const a = c.ferment ? 0.5 : 0.9
      ctx.beginPath()
      ctx.arc(c.x, c.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = c.ferment ? `rgba(244,114,182,${a})` : `${col}${'e0'}`
      ctx.fill()
      ctx.font = '7px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = `${TEXT}0.6)`
      ctx.fillText(c.kind === 'NADH' ? 'e⁻' : 'e⁻', c.x, c.y + 2.5)
    }

    // --- ATP sparks at the chain -------------------------------------------
    for (const sp of sparksRef.current) {
      const f = clamp01(sp.life)
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = `rgba(163,230,53,${f})`
      ctx.fillText('ATP', sp.x, sp.y)
    }

    // --- yield gauge --------------------------------------------------------
    const GX = 20, GY = 296, GW = W - 40, GH = 20
    const SCALE = 32
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = `${TEXT}0.5)`
    ctx.fillText('ATP yield per glucose', GX, GY - 8)

    ctx.beginPath()
    ctx.roundRect(GX, GY, GW, GH, 5)
    ctx.fillStyle = 'rgba(245,240,232,0.05)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(245,240,232,0.18)'
    ctx.lineWidth = 1
    ctx.stroke()

    const fillW = (curAtp / SCALE) * GW
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(GX, GY, GW, GH, 5)
    ctx.clip()
    ctx.fillStyle = hasO2 ? LIME : PINK
    ctx.globalAlpha = 0.8
    ctx.fillRect(GX, GY, fillW, GH)
    ctx.restore()

    // markers: fermentation (2) and aerobic (~30)
    for (const [val, label, col] of [[2, 'ferment · 2', PINK], [30, '~30 aerobic', LIME]] as const) {
      const mx = GX + (val / SCALE) * GW
      ctx.strokeStyle = `${col}aa`
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(mx, GY - 2); ctx.lineTo(mx, GY + GH + 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.font = '8px monospace'
      ctx.fillStyle = col
      ctx.textAlign = 'center'
      ctx.fillText(label, mx, GY + GH + 13)
    }

    // big running count
    ctx.textAlign = 'right'
    ctx.font = 'bold 22px monospace'
    ctx.fillStyle = hasO2 ? LIME : PINK
    ctx.fillText(`${Math.floor(curAtp)} ATP`, W - 22, GY - 6)
  }, [])

  // --- simulation step ------------------------------------------------------
  const step = useCallback(() => {
    const hasO2 = o2Ref.current
    tRef.current += 0.05

    // advance the pipeline; without oxygen it cannot proceed past glycolysis.
    let p = progressRef.current + 0.0038
    const cap = hasO2 ? 1 : 0.25
    if (p >= cap && !hasO2) p = cap
    if (p >= 1 && hasO2) {
      p = 0
      glucoseRef.current += 1
      setGlucose(glucoseRef.current)
    }
    progressRef.current = p

    // spawn electron carriers during the stages that produce them.
    carrierTimerRef.current += 1
    const spawnEvery = 10
    if (carrierTimerRef.current >= spawnEvery) {
      carrierTimerRef.current = 0
      let src: { x: number; y: number; kind: 'NADH' | 'FADH2' } | null = null
      if (p < 0.25) src = { x: 105 + ((spawnRef.current * 13) % 40) - 20, y: PB - 20, kind: 'NADH' }
      else if (p < 0.55) {
        const k = spawnRef.current % 5
        src = { x: 299 + ((spawnRef.current * 11) % 40) - 20, y: PB - 20, kind: k === 4 ? 'FADH2' : 'NADH' }
      }
      if (src) {
        spawnRef.current++
        // With O2, carriers travel to the chain; without it, glycolytic NADH is
        // shunted to fermentation and everything downstream produces nothing.
        const ferment = !hasO2
        const tx = ferment ? FERM_X : ETC_X
        const ty = ferment ? FERM_Y : ETC_Y
        carriersRef.current.push({ x: src.x, y: src.y, tx, ty, kind: src.kind, ferment })
      }
    }

    carriersRef.current = carriersRef.current.filter(c => {
      const dx = c.tx - c.x
      const dy = c.ty - c.y
      const d = Math.hypot(dx, dy)
      if (d < 5) {
        // Cashed in at the chain: emit an ATP spark (only when aerobic).
        if (!c.ferment) {
          for (let i = 0; i < 2; i++) {
            sparksRef.current.push({ x: ETC_X + 30 + i * 28 + ((spawnRef.current * 7) % 30), y: PT + 62, life: 1 })
          }
        }
        return false
      }
      c.x += (dx / d) * 3.4
      c.y += (dy / d) * 3.4
      return true
    })

    sparksRef.current = sparksRef.current.filter(sp => {
      sp.y -= 0.7
      sp.life -= 0.02
      return sp.life > 0
    })

    setAtp(atpAt(p))
  }, [])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      step()
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  useEffect(() => { if (!running) draw() }, [running, o2, draw])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    o2Ref.current = true
    progressRef.current = 0
    glucoseRef.current = 0
    tRef.current = 0
    spawnRef.current = 0
    carrierTimerRef.current = 0
    carriersRef.current = []
    sparksRef.current = []
    setO2(true)
    setAtp(0)
    setGlucose(0)
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The ATP tally across the stages of respiration</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: The ATP tally across the stages of respiration. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-90"
          style={{ background: LIME, color: '#0F0D0A' }}
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={() => setO2(v => !v)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
          style={{
            color: o2 ? LIME : PINK,
            borderColor: o2 ? `${LIME}55` : '#F472B655',
            background: o2 ? `${LIME}14` : '#F472B614',
          }}
        >
          {o2 ? 'Oxygen: ON' : 'Oxygen: OFF'}
        </button>
        <span className="text-xs font-mono" style={{ color: o2 ? LIME : PINK }}>
          {o2 ? '~30 ATP / glucose' : '2 ATP / glucose'}
        </span>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          ATP {Math.floor(atp)} · glucose processed {glucose}
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Toggle oxygen off and watch the yield collapse from about thirty ATP to two — the whole reason you have to breathe.
      </p>
    </div>
  )
}
