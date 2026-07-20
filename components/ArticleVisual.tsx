import { Children, cloneElement, isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'

type Topic = 'Mathematics' | 'Physics' | 'Computer Science' | 'Medicine'

const ACCENT: Record<Topic, string> = {
  Mathematics: '#A78BFA',
  Physics: '#10B981',
  'Computer Science': '#60A5FA',
  Medicine: '#F472B6',
}

const BG = '#1A1712'
const GOLD = '#F59E0B'
const MUTE = 'rgba(245,240,232,0.35)'
const FAINT = 'rgba(255,245,235,0.08)'

// These visuals are server-rendered, and several derive coordinates from
// Math.sin / Math.exp / Math.pow. Those functions are NOT required by the spec to
// be correctly rounded, so Node and the browser can disagree in the final bits —
// which React reports as a hydration mismatch on the emitted attribute.
//
// Rather than trusting every visual (and every future one) to round by hand, we
// normalize centrally: walk the rendered tree once and snap every non-integer
// numeric attribute, plus the numbers inside `points` / `d` path strings, to 2dp.
// Sub-pixel precision is meaningless in a 300x120 viewBox, and 2dp is far coarser
// than any float discrepancy, so this is lossless in practice and kills the whole
// class of bug at the source.
const PRECISION = 100
const snap = (v: number) => Math.round(v * PRECISION) / PRECISION
const snapNumbersIn = (s: string) => s.replace(/-?\d*\.\d+/g, m => String(snap(parseFloat(m))))

const COORD_STRING_PROPS = new Set(['points', 'd', 'strokeDasharray', 'transform'])

function normalize(node: ReactNode): ReactNode {
  return Children.map(node, child => {
    if (!isValidElement(child)) return child
    const el = child as ReactElement<Record<string, unknown>>
    const patch: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(el.props)) {
      if (key === 'children') continue
      if (typeof value === 'number') {
        if (!Number.isInteger(value)) patch[key] = snap(value)
      } else if (typeof value === 'string' && COORD_STRING_PROPS.has(key)) {
        const snapped = snapNumbersIn(value)
        if (snapped !== value) patch[key] = snapped
      }
    }

    const kids = el.props.children as ReactNode | undefined
    return kids === undefined
      ? cloneElement(el, patch)
      : cloneElement(el, patch, normalize(kids))
  })
}

// Shared faint background grid for every visual.
function Grid() {
  const lines: ReactNode[] = []
  for (let x = 30; x < 300; x += 30) lines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={120} stroke={FAINT} strokeWidth={0.5} />)
  for (let y = 30; y < 120; y += 30) lines.push(<line key={`y${y}`} x1={0} y1={y} x2={300} y2={y} stroke={FAINT} strokeWidth={0.5} />)
  return <g>{lines}</g>
}

