'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300
const LIME = '#A3E635'

// --- The DNA and the guide RNA ------------------------------------------------
// Top strand of a stretch of double-stranded DNA. Three candidate sites are
// embedded. Cas9 carries a guide RNA whose 8-letter "spacer" must base-pair with
// a protospacer AND sit immediately 5' of a PAM (SpCas9 reads NGG) before it cuts.
const GUIDE = 'GACCTAGT' // the 8-letter spacer carried by Cas9
const L = GUIDE.length

// Top strand, 40 bases. Windows are hand-placed so exactly one site both matches
// the guide and is followed by a PAM.
const TOP =
  'TTAC' + // 0-3   filler
  'GACGTAGA' + // 4-11  site A protospacer (6/8 match)
  'CAT' + // 12-14 A's trailing bases (not a PAM)
  'T' + // 15    filler
  'GACCTAGT' + // 16-23 site B protospacer (8/8 match)
  'TGG' + // 24-26 PAM (NGG) ✓
  'A' + // 27    filler
  'CCTTGGAA' + // 28-35 site C protospacer (0/8 match)
  'ATC' + // 36-38 C's trailing bases (not a PAM)
  'C' // 39    filler

const COMP: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G' }
const BOT = TOP.split('').map(b => COMP[b]).join('')

type Site = { key: string; label: string; start: number; match: number; pam: string; hasPam: boolean }

function buildSite(key: string, label: string, start: number): Site {
  const proto = TOP.slice(start, start + L)
  let match = 0
  for (let i = 0; i < L; i++) if (proto[i] === GUIDE[i]) match++
  const pam = TOP.slice(start + L, start + L + 3)
  const hasPam = pam.length === 3 && pam[1] === 'G' && pam[2] === 'G'
  return { key, label, start, match, pam, hasPam }
}

const SITES: Site[] = [
  buildSite('A', 'Site A', 4),
  buildSite('B', 'Site B', 16),
  buildSite('C', 'Site C', 28),
]
const TARGET = SITES.find(s => s.match === L && s.hasPam)! // site B

// Cas9 samples sites by 3D diffusion, not left-to-right. This fixed order lets
// the scan reject two sites before landing on the real target.
const SEARCH: Site[] = [SITES[0], SITES[2], SITES[1]]

// Geometry.
const BASE_W = 13
const X0 = 24
const TOP_Y = 150
const BOT_Y = 178
const siteCenterX = (s: Site) => X0 + (s.start + L / 2) * BASE_W

// Timeline (frames).
const TRAVEL = 26
const DWELL = 46
const CUT = 44
const SEG = TRAVEL + DWELL
const T_MAX = SEG * (SEARCH.length - 1) + TRAVEL + DWELL + CUT

type View = { site: Site; arrivedFrac: number; dwellFrac: number; cutFrac: number; cut: boolean }

// Resolve the scan state at a given tick into "where is Cas9 and what is it doing".
function viewAt(tick: number): View {
  for (let i = 0; i < SEARCH.length; i++) {
    const base = i * SEG
    const isLast = i === SEARCH.length - 1
    const dwellLen = isLast ? DWELL + CUT : DWELL
    if (tick < base + TRAVEL) {
      return { site: SEARCH[i], arrivedFrac: (tick - base) / TRAVEL, dwellFrac: 0, cutFrac: 0, cut: false }
    }
    if (tick < base + TRAVEL + dwellLen) {
      const d = tick - base - TRAVEL
      const dwellFrac = Math.min(1, d / DWELL)
      const cutFrac = isLast ? Math.max(0, (d - DWELL) / CUT) : 0
      return { site: SEARCH[i], arrivedFrac: 1, dwellFrac, cutFrac, cut: isLast && cutFrac > 0 }
    }
  }
  return { site: TARGET, arrivedFrac: 1, dwellFrac: 1, cutFrac: 1, cut: true }
}

