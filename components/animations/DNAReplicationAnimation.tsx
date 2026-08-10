'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 300

const AXIS = 150            // duplex centre line
const OPEN = 52             // how far apart the separated templates sit
const FLARE = 64            // px over which the fork opens up
const NASCENT = 13          // offset of a new strand from its template

const FORK_START = 100
const FORK_END = 556
const FORK_SPEED = 0.85     // px per frame
const STEP_PX = 24          // px per manual step

const FRAG = 70             // px per Okazaki fragment
const NT_PER_PX = 14        // px -> nucleotides, so one fragment ≈ 1000 nt (E. coli scale)
const LIGATE_LAG = 1.55     // fragments behind the fork before the nick is sealed

const C_LEAD = '#60A5FA'    // blue  — leading strand
const C_LAG = '#F472B6'     // pink  — lagging strand (Okazaki fragments)
const C_PRIMER = '#F59E0B'  // gold  — RNA primer / helicase
const C_LIG = '#10B981'     // green — ligated backbone
const C_POL = '#A78BFA'     // violet — polymerase
const DIM = 'rgba(245,240,232,0.4)'
const FAINT = 'rgba(245,240,232,0.16)'

const N_FRAG = Math.ceil((FORK_END - FORK_START) / FRAG)

// Right-hand (fork-proximal) end of Okazaki fragment k. The primer is laid here
// when the fork arrives, and the fragment is then extended *backwards*, to the left.
function fragEnd(k: number): number {
  return FORK_START + (k + 1) * FRAG
}

// How much of the parental duplex has been pulled apart at x, 0 (closed) .. 1 (open).
function openness(x: number, fork: number): number {
  if (x >= fork) return 0
  return Math.min(1, (fork - x) / FLARE)
}

function topY(x: number, fork: number): number {
  return AXIS - OPEN * openness(x, fork)
}

function bottomY(x: number, fork: number): number {
  return AXIS + OPEN * openness(x, fork)
}

type Phase = 'priming' | 'extending' | 'ligating' | 'done'

