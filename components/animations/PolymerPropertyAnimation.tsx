'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const ORANGE = '#FB923C'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const TEAL = '#10B981'
const VIOLET = '#A78BFA'
const INK = '#F5F0E8'
const DIM = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.3)'

const BOX_X = 56
const BOX_Y = 74
const BOX_H = 150
const L0 = 300          // rest length of the sample
const CYCLE = 230       // frames per stretch/release cycle

type Structure = 'tangled' | 'aligned' | 'crosslinked'

const SPEC: Record<Structure, {
  label: string
  property: string
  color: string
  maxStrain: number
  recovery: number       // fraction of the stretch that springs back
  chains: number
  amp: number            // chain waviness amplitude
  wiggles: number
  crosslinks: boolean
}> = {
  tangled: {
    label: 'loosely tangled chains',
    property: 'soft & flexible — chains slide, deforms permanently',
    color: ORANGE, maxStrain: 0.55, recovery: 0.25, chains: 4, amp: 16, wiggles: 3.2, crosslinks: false,
  },
  aligned: {
    label: 'aligned / crystalline chains',
    property: 'stiff & strong — packed chains barely stretch',
    color: TEAL, maxStrain: 0.09, recovery: 1, chains: 6, amp: 3, wiggles: 1.2, crosslinks: false,
  },
  crosslinked: {
    label: 'cross-linked network',
    property: 'elastic — stretches far, then snaps back',
    color: VIOLET, maxStrain: 0.62, recovery: 1, chains: 4, amp: 12, wiggles: 2.4, crosslinks: true,
  },
}

// Fixed-seed PRNG so chain shapes never use Math.random.
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function smooth(x: number) { return x * x * (3 - 2 * x) }

function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
  canvas.width = W * dpr
  canvas.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

// strain & release-state for a given frame within the cycle
function strainAt(frame: number, s: Structure): { strain: number; released: boolean } {
  const spec = SPEC[s]
  const resting = spec.maxStrain * (1 - spec.recovery)
  const f = frame % CYCLE
  if (f < 90) return { strain: spec.maxStrain * smooth(f / 90), released: false }
  if (f < 120) return { strain: spec.maxStrain, released: false }
  if (f < 185) return { strain: spec.maxStrain - (spec.maxStrain - resting) * smooth((f - 120) / 65), released: true }
  return { strain: resting, released: true }
}

