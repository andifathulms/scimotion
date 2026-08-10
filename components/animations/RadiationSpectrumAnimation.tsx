'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 340

const X0 = 46
const PLOT_W = 526          // 46 → 572
const TOP_Y = 52
const BASE_Y = 200

const LAM_LO = 0.1          // µm
const LAM_HI = 100          // µm
const L_LO = Math.log10(LAM_LO)
const L_HI = Math.log10(LAM_HI)

const T_SUN = 5772          // K — the Sun's effective temperature (IAU nominal)
const T_EARTH = 288         // K — Earth's mean surface temperature

const C2 = 14387.769        // second radiation constant, µm·K

const xOfLam = (lam: number) => X0 + ((Math.log10(lam) - L_LO) / (L_HI - L_LO)) * PLOT_W
const lamOfX = (x: number) => Math.pow(10, L_LO + ((x - X0) / PLOT_W) * (L_HI - L_LO))

// Spectral radiance per logarithmic wavelength interval, up to a constant:
// lambda * B_lambda ∝ lambda^-4 / (exp(c2 / (lambda T)) - 1)
function planckLog(lam: number, T: number): number {
  const e = Math.exp(C2 / (lam * T))
  if (!Number.isFinite(e)) return 0
  return 1 / (Math.pow(lam, 4) * (e - 1))
}

type Band = { lo: number; hi: number; s: number }
type Gas = { key: 'co2' | 'h2o' | 'ch4'; name: string; color: string; bands: Band[] }

// Absorption band centres are the real vibrational–rotational features.
const GASES: Gas[] = [
  {
    key: 'co2', name: 'CO₂', color: '#10B981',
    bands: [
      { lo: 1.9, hi: 2.1, s: 0.2 },      // combination bands
      { lo: 2.6, hi: 2.9, s: 0.35 },
      { lo: 4.2, hi: 4.4, s: 0.95 },     // ν3 asymmetric stretch
      { lo: 13.5, hi: 17.0, s: 1.0 },    // ν2 bend — the big one
    ],
  },
  {
    key: 'h2o', name: 'H₂O', color: '#60A5FA',
    bands: [
      { lo: 0.9, hi: 0.99, s: 0.3 },
      { lo: 1.1, hi: 1.2, s: 0.35 },
      { lo: 1.3, hi: 1.5, s: 0.55 },
      { lo: 1.75, hi: 1.98, s: 0.65 },
      { lo: 2.5, hi: 2.95, s: 0.8 },     // ν1 / ν3 stretches
      { lo: 5.5, hi: 7.7, s: 0.95 },     // ν2 bend at 6.3 µm
      { lo: 16, hi: 100, s: 0.95 },      // pure rotational continuum
    ],
  },
  {
    key: 'ch4', name: 'CH₄', color: '#A78BFA',
    bands: [
      { lo: 2.2, hi: 2.45, s: 0.3 },
      { lo: 3.2, hi: 3.5, s: 0.7 },      // ν3 stretch
      { lo: 7.4, hi: 8.1, s: 0.7 },      // ν4 bend
    ],
  },
]

const absorbOf = (g: Gas, lam: number) => {
  let a = 0
  for (const b of g.bands) if (lam >= b.lo && lam <= b.hi) a = Math.max(a, b.s)
  return a
}

const TICKS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100]

const ROW_Y: Record<Gas['key'], number> = { co2: 240, h2o: 264, ch4: 288 }
const ROW_H = 15

