'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

// Colours: pink is Medicine's accent and the primary series.
const PINK = '#F472B6'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const INK = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(255,245,235,0.10)'
const RAY = '#FDE68A'

// Optical geometry, all in canvas pixels. The cornea+lens sit at LENS_X on the
// optical axis AY; the retina is L pixels behind it. An upright object of height
// h_o stands at object distance d_o (px) to the left. The eye focuses by
// accommodation (changing lens power 1/f); refractive errors are a mismatch
// between the eye's power range and its axial length L, so the focus lands in
// front of (myopia) or behind (hyperopia) the retina.
const LENS_X = 356
const AY = 150
const H_O = 46 // object half-height (tip sits H_O above the axis)
const APER = 24 // lens half-aperture used for the ray fan

const OD_MIN = 120
const OD_MAX = 340

type EyeKind = 'normal' | 'myopia' | 'hyperopia'

// L = lens-to-retina distance; fmin/fmax = fattest/flattest lens the eye can make
// (focal length in px); pc = power (1/px) a corrective lens adds when worn.
type Eye = { L: number; fmin: number; fmax: number; pc: number }

const EYES: Record<EyeKind, Eye> = {
  // Emmetropic: relaxed lens (f = 80) focuses infinity exactly on the retina.
  normal: { L: 80, fmin: 45, fmax: 80, pc: 0 },
  // Refractive myopia: the relaxed lens is too strong (f = 62 < L), so distant
  // objects focus in front of the retina. A diverging lens weakens the eye.
  myopia: { L: 80, fmin: 45, fmax: 62, pc: 1 / 80 - 1 / 62 },
  // Axial hyperopia: the eye is too short (L = 64), so near objects focus behind
  // the retina. A converging lens adds the missing power.
  hyperopia: { L: 64, fmin: 45, fmax: 80, pc: 1 / 120 + 1 / 64 - 1 / 45 },
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

type Focus = { di: number; m: number; peye: number; imgX: number; imgTipY: number; retinaX: number; blur: number }

// Solve where the tip's image lands, given the eye and whether a corrective lens
// is worn, using the thin-lens relation 1/f = 1/d_o + 1/d_i.
function solveFocus(eye: Eye, corrected: boolean, dO: number): Focus {
  const pc = corrected ? eye.pc : 0
  const pStar = 1 / dO + 1 / eye.L // total power that would focus on the retina
  const peye = clamp(pStar - pc, 1 / eye.fmax, 1 / eye.fmin) // accommodation limits
  const P = peye + pc
  const inv = P - 1 / dO
  const di = inv > 1e-6 ? 1 / inv : 4000 // guard: near-parallel exit
  const m = di / dO
  const retinaX = LENS_X + eye.L
  return { di, m, peye, imgX: LENS_X + di, imgTipY: AY + H_O * m, retinaX, blur: di - eye.L }
}

export function EyeOpticsAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const [p, setP] = useState(0.55) // object-distance parameter in [0,1]
  const [eye, setEye] = useState<EyeKind>('normal')
  const [corrected, setCorrected] = useState(false)
  const [sweeping, setSweeping] = useState(false)

  const paramsRef = useRef({ p, eye, corrected })
  useEffect(() => {
    paramsRef.current = { p, eye, corrected }
  }, [p, eye, corrected])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: (reduced) => {
      if (reduced) return
      setSweeping(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { p: pv, eye: ek, corrected: corr } = paramsRef.current
    const cfg = EYES[ek]
    const wearing = corr && ek !== 'normal'
    const dO = OD_MIN + pv * (OD_MAX - OD_MIN)
    const objX = LENS_X - dO
    const f = solveFocus(cfg, wearing, dO)

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'

    // ---- optical axis ----------------------------------------------------
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(20, AY)
    ctx.lineTo(W - 12, AY)
    ctx.stroke()

    // ---- the eyeball -----------------------------------------------------
    const backX = LENS_X + cfg.L
    const cx = (LENS_X + backX) / 2
    const rx = (backX - LENS_X) / 2 + 18
    const ry = 62
    ctx.beginPath()
    ctx.ellipse(cx, AY, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(96,165,250,0.05)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(245,240,232,0.22)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Retina: the inner rear wall. Draw as a short arc and mark its centre.
    ctx.beginPath()
    ctx.ellipse(cx, AY, rx - 4, ry - 4, 0, -Math.PI * 0.42, Math.PI * 0.42)
    ctx.strokeStyle = 'rgba(245,240,232,0.4)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
    ctx.fillText('retina', backX + 6, AY - 30)

    // ---- the object (upright arrow) --------------------------------------
    ctx.strokeStyle = PINK
    ctx.fillStyle = PINK
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(objX, AY)
    ctx.lineTo(objX, AY - H_O)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(objX, AY - H_O - 1)
    ctx.lineTo(objX - 4, AY - H_O + 7)
    ctx.lineTo(objX + 4, AY - H_O + 7)
    ctx.closePath()
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.fillStyle = INK
    ctx.fillText('object', objX, AY + 16)

    // ---- corrective lens (worn in front of the eye) ----------------------
    if (wearing) {
      const clx = LENS_X - 46
      const chalf = 34
      const diverging = cfg.pc < 0
      ctx.strokeStyle = VIOLET
      ctx.lineWidth = 2
      ctx.beginPath()
      if (diverging) {
        // Biconcave: edges thick, waist thin.
        ctx.moveTo(clx - 7, AY - chalf)
        ctx.quadraticCurveTo(clx, AY, clx - 7, AY + chalf)
        ctx.moveTo(clx + 7, AY - chalf)
        ctx.quadraticCurveTo(clx, AY, clx + 7, AY + chalf)
      } else {
        // Biconvex: waist thick, edges thin.
        ctx.moveTo(clx, AY - chalf)
        ctx.quadraticCurveTo(clx - 9, AY, clx, AY + chalf)
        ctx.moveTo(clx, AY - chalf)
        ctx.quadraticCurveTo(clx + 9, AY, clx, AY + chalf)
      }
      ctx.stroke()
      ctx.fillStyle = VIOLET
      ctx.textAlign = 'center'
      ctx.fillText(diverging ? 'diverging' : 'converging', clx, AY + chalf + 14)
    }

    // ---- the eye's lens (fatter = more accommodated / more power) ---------
    const lensHalf = 6 + ((f.peye - 1 / 80) / (1 / 45 - 1 / 80)) * 15
    ctx.strokeStyle = BLUE
    ctx.fillStyle = 'rgba(96,165,250,0.12)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(LENS_X, AY - APER - 4)
    ctx.quadraticCurveTo(LENS_X - lensHalf, AY, LENS_X, AY + APER + 4)
    ctx.quadraticCurveTo(LENS_X + lensHalf, AY, LENS_X, AY - APER - 4)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // ---- ray fan: tip -> lens aperture -> image tip, drawn to the retina --
    const nRays = 5
    const hits: number[] = []
    for (let i = 0; i < nRays; i++) {
      const k = -APER + (2 * APER * i) / (nRays - 1)
      const lensY = AY + k
      // Incoming segment.
      ctx.strokeStyle = `${RAY}55`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(objX, AY - H_O)
      ctx.lineTo(LENS_X, lensY)
      ctx.stroke()
      // Outgoing segment heads toward the image tip; extend it to the retina.
      const dx = f.imgX - LENS_X
      const dy = f.imgTipY - lensY
      const tRetina = dx !== 0 ? (backX - LENS_X) / dx : 0
      const hitY = lensY + dy * tRetina
      hits.push(hitY)
      // Draw as far as the retina (or the image, whichever the ray reaches on
      // the way) so the crossing point is visible.
      const endX = backX
      const endY = hitY
      ctx.strokeStyle = RAY
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(LENS_X, lensY)
      ctx.lineTo(endX, endY)
      ctx.stroke()
    }

    // Geometric image point (real, inverted) marked where rays cross.
    const onRetina = Math.abs(f.blur) < 1.2
    ctx.strokeStyle = onRetina ? GREEN : GOLD
    ctx.fillStyle = onRetina ? GREEN : GOLD
    ctx.lineWidth = 2
    if (f.imgX < W - 8) {
      ctx.beginPath()
      ctx.moveTo(f.imgX, AY)
      ctx.lineTo(f.imgX, f.imgTipY)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(f.imgX, f.imgTipY + 1)
      ctx.lineTo(f.imgX - 4, f.imgTipY - 7)
      ctx.lineTo(f.imgX + 4, f.imgTipY - 7)
      ctx.closePath()
      ctx.fill()
    }

    // What the retina actually receives: a crisp point (in focus) or a blurred
    // smear (the ray fan spread across the retina).
    const loY = Math.min(...hits)
    const hiY = Math.max(...hits)
    ctx.beginPath()
    if (onRetina) {
      ctx.arc(backX, (loY + hiY) / 2, 3, 0, Math.PI * 2)
      ctx.fillStyle = GREEN
      ctx.fill()
    } else {
      const grad = ctx.createLinearGradient(backX, loY, backX, hiY)
      grad.addColorStop(0, `${GOLD}00`)
      grad.addColorStop(0.5, `${GOLD}cc`)
      grad.addColorStop(1, `${GOLD}00`)
      ctx.strokeStyle = grad
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(backX, loY)
      ctx.lineTo(backX, hiY)
      ctx.stroke()
    }

    // ---- captions --------------------------------------------------------
    ctx.textAlign = 'left'
    ctx.fillStyle = INK
    ctx.fillText('cornea + lens bend the light', 24, 24)

    ctx.textAlign = 'right'
    let verdict: string
    let vColor: string
    if (onRetina) {
      verdict = 'in focus on the retina — sharp'
      vColor = GREEN
    } else if (f.blur < 0) {
      verdict = 'focus falls in front of the retina — blurred'
      vColor = GOLD
    } else {
      verdict = 'focus falls behind the retina — blurred'
      vColor = GOLD
    }
    ctx.fillStyle = vColor
    ctx.fillText(verdict, W - 14, 24)

    ctx.textAlign = 'left'
    ctx.fillStyle = INK
    ctx.fillText('the image is real and upside-down', 24, H - 12)
    ctx.textAlign = 'right'
    ctx.fillStyle = INK
    ctx.fillText(`object distance ${Math.round(dO)} px`, W - 14, H - 12)
    ctx.textAlign = 'left'
  }, [])

  useEffect(() => {
    draw()
  }, [draw, p, eye, corrected])

  useEffect(() => {
    if (!sweeping) return
    let dir = 1
    const step = () => {
      setP((prev) => {
        let next = prev + dir * 0.004
        if (next >= 1) {
          next = 1
          dir = -1
        } else if (next <= 0) {
          next = 0
          dir = 1
        }
        return Math.round(next * 1000) / 1000
      })
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [sweeping])

  const resetAll = () => {
    triggerReset()
    setSweeping(false)
    setEye('normal')
    setCorrected(false)
    setP(0.55)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · The Eye as a Focusing Instrument
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: The Eye as a Focusing Instrument. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <div className="flex items-center gap-1.5">
          {(['normal', 'myopia', 'hyperopia'] as EyeKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setEye(k)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                eye === k ? 'bg-accent-gold text-bg-base' : 'bg-white/5 text-text-muted hover:text-text-secondary'
              }`}
            >
              {k === 'normal' ? 'Normal' : k === 'myopia' ? 'Near-sighted' : 'Far-sighted'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Object distance:</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.002}
            value={p}
            onChange={(e) => {
              setP(+e.target.value)
              setSweeping(false)
            }}
            className="w-40 accent-accent-gold"
          />
        </label>
        {eye !== 'normal' && (
          <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={corrected}
              onChange={(e) => setCorrected(e.target.checked)}
              className="accent-accent-violet"
            />
            <span style={{ color: corrected ? VIOLET : undefined }}>corrective lens</span>
          </label>
        )}
        <span className="ml-auto text-xs text-text-secondary">
          drag the object · watch the <strong style={{ color: BLUE }}>lens</strong> reshape to keep focus
        </span>
      </div>
    </div>
  )
}