export function PolymerPropertyAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const frameRef = useRef(0)

  const [running, setRunning] = useState(false)
  const [structure, setStructure] = useState<Structure>('tangled')
  const structRef = useRef<Structure>('tangled')
  const [readout, setReadout] = useState({ strain: 0, released: false })

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      const c = canvasRef.current
      if (c) setupCanvas(c)
      if (reduced) {
        frameRef.current = 100      // a stretched frame as the static view
        draw(100, structRef.current)
        setReadout(strainAt(100, structRef.current))
        return
      }
      setRunning(true)
    },
  })

  const draw = useCallback((frame: number, s: Structure) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const spec = SPEC[s]

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    const { strain, released } = strainAt(frame, s)
    const curLen = L0 * (1 + strain)
    const rightEdge = BOX_X + curLen

    // --- Title ------------------------------------------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = spec.color
    ctx.fillText(spec.label.toUpperCase(), 16, 26)
    ctx.font = '10px monospace'
    ctx.fillStyle = DIM
    ctx.fillText(spec.property, 16, 44)

    // --- Original-length reference marker ---------------------------------
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    ctx.moveTo(BOX_X + L0, BOX_Y - 8)
    ctx.lineTo(BOX_X + L0, BOX_Y + BOX_H + 8)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = FAINT
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('rest length', BOX_X + L0, BOX_Y - 12)

    // --- Sample box (stretches with strain) -------------------------------
    ctx.strokeStyle = 'rgba(245,240,232,0.18)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(BOX_X, BOX_Y, curLen, BOX_H)

    // --- Chains -----------------------------------------------------------
    const rand = mulberry32(s === 'tangled' ? 7 : s === 'aligned' ? 23 : 41)
    const nodes = 26
    const chainYs: number[] = []
    for (let c = 0; c < spec.chains; c++) {
      const cy = BOX_Y + ((c + 1) / (spec.chains + 1)) * BOX_H
      chainYs.push(cy)
      const phase = rand() * Math.PI * 2
      const ampJitter = 0.7 + rand() * 0.6
      ctx.beginPath()
      for (let i = 0; i <= nodes; i++) {
        const fi = i / nodes
        const x = BOX_X + 6 + fi * (curLen - 12)
        // Stretching pulls waviness out: amplitude shrinks as strain grows.
        const amp = spec.amp * ampJitter / (1 + strain * 2.2)
        const y = cy + amp * Math.sin(fi * Math.PI * 2 * spec.wiggles + phase)
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = spec.color
      ctx.lineWidth = 2.4
      ctx.stroke()
    }

    // --- Cross-links (vertical bonds tying chains together) ---------------
    if (spec.crosslinks) {
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 2
      const fracs = [0.22, 0.5, 0.78]
      for (let c = 0; c < chainYs.length - 1; c++) {
        for (const fr of fracs) {
          const x = BOX_X + 6 + fr * (curLen - 12)
          ctx.beginPath()
          ctx.moveTo(x, chainYs[c])
          ctx.lineTo(x, chainYs[c + 1])
          ctx.stroke()
          ctx.fillStyle = GOLD
          ctx.beginPath(); ctx.arc(x, chainYs[c], 3, 0, Math.PI * 2); ctx.fill()
          ctx.beginPath(); ctx.arc(x, chainYs[c + 1], 3, 0, Math.PI * 2); ctx.fill()
        }
      }
    }

    // --- Pull arrow on the right edge -------------------------------------
    const pulling = !released && strain > 0.001
    ctx.strokeStyle = pulling ? BLUE : FAINT
    ctx.fillStyle = pulling ? BLUE : FAINT
    ctx.lineWidth = 2
    const ay = BOX_Y + BOX_H / 2
    ctx.beginPath()
    ctx.moveTo(rightEdge + 6, ay)
    ctx.lineTo(rightEdge + 30, ay)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(rightEdge + 30, ay)
    ctx.lineTo(rightEdge + 22, ay - 5)
    ctx.lineTo(rightEdge + 22, ay + 5)
    ctx.closePath()
    ctx.fill()

    // --- Strain / phase readout on canvas ---------------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = INK
    ctx.fillText('strain: ' + Math.round(strain * 100) + '%', 16, BOX_Y + BOX_H + 40)

    const resting = spec.maxStrain * (1 - spec.recovery)
    let phaseTxt: string
    let phaseColor: string
    if (!released) { phaseTxt = 'STRETCHING'; phaseColor = BLUE }
    else if (resting < 0.02) { phaseTxt = 'RELEASED → recovered'; phaseColor = TEAL }
    else { phaseTxt = 'RELEASED → permanent deformation'; phaseColor = ORANGE }
    ctx.fillStyle = phaseColor
    ctx.fillText(phaseTxt, 150, BOX_Y + BOX_H + 40)

    ctx.textAlign = 'left'
  }, [])

  useEffect(() => {
    if (!running || !visible) return
    const tick = () => {
      frameRef.current += 1
      const s = structRef.current
      draw(frameRef.current, s)
      setReadout(strainAt(frameRef.current, s))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw, visible])


  useEffect(() => {
    const c = canvasRef.current
    if (c) setupCanvas(c)
    draw(0, structRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (!running) draw(frameRef.current, structure) }, [running, structure, draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    frameRef.current = 0
    draw(0, structRef.current)
    setReadout({ strain: 0, released: false })
  }

  const chooseStruct = (s: Structure) => {
    structRef.current = s
    setStructure(s)
    frameRef.current = 0
    draw(0, s)
    setReadout({ strain: 0, released: false })
  }

  const spec = SPEC[structure]
  const resting = spec.maxStrain * (1 - spec.recovery)
  const behaviour = resting < 0.02 ? 'elastic recovery' : 'permanent flow'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Structure sets the material</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Structure sets the material. Values are reported below the diagram." ref={canvasRef} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>structure: <span style={{ color: spec.color }}>{structure}</span></span>
        <span>strain: <span style={{ color: INK }}>{Math.round(readout.strain * 100)}%</span></span>
        <span>on release: <span style={{ color: resting < 0.02 ? TEAL : ORANGE }}>{behaviour}</span></span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          {(['tangled', 'aligned', 'crosslinked'] as Structure[]).map(s => (
            <button
              key={s}
              onClick={() => chooseStruct(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={structure === s
                ? { color: '#0F0D0A', background: SPEC[s].color, borderColor: SPEC[s].color }
                : { color: SPEC[s].color, background: 'transparent', borderColor: `${SPEC[s].color}55` }}
            >
              {s === 'crosslinked' ? 'Cross-linked' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
