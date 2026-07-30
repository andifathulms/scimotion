'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360
const BG = '#0F0D0A'

const INDIGO = '#818CF8'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const DUST = '#E6C86E'
const DIM = 'rgba(245,240,232,0.42)'
const FAINT = 'rgba(255,245,235,0.12)'

// Orbit geometry (pixels). Sun sits at one focus of the ellipse.
const CX = 300
const CY = 182
const A = 210 // semi-major axis
const E = 0.8 // eccentricity — highly elongated, like a real comet
const B = A * Math.sqrt(1 - E * E) // semi-minor axis
const C = A * E // focus offset from centre
const SUNX = CX + C // Sun at the right-hand focus
const SUNY = CY

// Physical scale: map the pixel semi-major axis onto an AU value (Halley-like).
const A_AU = 18
const R_MIN_AU = A_AU * (1 - E) // perihelion distance
const R_MAX_AU = A_AU * (1 + E) // aphelion distance

// Kepler's equation: solve M = E - e*sin(E) for the eccentric anomaly.
function solveEccentric(M: number): number {
  let ecc = M
  for (let i = 0; i < 6; i++) {
    ecc = ecc - (ecc - E * Math.sin(ecc) - M) / (1 - E * Math.cos(ecc))
  }
  return ecc
}

// Aphelion speed is the slowest; perihelion the fastest. Ratio = sqrt((1+e)/(1-e)).
const V_APHELION = Math.sqrt(2 / R_MAX_AU - 1 / A_AU) // vis-viva, unnormalised

