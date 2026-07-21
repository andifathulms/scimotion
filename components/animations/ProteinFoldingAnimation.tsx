'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw, Shuffle } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const CELL = 16                 // lattice spacing in px
const CHAIN_CY = 108            // centre of the chain drawing area
const PLOT_TOP = 224
const PLOT_BOT = 288
const PLOT_L = 26
const PLOT_R = 574

const N = 48                    // residues in the toy chain
const TRIALS = 3000             // conformations examined, identical for both searches
const SNAP = 24                 // trials per recorded frame

const C_H = '#F472B6'           // pink   — hydrophobic residue
const C_P = '#60A5FA'           // blue   — polar residue
const C_BOND = 'rgba(245,240,232,0.45)'
const C_CONTACT = '#F59E0B'     // gold   — buried H–H contact
const C_TRACE = '#A78BFA'       // violet — instantaneous energy
const C_BEST = '#10B981'        // green  — best energy so far
const DIM = 'rgba(245,240,232,0.4)'
const FAINT = 'rgba(255,245,235,0.07)'

type Pt = [number, number]
type Mode = 'guided' | 'blind'

const DIRS: Pt[] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

function key(p: Pt): number {
  return (p[0] + 512) * 4096 + (p[1] + 512)
}

function occupied(pts: Pt[]): Set<number> {
  const s = new Set<number>()
  for (const p of pts) s.add(key(p))
  return s
}

// Energy = −1 for every pair of hydrophobic residues that touch on the lattice
// without being neighbours in the chain. Burying H residues together lowers it.
function energy(pts: Pt[], seq: string): number {
  let e = 0
  for (let i = 0; i < pts.length; i++) {
    if (seq[i] !== 'H') continue
    for (let j = i + 3; j < pts.length; j++) {
      if (seq[j] !== 'H') continue
      const d = Math.abs(pts[i][0] - pts[j][0]) + Math.abs(pts[i][1] - pts[j][1])
      if (d === 1) e -= 1
    }
  }
  return e
}

function contacts(pts: Pt[], seq: string): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < pts.length; i++) {
    if (seq[i] !== 'H') continue
    for (let j = i + 3; j < pts.length; j++) {
      if (seq[j] !== 'H') continue
      const d = Math.abs(pts[i][0] - pts[j][0]) + Math.abs(pts[i][1] - pts[j][1])
      if (d === 1) out.push([i, j])
    }
  }
  return out
}

function straight(n: number): Pt[] {
  return Array.from({ length: n }, (_, i) => [i, 0] as Pt)
}

// The blind search's sampler: pick a random non-reversing walk and throw it away
// if it crosses itself. That is genuine uniform sampling of conformations — no
// bias toward compactness, which is exactly the search Levinthal ruled out.
function randomWalk(n: number): Pt[] {
  for (let attempt = 0; attempt < 500; attempt++) {
    const pts: Pt[] = [[0, 0]]
    const occ = new Set<number>([key([0, 0])])
    let prev = -1
    let ok = true
    for (let i = 1; i < n; i++) {
      let d = Math.floor(Math.random() * 4)
      if (prev >= 0) {
        // never step straight back onto the bond just laid
        const back = prev ^ 1
        d = Math.floor(Math.random() * 3)
        if (d >= back) d += 1
      }
      const last = pts[i - 1]
      const q: Pt = [last[0] + DIRS[d][0], last[1] + DIRS[d][1]]
      if (occ.has(key(q))) { ok = false; break }
      pts.push(q)
      occ.add(key(q))
      prev = d
    }
    if (ok) return pts
  }
  return straight(n)
}

