'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const VIOLET = '#A78BFA'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const PINK = '#F472B6'
const GREEN = '#10B981'

// Matrix geometry
const MX = 116
const MY = 78
const CW = 104
const CH = 84
const PANEL_X = 358

type Cell = [number, number]
type Game = {
  key: string
  label: string
  rows: [string, string]
  cols: [string, string]
  m: Cell[][]
}

// Three canonical 2x2 games: one equilibrium that hurts both players, two
// equilibria, and none at all in pure strategies.
const PRESETS: Game[] = [
  {
    key: 'pd',
    label: "Prisoner's Dilemma",
    rows: ['Stay silent', 'Confess'],
    cols: ['Stay silent', 'Confess'],
    m: [
      [[3, 3], [0, 5]],
      [[5, 0], [1, 1]],
    ],
  },
  {
    key: 'stag',
    label: 'Stag Hunt',
    rows: ['Stag', 'Hare'],
    cols: ['Stag', 'Hare'],
    m: [
      [[4, 4], [0, 3]],
      [[3, 0], [2, 2]],
    ],
  },
  {
    key: 'pennies',
    label: 'Matching Pennies',
    rows: ['Heads', 'Tails'],
    cols: ['Heads', 'Tails'],
    m: [
      [[1, -1], [-1, 1]],
      [[-1, 1], [1, -1]],
    ],
  },
]

function clone(g: Game): Game {
  return { ...g, m: g.m.map(row => row.map(cl => [cl[0], cl[1]] as Cell)) }
}

// Best response tables. Ties count as best responses for both cells, which is
// exactly what the definition of a Nash equilibrium requires.
function bestResponses(m: Cell[][]) {
  const brA = [[false, false], [false, false]]
  const brB = [[false, false], [false, false]]
  for (let j = 0; j < 2; j++) {
    const best = Math.max(m[0][j][0], m[1][j][0])
    for (let i = 0; i < 2; i++) brA[i][j] = m[i][j][0] === best
  }
  for (let i = 0; i < 2; i++) {
    const best = Math.max(m[i][0][1], m[i][1][1])
    for (let j = 0; j < 2; j++) brB[i][j] = m[i][j][1] === best
  }
  return { brA, brB }
}

// Mixed equilibrium of a 2x2 game: each player randomizes so that the OTHER
// player is left indifferent between their two pure strategies.
function mixedEquilibrium(m: Cell[][]): { p: number; q: number } | null {
  const dq = m[0][0][0] - m[0][1][0] - m[1][0][0] + m[1][1][0]
  const dp = m[0][0][1] - m[1][0][1] - m[0][1][1] + m[1][1][1]
  if (Math.abs(dq) < 1e-9 || Math.abs(dp) < 1e-9) return null
  const q = (m[1][1][0] - m[0][1][0]) / dq
  const p = (m[1][1][1] - m[1][0][1]) / dp
  if (p <= 0 || p >= 1 || q <= 0 || q >= 1) return null
  return { p, q }
}

