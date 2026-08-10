'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

// IR spectra are plotted with wavenumber DECREASING left→right (4000 → 500 cm⁻¹)
// and %transmittance on y (100% at top, absorption dips downward).
const WN_HI = 4000
const WN_LO = 500
const PLOT_L = 58
const PLOT_R = 566
const PLOT_T = 40
const PLOT_B = 250
const FINGERPRINT_WN = 1500 // below this: the dense "fingerprint region"

const wnToX = (wn: number) => PLOT_L + ((WN_HI - wn) / (WN_HI - WN_LO)) * (PLOT_R - PLOT_L)
const tToY = (t: number) => PLOT_T + ((100 - t) / 100) * (PLOT_B - PLOT_T)

const ORANGE = '#FB923C'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const BG = '#0F0D0A'

type Band = {
  key: string
  label: string
  center: number // cm⁻¹, approximately correct
  width: number  // Gaussian sigma in cm⁻¹
  depth: number  // 0–1 absorption strength
  color: string
}

// Approximate characteristic IR absorption positions.
const BANDS: Band[] = [
  { key: 'O-H', label: 'O–H stretch', center: 3350, width: 180, depth: 0.62, color: BLUE },
  { key: 'C-H', label: 'C–H stretch', center: 2950, width: 70, depth: 0.42, color: VIOLET },
  { key: 'C≡N', label: 'C≡N stretch', center: 2250, width: 35, depth: 0.35, color: GREEN },
  { key: 'C=O', label: 'C=O stretch', center: 1715, width: 35, depth: 0.85, color: GOLD },
  { key: 'C=C', label: 'C=C stretch', center: 1650, width: 45, depth: 0.4, color: ORANGE },
  { key: 'C-O', label: 'C–O stretch', center: 1100, width: 90, depth: 0.6, color: '#F472B6' },
]

type Molecule = { name: string; bonds: string[] }
const MOLECULES: Molecule[] = [
  { name: 'Water', bonds: ['O-H'] },
  { name: 'Ethene', bonds: ['C-H', 'C=C'] },
  { name: 'Acetone', bonds: ['C-H', 'C=O'] },
  { name: 'Ethanol', bonds: ['O-H', 'C-H', 'C-O'] },
  { name: 'Acetic acid', bonds: ['O-H', 'C-H', 'C=O', 'C-O'] },
]

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every(k => b.includes(k))

