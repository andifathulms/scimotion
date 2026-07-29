'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

// --- spectrum band geometry (visible window 380–700 nm) ---------------
const LAM_LO = 380
const LAM_HI = 700
const BAND_L = 62
const BAND_W = 500
const MAIN_Y = 72
const UNK_Y = 168
const BAND_H = 44

const lamToX = (nm: number) => BAND_L + ((nm - LAM_LO) / (LAM_HI - LAM_LO)) * BAND_W

const ORANGE = '#FB923C'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const GREEN = '#10B981'
const BG = '#0F0D0A'

// Approximate visible colour for a wavelength in nm (0–1 RGB scaled to 255).
function spectrumColor(nm: number, gain = 1): string {
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
  const ch = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v)) * fade * gain)
  return `rgb(${ch(r)},${ch(g)},${ch(b)})`
}

type Line = { nm: number; rel: number; trans?: string } // rel = relative intensity 0–1
type Element = { key: string; name: string; tag: string; lines: Line[] }

// Real, approximately correct spectral-line wavelengths (nm).
const ELEMENTS: Element[] = [
  {
    key: 'H', name: 'Hydrogen', tag: ORANGE,
    lines: [
      { nm: 656.3, rel: 1.0, trans: '3→2' },
      { nm: 486.1, rel: 0.5, trans: '4→2' },
      { nm: 434.0, rel: 0.3, trans: '5→2' },
      { nm: 410.2, rel: 0.2, trans: '6→2' },
    ],
  },
  {
    key: 'He', name: 'Helium', tag: GOLD,
    lines: [
      { nm: 447.1, rel: 0.4 }, { nm: 471.3, rel: 0.2 }, { nm: 492.2, rel: 0.2 },
      { nm: 501.6, rel: 0.3 }, { nm: 587.6, rel: 1.0 }, { nm: 667.8, rel: 0.5 },
    ],
  },
  {
    key: 'Na', name: 'Sodium', tag: '#FDE68A',
    lines: [
      { nm: 568.8, rel: 0.2 }, { nm: 589.0, rel: 1.0 }, { nm: 589.6, rel: 0.9 },
      { nm: 615.4, rel: 0.15 },
    ],
  },
  {
    key: 'Hg', name: 'Mercury', tag: BLUE,
    lines: [
      { nm: 404.7, rel: 0.4 }, { nm: 435.8, rel: 0.8 }, { nm: 546.1, rel: 1.0 },
      { nm: 577.0, rel: 0.5 }, { nm: 579.1, rel: 0.5 },
    ],
  },
  {
    key: 'Ne', name: 'Neon', tag: '#F472B6',
    lines: [
      { nm: 585.2, rel: 0.6 }, { nm: 594.5, rel: 0.5 }, { nm: 614.3, rel: 0.6 },
      { nm: 626.6, rel: 0.7 }, { nm: 640.2, rel: 1.0 }, { nm: 650.7, rel: 0.8 },
      { nm: 692.9, rel: 0.4 },
    ],
  },
]

type Mode = 'emission' | 'absorption'