export function NashEquilibriumAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0)
  const animRef = useRef(false)

  const [game, setGame] = useState<Game>(() => clone(PRESETS[0]))
  const [choice, setChoice] = useState<[number, number]>([0, 0])
  const [sel, setSel] = useState<{ i: number; j: number; who: 0 | 1 } | null>(null)

  const { brA, brB } = useMemo(() => bestResponses(game.m), [game])
  const eq = useMemo(() => {
    const out: Array<[number, number]> = []
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if (brA[i][j] && brB[i][j]) out.push([i, j])
    return out
  }, [brA, brB])
  const mixed = useMemo(() => (eq.length === 0 ? mixedEquilibrium(game.m) : null), [eq, game])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const pulse = animRef.current ? 0.5 + 0.5 * Math.sin(phaseRef.current) : 1
    const [ci, cj] = choice

    // Titles
    ctx.textAlign = 'center'
    ctx.font = '10px monospace'
    ctx.fillStyle = `${GOLD}CC`
    ctx.fillText('PLAYER B  (columns)', MX + CW, 34)

    ctx.save()
    ctx.translate(44, MY + CH)
    ctx.rotate(-Math.PI / 2)
    ctx.fillStyle = `${VIOLET}CC`
    ctx.fillText('PLAYER A  (rows)', 0, 0)
    ctx.restore()

    // Column headers
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = 'rgba(245,240,232,0.6)'
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(game.cols[j], MX + j * CW + CW / 2, MY - 14)
    }
    // Row headers
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = 'rgba(245,240,232,0.6)'
      ctx.font = '11px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(game.rows[i], MX - 12, MY + i * CH + CH / 2 + 4)
    }

    // Cells
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const x = MX + j * CW
        const y = MY + i * CH
        const isEq = brA[i][j] && brB[i][j]
        const isChoice = i === ci && j === cj

        ctx.fillStyle = isEq
          ? `rgba(16,185,129,${(0.10 + 0.16 * pulse).toFixed(3)})`
          : 'rgba(255,245,235,0.03)'
        ctx.fillRect(x, y, CW, CH)

        ctx.strokeStyle = isEq ? `rgba(16,185,129,${(0.45 + 0.45 * pulse).toFixed(3)})` : 'rgba(255,245,235,0.14)'
        ctx.lineWidth = isEq ? 2 : 1
        ctx.strokeRect(x + 0.5, y + 0.5, CW - 1, CH - 1)

        if (isChoice) {
          ctx.strokeStyle = 'rgba(245,240,232,0.75)'
          ctx.lineWidth = 1.5
          ctx.setLineDash([5, 4])
          ctx.strokeRect(x + 4.5, y + 4.5, CW - 9, CH - 9)
          ctx.setLineDash([])
        }

        // Payoff pair: A's number on the left, B's on the right.
        const cxA = x + CW * 0.3
        const cxB = x + CW * 0.72
        const ty = y + CH / 2 + 7

        ctx.textAlign = 'center'
        ctx.font = 'bold 19px monospace'
        ctx.fillStyle = brA[i][j] ? VIOLET : 'rgba(245,240,232,0.55)'
        ctx.fillText(String(game.m[i][j][0]), cxA, ty)
        ctx.fillStyle = brB[i][j] ? GOLD : 'rgba(245,240,232,0.55)'
        ctx.fillText(String(game.m[i][j][1]), cxB, ty)
        ctx.fillStyle = 'rgba(245,240,232,0.3)'
        ctx.font = '15px monospace'
        ctx.fillText(',', x + CW / 2 + 1, ty - 1)

        // Best-response underlines
        if (brA[i][j]) {
          ctx.strokeStyle = VIOLET
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(cxA - 11, ty + 6)
          ctx.lineTo(cxA + 11, ty + 6)
          ctx.stroke()
        }
        if (brB[i][j]) {
          ctx.strokeStyle = GOLD
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(cxB - 11, ty + 6)
          ctx.lineTo(cxB + 11, ty + 6)
          ctx.stroke()
        }

        // Edit cursor
        if (sel && sel.i === i && sel.j === j) {
          const sx = sel.who === 0 ? cxA : cxB
          ctx.strokeStyle = 'rgba(245,240,232,0.5)'
          ctx.lineWidth = 1
          ctx.strokeRect(sx - 16.5, y + CH / 2 - 15.5, 33, 31)
        }
      }
    }

    // Deviation arrow: if the chosen profile is not an equilibrium, show who
    // wants out and where they would go.
    const chosenIsEq = brA[ci][cj] && brB[ci][cj]
    if (!chosenIsEq) {
      const cx0 = MX + cj * CW + CW / 2
      const cy0 = MY + ci * CH + CH / 2
      const wobble = animRef.current ? 3 * Math.sin(phaseRef.current * 1.6) : 0
      if (!brA[ci][cj]) {
        const ti = 1 - ci
        const ty0 = MY + ti * CH + CH / 2
        const dir = Math.sign(ty0 - cy0)
        ctx.strokeStyle = `${VIOLET}CC`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(cx0 - 34, cy0 + dir * 26)
        ctx.lineTo(cx0 - 34, ty0 - dir * (26 - wobble))
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx0 - 34, ty0 - dir * (20 - wobble))
        ctx.lineTo(cx0 - 39, ty0 - dir * (30 - wobble))
        ctx.lineTo(cx0 - 29, ty0 - dir * (30 - wobble))
        ctx.closePath()
        ctx.fillStyle = VIOLET
        ctx.fill()
      }
      if (!brB[ci][cj]) {
        const tj = 1 - cj
        const tx0 = MX + tj * CW + CW / 2
        const dir = Math.sign(tx0 - cx0)
        ctx.strokeStyle = `${GOLD}CC`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(cx0 + dir * 30, cy0 + 30)
        ctx.lineTo(tx0 - dir * (30 - wobble), cy0 + 30)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(tx0 - dir * (24 - wobble), cy0 + 30)
        ctx.lineTo(tx0 - dir * (34 - wobble), cy0 + 25)
        ctx.lineTo(tx0 - dir * (34 - wobble), cy0 + 35)
        ctx.closePath()
        ctx.fillStyle = GOLD
        ctx.fill()
      }
    }

    // ---- Right panel -------------------------------------------------
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PANEL_X - 16, 18)
    ctx.lineTo(PANEL_X - 16, H - 18)
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('BEST RESPONSES', PANEL_X, 34)

    ctx.strokeStyle = VIOLET
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(PANEL_X, 50)
    ctx.lineTo(PANEL_X + 14, 50)
    ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.font = '9px monospace'
    ctx.fillText("A's best reply to that column", PANEL_X + 20, 53)

    ctx.strokeStyle = GOLD
    ctx.beginPath()
    ctx.moveTo(PANEL_X, 68)
    ctx.lineTo(PANEL_X + 14, 68)
    ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.fillText("B's best reply to that row", PANEL_X + 20, 71)

    ctx.fillStyle = `rgba(16,185,129,${(0.18 + 0.2 * pulse).toFixed(3)})`
    ctx.fillRect(PANEL_X, 82, 14, 10)
    ctx.strokeStyle = GREEN
    ctx.lineWidth = 1
    ctx.strokeRect(PANEL_X + 0.5, 82.5, 13, 9)
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.fillText('both at once = equilibrium', PANEL_X + 20, 91)

    // Equilibrium report
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('PURE NASH EQUILIBRIA', PANEL_X, 122)

    if (eq.length === 0) {
      ctx.fillStyle = PINK
      ctx.font = 'bold 13px monospace'
      ctx.fillText('none', PANEL_X, 142)
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.font = '9px monospace'
      ctx.fillText('every cell has an arrow out of it', PANEL_X, 158)
      if (mixed) {
        ctx.fillStyle = 'rgba(245,240,232,0.35)'
        ctx.font = '10px monospace'
        ctx.fillText('MIXED EQUILIBRIUM', PANEL_X, 184)
        ctx.fillStyle = VIOLET
        ctx.font = '10px monospace'
        ctx.fillText(`A: ${game.rows[0]} w.p. ${mixed.p.toFixed(2)}`, PANEL_X, 202)
        ctx.fillStyle = GOLD
        ctx.fillText(`B: ${game.cols[0]} w.p. ${mixed.q.toFixed(2)}`, PANEL_X, 218)
        ctx.fillStyle = 'rgba(245,240,232,0.45)'
        ctx.font = '9px monospace'
        ctx.fillText('each keeps the other indifferent', PANEL_X, 236)
      }
    } else {
      eq.forEach(([i, j], k) => {
        ctx.fillStyle = GREEN
        ctx.font = 'bold 12px monospace'
        ctx.fillText(`(${game.rows[i]}, ${game.cols[j]})`, PANEL_X, 142 + k * 20)
        ctx.fillStyle = 'rgba(245,240,232,0.45)'
        ctx.font = '10px monospace'
        ctx.fillText(`→ ${game.m[i][j][0]}, ${game.m[i][j][1]}`, PANEL_X + 150, 142 + k * 20)
      })
      // Is some other cell better for BOTH players? (equilibrium ≠ optimal)
      let dominated: [number, number] | null = null
      for (const [i, j] of eq) {
        for (let a = 0; a < 2; a++) {
          for (let b = 0; b < 2; b++) {
            if (game.m[a][b][0] > game.m[i][j][0] && game.m[a][b][1] > game.m[i][j][1]) {
              dominated = [a, b]
            }
          }
        }
      }
      if (dominated) {
        ctx.fillStyle = PINK
        ctx.font = '9px monospace'
        ctx.fillText('but both would prefer', PANEL_X, 190)
        ctx.fillStyle = PINK
        ctx.font = 'bold 11px monospace'
        ctx.fillText(
          `(${game.rows[dominated[0]]}, ${game.cols[dominated[1]]}) → ${game.m[dominated[0]][dominated[1]][0]}, ${game.m[dominated[0]][dominated[1]][1]}`,
          PANEL_X,
          206
        )
        ctx.fillStyle = 'rgba(245,240,232,0.45)'
        ctx.font = '9px monospace'
        ctx.fillText('stable ≠ good', PANEL_X, 222)
      }
    }

    // Current-profile verdict
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '10px monospace'
    ctx.fillText('YOUR PICK', PANEL_X, 260)
    ctx.fillStyle = chosenIsEq ? GREEN : BLUE
    ctx.font = '10px monospace'
    ctx.fillText(
      chosenIsEq
        ? 'nobody gains by switching'
        : !brA[ci][cj] && !brB[ci][cj]
          ? 'both want to switch'
          : !brA[ci][cj]
            ? 'A wants to switch'
            : 'B wants to switch',
      PANEL_X,
      278
    )
  }, [game, brA, brB, eq, mixed, choice, sel])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      animRef.current = !reduced
    },
  })

  useEffect(() => {
    const tick = () => {
      if (animRef.current) phaseRef.current += 0.05
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const r = canvas.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    const y = ((e.clientY - r.top) / r.height) * H
    const j = Math.floor((x - MX) / CW)
    const i = Math.floor((y - MY) / CH)
    if (i < 0 || i > 1 || j < 0 || j > 1) return
    const who: 0 | 1 = x - (MX + j * CW) < CW / 2 ? 0 : 1
    setSel({ i, j, who })
  }

  const setPayoff = (v: number) => {
    if (!sel) return
    setGame(g => {
      const m = g.m.map(row => row.map(cl => [cl[0], cl[1]] as Cell))
      m[sel.i][sel.j][sel.who] = v
      return { ...g, m, key: 'custom', label: 'Custom' }
    })
  }

  const loadPreset = (p: Game) => {
    setGame(clone(p))
    setChoice([0, 0])
    setSel(null)
  }

  const reset = () => {
    loadPreset(PRESETS[0])
    phaseRef.current = 0
    triggerReset()
  }

  const selValue = sel ? game.m[sel.i][sel.j][sel.who] : 0

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Payoff matrix</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onClick={onCanvasClick}
          className="w-full rounded-lg cursor-pointer"
          style={{ background: '#0F0D0A' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-x-4 gap-y-2">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => loadPreset(p)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              game.key === p.key
                ? 'bg-accent-violet text-bg-base'
                : 'bg-white/5 text-text-muted hover:text-text-secondary'
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span>A plays</span>
          {[0, 1].map(i => (
            <button
              key={i}
              onClick={() => setChoice(([, j]) => [i, j])}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                choice[0] === i ? 'bg-accent-violet/25 text-text-primary' : 'bg-white/5 hover:text-text-secondary'
              }`}
            >
              {game.rows[i]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span>B plays</span>
          {[0, 1].map(j => (
            <button
              key={j}
              onClick={() => setChoice(([i]) => [i, j])}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                choice[1] === j ? 'bg-accent-gold/25 text-text-primary' : 'bg-white/5 hover:text-text-secondary'
              }`}
            >
              {game.cols[j]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>{sel ? `Edit ${sel.who === 0 ? 'A' : 'B'}'s payoff` : 'Click a payoff to edit'}</span>
          <input
            type="range"
            min={-5}
            max={5}
            step={1}
            value={selValue}
            disabled={!sel}
            onChange={e => setPayoff(+e.target.value)}
            className="w-24 accent-accent-gold disabled:opacity-30"
          />
          <span className="font-mono text-text-secondary w-6">{sel ? selValue : '—'}</span>
        </label>
      </div>
    </div>
  )
}
