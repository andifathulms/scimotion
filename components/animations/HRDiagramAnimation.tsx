'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 620
const H = 420
const BG = '#0F0D0A'
const INDIGO = '#818CF8'

// plot box
const LEFT = 66
const RIGHT = 18
const TOP = 26
const BOTTOM = 344
const PLOT_W = W - LEFT - RIGHT
const PLOT_H = BOTTOM - TOP

// axes ranges. Temperature is drawn REVERSED: hot on the left, cool on the right.
const LOG_T_HOT = Math.log10(42000) // left edge
const LOG_T_COOL = Math.log10(2600) // right edge
const LOG_L_MIN = -4.5 // faint, bottom
const LOG_L_MAX = 6.2 // luminous, top

const xOfT = (t: number) =>
  LEFT + ((LOG_T_HOT - Math.log10(t)) / (LOG_T_HOT - LOG_T_COOL)) * PLOT_W
const yOfL = (l: number) =>
  BOTTOM - ((Math.log10(l) - LOG_L_MIN) / (LOG_L_MAX - LOG_L_MIN)) * PLOT_H

// Deterministic pseudo-scatter — no Math.random / Date. Seeded from an index.
const jitter = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1 // in [-1, 1]
}

// Approximate blackbody colour for a surface temperature (K).
const ANCHORS: [number, [number, number, number]][] = [
  [40000, [148, 176, 255]],
  [20000, [170, 191, 255]],
  [10000, [202, 216, 255]],
  [7500, [248, 247, 255]],
  [6000, [255, 244, 232]],
  [5200, [255, 232, 170]],
  [4200, [255, 200, 120]],
  [3500, [255, 150, 90]],
  [2800, [255, 110, 71]],
]
const tempColor = (t: number): string => {
  if (t >= ANCHORS[0][0]) return `rgb(${ANCHORS[0][1].join(',')})`
  const last = ANCHORS[ANCHORS.length - 1]
  if (t <= last[0]) return `rgb(${last[1].join(',')})`
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [t0, c0] = ANCHORS[i]
    const [t1, c1] = ANCHORS[i + 1]
    if (t <= t0 && t >= t1) {
      const f = (t - t1) / (t0 - t1)
      const r = Math.round(c1[0] + (c0[0] - c1[0]) * f)
      const g = Math.round(c1[1] + (c0[1] - c1[1]) * f)
      const b = Math.round(c1[2] + (c0[2] - c1[2]) * f)
      return `rgb(${r},${g},${b})`
    }
  }
  return '#fff'
}

const spectral = (t: number): string => {
  if (t >= 30000) return 'O'
  if (t >= 10000) return 'B'
  if (t >= 7500) return 'A'
  if (t >= 6000) return 'F'
  if (t >= 5200) return 'G'
  if (t >= 3700) return 'K'
  return 'M'
}

type Star = { t: number; l: number; group: string; r: number }

// Anchor points for the main-sequence band (T in K, L in solar units).
const MS_ANCHORS: [number, number][] = [
  [38000, 130000],
  [20000, 12000],
  [13000, 700],
  [9500, 40],
  [7200, 5],
  [5800, 1], // the Sun
  [4800, 0.3],
  [3800, 0.04],
  [3000, 0.006],
]

const interpMS = (u: number): [number, number] => {
  // u in [0,1] runs hot->cool along the anchor curve, in log space.
  const seg = u * (MS_ANCHORS.length - 1)
  const i = Math.min(MS_ANCHORS.length - 2, Math.floor(seg))
  const f = seg - i
  const [t0, l0] = MS_ANCHORS[i]
  const [t1, l1] = MS_ANCHORS[i + 1]
  const logT = Math.log10(t0) + (Math.log10(t1) - Math.log10(t0)) * f
  const logL = Math.log10(l0) + (Math.log10(l1) - Math.log10(l0)) * f
  return [Math.pow(10, logT), Math.pow(10, logL)]
}