export function CrisprTargetingAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) setTick(T_MAX)
      else setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [tick, setTick] = useState(0)
  const [inspect, setInspect] = useState<string | null>(null) // site key, or null for auto-scan

  const inspectSite = inspect ? SITES.find(s => s.key === inspect)! : null

  // The site Cas9 is currently over, plus what it is doing.
  const scan = viewAt(tick)
  const active: Site = inspectSite ?? scan.site
  const showPairing = inspectSite ? true : scan.arrivedFrac >= 1
  const isCut = inspectSite ? false : scan.cut && active.key === TARGET.key
  const cutFrac = inspectSite ? 0 : scan.cutFrac
  const matched = active.match === L && active.hasPam

  const draw = useCallback(() => {
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
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Title.
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.textAlign = 'left'
    ctx.fillText('Cas9 + guide RNA scanning double-stranded DNA', 16, 22)
    ctx.textAlign = 'center'

    // The double-strand break offset: at the true target, both strands split.
    const cutAt = X0 + (TARGET.start + L - 3) * BASE_W + BASE_W / 2 // blunt cut ~3 bp inside protospacer end
    const split = isCut ? cutFrac * 10 : 0

    // Draw the two strands, base by base.
    for (let i = 0; i < TOP.length; i++) {
      const cx = X0 + i * BASE_W + BASE_W / 2
      const past = isCut && cx > cutAt
      const dx = past ? split : 0

      // rung
      ctx.strokeStyle = 'rgba(245,240,232,0.10)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx + dx, TOP_Y + 8)
      ctx.lineTo(cx + dx, BOT_Y - 8)
      ctx.stroke()

      // is this base inside the active protospacer window?
      const inWindow = i >= active.start && i < active.start + L
      const gi = i - active.start
      let topColor = 'rgba(245,240,232,0.35)'
      if (inWindow && showPairing) {
        topColor = active.key === 'C' ? '#F87171' : GUIDE[gi] === TOP[i] ? LIME : '#F87171'
      } else if (inWindow) {
        topColor = 'rgba(245,240,232,0.7)'
      }

      ctx.fillStyle = topColor
      ctx.fillText(TOP[i], cx + dx, TOP_Y)
      ctx.fillStyle = 'rgba(245,240,232,0.28)'
      ctx.fillText(BOT[i], cx + dx, BOT_Y)
    }

    // PAM highlight on the active site (if there is one).
    if (showPairing && active.hasPam) {
      const px = X0 + (active.start + L) * BASE_W
      ctx.strokeStyle = '#FB923C'
      ctx.lineWidth = 1.4
      ctx.strokeRect(px + 1, TOP_Y - 11, BASE_W * 3 - 2, 22)
      ctx.fillStyle = '#FB923C'
      ctx.textAlign = 'center'
      ctx.font = '9px monospace'
      ctx.fillText('PAM', px + BASE_W * 1.5, TOP_Y - 20)
      ctx.font = '11px monospace'
    }

    // Cas9 body + loaded guide RNA, hovering above the active site.
    const cx = inspectSite
      ? siteCenterX(active)
      : (() => {
          // interpolate from previous site center while travelling
          const i = SEARCH.indexOf(scan.site)
          const from = i === 0 ? X0 : siteCenterX(SEARCH[i - 1])
          const to = siteCenterX(scan.site)
          return from + (to - from) * scan.arrivedFrac
        })()
    const cy = 74
    const clamp = matched && showPairing

    ctx.save()
    ctx.beginPath()
    const bw = L * BASE_W + 12
    const bh = 40
    ctx.fillStyle = clamp ? 'rgba(163,230,53,0.14)' : 'rgba(96,165,250,0.12)'
    ctx.strokeStyle = clamp ? LIME : '#60A5FA'
    ctx.lineWidth = 1.6
    const bx = cx - bw / 2
    ctx.roundRect(bx, cy - bh / 2, bw, bh, 12)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = clamp ? LIME : '#60A5FA'
    ctx.font = '10px monospace'
    ctx.fillText('Cas9', cx, cy - 12)
    ctx.font = '11px monospace'

    // guide RNA letters inside Cas9
    for (let g = 0; g < L; g++) {
      ctx.fillStyle = 'rgba(245,240,232,0.85)'
      ctx.fillText(GUIDE[g], cx - (L / 2 - g - 0.5) * BASE_W, cy + 6)
    }
    ctx.restore()

    // Base-pairing "reading" lines from guide down to the protospacer when parked.
    if (showPairing && active.key !== 'C') {
      for (let g = 0; g < L; g++) {
        const gx = siteCenterX(active) - (L / 2 - g - 0.5) * BASE_W
        const ok = GUIDE[g] === TOP[active.start + g]
        ctx.strokeStyle = ok ? 'rgba(163,230,53,0.5)' : 'rgba(248,113,113,0.6)'
        ctx.setLineDash(ok ? [] : [3, 3])
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(gx, cy + 20)
        ctx.lineTo(gx, TOP_Y - 10)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }

    // Site labels beneath the DNA.
    ctx.font = '9px monospace'
    for (const s of SITES) {
      ctx.fillStyle = s.key === active.key ? LIME : 'rgba(245,240,232,0.4)'
      ctx.fillText(s.label, siteCenterX(s), BOT_Y + 22)
    }
    ctx.font = '11px monospace'

    // Verdict banner.
    ctx.textAlign = 'center'
    if (showPairing) {
      if (isCut && cutFrac > 0.15) {
        ctx.fillStyle = LIME
        ctx.font = 'bold 13px monospace'
        ctx.fillText('✂  DOUBLE-STRAND BREAK', cx, 118)
      } else if (matched) {
        ctx.fillStyle = LIME
        ctx.fillText('match + PAM → clamp', cx, 118)
      } else {
        ctx.fillStyle = '#F87171'
        ctx.fillText(active.hasPam ? 'mismatch → release' : 'no PAM → release', cx, 118)
      }
      ctx.font = '11px monospace'
    }
  }, [active, showPairing, isCut, cutFrac, matched, inspectSite, scan])

  useEffect(() => {
    draw()
  }, [draw, triggered])

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(animRef.current)
      return
    }
    const loop = () => {
      setTick(prev => {
        const next = prev + 1
        if (next >= T_MAX) {
          setRunning(false)
          return T_MAX
        }
        return next
      })
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  const play = () => {
    setInspect(null)
    if (tick >= T_MAX) setTick(0)
    setRunning(true)
  }
  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setInspect(null)
    setTick(0)
  }
  const pickSite = (key: string) => {
    setRunning(false)
    setInspect(key)
  }

  return (
    <div className="animation-block" ref={ref}>
      <canvas
          role="img"
          aria-label="Animated diagram: CRISPR targeting. Values are reported below the diagram."
        ref={canvasRef}
        width={W}
        height={H}
        className="w-full rounded-lg"
        style={{ background: 'var(--color-canvas)', aspectRatio: `${W} / ${H}` }}
      />
      <div className="mt-3 px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          site <span style={{ color: LIME }}>{active.label}</span>
        </span>
        <span>
          guide match{' '}
          <span style={{ color: active.match === L ? LIME : '#F87171' }}>
            {active.match}/{L}
          </span>
        </span>
        <span>
          PAM{' '}
          <span style={{ color: active.hasPam ? '#FB923C' : '#F87171' }}>
            {active.hasPam ? active.pam : 'none'}
          </span>
        </span>
        <span>
          verdict{' '}
          <span style={{ color: matched ? LIME : '#F87171' }}>{matched ? 'CUT' : 'reject'}</span>
        </span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={play}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> Play
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <span className="text-xs text-text-muted">inspect:</span>
        {SITES.map(s => (
          <button
            key={s.key}
            onClick={() => pickSite(s.key)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-surface border border-border text-text-secondary"
            style={inspect === s.key ? { borderColor: LIME, color: LIME } : undefined}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
