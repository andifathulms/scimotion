'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 384

// --- binding-energy plot (bottom panel) ------------------------------
const PAD = { left: 44, right: 16, top: 200, bottom: 356 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = PAD.bottom - PAD.top

const A_MAX = 240
const BE_MAX = 9.2
const PEAK_A = 62
const PEAK_BE = 8.795 // nickel-62 / iron-56 region, MeV per nucleon

const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const GREEN = '#10B981'
const CYAN = '#22D3EE'
const INDIGO = '#818CF8'
const RED = '#F87171'

// Real binding-energy-per-nucleon anchors (MeV): the low-A rise, the He-4 spike,
// the broad peak near iron, and the gentle decline to uranium. Every fusion-ladder
// rung below (A = 1, 4, 12, 16, 20, 28, 56) is an exact anchor, so the markers sit
// on the drawn curve.
const ANCHORS: [number, number][] = [
  [1, 0], [2, 1.112], [3, 2.827], [4, 7.074], [6, 5.332], [7, 5.606],
  [9, 6.463], [12, 7.680], [16, 7.976], [20, 8.032], [24, 8.261],
  [28, 8.448], [32, 8.493], [40, 8.551], [48, 8.666], [56, 8.790],
  [62, 8.795], [75, 8.705], [92, 8.517], [120, 8.505], [141, 8.326],
  [165, 8.120], [197, 7.906], [209, 7.848], [235, 7.591], [238, 7.570],
]

function beOf(A: number): number {
  if (A <= ANCHORS[0][0]) return ANCHORS[0][1]
  const last = ANCHORS[ANCHORS.length - 1]
  if (A >= last[0]) return last[1]
  for (let i = 1; i < ANCHORS.length; i++) {
    const [a1, b1] = ANCHORS[i]
    if (A <= a1) {
      const [a0, b0] = ANCHORS[i - 1]
      const t = (A - a0) / (a1 - a0)
      return b0 + t * (b1 - b0)
    }
  }
  return last[1]
}

type Rung = { sym: string; name: string; A: number; be: number; color: string; burn: string; dur: string }

// A massive star's core-burning ladder, mass-ordered so each rung sits higher on
// the curve than the last. Durations are order-of-magnitude for a ~20 solar-mass
// star (Woosley & Weaver) — note how the stages collapse from millions of years
// to a single day as iron approaches.
const RUNGS: Rung[] = [
  { sym: '¹H', name: 'Hydrogen', A: 1, be: beOf(1), color: BLUE, burn: 'primordial gas — fusion not yet ignited', dur: '' },
  { sym: '⁴He', name: 'Helium', A: 4, be: beOf(4), color: CYAN, burn: 'hydrogen fusing to helium', dur: '~7 million yr' },
  { sym: '¹²C', name: 'Carbon', A: 12, be: beOf(12), color: GREEN, burn: 'helium fusing to carbon (triple-α)', dur: '~700,000 yr' },
  { sym: '¹⁶O', name: 'Oxygen', A: 16, be: beOf(16), color: VIOLET, burn: 'carbon fusing to oxygen', dur: '~600 yr' },
  { sym: '²⁰Ne', name: 'Neon', A: 20, be: beOf(20), color: PINK, burn: 'the neon-burning stage', dur: '~1 yr' },
  { sym: '²⁸Si', name: 'Silicon', A: 28, be: beOf(28), color: GOLD, burn: 'oxygen fusing to silicon', dur: '~6 months' },
  { sym: '⁵⁶Fe', name: 'Iron', A: 56, be: beOf(56), color: INDIGO, burn: 'silicon fusing to the iron peak', dur: '~1 day' },
]
const LAST = RUNGS.length - 1

export function NucleosynthesisAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const progressRef = useRef(LAST) // continuous position along the ladder, 0..6
  const targetRef = useRef(LAST)
  const rafRef = useRef(0)
  const [stage, setStage] = useState(LAST)

  const xA = useCallback((A: number) => PAD.left + (A / A_MAX) * PLOT_W, [])
  const yBE = useCallback((be: number) => PAD.top + PLOT_H - (be / BE_MAX) * PLOT_H, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const p = progressRef.current
    const lo = Math.max(0, Math.floor(p))
    const hi = Math.min(LAST, Math.ceil(p))
    const frac = p - lo
    const active = frac > 0.001 ? hi : lo
    const cur = RUNGS[active]
    const collapsed = active === LAST && p >= LAST - 0.001

    // ---------- TOP-LEFT: onion-shell cross-section ----------
    const ocx = 96
    const ocy = 86
    const maxR = 72
    const shells = active + 1
    for (let j = 0; j <= active; j++) {
      const rOut = (maxR * (shells - j)) / shells
      ctx.beginPath()
      ctx.arc(ocx, ocy, rOut, 0, Math.PI * 2)
      ctx.fillStyle = RUNGS[j].color + '2E'
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = RUNGS[j].color + (j === active ? 'FF' : '77')
      ctx.stroke()
    }
    // core label + collapse cue
    ctx.textAlign = 'center'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = collapsed ? RED : cur.color
    ctx.fillText(cur.sym, ocx, ocy + 4)
    if (collapsed) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        const r1 = maxR + 6
        const r2 = maxR - 10
        ctx.strokeStyle = RED
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(ocx + Math.cos(a) * r1, ocy + Math.sin(a) * r1)
        ctx.lineTo(ocx + Math.cos(a) * r2, ocy + Math.sin(a) * r2)
        ctx.stroke()
      }
    }
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('onion-shell core', ocx, ocy + maxR + 22)

    // ---------- TOP-RIGHT: readout ----------
    const rx = 196
    ctx.textAlign = 'left'
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = collapsed ? RED : cur.color
    ctx.fillText(`${cur.name} core${active === 0 ? '' : ' ash'}`, rx, 30)

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.72)'
    ctx.fillText(cur.burn, rx, 48)
    if (cur.dur) {
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.fillText(`this stage lasts ${cur.dur}`, rx, 64)
    }

    // energy-released bar (per nucleon), scaled so H-burning fills it
    const dBe = active === 0 ? 0 : RUNGS[active].be - RUNGS[active - 1].be
    const barX = rx
    const barY = 82
    const barMaxW = 300
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('energy released this stage (MeV / nucleon)', barX, barY - 4)
    ctx.fillStyle = 'rgba(255,245,235,0.08)'
    ctx.fillRect(barX, barY, barMaxW, 12)
    ctx.fillStyle = GOLD
    ctx.fillRect(barX, barY, (dBe / 7.074) * barMaxW, 12)
    ctx.fillStyle = GOLD
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(active === 0 ? '—' : `+${dBe.toFixed(2)}`, barX + barMaxW + 6, barY + 10)

    // the wall
    ctx.font = '9px monospace'
    if (collapsed) {
      ctx.fillStyle = RED
      ctx.fillText('Fusing iron would ABSORB energy — the curve turns down.', rx, 118)
      ctx.fillText('With no fusion to hold it up, the core collapses in seconds →', rx, 132)
      ctx.fillStyle = GOLD
      ctx.font = 'bold 10px monospace'
      ctx.fillText('SUPERNOVA', rx, 150)
    } else if (active === 0) {
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.fillText('Advance the star through its burning stages →', rx, 118)
    } else {
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.fillText('Each stage builds heavier ash — and yields less energy,', rx, 118)
      ctx.fillText('over ever-shorter times, as it nears the iron peak.', rx, 132)
    }

    // divider
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, 172)
    ctx.lineTo(W, 172)
    ctx.stroke()

    // ---------- BOTTOM: binding-energy curve ----------
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('binding energy / nucleon (MeV) — higher = more tightly bound', PAD.left - 2, PAD.top - 8)
    ctx.fillText('mass number A →', PAD.left + PLOT_W - 96, PAD.top + PLOT_H + 22)
    ctx.textAlign = 'right'
    for (const v of [8, 4, 0]) ctx.fillText(String(v), PAD.left - 6, yBE(v) + 3)
    ctx.textAlign = 'left'
    for (const a of [50, 100, 150, 200]) {
      ctx.fillStyle = 'rgba(245,240,232,0.28)'
      ctx.fillText(`${a}`, xA(a) - 7, PAD.top + PLOT_H + 13)
    }

    // iron-peak guide line
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(129,140,248,0.4)'
    ctx.beginPath()
    ctx.moveTo(PAD.left, yBE(PEAK_BE))
    ctx.lineTo(PAD.left + PLOT_W, yBE(PEAK_BE))
    ctx.stroke()
    ctx.setLineDash([])

    // the curve
    ctx.strokeStyle = 'rgba(245,240,232,0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    let started = false
    for (let A = 1; A <= A_MAX; A += 1) {
      const px = xA(A)
      const py = yBE(beOf(A))
      if (!started) { ctx.moveTo(px, py); started = true } else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // endothermic wall: the descent past the peak, in red
    ctx.strokeStyle = 'rgba(248,113,113,0.75)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    started = false
    for (let A = PEAK_A; A <= A_MAX; A += 1) {
      const px = xA(A)
      const py = yBE(beOf(A))
      if (!started) { ctx.moveTo(px, py); started = true } else ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = RED
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('past iron: fusion COSTS energy →', xA(120), yBE(beOf(150)) + 4)

    // peak marker
    ctx.fillStyle = INDIGO
    ctx.beginPath(); ctx.arc(xA(PEAK_A), yBE(PEAK_BE), 3.5, 0, Math.PI * 2); ctx.fill()
    ctx.font = 'bold 9px monospace'
    ctx.fillText('iron peak — the summit', xA(PEAK_A) + 8, yBE(PEAK_BE) - 6)

    // rung dots
    for (let i = 0; i <= LAST; i++) {
      const r = RUNGS[i]
      ctx.fillStyle = i <= active ? r.color : 'rgba(245,240,232,0.25)'
      ctx.beginPath(); ctx.arc(xA(r.A), yBE(r.be), i === active ? 5 : 3, 0, Math.PI * 2); ctx.fill()
      if (i === active) {
        ctx.fillStyle = r.color
        ctx.font = 'bold 10px monospace'
        ctx.textAlign = i === LAST ? 'right' : 'left'
        ctx.fillText(r.sym, xA(r.A) + (i === LAST ? -8 : 8), yBE(r.be) - 8)
        ctx.textAlign = 'left'
      }
    }

    // the climb trail from hydrogen up to the current marker
    const markA = RUNGS[lo].A + (RUNGS[hi].A - RUNGS[lo].A) * frac
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 3
    ctx.beginPath()
    started = false
    for (let A = 1; A <= markA; A += 0.5) {
      const px = xA(A)
      const py = yBE(beOf(A)) - 1
      if (!started) { ctx.moveTo(px, py); started = true } else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // glowing marker
    const mx = xA(markA)
    const my = yBE(beOf(markA))
    const grd = ctx.createRadialGradient(mx, my, 0, mx, my, 13)
    grd.addColorStop(0, collapsed ? 'rgba(248,113,113,0.55)' : 'rgba(245,158,11,0.55)')
    grd.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.fillStyle = grd
    ctx.beginPath(); ctx.arc(mx, my, 13, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = collapsed ? RED : GOLD
    ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill()
  }, [xA, yBE])

  const loop = useCallback(() => {
    const p = progressRef.current
    const target = targetRef.current
    const speed = 0.028
    let np = p
    if (Math.abs(target - p) < 0.001) np = target
    else if (target > p) np = Math.min(target, p + speed)
    else np = Math.max(target, p - speed)
    progressRef.current = np
    const st = Math.round(np)
    setStage(prev => (prev === st ? prev : st))
    draw()
    if (np !== target) rafRef.current = requestAnimationFrame(loop)
  }, [draw])

  const animateTo = useCallback((t: number) => {
    targetRef.current = t
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(loop)
  }, [loop])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        progressRef.current = LAST
        targetRef.current = LAST
        setStage(LAST)
        draw()
        return
      }
      progressRef.current = 0
      setStage(0)
      animateTo(LAST)
    },
  })

  useEffect(() => { draw() }, [draw])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    progressRef.current = 0
    targetRef.current = 0
    setStage(0)
    draw()
    triggerReset()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The fusion ladder to iron</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {RUNGS.map((r, i) => (
            <button
              key={r.sym}
              onClick={() => animateTo(i)}
              className={`px-2.5 py-1.5 font-mono transition-colors ${stage === i ? 'bg-accent-teal text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {r.sym}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-xs text-text-muted">
          {RUNGS[stage].name} · BE/A {RUNGS[stage].be.toFixed(2)} MeV
        </span>
      </div>
    </div>
  )
}
