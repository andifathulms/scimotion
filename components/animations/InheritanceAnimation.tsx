'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Shuffle } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300

const LIME = '#A3E635'   // healthy / symbol outline
const VIOLET = '#A78BFA' // the hidden recessive allele (carrier dot)
const PINK = '#F472B6'   // affected — the recessive trait expressed
const GOLD = '#F59E0B'   // the line of descent
const TEXT = 'rgba(245,240,232,0.85)'
const DIM = 'rgba(245,240,232,0.45)'
const FAINT = 'rgba(255,245,235,0.14)'
const BG = '#0F0D0A'

type GT = 'AA' | 'Aa' | 'aa'

// One offspring: inherit one allele from each parent, intact — never blended.
function child(g1: GT, g2: GT): GT {
  const a1 = g1[Math.random() < 0.5 ? 0 : 1]
  const a2 = g2[Math.random() < 0.5 ? 0 : 1]
  const dom = (a1 === 'A' ? 1 : 0) + (a2 === 'A' ? 1 : 0)
  return dom === 2 ? 'AA' : dom === 1 ? 'Aa' : 'aa'
}

type Family = { gen2: GT[]; contIdx: number; gen3: GT[]; resurfaced: boolean }

function buildFamily(kids: number): Family {
  const I1: GT = 'Aa', I2: GT = 'Aa'        // two healthy-looking founders, both carriers
  const gen2: GT[] = [child(I1, I2), child(I1, I2), child(I1, I2)]
  const contIdx = 2                          // this child continues the family line
  const IIM: GT = 'Aa'                       // marries a carrier from outside the family
  const gen3: GT[] = Array.from({ length: kids }, () => child(gen2[contIdx], IIM))
  return { gen2, contIdx, gen3, resurfaced: gen3.some(g => g === 'aa') }
}

// Symbol positions.
const R = 13
const Y_I = 52, I1X = 250, I2X = 330
const Y_II = 150, II_X = [130, 200, 270], CONT_X = 270, IIM_X = 352
const Y_III = 248
const SIB_I_Y = 104, SIB_II_Y = 206
const COUPLE_II_MID = (CONT_X + IIM_X) / 2

function gen3X(i: number, kids: number): number {
  const spacing = 64
  const start = COUPLE_II_MID - ((kids - 1) * spacing) / 2
  return start + i * spacing
}

function drawSymbol(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  male: boolean,
  gt: GT,
  descent: boolean,
): void {
  const affected = gt === 'aa'
  const carrier = gt === 'Aa'
  if (descent) {
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])
    if (male) ctx.strokeRect(x - R - 4, y - R - 4, 2 * (R + 4), 2 * (R + 4))
    else { ctx.beginPath(); ctx.arc(x, y, R + 4, 0, Math.PI * 2); ctx.stroke() }
    ctx.setLineDash([])
  }
  ctx.fillStyle = affected ? PINK : BG
  ctx.strokeStyle = LIME
  ctx.lineWidth = 1.75
  if (male) {
    ctx.beginPath()
    ctx.rect(x - R, y - R, 2 * R, 2 * R)
    ctx.fill()
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.arc(x, y, R, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  if (carrier) {
    ctx.beginPath()
    ctx.arc(x, y, 3.4, 0, Math.PI * 2)
    ctx.fillStyle = VIOLET
    ctx.fill()
  }
  ctx.fillStyle = affected ? BG : TEXT
  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(gt, x, y + (affected ? 0 : 0))
  if (affected) {
    ctx.fillStyle = PINK
    ctx.font = '8px monospace'
    ctx.fillText('affected', x, y + R + 9)
  } else if (carrier) {
    ctx.fillStyle = DIM
    ctx.font = '8px monospace'
    ctx.fillText('carrier', x, y + R + 9)
  }
}

const TRIAL_CAP = 120
const FRAMES_PER_TRIAL = 8

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  kids: { default: 3, min: 2, max: 5, step: 1 },
}

