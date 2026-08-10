'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 320

const LIME = '#A3E635' // neurotransmitter (excitatory)
const GOLD = '#F59E0B' // calcium
const BLUE = '#60A5FA' // baseline / postsynaptic membrane
const VIOLET = '#A78BFA' // vesicles
const PINK = '#F472B6' // neurotransmitter (inhibitory)

// Geometry. The presynaptic terminal is a bulb on the left; the postsynaptic
// membrane faces it across a thin gap — the synaptic cleft.
const CLEFT_L = 250 // presynaptic membrane face
const CLEFT_R = 300 // postsynaptic membrane face
const MEMB_TOP = 70
const MEMB_BOT = 250
// Receptor docking points on the postsynaptic membrane.
const RECEPTORS = [96, 128, 160, 192, 224]

type Mode = 'exc' | 'inh'
type Phase = 'idle' | 'ap' | 'calcium' | 'release' | 'diffuse' | 'bind' | 'clear'

// Phase boundaries as fractions of the whole relay [0, 1].
const BOUNDS: { key: Exclude<Phase, 'idle'>; start: number }[] = [
  { key: 'ap', start: 0.0 },
  { key: 'calcium', start: 0.12 },
  { key: 'release', start: 0.28 },
  { key: 'diffuse', start: 0.44 },
  { key: 'bind', start: 0.62 },
  { key: 'clear', start: 0.84 },
]

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Resting — waiting for a spike',
  ap: 'Action potential reaches the terminal',
  calcium: 'Voltage-gated Ca²⁺ channels open',
  release: 'Vesicles fuse and dump neurotransmitter',
  diffuse: 'Neurotransmitter diffuses across the cleft',
  bind: 'Binding receptors → postsynaptic voltage change',
  clear: 'Reuptake clears the cleft',
}

function phaseAt(p: number): Phase {
  if (p <= 0) return 'idle'
  let ph: Phase = 'ap'
  for (const b of BOUNDS) if (p >= b.start) ph = b.key
  return ph
}

