'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 400

const ORANGE = '#FB923C' // valence electrons / field accent
const BLUE = '#60A5FA' // inner-shell electrons
const GOLD = '#F59E0B' // nucleus / highlights
const GREEN = '#34D399' // noble-gas / completed shell
const INK = 'rgba(255,245,235,'

type Elem = {
  z: number
  sym: string
  name: string
  shells: number[] // electrons per shell, K,L,M,N
  group: number // 1..18 (main-group numbering)
  noble?: boolean
}

// The simple shell (Bohr) model for the first 20 elements: shells fill
// 2, 8, 8, 2. Real subshell order (Aufbau) is subtler, but this captures the
// point — every column shares an outer-shell (valence) count.
const ELEMENTS: Elem[] = [
  { z: 1, sym: 'H', name: 'Hydrogen', shells: [1], group: 1 },
  { z: 2, sym: 'He', name: 'Helium', shells: [2], group: 18, noble: true },
  { z: 3, sym: 'Li', name: 'Lithium', shells: [2, 1], group: 1 },
  { z: 4, sym: 'Be', name: 'Beryllium', shells: [2, 2], group: 2 },
  { z: 5, sym: 'B', name: 'Boron', shells: [2, 3], group: 13 },
  { z: 6, sym: 'C', name: 'Carbon', shells: [2, 4], group: 14 },
  { z: 7, sym: 'N', name: 'Nitrogen', shells: [2, 5], group: 15 },
  { z: 8, sym: 'O', name: 'Oxygen', shells: [2, 6], group: 16 },
  { z: 9, sym: 'F', name: 'Fluorine', shells: [2, 7], group: 17 },
  { z: 10, sym: 'Ne', name: 'Neon', shells: [2, 8], group: 18, noble: true },
  { z: 11, sym: 'Na', name: 'Sodium', shells: [2, 8, 1], group: 1 },
  { z: 12, sym: 'Mg', name: 'Magnesium', shells: [2, 8, 2], group: 2 },
  { z: 13, sym: 'Al', name: 'Aluminium', shells: [2, 8, 3], group: 13 },
  { z: 14, sym: 'Si', name: 'Silicon', shells: [2, 8, 4], group: 14 },
  { z: 15, sym: 'P', name: 'Phosphorus', shells: [2, 8, 5], group: 15 },
  { z: 16, sym: 'S', name: 'Sulfur', shells: [2, 8, 6], group: 16 },
  { z: 17, sym: 'Cl', name: 'Chlorine', shells: [2, 8, 7], group: 17 },
  { z: 18, sym: 'Ar', name: 'Argon', shells: [2, 8, 8], group: 18, noble: true },
  { z: 19, sym: 'K', name: 'Potassium', shells: [2, 8, 8, 1], group: 1 },
  { z: 20, sym: 'Ca', name: 'Calcium', shells: [2, 8, 8, 2], group: 2 },
]

const MAX_Z = ELEMENTS.length
const STEP_MS = 620
const APPEAR_MS = 260

const CX = 176
const CY = 202
const R0 = 30
const DR = 33
const SHELL_CAP = [2, 8, 8, 2]

const valenceOf = (e: Elem) => e.shells[e.shells.length - 1]
const periodOf = (e: Elem) => e.shells.length

// Members of the same group among the first twenty — the visible proof that a
// column is a shared valence count.
const groupMembers = (g: number) => ELEMENTS.filter(e => e.group === g)