// One local move: shuffle a chain end, flip a corner, or crank a U-turn over.
function propose(pts: Pt[]): Pt[] | null {
  const n = pts.length
  const r = Math.random()

  if (r < 0.22) {
    // Pivot: rotate the whole tail about one residue. Rarely accepted once the
    // chain is compact, but it is what makes the search ergodic.
    const i = 1 + Math.floor(Math.random() * (n - 2))
    const rot = Math.floor(Math.random() * 3)
    const a = pts[i]
    const next = pts.slice(0, i + 1)
    const occ = new Set<number>()
    for (const p of next) occ.add(key(p))
    for (let j = i + 1; j < n; j++) {
      const dx = pts[j][0] - a[0]
      const dy = pts[j][1] - a[1]
      const rd: Pt = rot === 0 ? [-dy, dx] : rot === 1 ? [-dx, -dy] : [dy, -dx]
      const q: Pt = [a[0] + rd[0], a[1] + rd[1]]
      if (occ.has(key(q))) return null
      occ.add(key(q))
      next.push(q)
    }
    return next
  }

  if (r < 0.48) {
    const endIdx = Math.random() < 0.5 ? 0 : n - 1
    const anchor = pts[endIdx === 0 ? 1 : n - 2]
    const occ = occupied(pts)
    occ.delete(key(pts[endIdx]))
    const free = DIRS
      .map(d => [anchor[0] + d[0], anchor[1] + d[1]] as Pt)
      .filter(p => !occ.has(key(p)))
    if (free.length === 0) return null
    const next = pts.slice()
    next[endIdx] = free[Math.floor(Math.random() * free.length)]
    return next
  }

  if (r < 0.86) {
    const i = 1 + Math.floor(Math.random() * (n - 2))
    const a = pts[i - 1]
    const b = pts[i + 1]
    if (Math.abs(a[0] - b[0]) !== 1 || Math.abs(a[1] - b[1]) !== 1) return null
    const cand: Pt = [a[0] + b[0] - pts[i][0], a[1] + b[1] - pts[i][1]]
    const occ = occupied(pts)
    occ.delete(key(pts[i]))
    if (occ.has(key(cand))) return null
    const next = pts.slice()
    next[i] = cand
    return next
  }

  const i = 1 + Math.floor(Math.random() * (n - 3))
  const a = pts[i - 1]
  const d = pts[i + 2]
  if (Math.abs(a[0] - d[0]) + Math.abs(a[1] - d[1]) !== 1) return null
  const c1: Pt = [2 * a[0] - pts[i][0], 2 * a[1] - pts[i][1]]
  const c2: Pt = [2 * d[0] - pts[i + 1][0], 2 * d[1] - pts[i + 1][1]]
  const occ = occupied(pts)
  occ.delete(key(pts[i]))
  occ.delete(key(pts[i + 1]))
  if (occ.has(key(c1)) || occ.has(key(c2))) return null
  const next = pts.slice()
  next[i] = c1
  next[i + 1] = c2
  return next
}

function makeSequence(n: number): string {
  let s = ''
  for (let i = 0; i < n; i++) s += Math.random() < 0.45 ? 'H' : 'P'
  return s
}

const SEED_SEQ = 'PHHPHPPHHPPPHHPHPPPPHPPHHHHHPPPPHHPPHHPPHHHPHHPP'

type Frame = { pts: Pt[]; e: number; best: number; tried: number }
type Run = { frames: Frame[]; mode: Mode; best: number }

function buildRun(seq: string, mode: Mode): Run {
  const frames: Frame[] = []

  if (mode === 'blind') {
    let best = 0
    let bestPts = straight(seq.length)
    let last = bestPts
    let lastE = 0
    for (let i = 1; i <= TRIALS; i++) {
      const pts = randomWalk(seq.length)
      const e = energy(pts, seq)
      if (e < best) { best = e; bestPts = pts }
      last = pts
      lastE = e
      if (i % SNAP === 0) frames.push({ pts, e, best, tried: i })
    }
    frames.push({ pts: last, e: lastE, best, tried: TRIALS })
    frames.push({ pts: bestPts, e: best, best, tried: TRIALS })
    return { frames, mode, best }
  }

  let cur = straight(seq.length)
  let curE = energy(cur, seq)
  let best = curE
  let bestPts = cur
  frames.push({ pts: cur, e: curE, best, tried: 0 })
  for (let s = 1; s <= TRIALS; s++) {
    // Annealing schedule: hot and exploratory early, downhill-only at the end.
    const T = 1.1 * Math.pow(0.04 / 1.1, s / TRIALS)
    let cand: Pt[] | null = null
    for (let k = 0; k < 30 && !cand; k++) cand = propose(cur)
    if (cand) {
      const ce = energy(cand, seq)
      const dE = ce - curE
      if (dE <= 0 || Math.random() < Math.exp(-dE / T)) {
        cur = cand
        curE = ce
        if (ce < best) { best = ce; bestPts = cand }
      }
    }
    if (s % SNAP === 0) frames.push({ pts: cur, e: curE, best, tried: s })
  }
  frames.push({ pts: bestPts, e: best, best, tried: TRIALS })
  return { frames, mode, best }
}

