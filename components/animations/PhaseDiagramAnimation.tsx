'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 620
const H = 360

// Diagram frame
const MX0 = 58
const MX1 = 416
const MY0 = 302
const MY1 = 46

// Molecular inset
const IX0 = 448
const IY0 = 108
const IX1 = 606
const IY1 = 254

const ATM = 101325

type Sub = {
  key: 'water' | 'co2'
  name: string
  formula: string
  Tt: number // triple-point temperature, K
  Pt: number // triple-point pressure, Pa
  Tc: number // critical temperature, K
  Pc: number // critical pressure, Pa
  /** Clausius–Clapeyron slope of the fusion line, dP/dT in Pa/K */
  dPdT: number
  /** ln P_vap = a + b/T + c/T^2 */
  vap: [number, number, number]
  /** ln P_sub = a + b/T */
  sub: [number, number]
  Tmin: number
  Tmax: number
  Lmin: number // log10 P
  Lmax: number
  note: string
}

// Triple and critical points are the accepted experimental values.
// The fusion slopes come from dP/dT = ΔH_fus / (T Δv) at the triple point:
//   water  6.01 kJ/mol, Δv = −1.63 cm³/mol  →  −13.5 MPa/K
//   CO₂    9.02 kJ/mol, Δv = +9.1 cm³/mol   →  +4.58 MPa/K
const SUBS: Record<'water' | 'co2', Sub> = {
  water: {
    key: 'water',
    name: 'Water',
    formula: 'H₂O',
    Tt: 273.16,
    Pt: 611.657,
    Tc: 647.096,
    Pc: 22.064e6,
    dPdT: -13.47e6,
    vap: [23.3316, -3817.4, -219478],
    sub: [28.9008, -6141.9],
    Tmin: 220,
    Tmax: 700,
    Lmin: 0,
    Lmax: 8.4,
    note: 'melting line leans LEFT — ice is less dense than water',
  },
  co2: {
    key: 'co2',
    name: 'Carbon dioxide',
    formula: 'CO₂',
    Tt: 216.58,
    Pt: 517950,
    Tc: 304.13,
    Pc: 7.377e6,
    dPdT: 4.58e6,
    vap: [22.3851, -1998.5, 0],
    sub: [27.169, -3034.6],
    Tmin: 160,
    Tmax: 360,
    Lmin: 3,
    Lmax: 9,
    note: 'melting line leans RIGHT — the usual case, solid denser than liquid',
  },
}

type Region = 'solid' | 'liquid' | 'gas' | 'supercritical'

const COL: Record<Region, string> = {
  solid: '#60A5FA',
  liquid: '#FB923C',
  gas: '#A78BFA',
  supercritical: '#10B981',
}
const GOLD = '#F59E0B'

const pVap = (s: Sub, T: number) =>
  Math.exp(s.vap[0] + s.vap[1] / T + s.vap[2] / (T * T))
const pSub = (s: Sub, T: number) => Math.exp(s.sub[0] + s.sub[1] / T)
/** Melting temperature at pressure P, linearised about the triple point. */
const tFus = (s: Sub, P: number) => s.Tt + (P - s.Pt) / s.dPdT

function regionOf(s: Sub, T: number, P: number): Region {
  if (T >= s.Tc && P >= s.Pc) return 'supercritical'
  if (P >= s.Pt) {
    if (T < tFus(s, P)) return 'solid'
    if (T >= s.Tc) return 'gas'
    return P > pVap(s, T) ? 'liquid' : 'gas'
  }
  return P > pSub(s, T) ? 'solid' : 'gas'
}

function fmtP(P: number): string {
  if (P >= 1e6) return `${(P / 1e6).toFixed(2)} MPa`
  if (P >= 1e3) return `${(P / 1e3).toFixed(2)} kPa`
  return `${P.toFixed(1)} Pa`
}

type Dot = { x: number; y: number; vx: number; vy: number; ax: number; ay: number; ph: number }

const ICOLS = 5
const IROWS = 4

function makeDots(): Dot[] {
  return Array.from({ length: ICOLS * IROWS }, (_, k) => {
    const i = k % ICOLS
    const j = Math.floor(k / ICOLS)
    const ax = IX0 + 22 + i * 28
    const ay = IY1 - 22 - j * 28
    return { x: ax, y: ay, vx: 0, vy: 0, ax, ay, ph: Math.random() * Math.PI * 2 }
  })
}

