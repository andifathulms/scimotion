'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const VW = 600
const VH = 340

const PINK = '#F472B6' // field accent — myosin / active
const ACTIN = '#60A5FA' // thin filament (blue)
const ZDISC = 'rgba(245,240,232,0.8)'
const MYO = 'rgba(245,240,232,0.5)'

// Rest and fully-contracted half-lengths of the sarcomere (px from centre to Z-disc).
const HALF_REST = 236
const HALF_MIN = 150
// Physical sarcomere length shown in the readout (micrometres).
const LEN_REST = 2.4
const LEN_MIN = LEN_REST * (HALF_MIN / HALF_REST)

// Fixed filament lengths (px). These NEVER change — only their overlap does.
const ACTIN_LEN = 150 // reaches inward from each Z-disc
const MYO_HALF = 96 // thick filament half-length, centred on the midline

// The four stages of the cross-bridge cycle, keyed by phase p in [0,1).
type Bridge = 'attach' | 'power stroke' | 'detach' | 're-cock'
function bridgeAt(p: number): Bridge {
  if (p < 0.25) return 'attach'
  if (p < 0.5) return 'power stroke'
  if (p < 0.75) return 'detach'
  return 're-cock'
}

function lerp(a: number, b: number, t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t
  return a + (b - a) * c
}

// Myosin-head reach: cocked (0) -> attached & pulled (1) across the power stroke.
function headStroke(p: number): number {
  if (p < 0.25) return lerp(0, 0.15, p / 0.25) // reaching to bind
  if (p < 0.5) return lerp(0.15, 1, (p - 0.25) / 0.25) // power stroke
  if (p < 0.75) return lerp(1, 0, (p - 0.5) / 0.25) // detach, spring back
  return 0 // re-cocked, waiting
}