export function InheritanceAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const frameRef = useRef(0)
  const kidsRef = useRef(3)
  const familyRef = useRef<Family>(buildFamily(3))
  const statsRef = useRef({ trials: 1, resurfaced: buildFamily(3).resurfaced ? 1 : 0 })

  const { params, set, permalink, isDefault, restored } = useWidgetParams('inheritance', SPEC)
  const { kids } = params
  const [running, setRunning] = useState(false)
  const [tick, setTick] = useState(0)

  // Seed one honest family on mount (stats seeded from that same family).
  useEffect(() => {
    const f = buildFamily(3)
    familyRef.current = f
    statsRef.current = { trials: 1, resurfaced: f.resurfaced ? 1 : 0 }
    setTick(t => t + 1)
  }, [])

  const resample = useCallback((count: boolean) => {
    const f = buildFamily(kidsRef.current)
    familyRef.current = f
    if (count) {
      statsRef.current.trials += 1
      if (f.resurfaced) statsRef.current.resurfaced += 1
    }
    setTick(t => t + 1)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    const fam = familyRef.current
    const k = kidsRef.current

    // ---- Title + stats -----------------------------------------------------
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = LIME
    ctx.fillText('A RECESSIVE ALLELE ACROSS THREE GENERATIONS', 14, 16)

    const s = statsRef.current
    const frac = s.trials > 0 ? s.resurfaced / s.trials : 0
    ctx.textAlign = 'right'
    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText(`families drawn: ${s.trials}`, W - 14, 12)
    ctx.fillStyle = PINK
    ctx.fillText(`trait resurfaced in Gen III: ${s.resurfaced}  (${(frac * 100).toFixed(0)}%)`, W - 14, 24)

    // ---- Connectors --------------------------------------------------------
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1.25
    // Gen I couple + sibship
    ctx.beginPath(); ctx.moveTo(I1X + R, Y_I); ctx.lineTo(I2X - R, Y_I); ctx.stroke()
    const midI = (I1X + I2X) / 2
    ctx.beginPath(); ctx.moveTo(midI, Y_I); ctx.lineTo(midI, SIB_I_Y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(II_X[0], SIB_I_Y); ctx.lineTo(II_X[II_X.length - 1], SIB_I_Y); ctx.stroke()
    for (const x of II_X) { ctx.beginPath(); ctx.moveTo(x, SIB_I_Y); ctx.lineTo(x, Y_II - R); ctx.stroke() }
    // Gen II couple (continuing child × married-in carrier) + sibship
    ctx.beginPath(); ctx.moveTo(CONT_X + R, Y_II); ctx.lineTo(IIM_X - R, Y_II); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(COUPLE_II_MID, Y_II); ctx.lineTo(COUPLE_II_MID, SIB_II_Y); ctx.stroke()
    const g3xs = Array.from({ length: k }, (_, i) => gen3X(i, k))
    ctx.beginPath(); ctx.moveTo(g3xs[0], SIB_II_Y); ctx.lineTo(g3xs[g3xs.length - 1], SIB_II_Y); ctx.stroke()
    for (const x of g3xs) { ctx.beginPath(); ctx.moveTo(x, SIB_II_Y); ctx.lineTo(x, Y_III - R); ctx.stroke() }

    // ---- Generation labels -------------------------------------------------
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('I', 20, Y_I)
    ctx.fillText('II', 20, Y_II)
    ctx.fillText('III', 20, Y_III)

    // ---- Symbols -----------------------------------------------------------
    // Gen I founders: both carriers, both perfectly healthy in appearance.
    drawSymbol(ctx, I1X, Y_I, true, 'Aa', false)
    drawSymbol(ctx, I2X, Y_I, false, 'Aa', false)
    // Gen II children
    II_X.forEach((x, i) => drawSymbol(ctx, x, Y_II, i % 2 === 0, fam.gen2[i], i === fam.contIdx))
    // Married-in carrier
    drawSymbol(ctx, IIM_X, Y_II, false, 'Aa', false)
    // Gen III children
    fam.gen3.forEach((gt, i) => drawSymbol(ctx, gen3X(i, k), Y_III, i % 2 === 0, gt, false))

    // ---- Status line -------------------------------------------------------
    const cont = fam.gen2[fam.contIdx]
    let status: string
    let col: string
    if (cont === 'aa') {
      status = 'The line continues through an affected parent (aa) — the trait is already visible here.'
      col = PINK
    } else if (cont === 'Aa') {
      col = fam.resurfaced ? PINK : VIOLET
      status = fam.resurfaced
        ? 'A healthy carrier (Aa) passed the hidden allele on — it resurfaced as an affected child in Gen III.'
        : 'A healthy carrier (Aa) still carries the allele — no affected child this time, but it was not diluted.'
    } else {
      status = 'The continuing parent is AA — it inherited no recessive allele, so the trait cannot appear in this branch.'
      col = LIME
    }
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = col
    ctx.fillText(status, 14, 278)

    // ---- Legend ------------------------------------------------------------
    ctx.textAlign = 'left'
    ctx.font = '8px monospace'
    const ly = 292
    ctx.fillStyle = BG; ctx.strokeStyle = LIME; ctx.lineWidth = 1.25
    ctx.beginPath(); ctx.arc(360, ly - 3, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = DIM; ctx.fillText('AA unaffected', 370, ly - 2)
    ctx.beginPath(); ctx.arc(452, ly - 3, 5, 0, Math.PI * 2); ctx.fillStyle = BG; ctx.fill(); ctx.stroke()
    ctx.fillStyle = VIOLET; ctx.beginPath(); ctx.arc(452, ly - 3, 2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = DIM; ctx.fillText('Aa carrier', 461, ly - 2)
    ctx.fillStyle = PINK; ctx.beginPath(); ctx.arc(534, ly - 3, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = DIM; ctx.fillText('aa affected', 543, ly - 2)
  }, [])

  useEffect(() => {
    draw()
  }, [draw, tick])

  // Auto-run: keep drawing fresh families and tallying how often the trait returns.
  useEffect(() => {
    if (!running) return
    const loop = () => {
      frameRef.current += 1
      if (frameRef.current % FRAMES_PER_TRIAL === 0) {
        if (statsRef.current.trials >= TRIAL_CAP) {
          setRunning(false)
          return
        }
        resample(true)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, resample])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        resample(true)
        return
      }
      setRunning(true)
    },
  })

  const changeKids = (v: number) => {
    kidsRef.current = v
    set('kids', v)
    // The resurfacing probability depends on family size, so start the tally over.
    statsRef.current = { trials: 0, resurfaced: 0 }
    resample(true)
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    frameRef.current = 0
    const f = buildFamily(kidsRef.current)
    familyRef.current = f
    statsRef.current = { trials: 1, resurfaced: f.resurfaced ? 1 : 0 }
    triggerReset()
    setTick(t => t + 1)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Carriers across generations</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Carriers across generations. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: BG }} />
      </div>
      <div className="animation-controls flex-wrap gap-x-4 gap-y-2">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-lime text-bg-base text-xs font-medium hover:bg-accent-lime/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Draw families</>}
        </button>
        <button
          onClick={() => { setRunning(false); resample(true) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs font-medium hover:text-text-primary transition-colors"
        >
          <Shuffle size={12} /> New family
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Children</span>
          <input type="range" min={SPEC.kids.min} max={SPEC.kids.max} step={SPEC.kids.step} value={kids}
            onChange={e => changeKids(+e.target.value)}
            className="w-24 accent-accent-lime" />
          <span className="font-mono text-text-secondary w-4">{kids}</span>
        </label>
        <span className="text-xs" style={{ color: VIOLET }}>Aa carrier</span>
        <span className="text-xs" style={{ color: PINK }}>aa affected</span>
      </div>
    </div>
  )
}
