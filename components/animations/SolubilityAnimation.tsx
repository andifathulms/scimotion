'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Plus } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const SOLUTE = '#FB923C' // dissolved solute particles (field accent, orange)
const EXCESS = '#B45309' // undissolved crystals settled at the bottom

// Beaker interior (fixed volume of solvent).
const BX0 = 40
const BX1 = 500
const BTOP = 58
const BBOT = 300
const SPOUT_X = 270
const WATER_LEVEL = BTOP + 16

const MAXADD = 24
const PER_ROW = 15
const PILE_X0 = BX0 + 22
const PILE_DX = 30
const PILE_DY = 14

// Solubility rises with temperature for a typical solid.
function limitFor(t: number) {
  return Math.round(4 + t * 0.16) // T=0 -> 4, 20 -> 7, 100 -> 20
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type P = { active: boolean; x: number; y: number; vx: number; vy: number; dx: number; dy: number }

function buildParticles(): P[] {
  const rng = mulberry32(31337)
  const out: P[] = []
  for (let i = 0; i < MAXADD; i++) {
    out.push({
      active: false,
      x: SPOUT_X,
      y: BTOP - 6,
      vx: 0,
      vy: 0,
      dx: BX0 + 26 + rng() * (BX1 - BX0 - 52),
      dy: WATER_LEVEL + 24 + rng() * (BBOT - WATER_LEVEL - 70),
    })
  }
  return out
}

function pilePos(rank: number) {
  const col = rank % PER_ROW
  const row = Math.floor(rank / PER_ROW)
  return { x: PILE_X0 + col * PILE_DX, y: BBOT - 8 - row * PILE_DY }
}

export function SolubilityAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const particlesRef = useRef<P[]>(buildParticles())
  const frameRef = useRef(0)
  const addedRef = useRef(0)
  const tempRef = useRef(20)
  const pouringRef = useRef(false)

  const [added, setAdded] = useState(0)
  const [temp, setTemp] = useState(20)
  const [pouring, setPouring] = useState(false)
  const [readout, setReadout] = useState({ added: 0, dissolved: 0, excess: 0, state: 'empty', limit: 7 })

  const commitAdded = useCallback((v: number) => {
    const n = Math.max(0, Math.min(MAXADD, v))
    addedRef.current = n
    setAdded(n)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const limit = limitFor(tempRef.current)

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    // Beaker + fixed water body.
    ctx.fillStyle = 'rgba(127,180,216,0.08)'
    ctx.fillRect(BX0, WATER_LEVEL, BX1 - BX0, BBOT - WATER_LEVEL)
    ctx.strokeStyle = 'rgba(245,240,232,0.32)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(BX0, BTOP)
    ctx.lineTo(BX0, BBOT)
    ctx.lineTo(BX1, BBOT)
    ctx.lineTo(BX1, BTOP)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(127,180,216,0.45)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(BX0, WATER_LEVEL)
    ctx.lineTo(BX1, WATER_LEVEL)
    ctx.stroke()
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(127,180,216,0.7)'
    ctx.fillText('fixed volume of water', BX0 + 6, WATER_LEVEL - 6)

    // Solubility-limit gauge on the right.
    const gx = BX1 + 22
    const gTop = BTOP + 8
    const gBot = BBOT - 8
    ctx.strokeStyle = 'rgba(245,240,232,0.25)'
    ctx.lineWidth = 1
    ctx.strokeRect(gx, gTop, 40, gBot - gTop)
    const frac = limit / MAXADD
    const fillTop = gBot - frac * (gBot - gTop)
    ctx.fillStyle = 'rgba(251,146,60,0.28)'
    ctx.fillRect(gx, fillTop, 40, gBot - fillTop)
    ctx.strokeStyle = SOLUTE
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(gx, fillTop)
    ctx.lineTo(gx + 40, fillTop)
    ctx.stroke()
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = SOLUTE
    ctx.fillText(`${limit}`, gx + 20, fillTop - 6)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('solubility', gx + 20, gTop - 14)
    ctx.fillText('limit', gx + 20, gTop - 4)
    ctx.fillText(`${tempRef.current}°C`, gx + 20, gBot + 14)

    const ps = particlesRef.current
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]
      if (!p.active) continue
      const dissolved = i < limit
      if (dissolved) {
        ctx.strokeStyle = 'rgba(127,180,216,0.55)'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
        ctx.fillStyle = SOLUTE
        ctx.fill()
      } else {
        // Undissolved crystal in the pile.
        ctx.fillStyle = EXCESS
        ctx.fillRect(p.x - 6, p.y - 6, 12, 12)
        ctx.strokeStyle = 'rgba(15,13,10,0.6)'
        ctx.lineWidth = 1
        ctx.strokeRect(p.x - 6, p.y - 6, 12, 12)
      }
    }

    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = SOLUTE
    ctx.fillText('● dissolved (dispersed)', BX0 + 6, BBOT + 18)
    ctx.fillStyle = EXCESS
    ctx.fillText('■ undissolved excess', BX0 + 190, BBOT + 18)
  }, [])

  const step = useCallback(() => {
    frameRef.current++
    if (pouringRef.current && frameRef.current % 16 === 0) {
      if (addedRef.current < MAXADD) commitAdded(addedRef.current + 1)
      else {
        pouringRef.current = false
        setPouring(false)
      }
    }

    const limit = limitFor(tempRef.current)
    const rng = mulberry32(frameRef.current * 2654435761)
    const ps = particlesRef.current
    let settledRank = 0
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]
      if (i < addedRef.current && !p.active) {
        p.active = true
        p.x = SPOUT_X
        p.y = BTOP - 4
      }
      if (!p.active) continue
      const dissolved = i < limit
      let tx: number
      let ty: number
      if (dissolved) {
        tx = p.dx + (rng() - 0.5) * 10
        ty = p.dy + (rng() - 0.5) * 10
      } else {
        const pos = pilePos(settledRank)
        tx = pos.x
        ty = pos.y
        settledRank++
      }
      p.x += (tx - p.x) * 0.12
      p.y += (ty - p.y) * 0.12
    }
  }, [commitAdded])

  const refreshReadout = useCallback(() => {
    const limit = limitFor(tempRef.current)
    const a = addedRef.current
    const dissolved = Math.min(a, limit)
    const excess = Math.max(0, a - limit)
    let state = 'empty'
    if (a > 0) state = a < limit ? 'unsaturated' : 'saturated'
    setReadout({ added: a, dissolved, excess, state, limit })
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Static final frame: saturated solution with an undissolved pile.
        commitAdded(MAXADD)
        const limit = limitFor(tempRef.current)
        const ps = particlesRef.current
        let sr = 0
        for (let i = 0; i < ps.length; i++) {
          ps[i].active = true
          if (i < limit) {
            ps[i].x = ps[i].dx
            ps[i].y = ps[i].dy
          } else {
            const pos = pilePos(sr++)
            ps[i].x = pos.x
            ps[i].y = pos.y
          }
        }
        draw()
        refreshReadout()
      } else {
        setPouring(true)
        pouringRef.current = true
      }
    },
  })

  useEffect(() => {
    draw()
    refreshReadout()
    // Persistent easing loop so settling/recrystallising stays smooth.
    const tick = () => {
      step()
      draw()
      if (frameRef.current % 6 === 0) refreshReadout()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, step, refreshReadout])

  const onTemp = (v: number) => {
    setTemp(v)
    tempRef.current = v
    refreshReadout()
  }

  const onAdded = (v: number) => {
    commitAdded(v)
    refreshReadout()
  }

  const stepOne = () => {
    commitAdded(addedRef.current + 1)
    refreshReadout()
  }

  const togglePour = () => {
    if (addedRef.current >= MAXADD) commitAdded(0)
    const next = !pouringRef.current
    pouringRef.current = next
    setPouring(next)
  }

  const reset = () => {
    setPouring(false)
    pouringRef.current = false
    triggerReset()
    particlesRef.current = buildParticles()
    frameRef.current = 0
    commitAdded(0)
    refreshReadout()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · A solvent dissolves only so much — then it saturates
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
          style={{ background: '#0F0D0A' }}
        />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          added: <strong style={{ color: '#F5F0E8' }}>{readout.added}</strong>
        </span>
        <span>
          dissolved: <strong style={{ color: SOLUTE }}>{readout.dissolved}</strong>
        </span>
        <span>
          undissolved excess: <strong style={{ color: EXCESS }}>{readout.excess}</strong>
        </span>
        <span>
          limit: <strong style={{ color: SOLUTE }}>{readout.limit}</strong> @ {temp}°C
        </span>
        <span>
          state:{' '}
          <strong style={{ color: readout.state === 'saturated' ? EXCESS : '#FB923C' }}>
            {readout.state}
            {readout.excess > 0 ? ' (excess settling)' : ''}
          </strong>
        </span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={togglePour}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {pouring ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Pour</>}
        </button>
        <button
          onClick={stepOne}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Plus size={12} /> Add one
        </button>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          Solute added
          <input
            type="range"
            min={0}
            max={MAXADD}
            value={added}
            onChange={e => onAdded(Number(e.target.value))}
            className="w-28"
            style={{ accentColor: SOLUTE }}
          />
          <span className="font-mono text-text-muted">{added}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          Temperature
          <input
            type="range"
            min={0}
            max={100}
            value={temp}
            onChange={e => onTemp(Number(e.target.value))}
            className="w-28"
            style={{ accentColor: '#FB923C' }}
          />
          <span className="font-mono text-text-muted">{temp}°C</span>
        </label>
      </div>
    </div>
  )
}