export function SarcomereAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [running, setRunning] = useState(false)
  const [reducedStatic, setReducedStatic] = useState(false)
  const [contracting, setContracting] = useState(true)
  const [bridge, setBridge] = useState<Bridge>('re-cock')
  const [len, setLen] = useState(LEN_REST)

  const cRef = useRef(0) // contraction 0 (rest) .. 1 (fully shortened)
  const phaseRef = useRef(0) // cross-bridge cycle phase 0..1
  const contractRef = useRef(true)
  const rafRef = useRef(0)

  const draw = useCallback((c: number, phase: number, active: boolean) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
    const pw = Math.round(VW * dpr)
    const ph = Math.round(VH * dpr)
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw
      canvas.height = ph
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, VW, VH)

    const cx = VW / 2
    const midY = 150
    const half = lerp(HALF_REST, HALF_MIN, c)
    const leftZ = cx - half
    const rightZ = cx + half

    // --- sarcomere span bracket ---
    ctx.strokeStyle = 'rgba(245,240,232,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(leftZ, 40); ctx.lineTo(rightZ, 40)
    ctx.moveTo(leftZ, 34); ctx.lineTo(leftZ, 46)
    ctx.moveTo(rightZ, 34); ctx.lineTo(rightZ, 46)
    ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.font = '11px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('one sarcomere', cx, 30)

    // --- thick (myosin) filament: fixed length, centred ---
    ctx.strokeStyle = MYO
    ctx.lineWidth = 9
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - MYO_HALF, midY)
    ctx.lineTo(cx + MYO_HALF, midY)
    ctx.stroke()

    // rows of actin (offset above and below the myosin backbone)
    const rows = [midY - 16, midY + 16]

    // --- thin (actin) filaments anchored to each Z-disc, fixed length ---
    ctx.strokeStyle = ACTIN
    ctx.lineWidth = 4
    for (const ry of rows) {
      // left actin: from left Z-disc inward
      ctx.beginPath()
      ctx.moveTo(leftZ, ry)
      ctx.lineTo(leftZ + ACTIN_LEN, ry)
      ctx.stroke()
      // right actin: from right Z-disc inward
      ctx.beginPath()
      ctx.moveTo(rightZ, ry)
      ctx.lineTo(rightZ - ACTIN_LEN, ry)
      ctx.stroke()
    }

    // --- myosin heads reaching to the actin, animating the cross-bridge cycle ---
    const stroke = active ? headStroke(phase) : 0
    const state = active ? bridgeAt(phase) : 're-cock'
    const bound = state === 'attach' || state === 'power stroke'
    const headXs = [-64, -32, 32, 64] // positions along the thick filament
    for (const hx0 of headXs) {
      const baseX = cx + hx0
      const toActin = hx0 < 0 ? -1 : 1 // heads on the left reach up-left, etc.
      for (const ry of rows) {
        const dir = ry < midY ? -1 : 1 // up or down toward that actin row
        const baseY = midY + dir * 4
        // cocked head angle vs. pulled: interpolate the tip
        const reach = 12 * stroke
        const tipX = baseX + toActin * (6 + reach)
        const tipY = ry - dir * 3
        ctx.strokeStyle = bound ? PINK : 'rgba(244,114,182,0.45)'
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(baseX, baseY)
        ctx.lineTo(tipX, tipY)
        ctx.stroke()
        // head knob
        ctx.fillStyle = bound ? PINK : 'rgba(244,114,182,0.45)'
        ctx.beginPath()
        ctx.arc(tipX, tipY, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // --- Z-discs (drawn last, on top) ---
    ctx.strokeStyle = ZDISC
    ctx.lineWidth = 5
    ctx.lineCap = 'butt'
    for (const zx of [leftZ, rightZ]) {
      ctx.beginPath()
      ctx.moveTo(zx, midY - 34)
      ctx.lineTo(zx, midY + 34)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(245,240,232,0.75)'
    ctx.font = '10px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('Z-disc', leftZ, midY + 50)
    ctx.fillText('Z-disc', rightZ, midY + 50)

    // legend
    ctx.textAlign = 'left'
    ctx.font = '11px ui-monospace, monospace'
    ctx.fillStyle = ACTIN
    ctx.fillText('— actin (thin)', 24, VH - 44)
    ctx.fillStyle = MYO
    ctx.fillText('— myosin (thick)', 24, VH - 26)
    ctx.fillStyle = PINK
    ctx.textAlign = 'right'
    ctx.fillText(active ? 'cross-bridge: ' + state : 'relaxed — no cross-bridges', VW - 24, VH - 26)

    setBridge(state)
    setLen(lerp(LEN_REST, LEN_MIN, c))
  }, [])

  // main loop: advance contraction toward target, cycle cross-bridges while contracting
  useEffect(() => {
    if (!running || reducedStatic) return
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const target = contractRef.current ? 1 : 0
      if (contractRef.current) {
        // cycle the cross-bridges; ratchet the sarcomere shorter during the power stroke
        phaseRef.current = (phaseRef.current + dt / 1.6) % 1
        if (cRef.current < target) {
          cRef.current = Math.min(target, cRef.current + dt * 0.16)
        }
      } else {
        // relax: filaments slide back, cycle idles at rest
        phaseRef.current = 0.85
        if (cRef.current > target) {
          cRef.current = Math.max(target, cRef.current - dt * 0.5)
        }
      }
      draw(cRef.current, phaseRef.current, contractRef.current)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, reducedStatic, draw])

  // reduced-motion static frame: a contracted sarcomere mid power-stroke
  useEffect(() => {
    if (!reducedStatic) return
    cRef.current = 1
    phaseRef.current = 0.4
    contractRef.current = true
    setContracting(true)
    draw(1, 0.4, true)
  }, [reducedStatic, draw])

  // keep a frame painted while paused
  useEffect(() => {
    if (running || reducedStatic) return
    draw(cRef.current, phaseRef.current, contractRef.current)
  }, [running, reducedStatic, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setReducedStatic(true); return }
      setRunning(true)
    },
  })

  const toggleMode = () => {
    const next = !contractRef.current
    contractRef.current = next
    setContracting(next)
    setReducedStatic(false)
    setRunning(true)
    if (!next) phaseRef.current = 0.85
  }

  const reset = () => {
    triggerReset()
    setRunning(false)
    setReducedStatic(false)
    cRef.current = 0
    phaseRef.current = 0.85
    contractRef.current = true
    setContracting(true)
    draw(0, 0.85, false)
  }

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Inside a sarcomere
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: VH + 10 }}>
        <canvas
          ref={canvasRef}
          width={VW}
          height={VH}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          state: <span style={{ color: PINK }}>{contracting ? 'contracting' : 'relaxing'}</span>
        </span>
        <span>sarcomere length: {len.toFixed(2)} µm</span>
        <span>
          cross-bridge: <span style={{ color: PINK }}>{contracting ? bridge : 'none'}</span>
        </span>
        <span style={{ color: ACTIN }}>filaments: unchanged length</span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { setReducedStatic(false); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={toggleMode}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary border border-border"
        >
          {contracting ? 'Relax muscle' : 'Contract muscle'}
        </button>
        <span className="text-xs text-text-muted">
          Z-discs move closer · filaments slide, never shorten
        </span>
      </div>
    </div>
  )
}
