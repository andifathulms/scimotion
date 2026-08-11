'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 300

const PINK = '#F472B6'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const INK = 'rgba(245,240,232,0.5)'
const DIM = 'rgba(245,240,232,0.22)'

type Stage = { title: string; caption: string; color: string }

const STAGES: Stage[] = [
  {
    title: '1 · Sound reaches the eardrum',
    caption: 'Pressure waves in air funnel down the ear canal and set the tympanic membrane vibrating.',
    color: BLUE,
  },
  {
    title: '2 · Ossicles amplify & impedance-match',
    caption:
      'Malleus, incus, stapes lever the motion — matching light air to dense cochlear fluid so the energy is not reflected away.',
    color: GOLD,
  },
  {
    title: '3 · Vibration enters the cochlear fluid',
    caption: 'The stapes pushes on the oval window, launching a pressure wave into the fluid-filled spiral.',
    color: VIOLET,
  },
  {
    title: '4 · The basilar membrane responds',
    caption: 'The wave peaks at the place tuned to its frequency — high near the base, low near the apex.',
    color: PINK,
  },
  {
    title: '5 · Hair cells bend and fire',
    caption: 'Motion at the peak deflects hair-cell bundles, opening ion channels — mechanical motion becomes voltage.',
    color: GREEN,
  },
  {
    title: '6 · The auditory nerve carries the signal',
    caption: 'Spikes travel to the brain, which reads pitch from WHICH fibres fire and loudness from HOW hard.',
    color: GOLD,
  },
]