// Each visual draws into a 300x120 viewBox. `c` is the topic accent.
const visuals: Record<string, (c: string) => ReactNode> = {
  'eulers-formula': c => {
    const cx = 150, cy = 60, r = 42, a = -0.9
    const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a)
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth={1.5} />
        <line x1={cx - 60} y1={cy} x2={cx + 60} y2={cy} stroke={MUTE} strokeWidth={0.75} />
        <line x1={cx} y1={cy - 55} x2={cx} y2={cy + 55} stroke={MUTE} strokeWidth={0.75} />
        <line x1={cx} y1={cy} x2={px} y2={py} stroke={GOLD} strokeWidth={2} />
        <line x1={px} y1={py} x2={px} y2={cy} stroke={c} strokeWidth={1} strokeDasharray="3 3" />
        <line x1={cx} y1={py} x2={px} y2={py} stroke={c} strokeWidth={1} strokeDasharray="3 3" />
        <circle cx={px} cy={py} r={4} fill={GOLD} />
        <text x={cx + 8} y={cy - 6} fill={MUTE} fontSize={9} fontFamily="monospace">e^iθ</text>
      </g>
    )
  },
  'taylor-series': c => {
    const f = (x: number) => 60 - 34 * Math.sin((x - 150) / 38)
    const approx = (x: number) => { const t = (x - 150) / 38; return 60 - 34 * (t - (t * t * t) / 6) }
    const curve = Array.from({ length: 61 }, (_, i) => { const x = i * 5; return `${x},${f(x)}` }).join(' ')
    const poly = Array.from({ length: 61 }, (_, i) => { const x = i * 5; return `${x},${Math.max(2, Math.min(118, approx(x)))}` }).join(' ')
    return (
      <g>
        <line x1={0} y1={60} x2={300} y2={60} stroke={MUTE} strokeWidth={0.75} />
        <polyline points={curve} fill="none" stroke={MUTE} strokeWidth={1.5} />
        <polyline points={poly} fill="none" stroke={c} strokeWidth={2} />
        <circle cx={150} cy={60} r={3.5} fill={GOLD} />
      </g>
    )
  },
  'newtons-method': c => {
    const f = (x: number) => 95 - Math.pow((x - 70) / 26, 2) * 12
    const curve = Array.from({ length: 61 }, (_, i) => { const x = 40 + i * 4; return `${x},${Math.max(8, f(x))}` }).join(' ')
    return (
      <g>
        <line x1={0} y1={95} x2={300} y2={95} stroke={MUTE} strokeWidth={0.75} />
        <polyline points={curve} fill="none" stroke={c} strokeWidth={2} />
        <line x1={150} y1={20} x2={250} y2={95} stroke={GOLD} strokeWidth={1.5} />
        <line x1={150} y1={20} x2={150} y2={95} stroke={MUTE} strokeWidth={1} strokeDasharray="3 3" />
        <circle cx={150} cy={20} r={3.5} fill={c} />
        <circle cx={250} cy={95} r={3.5} fill={GOLD} />
        <circle cx={195} cy={95} r={2.5} fill={MUTE} />
      </g>
    )
  },
  'fourier-transform': c => {
    const wave = Array.from({ length: 71 }, (_, i) => {
      const x = i * 2
      const y = 45 + 9 * Math.sin(x / 9) + 6 * Math.sin(x / 4) + 4 * Math.sin(x / 2.3)
      return `${x},${y}`
    }).join(' ')
    const bars = [30, 52, 22, 40, 16, 28]
    return (
      <g>
        <polyline points={wave} fill="none" stroke={c} strokeWidth={1.75} />
        <line x1={150} y1={10} x2={150} y2={110} stroke={FAINT} strokeWidth={1} />
        {bars.map((h, i) => (
          <rect key={i} x={165 + i * 21} y={104 - h} width={13} height={h} rx={2} fill={i === 1 ? GOLD : c} opacity={i === 1 ? 1 : 0.55} />
        ))}
      </g>
    )
  },
  'sieve-of-eratosthenes': c => {
    const cells: ReactNode[] = []
    for (let i = 0; i < 18; i++) {
      const n = i + 2
      const isPrime = [2, 3, 5, 7, 11, 13, 17, 19].includes(n)
      const x = (i % 9) * 32 + 12, y = Math.floor(i / 9) * 40 + 22
      cells.push(
        <g key={n}>
          <rect x={x} y={y} width={26} height={26} rx={4} fill={isPrime ? `${c}33` : 'rgba(255,255,255,0.03)'} stroke={isPrime ? c : FAINT} strokeWidth={0.75} />
          <text x={x + 13} y={y + 17} textAnchor="middle" fontSize={11} fill={isPrime ? c : MUTE} fontFamily="monospace">{n}</text>
        </g>
      )
    }
    return <g>{cells}</g>
  },
  'central-limit-theorem': c => {
    const bell = (x: number) => 108 - 88 * Math.exp(-Math.pow((x - 150) / 46, 2))
    const bars = Array.from({ length: 13 }, (_, i) => {
      const cx = 30 + i * 20
      const h = 108 - bell(cx)
      return <rect key={i} x={cx - 8} y={108 - h} width={16} height={h} rx={1.5} fill={c} opacity={0.4} />
    })
    const curve = Array.from({ length: 61 }, (_, i) => { const x = i * 5; return `${x},${bell(x)}` }).join(' ')
    return (
      <g>
        <line x1={0} y1={108} x2={300} y2={108} stroke={MUTE} strokeWidth={0.75} />
        {bars}
        <polyline points={curve} fill="none" stroke={GOLD} strokeWidth={2} />
      </g>
    )
  },
  'binary-search': c => {
    const cells = Array.from({ length: 9 }, (_, i) => {
      const x = 18 + i * 30
      const active = i >= 4 && i <= 8
      const mid = i === 6
      return (
        <g key={i}>
          <rect x={x} y={48} width={24} height={24} rx={4} fill={mid ? GOLD : active ? `${c}33` : 'rgba(255,255,255,0.03)'} stroke={mid ? GOLD : active ? c : FAINT} strokeWidth={0.75} />
          <text x={x + 12} y={65} textAnchor="middle" fontSize={10} fill={mid ? BG : active ? c : MUTE} fontFamily="monospace">{(i + 1) * 7}</text>
        </g>
      )
    })
    return (
      <g>
        {cells}
        <text x={18 + 4 * 30 + 12} y={44} textAnchor="middle" fontSize={8} fill={c} fontFamily="monospace">lo</text>
        <text x={18 + 6 * 30 + 12} y={88} textAnchor="middle" fontSize={8} fill={GOLD} fontFamily="monospace">mid</text>
        <text x={18 + 8 * 30 + 12} y={44} textAnchor="middle" fontSize={8} fill={c} fontFamily="monospace">hi</text>
      </g>
    )
  },
  'graph-traversal': c => {
    const nodes = [
      { x: 40, y: 60, l: 0 }, { x: 110, y: 30, l: 1 }, { x: 110, y: 90, l: 1 },
      { x: 185, y: 30, l: 2 }, { x: 185, y: 90, l: 2 }, { x: 255, y: 60, l: 3 },
    ]
    const edges = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5], [1, 2]]
    const lc = [GOLD, c, `${c}99`, MUTE]
    return (
      <g>
        {edges.map(([a, b], i) => (
          <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke={FAINT} strokeWidth={1.25} />
        ))}
        {nodes.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={11} fill={`${lc[n.l]}33`} stroke={lc[n.l]} strokeWidth={1.5} />
        ))}
      </g>
    )
  },
  'sorting-algorithms': c => {
    const bars = [30, 64, 22, 80, 44, 58, 16, 70, 36, 50]
    return (
      <g>
        {bars.map((h, i) => (
          <rect key={i} x={i * 28 + 16} y={104 - h} width={20} height={h} rx={2} fill={i < 3 ? GOLD : c} opacity={i < 3 ? 1 : 0.5} />
        ))}
      </g>
    )
  },
  'pendulum-motion': c => {
    const px = 150, py = 18, len = 78, ang = 0.6
    const bx = px + len * Math.sin(ang), by = py + len * Math.cos(ang)
    return (
      <g>
        <path d={`M ${px} ${py + 34} A 34 34 0 0 1 ${bx * 0.42 + px * 0.58} ${by * 0.42 + py * 0.58}`} fill="none" stroke={GOLD} strokeWidth={1} strokeDasharray="2 3" />
        <line x1={px} y1={py} x2={px} y2={py + 88} stroke={MUTE} strokeWidth={0.75} strokeDasharray="3 3" />
        <line x1={px} y1={py} x2={bx} y2={by} stroke={MUTE} strokeWidth={1.75} />
        <circle cx={px} cy={py} r={3.5} fill={MUTE} />
        <circle cx={bx} cy={by} r={11} fill={c} />
      </g>
    )
  },
  'time-dilation': c => {
    return (
      <g>
        <line x1={40} y1={28} x2={130} y2={28} stroke={MUTE} strokeWidth={2} />
        <line x1={40} y1={92} x2={130} y2={92} stroke={MUTE} strokeWidth={2} />
        <line x1={85} y1={28} x2={85} y2={92} stroke={`${c}66`} strokeWidth={1.5} strokeDasharray="2 2" />
        <line x1={170} y1={28} x2={260} y2={28} stroke={MUTE} strokeWidth={2} />
        <line x1={170} y1={92} x2={260} y2={92} stroke={MUTE} strokeWidth={2} />
        <polyline points="180,92 215,28 250,92" fill="none" stroke={GOLD} strokeWidth={2} />
        <circle cx={85} cy={60} r={3} fill={c} />
        <circle cx={215} cy={28} r={3} fill={GOLD} />
        <text x={85} y={108} textAnchor="middle" fontSize={8} fill={MUTE} fontFamily="monospace">rest</text>
        <text x={215} y={108} textAnchor="middle" fontSize={8} fill={MUTE} fontFamily="monospace">moving</text>
      </g>
    )
  },
  'wave-particle-duality': c => {
    const bands = [40, 78, 116, 150, 184, 222, 260]
    const op = [0.25, 0.5, 0.85, 1, 0.85, 0.5, 0.25]
    return (
      <g>
        <line x1={20} y1={20} x2={20} y2={100} stroke={MUTE} strokeWidth={2} />
        <rect x={18} y={48} width={4} height={8} fill={BG} />
        <rect x={18} y={64} width={4} height={8} fill={BG} />
        {bands.map((x, i) => (
          <rect key={i} x={x} y={18} width={14} height={84} rx={2} fill={c} opacity={op[i] * 0.7} />
        ))}
        {[30, 55, 80].map((y, i) => <circle key={i} cx={150} cy={y + 5} r={2} fill={GOLD} />)}
      </g>
    )
  },
  'action-potential': c => {
    const pts = [
      [0, 95], [70, 95], [95, 88], [110, 18], [128, 30], [150, 108], [175, 92], [300, 95],
    ].map(([x, y]) => `${x},${y}`).join(' ')
    return (
      <g>
        <line x1={0} y1={70} x2={300} y2={70} stroke={FAINT} strokeWidth={1} strokeDasharray="4 4" />
        <text x={4} y={66} fontSize={7} fill={MUTE} fontFamily="monospace">threshold</text>
        <polyline points={pts} fill="none" stroke={c} strokeWidth={2.25} />
        <circle cx={110} cy={18} r={3.5} fill={GOLD} />
      </g>
    )
  },
  'cardiac-electrical-signal': c => {
    const ecg = [
      [0, 64], [55, 64], [66, 56], [72, 70], [80, 22], [88, 92], [96, 64], [150, 64],
      [162, 56], [168, 72], [176, 24], [184, 90], [192, 64], [250, 64], [262, 58], [300, 64],
    ].map(([x, y]) => `${x},${y}`).join(' ')
    return (
      <g>
        <polyline points={ecg} fill="none" stroke={c} strokeWidth={2} />
        <circle cx={80} cy={22} r={3} fill={GOLD} />
      </g>
    )
  },
  'brownian-motion': c => {
    const pts = [[150, 60], [165, 48], [150, 35], [172, 30], [188, 46], [176, 64], [196, 72], [180, 90], [205, 86], [218, 66], [210, 48]]
    const path = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ')
    const left = [[150, 60], [134, 52], [142, 38], [120, 44], [108, 62], [126, 70], [110, 84]]
    const lpath = left.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ')
    return (
      <g>
        <path d={path} fill="none" stroke={c} strokeWidth={1.75} strokeLinejoin="round" />
        <path d={lpath} fill="none" stroke={`${c}88`} strokeWidth={1.5} strokeLinejoin="round" />
        <circle cx={210} cy={48} r={5} fill={GOLD} />
        <circle cx={150} cy={60} r={3} fill={MUTE} />
      </g>
    )
  },
  'bayes-theorem': c => {
    // Population square: a thin gold band of true positives, a wider accent
    // band of false positives, the rest faint healthy population.
    const COLS = 24, ROWS = 8
    const dots: ReactNode[] = []
    for (let r = 0; r < ROWS; r++) {
      for (let i = 0; i < COLS; i++) {
        const n = r * COLS + i
        const tp = n < 4 // sick and flagged
        const fp = n >= 4 && n < 24 // healthy but flagged
        dots.push(
          <rect key={n} x={14 + i * 6.6} y={22 + r * 8} width={4.4} height={4.4} rx={1}
            fill={tp ? GOLD : fp ? c : FAINT} />
        )
      }
    }
    return (
      <g>
        {dots}
        <rect x={11} y={19} width={165} height={71} rx={3} fill="none" stroke={MUTE} strokeWidth={0.6} />
        <path d="M182 30 L192 30 L192 55 L198 60 L192 65 L192 90 L182 90" fill="none" stroke={MUTE} strokeWidth={0.75} />
        <rect x={212} y={30} width={26} height={60} rx={2} fill={c} opacity={0.85} />
        <rect x={212} y={30} width={26} height={10} rx={2} fill={GOLD} />
        <line x1={212} y1={40} x2={238} y2={40} stroke={MUTE} strokeWidth={0.75} />
        <text x={248} y={44} fill={GOLD} fontSize={11} fontFamily="monospace">17%</text>
        <text x={248} y={58} fill={MUTE} fontSize={7} fontFamily="monospace">P(D|+)</text>
        <text x={248} y={80} fill={MUTE} fontSize={7} fontFamily="monospace">tested +</text>
      </g>
    )
  },
  'dynamic-programming': c => {
    // A filled DP table with the optimal backtrack path traced through it.
    const path = new Set(['0,0', '0,1', '1,2', '1,3', '2,4', '2,5', '3,6', '3,7', '3,8', '3,9'])
    const cx = (j: number) => 8 + j * 29 + 12
    const cy = (i: number) => 10 + i * 27 + 12
    const cells: ReactNode[] = []
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 10; j++) {
        const on = path.has(`${i},${j}`)
        cells.push(
          <g key={`${i}-${j}`}>
            <rect x={8 + j * 29} y={10 + i * 27} width={24} height={24} rx={4}
              fill={on ? `${GOLD}33` : 'rgba(255,255,255,0.03)'} stroke={on ? GOLD : FAINT} strokeWidth={0.75} />
            <text x={cx(j)} y={cy(i) + 4} textAnchor="middle" fontSize={9}
              fill={on ? GOLD : MUTE} fontFamily="monospace">{i + j}</text>
          </g>
        )
      }
    }
    const trace = [...path].map(k => { const [i, j] = k.split(',').map(Number); return `${cx(j)},${cy(i)}` }).join(' ')
    return (
      <g>
        {cells}
        <polyline points={trace} fill="none" stroke={c} strokeWidth={1.75} strokeDasharray="3 3" opacity={0.9} />
        <circle cx={cx(9)} cy={cy(3)} r={3.5} fill={GOLD} />
      </g>
    )
  },
  'entropy-and-the-second-law': c => {
    // Gas clustered in one corner (W = 1) vs spread through the box (W = max).
    // Integer-only hash: Math.sin is not required to be correctly rounded, so it
    // can differ in the last bits between Node and the browser and desync hydration.
    // Math.imul and shifts are exactly specified, so this is bit-identical everywhere.
    const rnd = (i: number, seed: number) => {
      let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca6b)
      h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35)
      h ^= h >>> 16
      return (h >>> 0) / 4294967296
    }
    const at = (base: number, span: number, i: number, seed: number) =>
      Math.round((base + rnd(i, seed) * span) * 100) / 100
    const clustered = Array.from({ length: 14 }, (_, i) => ({
      x: at(20, 26, i, 1),
      y: at(72, 24, i, 2),
    }))
    const spread = Array.from({ length: 14 }, (_, i) => ({
      x: at(178, 102, i, 3),
      y: at(26, 68, i, 4),
    }))
    return (
      <g>
        <rect x={14} y={20} width={114} height={80} rx={3} fill="none" stroke={MUTE} strokeWidth={1.25} />
        <rect x={172} y={20} width={114} height={80} rx={3} fill="none" stroke={MUTE} strokeWidth={1.25} />
        <line x1={71} y1={20} x2={71} y2={100} stroke={FAINT} strokeWidth={0.75} strokeDasharray="3 3" />
        <line x1={229} y1={20} x2={229} y2={100} stroke={FAINT} strokeWidth={0.75} strokeDasharray="3 3" />
        {clustered.map((p, i) => <circle key={`a${i}`} cx={p.x} cy={p.y} r={2.6} fill={c} />)}
        {spread.map((p, i) => <circle key={`b${i}`} cx={p.x} cy={p.y} r={2.6} fill={c} opacity={0.85} />)}
        <line x1={136} y1={60} x2={162} y2={60} stroke={GOLD} strokeWidth={1.5} />
        <path d="M 162 60 L 155 56 L 155 64 Z" fill={GOLD} />
        <path d="M 162 74 L 136 74" stroke={MUTE} strokeWidth={1} strokeDasharray="2 3" />
        <path d="M 136 74 L 143 70.5 L 143 77.5 Z" fill={MUTE} opacity={0.5} />
        <text x={71} y={113} textAnchor="middle" fontSize={8} fill={MUTE} fontFamily="monospace">W = 1</text>
        <text x={229} y={113} textAnchor="middle" fontSize={8} fill={GOLD} fontFamily="monospace">W = max</text>
        <text x={149} y={50} textAnchor="middle" fontSize={8} fill={GOLD} fontFamily="monospace">S↑</text>
      </g>
    )
  },
  'immune-response': c => {
    // One selected clone (gold ring) expanding exponentially into a memory pool.
    const levels = [0, 1, 2, 3].map(L =>
      Array.from({ length: 2 ** L }, (_, i) => ({ x: 20 + L * 60, y: 12 + (i + 0.5) * (96 / 2 ** L) }))
    )
    const radii = [6, 4.5, 3.5, 2.5]
    const edges: ReactNode[] = []
    for (let L = 0; L < 3; L++) {
      levels[L].forEach((p, i) => {
        for (const q of [levels[L + 1][2 * i], levels[L + 1][2 * i + 1]]) {
          edges.push(<line key={`${L}-${i}-${q.y}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={`${c}55`} strokeWidth={1} />)
        }
      })
    }
    return (
      <g>
        {[20, 40, 80, 100].map(y => (
          <circle key={y} cx={8} cy={y} r={3} fill="none" stroke={MUTE} strokeWidth={0.75} />
        ))}
        {edges}
        {levels.map((row, L) =>
          row.map(p => (
            <circle key={`${L}-${p.y}`} cx={p.x} cy={p.y} r={radii[L]} fill={c} opacity={L === 0 ? 1 : 0.85} />
          ))
        )}
        <circle cx={20} cy={60} r={10} fill="none" stroke={GOLD} strokeWidth={1.5} />
        {Array.from({ length: 16 }, (_, i) => (
          <circle key={i} cx={244 + (i % 4) * 14} cy={22 + Math.floor(i / 4) * 24} r={2} fill={c} opacity={0.45} />
        ))}
        <text x={296} y={116} textAnchor="end" fontSize={8} fill={MUTE} fontFamily="monospace">2ⁿ</text>
      </g>
    )
  },
  'gradient-descent': c => {
    // Iterates stepping down a loss basin, with the -η∇f step arrow at the start.
    const f = (x: number) => 95 - Math.pow((x - 150) / 120, 2) * 75
    const curve = Array.from({ length: 61 }, (_, i) => { const x = 30 + i * 4; return `${x},${f(x)}` }).join(' ')
    const steps = [48, 78, 106, 126, 140, 147]
    return (
      <g>
        <line x1={0} y1={110} x2={300} y2={110} stroke={MUTE} strokeWidth={0.75} />
        <polyline points={curve} fill="none" stroke={c} strokeWidth={2} />
        {steps.slice(0, -1).map((x, i) => (
          <line key={`s${x}`} x1={x} y1={f(x)} x2={steps[i + 1]} y2={f(steps[i + 1])} stroke={MUTE} strokeWidth={1} strokeDasharray="2 2" />
        ))}
        {steps.map((x, i) => (
          <circle key={x} cx={x} cy={f(x)} r={2.5} fill={c} opacity={0.35 + i * 0.11} />
        ))}
        <line x1={30} y1={26} x2={70} y2={53} stroke={GOLD} strokeWidth={1.25} />
        <line x1={48} y1={f(48)} x2={80} y2={f(48)} stroke={GOLD} strokeWidth={1.5} />
        <polygon points="80,40.8 73,37.3 73,44.3" fill={GOLD} />
        <circle cx={48} cy={f(48)} r={4} fill={GOLD} />
        <circle cx={150} cy={f(150)} r={3} fill={MUTE} />
        <text x={54} y={32} fill={MUTE} fontSize={9} fontFamily="monospace">−η∇f</text>
      </g>
    )
  },
  'keplers-laws': c => {
    // Ellipse a=60, b=50 centred (140,60) -> e=0.55, focus (star) at x=173.
    // The two wedges are equal-time sweeps about perihelion and aphelion:
    // equal area, very different shapes.
    return (
      <g>
        <ellipse cx={140} cy={60} rx={60} ry={50} fill="none" stroke={c} strokeWidth={1.5} />
        <line x1={80} y1={60} x2={200} y2={60} stroke={FAINT} strokeWidth={0.75} strokeDasharray="3 3" />
        <path d="M 173 60 L 182.69 24.87 A 60 50 0 0 1 182.69 95.13 Z" fill={`${c}3D`} stroke={GOLD} strokeWidth={0.6} />
        <path d="M 173 60 L 81.93 47.42 A 60 50 0 0 0 81.93 72.58 Z" fill={`${c}3D`} stroke={GOLD} strokeWidth={0.6} />
        <circle cx={140} cy={60} r={1.75} fill={MUTE} />
        <circle cx={173} cy={60} r={6.5} fill={GOLD} />
        <circle cx={200} cy={60} r={4} fill={c} />
        <circle cx={80} cy={60} r={4} fill={MUTE} />
        <text x={212} y={99} fill={MUTE} fontSize={9} fontFamily="monospace">T² ∝ a³</text>
      </g>
    )
  },
  'eigenvectors-and-eigenvalues': c => {
    // A circle of vectors under A = [1.6 0.5; 0.5 1.6]. Most swing off their
    // starting line; the two on the eigen-spans only scale.
    // Coordinates are precomputed literals — no runtime trig, no hydration risk.
    const cx = 150, cy = 60
    const vecs: [number, number, number, number, number][] = [
      [171.25, 54.31, 186.85, 40.26, 0],
      [165.56, 44.44, 182.67, 27.33, 1],
      [155.69, 38.75, 169.74, 23.15, 0],
      [144.31, 38.75, 151.51, 28.85, 0],
      [134.44, 44.44, 132.89, 42.89, 1],
      [128.75, 54.31, 118.85, 61.51, 0],
      [128.75, 65.69, 113.15, 79.74, 0],
      [134.44, 75.56, 117.33, 92.67, 0],
      [144.31, 81.25, 130.26, 96.85, 0],
      [155.69, 81.25, 148.49, 91.15, 0],
      [165.56, 75.56, 167.11, 77.11, 0],
      [171.25, 65.69, 181.15, 58.49, 0],
    ]
    return (
      <g>
        <line x1={113.23} y1={96.77} x2={186.77} y2={23.23} stroke={GOLD} strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />
        <line x1={113.23} y1={23.23} x2={186.77} y2={96.77} stroke={c} strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />
        <circle cx={cx} cy={cy} r={22} fill="none" stroke={FAINT} strokeWidth={1} />
        {vecs.map(([ix, iy, ox, oy, eig], i) => (
          <g key={i}>
            <line x1={cx} y1={cy} x2={ix} y2={iy} stroke={MUTE} strokeWidth={0.6} opacity={0.5} />
            <line x1={cx} y1={cy} x2={ox} y2={oy} stroke={eig ? GOLD : c} strokeWidth={eig ? 2 : 1.1} opacity={eig ? 1 : 0.6} />
            <circle cx={ox} cy={oy} r={eig ? 3.5 : 1.8} fill={eig ? GOLD : c} opacity={eig ? 1 : 0.6} />
          </g>
        ))}
        <circle cx={cx} cy={cy} r={2} fill={MUTE} />
        <text x={190} y={26} fontSize={9} fill={GOLD} fontFamily="monospace">λ=2.1</text>
        <text x={100} y={18} fontSize={9} fill={c} fontFamily="monospace">λ=1.1</text>
      </g>
    )
  },
  pharmacokinetics: c => {
    // Repeated dosing: a sawtooth accumulating into the therapeutic window.
    // Coordinates are rounded to 1dp so float wobble can't desync hydration.
    const doses = [10, 66, 122, 178, 234]
    const conc = (x: number) => doses.reduce((s, d) => (x >= d ? s + Math.exp(-(x - d) / 60) : s), 0)
    const yAt = (x: number) => (100 - conc(x) * 36).toFixed(1)
    const pts = ['0,100', '10,100']
    for (let x = 10; x <= 298; x += 3) pts.push(`${x},${yAt(x)}`)
    return (
      <g>
        <rect x={0} y={8} width={300} height={32} fill={`${GOLD}14`} />
        <rect x={0} y={40} width={300} height={30} fill={`${c}14`} />
        <line x1={0} y1={40} x2={300} y2={40} stroke={GOLD} strokeWidth={1} strokeDasharray="4 4" />
        <line x1={0} y1={70} x2={300} y2={70} stroke={MUTE} strokeWidth={0.75} strokeDasharray="4 4" />
        <text x={4} y={54} fontSize={7} fill={MUTE} fontFamily="monospace">window</text>
        {doses.map(d => (
          <line key={d} x1={d} y1={112} x2={d} y2={104} stroke={MUTE} strokeWidth={1.25} />
        ))}
        <line x1={0} y1={112} x2={300} y2={112} stroke={FAINT} strokeWidth={1} />
        <polyline points={pts.join(' ')} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" />
        <circle cx={235} cy={42.1} r={3.5} fill={GOLD} />
      </g>
    )
  },
  'hash-tables': c => {
    // A key routed through hash() % m into a bucket array; one bucket has a 3-link chain.
    const chains = [1, 2, 0, 3, 1]
    const rows: ReactNode[] = []
    chains.forEach((len, i) => {
      const y = 8 + i * 23
      const hot = len >= 3
      rows.push(
        <g key={`b${i}`}>
          <line x1={106} y1={58} x2={124} y2={y + 9} stroke={FAINT} strokeWidth={0.75} />
          <rect x={124} y={y} width={22} height={18} rx={3} fill={len ? `${c}22` : 'rgba(255,255,255,0.03)'} stroke={len ? c : FAINT} strokeWidth={0.75} />
          <text x={135} y={y + 12.5} textAnchor="middle" fontSize={8} fill={len ? c : MUTE} fontFamily="monospace">{i}</text>
          {Array.from({ length: len }, (_, p) => (
            <g key={p}>
              <line x1={146 + p * 32} y1={y + 9} x2={152 + p * 32} y2={y + 9} stroke={hot ? GOLD : MUTE} strokeWidth={0.75} />
              <rect x={152 + p * 32} y={y + 1} width={26} height={16} rx={3} fill={hot ? `${GOLD}22` : 'rgba(255,255,255,0.04)'} stroke={hot ? GOLD : MUTE} strokeWidth={0.75} />
            </g>
          ))}
        </g>
      )
    })
    return (
      <g>
        <rect x={6} y={46} width={44} height={24} rx={4} fill="rgba(255,255,255,0.04)" stroke={MUTE} strokeWidth={0.75} />
        <text x={28} y={61} textAnchor="middle" fontSize={9} fill={MUTE} fontFamily="monospace">key</text>
        <line x1={50} y1={58} x2={62} y2={58} stroke={MUTE} strokeWidth={0.75} />
        <rect x={62} y={46} width={44} height={24} rx={4} fill={`${GOLD}22`} stroke={GOLD} strokeWidth={0.75} />
        <text x={84} y={56} textAnchor="middle" fontSize={8} fill={GOLD} fontFamily="monospace">h(k)</text>
        <text x={84} y={66} textAnchor="middle" fontSize={8} fill={GOLD} fontFamily="monospace">% m</text>
        {rows}
      </g>
    )
  },
  'markov-chains': c => {
    // A 3-state chain with a hopping token, beside the stationary distribution.
    const A = { x: 48, y: 32 }, B = { x: 48, y: 88 }, C = { x: 132, y: 60 }
    const nodes = [{ ...A, l: 'S' }, { ...B, l: 'C' }, { ...C, l: 'R' }]
    const bars = [{ x: 196, h: 46 }, { x: 228, h: 30 }, { x: 260, h: 22 }]
    return (
      <g>
        <path d="M 48 32 Q 26 60 48 88" fill="none" stroke={`${c}88`} strokeWidth={1.5} />
        <path d="M 48 88 Q 92 96 132 60" fill="none" stroke={`${c}88`} strokeWidth={1.5} />
        <path d="M 132 60 Q 92 20 48 32" fill="none" stroke={`${c}88`} strokeWidth={1.5} />
        <circle cx={152} cy={60} r={9} fill="none" stroke={MUTE} strokeWidth={1.25} />
        <polygon points="37,66 33.5,58.5 40.5,58.5" fill={c} />
        <polygon points="95.7,83.4 87.4,89.9 85.2,83.3" fill={c} />
        <polygon points="86.3,31.4 96.8,37.9 94.6,31.3" fill={c} />
        {nodes.map(n => (
          <g key={n.l}>
            <circle cx={n.x} cy={n.y} r={12} fill="rgba(26,23,18,0.92)" stroke={c} strokeWidth={1.5} />
            <text x={n.x} y={n.y + 3.5} textAnchor="middle" fontSize={9} fill={c} fontFamily="monospace">{n.l}</text>
          </g>
        ))}
        <circle cx={111.75} cy={75.25} r={4} fill={GOLD} />
        <line x1={176} y1={16} x2={176} y2={104} stroke={FAINT} strokeWidth={1} />
        <text x={196} y={30} fontSize={9} fill={MUTE} fontFamily="monospace">π</text>
        <line x1={190} y1={100} x2={288} y2={100} stroke={MUTE} strokeWidth={0.75} />
        {bars.map(b => (
          <g key={b.x}>
            <rect x={b.x} y={100 - b.h} width={20} height={b.h} rx={2} fill={c} opacity={0.45} />
            <line x1={b.x} y1={100 - b.h} x2={b.x + 20} y2={100 - b.h} stroke={GOLD} strokeWidth={1.5} />
          </g>
        ))}
      </g>
    )
  },
  'doppler-effect': c => {
    // Source at x=200 moving right at 0.6x the wave speed. Crest k was emitted
    // k periods ago: radius 13k, centre left-shifted 8k. Front edges land at
    // 205/210/215/220 (gap 5), rear edges at 179/158/137/116 (gap 21) — the
    // 0.4 : 1.6 bunching, drawn.
    const crests: [number, number, number][] = [
      [192, 13, 0.9], [184, 26, 0.7], [176, 39, 0.5], [168, 52, 0.35],
    ]
    return (
      <g>
        <line x1={0} y1={60} x2={300} y2={60} stroke={FAINT} strokeWidth={1} strokeDasharray="4 4" />
        {crests.map(([cx, r, op], i) => (
          <g key={i}>
            <circle cx={cx} cy={60} r={r} fill="none" stroke={c} strokeWidth={1.5} opacity={op} />
            <circle cx={cx} cy={60} r={1.5} fill={MUTE} opacity={op} />
          </g>
        ))}
        <circle cx={200} cy={60} r={5} fill={GOLD} />
        <line x1={222} y1={60} x2={234} y2={60} stroke={GOLD} strokeWidth={2} />
        <polygon points="234,55 243,60 234,65" fill={GOLD} />
        <circle cx={270} cy={60} r={4} fill={MUTE} />
        <text x={270} y={48} textAnchor="middle" fontSize={8} fill={MUTE} fontFamily="monospace">obs</text>
        <text x={6} y={115} fontSize={9} fill={MUTE} fontFamily="monospace">f′ &lt; f</text>
        <text x={252} y={115} fontSize={9} fill={GOLD} fontFamily="monospace">f′ &gt; f</text>
      </g>
    )
  },
  'public-key-cryptography': c => {
    // Two parties exchange public values across a tapped wire and land on the same key.
    return (
      <g>
        <text x={34} y={17} textAnchor="middle" fontSize={9} fill={GOLD} fontFamily="monospace">a</text>
        <text x={266} y={17} textAnchor="middle" fontSize={9} fill={GOLD} fontFamily="monospace">b</text>
        <circle cx={34} cy={44} r={15} fill={`${c}22`} stroke={c} strokeWidth={1.25} />
        <circle cx={266} cy={44} r={15} fill={`${c}22`} stroke={c} strokeWidth={1.25} />
        <text x={34} y={48} textAnchor="middle" fontSize={10} fill={c} fontFamily="monospace">A</text>
        <text x={266} y={48} textAnchor="middle" fontSize={10} fill={c} fontFamily="monospace">B</text>

        <line x1={51} y1={36} x2={249} y2={36} stroke={MUTE} strokeWidth={0.75} />
        <polygon points="249,36 243,33 243,39" fill={MUTE} />
        <text x={110} y={30} textAnchor="middle" fontSize={8} fill={c} fontFamily="monospace">g^a</text>

        <line x1={249} y1={54} x2={51} y2={54} stroke={MUTE} strokeWidth={0.75} />
        <polygon points="51,54 57,51 57,57" fill={MUTE} />
        <text x={190} y={65} textAnchor="middle" fontSize={8} fill={c} fontFamily="monospace">g^b</text>

        <line x1={150} y1={36} x2={150} y2={80} stroke={FAINT} strokeWidth={0.75} strokeDasharray="3 3" />
        <text x={150} y={76} textAnchor="middle" fontSize={7} fill={MUTE} fontFamily="monospace">Eve</text>
        <rect x={118} y={80} width={64} height={26} rx={5} fill="rgba(255,255,255,0.03)" stroke={MUTE} strokeWidth={0.75} />
        <text x={150} y={98} textAnchor="middle" fontSize={13} fill={MUTE} fontFamily="monospace">?</text>

        <line x1={34} y1={59} x2={34} y2={86} stroke={FAINT} strokeWidth={0.75} />
        <line x1={266} y1={59} x2={266} y2={86} stroke={FAINT} strokeWidth={0.75} />
        <rect x={8} y={86} width={52} height={20} rx={4} fill={`${GOLD}22`} stroke={GOLD} strokeWidth={0.75} />
        <rect x={240} y={86} width={52} height={20} rx={4} fill={`${GOLD}22`} stroke={GOLD} strokeWidth={0.75} />
        <text x={34} y={100} textAnchor="middle" fontSize={8} fill={GOLD} fontFamily="monospace">g^ab</text>
        <text x={266} y={100} textAnchor="middle" fontSize={8} fill={GOLD} fontFamily="monospace">g^ab</text>
      </g>
    )
  },
  'chaos-theory': c => {
    // Period-doubling cascade (literal coordinates — no render-time iteration,
    // so the markup is byte-identical on server and client).
    const forks = [
      'M 8 60 L 88 60',
      'M 88 60 Q 104 60 108 42 L 130 42',
      'M 88 60 Q 104 60 108 78 L 130 78',
      'M 130 42 Q 142 42 145 32 L 160 32',
      'M 130 42 Q 142 42 145 52 L 160 52',
      'M 130 78 Q 142 78 145 68 L 160 68',
      'M 130 78 Q 142 78 145 88 L 160 88',
      'M 160 32 Q 170 32 172 26 L 186 26',
      'M 160 32 Q 170 32 172 38 L 186 38',
      'M 160 52 Q 170 52 172 46 L 186 46',
      'M 160 52 Q 170 52 172 58 L 186 58',
      'M 160 68 Q 170 68 172 62 L 186 62',
      'M 160 68 Q 170 68 172 74 L 186 74',
      'M 160 88 Q 170 88 172 82 L 186 82',
      'M 160 88 Q 170 88 172 94 L 186 94',
    ]
    // [x, ys] — the smeared chaotic band, with a period-3 window at x = 272, 276.
    const band: [number, number[]][] = [
      [192, [26, 38, 46, 58, 62, 74, 82, 94]],
      [196, [25, 39, 45, 59, 61, 75, 81, 95]],
      [200, [24, 40, 44, 58, 62, 76, 80, 96]],
      [204, [23, 41, 43, 57, 63, 77, 79, 97]],
      [208, [22, 42, 44, 56, 64, 78, 80, 98]],
      [212, [22, 42, 46, 56, 64, 78, 82, 98]],
      [216, [36, 48, 74, 86]],
      [220, [34, 50, 72, 88]],
      [224, [32, 52, 70, 90]],
      [228, [30, 44, 54, 68, 92]],
      [232, [28, 42, 56, 66, 80, 94]],
      [236, [26, 40, 58, 64, 78, 96]],
      [240, [24, 38, 50, 62, 76, 98]],
      [244, [22, 36, 48, 60, 74, 100]],
      [248, [22, 34, 46, 58, 72, 88, 100]],
      [252, [20, 32, 44, 56, 70, 86, 102]],
      [256, [20, 30, 42, 54, 68, 84, 102]],
      [260, [18, 30, 40, 52, 66, 82, 100]],
      [264, [18, 28, 40, 50, 64, 80, 98]],
      [268, [20, 32, 44, 54, 66, 84, 100]],
      [272, [30, 60, 90]],
      [276, [28, 58, 92]],
      [280, [18, 30, 42, 54, 68, 84, 100]],
      [284, [18, 28, 40, 52, 66, 82, 102]],
      [288, [18, 26, 38, 50, 64, 80, 102]],
      [292, [18, 26, 36, 48, 62, 78, 102]],
    ]
    const dots: ReactNode[] = []
    band.forEach(([x, ys]) => {
      const window3 = x === 272 || x === 276
      ys.forEach((y, i) => dots.push(
        <circle key={`${x}-${i}`} cx={x} cy={y} r={window3 ? 1.4 : 0.9} fill={window3 ? GOLD : c} opacity={window3 ? 1 : 0.8} />
      ))
    })
    return (
      <g>
        <line x1={8} y1={110} x2={294} y2={110} stroke={FAINT} strokeWidth={0.75} />
        {forks.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={c} strokeWidth={i === 0 ? 2 : 1.5} strokeLinecap="round" />
        ))}
        {dots}
        <line x1={214} y1={14} x2={214} y2={106} stroke={GOLD} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
        <text x={214} y={118} textAnchor="middle" fontSize={8} fill={GOLD} fontFamily="monospace">r∞</text>
        <text x={40} y={54} fontSize={8} fill={MUTE} fontFamily="monospace">x</text>
        <text x={294} y={118} textAnchor="end" fontSize={8} fill={MUTE} fontFamily="monospace">r</text>
      </g>
    )
  },
  'information-theory': c => {
    // Binary entropy curve peaking at 1 bit, beside variable-length codewords.
    const r = (v: number) => Math.round(v * 100) / 100
    const hb = (p: number) => (p <= 0 || p >= 1 ? 0 : -p * Math.log2(p) - (1 - p) * Math.log2(1 - p))
    const curve = Array.from({ length: 41 }, (_, i) => {
      const p = i / 40
      return `${r(16 + p * 152)},${r(102 - hb(p) * 72)}`
    }).join(' ')
    const codes: ReactNode[] = [14, 32, 56, 88].map((w, i) => (
      <g key={`cw${i}`}>
        <rect x={190} y={24 + i * 22} width={w} height={8} rx={2} fill={i === 0 ? GOLD : c} opacity={i === 0 ? 0.95 : 0.75 - i * 0.15} />
        <rect x={190} y={24 + i * 22} width={w} height={8} rx={2} fill="none" stroke={MUTE} strokeWidth={0.5} />
      </g>
    ))
    return (
      <g>
        <line x1={16} y1={102} x2={168} y2={102} stroke={MUTE} strokeWidth={0.75} />
        <line x1={16} y1={102} x2={16} y2={26} stroke={MUTE} strokeWidth={0.75} />
        <polyline points={curve} fill="none" stroke={c} strokeWidth={2} />
        <line x1={92} y1={30} x2={92} y2={102} stroke={GOLD} strokeWidth={0.75} strokeDasharray="3 3" />
        <line x1={16} y1={30} x2={92} y2={30} stroke={FAINT} strokeWidth={1} />
        <circle cx={92} cy={30} r={4} fill={GOLD} />
        <text x={20} y={22} fill={MUTE} fontSize={9} fontFamily="monospace">H(p)</text>
        <text x={96} y={26} fill={GOLD} fontSize={8} fontFamily="monospace">1 bit</text>
        <line x1={180} y1={16} x2={180} y2={104} stroke={FAINT} strokeWidth={1} />
        {codes}
        <text x={190} y={116} fill={MUTE} fontSize={8} fontFamily="monospace">codewords</text>
      </g>
    )
  },
}

export function ArticleVisual({
  slug,
  topic,
  variant = 'card',
}: {
  slug: string
  topic: Topic
  variant?: 'card' | 'hero'
}) {
  const c = ACCENT[topic] ?? GOLD
  const render = visuals[slug]
  const height = variant === 'hero' ? 200 : '100%'

  return (
    <svg
      viewBox="0 0 300 120"
      width="100%"
      height={height}
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${slug.replace(/-/g, ' ')} illustration`}
      style={{ display: 'block' }}
    >
      <rect width="300" height="120" fill={BG} />
      <Grid />
      {render ? normalize(render(c)) : null}
    </svg>
  )
}