// Build the star population once, deterministically.
const buildStars = (): Star[] => {
  const stars: Star[] = []

  // Main sequence — 46 stars scattered along the band.
  for (let i = 0; i < 46; i++) {
    const u = i / 45
    const [t, l] = interpMS(u)
    const tj = t * (1 + jitter(i, 1) * 0.04)
    const lj = l * Math.pow(10, jitter(i, 2) * 0.18)
    stars.push({ t: tj, l: lj, group: 'ms', r: 2.6 })
  }

  // Red giants — cool but luminous (upper right).
  for (let i = 0; i < 16; i++) {
    const t = 3900 + jitter(i, 3) * 500
    const l = Math.pow(10, 2 + (i / 15) * 1.1 + jitter(i, 4) * 0.25)
    stars.push({ t, l, group: 'giant', r: 3.2 })
  }

  // Supergiants — very luminous across a range of temperatures (top).
  for (let i = 0; i < 12; i++) {
    const t = Math.pow(10, Math.log10(3200) + (i / 11) * (Math.log10(22000) - Math.log10(3200)) + jitter(i, 5) * 0.03)
    const l = Math.pow(10, 4.6 + jitter(i, 6) * 0.5)
    stars.push({ t, l, group: 'supergiant', r: 3.6 })
  }

  // White dwarfs — hot but faint (lower left).
  for (let i = 0; i < 14; i++) {
    const t = Math.pow(10, Math.log10(7000) + (i / 13) * (Math.log10(30000) - Math.log10(7000)) + jitter(i, 7) * 0.04)
    const l = Math.pow(10, -2.6 + jitter(i, 8) * 0.6)
    stars.push({ t, l, group: 'wd', r: 2.4 })
  }

  return stars
}

const STARS = buildStars()

const GROUP_LABEL: Record<string, string> = {
  ms: 'Main-sequence',
  giant: 'Red giant',
  supergiant: 'Supergiant',
  wd: 'White dwarf',
}

