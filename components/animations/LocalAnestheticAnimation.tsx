'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 220
const FIBRE_Y = 118
const FIBRE_X0 = 28
const FIBRE_X1 = 498
const BRAIN_X = 548
const SEG_START = 250
const SEG_END = 360
const MAX_GAP = 16 // px of blocked membrane an action potential can passively bridge

const C_AP = '#F472B6' // pink — the action potential / open Na⁺ channels
const C_CLOSED = 'rgba(245,240,232,0.28)' // resting channels
const C_BLOCK = '#A78BFA' // violet — anaesthetic-blocked channels
const C_BRAIN_ON = '#F59E0B' // gold — pain reaches the brain
const C_DEAD = '#60A5FA' // blue — where the signal dies

// Channel positions along the fibre.
const CHANNELS: number[] = []
for (let x = FIBRE_X0 + 16; x <= FIBRE_X1 - 8; x += 18) CHANNELS.push(x)

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  blockFrac: { default: 0.6, min: 0, max: 1, step: 0.05 },
}

export function LocalAnestheticAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const waveRef = useRef(FIBRE_X0)
  const deadRef = useRef(false)
  const arrivedRef = useRef(false)
  const holdRef = useRef(0)

  const [running, setRunning] = useState(false)
  const [anesthetic, setAnesthetic] = useState(true)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('local-anesthetic', SPEC)
  const { blockFrac } = params
  const [outcome, setOutcome] = useState<'travelling' | 'blocked' | 'arrived'>('travelling')

  const { ref } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { waveRef.current = SEG_START; drawFrameRef.current?.() ; return }
      setRunning(true)
    },
  })

  // blockFrac fills the anaesthetised segment from its left edge.
  const blockedLen = anesthetic ? blockFrac * (SEG_END - SEG_START) : 0
  const blockedStart = SEG_START
  const blockedEnd = SEG_START + blockedLen
  const willBlock = anesthetic && blockedLen > MAX_GAP

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    const wx = waveRef.current
    const dead = deadRef.current

    // Axon fibre
    ctx.strokeStyle = 'rgba(245,240,232,0.22)'
    ctx.lineWidth = 14
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(FIBRE_X0, FIBRE_Y)
    ctx.lineTo(FIBRE_X1, FIBRE_Y)
    ctx.stroke()

    // Anaesthetised segment shading
    if (anesthetic && blockedLen > 0) {
      ctx.fillStyle = `${C_BLOCK}1F`
      ctx.fillRect(blockedStart, FIBRE_Y - 26, blockedEnd - blockedStart, 52)
      ctx.strokeStyle = `${C_BLOCK}66`
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      ctx.strokeRect(blockedStart, FIBRE_Y - 26, blockedEnd - blockedStart, 52)
      ctx.setLineDash([])
      ctx.fillStyle = C_BLOCK
      ctx.fillText('anaesthetic', blockedStart + 2, FIBRE_Y - 32)
    }

    // Na⁺ channels — open (bright) as the live wave passes, blocked ones crossed out
    for (const cx of CHANNELS) {
      const blocked = anesthetic && cx >= blockedStart && cx <= blockedEnd
      const passing = !dead && Math.abs(cx - wx) < 11 && !blocked && (!willBlock || cx < blockedStart)
      const color = blocked ? C_BLOCK : passing ? C_AP : C_CLOSED
      ctx.strokeStyle = color
      ctx.lineWidth = passing ? 3 : 2
      ctx.beginPath()
      ctx.moveTo(cx, FIBRE_Y - 9)
      ctx.lineTo(cx, FIBRE_Y + 9)
      ctx.stroke()
      if (blocked) {
        // little cross to mark a plugged channel
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(cx - 3, FIBRE_Y - 12)
        ctx.lineTo(cx + 3, FIBRE_Y - 18)
        ctx.moveTo(cx + 3, FIBRE_Y - 12)
        ctx.lineTo(cx - 3, FIBRE_Y - 18)
        ctx.stroke()
      }
      if (passing) {
        ctx.fillStyle = C_AP
        ctx.beginPath()
        ctx.arc(cx, FIBRE_Y, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // The travelling depolarisation bump
    if (!dead) {
      const grad = ctx.createRadialGradient(wx, FIBRE_Y, 0, wx, FIBRE_Y, 26)
      grad.addColorStop(0, `${C_AP}CC`)
      grad.addColorStop(1, `${C_AP}00`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(wx, FIBRE_Y, 26, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = C_AP
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('action potential', wx, FIBRE_Y - 34)
      ctx.textAlign = 'left'
    } else {
      // Signal dies at the block
      ctx.fillStyle = C_DEAD
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('signal dies here', blockedStart, FIBRE_Y + 44)
      ctx.textAlign = 'left'
      ctx.beginPath()
      ctx.arc(blockedStart, FIBRE_Y, 5, 0, Math.PI * 2)
      ctx.strokeStyle = C_DEAD
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(blockedStart - 6, FIBRE_Y - 6)
      ctx.lineTo(blockedStart + 6, FIBRE_Y + 6)
      ctx.stroke()
    }

    // Origin label (stimulus / injury) on the left
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.font = '9px monospace'
    ctx.fillText('skin (injury)', FIBRE_X0, FIBRE_Y + 44)

    // Brain on the right
    const painNow = arrivedRef.current && !dead
    ctx.fillStyle = painNow ? `${C_BRAIN_ON}33` : 'rgba(245,240,232,0.06)'
    ctx.strokeStyle = painNow ? C_BRAIN_ON : 'rgba(245,240,232,0.3)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(BRAIN_X, FIBRE_Y, 20, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = painNow ? C_BRAIN_ON : 'rgba(245,240,232,0.5)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('brain', BRAIN_X, FIBRE_Y + 4)
    ctx.fillText(painNow ? 'pain!' : 'no pain', BRAIN_X, FIBRE_Y + 40)
    ctx.textAlign = 'left'
    // connect fibre to brain
    ctx.strokeStyle = 'rgba(245,240,232,0.22)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(FIBRE_X1, FIBRE_Y)
    ctx.lineTo(BRAIN_X - 20, FIBRE_Y)
    ctx.stroke()
  }, [anesthetic, blockedLen, blockedStart, blockedEnd, willBlock])

  const drawFrameRef = useRef(drawFrame)
  useEffect(() => { drawFrameRef.current = drawFrame })
  useEffect(() => { drawFrame() }, [drawFrame])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }
    const loop = () => {
      if (holdRef.current > 0) {
        holdRef.current -= 1
        if (holdRef.current === 0) {
          waveRef.current = FIBRE_X0
          deadRef.current = false
          arrivedRef.current = false
          setOutcome('travelling')
        }
        drawFrame()
        animRef.current = requestAnimationFrame(loop)
        return
      }

      if (!deadRef.current && !arrivedRef.current) {
        waveRef.current += 2.4
        if (willBlock && waveRef.current >= blockedStart) {
          waveRef.current = blockedStart
          deadRef.current = true
          setOutcome('blocked')
          holdRef.current = 70
        } else if (waveRef.current >= BRAIN_X - 20) {
          waveRef.current = BRAIN_X - 20
          arrivedRef.current = true
          setOutcome('arrived')
          holdRef.current = 70
        }
      }
      drawFrame()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running, willBlock, blockedStart, drawFrame])

  const resetAll = () => {
    setRunning(false)
    waveRef.current = FIBRE_X0
    deadRef.current = false
    arrivedRef.current = false
    holdRef.current = 0
    setAnesthetic(true)
    set('blockFrac', 0.6)
    setOutcome('travelling')
    drawFrame()
  }

  const statusText =
    outcome === 'blocked'
      ? 'Blocked — the pain signal never reaches the brain'
      : outcome === 'arrived'
        ? 'Signal reaches the brain — pain is felt'
        : willBlock
          ? 'Na⁺ channels blocked ahead'
          : 'Action potential propagating'
  const statusColor = outcome === 'blocked' ? C_DEAD : outcome === 'arrived' ? C_BRAIN_ON : C_AP

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Blocking the pain signal</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 20 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={() => setAnesthetic(a => !a)}
          className="px-2 py-1 rounded text-xs font-medium border transition-colors"
          style={
            anesthetic
              ? { color: C_BLOCK, borderColor: `${C_BLOCK}44`, background: `${C_BLOCK}12` }
              : { color: 'rgba(245,240,232,0.5)', borderColor: 'rgba(245,240,232,0.15)', background: 'rgba(245,240,232,0.04)' }
          }
        >
          Local anaesthetic: {anesthetic ? 'on' : 'off'}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Channels blocked:</span>
          <input
            type="range" min={SPEC.blockFrac.min} max={SPEC.blockFrac.max} step={SPEC.blockFrac.step} value={blockFrac}
            disabled={!anesthetic}
            onChange={e => set('blockFrac', +e.target.value)}
            className="w-24 accent-accent-violet"
          />
          <span className="text-text-secondary font-mono">{Math.round(blockFrac * 100)}%</span>
        </div>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={{ color: statusColor, borderColor: `${statusColor}30`, background: `${statusColor}10` }}
        >
          {statusText}
        </span>
      </div>
    </div>
  )
}
