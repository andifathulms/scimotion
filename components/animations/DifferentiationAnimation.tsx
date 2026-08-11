'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 680
const H = 440
const BG = '#0F0D0A'

const LIME = '#A3E635' // totipotent
const BLUE = '#60A5FA' // pluripotent
const GOLD = '#F59E0B' // multipotent
const VIOLET = '#A78BFA' // specialized / unipotent
const PINK = '#F472B6' // extra-embryonic (placenta)
const DIM = 'rgba(245,240,232,0.16)' // unreachable / faint
const TEXT = 'rgba(245,240,232,0.85)'
const MUTED = 'rgba(245,240,232,0.5)'

type Potency = 'Totipotent' | 'Pluripotent' | 'Multipotent' | 'Specialized' | 'Extra-embryonic'

type Node = {
  id: string
  parent: string | null
  depth: number
  x: number
  y: number
  label: string
  potency: Potency
  leaf: boolean
}

const COL = [70, 214, 388, 560]

// A fixed potency tree. Depth 0 zygote (totipotent) → depth 1 pluripotent
// (plus the extra-embryonic branch only a totipotent cell can make) → depth 2
// multipotent tissue stem cells → depth 3 fully specialized cells.
const NODES: Node[] = [
  { id: 'zygote', parent: null, depth: 0, x: COL[0], y: 200, label: 'Zygote', potency: 'Totipotent', leaf: false },
  { id: 'placenta', parent: 'zygote', depth: 1, x: COL[1], y: 44, label: 'Placenta (extra-embryonic)', potency: 'Extra-embryonic', leaf: true },
  { id: 'pluri', parent: 'zygote', depth: 1, x: COL[1], y: 232, label: 'Pluripotent cell — ESC / iPSC', potency: 'Pluripotent', leaf: false },
  { id: 'hsc', parent: 'pluri', depth: 2, x: COL[2], y: 96, label: 'Blood stem cell', potency: 'Multipotent', leaf: false },
  { id: 'nsc', parent: 'pluri', depth: 2, x: COL[2], y: 232, label: 'Neural stem cell', potency: 'Multipotent', leaf: false },
  { id: 'msc', parent: 'pluri', depth: 2, x: COL[2], y: 356, label: 'Mesenchymal stem cell', potency: 'Multipotent', leaf: false },
  { id: 'rbc', parent: 'hsc', depth: 3, x: COL[3], y: 44, label: 'Red blood cell', potency: 'Specialized', leaf: true },
  { id: 'wbc', parent: 'hsc', depth: 3, x: COL[3], y: 92, label: 'White blood cell', potency: 'Specialized', leaf: true },
  { id: 'plt', parent: 'hsc', depth: 3, x: COL[3], y: 140, label: 'Platelet', potency: 'Specialized', leaf: true },
  { id: 'neuron', parent: 'nsc', depth: 3, x: COL[3], y: 210, label: 'Neuron', potency: 'Specialized', leaf: true },
  { id: 'glia', parent: 'nsc', depth: 3, x: COL[3], y: 258, label: 'Glial cell', potency: 'Specialized', leaf: true },
  { id: 'bone', parent: 'msc', depth: 3, x: COL[3], y: 332, label: 'Bone cell', potency: 'Specialized', leaf: true },
  { id: 'fat', parent: 'msc', depth: 3, x: COL[3], y: 380, label: 'Fat cell', potency: 'Specialized', leaf: true },
  { id: 'cartilage', parent: 'msc', depth: 3, x: COL[3], y: 428, label: 'Cartilage cell', potency: 'Specialized', leaf: true },
]

const BY_ID: Record<string, Node> = Object.fromEntries(NODES.map(n => [n.id, n]))

const POTENCY_COLOR: Record<Potency, string> = {
  Totipotent: LIME,
  Pluripotent: BLUE,
  Multipotent: GOLD,
  Specialized: VIOLET,
  'Extra-embryonic': PINK,
}

type StartKey = 'zygote' | 'pluri' | 'hsc'

const STARTS: { key: StartKey; label: string; potency: Potency }[] = [
  { key: 'zygote', label: 'Totipotent (zygote)', potency: 'Totipotent' },
  { key: 'pluri', label: 'Pluripotent (ESC / iPSC)', potency: 'Pluripotent' },
  { key: 'hsc', label: 'Multipotent (blood)', potency: 'Multipotent' },
]

