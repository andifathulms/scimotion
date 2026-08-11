'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const LIME = '#A3E635'   // dominant phenotype (primary series)
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const TEXT = 'rgba(245,240,232,0.85)'
const DIM = 'rgba(245,240,232,0.45)'
const FAINT = 'rgba(255,245,235,0.10)'
const BG = '#0F0D0A'

type Mode = 'mono' | 'di'
type GeneA = 'AA' | 'Aa' | 'aa'
type GeneB = 'BB' | 'Bb' | 'bb'

const A_OPTIONS: GeneA[] = ['AA', 'Aa', 'aa']
const B_OPTIONS: GeneB[] = ['BB', 'Bb', 'bb']

// Class metadata per mode. Order chosen so the expected ratios read 3:1 and 9:3:3:1.
const MONO_CLASSES = [
  { label: 'A–  purple', color: LIME },
  { label: 'aa  white', color: GOLD },
]
const DI_CLASSES = [
  { label: 'A–B–  purple, tall', color: LIME },
  { label: 'A–bb  purple, short', color: BLUE },
  { label: 'aaB–  white, tall', color: VIOLET },
  { label: 'aabb  white, short', color: PINK },
]

// Combine one allele from each parent for a single gene, dominant letter first.
function combine(x: string, y: string): string {
  const dom = x.toUpperCase()
  const rec = x.toLowerCase()
  const n = (x === dom ? 1 : 0) + (y === dom ? 1 : 0)
  if (n === 2) return dom + dom
  if (n === 1) return dom + rec
  return rec + rec
}

// The gametes a parent can make. For a single gene that is just its two alleles;
// for two genes it is every combination of one allele from each (independent assortment).
function gametes(mode: Mode, a: GeneA, b: GeneB): string[] {
  if (mode === 'mono') return [a[0], a[1]]
  const out: string[] = []
  for (const ai of [a[0], a[1]]) for (const bi of [b[0], b[1]]) out.push(ai + bi)
  return out
}

function classifyMono(gt: string): number {
  return gt.includes('A') ? 0 : 1
}
function classifyDi(gt: string): number {
  const domA = gt.slice(0, 2).includes('A')
  const domB = gt.slice(2).includes('B')
  return domA ? (domB ? 0 : 1) : domB ? 2 : 3
}

