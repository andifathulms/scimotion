'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300
const LEFT = 46
const RIGHT = 16
const STRIP_W = W - LEFT - RIGHT
const NM_MIN = 380
const NM_MAX = 750

const REST_Y = 34
const OBS_Y = 118
const STRIP_H = 34

const PLOT_TOP = 190
const PLOT_BOT = 278
const BETA_MIN = -0.6
const BETA_MAX = 0.95
const Z_MIN = -1
const Z_MAX = 5

const DEFAULT_BETA = 0.4

// A few of the lines a real stellar spectrum is read by.
const LINES: { nm: number; name: string }[] = [
  { nm: 393.4, name: 'Ca K' },
  { nm: 434.0, name: 'Hγ' },
  { nm: 486.1, name: 'Hβ' },
  { nm: 517.3, name: 'Mg b' },
  { nm: 589.0, name: 'Na D' },
  { nm: 656.3, name: 'Hα' },
]

const xOfNm = (nm: number) => LEFT + ((nm - NM_MIN) / (NM_MAX - NM_MIN)) * STRIP_W
const relFactor = (b: number) => Math.sqrt((1 + b) / (1 - b))
const zRel = (b: number) => relFactor(b) - 1
const zClassical = (b: number) => b

// Approximate visible-spectrum colour for a wavelength in nm.
function spectrumColor(nm: number): string {
  let r = 0, g = 0, b = 0
  if (nm < 440) { r = (440 - nm) / 60; b = 1 }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1 }
  else if (nm < 510) { g = 1; b = (510 - nm) / 20 }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1 }
  else if (nm < 645) { r = 1; g = (645 - nm) / 65 }
  else { r = 1 }
  let fade = 1
  if (nm < 420) fade = 0.3 + (0.7 * (nm - 380)) / 40
  else if (nm > 700) fade = 0.3 + (0.7 * (750 - nm)) / 50
  const ch = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v)) * fade)
  return `rgb(${ch(r)},${ch(g)},${ch(b)})`
}