export function ProteinFoldingAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [seq, setSeq] = useState<string>(SEED_SEQ)
  const [mode, setMode] = useState<Mode>('guided')
  const [run, setRun] = useState<Run>(() => buildRun(SEED_SEQ, 'guided'))
  const [frame, setFrame] = useState(0)
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setFrame(run.frames.length - 1); return }
      setFrame(0)
      setRunning(true)
    },
  })

  useEffect(() => {
    setRun(buildRun(seq, mode))
    setFrame(0)
  }, [seq, mode])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setFrame(f => {
        if (f >= run.frames.length - 1) { setRunning(false); return run.frames.length - 1 }
        return f + 1
      })
    }, 34)
    return () => clearInterval(id)
  }, [running, run])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    const f = run.frames[Math.min(frame, run.frames.length - 1)]
    const pts = f.pts

    // Centre the current conformation in the chain area.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of pts) {
      if (p[0] < minX) minX = p[0]
      if (p[0] > maxX) maxX = p[0]
      if (p[1] < minY) minY = p[1]
      if (p[1] > maxY) maxY = p[1]
    }
    const cell = Math.min(CELL, (W - 70) / Math.max(1, maxX - minX + 1))
    const ox = W / 2 - ((minX + maxX) / 2) * cell
    const oy = CHAIN_CY - ((minY + maxY) / 2) * cell
    const rad = Math.max(3, Math.min(5.5, cell * 0.36))
    const px = (p: Pt) => ox + p[0] * cell
    const py = (p: Pt) => oy + p[1] * cell

    // Faint lattice behind the chain.
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    for (let gx = minX - 2; gx <= maxX + 2; gx++) {
      const x = ox + gx * cell
      if (x < 8 || x > W - 8) continue
      ctx.beginPath()
      ctx.moveTo(x, 16)
      ctx.lineTo(x, 204)
      ctx.stroke()
    }
    for (let gy = minY - 3; gy <= maxY + 3; gy++) {
      const y = oy + gy * cell
      if (y < 16 || y > 204) continue
      ctx.beginPath()
      ctx.moveTo(10, y)
      ctx.lineTo(W - 10, y)
      ctx.stroke()
    }

    // Buried hydrophobic contacts — the thing the search is maximising.
    ctx.strokeStyle = C_CONTACT
    ctx.lineWidth = 2
    ctx.setLineDash([2, 3])
    for (const [i, j] of contacts(pts, seq)) {
      ctx.beginPath()
      ctx.moveTo(px(pts[i]), py(pts[i]))
      ctx.lineTo(px(pts[j]), py(pts[j]))
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Backbone.
    ctx.strokeStyle = C_BOND
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(px(pts[0]), py(pts[0]))
    for (let i = 1; i < pts.length; i++) ctx.lineTo(px(pts[i]), py(pts[i]))
    ctx.stroke()

    // Residues.
    for (let i = 0; i < pts.length; i++) {
      const isH = seq[i] === 'H'
      ctx.beginPath()
      ctx.arc(px(pts[i]), py(pts[i]), isH ? rad : rad * 0.8, 0, Math.PI * 2)
      ctx.fillStyle = isH ? C_H : `${C_P}33`
      ctx.fill()
      ctx.strokeStyle = isH ? C_H : C_P
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // N-terminus marker.
    ctx.fillStyle = DIM
    ctx.fillText('N', px(pts[0]) - 3, py(pts[0]) - 10)
    ctx.fillText('C', px(pts[pts.length - 1]) - 3, py(pts[pts.length - 1]) - 10)

    // --- Energy trace -------------------------------------------------------
    const floor = Math.min(-4, run.best - 1)
    const ey = (e: number) => PLOT_TOP + (e / floor) * (PLOT_BOT - PLOT_TOP)
    const ex = (i: number) => PLOT_L + (i / Math.max(1, run.frames.length - 1)) * (PLOT_R - PLOT_L)

    ctx.strokeStyle = 'rgba(245,240,232,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PLOT_L, ey(0))
    ctx.lineTo(PLOT_R, ey(0))
    ctx.stroke()
    ctx.fillStyle = DIM
    ctx.fillText('E = 0', PLOT_L, ey(0) - 4)
    ctx.fillText(`E = ${floor}`, PLOT_L, PLOT_BOT + 9)

    ctx.strokeStyle = C_TRACE
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i <= Math.min(frame, run.frames.length - 1); i++) {
      const y = ey(run.frames[i].e)
      if (i === 0) ctx.moveTo(ex(i), y)
      else ctx.lineTo(ex(i), y)
    }
    ctx.stroke()

    ctx.strokeStyle = C_BEST
    ctx.lineWidth = 1.5
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    for (let i = 0; i <= Math.min(frame, run.frames.length - 1); i++) {
      const y = ey(run.frames[i].best)
      if (i === 0) ctx.moveTo(ex(i), y)
      else ctx.lineTo(ex(i), y)
    }
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = C_TRACE
    ctx.fillText('free energy', PLOT_R - 68, PLOT_TOP - 6)
    ctx.fillStyle = C_BEST
    ctx.fillText('best so far', PLOT_R - 68, PLOT_TOP + 6)

    ctx.fillStyle = DIM
    ctx.fillText(
      run.mode === 'guided'
        ? 'funnelled search — every downhill move is kept'
        : 'blind search — a fresh random conformation each frame',
      PLOT_L, PLOT_TOP - 6,
    )
  }, [run, frame, seq])

  useEffect(() => { draw() }, [draw])

  const cur = run.frames[Math.min(frame, run.frames.length - 1)]
  const done = frame >= run.frames.length - 1
  const nH = seq.split('').filter(ch => ch === 'H').length

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setFrame(0)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Lattice folding</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { if (done) setFrame(0); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-pink text-bg-base text-xs font-medium hover:bg-accent-pink/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Fold</>}
        </button>
        <button
          onClick={() => { setRunning(false); setSeq(makeSequence(N)) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs font-medium hover:text-text-primary transition-colors"
        >
          <Shuffle size={12} /> New sequence
        </button>
        <div className="flex items-center gap-1 text-xs">
          {(['guided', 'blind'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => { setRunning(false); setMode(m) }}
              className="px-2 py-1 rounded border transition-colors"
              style={
                mode === m
                  ? { color: C_CONTACT, borderColor: `${C_CONTACT}55`, background: `${C_CONTACT}14` }
                  : { color: 'rgba(245,240,232,0.45)', borderColor: 'rgba(245,240,232,0.14)' }
              }
            >
              {m === 'guided' ? 'funnelled' : 'blind'}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          tried <strong className="font-mono" style={{ color: C_TRACE }}>{cur.tried.toLocaleString()}</strong> ·{' '}
          E = <strong className="font-mono" style={{ color: C_TRACE }}>{cur.e}</strong> ·{' '}
          best <strong className="font-mono" style={{ color: C_BEST }}>{cur.best}</strong>
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        <span style={{ color: C_H }}>●</span> hydrophobic ({nH} of {N}) ·{' '}
        <span style={{ color: C_P }}>○</span> polar · gold dashes are buried H–H contacts, each worth −1.
        A 48-bead lattice chain already has roughly 3<sup>47</sup> ≈ 3×10<sup>22</sup> shapes. Given the
        same budget of {TRIALS.toLocaleString()} conformations, the funnelled search buries a real core;
        the blind one never gets close.
      </p>
    </div>
  )
}
