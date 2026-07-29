'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 320

const ORANGE = '#FB923C'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const PINK = '#F472B6'
const INK = '#F5F0E8'

// --- Electron stream geometry ---------------------------------------------
const PATH_L = 232
const PATH_R = 368
const PATH_Y = 150
const PATH_LEN = PATH_R - PATH_L
const N_E = 7
const MAX_SPEED = 3.0

type Proc = {
  key: string
  label: string
  reducer: string
  reducerChange: string
  oxidizer: string
  oxidizerChange: string
  equation: string
  speed: number
  speedLabel: string
  oxygen: boolean
  note: string
}

const PROCS: Proc[] = [
  {
    key: 'combustion',
    label: 'Combustion',
    reducer: 'CH₄  (carbon)',
    reducerChange: 'C:  −4 → +4',
    oxidizer: 'O₂',
    oxidizerChange: 'O:  0 → −2',
    equation: 'CH₄ + 2O₂ → CO₂ + 2H₂O',
    speed: 3.0,
    speedLabel: 'fast — a flame, in milliseconds',
    oxygen: true,
    note: 'Fuel hands its electrons to oxygen all at once, releasing the energy as heat and light.',
  },
  {
    key: 'rusting',
    label: 'Rusting',
    reducer: 'Fe  metal',
    reducerChange: 'Fe:  0 → +3',
    oxidizer: 'O₂ + H₂O',
    oxidizerChange: 'O:  0 → −2',
    equation: '4Fe + 3O₂ → 2Fe₂O₃',
    speed: 0.35,
    speedLabel: 'very slow — rust, over months',
    oxygen: true,
    note: "Exactly combustion's chemistry, run thousands of times slower. Same reaction, different tempo.",
  },
  {
    key: 'battery',
    label: 'Battery',
    reducer: 'Zn  metal',
    reducerChange: 'Zn:  0 → +2',
    oxidizer: 'Cu²⁺',
    oxidizerChange: 'Cu:  +2 → 0',
    equation: 'Zn + Cu²⁺ → Zn²⁺ + Cu',
    speed: 1.4,
    speedLabel: 'medium — routed through a wire',
    oxygen: false,
    note: 'The same electron transfer, but the two halves are separated so the electrons detour through your circuit.',
  },
  {
    key: 'respiration',
    label: 'Respiration',
    reducer: 'glucose (carbon)',
    reducerChange: 'C:  0 → +4',
    oxidizer: 'O₂',
    oxidizerChange: 'O:  0 → −2',
    equation: 'C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O',
    speed: 0.8,
    speedLabel: 'slow & stepwise — banked as ATP',
    oxygen: true,
    note: 'Combustion tamed into dozens of tiny steps inside your cells, so the energy is captured, not lost.',
  },
  {
    key: 'magnesium',
    label: 'Mg + Cl₂  (no O₂)',
    reducer: 'Mg  metal',
    reducerChange: 'Mg:  0 → +2',
    oxidizer: 'Cl₂',
    oxidizerChange: 'Cl:  0 → −1',
    equation: 'Mg + Cl₂ → MgCl₂',
    speed: 2.6,
    speedLabel: 'fast — a bright flare',
    oxygen: false,
    note: 'No oxygen anywhere — yet Mg still loses electrons. Proof that oxidation means electron loss, not gaining oxygen.',
  },
]