export function DNAReplicationAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setFork(FORK_END); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [fork, setFork] = useState(FORK_START)

  const active = Math.min(N_FRAG - 1, Math.floor((fork - FORK_START) / FRAG))
  const fillFrac = Math.min(1, Math.max(0, (fork - fragEnd(active)) / FRAG))
  const ligated = Math.max(0, Math.min(N_FRAG, Math.floor((fork - FORK_START) / FRAG - LIGATE_LAG)))
  const started = Math.max(1, Math.min(N_FRAG, Math.floor((fork - FORK_START) / FRAG) + 1))

  const phase: Phase =
    fork >= FORK_END ? 'done'
    : fillFrac < 0.12 ? 'priming'
    : fillFrac > 0.92 ? 'ligating'
    : 'extending'

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    // --- Parental duplex still wound, ahead of the fork ---------------------
    const twist = fork * 0.55
    const strand = (sign: number) => {
      ctx.beginPath()
      ctx.strokeStyle = FAINT
      ctx.lineWidth = 2
      let first = true
      for (let x = fork; x <= W - 14; x += 3) {
        const y = AXIS + sign * 20 * Math.sin((x - twist) / 15)
        if (first) { ctx.moveTo(x, y); first = false } else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    strand(1)
    strand(-1)
    for (let x = fork + 4; x <= W - 16; x += 9) {
      const s = Math.sin((x - twist) / 15)
      ctx.beginPath()
      ctx.strokeStyle = `rgba(245,240,232,${(0.05 + 0.12 * Math.abs(s)).toFixed(3)})`
      ctx.lineWidth = 1.2
      ctx.moveTo(x, AXIS + 20 * s)
      ctx.lineTo(x, AXIS - 20 * s)
      ctx.stroke()
    }
    ctx.fillStyle = DIM
    ctx.textAlign = 'center'
    ctx.fillText('parental duplex (still wound)', Math.min(W - 90, fork + 96), 34)
    ctx.textAlign = 'left'

    // --- Separated template strands ----------------------------------------
    const template = (fn: (x: number) => number, label: string, labelY: number) => {
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.5)'
      ctx.lineWidth = 2
      let first = true
      for (let x = 20; x <= fork; x += 2) {
        const y = fn(x)
        if (first) { ctx.moveTo(x, y); first = false } else ctx.lineTo(x, y)
      }
      ctx.stroke()
      // Base ticks pointing into the open space.
      const dir = labelY < AXIS ? 1 : -1
      for (let x = 26; x < fork - 6; x += 12) {
        const o = openness(x, fork)
        if (o < 0.25) continue
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(245,240,232,0.28)'
        ctx.lineWidth = 1
        ctx.moveTo(x, fn(x))
        ctx.lineTo(x, fn(x) + dir * 5)
        ctx.stroke()
      }
      ctx.fillStyle = DIM
      ctx.fillText(label, 22, labelY)
    }
    template(x => topY(x, fork), "3' ──────────────► 5'   template", AXIS - OPEN - 16)
    template(x => bottomY(x, fork), "5' ──────────────► 3'   template", AXIS + OPEN + 22)

    // --- Helicase at the fork ----------------------------------------------
    ctx.beginPath()
    ctx.fillStyle = `${C_PRIMER}33`
    ctx.strokeStyle = C_PRIMER
    ctx.lineWidth = 1.5
    ctx.moveTo(fork + 14, AXIS)
    ctx.lineTo(fork - 10, AXIS - 15)
    ctx.lineTo(fork - 10, AXIS + 15)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = C_PRIMER
    ctx.textAlign = 'center'
    ctx.fillText('helicase', fork + 2, AXIS + 30)
    ctx.textAlign = 'left'

    // --- Leading strand: one continuous run chasing the fork ----------------
    const leadTo = fork - 14
    if (leadTo > 24) {
      ctx.beginPath()
      ctx.strokeStyle = C_LEAD
      ctx.lineWidth = 3
      let first = true
      for (let x = 24; x <= leadTo; x += 2) {
        const y = topY(x, fork) + NASCENT
        if (first) { ctx.moveTo(x, y); first = false } else ctx.lineTo(x, y)
      }
      ctx.stroke()
      // Single primer, right at the origin.
      ctx.beginPath()
      ctx.strokeStyle = C_PRIMER
      ctx.lineWidth = 3
      ctx.moveTo(24, topY(24, fork) + NASCENT)
      ctx.lineTo(38, topY(38, fork) + NASCENT)
      ctx.stroke()
      // Polymerase riding the 3' end.
      ctx.beginPath()
      ctx.arc(leadTo, topY(leadTo, fork) + NASCENT, 6, 0, Math.PI * 2)
      ctx.fillStyle = `${C_POL}44`
      ctx.fill()
      ctx.strokeStyle = C_POL
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = C_LEAD
      ctx.fillText('leading — synthesised continuously, 5′→3′ toward the fork', 26, AXIS - OPEN + 32)
    }

    // --- Lagging strand: discrete Okazaki fragments --------------------------
    for (let k = 0; k <= active; k++) {
      const right = fragEnd(k)
      if (right > fork) continue
      const frac = k < active ? 1 : fillFrac
      const left = right - FRAG * frac
      const isLig = k < ligated
      const y = (x: number) => bottomY(x, fork) - NASCENT

      ctx.beginPath()
      ctx.strokeStyle = isLig ? C_LIG : C_LAG
      ctx.lineWidth = 3
      let first = true
      for (let x = left; x <= right; x += 2) {
        if (first) { ctx.moveTo(x, y(x)); first = false } else ctx.lineTo(x, y(x))
      }
      ctx.stroke()

      // RNA primer sits at the fork-proximal end of each fragment.
      if (!isLig) {
        ctx.beginPath()
        ctx.strokeStyle = C_PRIMER
        ctx.lineWidth = 3
        ctx.moveTo(right - 11, y(right - 11))
        ctx.lineTo(right, y(right))
        ctx.stroke()
      }

      // Unsealed nick between this fragment and the previous one.
      if (!isLig && k > 0) {
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(245,240,232,0.45)'
        ctx.lineWidth = 1
        ctx.moveTo(right - FRAG, y(right - FRAG) - 7)
        ctx.lineTo(right - FRAG, y(right - FRAG) + 7)
        ctx.stroke()
      }

      // Polymerase on the growing 3' end of the active fragment, moving left.
      if (k === active && frac > 0.05 && frac < 1) {
        ctx.beginPath()
        ctx.arc(left, y(left), 6, 0, Math.PI * 2)
        ctx.fillStyle = `${C_POL}44`
        ctx.fill()
        ctx.strokeStyle = C_POL
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.beginPath()
        ctx.strokeStyle = C_POL
        ctx.moveTo(left - 4, y(left) + 14)
        ctx.lineTo(left - 14, y(left) + 14)
        ctx.lineTo(left - 10, y(left) + 10)
        ctx.moveTo(left - 14, y(left) + 14)
        ctx.lineTo(left - 10, y(left) + 18)
        ctx.stroke()
      }
    }

    // Ligase, sitting on the nick it is about to seal.
    if (ligated > 0 && ligated < N_FRAG) {
      const nick = fragEnd(ligated - 1)
      const ny = bottomY(nick, fork) - NASCENT
      ctx.beginPath()
      ctx.arc(nick, ny, 7, 0, Math.PI * 2)
      ctx.fillStyle = `${C_LIG}33`
      ctx.fill()
      ctx.strokeStyle = C_LIG
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = C_LIG
      ctx.textAlign = 'center'
      ctx.fillText('ligase', nick, ny + 20)
      ctx.textAlign = 'left'
    }

    ctx.fillStyle = C_LAG
    ctx.fillText('lagging — restarted backwards every ≈1,000 nt', 26, AXIS + OPEN - 24)

    // --- Fork position readout ---------------------------------------------
    ctx.fillStyle = DIM
    ctx.fillText(`fork →  ${Math.round((fork - FORK_START) * NT_PER_PX).toLocaleString()} bp unwound`, 14, H - 10)
  }, [fork, active, fillFrac, ligated])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }
    const loop = () => {
      setFork(prev => {
        const next = prev + FORK_SPEED
        if (next >= FORK_END) { setRunning(false); return FORK_END }
        return next
      })
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  const step = () => {
    setRunning(false)
    setFork(prev => Math.min(FORK_END, prev + STEP_PX))
  }

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setFork(FORK_START)
  }

  const PHASE_LABEL: Record<Phase, string> = {
    priming: 'Primase lays a fresh RNA primer at the fork',
    extending: 'Lagging polymerase extends backwards, away from the fork',
    ligating: 'Fragment meets the last one — ligase seals the nick',
    done: 'Fork complete — one continuous strand, one stitched strand',
  }
  const badge = phase === 'done' ? C_LIG : phase === 'priming' ? C_PRIMER : C_LAG

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The Replication Fork</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: The Replication Fork. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { if (fork >= FORK_END) setFork(FORK_START); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-pink text-bg-base text-xs font-medium hover:bg-accent-pink/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={step}
          disabled={fork >= FORK_END}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs font-medium hover:text-text-primary transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <ChevronRight size={12} /> Step
        </button>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={{ color: badge, borderColor: `${badge}30`, background: `${badge}10` }}
        >
          {PHASE_LABEL[phase]}
        </span>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          <span style={{ color: C_LEAD }}>leading 1 piece</span> ·{' '}
          <span style={{ color: C_LAG }}>{started} fragment{started === 1 ? '' : 's'}</span> ·{' '}
          <span style={{ color: C_LIG }}>{ligated} sealed</span>
        </WidgetStatus>
      </div>
    </div>
  )
}