export function RadiationSpectrumAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const progRef = useRef(1)

  const [on, setOn] = useState<Record<Gas['key'], boolean>>({ co2: true, h2o: true, ch4: true })
  const onRef = useRef(on)
  const [sweeping, setSweeping] = useState(false)
  const [stats, setStats] = useState({ sun: 0, earth: 0 })
  const statsRef = useRef({ sun: 0, earth: 0 })

  useEffect(() => { onRef.current = on }, [on])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { progRef.current = 1; return }
      progRef.current = 0
      setSweeping(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const prog = progRef.current
    const active = onRef.current
    const gases = GASES.filter(g => active[g.key])

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'

    // Peak normalisation for each curve, on the drawing grid.
    let maxSun = 0
    let maxEarth = 0
    for (let px = 0; px <= PLOT_W; px++) {
      const lam = lamOfX(X0 + px)
      maxSun = Math.max(maxSun, planckLog(lam, T_SUN))
      maxEarth = Math.max(maxEarth, planckLog(lam, T_EARTH))
    }

    // ---- combined absorption shading behind the curves ----
    const bandAlpha = Math.max(0, Math.min(1, (prog - 0.45) / 0.35))
    if (bandAlpha > 0) {
      for (let px = 0; px <= PLOT_W; px++) {
        const lam = lamOfX(X0 + px)
        let clear = 1
        for (const g of gases) clear *= 1 - absorbOf(g, lam)
        const a = 1 - clear
        if (a <= 0.001) continue
        ctx.fillStyle = `rgba(34,211,238,${(a * 0.14 * bandAlpha).toFixed(3)})`
        ctx.fillRect(X0 + px, TOP_Y, 1, BASE_Y - TOP_Y)
      }
    }

    // ---- axes ----
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(X0, BASE_Y + 0.5); ctx.lineTo(X0 + PLOT_W, BASE_Y + 0.5)
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    for (const t of TICKS) {
      const x = xOfLam(t)
      ctx.strokeStyle = 'rgba(255,245,235,0.12)'
      ctx.beginPath(); ctx.moveTo(x, TOP_Y); ctx.lineTo(x, BASE_Y + 4); ctx.stroke()
      ctx.fillText(String(t), x, BASE_Y + 16)
    }
    ctx.fillText('wavelength (µm, log scale)', X0 + PLOT_W / 2, BASE_Y + 30)

    // Visible band marker, 0.38–0.70 µm.
    const vx0 = xOfLam(0.38)
    const vx1 = xOfLam(0.7)
    ctx.fillStyle = 'rgba(245,240,232,0.10)'
    ctx.fillRect(vx0, TOP_Y, vx1 - vx0, BASE_Y - TOP_Y)
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('visible', (vx0 + vx1) / 2, TOP_Y - 6)
    ctx.textAlign = 'left'

    // ---- the two blackbody curves, revealed left to right ----
    const revealX = X0 + prog * PLOT_W
    const curve = (T: number, norm: number, color: string) => {
      ctx.beginPath()
      ctx.moveTo(X0, BASE_Y)
      for (let px = 0; px <= PLOT_W; px++) {
        const x = X0 + px
        if (x > revealX) break
        const v = planckLog(lamOfX(x), T) / norm
        ctx.lineTo(x, BASE_Y - v * (BASE_Y - TOP_Y))
      }
      ctx.lineTo(Math.min(revealX, X0 + PLOT_W), BASE_Y)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.globalAlpha = 0.16
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = color
      ctx.lineWidth = 1.8
      ctx.stroke()
    }
    curve(T_SUN, maxSun, '#F59E0B')
    curve(T_EARTH, maxEarth, '#22D3EE')

    ctx.font = '10px monospace'
    ctx.fillStyle = '#F59E0B'
    ctx.fillText(`Sun · ${T_SUN} K`, xOfLam(0.28), TOP_Y + 14)
    ctx.fillStyle = '#22D3EE'
    ctx.fillText(`Earth · ${T_EARTH} K`, xOfLam(14), TOP_Y + 14)

    ctx.fillStyle = 'rgba(245,240,232,0.28)'
    ctx.save()
    ctx.translate(12, (TOP_Y + BASE_Y) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillText('emission per octave (each curve to its own peak)', 0, 0)
    ctx.restore()
    ctx.textAlign = 'left'

    // ---- per-gas absorption rows ----
    for (const g of GASES) {
      const y = ROW_Y[g.key]
      const live = active[g.key]
      ctx.fillStyle = live ? g.color : 'rgba(245,240,232,0.2)'
      ctx.font = '10px monospace'
      ctx.fillText(g.name, 10, y + 11)
      ctx.strokeStyle = 'rgba(255,245,235,0.08)'
      ctx.lineWidth = 1
      ctx.strokeRect(X0 + 0.5, y + 0.5, PLOT_W - 1, ROW_H - 1)
      if (!live) continue
      for (const b of g.bands) {
        const xa = xOfLam(Math.max(LAM_LO, b.lo))
        const xb = xOfLam(Math.min(LAM_HI, b.hi))
        const clip = Math.min(xb, revealX)
        if (clip <= xa) continue
        ctx.fillStyle = g.color
        ctx.globalAlpha = 0.25 + 0.6 * b.s
        ctx.fillRect(xa, y + 1, Math.max(1.5, clip - xa), ROW_H - 2)
        ctx.globalAlpha = 1
      }
    }

    // Atmospheric window annotation.
    const wx0 = xOfLam(8)
    const wx1 = xOfLam(13)
    ctx.strokeStyle = 'rgba(245,240,232,0.3)'
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(wx0, TOP_Y); ctx.lineTo(wx0, ROW_Y.ch4 + ROW_H)
    ctx.moveTo(wx1, TOP_Y); ctx.lineTo(wx1, ROW_Y.ch4 + ROW_H)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.textAlign = 'center'
    ctx.fillText('window', (wx0 + wx1) / 2, ROW_Y.ch4 + ROW_H + 13)
    ctx.textAlign = 'left'

    // ---- how much of each curve the bands actually intercept ----
    let sunTot = 0, sunAbs = 0, earthTot = 0, earthAbs = 0
    for (let px = 0; px <= PLOT_W; px++) {
      const lam = lamOfX(X0 + px)
      let clear = 1
      for (const g of gases) clear *= 1 - absorbOf(g, lam)
      const a = 1 - clear
      const s = planckLog(lam, T_SUN)
      const e = planckLog(lam, T_EARTH)
      sunTot += s; sunAbs += s * a
      earthTot += e; earthAbs += e * a
    }
    const sunPct = sunTot > 0 ? (100 * sunAbs) / sunTot : 0
    const earthPct = earthTot > 0 ? (100 * earthAbs) / earthTot : 0
    const prev = statsRef.current
    if (Math.abs(sunPct - prev.sun) > 0.05 || Math.abs(earthPct - prev.earth) > 0.05) {
      statsRef.current = { sun: sunPct, earth: earthPct }
      setStats({ sun: sunPct, earth: earthPct })
    }

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('intercepted by the selected gases:', 10, 22)
    ctx.fillStyle = '#F59E0B'
    ctx.fillText(`incoming sunlight ${sunPct.toFixed(0)}%`, 10, 36)
    ctx.fillStyle = '#22D3EE'
    ctx.fillText(`outgoing Earth IR ${earthPct.toFixed(0)}%`, 210, 36)
    ctx.fillStyle = 'rgba(245,240,232,0.28)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'right'
    ctx.fillText('band strengths schematic; centres are the real vibrational modes', W - 10, 36)
    ctx.textAlign = 'left'
  }, [])

  useEffect(() => { draw() }, [draw, on])

  useEffect(() => {
    if (!sweeping) return
    const tick = () => {
      progRef.current = Math.min(1, progRef.current + 0.012)
      draw()
      if (progRef.current >= 1) { setSweeping(false); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [sweeping, draw])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    triggerReset()
    setOn({ co2: true, h2o: true, ch4: true })
    onRef.current = { co2: true, h2o: true, ch4: true }
    progRef.current = 0
    setSweeping(true)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Two blackbodies that barely overlap</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Two blackbodies that barely overlap. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        {GASES.map(g => (
          <label key={g.key} className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={on[g.key]}
              onChange={ev => setOn(o => ({ ...o, [g.key]: ev.target.checked }))}
              className="accent-accent-teal"
            />
            <span style={{ color: on[g.key] ? g.color : undefined }}>{g.name}</span>
          </label>
        ))}
        <WidgetStatus className="ml-auto text-xs text-text-secondary font-mono">
          sunlight {stats.sun.toFixed(0)}% · Earth IR {stats.earth.toFixed(0)}%
        </WidgetStatus>
      </div>
    </div>
  )
}