export function IRFingerprintAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  // Per-band animated amplitude, easing toward its target (1 active / 0 off).
  const ampRef = useRef<Record<string, number>>(
    Object.fromEntries(BANDS.map(b => [b.key, 0]))
  )
  const [active, setActive] = useState<Record<string, boolean>>(
    Object.fromEntries(BANDS.map(b => [b.key, false]))
  )
  const [tick, setTick] = useState(0)

  const activeKeys = useMemo(
    () => BANDS.filter(b => active[b.key]).map(b => b.key),
    [active]
  )
  const identified = useMemo(
    () => MOLECULES.find(m => sameSet(m.bonds, activeKeys)),
    [activeKeys]
  )

  const transmittance = useCallback((wn: number) => {
    let absorb = 0
    for (const b of BANDS) {
      const amp = ampRef.current[b.key]
      if (amp <= 0) continue
      const d = (wn - b.center) / b.width
      absorb += b.depth * amp * Math.exp(-d * d)
    }
    return 100 - Math.min(96, absorb * 100)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // ---- header ----
    ctx.textAlign = 'left'
    ctx.font = '12px monospace'
    ctx.fillStyle = ORANGE
    ctx.fillText('Infrared spectrum', PLOT_L, 22)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.45)'
    ctx.fillText('each bond vibrates at its own frequency and absorbs matching IR light', PLOT_L, 34)

    // ---- fingerprint region shading ----
    const fpX = wnToX(FINGERPRINT_WN)
    ctx.fillStyle = 'rgba(251,146,60,0.06)'
    ctx.fillRect(fpX, PLOT_T, PLOT_R - fpX, PLOT_B - PLOT_T)

    // ---- axes ----
    ctx.strokeStyle = 'rgba(255,245,235,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PLOT_L, PLOT_T)
    ctx.lineTo(PLOT_L, PLOT_B)
    ctx.lineTo(PLOT_R, PLOT_B)
    ctx.stroke()

    // y ticks (%T)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.textAlign = 'right'
    for (let t = 0; t <= 100; t += 25) {
      const y = tToY(t)
      ctx.strokeStyle = 'rgba(255,245,235,0.08)'
      ctx.beginPath()
      ctx.moveTo(PLOT_L, y)
      ctx.lineTo(PLOT_R, y)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,245,235,0.4)'
      ctx.fillText(`${t}`, PLOT_L - 6, y + 3)
    }
    ctx.save()
    ctx.translate(16, (PLOT_T + PLOT_B) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,245,235,0.5)'
    ctx.fillText('% transmittance', 0, 0)
    ctx.restore()

    // x ticks (wavenumber)
    ctx.textAlign = 'center'
    for (let wn = 4000; wn >= 500; wn -= 500) {
      const x = wnToX(wn)
      ctx.strokeStyle = 'rgba(255,245,235,0.14)'
      ctx.beginPath()
      ctx.moveTo(x, PLOT_B)
      ctx.lineTo(x, PLOT_B + 4)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,245,235,0.4)'
      ctx.fillText(`${wn}`, x, PLOT_B + 15)
    }
    ctx.fillStyle = 'rgba(255,245,235,0.5)'
    ctx.fillText('wavenumber / cm⁻¹  (high → low)', (PLOT_L + PLOT_R) / 2, PLOT_B + 30)
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(251,146,60,0.6)'
    ctx.font = '9px monospace'
    ctx.fillText('fingerprint region', fpX + 6, PLOT_B - 6)

    // ---- band centre guides + labels for active bands ----
    for (const b of BANDS) {
      const amp = ampRef.current[b.key]
      if (amp <= 0.01) continue
      const x = wnToX(b.center)
      ctx.strokeStyle = b.color
      ctx.globalAlpha = 0.3 * amp
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(x, PLOT_T)
      ctx.lineTo(x, tToY(transmittance(b.center)))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = Math.min(1, amp)
      ctx.fillStyle = b.color
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(b.label, x, PLOT_T - 4)
      ctx.globalAlpha = 1
    }

    // ---- the transmittance curve ----
    ctx.beginPath()
    for (let px = 0; px <= PLOT_R - PLOT_L; px++) {
      const wn = WN_HI - (px / (PLOT_R - PLOT_L)) * (WN_HI - WN_LO)
      const y = tToY(transmittance(wn))
      if (px === 0) ctx.moveTo(PLOT_L + px, y)
      else ctx.lineTo(PLOT_L + px, y)
    }
    ctx.strokeStyle = ORANGE
    ctx.lineWidth = 2
    ctx.stroke()

    // ---- identity readout ----
    ctx.textAlign = 'left'
    ctx.font = 'bold 12px monospace'
    if (activeKeys.length === 0) {
      ctx.fillStyle = 'rgba(255,245,235,0.5)'
      ctx.fillText('Add bonds to build a molecule →', PLOT_L, PLOT_B + 52)
    } else if (identified) {
      ctx.fillStyle = GREEN
      ctx.fillText(`✓ This fingerprint is ${identified.name}`, PLOT_L, PLOT_B + 52)
      ctx.font = '10px monospace'
      ctx.fillStyle = 'rgba(255,245,235,0.5)'
      ctx.fillText(`bonds: ${identified.bonds.join(', ')}`, PLOT_L, PLOT_B + 68)
    } else {
      ctx.fillStyle = GOLD
      ctx.fillText('Unrecognised combination of bands', PLOT_L, PLOT_B + 52)
      ctx.font = '10px monospace'
      ctx.fillStyle = 'rgba(255,245,235,0.5)'
      ctx.fillText(`active: ${activeKeys.join(', ')}`, PLOT_L, PLOT_B + 68)
    }
  }, [transmittance, activeKeys, identified])

  // Ease band amplitudes toward their targets each frame.
  const animateTo = useCallback((targets: Record<string, boolean>) => {
    cancelAnimationFrame(rafRef.current)
    const step = () => {
      let moving = false
      for (const b of BANDS) {
        const goal = targets[b.key] ? 1 : 0
        const cur = ampRef.current[b.key]
        const next = cur + (goal - cur) * 0.18
        ampRef.current[b.key] = Math.abs(goal - next) < 0.004 ? goal : next
        if (ampRef.current[b.key] !== goal) moving = true
      }
      setTick(t => t + 1)
      if (moving) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      const preset = MOLECULES[3] // Ethanol — three clear, well-separated bands
      const targets = Object.fromEntries(BANDS.map(b => [b.key, preset.bonds.includes(b.key)]))
      setActive(targets)
      if (reduced) {
        for (const b of BANDS) ampRef.current[b.key] = targets[b.key] ? 1 : 0
        setTick(t => t + 1)
      } else {
        animateTo(targets)
      }
    },
  })

  useEffect(() => { draw() }, [draw, tick])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const toggleBand = (key: string) => {
    setActive(prev => {
      const next = { ...prev, [key]: !prev[key] }
      animateTo(next)
      return next
    })
  }

  const pickMolecule = (m: Molecule) => {
    const targets = Object.fromEntries(BANDS.map(b => [b.key, m.bonds.includes(b.key)]))
    setActive(targets)
    animateTo(targets)
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    const off = Object.fromEntries(BANDS.map(b => [b.key, false]))
    setActive(off)
    for (const b of BANDS) ampRef.current[b.key] = 0
    triggerReset()
    setTick(t => t + 1)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Bonds absorb their own frequencies</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas
          role="img"
          aria-label="Animated diagram: Bonds absorb their own frequencies. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: BG }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {BANDS.map(b => (
            <button
              key={b.key}
              onClick={() => toggleBand(b.key)}
              className={`px-2 py-1.5 font-mono transition-colors ${active[b.key] ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {b.key}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MOLECULES.map(m => (
            <button
              key={m.name}
              onClick={() => pickMolecule(m)}
              className="px-2.5 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:bg-bg-hover transition-colors">
              {m.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