function smooth(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

type NT = { dock: number; recv: number; delay: number; wob: number }

export function SynapseAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const progRef = useRef(0) // 0..1 through the relay
  const runningRef = useRef(false)
  const ntRef = useRef<NT[]>([])
  const modeRef = useRef<Mode>('exc')

  const [mode, setMode] = useState<Mode>('exc')
  const [phase, setPhase] = useState<Phase>('idle')
  const [running, setRunning] = useState(false)
  const [vm, setVm] = useState(-70)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const seedNT = useCallback(() => {
    const n = 22
    ntRef.current = Array.from({ length: n }, () => ({
      dock: MEMB_TOP + 24 + Math.random() * (MEMB_BOT - MEMB_TOP - 48),
      recv: RECEPTORS[Math.floor(Math.random() * RECEPTORS.length)],
      delay: Math.random() * 0.22,
      wob: (Math.random() - 0.5) * 18,
    }))
  }, [])

  // Postsynaptic membrane potential as a function of progress. A small EPSP
  // (excitatory, up) or IPSP (inhibitory, down) that grows as transmitter binds
  // and decays as it is cleared — always sub-threshold, a nudge not a spike.
  const vmAt = useCallback((p: number, m: Mode): number => {
    const rise = smooth((p - 0.6) / 0.18)
    const decay = 1 - smooth((p - 0.84) / 0.16)
    const amp = m === 'exc' ? 12 : -9 // toward −58 mV, or down to −79 mV
    return -70 + amp * rise * decay
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const p = progRef.current
    const ph = phaseAt(p)
    const m = modeRef.current
    const ntColor = m === 'exc' ? LIME : PINK

    ctx.clearRect(0, 0, W, H)

    // Extracellular tint behind everything.
    ctx.fillStyle = 'rgba(96,165,250,0.04)'
    ctx.fillRect(0, 0, W, H)

    // ---- Presynaptic axon + terminal bulb ----
    ctx.strokeStyle = 'rgba(163,230,53,0.5)'
    ctx.lineWidth = 10
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-4, 160)
    ctx.lineTo(70, 160)
    ctx.stroke()
    ctx.lineCap = 'butt'

    ctx.fillStyle = 'rgba(163,230,53,0.08)'
    ctx.strokeStyle = 'rgba(163,230,53,0.45)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(60, 70)
    ctx.quadraticCurveTo(40, 160, 60, 250)
    ctx.lineTo(CLEFT_L, 250)
    ctx.lineTo(CLEFT_L, 70)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // AP pulse travelling into the terminal.
    if (ph === 'ap') {
      const t = smooth(p / 0.12)
      const px = -4 + t * (CLEFT_L + 4)
      ctx.fillStyle = GOLD
      ctx.beginPath()
      ctx.arc(px, 160, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(245,158,11,0.25)'
      ctx.beginPath()
      ctx.arc(px, 160, 13, 0, Math.PI * 2)
      ctx.fill()
    }

    // ---- Calcium channels + calcium influx ----
    const caActive = p >= 0.12 && p < 0.5
    for (const cy of [110, 210]) {
      ctx.fillStyle = caActive ? 'rgba(245,158,11,0.22)' : 'rgba(245,240,232,0.06)'
      ctx.strokeStyle = caActive ? `${GOLD}cc` : 'rgba(245,240,232,0.25)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.roundRect(CLEFT_L - 6, cy - 12, 12, 24, 4)
      ctx.fill()
      ctx.stroke()
    }
    if (caActive) {
      const t = smooth((p - 0.12) / 0.2)
      for (const cy of [110, 210]) {
        for (let i = 0; i < 3; i++) {
          const f = (t + i * 0.33) % 1
          const cx = CLEFT_L + 20 - f * 44
          ctx.fillStyle = GOLD
          ctx.beginPath()
          ctx.arc(cx, cy + (i - 1) * 5, 3, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    // ---- Vesicles inside the terminal ----
    const releaseAmt = smooth((p - 0.28) / 0.16)
    const vesicles = [
      { x: 150, y: 108 }, { x: 185, y: 130 }, { x: 150, y: 200 },
      { x: 190, y: 176 }, { x: 210, y: 222 },
    ]
    vesicles.forEach((v, i) => {
      const docking = i < 3 // front vesicles fuse; the rest stay in reserve
      const gx = docking ? v.x + (CLEFT_L - 14 - v.x) * releaseAmt : v.x
      const r = docking ? 9 * (1 - 0.55 * releaseAmt) : 9
      ctx.fillStyle = docking && releaseAmt > 0.85 ? 'rgba(167,139,250,0.15)' : 'rgba(167,139,250,0.2)'
      ctx.strokeStyle = `${VIOLET}bb`
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.arc(gx, v.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      if (r > 3) {
        ctx.fillStyle = ntColor
        for (let k = 0; k < 4; k++) {
          const a = k * 1.9
          ctx.beginPath()
          ctx.arc(gx + Math.cos(a) * r * 0.4, v.y + Math.sin(a) * r * 0.4, 1.6, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    })

    // ---- Cleft + postsynaptic membrane ----
    ctx.fillStyle = 'rgba(96,165,250,0.06)'
    ctx.fillRect(CLEFT_L, MEMB_TOP, CLEFT_R - CLEFT_L, MEMB_BOT - MEMB_TOP)
    ctx.strokeStyle = 'rgba(163,230,53,0.6)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(CLEFT_L, MEMB_TOP)
    ctx.lineTo(CLEFT_L, MEMB_BOT)
    ctx.stroke()

    // Postsynaptic cell body.
    ctx.fillStyle = 'rgba(96,165,250,0.07)'
    ctx.strokeStyle = 'rgba(96,165,250,0.5)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(CLEFT_R, MEMB_TOP)
    ctx.lineTo(CLEFT_R, MEMB_BOT)
    ctx.stroke()
    ctx.fillRect(CLEFT_R, MEMB_TOP, W - CLEFT_R, MEMB_BOT - MEMB_TOP)

    // Cleft width caption.
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('cleft ≈ 20 nm', (CLEFT_L + CLEFT_R) / 2, MEMB_TOP - 8)
    ctx.strokeStyle = 'rgba(245,240,232,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(CLEFT_L, MEMB_TOP - 4)
    ctx.lineTo(CLEFT_R, MEMB_TOP - 4)
    ctx.stroke()

    // Receptors — light up as transmitter binds.
    const bindAmt = smooth((p - 0.5) / 0.16) * (1 - smooth((p - 0.84) / 0.16))
    for (const ry of RECEPTORS) {
      const lit = bindAmt > 0.15
      ctx.fillStyle = lit ? `${ntColor}44` : 'rgba(245,240,232,0.05)'
      ctx.strokeStyle = lit ? ntColor : 'rgba(245,240,232,0.3)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.roundRect(CLEFT_R - 3, ry - 9, 12, 18, 3)
      ctx.fill()
      ctx.stroke()
    }

    // ---- Neurotransmitter particles crossing the cleft ----
    const cross = smooth((p - 0.28) / 0.34) // spans release→bind
    const retreat = smooth((p - 0.84) / 0.16) // reuptake
    if (p >= 0.28) {
      for (const nt of ntRef.current) {
        const f = Math.max(0, Math.min(1, (cross - nt.delay) / (1 - nt.delay)))
        let x = CLEFT_L - 6 + f * (CLEFT_R - CLEFT_L + 4)
        let y = nt.dock + (nt.recv - nt.dock) * f + Math.sin((f + nt.wob) * 6) * 3
        let alpha = 0.9
        if (retreat > 0) {
          // Reuptake: transmitter drifts back into the presynaptic terminal.
          x = x - retreat * (x - (CLEFT_L - 20))
          y = y + (nt.dock - y) * retreat
          alpha = 0.9 * (1 - retreat)
        }
        ctx.fillStyle = ntColor
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.arc(x, y + nt.wob * 0.2, 2.6, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    // ---- Labels ----
    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(163,230,53,0.75)'
    ctx.fillText('presynaptic terminal', 12, 22)
    ctx.fillStyle = 'rgba(96,165,250,0.75)'
    ctx.textAlign = 'right'
    ctx.fillText('postsynaptic neuron', W - 12, 22)

    // ---- Postsynaptic voltage gauge (bottom) ----
    const gx = 40
    const gy = 288
    const gw = W - 80
    const v = vmAt(p, m)
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.fillText('postsynaptic membrane potential', gx, gy - 8)
    // Scale −90..−40 mV over the bar.
    const vToX = (mv: number) => gx + ((mv + 90) / 50) * gw
    ctx.strokeStyle = 'rgba(245,240,232,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(gx, gy, gw, 12, 3)
    ctx.stroke()
    // Rest & threshold reference marks.
    const restX = vToX(-70)
    const thrX = vToX(-55)
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(96,165,250,0.5)'
    ctx.beginPath(); ctx.moveTo(restX, gy - 4); ctx.lineTo(restX, gy + 16); ctx.stroke()
    ctx.strokeStyle = 'rgba(245,158,11,0.6)'
    ctx.beginPath(); ctx.moveTo(thrX, gy - 4); ctx.lineTo(thrX, gy + 16); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(96,165,250,0.7)'
    ctx.font = '8px monospace'
    ctx.fillText('rest −70', restX - 22, gy + 26)
    ctx.fillStyle = 'rgba(245,158,11,0.8)'
    ctx.fillText('threshold −55', thrX - 4, gy + 26)
    // Fill from rest to current v.
    const x0 = Math.min(restX, vToX(v))
    const x1 = Math.max(restX, vToX(v))
    ctx.fillStyle = m === 'exc' ? LIME : BLUE
    ctx.beginPath()
    ctx.roundRect(x0, gy + 2, Math.max(1, x1 - x0), 8, 2)
    ctx.fill()
    // Current value marker.
    ctx.fillStyle = m === 'exc' ? LIME : BLUE
    ctx.beginPath()
    ctx.arc(vToX(v), gy + 6, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.textAlign = 'right'
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.8)'
    ctx.fillText(
      `${v.toFixed(0)} mV · ${m === 'exc' ? 'EPSP (excitatory ↑)' : 'IPSP (inhibitory ↓)'}`,
      W - 12,
      gy - 8
    )
  }, [vmAt])

  useEffect(() => {
    seedNT()
    draw()
  }, [seedNT, draw])

  // Advance the relay while running.
  useEffect(() => {
    if (!running) return
    const tick = () => {
      progRef.current = Math.min(1, progRef.current + 0.006)
      setPhase(phaseAt(progRef.current))
      setVm(vmAt(progRef.current, modeRef.current))
      draw()
      if (progRef.current >= 1) {
        runningRef.current = false
        setRunning(false)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw, vmAt])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        progRef.current = 0.7
        setPhase('bind')
        setVm(vmAt(0.7, modeRef.current))
        draw()
      } else {
        fire()
      }
    },
  })

  const fire = () => {
    if (runningRef.current) return
    if (progRef.current >= 1 || progRef.current === 0) {
      seedNT()
      progRef.current = 0
    }
    runningRef.current = true
    setRunning(true)
  }

  // Step to the start of the next phase (paused).
  const step = () => {
    if (runningRef.current) return
    if (progRef.current >= 1) {
      seedNT()
      progRef.current = 0
      setPhase('ap')
      setVm(vmAt(0, modeRef.current))
      draw()
      return
    }
    const next = BOUNDS.find(b => b.start > progRef.current + 0.001)
    progRef.current = next ? next.start : 1
    setPhase(phaseAt(progRef.current))
    setVm(vmAt(progRef.current, modeRef.current))
    draw()
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    runningRef.current = false
    setRunning(false)
    triggerReset()
    progRef.current = 0
    seedNT()
    setPhase('idle')
    setVm(-70)
    draw()
  }

  const toggleMode = () => {
    setMode(m => {
      const nm: Mode = m === 'exc' ? 'inh' : 'exc'
      modeRef.current = nm
      setVm(vmAt(progRef.current, nm))
      requestAnimationFrame(draw)
      return nm
    })
  }

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const btn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · A spike is flung across the cleft as a chemical message
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
          role="img"
          aria-label="Animated diagram: A spike is flung across the cleft as a chemical message. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={fire}
          disabled={running}
          className={`${btn} bg-accent-lime text-bg-base hover:bg-accent-lime/90 disabled:opacity-50`}
        >
          <Play size={12} /> Fire neuron
        </button>
        <button
          onClick={step}
          disabled={running}
          className={`${btn} border disabled:opacity-40`}
          style={{ color: VIOLET, borderColor: `${VIOLET}55`, background: `${VIOLET}14` }}
        >
          Step ▸
        </button>
        <button
          onClick={toggleMode}
          className={`${btn} border`}
          style={
            mode === 'exc'
              ? { color: LIME, borderColor: `${LIME}55`, background: `${LIME}14` }
              : { color: PINK, borderColor: `${PINK}55`, background: `${PINK}14` }
          }
        >
          {mode === 'exc' ? 'Synapse: excitatory' : 'Synapse: inhibitory'}
        </button>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={{
            color: mode === 'exc' ? LIME : PINK,
            borderColor: mode === 'exc' ? `${LIME}30` : `${PINK}30`,
            background: mode === 'exc' ? `${LIME}10` : `${PINK}10`,
          }}
        >
          {PHASE_LABEL[phase]}
        </span>
        <span className="ml-auto text-xs text-text-secondary">
          Vm: <strong style={{ color: mode === 'exc' ? LIME : BLUE }}>{vm.toFixed(0)} mV</strong>
        </span>
      </div>
    </div>
  )
}