export function ElectronShellAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const runningRef = useRef(false)
  const playingRef = useRef(false)
  const zRef = useRef(1)
  const appearStartRef = useRef(0)
  const lastStepRef = useRef(0)

  const [z, setZ] = useState(1)
  const [playing, setPlaying] = useState(false)

  const el = useMemo(() => ELEMENTS[z - 1], [z])

  const draw = useCallback((appear: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    const e = ELEMENTS[zRef.current - 1]
    const period = periodOf(e)
    const valence = valenceOf(e)

    // ---- title ----
    ctx.textAlign = 'left'
    ctx.font = '12px monospace'
    ctx.fillStyle = ORANGE
    ctx.fillText('Building atoms one electron at a time', 18, 24)
    ctx.font = '10px monospace'
    ctx.fillStyle = INK + '0.42)'
    ctx.fillText('simple shell (Bohr) model — shells hold 2, 8, 8, 2', 18, 40)

    // ---- shell rings ----
    for (let i = 0; i < 4; i++) {
      const r = R0 + i * DR
      const filled = i < e.shells.length ? e.shells[i] : 0
      const complete = filled === SHELL_CAP[i]
      ctx.beginPath()
      ctx.arc(CX, CY, r, 0, Math.PI * 2)
      ctx.strokeStyle = i < e.shells.length ? INK + '0.28)' : INK + '0.08)'
      ctx.lineWidth = 1
      ctx.stroke()
      if (complete && i === e.shells.length - 1 && e.noble) {
        ctx.beginPath()
        ctx.arc(CX, CY, r, 0, Math.PI * 2)
        ctx.strokeStyle = GREEN
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    // ---- nucleus ----
    ctx.beginPath()
    ctx.arc(CX, CY, 15, 0, Math.PI * 2)
    ctx.fillStyle = GOLD
    ctx.fill()
    ctx.fillStyle = 'rgba(15,13,10,0.92)'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`+${e.z}`, CX, CY + 4)

    // ---- electrons ----
    const outer = e.shells.length - 1
    for (let i = 0; i < e.shells.length; i++) {
      const r = R0 + i * DR
      const count = e.shells[i]
      const isOuter = i === outer
      for (let j = 0; j < count; j++) {
        const theta = -Math.PI / 2 + (j * Math.PI * 2) / count
        const ex = CX + r * Math.cos(theta)
        const ey = CY + r * Math.sin(theta)
        // Newest electron (last one of the outer shell) pops in.
        const isNewest = isOuter && j === count - 1
        const rad = isNewest ? 2 + 2.4 * appear : 3.4
        ctx.beginPath()
        ctx.arc(ex, ey, rad, 0, Math.PI * 2)
        ctx.fillStyle = isOuter ? ORANGE : BLUE
        ctx.fill()
        if (isNewest && appear < 1) {
          ctx.beginPath()
          ctx.arc(ex, ey, rad + 4 * (1 - appear), 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(251,146,60,${(0.6 * (1 - appear)).toFixed(3)})`
          ctx.lineWidth = 1.2
          ctx.stroke()
        }
      }
    }

    // legend under the atom
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.beginPath()
    ctx.arc(60, 348, 3.4, 0, Math.PI * 2)
    ctx.fillStyle = ORANGE
    ctx.fill()
    ctx.fillStyle = INK + '0.6)'
    ctx.fillText('valence (outer shell)', 70, 351)
    ctx.beginPath()
    ctx.arc(60, 366, 3.4, 0, Math.PI * 2)
    ctx.fillStyle = BLUE
    ctx.fill()
    ctx.fillStyle = INK + '0.6)'
    ctx.fillText('inner-shell (core)', 70, 369)

    // ---- big element readout ----
    ctx.textAlign = 'left'
    ctx.font = 'bold 20px monospace'
    ctx.fillStyle = e.noble ? GREEN : ORANGE
    ctx.fillText(e.sym, 344, 74)
    ctx.font = '12px monospace'
    ctx.fillStyle = INK + '0.72)'
    ctx.fillText(`${e.name}  ·  Z = ${e.z}`, 380, 74)

    ctx.font = '11px monospace'
    ctx.fillStyle = INK + '0.6)'
    ctx.fillText(`Period ${period}   ·   Group ${e.group}`, 344, 96)
    ctx.fillStyle = ORANGE
    ctx.fillText(`Valence electrons: ${valence}`, 344, 114)
    ctx.fillStyle = INK + '0.5)'
    ctx.fillText(`shells  [ ${e.shells.join(', ')} ]`, 344, 132)

    // status line: shell completion / new period
    ctx.font = '10px monospace'
    if (e.noble) {
      ctx.fillStyle = GREEN
      ctx.fillText('Outer shell FULL → noble gas (inert).', 344, 156)
      if (e.z < MAX_Z) ctx.fillText(`Next electron opens period ${period + 1}.`, 344, 170)
    } else if (valence === 1 && period > 1) {
      ctx.fillStyle = GOLD
      ctx.fillText(`Lone electron in a new shell → period ${period} begins.`, 344, 156)
    } else {
      ctx.fillStyle = INK + '0.42)'
      ctx.fillText('Adding electrons to the outer shell…', 344, 156)
    }

    // ---- group column: shared valence count ----
    const gx = 344
    let gy = 202
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = INK + '0.72)'
    ctx.fillText(`Group ${e.group} — one column, one valence count`, gx, gy)
    gy += 8
    ctx.strokeStyle = INK + '0.14)'
    ctx.beginPath()
    ctx.moveTo(gx, gy)
    ctx.lineTo(gx + 230, gy)
    ctx.stroke()
    gy += 16
    const members = groupMembers(e.group)
    for (const m of members) {
      const cur = m.z === e.z
      ctx.font = cur ? 'bold 11px monospace' : '11px monospace'
      ctx.fillStyle = cur ? GREEN : INK + '0.55)'
      ctx.fillText(m.sym.padEnd(3, ' '), gx, gy)
      ctx.fillStyle = cur ? GREEN : INK + '0.4)'
      ctx.font = '10px monospace'
      ctx.fillText(`[ ${m.shells.join(', ')} ]`, gx + 34, gy)
      ctx.fillStyle = cur ? ORANGE : INK + '0.35)'
      ctx.fillText(`${valenceOf(m)} valence e⁻`, gx + 150, gy)
      gy += 17
    }
    ctx.font = '9px monospace'
    ctx.fillStyle = INK + '0.4)'
    ctx.fillText('same outer count ⇒ same chemistry', gx, gy + 4)
  }, [])

  const frame = useCallback(() => {
    const now = performance.now()
    if (playingRef.current && now - lastStepRef.current >= STEP_MS) {
      if (zRef.current < MAX_Z) {
        zRef.current += 1
        setZ(zRef.current)
        lastStepRef.current = now
        appearStartRef.current = now
      } else {
        playingRef.current = false
        setPlaying(false)
      }
    }
    const appear = Math.min(1, (now - appearStartRef.current) / APPEAR_MS)
    draw(appear)
    if (playingRef.current || appear < 1) {
      rafRef.current = requestAnimationFrame(frame)
    } else {
      runningRef.current = false
    }
  }, [draw])

  const kick = useCallback(() => {
    if (runningRef.current) return
    runningRef.current = true
    rafRef.current = requestAnimationFrame(frame)
  }, [frame])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        playingRef.current = false
        setPlaying(false)
        zRef.current = 10 // static final frame: Neon, a completed shell
        setZ(10)
        appearStartRef.current = performance.now() - APPEAR_MS
        draw(1)
        return
      }
      zRef.current = 1
      setZ(1)
      playingRef.current = true
      setPlaying(true)
      lastStepRef.current = performance.now()
      appearStartRef.current = performance.now()
      kick()
    },
  })

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const onPlay = () => {
    if (zRef.current >= MAX_Z) {
      zRef.current = 1
      setZ(1)
    }
    playingRef.current = true
    setPlaying(true)
    lastStepRef.current = performance.now()
    appearStartRef.current = performance.now()
    kick()
  }

  const onStep = () => {
    playingRef.current = false
    setPlaying(false)
    if (zRef.current < MAX_Z) {
      zRef.current += 1
      setZ(zRef.current)
      appearStartRef.current = performance.now()
      kick()
    }
  }

  const onReset = () => {
    playingRef.current = false
    setPlaying(false)
    zRef.current = 1
    setZ(1)
    appearStartRef.current = performance.now() - APPEAR_MS
    triggerReset()
    draw(1)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Electron shells build the periods
        </span>
        <button
          onClick={onReset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas
          role="img"
          aria-label="Animated diagram: Electron shells build the periods. Values are reported below the diagram."
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)', width: '100%', height: 'auto', aspectRatio: `${W} / ${H}` }}
        />
      </div>
      <div
        className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1"
      >
        <span style={{ color: ORANGE }}>{el.sym}</span>
        <span>Z = {el.z}</span>
        <span>Period {periodOf(el)}</span>
        <span>Group {el.group}</span>
        <span>Valence: {valenceOf(el)}</span>
        <span className="text-text-muted">
          {el.noble ? 'full shell → noble gas' : `filling shell ${periodOf(el)}`}
        </span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={onPlay}
          disabled={playing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base disabled:opacity-50"
        >
          <Play size={13} /> {playing ? 'Building…' : 'Play H → Ca'}
        </button>
        <button
          onClick={onStep}
          disabled={z >= MAX_Z}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border text-text-secondary hover:bg-bg-hover disabled:opacity-40"
        >
          + Add electron
        </button>
        <span className="ml-auto text-xs text-text-muted font-mono">
          {z} / {MAX_Z} electrons
        </span>
      </div>
    </div>
  )
}