export function PhaseDiagramAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const dotsRef = useRef<Dot[]>(makeDots())
  const tickRef = useRef(0)
  const draggingRef = useRef(false)
  const washRef = useRef<HTMLCanvasElement | null>(null)
  const washKeyRef = useRef<string>('')

  const [subKey, setSubKey] = useState<'water' | 'co2'>('water')
  const [running, setRunning] = useState(false)
  // State point stored in reduced coordinates so it survives a substance swap.
  const [pt, setPt] = useState({ T: 320, L: Math.log10(ATM) })

  const s = SUBS[subKey]
  const stateRef = useRef({ s, pt })
  stateRef.current = { s, pt }

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  const gx = useCallback((sub: Sub, T: number) => MX0 + ((T - sub.Tmin) / (sub.Tmax - sub.Tmin)) * (MX1 - MX0), [])
  const gy = useCallback((sub: Sub, L: number) => MY0 - ((L - sub.Lmin) / (sub.Lmax - sub.Lmin)) * (MY0 - MY1), [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sub = stateRef.current.s
    const p = stateRef.current.pt
    const P = Math.pow(10, p.L)
    const reg = regionOf(sub, p.T, P)
    const t = tickRef.current

    ctx.clearRect(0, 0, W, H)

    const X = (T: number) => gx(sub, T)
    const Y = (L: number) => gy(sub, L)
    const clampL = (L: number) => Math.max(sub.Lmin, Math.min(sub.Lmax, L))

    // --- Region washes (sampled once per substance, then cached) --------
    if (washKeyRef.current !== sub.key || !washRef.current) {
      const off = washRef.current ?? document.createElement('canvas')
      off.width = MX1 - MX0
      off.height = MY0 - MY1
      const octx = off.getContext('2d')
      if (octx) {
        octx.clearRect(0, 0, off.width, off.height)
        for (let px = 0; px < off.width; px += 4) {
          const T = sub.Tmin + (px / off.width) * (sub.Tmax - sub.Tmin)
          for (let py = 0; py < off.height; py += 4) {
            const L = sub.Lmin + ((off.height - py) / off.height) * (sub.Lmax - sub.Lmin)
            const r = regionOf(sub, T, Math.pow(10, L))
            octx.fillStyle =
              r === 'solid'
                ? 'rgba(96,165,250,0.09)'
                : r === 'liquid'
                  ? 'rgba(251,146,60,0.10)'
                  : r === 'gas'
                    ? 'rgba(167,139,250,0.07)'
                    : 'rgba(16,185,129,0.09)'
            octx.fillRect(px, py, 4, 4)
          }
        }
      }
      washRef.current = off
      washKeyRef.current = sub.key
    }
    ctx.drawImage(washRef.current, MX0, MY1)

    // --- Axes ----------------------------------------------------------
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.strokeRect(MX0, MY1, MX1 - MX0, MY0 - MY1)

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    for (let L = Math.ceil(sub.Lmin); L <= sub.Lmax; L += 1) {
      const y = Y(L)
      ctx.fillText(`10^${L}`, MX0 - 30, y + 3)
      ctx.strokeStyle = 'rgba(255,245,235,0.05)'
      ctx.beginPath()
      ctx.moveTo(MX0, y)
      ctx.lineTo(MX1, y)
      ctx.stroke()
    }
    const tStep = sub.key === 'water' ? 100 : 50
    for (let T = Math.ceil(sub.Tmin / tStep) * tStep; T <= sub.Tmax; T += tStep) {
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.fillText(`${T}`, X(T) - 10, MY0 + 13)
    }
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('temperature (K)', (MX0 + MX1) / 2 - 40, MY0 + 27)
    ctx.save()
    ctx.translate(MX0 - 42, (MY0 + MY1) / 2 + 34)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('pressure (Pa, log scale)', 0, 0)
    ctx.restore()

    // --- 1 atm reference line ------------------------------------------
    const La = Math.log10(ATM)
    if (La > sub.Lmin && La < sub.Lmax) {
      ctx.strokeStyle = 'rgba(245,240,232,0.22)'
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(MX0, Y(La))
      ctx.lineTo(MX1, Y(La))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.fillText('1 atm', MX1 - 34, Y(La) - 5)
    }

    // --- Coexistence curves --------------------------------------------
    // Sublimation: solid | gas, up to the triple point.
    ctx.strokeStyle = '#60A5FA'
    ctx.lineWidth = 2
    ctx.beginPath()
    let started = false
    for (let T = sub.Tmin; T <= sub.Tt; T += 0.5) {
      const L = Math.log10(pSub(sub, T))
      if (L < sub.Lmin) continue
      const xx = X(T)
      const yy = Y(Math.min(L, sub.Lmax))
      if (!started) {
        ctx.moveTo(xx, yy)
        started = true
      } else ctx.lineTo(xx, yy)
    }
    ctx.stroke()

    // Vaporisation: liquid | gas, triple point to critical point.
    ctx.strokeStyle = '#FB923C'
    ctx.beginPath()
    for (let T = sub.Tt; T <= sub.Tc; T += 0.5) {
      const yy = Y(clampL(Math.log10(pVap(sub, T))))
      if (T === sub.Tt) ctx.moveTo(X(T), yy)
      else ctx.lineTo(X(T), yy)
    }
    ctx.stroke()

    // Fusion: solid | liquid, from the triple point upward.
    ctx.strokeStyle = '#A78BFA'
    ctx.beginPath()
    const L0 = Math.log10(sub.Pt)
    for (let L = L0; L <= sub.Lmax + 0.001; L += 0.02) {
      const T = tFus(sub, Math.pow(10, L))
      if (L === L0) ctx.moveTo(X(T), Y(L))
      else ctx.lineTo(X(T), Y(L))
    }
    ctx.stroke()

    // --- Region labels ---------------------------------------------------
    ctx.font = 'bold 11px monospace'
    const lab = (txt: string, T: number, L: number, col: string) => {
      ctx.fillStyle = col
      ctx.fillText(txt, X(T), Y(L))
    }
    if (sub.key === 'water') {
      lab('SOLID', 235, 6.4, 'rgba(96,165,250,0.6)')
      lab('LIQUID', 380, 6.6, 'rgba(251,146,60,0.65)')
      lab('GAS', 500, 1.6, 'rgba(167,139,250,0.6)')
      lab('SUPERCRIT.', 655, 7.6, 'rgba(16,185,129,0.55)')
    } else {
      lab('SOLID', 170, 7.2, 'rgba(96,165,250,0.6)')
      lab('LIQUID', 250, 7.4, 'rgba(251,146,60,0.65)')
      lab('GAS', 290, 4.0, 'rgba(167,139,250,0.6)')
      lab('SUPERCRIT.', 315, 8.4, 'rgba(16,185,129,0.55)')
    }

    // --- Triple and critical points --------------------------------------
    const tx = X(sub.Tt)
    const tyy = Y(Math.log10(sub.Pt))
    ctx.beginPath()
    ctx.arc(tx, tyy, 4.5, 0, Math.PI * 2)
    ctx.fillStyle = GOLD
    ctx.fill()
    ctx.font = '9px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText(`triple ${sub.Tt} K, ${fmtP(sub.Pt)}`, tx + 8, tyy + 12)

    const cx = X(sub.Tc)
    const cy = Y(Math.log10(sub.Pc))
    ctx.beginPath()
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2)
    ctx.fillStyle = '#10B981'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, cy, 8, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(16,185,129,0.4)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = '#10B981'
    ctx.fillText(`critical ${sub.Tc} K`, cx - 84, cy - 10)

    // --- The draggable state point ---------------------------------------
    const sx = X(p.T)
    const sy = Y(p.L)
    ctx.beginPath()
    ctx.arc(sx, sy, 10 + 3 * Math.sin(t * 0.09), 0, Math.PI * 2)
    ctx.strokeStyle = COL[reg]
    ctx.globalAlpha = 0.4
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(sx, sy, 5.5, 0, Math.PI * 2)
    ctx.fillStyle = COL[reg]
    ctx.fill()
    ctx.strokeStyle = 'rgba(15,13,10,0.9)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Crosshairs
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 4])
    ctx.beginPath()
    ctx.moveTo(MX0, sy)
    ctx.lineTo(sx, sy)
    ctx.moveTo(sx, MY0)
    ctx.lineTo(sx, sy)
    ctx.stroke()
    ctx.setLineDash([])

    // --- Header ------------------------------------------------------------
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = '#FB923C'
    ctx.fillText(`${sub.name} (${sub.formula})`, MX0, 22)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.42)'
    ctx.fillText(sub.note, MX0, 36)

    // --- Readout + molecular inset ----------------------------------------
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = COL[reg]
    ctx.fillText(reg.toUpperCase(), IX0, 40)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(`T = ${p.T.toFixed(1)} K  (${(p.T - 273.15).toFixed(1)} °C)`, IX0, 60)
    ctx.fillText(`P = ${fmtP(P)}`, IX0, 74)
    ctx.fillText(`  = ${(P / ATM).toPrecision(3)} atm`, IX0, 88)

    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(IX0, IY0, IX1 - IX0, IY1 - IY0)
    dotsRef.current.forEach(d => {
      ctx.beginPath()
      ctx.arc(d.x, d.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = COL[reg]
      ctx.fill()
    })
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    const blurb: Record<Region, string> = {
      solid: 'fixed lattice sites, vibration only',
      liquid: 'touching but free to slide past',
      gas: 'far apart, free flight, fills volume',
      supercritical: 'dense as a liquid, no meniscus',
    }
    ctx.fillText(blurb[reg], IX0, IY1 + 16)
    ctx.fillStyle = 'rgba(245,240,232,0.28)'
    ctx.fillText('drag the dot anywhere on the map', IX0, IY1 + 32)
  }, [gx, gy])

  const step = useCallback(() => {
    const sub = stateRef.current.s
    const p = stateRef.current.pt
    const reg = regionOf(sub, p.T, Math.pow(10, p.L))
    const t = tickRef.current
    const dots = dotsRef.current

    // Warmth relative to the substance's own critical temperature.
    const warm = Math.max(0.15, Math.min(1.6, p.T / sub.Tc))
    const liqTop = IY1 - 62
    const scTop = IY0 + 24

    dots.forEach(d => {
      if (reg === 'solid') {
        const amp = 1 + 2.4 * warm
        d.x = d.ax + Math.sin(t * 0.15 + d.ph) * amp
        d.y = d.ay + Math.cos(t * 0.12 + d.ph * 1.6) * amp
        d.vx = 0
        d.vy = 0
        return
      }
      if (d.vx === 0 && d.vy === 0) {
        const a = Math.random() * Math.PI * 2
        d.vx = Math.cos(a)
        d.vy = Math.sin(a)
      }
      const sp = reg === 'gas' ? 1.5 * warm : reg === 'supercritical' ? 1.2 * warm : 0.75 * warm
      const a = (Math.random() - 0.5) * (reg === 'gas' ? 0.12 : 0.6)
      const nvx = d.vx * Math.cos(a) - d.vy * Math.sin(a)
      const nvy = d.vx * Math.sin(a) + d.vy * Math.cos(a)
      const mag = Math.hypot(nvx, nvy) || 1
      d.vx = (nvx / mag) * sp
      d.vy = (nvy / mag) * sp
      d.x += d.vx
      d.y += d.vy

      const top = reg === 'liquid' ? liqTop : reg === 'supercritical' ? scTop : IY0 + 6
      if (d.y < top) {
        d.y = top
        d.vy = Math.abs(d.vy)
      }
      if (d.y > IY1 - 6) {
        d.y = IY1 - 6
        d.vy = -Math.abs(d.vy)
      }
      if (d.x < IX0 + 6) {
        d.x = IX0 + 6
        d.vx = Math.abs(d.vx)
      }
      if (d.x > IX1 - 6) {
        d.x = IX1 - 6
        d.vx = -Math.abs(d.vx)
      }
    })
    tickRef.current += 1
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

  useEffect(() => {
    if (!running) draw()
  }, [pt, subKey, running, draw])

  // Keep the state point inside the new window when the substance changes.
  useEffect(() => {
    const sub = SUBS[subKey]
    setPt(prev => ({
      T: Math.max(sub.Tmin, Math.min(sub.Tmax, prev.T)),
      L: Math.max(sub.Lmin, Math.min(sub.Lmax, prev.L)),
    }))
  }, [subKey])

  const fromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const r = canvas.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const py = ((e.clientY - r.top) / r.height) * H
    const sub = SUBS[subKey]
    const T =
      sub.Tmin + ((Math.max(MX0, Math.min(MX1, px)) - MX0) / (MX1 - MX0)) * (sub.Tmax - sub.Tmin)
    const L =
      sub.Lmin + ((MY0 - Math.max(MY1, Math.min(MY0, py))) / (MY0 - MY1)) * (sub.Lmax - sub.Lmin)
    return { T, L }
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const v = fromEvent(e)
    if (!v) return
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    setPt(v)
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return
    const v = fromEvent(e)
    if (v) setPt(v)
  }
  const onUp = () => {
    draggingRef.current = false
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    draggingRef.current = false
    dotsRef.current = makeDots()
    tickRef.current = 0
    setSubKey('water')
    setPt({ T: 320, L: Math.log10(ATM) })
  }

  const P = Math.pow(10, pt.L)
  const reg = regionOf(s, pt.T, P)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Pressure–temperature phase diagram
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg touch-none cursor-crosshair"
          style={{ background: '#0F0D0A' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-teal text-bg-base text-xs font-medium hover:bg-accent-teal/90 transition-colors"
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
        <div className="flex items-center gap-1.5">
          {(['water', 'co2'] as const).map(k => (
            <button
              key={k}
              onClick={() => setSubKey(k)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                subKey === k
                  ? 'bg-accent-teal text-bg-base'
                  : 'bg-white/5 text-text-muted hover:text-text-secondary'
              }`}
            >
              {SUBS[k].formula}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          {pt.T.toFixed(0)} K · {fmtP(P)} · {reg}
        </span>
      </div>
    </div>
  )
}