// Offspring genotype for the cell where parent-1 gamete gi meets parent-2 gamete gj.
function offspring(mode: Mode, gi: string, gj: string): string {
  if (mode === 'mono') return combine(gi, gj)
  return combine(gi[0], gj[0]) + combine(gi[1], gj[1])
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

type Counts = { pheno: number[]; geno: Record<string, number>; total: number }
function freshCounts(mode: Mode): Counts {
  return { pheno: new Array(mode === 'mono' ? 2 : 4).fill(0), geno: { AA: 0, Aa: 0, aa: 0 }, total: 0 }
}

const MAX_OFFSPRING = 2000
const BATCH = 5
const FRAMES_PER_BATCH = 2

export function PunnettSquareAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const frameRef = useRef(0)
  const countsRef = useRef<Counts>(freshCounts('mono'))

  const [mode, setMode] = useState<Mode>('mono')
  const [p1A, setP1A] = useState<GeneA>('Aa')
  const [p2A, setP2A] = useState<GeneA>('Aa')
  const [p1B, setP1B] = useState<GeneB>('Bb')
  const [p2B, setP2B] = useState<GeneB>('Bb')
  const [running, setRunning] = useState(false)
  const [tick, setTick] = useState(0)

  const paramsRef = useRef({ mode, p1A, p2A, p1B, p2B })
  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // No motion: simulate a solid sample in one shot so the ratio is already visible.
        const cur = paramsRef.current
        const g1 = gametes(cur.mode, cur.p1A, cur.p1B)
        const g2 = gametes(cur.mode, cur.p2A, cur.p2B)
        const classify = cur.mode === 'mono' ? classifyMono : classifyDi
        const c = countsRef.current
        while (c.total < 400) {
          const gi = g1[Math.floor(Math.random() * g1.length)]
          const gj = g2[Math.floor(Math.random() * g2.length)]
          const gt = offspring(cur.mode, gi, gj)
          c.pheno[classify(gt)]++
          if (cur.mode === 'mono') c.geno[gt]++
          c.total++
        }
        setTick(t => t + 1)
        return
      }
      setRunning(true)
    },
  })

  useEffect(() => {
    paramsRef.current = { mode, p1A, p2A, p1B, p2B }
    // Any change of the cross invalidates the tally — start counting over.
    countsRef.current = freshCounts(mode)
    frameRef.current = 0
    setTick(t => t + 1)
  }, [mode, p1A, p2A, p1B, p2B])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'middle'

    const g1 = gametes(mode, p1A, p1B)
    const g2 = gametes(mode, p2A, p2B)
    const n = g1.length
    const classes = mode === 'mono' ? MONO_CLASSES : DI_CLASSES
    const classify = mode === 'mono' ? classifyMono : classifyDi

    // Expected phenotype counts straight from the grid (equal-weight cells).
    const expected = new Array(classes.length).fill(0)
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) expected[classify(offspring(mode, g1[i], g2[j]))]++

    // ---- Header ------------------------------------------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = LIME
    ctx.fillText(mode === 'mono' ? 'MONOHYBRID CROSS · one gene' : 'DIHYBRID CROSS · two genes, independent assortment', 14, 16)
    ctx.font = '10px monospace'
    ctx.fillStyle = DIM
    const p1lab = mode === 'mono' ? p1A : `${p1A}${p1B}`
    const p2lab = mode === 'mono' ? p2A : `${p2A}${p2B}`
    ctx.fillText(`Parent 1 (${p1lab})  ×  Parent 2 (${p2lab})`, 14, 30)

    // ---- Punnett square ----------------------------------------------------
    const cell = mode === 'mono' ? 62 : 40
    const GX = 96
    const GY = 78
    ctx.textAlign = 'center'

    // Column headers = parent-2 gametes (top), row headers = parent-1 gametes (left).
    ctx.font = `bold ${mode === 'mono' ? 14 : 11}px monospace`
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = BLUE
      ctx.fillText(g2[j], GX + j * cell + cell / 2, GY - cell / 2)
    }
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = GOLD
      ctx.fillText(g1[i], GX - cell / 2, GY + i * cell + cell / 2)
    }
    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('P2 gametes →', GX + (n * cell) / 2, GY - cell - 8)
    ctx.save()
    ctx.translate(GX - cell - 10, GY + (n * cell) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('P1 gametes →', 0, 0)
    ctx.restore()

    // Cells, tinted by the offspring's phenotype class so the ratio is visible.
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const gt = offspring(mode, g1[i], g2[j])
        const col = classes[classify(gt)].color
        const x = GX + j * cell
        const y = GY + i * cell
        ctx.fillStyle = `${col}26`
        ctx.fillRect(x, y, cell - 2, cell - 2)
        ctx.strokeStyle = FAINT
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, y + 0.5, cell - 3, cell - 3)
        ctx.fillStyle = TEXT
        ctx.font = `${mode === 'mono' ? 14 : 11}px monospace`
        ctx.fillText(gt, x + (cell - 2) / 2, y + (cell - 2) / 2)
      }
    }

    // Expected ratio caption under the grid.
    const g = expected.reduce((acc, v) => gcd(acc, v), 0) || 1
    const ratio = expected.map(v => v / g).join(' : ')
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = DIM
    ctx.fillText('Expected phenotype ratio', GX, GY + n * cell + 16)
    ctx.fillStyle = LIME
    ctx.font = 'bold 12px monospace'
    ctx.fillText(ratio, GX, GY + n * cell + 32)
    if (mode === 'mono') {
      const gg = [1, 2, 1]
      ctx.fillStyle = DIM
      ctx.font = '9px monospace'
      ctx.fillText(`genotype  AA : Aa : aa  =  ${gg.join(' : ')}`, GX, GY + n * cell + 48)
    }

    // ---- Simulation panel (right) -----------------------------------------
    const c = countsRef.current
    const PX = 358
    let PY = 56
    ctx.textAlign = 'left'
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = TEXT
    ctx.fillText(`SIMULATED OFFSPRING  n = ${c.total}`, PX, PY)
    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('each child draws one gamete from each parent at random', PX, PY + 14)
    PY += 34

    const barMax = 176
    const rowH = mode === 'mono' ? 40 : 30
    for (let k = 0; k < classes.length; k++) {
      const y = PY + k * rowH
      const obs = c.total > 0 ? c.pheno[k] / c.total : 0
      const exp = expected[k] / (n * n)
      // label
      ctx.fillStyle = classes[k].color
      ctx.font = '9px monospace'
      ctx.fillText(classes[k].label, PX, y)
      // bar track
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      ctx.fillRect(PX, y + 6, barMax, 10)
      // observed fill
      ctx.fillStyle = classes[k].color
      ctx.fillRect(PX, y + 6, barMax * obs, 10)
      // expected marker
      const ex = PX + barMax * exp
      ctx.strokeStyle = 'rgba(245,240,232,0.85)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(ex, y + 3)
      ctx.lineTo(ex, y + 19)
      ctx.stroke()
      // counts
      ctx.fillStyle = DIM
      ctx.font = '9px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(`${c.pheno[k]}  (${(obs * 100).toFixed(0)}%)`, PX + barMax, y)
      ctx.textAlign = 'left'
    }

    // Legend for the expected marker.
    const legendY = PY + classes.length * rowH + 4
    ctx.strokeStyle = 'rgba(245,240,232,0.85)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(PX, legendY)
    ctx.lineTo(PX, legendY + 10)
    ctx.stroke()
    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    ctx.fillText('= Mendelian expectation', PX + 8, legendY + 5)

    if (mode === 'mono' && c.total > 0) {
      ctx.fillStyle = DIM
      ctx.fillText(
        `observed genotypes  ${c.geno.AA} : ${c.geno.Aa} : ${c.geno.aa}`,
        PX,
        legendY + 22,
      )
    }
  }, [mode, p1A, p2A, p1B, p2B])

  useEffect(() => {
    draw()
  }, [draw, tick])

  // Simulation loop: add offspring in small batches until the cap is reached.
  useEffect(() => {
    if (!running || !visible) return
    const loop = () => {
      frameRef.current += 1
      if (frameRef.current % FRAMES_PER_BATCH === 0) {
        const cur = paramsRef.current
        const g1 = gametes(cur.mode, cur.p1A, cur.p1B)
        const g2 = gametes(cur.mode, cur.p2A, cur.p2B)
        const classify = cur.mode === 'mono' ? classifyMono : classifyDi
        const c = countsRef.current
        for (let b = 0; b < BATCH && c.total < MAX_OFFSPRING; b++) {
          const gi = g1[Math.floor(Math.random() * g1.length)]
          const gj = g2[Math.floor(Math.random() * g2.length)]
          const gt = offspring(cur.mode, gi, gj)
          c.pheno[classify(gt)]++
          if (cur.mode === 'mono') c.geno[gt]++
          c.total++
        }
        if (c.total >= MAX_OFFSPRING) {
          setRunning(false)
          return
        }
      }
      setTick(t => t + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, visible])


  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    countsRef.current = freshCounts(paramsRef.current.mode)
    frameRef.current = 0
    triggerReset()
    setTick(t => t + 1)
  }

  const done = countsRef.current.total >= MAX_OFFSPRING

  const selectClass =
    'bg-transparent border border-border rounded px-1.5 py-1 text-xs font-mono text-text-secondary focus:border-accent-lime'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Punnett square</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Punnett square. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: BG }} />
      </div>
      <div className="animation-controls flex-wrap gap-x-4 gap-y-2">
        <button
          onClick={() => {
            if (done) {
              countsRef.current = freshCounts(paramsRef.current.mode)
              frameRef.current = 0
            }
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-lime text-bg-base text-xs font-medium hover:bg-accent-lime/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> {done ? 'Run again' : 'Breed offspring'}</>}
        </button>
        <div className="flex items-center gap-1 text-xs">
          <button
            onClick={() => setMode('mono')}
            className={`px-2 py-1 rounded-l-lg border text-xs transition-colors ${mode === 'mono' ? 'bg-accent-lime text-bg-base border-accent-lime' : 'border-border text-text-muted'}`}
          >
            Monohybrid
          </button>
          <button
            onClick={() => setMode('di')}
            className={`px-2 py-1 rounded-r-lg border text-xs -ml-px transition-colors ${mode === 'di' ? 'bg-accent-lime text-bg-base border-accent-lime' : 'border-border text-text-muted'}`}
          >
            Dihybrid
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          <span>Parent 1</span>
          <select value={p1A} onChange={e => setP1A(e.target.value as GeneA)} className={selectClass}>
            {A_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          {mode === 'di' && (
            <select value={p1B} onChange={e => setP1B(e.target.value as GeneB)} className={selectClass}>
              {B_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
        </label>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          <span>Parent 2</span>
          <select value={p2A} onChange={e => setP2A(e.target.value as GeneA)} className={selectClass}>
            {A_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          {mode === 'di' && (
            <select value={p2B} onChange={e => setP2B(e.target.value as GeneB)} className={selectClass}>
              {B_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
        </label>
      </div>
    </div>
  )
}