export function HearingChainAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const timeRef = useRef(0)

  const [stage, setStage] = useState(0)
  const [running, setRunning] = useState(false)

  const stageRef = useRef(0)
  useEffect(() => {
    stageRef.current = stage
  }, [stage])

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: (reduced) => {
      if (!reduced) setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const s = stageRef.current
    const t = timeRef.current
    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'

    const active = (i: number) => (s >= i ? STAGES[i].color : DIM)
    const on = (i: number) => s >= i

    // ---- 1. incoming sound wave -----------------------------------------
    ctx.strokeStyle = active(0)
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 16; x <= 96; x += 3) {
      const amp = on(0) ? 12 : 5
      const y = 110 + amp * Math.sin((x - 16) / 7 - (on(0) ? t * 4 : 0))
      if (x === 16) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.fillStyle = active(0)
    ctx.fillText('sound', 30, 150)

    // ---- 2. eardrum (tympanic membrane) ---------------------------------
    const drumFlex = on(0) ? 4 * Math.sin(t * 4) : 0
    ctx.strokeStyle = active(0)
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(108, 86)
    ctx.quadraticCurveTo(108 + drumFlex, 110, 108, 134)
    ctx.stroke()
    ctx.fillStyle = active(0)
    ctx.fillText('eardrum', 92, 150)

    // ---- 3. ossicles: malleus–incus–stapes lever ------------------------
    const lever = on(1) ? 5 * Math.sin(t * 4) : 0
    const bones: [number, number][] = [
      [126, 96 + lever],
      [150, 80 - lever],
      [176, 104 + lever],
      [196, 112 + lever * 1.4],
    ]
    ctx.strokeStyle = active(1)
    ctx.lineWidth = 2
    ctx.beginPath()
    bones.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.stroke()
    for (const [x, y] of bones) {
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fillStyle = active(1)
      ctx.fill()
    }
    ctx.fillStyle = active(1)
    ctx.fillText('ossicles', 132, 66)
    if (on(1)) {
      ctx.fillStyle = INK
      ctx.fillText('air → fluid', 128, 78)
    }

    // ---- 4. cochlea: uncoiled fluid duct + basilar membrane -------------
    const CX0 = 210
    const CX1 = 556
    ctx.strokeStyle = on(2) ? DIM : 'rgba(245,240,232,0.12)'
    ctx.lineWidth = 1
    ctx.strokeRect(CX0, 92, CX1 - CX0, 60)

    // oval window where the stapes pushes
    ctx.strokeStyle = active(2)
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(CX0, 96)
    ctx.lineTo(CX0, 148)
    ctx.stroke()

    // pressure wave travelling into the fluid
    if (on(2)) {
      ctx.strokeStyle = `${VIOLET}88`
      ctx.lineWidth = 1
      const head = CX0 + ((t * 60) % (CX1 - CX0 - 10))
      for (let k = 0; k < 3; k++) {
        const x = CX0 + ((head - CX0 - k * 26 + (CX1 - CX0)) % (CX1 - CX0 - 10))
        ctx.beginPath()
        ctx.moveTo(x, 96)
        ctx.lineTo(x, 148)
        ctx.stroke()
      }
    }

    // basilar membrane with a frequency-tuned peak
    const peakX = 300 // characteristic place lit up in this schematic
    ctx.strokeStyle = active(3)
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = CX0 + 4; x <= CX1 - 4; x += 3) {
      const d = x - peakX
      const envd = Math.exp(-((d / 30) ** 2))
      const wob = on(3) ? envd * 9 * Math.sin(t * 5 - d / 14) : 0
      const y = 122 - wob
      if (x === CX0 + 4) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.fillStyle = active(3)
    ctx.fillText('cochlea · basilar membrane', CX0 + 4, 168)

    // ---- 5. hair cells at the peak --------------------------------------
    if (s >= 4 || s === 3) {
      for (let i = -2; i <= 2; i++) {
        const hx = peakX + i * 9
        const bend = on(4) ? 4 * Math.sin(t * 5 + i) : 0
        ctx.strokeStyle = active(4)
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(hx, 128)
        ctx.lineTo(hx + bend, 116)
        ctx.stroke()
      }
      ctx.fillStyle = active(4)
      ctx.fillText('hair cells', peakX - 22, 186)
    }

    // ---- 6. auditory nerve to the brain ---------------------------------
    ctx.strokeStyle = active(5)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(peakX, 132)
    ctx.quadraticCurveTo(360, 210, 470, 210)
    ctx.stroke()
    // spikes travelling along the nerve
    if (on(5)) {
      const sx = 300 + ((t * 90) % 170)
      const frac = (sx - 300) / 170
      const sy = 132 + frac * 78
      ctx.beginPath()
      ctx.arc(sx, sy, 3, 0, Math.PI * 2)
      ctx.fillStyle = GOLD
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(500, 210, 18, 0, Math.PI * 2)
    ctx.strokeStyle = active(5)
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = active(5)
    ctx.fillText('brain', 488, 214)

    // ---- caption ---------------------------------------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = STAGES[s].color
    ctx.fillText(STAGES[s].title, 20, 28)
    ctx.font = '10px monospace'
    ctx.fillStyle = INK
    // wrap the caption across up to two lines
    const words = STAGES[s].caption.split(' ')
    let line = ''
    let y = 44
    for (const word of words) {
      if ((line + word).length > 74) {
        ctx.fillText(line, 20, y)
        line = ''
        y += 13
      }
      line += word + ' '
    }
    ctx.fillText(line, 20, y)
  }, [])

  const loop = useCallback(() => {
    timeRef.current += 0.03
    draw()
    animRef.current = requestAnimationFrame(loop)
  }, [draw])

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(animRef.current)
      return
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running, loop])

  useEffect(() => {
    draw()
  }, [stage, draw])

  // While playing, advance through the stages on a slow timer.
  useEffect(() => {
    if (!running || !visible) return
    const id = setInterval(() => {
      setStage((p) => (p + 1) % STAGES.length)
    }, 2600)
    return () => clearInterval(id)
  }, [running, visible])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setStage(0)
    timeRef.current = 0
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Sound to Signal
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Sound to Signal. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning((r) => !r)}
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
        <button
          onClick={() => {
            setRunning(false)
            setStage((p) => (p - 1 + STAGES.length) % STAGES.length)
          }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 text-text-muted text-xs hover:text-text-secondary transition-colors"
        >
          <ChevronLeft size={12} /> Prev
        </button>
        <button
          onClick={() => {
            setRunning(false)
            setStage((p) => (p + 1) % STAGES.length)
          }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 text-text-muted text-xs hover:text-text-secondary transition-colors"
        >
          Next <ChevronRight size={12} />
        </button>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          stage <strong className="text-accent-gold">{stage + 1}</strong> / {STAGES.length}
        </WidgetStatus>
      </div>
    </div>
  )
}