export function RedoxEverywhereAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const offsetRef = useRef(0)
  const tRef = useRef(0)
  const procRef = useRef<Proc>(PROCS[0])

  const [proc, setProc] = useState<Proc>(PROCS[0])
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => { if (!reduced) setRunning(true) },
  })

  useEffect(() => { procRef.current = proc }, [proc])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pr = procRef.current

    ctx.clearRect(0, 0, W, H)

    // --- Equation banner ---------------------------------------------------
    ctx.textAlign = 'center'
    ctx.font = 'bold 14px monospace'
    ctx.fillStyle = INK
    ctx.fillText(pr.equation, W / 2, 34)

    // --- Reducing-agent box (left, oxidized) -------------------------------
    const boxW = 150
    const boxH = 74
    const lx = 30
    const rx = W - 30 - boxW
    const by = PATH_Y - boxH / 2

    ctx.fillStyle = 'rgba(251,146,60,0.12)'
    ctx.strokeStyle = ORANGE
    ctx.lineWidth = 1.5
    roundRect(ctx, lx, by, boxW, boxH, 8)
    ctx.fill(); ctx.stroke()

    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = INK
    ctx.fillText(pr.reducer, lx + boxW / 2, by + 26)
    ctx.font = '11px monospace'
    ctx.fillStyle = ORANGE
    ctx.fillText(pr.reducerChange, lx + boxW / 2, by + 46)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('oxidized · loses e⁻', lx + boxW / 2, by + 63)
    ctx.font = 'bold 9px monospace'
    ctx.fillStyle = ORANGE
    ctx.fillText('REDUCING AGENT', lx + boxW / 2, by - 8)

    // --- Oxidizing-agent box (right, reduced) ------------------------------
    ctx.fillStyle = 'rgba(245,158,11,0.12)'
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 1.5
    roundRect(ctx, rx, by, boxW, boxH, 8)
    ctx.fill(); ctx.stroke()

    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = INK
    ctx.fillText(pr.oxidizer, rx + boxW / 2, by + 26)
    ctx.font = '11px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText(pr.oxidizerChange, rx + boxW / 2, by + 46)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('reduced · gains e⁻', rx + boxW / 2, by + 63)
    ctx.font = 'bold 9px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText('OXIDIZING AGENT', rx + boxW / 2, by - 8)

    // --- Electron stream (reducer → oxidizer) ------------------------------
    ctx.strokeStyle = 'rgba(96,165,250,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PATH_L, PATH_Y); ctx.lineTo(PATH_R, PATH_Y)
    ctx.stroke()

    for (let i = 0; i < N_E; i++) {
      const d = ((i / N_E) * PATH_LEN + offsetRef.current) % PATH_LEN
      const x = PATH_L + d
      const y = PATH_Y + Math.sin(tRef.current * 0.05 + i) * 6
      ctx.beginPath()
      ctx.arc(x, y, 4.5, 0, Math.PI * 2)
      ctx.fillStyle = BLUE
      ctx.fill()
    }
    // Direction arrow
    ctx.strokeStyle = BLUE
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(PATH_R - 10, PATH_Y - 18)
    ctx.lineTo(PATH_R, PATH_Y - 18)
    ctx.lineTo(PATH_R - 5, PATH_Y - 22)
    ctx.moveTo(PATH_R, PATH_Y - 18)
    ctx.lineTo(PATH_R - 5, PATH_Y - 14)
    ctx.stroke()
    ctx.font = '10px monospace'
    ctx.fillStyle = BLUE
    ctx.fillText('e⁻', (PATH_L + PATH_R) / 2, PATH_Y - 16)

    // --- Speed gauge -------------------------------------------------------
    const gx = 60, gw = W - 120, gy = 240
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    roundRect(ctx, gx, gy, gw, 10, 5)
    ctx.fill()
    const frac = Math.min(1, pr.speed / MAX_SPEED)
    const gcol = frac > 0.6 ? PINK : frac > 0.3 ? GOLD : GREEN
    ctx.fillStyle = gcol
    roundRect(ctx, gx, gy, Math.max(10, gw * frac), 10, 5)
    ctx.fill()
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('slow', gx, gy - 8)
    ctx.textAlign = 'right'
    ctx.fillText('fast', gx + gw, gy - 8)
    ctx.textAlign = 'center'
    ctx.font = '11px monospace'
    ctx.fillStyle = gcol
    ctx.fillText('rate: ' + pr.speedLabel, W / 2, gy + 26)

    // --- Oxygen note -------------------------------------------------------
    ctx.font = '10px monospace'
    if (pr.oxygen) {
      ctx.fillStyle = 'rgba(245,240,232,0.45)'
      ctx.fillText('oxygen is the oxidizing agent here — but it is only one oxidizer among many', W / 2, H - 30)
    } else {
      ctx.fillStyle = pr.key === 'magnesium' ? PINK : VIOLET
      ctx.fillText('★ no oxygen involved — still a redox reaction', W / 2, H - 30)
    }
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.font = '10px monospace'
    wrapText(ctx, pr.note, W / 2, H - 14, W - 60, 12)

    ctx.textAlign = 'left'
  }, [])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      offsetRef.current = (offsetRef.current + procRef.current.speed) % PATH_LEN
      tRef.current += 1
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => { if (!running) draw() }, [running, proc, draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    offsetRef.current = 0
    tRef.current = 0
    setProc(PROCS[0])
    procRef.current = PROCS[0]
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The same transfer, four disguises</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-2">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-orange text-bg-base text-xs font-medium hover:bg-accent-orange/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        {PROCS.map(p => (
          <button
            key={p.key}
            onClick={() => setProc(p)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            style={{
              color: proc.key === p.key ? '#0F0D0A' : 'rgba(245,240,232,0.7)',
              borderColor: proc.key === p.key ? ORANGE : 'rgba(245,240,232,0.18)',
              background: proc.key === p.key ? ORANGE : 'transparent',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lh: number) {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? line + ' ' + word : word
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  const startY = y - (lines.length - 1) * lh
  lines.forEach((ln, i) => ctx.fillText(ln, cx, startY + i * lh))
}
