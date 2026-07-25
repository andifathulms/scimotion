'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

// Palette
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const CYAN = '#22D3EE'
const INK = 'rgba(255,245,235,0.6)'
const MUTE = 'rgba(255,245,235,0.4)'
const FAINT = 'rgba(255,245,235,0.12)'

// The stream we encrypt, and the relative throughputs. Asymmetric crypto is, in
// reality, hundreds to thousands of times slower per byte; we use a gentler 20×
// here so the gap is visible in a couple of seconds rather than a minute.
const DATA_MB = 10
const SYM_MBPS = 9 // virtual MB per virtual second, symmetric
const ASYM_FACTOR = 20 // asymmetric is this many times slower
const ASYM_MBPS = SYM_MBPS / ASYM_FACTOR
const KEY_HANDOVER_MB = 0.05 // the tiny asymmetric cost the hybrid pays up front
const TIME_SCALE = 2.2 // virtual seconds per real second

type Lane = {
  key: 'sym' | 'asym' | 'hybrid'
  title: string
  sub: string
  color: string
}

const LANES: Lane[] = [
  { key: 'sym', title: 'Symmetric only', sub: 'one shared key — fast', color: GREEN },
  { key: 'asym', title: 'Asymmetric only', sub: 'public/private keypair — slow', color: VIOLET },
  { key: 'hybrid', title: 'TLS (hybrid)', sub: 'asymmetric to hand over the key, then symmetric', color: CYAN },
]

type State = {
  clock: number // virtual seconds elapsed
  sym: number // MB processed
  asym: number // MB processed
  hybridKey: number // MB of key-handover work done (0..KEY_HANDOVER_MB)
  hybrid: number // MB of bulk data processed
}

function makeState(): State {
  return { clock: 0, sym: 0, asym: 0, hybridKey: 0, hybrid: 0 }
}

export function SymmetricVsAsymmetricAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const stRef = useRef<State>(makeState())
  const [running, setRunning] = useState(false)
  const [, setTick] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const st = stRef.current
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    // ---- title ----
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = MUTE
    ctx.fillText(`Encrypting a ${DATA_MB} MB stream three ways — watch the throughput.`, 24, 26)

    // ---- lock-box handover diagram (top strip) ----
    const boxTop = 40
    ctx.font = '9px monospace'
    ctx.fillStyle = VIOLET
    ctx.textAlign = 'center'
    ctx.fillText('asymmetric: safely hand over one small key', 300, boxTop + 4)
    // sender lockbox -> key -> receiver
    ctx.strokeStyle = `${VIOLET}88`
    ctx.lineWidth = 1.3
    roundRect(ctx, 150, boxTop + 12, 40, 26, 5)
    ctx.stroke()
    roundRect(ctx, 410, boxTop + 12, 40, 26, 5)
    ctx.stroke()
    ctx.fillStyle = MUTE
    ctx.fillText('you', 170, boxTop + 52)
    ctx.fillText('server', 430, boxTop + 52)
    // the little key travelling
    ctx.fillStyle = GOLD
    ctx.beginPath()
    ctx.arc(300, boxTop + 25, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(300, boxTop + 23, 14, 4)
    ctx.strokeStyle = `${GOLD}66`
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(190, boxTop + 25)
    ctx.lineTo(410, boxTop + 25)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = GOLD
    ctx.font = '8px monospace'
    ctx.fillText('symmetric key', 300, boxTop + 12)

    // ---- three race lanes ----
    const laneX = 150
    const laneW = 380
    const laneH = 26
    const gap = 60
    const top = 128

    const processed: Record<Lane['key'], number> = {
      sym: st.sym,
      asym: st.asym,
      hybrid: st.hybrid,
    }

    LANES.forEach((lane, i) => {
      const y = top + i * gap
      // labels
      ctx.textAlign = 'left'
      ctx.fillStyle = lane.color
      ctx.font = 'bold 11px monospace'
      ctx.fillText(lane.title, 24, y + 12)
      ctx.fillStyle = MUTE
      ctx.font = '8px monospace'
      ctx.fillText(lane.sub, 24, y + 24)

      // track
      ctx.fillStyle = 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = FAINT
      ctx.lineWidth = 1
      roundRect(ctx, laneX, y, laneW, laneH, 6)
      ctx.fill()
      ctx.stroke()

      const done = processed[lane.key]
      const frac = Math.min(1, done / DATA_MB)

      // for the hybrid lane, show the tiny asymmetric key-handover segment first
      if (lane.key === 'hybrid') {
        const keyFrac = Math.min(1, st.hybridKey / KEY_HANDOVER_MB)
        const segW = 26
        ctx.fillStyle = keyFrac >= 1 ? `${VIOLET}66` : `${VIOLET}33`
        roundRect(ctx, laneX + 2, y + 2, segW * Math.max(keyFrac, 0.12), laneH - 4, 4)
        ctx.fill()
        if (keyFrac >= 1) {
          // fast symmetric fill after the key is in place
          const fillW = (laneW - segW - 6) * frac
          ctx.fillStyle = `${GREEN}55`
          roundRect(ctx, laneX + segW + 4, y + 2, Math.max(fillW, 0.001), laneH - 4, 4)
          ctx.fill()
        }
      } else {
        const fillW = (laneW - 4) * frac
        ctx.fillStyle = `${lane.color}55`
        roundRect(ctx, laneX + 2, y + 2, Math.max(fillW, 0.001), laneH - 4, 4)
        ctx.fill()
      }

      // readout
      ctx.textAlign = 'right'
      ctx.font = '9px monospace'
      const complete = frac >= 1 && !(lane.key === 'hybrid' && st.hybridKey < KEY_HANDOVER_MB)
      ctx.fillStyle = complete ? lane.color : INK
      const label = complete ? 'done ✓' : `${done.toFixed(1)} / ${DATA_MB} MB`
      ctx.fillText(label, laneX + laneW - 8, y - 4)
    })

    // ---- clock ----
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = MUTE
    ctx.fillText(`elapsed: ${st.clock.toFixed(1)}s   ·   asymmetric ≈ ${ASYM_FACTOR}× slower per byte`, 24, H - 16)

    // caption
    ctx.textAlign = 'right'
    ctx.fillStyle = st.hybrid >= DATA_MB ? GREEN : MUTE
    ctx.font = '9px monospace'
    ctx.fillText(
      st.hybrid >= DATA_MB ? 'hybrid finished with symmetric — like TLS' : 'hybrid pays one small asymmetric cost, then flies',
      W - 24,
      H - 16
    )
  }, [])

  const step = (dtVirtual: number) => {
    const st = stRef.current
    st.clock += dtVirtual
    st.sym = Math.min(DATA_MB, st.sym + SYM_MBPS * dtVirtual)
    st.asym = Math.min(DATA_MB, st.asym + ASYM_MBPS * dtVirtual)
    // hybrid: first finish the tiny key handover (at asymmetric speed), then bulk symmetric
    if (st.hybridKey < KEY_HANDOVER_MB) {
      st.hybridKey = Math.min(KEY_HANDOVER_MB, st.hybridKey + ASYM_MBPS * dtVirtual)
    } else {
      st.hybrid = Math.min(DATA_MB, st.hybrid + SYM_MBPS * dtVirtual)
    }
  }

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    let last = performance.now()
    const loop = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      step(dt * TIME_SCALE)
      draw()
      setTick(t => t + 1)
      const st = stRef.current
      // stop once symmetric + hybrid are done (asymmetric may still be crawling)
      if (st.sym >= DATA_MB && st.hybrid >= DATA_MB) {
        setRunning(false)
        return
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => {
    draw()
  }, [draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        const st = stRef.current
        st.sym = DATA_MB
        st.hybridKey = KEY_HANDOVER_MB
        st.hybrid = DATA_MB
        st.asym = DATA_MB / 3
        st.clock = DATA_MB / SYM_MBPS
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    stRef.current = makeState()
    setRunning(false)
    triggerReset()
    draw()
  }

  const toggle = () => {
    const st = stRef.current
    if (st.sym >= DATA_MB && st.hybrid >= DATA_MB) {
      stRef.current = makeState()
    }
    setRunning(r => !r)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Why bootstrap at all</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Race</>}
        </button>
        <span className="ml-auto text-xs text-text-muted">
          Symmetric zips; asymmetric crawls — so TLS uses asymmetric only to pass the key.
        </span>
      </div>
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
