'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 640
const H = 380

// --- molecule box ---------------------------------------------------
const BX0 = 14
const BY0 = 48
const BX1 = 372
const BY1 = 300

// --- right panel: thermometer + strength bar ------------------------
const TX = 452 // thermometer column
const TY_TOP = 66 // = +150 °C
const TY_BOT = 300 // = -200 °C
const TMIN = -200
const TMAX = 150

// --- physical model -------------------------------------------------
// Every substance has London dispersion, which grows with molecular size.
// Polar molecules add a dipole–dipole term; hydrogen-bonders add the big one.
// All values are per-interaction energies in kJ/mol, deliberately schematic
// but with the right ORDERS: dispersion single-digit, dipole tens-ish, the
// hydrogen bond the strongest of the three.
type Kind = 'nonpolar' | 'polar' | 'hbond'

const DISP_K = 1.9 // kJ/mol per size unit
const DIPOLE = 5 // kJ/mol
const HBOND = 20 // kJ/mol
const SIZE_MIN = 1
const SIZE_MAX = 8

function dispersion(size: number) {
  return DISP_K * size
}
function extra(kind: Kind) {
  return kind === 'polar' ? DIPOLE : kind === 'hbond' ? HBOND : 0
}
function totalEnergy(kind: Kind, size: number) {
  return dispersion(size) + extra(kind)
}
// Calibrated so water (hbond, size 1 → E ≈ 21.9) boils at 100 °C and methane
// (nonpolar, size 1 → E ≈ 1.9) boils near −160 °C: a straight line through both.
function boilingC(E: number) {
  return 13 * E - 184.7
}

const ORANGE = '#FB923C'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

const EMAX_BAR = 36 // full width of the strength bar, kJ/mol

// molecules: diatomic clusters on a loose liquid grid
const COLS = 6
const ROWS = 4
const N = COLS * ROWS
const BOND = 7 // half the internal bond length, px
const ATOM = 4.4

type Mol = {
  x: number
  y: number
  ax: number // liquid anchor
  ay: number
  vx: number
  vy: number
  ang: number
  spin: number
  ph: number
  launched: boolean
}

function makeMolecules(): Mol[] {
  return Array.from({ length: N }, (_, k) => {
    const i = k % COLS
    const j = Math.floor(k / COLS)
    const ax = BX0 + 40 + i * 56
    const ay = BY1 - 26 - j * 48
    return { x: ax, y: ay, ax, ay, vx: 0, vy: 0, ang: (k % 3) * 1.1, spin: 0, ph: k * 1.7, launched: false }
  })
}