export function SpectralLinesAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const revealRef = useRef(0)

  const [elemKey, setElemKey] = useState('H')
  const [mode, setMode] = useState<Mode>('emission')
  const [tick, setTick] = useState(0) // forces redraws while revealing
  // The "unknown" gas the reader tries to identify — fixed for the session.
  const [unknownKey] = useState('Ne')

  const elem = useMemo(() => ELEMENTS.find(e => e.key === elemKey) ?? ELEMENTS[0], [elemKey])
  const unknown = useMemo(() => ELEMENTS.find(e => e.key === unknownKey) ?? ELEMENTS[0], [unknownKey])
  const matched = elemKey === unknownKey

  const drawBand = useCallback(
    (ctx: CanvasRenderingContext2D, el: Element, y: number, reveal: number) => {
      if (mode === 'emission') {
        // Bright emission lines on a black band.
        ctx.fillStyle = '#050403'
        ctx.fillRect(BAND_L, y, BAND_W, BAND_H)
        for (const ln of el.lines) {
          const x = lamToX(ln.nm)
          const a = Math.min(1, ln.rel * reveal + 0.05)
          ctx.fillStyle = spectrumColor(ln.nm)
          ctx.globalAlpha = a
          const halfW = 1 + ln.rel * 1.4
          ctx.fillRect(x - halfW, y, halfW * 2, BAND_H)
        }
        ctx.globalAlpha = 1
      } else {
        // Continuous rainbow with dark absorption lines removed from it.
        for (let px = 0; px < BAND_W; px++) {
          const nm = LAM_LO + (px / BAND_W) * (LAM_HI - LAM_LO)
          ctx.fillStyle = spectrumColor(nm, 0.92)
          ctx.fillRect(BAND_L + px, y, 1, BAND_H)
        }
        for (const ln of el.lines) {
          const x = lamToX(ln.nm)
          const a = Math.min(0.96, ln.rel * reveal)
          ctx.fillStyle = BG
          ctx.globalAlpha = a
          const halfW = 1 + ln.rel * 1.4
          ctx.fillRect(x - halfW, y, halfW * 2, BAND_H)
        }
        ctx.globalAlpha = 1
      }
      ctx.strokeStyle = 'rgba(255,245,235,0.18)'
      ctx.lineWidth = 1
      ctx.strokeRect(BAND_L + 0.5, y + 0.5, BAND_W - 1, BAND_H - 1)
    },
    [mode]
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reveal = revealRef.current
    ctx.clearRect(0, 0, W, H)
    ctx.font = '12px monospace'

    // ---- header ----
    ctx.textAlign = 'left'
    ctx.fillStyle = ORANGE
    ctx.fillText('Spectral barcode', BAND_L, 26)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.45)'
    ctx.fillText(
      mode === 'emission'
        ? 'bright lines where an excited element emits'
        : 'dark lines where a cool gas absorbs the same wavelengths',
      BAND_L, 42
    )

    // ---- selected element band ----
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = elem.tag
    ctx.textAlign = 'left'
    ctx.fillText(elem.name, BAND_L, MAIN_Y - 8)
    drawBand(ctx, elem, MAIN_Y, reveal)

    // ---- unknown gas band ----
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = matched ? GREEN : 'rgba(255,245,235,0.8)'
    ctx.fillText('Unknown gas', BAND_L, UNK_Y - 8)
    drawBand(ctx, unknown, UNK_Y, reveal)

    // Match connectors: when the picked element IS the unknown, its lines
    // fall exactly on the unknown's lines. Draw them to make it undeniable.
    if (matched) {
      ctx.save()
      ctx.setLineDash([3, 4])
      ctx.strokeStyle = 'rgba(16,185,129,0.7)'
      ctx.lineWidth = 1
      for (const ln of unknown.lines) {
        const x = lamToX(ln.nm)
        ctx.beginPath()
        ctx.moveTo(x, MAIN_Y + BAND_H)
        ctx.lineTo(x, UNK_Y)
        ctx.stroke()
      }
      ctx.restore()
      ctx.fillStyle = GREEN
      ctx.font = 'bold 12px monospace'
      ctx.textAlign = 'right'
      ctx.fillText('✓ MATCH — every line lines up', BAND_L + BAND_W, UNK_Y - 8)
    } else {
      ctx.fillStyle = 'rgba(255,245,235,0.4)'
      ctx.font = '10px monospace'
      ctx.textAlign = 'right'
      ctx.fillText('lines do not coincide — try another element', BAND_L + BAND_W, UNK_Y - 8)
    }

    // ---- wavelength axis under the unknown band ----
    ctx.textAlign = 'center'
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    for (let nm = 400; nm <= 700; nm += 50) {
      const x = lamToX(nm)
      ctx.beginPath()
      ctx.moveTo(x, UNK_Y + BAND_H)
      ctx.lineTo(x, UNK_Y + BAND_H + 4)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,245,235,0.4)'
      ctx.font = '9px monospace'
      ctx.fillText(`${nm}`, x, UNK_Y + BAND_H + 16)
    }
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,245,235,0.35)'
    ctx.fillText('wavelength / nm', BAND_L, UNK_Y + BAND_H + 30)

    // ---- lower panel: hydrogen energy ladder, or the element's line list ----
    const LY0 = 262
    if (elem.key === 'H') {
      ctx.font = '10px monospace'
      ctx.fillStyle = 'rgba(255,245,235,0.6)'
      ctx.textAlign = 'left'
      ctx.fillText('each line = one electron transition down to n = 2 (Balmer series)', BAND_L, LY0 - 4)

      const ladderX = BAND_L + 12
      const ladderW = 120
      const yOfN = (n: number) => {
        // E_n = -13.6/n^2 ; map n=2 (bottom) … n=6 (top).
        const e2 = -13.6 / 4
        const e = -13.6 / (n * n)
        const t = (e - e2) / (0 - e2) // 0 at n=2, →1 near ionisation
        return 340 - t * 66
      }
      // energy levels
      for (let n = 2; n <= 6; n++) {
        const y = yOfN(n)
        ctx.strokeStyle = 'rgba(255,245,235,0.3)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(ladderX, y)
        ctx.lineTo(ladderX + ladderW, y)
        ctx.stroke()
        ctx.fillStyle = 'rgba(255,245,235,0.5)'
        ctx.font = '9px monospace'
        ctx.textAlign = 'right'
        ctx.fillText(`n=${n}`, ladderX - 4, y + 3)
      }
      // transition arrows, coloured by the line they emit
      elem.lines.forEach((ln, i) => {
        const upper = 3 + i
        const yU = yOfN(upper)
        const yL = yOfN(2)
        const ax = ladderX + 24 + i * 22
        ctx.strokeStyle = spectrumColor(ln.nm)
        ctx.lineWidth = 1.5
        ctx.globalAlpha = 0.9
        ctx.beginPath()
        ctx.moveTo(ax, yU)
        ctx.lineTo(ax, yL)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(ax - 3, yL - 6)
        ctx.lineTo(ax, yL)
        ctx.lineTo(ax + 3, yL - 6)
        ctx.stroke()
        ctx.globalAlpha = 1
      })

      // wavelength labels linking transition → line
      ctx.textAlign = 'left'
      elem.lines.forEach((ln, i) => {
        const y = 276 + i * 15
        ctx.fillStyle = spectrumColor(ln.nm)
        ctx.font = '10px monospace'
        ctx.fillText(`${ln.trans}`, ladderX + ladderW + 30, y)
        ctx.fillStyle = 'rgba(255,245,235,0.7)'
        ctx.fillText(`${ln.nm.toFixed(1)} nm`, ladderX + ladderW + 66, y)
      })
    } else {
      ctx.font = '10px monospace'
      ctx.fillStyle = 'rgba(255,245,235,0.6)'
      ctx.textAlign = 'left'
      ctx.fillText(`${elem.name} lines / nm — its fixed, unique fingerprint`, BAND_L, LY0 - 4)
      ctx.font = '11px monospace'
      elem.lines.forEach((ln, i) => {
        const col = i % 4
        const row = Math.floor(i / 4)
        const x = BAND_L + 12 + col * 120
        const y = 282 + row * 22
        ctx.fillStyle = spectrumColor(ln.nm)
        ctx.fillRect(x, y - 8, 4, 12)
        ctx.fillStyle = 'rgba(255,245,235,0.75)'
        ctx.fillText(`${ln.nm.toFixed(1)}`, x + 10, y + 2)
      })
    }

    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,245,235,0.32)'
    ctx.font = '10px monospace'
    ctx.fillText('emission and absorption lines of an element sit at the SAME wavelengths', BAND_L, H - 6)
  }, [elem, unknown, matched, mode, drawBand])

  // Reveal animation (line intensities ramp 0 → 1).
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        revealRef.current = 1
        setTick(t => t + 1)
        return
      }
      revealRef.current = 0
      const start = performance.now()
      const step = () => {
        const p = Math.min(1, (performance.now() - start) / 900)
        revealRef.current = p
        setTick(t => t + 1)
        if (p < 1) rafRef.current = requestAnimationFrame(step)
      }
      rafRef.current = requestAnimationFrame(step)
    },
  })

  useEffect(() => { draw() }, [draw, tick])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    revealRef.current = 0
    triggerReset()
    setTick(t => t + 1)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Every element has a unique barcode</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: BG }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {ELEMENTS.map(e => (
            <button
              key={e.key}
              onClick={() => { setElemKey(e.key); revealRef.current = 1; setTick(t => t + 1) }}
              className={`px-2.5 py-1.5 font-mono transition-colors ${elemKey === e.key ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {e.key}
            </button>
          ))}
        </div>
        <button
          onClick={() => setMode(m => (m === 'emission' ? 'absorption' : 'emission'))}
          className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:bg-bg-hover transition-colors">
          {mode === 'emission' ? 'Show absorption' : 'Show emission'}
        </button>
        <span className="ml-auto font-mono text-xs text-text-muted">
          {matched ? 'unknown identified: ' : 'unknown = ?  ·  guess: '}
          <strong className={matched ? 'text-accent-gold' : 'text-text-secondary'}>{elem.name}</strong>
        </span>
      </div>
    </div>
  )
}