export function HRDiagramAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const revealRef = useRef(0) // 0..1 fade-in of the population
  const playingRef = useRef(false)
  const hoverRef = useRef<number>(-1) // index of hovered/selected star

  const [selected, setSelected] = useState<number>(-1)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    // ---- grid + axes ----
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'

    // temperature ticks (reversed: hot left -> cool right)
    const tTicks = [40000, 20000, 10000, 7000, 5000, 3500, 3000]
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    ctx.lineWidth = 1
    for (const t of tTicks) {
      const x = xOfT(t)
      ctx.beginPath()
      ctx.moveTo(x, TOP)
      ctx.lineTo(x, BOTTOM)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.45)'
      ctx.fillText(`${t >= 1000 ? (t / 1000).toFixed(0) + 'k' : t}`, x, BOTTOM + 14)
    }

    // luminosity ticks (log, solar units)
    ctx.textAlign = 'right'
    for (let e = -4; e <= 6; e += 2) {
      const y = yOfL(Math.pow(10, e))
      ctx.strokeStyle = 'rgba(255,245,235,0.05)'
      ctx.beginPath()
      ctx.moveTo(LEFT, y)
      ctx.lineTo(LEFT + PLOT_W, y)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.45)'
      ctx.fillText(e === 0 ? '1' : `10${sup(e)}`, LEFT - 8, y + 3)
    }

    // axis frame
    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.lineWidth = 1
    ctx.strokeRect(LEFT, TOP, PLOT_W, PLOT_H)

    // axis labels
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('surface temperature (K) — hot ◂ left · right ▸ cool', LEFT + PLOT_W / 2, BOTTOM + 30)
    ctx.save()
    ctx.translate(16, TOP + PLOT_H / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('luminosity (L / L☉, log)', 0, 0)
    ctx.restore()

    // region labels
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(129,140,248,0.55)'
    ctx.textAlign = 'left'
    ctx.fillText('SUPERGIANTS', xOfT(9000), yOfL(2e5) - 2)
    ctx.fillStyle = 'rgba(255,150,90,0.6)'
    ctx.fillText('GIANTS', xOfT(4200) - 6, yOfL(600))
    ctx.fillStyle = 'rgba(202,216,255,0.6)'
    ctx.textAlign = 'right'
    ctx.fillText('WHITE DWARFS', xOfT(9000), yOfL(0.02))
    // main-sequence label along the band
    ctx.save()
    ctx.translate(xOfT(7000), yOfL(6))
    ctx.rotate(0.72)
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.textAlign = 'center'
    ctx.fillText('MAIN SEQUENCE', 0, -6)
    ctx.restore()

    // ---- stars ----
    const reveal = revealRef.current
    const sel = hoverRef.current
    ctx.textAlign = 'left'
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i]
      // fade in progressively so the population "assembles"
      const appear = Math.min(1, Math.max(0, reveal * STARS.length - i) )
      if (appear <= 0) continue
      const x = xOfT(s.t)
      const y = yOfL(s.l)
      const col = tempColor(s.t)
      ctx.globalAlpha = appear
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(x, y, s.r + (i === sel ? 2 : 0), 0, Math.PI * 2)
      ctx.fill()
      // soft glow
      ctx.globalAlpha = appear * 0.25
      ctx.beginPath()
      ctx.arc(x, y, s.r + 2.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }

    // highlight ring on selection
    if (sel >= 0 && sel < STARS.length && reveal >= 0.99) {
      const s = STARS[sel]
      const x = xOfT(s.t)
      const y = yOfL(s.l)
      ctx.strokeStyle = INDIGO
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(x, y, s.r + 6, 0, Math.PI * 2)
      ctx.stroke()
      // crosshair to the axes
      ctx.setLineDash([2, 3])
      ctx.strokeStyle = 'rgba(129,140,248,0.4)'
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x, BOTTOM)
      ctx.moveTo(x, y)
      ctx.lineTo(LEFT, y)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [])

  useEffect(() => {
    const loop = () => {
      if (playingRef.current) {
        revealRef.current = Math.min(1, revealRef.current + 0.02)
        if (revealRef.current >= 1) playingRef.current = false
      }
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        revealRef.current = 1
        playingRef.current = false
        draw()
        return
      }
      revealRef.current = 0
      playingRef.current = true
    },
  })

  const pick = (clientX: number, clientY: number, persist: boolean) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = ((clientX - rect.left) / rect.width) * W
    const my = ((clientY - rect.top) / rect.height) * H
    let best = -1
    let bestD = 14 * 14
    for (let i = 0; i < STARS.length; i++) {
      const dx = xOfT(STARS[i].t) - mx
      const dy = yOfL(STARS[i].l) - my
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    if (best >= 0 || persist) {
      hoverRef.current = best
      setSelected(best)
    }
  }

  const replay = () => {
    revealRef.current = 0
    playingRef.current = true
  }

  const resetAll = () => {
    playingRef.current = false
    revealRef.current = 1
    hoverRef.current = -1
    setSelected(-1)
    triggerReset()
    draw()
  }

  const s = selected >= 0 ? STARS[selected] : null

  return (
    <div className="animation-block" ref={ref}>
      <div
        className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1"
      >
        {s ? (
          <>
            <span style={{ color: INDIGO }}>{GROUP_LABEL[s.group]} · type {spectral(s.t)}</span>
            <span>T = {Math.round(s.t).toLocaleString()} K</span>
            <span>
              L = {s.l >= 1 ? s.l.toFixed(s.l >= 100 ? 0 : 1) : s.l.toExponential(1)} L☉
            </span>
            <span className="flex items-center gap-1.5">
              colour
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 9,
                  background: tempColor(s.t),
                }}
              />
            </span>
          </>
        ) : (
          <span className="text-text-muted">Hover or tap a star to read its type, temperature, luminosity, and colour.</span>
        )}
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: HR diagram. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: BG, cursor: 'crosshair', touchAction: 'none' }}
          onPointerMove={e => pick(e.clientX, e.clientY, false)}
          onPointerDown={e => pick(e.clientX, e.clientY, true)}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={replay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={13} /> Assemble
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border text-text-secondary hover:bg-bg-hover"
        >
          <RotateCcw size={13} /> Reset
        </button>
        <span className="ml-auto text-xs text-text-muted">Each dot is one star — not a point on the sky.</span>
      </div>
    </div>
  )
}

// superscript for exponent tick labels
function sup(n: number): string {
  const map: Record<string, string> = {
    '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
  }
  return String(n)
    .split('')
    .map(c => map[c] ?? c)
    .join('')
}