function shuffledRanks(): number[] {
  const a = Array.from({ length: N }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  const rank = new Array<number>(N)
  a.forEach((m, pos) => (rank[m] = pos))
  return rank
}

const tempToY = (t: number) => TY_BOT - ((t - TMIN) / (TMAX - TMIN)) * (TY_BOT - TY_TOP)

export function IntermolecularForceAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const molRef = useRef<Mol[]>(makeMolecules())
  const rankRef = useRef<number[]>(shuffledRanks())
  const tickRef = useRef(0)

  const kindRef = useRef<Kind>('hbond')
  const sizeRef = useRef(1)
  const tempRef = useRef(-40)

  const [kind, setKind] = useState<Kind>('hbond')
  const [size, setSize] = useState(1)
  const [temp, setTemp] = useState(-40)
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        tempRef.current = 130
        setTemp(130)
        return
      }
      setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const kd = kindRef.current
    const sz = sizeRef.current
    const T = tempRef.current
    const E = totalEnergy(kd, sz)
    const tb = boilingC(E)

    // fraction of molecules that have boiled off, ramped across ~45° near T_b
    const boilFrac = Math.max(0, Math.min(1, (T - (tb - 6)) / 45))
    const nGas = Math.round(boilFrac * N)
    const strengthNorm = Math.max(0, Math.min(1, (E - 1.9) / (35 - 1.9)))

    ctx.clearRect(0, 0, W, H)

    // ---- molecule box ----
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(BX0, BY0, BX1 - BX0, BY1 - BY0)

    const mols = molRef.current
    const rank = rankRef.current

    // intermolecular attraction links between neighbouring LIQUID molecules.
    // These are the weak forces between molecules — they fade as molecules boil off.
    ctx.lineWidth = 1
    for (let k = 0; k < N; k++) {
      if (rank[k] >= nGas) {
        const i = k % COLS
        const j = Math.floor(k / COLS)
        const right = k + 1
        const up = k + COLS
        for (const nb of [i < COLS - 1 ? right : -1, j < ROWS - 1 ? up : -1]) {
          if (nb < 0 || rank[nb] >= nGas) continue
          const a = mols[k]
          const b = mols[nb]
          ctx.beginPath()
          ctx.setLineDash([3, 3])
          ctx.strokeStyle = `rgba(251,146,60,${0.12 + 0.4 * strengthNorm})`
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }
    }
    ctx.setLineDash([])

    // draw every molecule as a diatomic: two atoms + a BRIGHT internal bond
    // that is never broken, boiling or not.
    for (let k = 0; k < N; k++) {
      const m = mols[k]
      const gas = rank[k] < nGas
      const dx = Math.cos(m.ang) * BOND
      const dy = Math.sin(m.ang) * BOND
      // internal covalent bond — always intact
      ctx.beginPath()
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 2
      ctx.moveTo(m.x - dx, m.y - dy)
      ctx.lineTo(m.x + dx, m.y + dy)
      ctx.stroke()
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(m.x + s * dx, m.y + s * dy, ATOM, 0, Math.PI * 2)
        ctx.fillStyle = gas ? VIOLET : ORANGE
        ctx.fill()
      }
    }

    // liquid surface / phase caption
    ctx.font = 'bold 12px monospace'
    if (nGas === 0) {
      ctx.fillStyle = ORANGE
      ctx.fillText('LIQUID · molecules held together', BX0, 30)
    } else if (nGas >= N) {
      ctx.fillStyle = VIOLET
      ctx.fillText('GAS · molecules separated — bonds intact', BX0, 30)
    } else {
      ctx.fillStyle = GOLD
      ctx.fillText('BOILING · separating without breaking', BX0, 30)
    }
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('gold = covalent bond WITHIN a molecule (never breaks)', BX0, BY1 + 15)
    ctx.fillText('dashed = weak force BETWEEN molecules (broken by boiling)', BX0, BY1 + 27)

    // ---- thermometer ----
    ctx.strokeStyle = 'rgba(255,245,235,0.22)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(TX, TY_TOP)
    ctx.lineTo(TX, TY_BOT)
    ctx.stroke()
    for (const tv of [-200, -100, 0, 100]) {
      const y = tempToY(tv)
      ctx.strokeStyle = 'rgba(255,245,235,0.15)'
      ctx.beginPath()
      ctx.moveTo(TX - 5, y)
      ctx.lineTo(TX + 5, y)
      ctx.stroke()
      ctx.font = '9px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.textAlign = 'right'
      ctx.fillText(`${tv}`, TX - 9, y + 3)
    }
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('°C', TX - 22, TY_TOP - 6)

    // boiling-point line
    const yb = tempToY(Math.max(TMIN, Math.min(TMAX, tb)))
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = GREEN
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(TX, yb)
    ctx.lineTo(W - 16, yb)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = GREEN
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'right'
    ctx.fillText(`boiling point ${Math.round(tb)} °C`, W - 16, yb - 5)
    ctx.textAlign = 'left'

    // current temperature marker + bulb
    const yT = tempToY(Math.max(TMIN, Math.min(TMAX, T)))
    const phaseCol = nGas >= N ? VIOLET : nGas > 0 ? GOLD : ORANGE
    ctx.beginPath()
    ctx.arc(TX, yT, 5, 0, Math.PI * 2)
    ctx.fillStyle = phaseCol
    ctx.fill()
    ctx.beginPath()
    ctx.arc(TX, TY_BOT + 12, 9, 0, Math.PI * 2)
    ctx.fillStyle = phaseCol
    ctx.fill()
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = phaseCol
    ctx.fillText(`T = ${Math.round(T)} °C`, TX + 12, yT + 4)

    // ---- strength stacked bar ----
    const SB_X = TX - 8
    const SB_Y = BY1 + 44
    const SB_W = W - 16 - SB_X
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('intermolecular attraction', SB_X, SB_Y - 6)
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(SB_X, SB_Y, SB_W, 12)
    const scale = SB_W / EMAX_BAR
    let cx = SB_X
    const disp = dispersion(sz)
    const segs: [number, string][] = [[disp, ORANGE]]
    if (kd === 'polar') segs.push([DIPOLE, BLUE])
    if (kd === 'hbond') segs.push([HBOND, VIOLET])
    for (const [val, col] of segs) {
      ctx.fillStyle = col
      ctx.fillRect(cx, SB_Y, val * scale, 12)
      cx += val * scale
    }
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.7)'
    ctx.fillText(`${E.toFixed(1)} kJ/mol total`, SB_X, SB_Y + 28)

    // legend for the segments
    ctx.font = '9px monospace'
    let lx = SB_X
    const ly = SB_Y + 42
    const legend: [string, string][] = [['dispersion', ORANGE]]
    if (kd === 'polar') legend.push(['dipole', BLUE])
    if (kd === 'hbond') legend.push(['H-bond', VIOLET])
    for (const [lab, col] of legend) {
      ctx.fillStyle = col
      ctx.fillRect(lx, ly - 7, 8, 8)
      ctx.fillStyle = 'rgba(245,240,232,0.55)'
      ctx.fillText(lab, lx + 12, ly)
      lx += 20 + ctx.measureText(lab).width + 14
    }
  }, [])

  const stepMolecules = useCallback(() => {
    const kd = kindRef.current
    const sz = sizeRef.current
    const T = tempRef.current
    const E = totalEnergy(kd, sz)
    const tb = boilingC(E)
    const t = tickRef.current
    const boilFrac = Math.max(0, Math.min(1, (T - (tb - 6)) / 45))
    const nGas = Math.round(boilFrac * N)
    const strengthNorm = Math.max(0, Math.min(1, (E - 1.9) / (35 - 1.9)))
    // Weak forces → loose, wobbly liquid; strong forces → tightly held, barely moving.
    const jitter = 1.2 + 5 * (1 - strengthNorm)
    const gasSpeed = 0.9 + 1.6 * Math.max(0, (T - tb) / 120)

    const mols = molRef.current
    const rank = rankRef.current

    mols.forEach((m, k) => {
      const gas = rank[k] < nGas
      if (!gas) {
        // liquid: jostle about the anchor, never leaving
        m.launched = false
        m.x = m.ax + Math.sin(t * 0.09 + m.ph) * jitter
        m.y = m.ay + Math.cos(t * 0.075 + m.ph * 1.3) * jitter
        m.ang += 0.004 * (1 + 3 * (1 - strengthNorm))
        m.vx = 0
        m.vy = 0
        return
      }
      if (!m.launched) {
        const a = Math.random() * Math.PI * 2
        m.vx = Math.cos(a) * gasSpeed
        m.vy = Math.sin(a) * gasSpeed - 0.6 // slight upward bias as it escapes
        m.spin = (Math.random() - 0.5) * 0.12
        m.launched = true
      }
      m.x += m.vx
      m.y += m.vy
      m.ang += m.spin
      // renormalise speed to temperature, bounce off the box walls
      const mag = Math.hypot(m.vx, m.vy) || 1
      m.vx = (m.vx / mag) * gasSpeed
      m.vy = (m.vy / mag) * gasSpeed
      if (m.x < BX0 + 8) { m.x = BX0 + 8; m.vx = Math.abs(m.vx) }
      if (m.x > BX1 - 8) { m.x = BX1 - 8; m.vx = -Math.abs(m.vx) }
      if (m.y < BY0 + 8) { m.y = BY0 + 8; m.vy = Math.abs(m.vy) }
      if (m.y > BY1 - 8) { m.y = BY1 - 8; m.vy = -Math.abs(m.vy) }
    })

    tickRef.current += 1
  }, [])

  // Autoplay: heat the sample up past its boiling point, then hold.
  useEffect(() => {
    if (!running) return
    const tick = () => {
      const kd = kindRef.current
      const sz = sizeRef.current
      const tb = boilingC(totalEnergy(kd, sz))
      const target = Math.min(TMAX, tb + 45)
      tempRef.current = Math.min(target, tempRef.current + 0.9)
      stepMolecules()
      draw()
      if (tickRef.current % 3 === 0) setTemp(Math.round(tempRef.current))
      if (tempRef.current >= target) {
        setTemp(Math.round(tempRef.current))
        setRunning(false)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, stepMolecules, draw])

  // keep the picture live (jostling) even while paused
  useEffect(() => {
    if (running) return
    const tick = () => {
      stepMolecules()
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, stepMolecules, draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    molRef.current = makeMolecules()
    rankRef.current = shuffledRanks()
    tickRef.current = 0
    kindRef.current = 'hbond'
    sizeRef.current = 1
    tempRef.current = -40
    setKind('hbond')
    setSize(1)
    setTemp(-40)
  }

  const E = totalEnergy(kind, size)
  const tb = Math.round(boilingC(E))

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Force strength sets the boiling point
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <div className="flex items-center gap-1">
          {(['nonpolar', 'polar', 'hbond'] as Kind[]).map(kOpt => (
            <button
              key={kOpt}
              onClick={() => {
                setRunning(false)
                kindRef.current = kOpt
                setKind(kOpt)
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                kind === kOpt
                  ? 'bg-accent-gold text-bg-base'
                  : 'border border-border text-text-secondary hover:bg-bg-hover'
              }`}
            >
              {kOpt === 'nonpolar' ? 'Nonpolar' : kOpt === 'polar' ? 'Polar' : 'H-bonding'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Size:</span>
          <input
            type="range"
            min={SIZE_MIN}
            max={SIZE_MAX}
            step={1}
            value={size}
            onChange={e => {
              setRunning(false)
              sizeRef.current = +e.target.value
              setSize(+e.target.value)
            }}
            className="w-24 accent-accent-gold"
            aria-label="Molecular size"
          />
          <span className="font-mono text-text-secondary">{size}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>T:</span>
          <input
            type="range"
            min={TMIN}
            max={TMAX}
            step={1}
            value={temp}
            onChange={e => {
              setRunning(false)
              tempRef.current = +e.target.value
              setTemp(+e.target.value)
            }}
            className="w-28 accent-accent-gold"
            aria-label="Temperature"
          />
          <span className="font-mono text-text-secondary w-14">{temp} °C</span>
        </label>
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Heat past boiling</>}
        </button>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          {E.toFixed(1)} kJ/mol · boils {tb} °C
        </span>
      </div>
    </div>
  )
}
