import { Children, cloneElement, isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'

import type { Topic } from '@/lib/topics'

const ACCENT: Record<Topic, string> = {
  Mathematics: '#A78BFA',
  Physics: '#10B981',
  Chemistry: '#FB923C',
  Biology: '#A3E635',
  'Earth & Climate': '#22D3EE',
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
  'glucose-insulin-regulation': c => {
    // Postprandial excursion (accent) with insulin lagging behind it (gold),
    // riding inside the shaded healthy band, plus the closed feedback loop.
    const glucose = [
      [0, 80], [55, 80], [70, 64], [85, 42], [100, 30], [118, 34],
      [140, 48], [165, 62], [190, 72], [215, 78], [300, 79],
    ].map(([x, y]) => `${x},${y}`).join(' ')
    const insulin = [
      [0, 100], [62, 100], [80, 92], [100, 72], [118, 60], [135, 58],
      [155, 66], [180, 80], [205, 92], [230, 98], [300, 99],
    ].map(([x, y]) => `${x},${y}`).join(' ')
    return (
      <g>
        <rect x={0} y={62} width={300} height={24} fill={FAINT} />
        <line x1={0} y1={62} x2={300} y2={62} stroke={MUTE} strokeWidth={0.75} strokeDasharray="4 4" />
        <line x1={0} y1={86} x2={300} y2={86} stroke={MUTE} strokeWidth={0.75} strokeDasharray="4 4" />
        <line x1={60} y1={16} x2={60} y2={112} stroke={MUTE} strokeWidth={0.75} strokeDasharray="3 3" />
        <text x={64} y={112} fontSize={7} fill={MUTE} fontFamily="monospace">meal</text>
        <polyline points={insulin} fill="none" stroke={GOLD} strokeWidth={1.5} />
        <polyline points={glucose} fill="none" stroke={c} strokeWidth={2.25} />
        <circle cx={100} cy={30} r={3.5} fill={c} />
        <circle cx={135} cy={58} r={3} fill={GOLD} />
        <circle cx={262} cy={28} r={14} fill="none" stroke={c} strokeWidth={1.25} opacity={0.7} />
        <polygon points="262,10 269,15 262,20" fill={c} />
        <text x={262} y={31} textAnchor="middle" fontSize={7} fill={MUTE} fontFamily="monospace">−</text>
      </g>
    )
  },
  superconductivity: c => {
    // Left: R(T) collapsing discontinuously to zero at Tc.
    // Right: a magnet levitating over a slab that has expelled the field.
    return (
      <g>
        <line x1={22} y1={16} x2={22} y2={96} stroke={FAINT} strokeWidth={1} />
        <line x1={22} y1={96} x2={178} y2={96} stroke={FAINT} strokeWidth={1} />
        <text x={10} y={22} fontSize={7} fill={MUTE} fontFamily="monospace">R</text>
        <text x={180} y={104} fontSize={7} fill={MUTE} fontFamily="monospace">T</text>
        <line x1={86} y1={16} x2={86} y2={96} stroke={GOLD} strokeWidth={0.75} strokeDasharray="3 3" opacity={0.6} />
        <text x={86} y={12} textAnchor="middle" fontSize={7} fill={GOLD} fontFamily="monospace">Tc</text>
        <polyline points="86,62 108,56 134,46 160,38 176,32" fill="none" stroke={MUTE} strokeWidth={1.5} />
        <line x1={86} y1={62} x2={86} y2={96} stroke={GOLD} strokeWidth={2} />
        <line x1={22} y1={96} x2={86} y2={96} stroke={c} strokeWidth={3} />
        <text x={30} y={90} fontSize={7} fill={c} fontFamily="monospace">R = 0</text>
        <path d="M 198 84 C 206 44 274 44 282 84" fill="none" stroke={c} strokeWidth={1} opacity={0.45} />
        <path d="M 210 84 C 216 58 264 58 270 84" fill="none" stroke={c} strokeWidth={1} opacity={0.7} />
        <rect x={222} y={56} width={36} height={10} rx={2} fill={GOLD} />
        <rect x={196} y={86} width={88} height={18} rx={3} fill={`${c}22`} stroke={c} strokeWidth={0.75} />
        {[210, 232, 254].map((x, i) => (
          <g key={i}>
            <line x1={x} y1={95} x2={x + 10} y2={95} stroke={c} strokeWidth={0.75} opacity={0.7} />
            <circle cx={x} cy={95} r={2} fill={c} />
            <circle cx={x + 10} cy={95} r={2} fill={c} />
          </g>
        ))}
      </g>
    )
  },
  'neural-networks': c => {
    // A 2-4-4-1 net: faint forward wiring, with one gradient path traced back from the loss.
    const inY = [44, 76]
    const hY = [20, 48, 76, 104]
    const cols = [46, 118, 190]
    const outX = 254
    const outY = 60
    const edges: ReactNode[] = []
    inY.forEach((y0, a) =>
      hY.forEach((y1, b) =>
        edges.push(<line key={`a${a}${b}`} x1={cols[0]} y1={y0} x2={cols[1]} y2={y1} stroke={FAINT} strokeWidth={1} />)
      )
    )
    hY.forEach((y0, a) =>
      hY.forEach((y1, b) =>
        edges.push(<line key={`b${a}${b}`} x1={cols[1]} y1={y0} x2={cols[2]} y2={y1} stroke={FAINT} strokeWidth={1} />)
      )
    )
    hY.forEach((y0, a) =>
      edges.push(<line key={`c${a}`} x1={cols[2]} y1={y0} x2={outX} y2={outY} stroke={FAINT} strokeWidth={1} />)
    )
    return (
      <g>
        {edges}
        <polyline
          points={`${outX},${outY} ${cols[2]},48 ${cols[1]},76 ${cols[0]},44`}
          fill="none" stroke={GOLD} strokeWidth={1.75} strokeDasharray="4 3"
        />
        {inY.map((y, i) => (
          <circle key={`i${i}`} cx={cols[0]} cy={y} r={8} fill={`${c}22`} stroke={MUTE} strokeWidth={1.25} />
        ))}
        {hY.map((y, i) => (
          <circle key={`h1${i}`} cx={cols[1]} cy={y} r={8} fill={`${c}33`} stroke={c} strokeWidth={1.5} />
        ))}
        {hY.map((y, i) => (
          <circle key={`h2${i}`} cx={cols[2]} cy={y} r={8} fill={`${c}33`} stroke={c} strokeWidth={1.5} />
        ))}
        <circle cx={outX} cy={outY} r={10} fill={`${GOLD}33`} stroke={GOLD} strokeWidth={1.75} />
        <text x={outX} y={outY + 4} textAnchor="middle" fontSize={9} fill={GOLD} fontFamily="monospace">L</text>
      </g>
    )
  },
  'dna-replication': c => {
    // Parental duplex unwinding at a fork: the leading strand (accent) runs
    // continuously, the lagging strand (gold) is stitched from Okazaki fragments.
    const r = (v: number) => Math.round(v * 100) / 100
    const FORK = 152
    const helix = (s: number) =>
      Array.from({ length: 25 }, (_, i) => {
        const x = 8 + i * 6
        return `${x},${r(60 + s * 15 * Math.sin((x - 8) / 11))}`
      }).join(' ')
    const open = (x: number) => Math.min(1, (x - FORK) / 56)
    const template = (s: number) =>
      Array.from({ length: 15 }, (_, i) => {
        const x = FORK + i * 10
        return `${x},${r(60 + s * 28 * open(x))}`
      }).join(' ')
    const nascent = (s: number, from: number, to: number) => {
      const pts: string[] = []
      for (let x = from; x <= to; x += 8) pts.push(`${x},${r(60 + s * 28 * open(x) - s * 9)}`)
      return pts.join(' ')
    }
    const rungs: ReactNode[] = []
    for (let i = 0; i <= 24; i += 2) {
      const x = 8 + i * 6
      const dy = r(15 * Math.sin((x - 8) / 11))
      rungs.push(<line key={x} x1={x} y1={60 + dy} x2={x} y2={60 - dy} stroke={FAINT} strokeWidth={1} />)
    }
    return (
      <g>
        {rungs}
        <polyline points={helix(1)} fill="none" stroke={MUTE} strokeWidth={1.5} />
        <polyline points={helix(-1)} fill="none" stroke={MUTE} strokeWidth={1.5} />
        <polyline points={template(-1)} fill="none" stroke={MUTE} strokeWidth={1.5} />
        <polyline points={template(1)} fill="none" stroke={MUTE} strokeWidth={1.5} />
        <polyline points={nascent(-1, 160, 292)} fill="none" stroke={c} strokeWidth={2.5} />
        {[[166, 206], [212, 252], [258, 292]].map(([a, b]) => (
          <polyline key={a} points={nascent(1, a, b)} fill="none" stroke={GOLD} strokeWidth={2.5} />
        ))}
        <polygon points={`${FORK + 9},60 ${FORK - 7},51 ${FORK - 7},69`} fill={GOLD} opacity={0.85} />
        <text x={292} y={38} textAnchor="end" fontSize={8} fill={MUTE} fontFamily="monospace">leading</text>
        <text x={292} y={104} textAnchor="end" fontSize={8} fill={MUTE} fontFamily="monospace">lagging</text>
      </g>
    )
  },
  'p-vs-np': c => {
    // P nested inside NP with the NP-complete frontier, beside poly vs exp growth.
    const poly = '216,100 234,97 252,92 270,85 288,76'
    const exp = '216,100 234,99 252,95 270,78 288,24'
    return (
      <g>
        <ellipse cx={110} cy={60} rx={92} ry={50} fill={`${c}14`} stroke={c} strokeWidth={1.25} />
        <text x={110} y={26} textAnchor="middle" fontSize={10} fill={c} fontFamily="monospace">NP</text>
        <ellipse cx={160} cy={60} rx={34} ry={24} fill={`${c}33`} stroke={c} strokeWidth={1} strokeDasharray="3 2" />
        <text x={160} y={63} textAnchor="middle" fontSize={7} fill={c} fontFamily="monospace">NP-complete</text>
        <ellipse cx={72} cy={60} rx={40} ry={28} fill={`${GOLD}22`} stroke={GOLD} strokeWidth={1.25} />
        <text x={72} y={65} textAnchor="middle" fontSize={13} fill={GOLD} fontFamily="monospace">P</text>
        <line x1={206} y1={14} x2={206} y2={106} stroke={FAINT} strokeWidth={1} />
        <polyline points={poly} fill="none" stroke={c} strokeWidth={1.75} />
        <polyline points={exp} fill="none" stroke={GOLD} strokeWidth={1.75} />
        <text x={264} y={94} fontSize={8} fill={c} fontFamily="monospace">n³</text>
        <text x={268} y={20} fontSize={8} fill={GOLD} fontFamily="monospace">2ⁿ</text>
        <text x={216} y={112} fontSize={7} fill={MUTE} fontFamily="monospace">poly vs exp</text>
      </g>
    )
  },
  'nash-equilibrium': c => {
    // Prisoner's Dilemma matrix. Violet marks A's best reply down each column,
    // gold marks B's best reply across each row; the cell carrying both is the
    // equilibrium — and it is the worst mutual outcome on the board.
    const cells = [
      { x: 96, y: 26, a: 3, b: 3, brA: false, brB: false },
      { x: 158, y: 26, a: 0, b: 5, brA: false, brB: true },
      { x: 96, y: 66, a: 5, b: 0, brA: true, brB: false },
      { x: 158, y: 66, a: 1, b: 1, brA: true, brB: true },
    ]
    return (
      <g>
        <text x={96} y={12} fontSize={7} fill={MUTE} fontFamily="monospace">B plays</text>
        <text x={78} y={66} fontSize={7} fill={MUTE} fontFamily="monospace" textAnchor="middle" transform="rotate(-90 78 66)">A plays</text>
        <text x={127} y={20} fontSize={8} fill={MUTE} fontFamily="monospace" textAnchor="middle">C</text>
        <text x={189} y={20} fontSize={8} fill={MUTE} fontFamily="monospace" textAnchor="middle">D</text>
        <text x={88} y={53} fontSize={8} fill={MUTE} fontFamily="monospace" textAnchor="end">C</text>
        <text x={88} y={93} fontSize={8} fill={MUTE} fontFamily="monospace" textAnchor="end">D</text>
        {cells.map(k => {
          const cx = k.x + 31
          const ty = k.y + 24
          const eq = k.brA && k.brB
          return (
            <g key={`${k.x},${k.y}`}>
              <rect x={k.x} y={k.y} width={62} height={40} fill={eq ? `${GOLD}22` : FAINT}
                stroke={eq ? GOLD : MUTE} strokeWidth={eq ? 1.5 : 0.6} />
              <text x={cx - 14} y={ty} fontSize={12} fill={k.brA ? c : MUTE} fontFamily="monospace" textAnchor="middle">{k.a}</text>
              <text x={cx} y={ty} fontSize={9} fill={MUTE} fontFamily="monospace" textAnchor="middle">,</text>
              <text x={cx + 14} y={ty} fontSize={12} fill={k.brB ? GOLD : MUTE} fontFamily="monospace" textAnchor="middle">{k.b}</text>
              {k.brA && <line x1={cx - 22} y1={ty + 5} x2={cx - 6} y2={ty + 5} stroke={c} strokeWidth={1.5} />}
              {k.brB && <line x1={cx + 6} y1={ty + 5} x2={cx + 22} y2={ty + 5} stroke={GOLD} strokeWidth={1.5} />}
            </g>
          )
        })}
        <line x1={226} y1={16} x2={226} y2={104} stroke={FAINT} strokeWidth={1} />
        <rect x={232} y={32} width={10} height={10} fill={`${GOLD}22`} stroke={GOLD} strokeWidth={1} />
        <text x={247} y={41} fontSize={7} fill={MUTE} fontFamily="monospace">Nash</text>
        <line x1={232} y1={56} x2={242} y2={56} stroke={c} strokeWidth={2} />
        <text x={247} y={59} fontSize={7} fill={MUTE} fontFamily="monospace">A best</text>
        <line x1={232} y1={72} x2={242} y2={72} stroke={GOLD} strokeWidth={2} />
        <text x={247} y={75} fontSize={7} fill={MUTE} fontFamily="monospace">B best</text>
        <text x={232} y={98} fontSize={7} fill={MUTE} fontFamily="monospace">stable ≠ best</text>
      </g>
    )
  },
  'the-derivative': c => {
    // A cubic with a secant (mute) collapsing toward the tangent (gold) at the point.
    const y = (x: number) => { const t = (x - 150) / 70; return Math.round((62 + 28 * ((t * t * t) / 3 - t)) * 100) / 100 }
    const curve = Array.from({ length: 61 }, (_, i) => { const x = i * 5; return `${x},${y(x)}` }).join(' ')
    return (
      <g>
        <line x1={0} y1={62} x2={300} y2={62} stroke={MUTE} strokeWidth={0.75} />
        <polyline points={curve} fill="none" stroke={c} strokeWidth={2} />
        <line x1={60} y1={77.7} x2={270} y2={41} stroke={MUTE} strokeWidth={1.25} />
        <line x1={60} y1={98} x2={240} y2={26} stroke={GOLD} strokeWidth={1.75} />
        <line x1={150} y1={62} x2={241} y2={62} stroke={FAINT} strokeWidth={1} strokeDasharray="3 3" />
        <line x1={241} y1={62} x2={241} y2={46.11} stroke={FAINT} strokeWidth={1} strokeDasharray="3 3" />
        <circle cx={241} cy={46.11} r={3} fill={MUTE} />
        <circle cx={150} cy={62} r={4} fill={GOLD} />
      </g>
    )
  },
  'halting-problem': c => {
    // Machines (rows) vs inputs (columns). The diagonal is highlighted, and the
    // contrarian row D below it flips every diagonal entry — so D can equal no row.
    const h = (i: number, j: number) => (i * i + 3 * i * j + 5 * j + 2) % 7 < 4
    const cx = (j: number) => 36 + j * 24
    const ry = (i: number) => 14 + i * 21
    const mark = (key: string, x: number, y: number, halts: boolean, color: string) =>
      halts
        ? <circle key={key} cx={x + 10} cy={y + 9} r={3} fill={color} />
        : <line key={key} x1={x + 5} y1={y + 9} x2={x + 15} y2={y + 9} stroke={color} strokeWidth={1.5} />
    const cells: ReactNode[] = []
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = cx(j), y = ry(i), diag = i === j
        cells.push(
          <rect key={`r${i}${j}`} x={x} y={y} width={20} height={18}
            fill={diag ? `${GOLD}26` : FAINT} stroke={diag ? GOLD : FAINT} strokeWidth={diag ? 1 : 0.5} />
        )
        cells.push(mark(`m${i}${j}`, x, y, h(i, j), diag ? GOLD : c))
      }
      cells.push(<text key={`p${i}`} x={10} y={ry(i) + 13} fontSize={7} fill={MUTE} fontFamily="monospace">P{i + 1}</text>)
      cells.push(<text key={`c${i}`} x={cx(i) + 4} y={10} fontSize={6} fill={MUTE} fontFamily="monospace">in{i + 1}</text>)
    }
    const drow: ReactNode[] = []
    for (let j = 0; j < 4; j++) {
      const x = cx(j)
      drow.push(<rect key={`dr${j}`} x={x} y={100} width={20} height={18} fill={`${c}22`} stroke={c} strokeWidth={1} />)
      drow.push(mark(`dm${j}`, x, 100, !h(j, j), c))
    }
    return (
      <g>
        {cells}
        <text x={130} y={52} fontSize={9} fill={MUTE} fontFamily="monospace">…</text>
        <line x1={8} y1={96} x2={132} y2={96} stroke={FAINT} strokeWidth={0.5} />
        {drow}
        <text x={10} y={113} fontSize={8} fill={c} fontFamily="monospace">D</text>
        <text x={130} y={113} fontSize={9} fill={MUTE} fontFamily="monospace">…</text>
        <text x={150} y={30} fontSize={7} fill={MUTE} fontFamily="monospace">assume HALTS exists</text>
        <text x={150} y={48} fontSize={7} fill={GOLD} fontFamily="monospace">flip the diagonal</text>
        <text x={150} y={62} fontSize={7} fill={c} fontFamily="monospace">D differs from row k</text>
        <text x={150} y={72} fontSize={7} fill={c} fontFamily="monospace">at column k</text>
        <text x={150} y={92} fontSize={7} fill={MUTE} fontFamily="monospace">so D is in no row</text>
        <text x={150} y={108} fontSize={8} fill={GOLD} fontFamily="monospace">HALTS cannot exist</text>
      </g>
    )
  },
  'epidemic-models': c => {
    // SIR curves for R0 = 3: S drains past the 1/R0 line (overshoot), I peaks there.
    // Trajectories were integrated offline and baked in, so nothing is computed at render.
    const S = '10,16 18,17 26,18 34,19 42,22 50,26 58,32 66,41 74,51 82,61 90,71 98,79 106,85 114,89 122,92 130,95 138,96 146,97 154,98 162,99 170,99 178,100 186,100 194,100 202,100 210,100 218,100 226,100 234,100 242,101 250,101 258,101 266,101 274,101 282,101 290,101'
    const R = '10,106 18,106 26,106 34,105 42,104 50,103 58,100 66,97 74,92 82,85 90,78 98,70 106,62 114,56 122,49 130,44 138,40 146,36 154,33 162,31 170,29 178,27 186,26 194,25 202,24 210,24 218,23 226,23 234,22 242,22 250,22 258,22 266,22 274,22 282,22 290,22'
    const I = '10,105 18,104 26,103 34,101 42,97 50,91 58,83 66,73 74,61 82,52 90,47 98,46 106,50 114,56 122,62 130,69 138,75 146,81 154,86 162,89 170,93 178,95 186,98 194,99 202,101 210,102 218,103 226,103 234,104 242,104 250,105 258,105 266,105 274,105 282,105 290,106'
    return (
      <g>
        <line x1={10} y1={106} x2={290} y2={106} stroke={FAINT} strokeWidth={1} />
        <line x1={10} y1={76} x2={290} y2={76} stroke={GOLD} strokeWidth={1} strokeDasharray="5 4" opacity={0.7} />
        <polyline points={S} fill="none" stroke={MUTE} strokeWidth={1.5} />
        <polyline points={R} fill="none" stroke={`${c}55`} strokeWidth={1.5} />
        <polyline points={I} fill="none" stroke={c} strokeWidth={2} />
        <line x1={98} y1={46} x2={98} y2={106} stroke={GOLD} strokeWidth={0.75} strokeDasharray="3 3" opacity={0.5} />
        <circle cx={98} cy={46} r={3.5} fill={GOLD} />
        <text x={106} y={42} fontSize={8} fill={GOLD} fontFamily="monospace">peak · Rt = 1</text>
        <text x={14} y={72} fontSize={8} fill={GOLD} fontFamily="monospace">S = 1/R₀</text>
        <text x={296} y={104} textAnchor="end" fontSize={8} fill={MUTE} fontFamily="monospace">S</text>
        <text x={296} y={18} textAnchor="end" fontSize={8} fill={c} fontFamily="monospace">R</text>
        <text x={80} y={116} textAnchor="middle" fontSize={8} fill={c} fontFamily="monospace">I</text>
      </g>
    )
  },
  resonance: c => {
    // Amplitude response for three Q values: the peak grows tall and narrow as damping falls.
    const curve = (q: number) =>
      Array.from({ length: 61 }, (_, i) => {
        const r = 0.1 + (i / 60) * 2.1
        const g = 1 / Math.sqrt((1 - r * r) ** 2 + (r / q) ** 2)
        const x = Math.round((10 + (i / 60) * 280) * 100) / 100
        const y = Math.round((108 - Math.min(g, 6.4) * 14.7) * 100) / 100
        return `${x},${y}`
      }).join(' ')
    return (
      <g>
        <line x1={10} y1={108} x2={290} y2={108} stroke={MUTE} strokeWidth={0.75} />
        <line x1={130} y1={14} x2={130} y2={108} stroke={FAINT} strokeWidth={1} strokeDasharray="3 3" />
        <polyline points={curve(1.1)} fill="none" stroke={FAINT} strokeWidth={1.25} />
        <polyline points={curve(2.2)} fill="none" stroke={MUTE} strokeWidth={1.25} />
        <polyline points={curve(6)} fill="none" stroke={c} strokeWidth={2} />
        <circle cx={130} cy={19.8} r={4} fill={GOLD} />
        <text x={134} y={26} fill={MUTE} fontSize={8} fontFamily="monospace">ω₀</text>
        <text x={236} y={104} fill={MUTE} fontSize={8} fontFamily="monospace">ω</text>
      </g>
    )
  },
  'electromagnetic-waves': c => {
    // A plane wave travelling right: E oscillating vertically (accent), B on a
    // skewed axis 90 deg away in space but exactly in phase in time (gold).
    const r = (v: number) => Math.round(v * 100) / 100
    const XA = 24, XB = 262, PER = 119, EA = 34, BA = 26, UX = 0.86, UY = 0.5
    const s = (x: number) => Math.sin(((x - XA) * 2 * Math.PI) / PER)
    const ePts: string[] = []
    const bPts: string[] = []
    for (let x = XA; x <= XB; x += 2) {
      ePts.push(`${x},${r(60 - EA * s(x))}`)
      bPts.push(`${r(x + UX * BA * s(x))},${r(60 + UY * BA * s(x))}`)
    }
    const sticks: ReactNode[] = []
    for (let x = XA; x <= XB; x += 17) {
      const v = s(x)
      sticks.push(
        <g key={x}>
          <line x1={x} y1={60} x2={x} y2={r(60 - EA * v)} stroke={c} strokeWidth={0.75} opacity={0.4} />
          <line x1={x} y1={60} x2={r(x + UX * BA * v)} y2={r(60 + UY * BA * v)} stroke={GOLD} strokeWidth={0.75} opacity={0.35} />
        </g>
      )
    }
    return (
      <g>
        <line x1={8} y1={60} x2={288} y2={60} stroke={MUTE} strokeWidth={0.75} />
        {sticks}
        <polyline points={bPts.join(' ')} fill="none" stroke={GOLD} strokeWidth={1.75} />
        <polyline points={ePts.join(' ')} fill="none" stroke={c} strokeWidth={2.25} />
        <line x1={266} y1={60} x2={282} y2={60} stroke={GOLD} strokeWidth={1.5} />
        <polygon points="290,60 280,56 280,64" fill={GOLD} />
        <text x={272} y={50} fontSize={9} fill={GOLD} fontFamily="monospace">c</text>
        <text x={8} y={30} fontSize={9} fill={c} fontFamily="monospace">E</text>
        <text x={8} y={100} fontSize={9} fill={GOLD} fontFamily="monospace">B</text>
        <text x={104} y={114} fontSize={8} fill={MUTE} fontFamily="monospace">c = 1/√(μ₀ε₀)</text>
      </g>
    )
  },
  'chemical-equilibrium': c => {
    // Forward and reverse rates converging onto a common plateau.
    const PLATEAU = 0.5
    const pts = (f: (t: number) => number) =>
      Array.from({ length: 26 }, (_, i) => {
        const t = i / 25
        const x = 30 + i * 10
        const y = Math.round((100 - 60 * f(t)) * 100) / 100
        return `${x},${y}`
      }).join(' ')
    const forward = pts(t => PLATEAU + 0.45 * Math.exp(-3 * t))
    const reverse = pts(t => PLATEAU - 0.5 * Math.exp(-3 * t))
    return (
      <g>
        <line x1={30} y1={16} x2={30} y2={100} stroke={MUTE} strokeWidth={0.75} />
        <line x1={30} y1={100} x2={288} y2={100} stroke={MUTE} strokeWidth={0.75} />
        <line x1={30} y1={70} x2={288} y2={70} stroke={MUTE} strokeWidth={0.75} strokeDasharray="3 3" />
        <polyline points={forward} fill="none" stroke={c} strokeWidth={2} />
        <polyline points={reverse} fill="none" stroke={GOLD} strokeWidth={2} />
        <circle cx={280} cy={70} r={3} fill={GOLD} />
        <circle cx={280} cy={70} r={6} fill="none" stroke={c} strokeWidth={0.75} />
        <text x={34} y={26} fontSize={8} fill={MUTE} fontFamily="monospace">rate</text>
        <text x={40} y={36} fontSize={8} fill={c} fontFamily="monospace">forward</text>
        <text x={40} y={113} fontSize={8} fill={GOLD} fontFamily="monospace">reverse</text>
        <text x={196} y={64} fontSize={8} fill={MUTE} fontFamily="monospace">rate_f = rate_r</text>
        <text x={150} y={16} fontSize={11} fill={c} fontFamily="monospace" textAnchor="middle">A ⇌ B</text>
      </g>
    )
  },
  'chemical-bonding': c => {
    // Morse well: V(r) = De(1 - e^{-a(r-r0)})^2 - De, sampled and rounded to integers.
    const pts = Array.from({ length: 47 }, (_, i) => {
      const r = 0.32 + i * (2.28 / 46)
      const t = 1 - Math.exp(-1.94 * (r - 0.74))
      const V = 4.52 * t * t - 4.52
      const x = Math.round(20 + ((r - 0.32) / 2.28) * 270)
      const y = Math.round(14 + (3 - V) * 10.9)
      return `${x},${y}`
    }).join(' ')
    return (
      <g>
        <line x1={16} y1={47} x2={294} y2={47} stroke={MUTE} strokeWidth={0.75} strokeDasharray="4 4" />
        <polyline points={pts} fill="none" stroke={c} strokeWidth={2} />
        <line x1={70} y1={96} x2={70} y2={110} stroke={FAINT} strokeWidth={1} />
        <line x1={34} y1={47} x2={34} y2={96} stroke={GOLD} strokeWidth={1} />
        <line x1={30} y1={47} x2={38} y2={47} stroke={GOLD} strokeWidth={1} />
        <line x1={30} y1={96} x2={38} y2={96} stroke={GOLD} strokeWidth={1} />
        <text x={42} y={76} fill={GOLD} fontSize={9} fontFamily="monospace">De</text>
        <circle cx={63} cy={96} r={5} fill={GOLD} />
        <circle cx={78} cy={96} r={5} fill={GOLD} />
        <text x={70} y={116} textAnchor="middle" fill={MUTE} fontSize={9} fontFamily="monospace">r0</text>
        <text x={252} y={40} textAnchor="middle" fill={MUTE} fontSize={8} fontFamily="monospace">E = 0</text>
      </g>
    )
  },
  'acids-and-bases': c => {
    // Weak-acid titration curve: a long buffering plateau through pH = pKa at
    // half-equivalence, then the near-vertical jump at the equivalence point.
    const curve = [
      [12, 96], [20, 88], [30, 82], [44, 77], [62, 72], [80, 68],
      [100, 63], [122, 58], [142, 52], [156, 46], [166, 38], [172, 27],
      [178, 18], [188, 15], [210, 13], [244, 12], [290, 11],
    ].map(([x, y]) => `${x},${y}`).join(' ')
    return (
      <g>
        <rect x={40} y={10} width={112} height={100} fill={FAINT} />
        <line x1={10} y1={110} x2={292} y2={110} stroke={MUTE} strokeWidth={0.75} />
        <line x1={10} y1={8} x2={10} y2={110} stroke={MUTE} strokeWidth={0.75} />
        <line x1={10} y1={63} x2={100} y2={63} stroke={GOLD} strokeWidth={0.75} strokeDasharray="3 3" />
        <line x1={100} y1={63} x2={100} y2={110} stroke={GOLD} strokeWidth={0.75} strokeDasharray="3 3" />
        <line x1={172} y1={10} x2={172} y2={110} stroke={MUTE} strokeWidth={0.75} strokeDasharray="2 4" />
        <polyline points={curve} fill="none" stroke={c} strokeWidth={2.25} />
        <circle cx={100} cy={63} r={3} fill={GOLD} />
        <circle cx={172} cy={27} r={3.5} fill={c} />
        <text x={14} y={59} fontSize={7} fill={GOLD} fontFamily="monospace">pKa</text>
        <text x={46} y={104} fontSize={7} fill={MUTE} fontFamily="monospace">buffer</text>
        <text x={178} y={40} fontSize={7} fill={MUTE} fontFamily="monospace">eq. pt</text>
      </g>
    )
  },
  electrochemistry: c => {
    // Two half-cells joined by a salt bridge; electrons detour through an
    // external circuit and light a lamp on the way.
    const ions: ReactNode[] = []
    const left = [[36, 78], [50, 92], [78, 76], [92, 94], [64, 98]]
    const right = [[200, 78], [214, 94], [228, 76], [256, 92], [268, 80]]
    left.forEach(([x, y], i) => ions.push(
      <circle key={`l${i}`} cx={x} cy={y} r={2} fill={c} opacity={0.75} />
    ))
    right.forEach(([x, y], i) => ions.push(
      <circle key={`r${i}`} cx={x} cy={y} r={2} fill={MUTE} />
    ))
    return (
      <g>
        <rect x={18} y={64} width={100} height={44} fill={FAINT} />
        <rect x={182} y={64} width={100} height={44} fill={FAINT} />
        <path d="M 18 52 L 18 108 L 118 108 L 118 52" fill="none" stroke={MUTE} strokeWidth={1.5} />
        <path d="M 182 52 L 182 108 L 282 108 L 282 52" fill="none" stroke={MUTE} strokeWidth={1.5} />
        <path d="M 100 74 L 100 44 L 200 44 L 200 74" fill="none" stroke={c} strokeWidth={5} opacity={0.3} strokeLinejoin="round" />
        <path d="M 100 74 L 100 44 L 200 44 L 200 74" fill="none" stroke={c} strokeWidth={1} strokeLinejoin="round" />
        <path d="M 58 40 L 58 22 L 242 22 L 242 40" fill="none" stroke={MUTE} strokeWidth={1.5} />
        <rect x={56} y={40} width={4} height={58} fill={MUTE} />
        <rect x={238} y={40} width={8} height={58} fill={c} />
        <circle cx={150} cy={22} r={11} fill={GOLD} opacity={0.18} />
        <circle cx={150} cy={22} r={6} fill={GOLD} />
        <circle cx={88} cy={22} r={2.5} fill={c} />
        <circle cx={116} cy={22} r={2.5} fill={c} />
        <circle cx={186} cy={22} r={2.5} fill={c} />
        <circle cx={214} cy={22} r={2.5} fill={c} />
        {ions}
      </g>
    )
  },
  'reaction-kinetics': c => {
    // Reaction coordinate: the catalysed path drops the barrier while the
    // reactant and product levels — and hence the overall dG — stay put.
    const path = (amp: number) => {
      const pts: string[] = []
      for (let i = 0; i <= 56; i++) {
        const t = i / 56
        const s = Math.min(1, Math.max(0, (t - 0.2) / 0.6))
        const base = 70 + 25 * (s * s * (3 - 2 * s))
        const u = Math.min(1, Math.max(0, (t - 0.12) / 0.76))
        const bump = Math.sin(Math.PI * u) ** 2
        // x = 10 + i * 5 is an exact integer; only y needs rounding.
        pts.push(`${10 + i * 5},${Math.round((base - amp * bump) * 100) / 100}`)
      }
      return pts.join(' ')
    }
    return (
      <g>
        <line x1={0} y1={114} x2={300} y2={114} stroke={FAINT} strokeWidth={1} />
        <line x1={10} y1={70} x2={290} y2={70} stroke={MUTE} strokeWidth={0.75} strokeDasharray="4 4" />
        <line x1={10} y1={95} x2={290} y2={95} stroke={MUTE} strokeWidth={0.75} strokeDasharray="4 4" />
        <polyline points={path(64)} fill="none" stroke={GOLD} strokeWidth={1.25} strokeDasharray="5 4" strokeLinejoin="round" />
        <polyline points={path(38)} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" />
        <circle cx={142} cy={19} r={2} fill={GOLD} />
        <circle cx={142} cy={45} r={2.5} fill={c} />
        <line x1={264} y1={70} x2={264} y2={95} stroke={GOLD} strokeWidth={1} />
        <line x1={261} y1={70} x2={267} y2={70} stroke={GOLD} strokeWidth={1} />
        <line x1={261} y1={95} x2={267} y2={95} stroke={GOLD} strokeWidth={1} />
        <text x={100} y={14} fontSize={7} fill={GOLD} fontFamily="monospace">Ea</text>
        <text x={152} y={40} fontSize={7} fill={c} fontFamily="monospace">Ea&#39;</text>
        <text x={270} y={85} fontSize={7} fill={GOLD} fontFamily="monospace">dG</text>
        <text x={14} y={66} fontSize={7} fill={MUTE} fontFamily="monospace">reactants</text>
        <text x={198} y={106} fontSize={7} fill={MUTE} fontFamily="monospace">products</text>
      </g>
    )
  },
  'atomic-structure': c => {
    // p-orbital lobe pair beside the table's s/d/p blocks, with row lengths.
    const rows: Array<[number, number[]]> = [
      [30, [1, 18]],
      [39, [1, 2, 13, 14, 15, 16, 17, 18]],
      [48, [1, 2, 13, 14, 15, 16, 17, 18]],
      [57, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]],
    ]
    const lengths = ['2', '8', '8', '18']
    const cells: ReactNode[] = []
    rows.forEach(([y, cols], r) => {
      cols.forEach(g => {
        const fill = g <= 2 ? GOLD : g >= 13 ? c : MUTE
        cells.push(
          <rect key={`${r}-${g}`} x={110 + (g - 1) * 9} y={y} width={8} height={8} rx={1} fill={fill} opacity={0.85} />
        )
      })
      cells.push(
        <text key={`n-${r}`} x={276} y={y + 7} fontSize={7} fill={MUTE} fontFamily="monospace">{lengths[r]}</text>
      )
    })
    return (
      <g>
        <rect x={104} y={24} width={180} height={62} rx={3} fill={FAINT} />
        <ellipse cx={58} cy={36} rx={17} ry={24} fill={c} opacity={0.55} />
        <ellipse cx={58} cy={84} rx={17} ry={24} fill={c} opacity={0.55} />
        <ellipse cx={58} cy={36} rx={9} ry={13} fill={c} opacity={0.5} />
        <ellipse cx={58} cy={84} rx={9} ry={13} fill={c} opacity={0.5} />
        <line x1={30} y1={60} x2={86} y2={60} stroke={MUTE} strokeWidth={1} strokeDasharray="3 3" />
        <circle cx={58} cy={60} r={3} fill={GOLD} />
        <text x={58} y={116} textAnchor="middle" fontSize={9} fill={MUTE} fontFamily="monospace">2p</text>
        {cells}
        <text x={119} y={78} textAnchor="middle" fontSize={8} fill={GOLD} fontFamily="monospace">s</text>
        <text x={173} y={78} textAnchor="middle" fontSize={8} fill={MUTE} fontFamily="monospace">d</text>
        <text x={245} y={78} textAnchor="middle" fontSize={8} fill={c} fontFamily="monospace">p</text>
      </g>
    )
  },
  'fluid-dynamics': c => {
    // Smooth streamlines part around a cylinder on the left; downstream the wake
    // rolls up into a staggered von Karman vortex street.
    const R = (v: number) => Math.round(v * 100) / 100
    const streams = [10, 22, 34, 46, -10, -22, -34, -46].map(d => {
      const pts: string[] = []
      for (let i = 0; i <= 24; i++) {
        const x = i * 4
        const t = (x - 110) / 26
        pts.push(`${x},${R(60 + d + (93 / d) * Math.exp(-t * t))}`)
      }
      return pts.join(' ')
    })
    const shear = [1, -1].map(s => {
      const pts: string[] = []
      for (let i = 0; i <= 43; i++) {
        const x = 124 + i * 4
        const u = x - 124
        pts.push(`${x},${R(60 + s * (10 + 0.05 * u) + s * 3.4 * Math.sin(u / 13))}`)
      }
      return pts.join(' ')
    })
    const eddies: [number, number, number][] = [
      [140, 48, 1], [170, 72, -1], [200, 48, 1],
      [230, 72, -1], [260, 48, 1], [288, 72, -1],
    ]
    const spirals = eddies.map(([ex, ey, dir]) => {
      const pts: string[] = []
      for (let i = 0; i <= 26; i++) {
        const t = i * 0.31
        const r = 1 + 0.62 * t
        pts.push(`${R(ex + r * Math.cos(t * dir))},${R(ey + r * Math.sin(t * dir))}`)
      }
      return pts.join(' ')
    })
    return (
      <g>
        {streams.map((p, i) => (
          <polyline key={`s${i}`} points={p} fill="none" stroke={c} strokeWidth={1.25} opacity={0.75} />
        ))}
        {shear.map((p, i) => (
          <polyline key={`w${i}`} points={p} fill="none" stroke={MUTE} strokeWidth={0.75} strokeDasharray="3 3" />
        ))}
        {spirals.map((p, i) => (
          <polyline key={`v${i}`} points={p} fill="none" stroke={i % 2 === 0 ? GOLD : c} strokeWidth={1.5} strokeLinecap="round" />
        ))}
        <circle cx={110} cy={60} r={13} fill={FAINT} stroke={MUTE} strokeWidth={1.25} />
        <line x1={124} y1={14} x2={124} y2={106} stroke={FAINT} strokeWidth={1} />
        <text x={4} y={16} fill={MUTE} fontSize={8} fontFamily="monospace">laminar</text>
        <text x={246} y={16} fill={GOLD} fontSize={8} fontFamily="monospace">Re &#8593;</text>
      </g>
    )
  },
  'phase-transitions': c => {
    // Heating curve for 1 g of water: temperature against energy added, with the
    // two flat plateaus where latent heat goes in and T does not move. Plateau
    // widths are to true scale, so boiling is visibly ~7x melting.
    const pts = '24,100 29,86 57,86 92,39 279,39 286,20'
    return (
      <g>
        <line x1={24} y1={14} x2={24} y2={104} stroke={MUTE} strokeWidth={0.75} />
        <line x1={24} y1={104} x2={292} y2={104} stroke={MUTE} strokeWidth={0.75} />
        <line x1={24} y1={86} x2={292} y2={86} stroke={FAINT} strokeWidth={0.75} strokeDasharray="3 3" />
        <line x1={24} y1={39} x2={292} y2={39} stroke={FAINT} strokeWidth={0.75} strokeDasharray="3 3" />
        <line x1={29} y1={86} x2={57} y2={86} stroke={GOLD} strokeWidth={4} strokeLinecap="round" />
        <line x1={92} y1={39} x2={279} y2={39} stroke={GOLD} strokeWidth={4} strokeLinecap="round" />
        <polyline points={pts} fill="none" stroke={c} strokeWidth={2} />
        <circle cx={29} cy={86} r={2.5} fill={c} />
        <circle cx={92} cy={39} r={2.5} fill={c} />
        <text x={43} y={99} fontSize={8} fill={GOLD} fontFamily="monospace" textAnchor="middle">Lfus</text>
        <text x={185} y={52} fontSize={8} fill={GOLD} fontFamily="monospace" textAnchor="middle">Lvap</text>
        <text x={30} y={80} fontSize={8} fill={MUTE} fontFamily="monospace">0 °C</text>
        <text x={150} y={33} fontSize={8} fill={MUTE} fontFamily="monospace">100 °C</text>
        <text x={8} y={22} fontSize={9} fill={c} fontFamily="monospace">T</text>
        <text x={198} y={114} fontSize={8} fill={MUTE} fontFamily="monospace">energy added</text>
      </g>
    )
  },
  'protein-folding': c => {
    // An extended chain collapsing into a compact fold with hydrophobic residues buried.
    const chain = [[14, 68], [27, 52], [40, 68], [53, 52], [66, 68], [79, 52], [92, 68], [105, 52], [118, 68]]
    const fold = [[205, 40], [225, 40], [245, 40], [245, 60], [225, 60], [205, 60], [205, 80], [225, 80], [245, 80]]
    return (
      <g>
        <circle cx={225} cy={60} r={34} fill={FAINT} />
        <polyline points={chain.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={MUTE} strokeWidth={1.5} />
        {chain.map(([x, y], i) => (
          <circle key={`u${i}`} cx={x} cy={y} r={4}
            fill={i % 3 === 1 ? `${c}33` : 'rgba(255,255,255,0.03)'}
            stroke={i % 3 === 1 ? c : MUTE} strokeWidth={1} />
        ))}
        <line x1={132} y1={60} x2={166} y2={60} stroke={MUTE} strokeWidth={1} strokeDasharray="3 3" />
        <polygon points="174,60 166,56 166,64" fill={MUTE} />
        <polyline points={fold.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={MUTE} strokeWidth={1.5} />
        {fold.map(([x, y], i) => {
          const core = i === 3 || i === 4 || i === 7
          return (
            <circle key={`f${i}`} cx={x} cy={y} r={core ? 5 : 4}
              fill={core ? GOLD : `${c}33`} stroke={core ? GOLD : c} strokeWidth={1} />
          )
        })}
        <text x={66} y={98} textAnchor="middle" fontSize={8} fill={MUTE} fontFamily="monospace">unfolded</text>
        <text x={225} y={106} textAnchor="middle" fontSize={8} fill={GOLD} fontFamily="monospace">buried core</text>
      </g>
    )
  },
  'distributed-consensus': c => {
    // Five servers in a ring. The gold leader heartbeats outward, but a network
    // partition (dashed) strands two followers — their packets die at the line,
    // while the majority of three keeps committing entries in the log strip.
    const cells = [0, 1, 2, 3, 4, 5]
    return (
      <g>
        <line x1={88} y1={22} x2={124.1} y2={48.3} stroke={c} strokeWidth={1.25} strokeOpacity={0.45} />
        <line x1={88} y1={22} x2={110.3} y2={90.7} stroke={c} strokeWidth={1.25} strokeOpacity={0.45} />
        <line x1={124.1} y1={48.3} x2={110.3} y2={90.7} stroke={FAINT} strokeWidth={1} />
        <line x1={88} y1={22} x2={65.7} y2={90.7} stroke={FAINT} strokeWidth={1} />
        <line x1={88} y1={22} x2={51.9} y2={48.3} stroke={FAINT} strokeWidth={1} />
        <line x1={65.7} y1={90.7} x2={51.9} y2={48.3} stroke={FAINT} strokeWidth={1} />
        <circle cx={107.9} cy={36.5} r={2.2} fill={c} />
        <circle cx={100.3} cy={59.8} r={2.2} fill={c} />
        <circle cx={77} cy={55.9} r={1.8} fill={MUTE} />
        <circle cx={77} cy={30} r={1.8} fill={MUTE} />
        <line x1={77} y1={8} x2={77} y2={112} stroke={MUTE} strokeWidth={1} strokeDasharray="4 3" />
        <circle cx={65.7} cy={90.7} r={8} fill={FAINT} stroke={MUTE} strokeWidth={1.25} />
        <circle cx={51.9} cy={48.3} r={8} fill={FAINT} stroke={MUTE} strokeWidth={1.25} />
        <circle cx={124.1} cy={48.3} r={8} fill={`${c}33`} stroke={c} strokeWidth={1.5} />
        <circle cx={110.3} cy={90.7} r={8} fill={`${c}33`} stroke={c} strokeWidth={1.5} />
        <circle cx={88} cy={22} r={12.5} fill="none" stroke={GOLD} strokeWidth={1} strokeOpacity={0.35} />
        <circle cx={88} cy={22} r={8} fill={`${GOLD}33`} stroke={GOLD} strokeWidth={1.75} />
        <text x={160} y={34} fontSize={7} fill={MUTE} fontFamily="monospace">replicated log</text>
        {cells.map(i => (
          <rect key={i} x={160 + i * 22} y={44} width={18} height={14} rx={2}
            fill={i < 4 ? `${c}33` : i === 4 ? `${GOLD}26` : 'none'}
            stroke={i < 4 ? c : i === 4 ? GOLD : FAINT} strokeWidth={1} />
        ))}
        <text x={160} y={78} fontSize={7} fill={GOLD} fontFamily="monospace">quorum 3 of 5</text>
      </g>
    )
  },
  'carbon-cycle': c => {
    // Keeling-style seasonal sawtooth riding a steepening rise, above the
    // pre-industrial baseline. All emitted coordinates are explicitly rounded.
    const pts: string[] = []
    for (let i = 0; i <= 140; i++) {
      const u = i / 140
      const x = 10 + u * 280
      const trend = 98 - (26 * u + 52 * u * u)
      const wiggle = (3 + 2 * u) * Math.sin(u * 2 * Math.PI * 9)
      pts.push(`${Math.round(x * 100) / 100},${Math.round((trend - wiggle) * 100) / 100}`)
    }
    return (
      <g>
        <rect x={0} y={98} width={300} height={22} fill={FAINT} />
        <line x1={10} y1={98} x2={290} y2={98} stroke={GOLD} strokeWidth={0.75} strokeDasharray="4 4" />
        <text x={10} y={112} fontSize={7} fill={MUTE} fontFamily="monospace">1958 · 315 ppm</text>
        <text x={290} y={112} fontSize={7} fill={MUTE} fontFamily="monospace" textAnchor="end">2020s · 420 ppm</text>
        <polyline points={pts.join(' ')} fill="none" stroke={c} strokeWidth={1.5} strokeLinejoin="round" />
        <circle cx={290} cy={20} r={3.5} fill={c} />
        <line x1={252} y1={92} x2={252} y2={30} stroke={GOLD} strokeWidth={1} opacity={0.55} />
        <polygon points="252,26 249,33 255,33" fill={GOLD} opacity={0.8} />
        <text x={246} y={92} fontSize={6} fill={MUTE} fontFamily="monospace" textAnchor="end">one-way</text>
      </g>
    )
  },
  'greenhouse-effect': c => {
    // Sunlight passes straight through the layer; the surface's infrared does not.
    return (
      <g>
        <line x1={10} y1={14} x2={290} y2={14} stroke={FAINT} strokeWidth={1} strokeDasharray="3 4" />
        <rect x={10} y={44} width={280} height={22} rx={3} fill={c} opacity={0.12} />
        <rect x={10} y={44} width={280} height={22} rx={3} fill="none" stroke={c} strokeWidth={1} strokeDasharray="4 3" />
        <rect x={10} y={104} width={280} height={10} rx={2} fill={FAINT} />
        <line x1={10} y1={104} x2={290} y2={104} stroke={MUTE} strokeWidth={1.25} />
        <line x1={40} y1={6} x2={40} y2={96} stroke={GOLD} strokeWidth={3} />
        <path d="M 40 104 L 35 94 L 45 94 Z" fill={GOLD} />
        <line x1={64} y1={6} x2={64} y2={96} stroke={GOLD} strokeWidth={3} />
        <path d="M 64 104 L 59 94 L 69 94 Z" fill={GOLD} />
        <line x1={140} y1={104} x2={140} y2={76} stroke={c} strokeWidth={4} />
        <path d="M 140 66 L 135 77 L 145 77 Z" fill={c} />
        <line x1={140} y1={44} x2={140} y2={18} stroke={c} strokeWidth={1.5} opacity={0.65} />
        <path d="M 140 8 L 136 18 L 144 18 Z" fill={c} opacity={0.65} />
        <line x1={196} y1={44} x2={196} y2={18} stroke={c} strokeWidth={2.5} opacity={0.85} />
        <path d="M 196 8 L 191 18 L 201 18 Z" fill={c} opacity={0.85} />
        <line x1={252} y1={66} x2={252} y2={94} stroke={c} strokeWidth={2.5} opacity={0.8} />
        <path d="M 252 104 L 247 94 L 257 94 Z" fill={c} opacity={0.8} />
        <text x={196} y={94} textAnchor="middle" fontSize={8} fill={GOLD} fontFamily="monospace">+33 K</text>
      </g>
    )
  },
  'ocean-circulation': c => {
    // Conveyor in cross-section: warm surface flow poleward, sinking under the
    // sea ice, cold return at depth, upwelling in the south. Integers only.
    return (
      <g>
        <rect x={10} y={16} width={280} height={90} rx={4} fill="none" stroke={FAINT} strokeWidth={1} />
        <line x1={10} y1={32} x2={290} y2={32} stroke={FAINT} strokeWidth={0.75} strokeDasharray="3 3" />
        <line x1={10} y1={50} x2={17} y2={50} stroke={FAINT} strokeWidth={0.75} />
        <line x1={10} y1={70} x2={17} y2={70} stroke={FAINT} strokeWidth={0.75} />
        <line x1={10} y1={90} x2={17} y2={90} stroke={FAINT} strokeWidth={0.75} />
        {[236, 250, 264].map(x => (
          <rect key={x} x={x} y={26} width={11} height={5} rx={1} fill={MUTE} opacity={0.55} />
        ))}
        <path d="M 26 40 C 90 34 170 34 240 40" stroke={GOLD} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <path d="M 130 31 L 142 36 L 130 41 Z" fill={GOLD} />
        <path d="M 240 40 C 268 44 272 58 272 72 C 272 86 260 92 240 92 L 60 92" stroke={c} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <path d="M 267 62 L 277 62 L 272 74 Z" fill={c} />
        <path d="M 156 87 L 144 92 L 156 97 Z" fill={c} />
        <path d="M 60 92 C 34 92 26 74 26 56 L 26 40" stroke={MUTE} strokeWidth={2} fill="none" strokeLinecap="round" />
        <path d="M 21 62 L 31 62 L 26 50 Z" fill={MUTE} />
        <circle cx={60} cy={38} r={2} fill={GOLD} />
        <circle cx={100} cy={36} r={2} fill={GOLD} />
        <circle cx={180} cy={36} r={2} fill={GOLD} />
        <circle cx={200} cy={92} r={2} fill={c} />
        <circle cx={120} cy={92} r={2} fill={c} />
        <text x={62} y={28} fontSize={7} fill={GOLD} fontFamily="monospace">warm surface flow</text>
        <text x={104} y={104} fontSize={7} fill={c} fontFamily="monospace">cold return at depth</text>
      </g>
    )
  },
  'atmospheric-convection': c => {
    // One convection cell in cross-section: heated ground, a buoyant column
    // rising to a flat cloud base, anvil outflow aloft, dry subsidence returning
    // on both flanks. All literal integers — nothing to round, nothing to drift.
    return (
      <g>
        <line x1={10} y1={30} x2={290} y2={30} stroke={FAINT} strokeWidth={0.75} strokeDasharray="3 4" />
        <line x1={10} y1={86} x2={290} y2={86} stroke={FAINT} strokeWidth={0.75} strokeDasharray="3 4" />
        <rect x={10} y={104} width={280} height={6} rx={2} fill={`${GOLD}33`} stroke={GOLD} strokeWidth={0.75} />
        <line x1={130} y1={102} x2={130} y2={92} stroke={GOLD} strokeWidth={1} />
        <line x1={150} y1={102} x2={150} y2={90} stroke={GOLD} strokeWidth={1} />
        <line x1={170} y1={102} x2={170} y2={92} stroke={GOLD} strokeWidth={1} />
        <path d="M 142 100 C 136 86 148 76 142 62" fill="none" stroke={c} strokeWidth={1.5} />
        <path d="M 158 100 C 164 86 152 76 158 62" fill="none" stroke={c} strokeWidth={1.5} />
        <line x1={112} y1={62} x2={188} y2={62} stroke={MUTE} strokeWidth={0.75} strokeDasharray="4 3" />
        <circle cx={126} cy={48} r={14} fill={`${c}2E`} stroke={c} strokeWidth={0.75} />
        <circle cx={174} cy={48} r={14} fill={`${c}2E`} stroke={c} strokeWidth={0.75} />
        <circle cx={150} cy={42} r={20} fill={`${c}2E`} stroke={c} strokeWidth={0.75} />
        <rect x={112} y={54} width={76} height={8} fill={`${c}2E`} />
        <line x1={132} y1={28} x2={98} y2={24} stroke={c} strokeWidth={1} />
        <polyline points="104,21 98,24 104,27" fill="none" stroke={c} strokeWidth={1} />
        <line x1={168} y1={28} x2={202} y2={24} stroke={c} strokeWidth={1} />
        <polyline points="196,21 202,24 196,27" fill="none" stroke={c} strokeWidth={1} />
        <line x1={64} y1={34} x2={64} y2={94} stroke={MUTE} strokeWidth={1} />
        <polyline points="60,88 64,94 68,88" fill="none" stroke={MUTE} strokeWidth={1} />
        <line x1={236} y1={34} x2={236} y2={94} stroke={MUTE} strokeWidth={1} />
        <polyline points="232,88 236,94 240,88" fill="none" stroke={MUTE} strokeWidth={1} />
        <line x1={86} y1={99} x2={126} y2={99} stroke={GOLD} strokeWidth={1} />
        <polyline points="120,96 126,99 120,102" fill="none" stroke={GOLD} strokeWidth={1} />
        <line x1={214} y1={99} x2={174} y2={99} stroke={GOLD} strokeWidth={1} />
        <polyline points="180,96 174,99 180,102" fill="none" stroke={GOLD} strokeWidth={1} />
        <text x={64} y={30} textAnchor="middle" fontSize={7} fill={MUTE} fontFamily="monospace">dry</text>
        <text x={236} y={30} textAnchor="middle" fontSize={7} fill={MUTE} fontFamily="monospace">dry</text>
        <text x={150} y={16} textAnchor="middle" fontSize={7} fill={c} fontFamily="monospace">moist</text>
        <text x={196} y={72} textAnchor="middle" fontSize={7} fill={MUTE} fontFamily="monospace">LCL</text>
      </g>
    )
  },
  'plate-tectonics': c => {
    // Cross-section: spreading ridge (left) -> plate travelling right -> trench
    // and subducting slab (right), with a convection cell circulating beneath.
    // All coordinates are integer literals; nothing is computed at render time.
    return (
      <g>
        <line x1={0} y1={30} x2={300} y2={30} stroke={FAINT} strokeWidth={1} />
        <path
          d="M 0 30 L 300 30 L 300 34 L 232 34 L 222 74 L 214 72 L 170 58 L 116 52 L 92 46 L 88 50 L 84 46 L 60 52 L 0 60 Z"
          fill={`${c}0D`}
        />
        <ellipse cx={110} cy={90} rx={64} ry={22} fill="none" stroke={c} strokeWidth={1} strokeDasharray="3 3" opacity={0.35} />
        <polygon points="174,97 170,88 178,88" fill={c} opacity={0.55} />
        <polygon points="46,83 42,92 50,92" fill={c} opacity={0.55} />
        <circle cx={110} cy={68} r={1.5} fill={c} opacity={0.5} />
        <circle cx={150} cy={75} r={1.5} fill={c} opacity={0.5} />
        <circle cx={70} cy={75} r={1.5} fill={c} opacity={0.5} />
        <circle cx={110} cy={112} r={1.5} fill={c} opacity={0.5} />
        <path d="M 214 77 L 248 98 L 272 112" fill="none" stroke={c} strokeWidth={10} strokeLinecap="round" opacity={0.45} />
        <path
          d="M 0 60 L 60 52 L 84 46 L 88 50 L 92 46 L 116 52 L 170 58 L 214 72 L 214 82 L 170 68 L 116 62 L 92 56 L 88 60 L 84 56 L 60 62 L 0 70 Z"
          fill={`${c}33`}
          stroke={c}
          strokeWidth={1.25}
        />
        <path d="M 222 74 L 232 34 L 300 34 L 300 52 L 224 52 Z" fill={`${c}14`} stroke={MUTE} strokeWidth={1} />
        <line x1={88} y1={72} x2={88} y2={56} stroke={GOLD} strokeWidth={1.5} />
        <circle cx={88} cy={66} r={5} fill={GOLD} />
        <polygon points="252,16 244,34 260,34" fill={GOLD} />
        <circle cx={222} cy={80} r={1.8} fill={GOLD} />
        <circle cx={236} cy={89} r={1.8} fill={GOLD} />
        <circle cx={250} cy={98} r={1.8} fill={MUTE} />
        <circle cx={264} cy={107} r={1.8} fill={MUTE} />
        <line x1={130} y1={44} x2={156} y2={44} stroke={c} strokeWidth={1.25} />
        <polygon points="162,44 155,41 155,47" fill={c} />
        <text x={110} y={38} fill={MUTE} fontSize={8} fontFamily="monospace">5 cm/yr</text>
      </g>
    )
  },
  'natural-selection': c => {
    // A heritable variant sweeping to fixation: the curve is the allele
    // frequency, the bars below are the population's changing composition.
    const P = [6, 11, 20, 34, 52, 70, 84, 93] // frequency, percent
    const bx = (k: number) => 16 + k * 34 // bar left edge
    const cx = (k: number) => 31 + k * 34 // bar centre
    const cy = (k: number) => 78 - Math.round((66 * P[k]) / 100)
    const pts = P.map((_, k) => `${cx(k)},${cy(k)}`).join(' ')
    return (
      <g>
        <line x1={16} y1={12} x2={284} y2={12} stroke={FAINT} strokeWidth={1} strokeDasharray="3 3" />
        <line x1={16} y1={78} x2={284} y2={78} stroke={MUTE} strokeWidth={0.75} />
        <text x={10} y={15} fontSize={7} fill={MUTE} fontFamily="monospace" textAnchor="end">1</text>
        <text x={10} y={81} fontSize={7} fill={MUTE} fontFamily="monospace" textAnchor="end">0</text>
        {P.map((p, k) => {
          const h = Math.round((24 * p) / 100)
          return (
            <g key={`bar-${k}`}>
              <rect x={bx(k)} y={88} width={30} height={24 - h} fill={GOLD} opacity={0.35} />
              <rect x={bx(k)} y={112 - h} width={30} height={h} fill={c} opacity={0.85} />
            </g>
          )
        })}
        <polyline points={pts} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {P.map((_, k) => (
          <circle key={`pt-${k}`} cx={cx(k)} cy={cy(k)} r={2} fill={c} />
        ))}
      </g>
    )
  },
  'ice-ages': c => {
    // The glacial sawtooth: ~7 cycles across 800 kyr — long ragged descent into
    // each glacial, then a rapid termination.
    const pts: string[] = []
    for (let i = 0; i <= 280; i++) {
      const u = i / 280
      const p = (u * 7) % 1
      const base = p < 0.85 ? 26 + 68 * Math.pow(p / 0.85, 1.1) : 94 - 68 * ((p - 0.85) / 0.15)
      const y = base - 3 * Math.sin(p * 2 * Math.PI * 3)
      pts.push(`${10 + i},${Math.round(y * 100) / 100}`)
    }
    return (
      <g>
        <rect x={10} y={26} width={280} height={69} fill={FAINT} />
        <line x1={10} y1={12} x2={290} y2={12} stroke={GOLD} strokeWidth={1} strokeDasharray="5 4" />
        <text x={290} y={9} fontSize={7} fill={GOLD} fontFamily="monospace" textAnchor="end">today · 423 ppm</text>
        <polyline points={pts.join(' ')} fill="none" stroke={c} strokeWidth={1.5} strokeLinejoin="round" />
        {[50, 90, 130, 170, 210, 250].map(x => (
          <polygon key={x} points={`${x},20 ${x - 3},26 ${x + 3},26`} fill={GOLD} opacity={0.75} />
        ))}
        <text x={10} y={112} fontSize={7} fill={MUTE} fontFamily="monospace">800 kyr BP</text>
        <text x={150} y={112} fontSize={7} fill={GOLD} fontFamily="monospace" textAnchor="middle">~100 kyr</text>
        <text x={290} y={112} fontSize={7} fill={MUTE} fontFamily="monospace" textAnchor="end">now</text>
      </g>
    )
  },
  photosynthesis: c => {
    // Thylakoid membrane: photons strike PS II and PS I, water is split in the
    // lumen and the O2 rises out, protons drive the ATP synthase. All integers.
    const protons = [24, 54, 84, 114, 144, 174, 204, 234]
    const electrons = [86, 104, 122, 140]
    return (
      <g>
        <rect x={10} y={80} width={280} height={24} fill={`${c}14`} />
        <rect x={10} y={52} width={280} height={28} fill={FAINT} />
        <line x1={10} y1={52} x2={290} y2={52} stroke={MUTE} strokeWidth={0.75} />
        <line x1={10} y1={80} x2={290} y2={80} stroke={MUTE} strokeWidth={0.75} />
        <text x={14} y={16} fontSize={6} fill={MUTE} fontFamily="monospace">STROMA</text>
        <text x={286} y={100} fontSize={6} fill={MUTE} fontFamily="monospace" textAnchor="end">LUMEN</text>
        <line x1={22} y1={8} x2={50} y2={42} stroke={GOLD} strokeWidth={2} />
        <line x1={86} y1={8} x2={72} y2={42} stroke={GOLD} strokeWidth={2} />
        <line x1={104} y1={8} x2={134} y2={42} stroke={GOLD} strokeWidth={2} />
        <line x1={120} y1={8} x2={150} y2={42} stroke={GOLD} strokeWidth={2} />
        <rect x={44} y={44} width={34} height={44} rx={5} fill={`${c}22`} stroke={c} strokeWidth={1} />
        <rect x={132} y={44} width={32} height={44} rx={5} fill={`${c}22`} stroke={c} strokeWidth={1} />
        <rect x={228} y={44} width={26} height={44} rx={4} fill={`${c}22`} stroke={c} strokeWidth={1} />
        <circle cx={241} cy={34} r={9} fill="none" stroke={c} strokeWidth={1.25} />
        <text x={241} y={18} fontSize={7} fill={GOLD} fontFamily="monospace" textAnchor="middle">ATP</text>
        <line x1={78} y1={70} x2={164} y2={70} stroke={MUTE} strokeWidth={0.75} />
        {electrons.map(x => <circle key={x} cx={x} cy={70} r={2} fill={c} />)}
        <text x={16} y={98} fontSize={7} fill={MUTE} fontFamily="monospace">H₂O</text>
        <line x1={42} y1={95} x2={56} y2={88} stroke={MUTE} strokeWidth={1} />
        <line x1={61} y1={88} x2={61} y2={32} stroke={c} strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
        <circle cx={61} cy={22} r={9} fill={`${c}22`} stroke={c} strokeWidth={1.25} />
        <text x={61} y={25} fontSize={7} fill={c} fontFamily="monospace" textAnchor="middle">O₂</text>
        {protons.map(x => <circle key={x} cx={x} cy={92} r={2} fill={c} opacity={0.55} />)}
        <line x1={241} y1={88} x2={241} y2={50} stroke={c} strokeWidth={1} opacity={0.5} />
      </g>
    )
  },
  'seismic-waves': c => {
    // Seismogram: quiet, then P (small, fast), S (larger), then the surface-wave
    // train that does the damage. All coordinates are integer literals.
    return (
      <g>
        <line x1={14} y1={44} x2={292} y2={44} stroke={FAINT} strokeWidth={0.75} strokeDasharray="2 4" />
        <line x1={14} y1={96} x2={292} y2={96} stroke={FAINT} strokeWidth={0.75} strokeDasharray="2 4" />
        <line x1={14} y1={70} x2={292} y2={70} stroke={MUTE} strokeWidth={0.5} />
        <line x1={60} y1={34} x2={60} y2={106} stroke={GOLD} strokeWidth={1} opacity={0.7} />
        <line x1={110} y1={34} x2={110} y2={106} stroke={c} strokeWidth={1} opacity={0.8} />
        <line x1={170} y1={34} x2={170} y2={106} stroke={MUTE} strokeWidth={1} />
        <polyline
          points="14,70 20,70 30,69 40,71 50,70 58,70 60,70 62,64 64,70 66,76 68,70 70,65 72,70 74,75 76,70 78,66 80,70 82,74 84,70 86,67 88,70 90,73 92,70 94,68 96,70 98,72 100,70 102,69 104,70 106,71 108,70 110,70"
          fill="none"
          stroke={GOLD}
          strokeWidth={1.25}
        />
        <polyline
          points="110,70 113,56 116,70 119,84 122,70 125,58 128,70 131,82 134,70 137,60 140,70 143,80 146,70 149,62 152,70 155,78 158,70 161,64 164,70 167,76 170,70"
          fill="none"
          stroke={c}
          strokeWidth={1.5}
        />
        <polyline
          points="170,70 176,52 182,70 188,88 194,70 200,46 206,70 212,94 218,70 224,50 230,70 236,90 242,70 248,56 254,70 260,84 266,70 272,60 278,70 284,80 290,70"
          fill="none"
          stroke={c}
          strokeWidth={2}
        />
        <circle cx={14} cy={70} r={3} fill={GOLD} />
        <line x1={60} y1={110} x2={110} y2={110} stroke={GOLD} strokeWidth={1} />
        <line x1={60} y1={106} x2={60} y2={114} stroke={GOLD} strokeWidth={1} />
        <line x1={110} y1={106} x2={110} y2={114} stroke={GOLD} strokeWidth={1} />
        <text x={63} y={30} fill={GOLD} fontSize={9} fontFamily="monospace">P</text>
        <text x={113} y={30} fill={c} fontSize={9} fontFamily="monospace">S</text>
        <text x={173} y={30} fill={MUTE} fontSize={8} fontFamily="monospace">surface</text>
        <text x={116} y={113} fill={MUTE} fontSize={7} fontFamily="monospace">S-P = distance</text>
      </g>
    )
  },
  'antibiotic-resistance': c => {
    // A population crashing under a sub-MIC dose, then regrowing entirely resistant.
    const total = '0,34 20,34 40,33 60,34 80,34 90,34 100,60 110,84 120,100 130,106 145,96 160,76 175,56 190,42 205,34 220,32 260,32 300,32'
    const res = '0,108 40,108 80,108 90,108 100,107 110,106 120,105 130,106 145,96 160,76 175,56 190,42 205,34 220,32 260,32 300,32'
    const resRev = '300,32 260,32 220,32 205,34 190,42 175,56 160,76 145,96 130,106 120,105 110,106 100,107 90,108 80,108 40,108 0,108'
    return (
      <g>
        <line x1={0} y1={110} x2={300} y2={110} stroke={FAINT} strokeWidth={1} />
        <polygon points={`${total} ${resRev}`} fill={FAINT} />
        <polyline points={total} fill="none" stroke={MUTE} strokeWidth={1} />
        <polygon points={`${res} 300,110 0,110`} fill={`${c}33`} />
        <polyline points={res} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" />
        <line x1={95} y1={20} x2={95} y2={112} stroke={GOLD} strokeWidth={1} strokeDasharray="3 3" />
        <text x={98} y={17} fontSize={8} fill={GOLD} fontFamily="monospace">sub-MIC dose</text>
        <circle cx={105} cy={107} r={2} fill={c} />
        <circle cx={113} cy={105} r={2} fill={c} />
        <circle cx={122} cy={104} r={2} fill={c} />
        <text x={6} y={28} fontSize={7} fill={MUTE} fontFamily="monospace">susceptible</text>
        <text x={296} y={26} textAnchor="end" fontSize={8} fill={c} fontFamily="monospace">100% resistant</text>
      </g>
    )
  },
  'mri-imaging': c => {
    // Magnetisation tipped off B0 and precessing, beside the decaying FID it induces.
    const fid = Array.from({ length: 54 }, (_, i) => {
      const x = 80 + i * 4
      const y = 60 - 34 * Math.exp(-(x - 80) / 70) * Math.sin((x - 80) / 6)
      return `${x},${Math.round(y * 100) / 100}`
    }).join(' ')
    const env = Array.from({ length: 54 }, (_, i) => {
      const x = 80 + i * 4
      const y = 60 - 34 * Math.exp(-(x - 80) / 70)
      return `${x},${Math.round(y * 100) / 100}`
    }).join(' ')
    return (
      <g>
        <line x1={40} y1={14} x2={40} y2={104} stroke={MUTE} strokeWidth={0.75} strokeDasharray="3 3" />
        <text x={46} y={20} fill={MUTE} fontSize={8} fontFamily="monospace">B₀</text>
        <ellipse cx={40} cy={78} rx={22} ry={7} fill="none" stroke={FAINT} strokeWidth={1} />
        <line x1={40} y1={78} x2={58} y2={36} stroke={c} strokeWidth={2} />
        <circle cx={58} cy={36} r={3.5} fill={c} />
        <polyline points={env} fill="none" stroke={MUTE} strokeWidth={0.75} strokeDasharray="2 3" />
        <polyline points={fid} fill="none" stroke={c} strokeWidth={1.75} />
        <circle cx={90} cy={31} r={3} fill={GOLD} />
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