export function CometOrbitAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const mRef = useRef(0) // mean anomaly, advances at constant rate (Kepler's 2nd law)
  const playingRef = useRef(false)

  const [playing, setPlaying] = useState(false)
  const [readout, setReadout] = useState({ r: R_MAX_AU, v: 1, lead: false })

  const draw = useCallback((M: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    const ecc = solveEccentric(M)
    // Position on the ellipse (Sun-centred at the focus).
    const px = CX + A * Math.cos(ecc)
    const py = CY + B * Math.sin(ecc)
    const rAU = A_AU * (1 - E * Math.cos(ecc))

    // Anti-sunward unit vector — the direction BOTH tails are pushed.
    const dx = px - SUNX
    const dy = py - SUNY
    const dist = Math.hypot(dx, dy) || 1
    const ax = dx / dist
    const ay = dy / dist

    // Velocity direction: derivative of position w.r.t. eccentric anomaly.
    const vx = -A * Math.sin(ecc)
    const vy = B * Math.cos(ecc)
    const vmag = Math.hypot(vx, vy) || 1
    const lead = (ax * vx + ay * vy) / vmag > 0 // tail points along motion → it leads

    // Vis-viva speed relative to the (slowest) aphelion speed.
    const vRel = Math.sqrt(2 / rAU - 1 / A_AU) / V_APHELION

    // --- title ---
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = INDIGO
    ctx.fillText('Elliptical orbit — the tail is pushed anti-sunward, not trailed behind', 16, 22)

    // --- orbit ellipse ---
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.ellipse(CX, CY, A, B, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // perihelion / aphelion markers
    const periX = CX + A // nearest point to the focus at +x
    const apX = CX - A
    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('perihelion', periX - 4, CY + 20)
    ctx.fillText('(fast)', periX - 4, CY + 31)
    ctx.fillText('aphelion', apX + 6, CY - 14)
    ctx.fillText('(slow)', apX + 6, CY - 3)

    // --- the Sun at the focus ---
    const glow = ctx.createRadialGradient(SUNX, SUNY, 2, SUNX, SUNY, 34)
    glow.addColorStop(0, 'rgba(245,158,11,0.55)')
    glow.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(SUNX, SUNY, 34, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = GOLD
    ctx.beginPath()
    ctx.arc(SUNX, SUNY, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    ctx.fillText('Sun', SUNX, SUNY + 26)

    // Sublimation grows the tail near the Sun and shrinks it far away.
    const lenFrac = Math.max(0, (R_MAX_AU - rAU) / (R_MAX_AU - R_MIN_AU))
    const tailLen = Math.pow(lenFrac, 1.4) * 150

    if (tailLen > 3) {
      // perpendicular for tail width
      const perpX = -ay
      const perpY = ax
      // Dust tail — broad, curved, yellowish (heavier grains lag along the orbit).
      const lagx = -vx / vmag
      const lagy = -vy / vmag
      const midx = px + ax * tailLen * 0.55 + lagx * tailLen * 0.28
      const midy = py + ay * tailLen * 0.55 + lagy * tailLen * 0.28
      const endx = px + ax * tailLen + lagx * tailLen * 0.55
      const endy = py + ay * tailLen + lagy * tailLen * 0.55
      const wDust = 5 + tailLen * 0.16
      const dg = ctx.createLinearGradient(px, py, endx, endy)
      dg.addColorStop(0, 'rgba(230,200,110,0.5)')
      dg.addColorStop(1, 'rgba(230,200,110,0)')
      ctx.fillStyle = dg
      ctx.beginPath()
      ctx.moveTo(px + perpX * 5, py + perpY * 5)
      ctx.quadraticCurveTo(midx + perpX * wDust, midy + perpY * wDust, endx, endy)
      ctx.quadraticCurveTo(midx - perpX * wDust, midy - perpY * wDust, px - perpX * 5, py - perpY * 5)
      ctx.closePath()
      ctx.fill()

      // Ion/gas tail — straight, narrow, bluish, blown dead anti-sunward.
      const ig = ctx.createLinearGradient(px, py, px + ax * tailLen * 1.15, py + ay * tailLen * 1.15)
      ig.addColorStop(0, 'rgba(96,165,250,0.75)')
      ig.addColorStop(1, 'rgba(96,165,250,0)')
      ctx.strokeStyle = ig
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + ax * tailLen * 1.15, py + ay * tailLen * 1.15)
      ctx.stroke()

      // coma glow around the nucleus
      const coma = ctx.createRadialGradient(px, py, 1, px, py, 12 + tailLen * 0.05)
      coma.addColorStop(0, 'rgba(180,200,255,0.6)')
      coma.addColorStop(1, 'rgba(180,200,255,0)')
      ctx.fillStyle = coma
      ctx.beginPath()
      ctx.arc(px, py, 12 + tailLen * 0.05, 0, Math.PI * 2)
      ctx.fill()
    }

    // --- the comet nucleus ---
    ctx.fillStyle = '#EFE9DD'
    ctx.beginPath()
    ctx.arc(px, py, 4, 0, Math.PI * 2)
    ctx.fill()

    // small arrow showing direction of motion, to compare with the tail
    const arrLen = 26
    const mx = px + (vx / vmag) * arrLen
    const my = py + (vy / vmag) * arrLen
    ctx.strokeStyle = INDIGO
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(mx, my)
    ctx.stroke()
    const ang = Math.atan2(my - py, mx - px)
    ctx.beginPath()
    ctx.moveTo(mx, my)
    ctx.lineTo(mx - 6 * Math.cos(ang - 0.4), my - 6 * Math.sin(ang - 0.4))
    ctx.moveTo(mx, my)
    ctx.lineTo(mx - 6 * Math.cos(ang + 0.4), my - 6 * Math.sin(ang + 0.4))
    ctx.stroke()
    ctx.fillStyle = INDIGO
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('motion', mx, my - 6)

    // --- legend ---
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = BLUE
    ctx.fillText('■ ion tail (solar wind)', 16, H - 30)
    ctx.fillStyle = DUST
    ctx.fillText('■ dust tail (radiation pressure)', 16, H - 16)

    setReadout({ r: rAU, v: vRel, lead })
  }, [])

  useEffect(() => {
    const loop = () => {
      if (playingRef.current) {
        // Mean anomaly advances at a CONSTANT rate — this is exactly Kepler's
        // 2nd law. Constant dM/dt yields fast motion near perihelion, slow at aphelion.
        mRef.current = (mRef.current + 0.012) % (Math.PI * 2)
      }
      draw(mRef.current)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Static frame just after perihelion, where the tail LEADS the comet.
        mRef.current = 0.7
        playingRef.current = false
        draw(0.7)
        return
      }
      mRef.current = Math.PI // start at aphelion, tail-less and slow
      playingRef.current = true
      setPlaying(true)
    },
  })

  const toggle = () => {
    playingRef.current = !playingRef.current
    setPlaying(playingRef.current)
  }

  const reset = () => {
    playingRef.current = false
    setPlaying(false)
    mRef.current = Math.PI
    draw(Math.PI)
    triggerReset()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Watch the tail always point away from the Sun</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: BG }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>distance from Sun: <span style={{ color: INDIGO }}>{readout.r.toFixed(1)} AU</span></span>
        <span>relative speed: <span className="text-accent-orange">{readout.v.toFixed(2)}×</span></span>
        <span>tail: <span className="text-accent-blue">anti-sunward</span>, {readout.lead ? 'LEADS the comet (outbound)' : 'trails the comet (inbound)'}</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {playing ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <span className="text-xs text-text-muted font-mono ml-auto self-center">
          {readout.r < R_MIN_AU + 4 ? 'racing through perihelion — tail longest'
            : readout.r > R_MAX_AU - 4 ? 'crawling at aphelion — nearly tail-less'
            : readout.lead ? 'outbound: tail leads the way' : 'inbound: tail trails behind'}
        </span>
      </div>
    </div>
  )
}
