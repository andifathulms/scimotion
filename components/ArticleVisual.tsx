import type { ReactNode } from 'react'

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
      {render ? render(c) : null}
    </svg>
  )
}