// Is `id` the start node or a descendant of it?
function isReachable(id: string, start: string): boolean {
  let cur: string | null = id
  while (cur) {
    if (cur === start) return true
    cur = BY_ID[cur].parent
  }
  return false
}

function reachableNodes(start: string): Node[] {
  return NODES.filter(n => isReachable(n.id, start))
}

function maxRelDepth(start: string): number {
  const base = BY_ID[start].depth
  return Math.max(...reachableNodes(start).map(n => n.depth - base))
}

function reachableFates(start: string): number {
  return reachableNodes(start).filter(n => n.leaf).length
}

export function DifferentiationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const [start, setStart] = useState<StartKey>('zygote')
  const [revealDepth, setRevealDepth] = useState(0)
  const [prog, setProg] = useState(0)
  const [running, setRunning] = useState(false)

  const stateRef = useRef({ start, revealDepth, prog, running })
  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      reducedRef.current = reduced
      if (reduced) {
        setRevealDepth(maxRelDepth(stateRef.current.start))
        setProg(1)
        return
      }
      setRunning(true)
    },
  })

  useEffect(() => {
    stateRef.current = { start, revealDepth, prog, running }
  }, [start, revealDepth, prog, running])
  const reducedRef = useRef(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)
    ctx.textBaseline = 'middle'

    const base = BY_ID[start].depth

    // How lit is a node? -1 = unreachable, 0..1 = fade of the current frontier,
    // 1 = fully committed and revealed.
    const litOf = (n: Node): number => {
      if (!isReachable(n.id, start)) return -1
      const rel = n.depth - base
      if (rel < revealDepth) return 1
      if (rel === revealDepth) return prog
      return 0
    }

    // ---- Title -------------------------------------------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = LIME
    ctx.fillText('POTENCY IS A HIERARCHY — a cell can only become what lies below it', 14, 16)

    // ---- Edges -------------------------------------------------------------
    for (const n of NODES) {
      if (!n.parent) continue
      const p = BY_ID[n.parent]
      const lit = Math.min(Math.max(litOf(n), 0), 1)
      const reachable = isReachable(n.id, start)
      ctx.beginPath()
      ctx.moveTo(p.x + 12, p.y)
      const midx = (p.x + n.x) / 2
      ctx.bezierCurveTo(midx, p.y, midx, n.y, n.x - 12, n.y)
      if (!reachable) {
        ctx.strokeStyle = DIM
        ctx.lineWidth = 1
      } else {
        ctx.strokeStyle = `rgba(163,230,53,${(0.12 + 0.5 * lit).toFixed(3)})`
        ctx.lineWidth = 1 + 1.4 * lit
      }
      ctx.stroke()
    }

    // ---- Nodes -------------------------------------------------------------
    for (const n of NODES) {
      const lit = litOf(n)
      const color = POTENCY_COLOR[n.potency]
      const r = n.leaf ? 9 : 13
      if (lit < 0) {
        // Unreachable from the chosen start — drawn faint to show the option
        // was foreclosed. This is how the fate menu NARROWS.
        ctx.beginPath()
        ctx.fillStyle = 'rgba(245,240,232,0.05)'
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = DIM
        ctx.lineWidth = 1
        ctx.stroke()
      } else {
        const a = Math.max(0.12, lit)
        ctx.globalAlpha = a
        ctx.beginPath()
        ctx.fillStyle = color
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fill()
        if (n.id === start) {
          ctx.globalAlpha = 1
          ctx.strokeStyle = '#FFFFFF'
          ctx.lineWidth = 2
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      // Labels
      ctx.fillStyle = lit < 0 ? DIM : lit > 0.3 ? TEXT : MUTED
      ctx.font = '9px monospace'
      if (n.depth === 3) {
        ctx.textAlign = 'left'
        ctx.fillText(n.label, n.x + 14, n.y)
      } else {
        ctx.textAlign = 'center'
        ctx.fillText(n.label, n.x, n.y + (n.leaf ? 18 : 22))
        ctx.fillStyle = lit < 0 ? DIM : color
        ctx.font = '8px monospace'
        ctx.fillText(n.potency, n.x, n.y + (n.leaf ? 30 : 34))
      }
    }

    // ---- Potency legend (bottom-left) -------------------------------------
    ctx.textAlign = 'left'
    ctx.font = '8px monospace'
    const legend: [string, Potency][] = [
      ['Totipotent → whole organism + placenta', 'Totipotent'],
      ['Pluripotent → any body cell', 'Pluripotent'],
      ['Multipotent → one tissue family', 'Multipotent'],
      ['Specialized → committed, one job', 'Specialized'],
    ]
    let ly = H - 34
    for (const [txt, pot] of legend) {
      ctx.fillStyle = POTENCY_COLOR[pot]
      ctx.beginPath()
      ctx.arc(20, ly, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = MUTED
      ctx.fillText(txt, 30, ly)
      ly += 12
    }
  }, [start, revealDepth, prog])

  useEffect(() => {
    draw()
  }, [draw])

  // Auto-run: fade in the frontier level, then commit to the next one.
  useEffect(() => {
    if (!running || !visible) return
    const loop = () => {
      setProg(prev => {
        const next = prev + 0.035
        if (next >= 1) {
          const s = stateRef.current
          const maxRel = maxRelDepth(s.start)
          if (s.revealDepth >= maxRel) {
            setRunning(false)
            return 1
          }
          setRevealDepth(d => d + 1)
          return 0
        }
        return next
      })
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, visible])


  const maxRel = maxRelDepth(start)
  const atEnd = revealDepth >= maxRel && prog >= 1

  const pickStart = (key: StartKey) => {
    cancelAnimationFrame(rafRef.current)
    setStart(key)
    setRevealDepth(0)
    setProg(0)
    if (reducedRef.current) {
      setRevealDepth(maxRelDepth(key))
      setProg(1)
      setRunning(false)
    } else {
      setRunning(true)
    }
  }

  const step = () => {
    setRunning(false)
    if (prog < 1) {
      setProg(1)
      return
    }
    if (revealDepth < maxRel) {
      setRevealDepth(d => d + 1)
      setProg(0)
    }
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    setStart('zygote')
    setRevealDepth(0)
    setProg(0)
    triggerReset()
  }

  const startInfo = STARTS.find(s => s.key === start)!
  // Fully-committed fates still reachable once the wave finishes.
  const fates = reachableFates(start)
  const committedNow = Math.min(revealDepth, maxRel)
  const frontierPotency: string =
    committedNow <= 0
      ? startInfo.potency
      : reachableNodes(start)
          .filter(n => n.depth - BY_ID[start].depth === committedNow)
          .map(n => n.potency)[0] ?? startInfo.potency

  return (
    <div className="animation-block" ref={ref}>
      <div
        className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1"
        aria-live="polite"
      >
        <span>
          start:{' '}
          <span style={{ color: POTENCY_COLOR[startInfo.potency] }}>{startInfo.potency}</span>
        </span>
        <span>committed to: {frontierPotency}</span>
        <span>
          reachable fates: <span style={{ color: LIME }}>{fates}</span> of {reachableFates('zygote')}
        </span>
        <span className="text-text-muted">{atEnd ? 'fully specialized' : 'differentiating…'}</span>
      </div>

      <div className="my-3">
        <canvas
          role="img"
          aria-label="Animated diagram: Differentiation. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: BG }}
        />
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (atEnd) {
              setRevealDepth(0)
              setProg(0)
            }
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> {atEnd ? 'Again' : 'Play'}
            </>
          )}
        </button>
        <button
          onClick={step}
          disabled={atEnd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs font-medium hover:text-text-primary transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <ChevronRight size={12} /> Step
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs font-medium hover:text-text-primary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>

        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          <span className="text-xs text-text-muted">start from:</span>
          {STARTS.map(s => (
            <button
              key={s.key}
              onClick={() => pickStart(s.key)}
              className="px-2 py-1 rounded-md text-xs font-medium border transition-colors"
              style={
                start === s.key
                  ? { background: POTENCY_COLOR[s.potency], color: BG, borderColor: POTENCY_COLOR[s.potency] }
                  : { borderColor: 'var(--border, rgba(255,255,255,0.12))' }
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