export function RedshiftAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setBeta(DEFAULT_BETA); return }
      setBeta(0)
      setSweeping(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [beta, setBeta] = useState(DEFAULT_BETA)
  const [sweeping, setSweeping] = useState(false)

  const xOfBeta = useCallback(
    (b: number) => LEFT + ((b - BETA_MIN) / (BETA_MAX - BETA_MIN)) * STRIP_W, [])
  const yOfZ = useCallback(
    (z: number) => PLOT_BOT - ((Math.min(Z_MAX, Math.max(Z_MIN, z)) - Z_MIN) / (Z_MAX - Z_MIN)) * (PLOT_BOT - PLOT_TOP), [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    // Two spectrum strips, painted column by column.
    for (const y of [REST_Y, OBS_Y]) {
      for (let px = 0; px < STRIP_W; px++) {
        const nm = NM_MIN + (px / STRIP_W) * (NM_MAX - NM_MIN)
        ctx.fillStyle = spectrumColor(nm)
        ctx.fillRect(LEFT + px, y, 1, STRIP_H)
      }
      ctx.strokeStyle = 'rgba(255,245,235,0.15)'
      ctx.lineWidth = 1
      ctx.strokeRect(LEFT + 0.5, y + 0.5, STRIP_W - 1, STRIP_H - 1)
    }

    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('rest', 12, REST_Y + 20)
    ctx.fillText('seen', 12, OBS_Y + 20)
    ctx.fillText(`${NM_MIN} nm`, LEFT, OBS_Y + STRIP_H + 14)
    ctx.fillText(`${NM_MAX} nm`, LEFT + STRIP_W - 44, OBS_Y + STRIP_H + 14)

    const f = relFactor(beta)

    for (const line of LINES) {
      const xr = xOfNm(line.nm)
      const obsNm = line.nm * f
      const clNm = line.nm * (1 + beta)
      const xo = xOfNm(obsNm)
      const xc = xOfNm(clNm)
      const inBand = obsNm >= NM_MIN && obsNm <= NM_MAX

      // rest-frame absorption line
      ctx.fillStyle = 'rgba(12,10,8,0.92)'
      ctx.fillRect(xr - 1.5, REST_Y, 3, STRIP_H)
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.fillText(line.name, xr - 8, REST_Y - 6)

      if (inBand) {
        // relativistic prediction — the one nature uses
        ctx.fillStyle = 'rgba(12,10,8,0.92)'
        ctx.fillRect(xo - 1.5, OBS_Y, 3, STRIP_H)

        // classical prediction, dashed, for comparison
        if (clNm >= NM_MIN && clNm <= NM_MAX && Math.abs(xc - xo) > 1.2) {
          ctx.save()
          ctx.setLineDash([3, 3])
          ctx.strokeStyle = 'rgba(255,245,235,0.75)'
          ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.moveTo(xc, OBS_Y); ctx.lineTo(xc, OBS_Y + STRIP_H); ctx.stroke()
          ctx.restore()
        }

        // connector showing which way the line moved
        ctx.beginPath()
        ctx.moveTo(xr, REST_Y + STRIP_H)
        ctx.lineTo(xo, OBS_Y)
        ctx.strokeStyle = beta >= 0 ? 'rgba(244,114,182,0.55)' : 'rgba(96,165,250,0.55)'
        ctx.lineWidth = 1.25
        ctx.stroke()
      } else {
        // shifted clean out of the visible window
        ctx.beginPath()
        ctx.moveTo(xr, REST_Y + STRIP_H)
        ctx.lineTo(obsNm > NM_MAX ? LEFT + STRIP_W + 6 : LEFT - 6, OBS_Y + STRIP_H / 2)
        ctx.strokeStyle = 'rgba(255,245,235,0.12)'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }

    // ---- z versus beta ----
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(LEFT, PLOT_TOP); ctx.lineTo(LEFT, PLOT_BOT); ctx.lineTo(LEFT + STRIP_W, PLOT_BOT)
    ctx.stroke()
    ctx.beginPath()
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.moveTo(LEFT, yOfZ(0)); ctx.lineTo(LEFT + STRIP_W, yOfZ(0))
    ctx.moveTo(xOfBeta(0), PLOT_TOP); ctx.lineTo(xOfBeta(0), PLOT_BOT)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('z', LEFT - 30, PLOT_TOP + 8)
    ctx.fillText('β = v/c', LEFT + STRIP_W - 52, PLOT_BOT + 14)
    ctx.fillText('0', xOfBeta(0) - 3, PLOT_BOT + 14)

    const curve = (fn: (b: number) => number, color: string) => {
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      let started = false
      for (let i = 0; i <= 220; i++) {
        const b = BETA_MIN + (i / 220) * (BETA_MAX - BETA_MIN)
        const yy = yOfZ(fn(b))
        if (!started) { ctx.moveTo(xOfBeta(b), yy); started = true } else ctx.lineTo(xOfBeta(b), yy)
      }
      ctx.stroke()
    }
    curve(zClassical, 'rgba(167,139,250,0.85)')
    curve(zRel, '#10B981')

    ctx.fillStyle = 'rgba(167,139,250,0.9)'
    ctx.fillText('classical  z = β', LEFT + 10, PLOT_BOT - 10)
    ctx.fillStyle = '#10B981'
    ctx.fillText('relativistic  z = √((1+β)/(1−β)) − 1', LEFT + 10, PLOT_TOP + 14)

    // marker
    const mx = xOfBeta(beta)
    ctx.fillStyle = '#F59E0B'
    ctx.beginPath(); ctx.arc(mx, yOfZ(zRel(beta)), 4.5, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(167,139,250,0.9)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(mx, yOfZ(zClassical(beta)), 4, 0, Math.PI * 2); ctx.stroke()
  }, [beta, xOfBeta, yOfZ])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!sweeping) return
    const step = () => {
      setBeta(prev => {
        if (prev >= 0.6) { setSweeping(false); return prev }
        return Math.round((prev + 0.01) * 100) / 100
      })
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [sweeping])

  const resetAll = () => {
    triggerReset()
    setSweeping(false)
    setBeta(DEFAULT_BETA)
  }

  const zr = zRel(beta)
  const zc = zClassical(beta)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Spectral lines on the move</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Recession:</span>
          <input
            type="range" min={BETA_MIN} max={BETA_MAX} step={0.01} value={beta}
            onChange={e => { setBeta(+e.target.value); setSweeping(false) }}
            className="w-40 accent-accent-teal"
          />
          <span className="text-text-secondary font-medium">β = {beta.toFixed(2)}</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary">
          z = <strong className="text-accent-gold">{zr.toFixed(3)}</strong>
          {'  ·  '}
          classical would say <strong className="text-accent-violet">{zc.toFixed(3)}</strong>
        </span>
      </div>
    </div>
  )
}
