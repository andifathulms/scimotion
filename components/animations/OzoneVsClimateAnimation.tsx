'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 620
const H = 360

// Shared altitude axis: 0 km at the ground, ~55 km at the top.
const AXIS_X = 40
const Y_TOP = 46
const GROUND_Y = 312
const KM_MAX = 55
const kmToY = (km: number) => GROUND_Y - (km / KM_MAX) * (GROUND_Y - Y_TOP)

const DIV = 314
// Left panel (ozone / stratosphere) and right panel (greenhouse / troposphere).
const LX0 = AXIS_X + 16
const LX1 = DIV - 8
const RX0 = DIV + 8
const RX1 = W - 14

const OZONE_KM = 25
const TROPOPAUSE_KM = 12

const C_UV = '#F59E0B' // gold — ultraviolet (from the Sun)
const C_IR = '#60A5FA' // blue — infrared (from the Earth)
const C_OZONE = '#22D3EE' // cyan — ozone
const C_CO2 = '#A78BFA' // violet — carbon dioxide
const C_WARM = '#F59E0B' // gold — surface warming

type UV = { x: number; y: number; v: number; through: boolean }
type IR = { x: number; y: number; v: number; trapped: boolean }
type Flash = { x: number; y: number; t: number; c: string }

export function OzoneVsClimateAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const uvRef = useRef<UV[]>([])
  const irRef = useRef<IR[]>([])
  const flashRef = useRef<Flash[]>([])
  const warmRef = useRef(0)
  const uvSurfRef = useRef(0)
  const cfcRef = useRef(false)
  const co2Ref = useRef(false)

  const [running, setRunning] = useState(false)
  const [cfc, setCfc] = useState(false)
  const [co2, setCo2] = useState(false)
  const [readout, setReadout] = useState({ uv: 0, warm: 0 })

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'

    const yOzone = kmToY(OZONE_KM)
    const yTropo = kmToY(TROPOPAUSE_KM)

    // --- shared altitude axis ---
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(AXIS_X, Y_TOP); ctx.lineTo(AXIS_X, GROUND_Y); ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    for (let km = 0; km <= 50; km += 10) {
      const y = kmToY(km)
      ctx.beginPath(); ctx.moveTo(AXIS_X - 4, y); ctx.lineTo(AXIS_X, y); ctx.stroke()
      ctx.textAlign = 'right'
      ctx.fillText(`${km}`, AXIS_X - 6, y + 3)
    }
    ctx.textAlign = 'left'
    ctx.save()
    ctx.translate(12, (Y_TOP + GROUND_Y) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('altitude (km)', -34, 0)
    ctx.restore()

    // Ground + tropopause + divider.
    ctx.fillStyle = 'rgba(245,240,232,0.1)'
    ctx.fillRect(AXIS_X, GROUND_Y, W - AXIS_X, H - GROUND_Y)
    ctx.strokeStyle = 'rgba(245,240,232,0.4)'
    ctx.beginPath(); ctx.moveTo(AXIS_X, GROUND_Y + 0.5); ctx.lineTo(W, GROUND_Y + 0.5); ctx.stroke()

    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(AXIS_X, yTropo); ctx.lineTo(W, yTropo); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('tropopause (~12 km)', RX1 - 128, yTropo - 4)

    ctx.strokeStyle = 'rgba(255,245,235,0.1)'
    ctx.beginPath(); ctx.moveTo(DIV, Y_TOP - 10); ctx.lineTo(DIV, H); ctx.stroke()

    // ================= LEFT: ozone depletion (stratosphere) =================
    ctx.fillStyle = C_OZONE
    ctx.font = 'bold 11px monospace'
    ctx.fillText('OZONE DEPLETION', LX0, Y_TOP - 20)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('stratosphere · UV in · CFCs', LX0, Y_TOP - 8)

    // Ozone band (thinned when CFCs are active).
    const intact = cfcRef.current ? 0.4 : 1
    ctx.fillStyle = `rgba(34,211,238,${(0.08 + 0.16 * intact).toFixed(3)})`
    ctx.fillRect(LX0, yOzone - 12, LX1 - LX0, 24)
    // Ozone molecules, with gaps when depleted.
    for (let i = 0; i < 18; i++) {
      const gap = cfcRef.current && i % 5 < 3
      if (gap) continue
      const x = LX0 + 8 + (i * (LX1 - LX0 - 16)) / 17
      ctx.fillStyle = C_OZONE
      ctx.beginPath(); ctx.arc(x, yOzone, 2.6, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = C_OZONE
    ctx.font = '9px monospace'
    ctx.fillText('O₃ layer ~25 km', LX0 + 6, yOzone + 24)

    // UV photons.
    for (const p of uvRef.current) {
      ctx.strokeStyle = C_UV
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 9); ctx.stroke()
    }
    ctx.fillStyle = C_UV
    ctx.fillText('UV ↓', LX0 + 4, Y_TOP + 4)

    // ================= RIGHT: greenhouse warming (troposphere) =================
    ctx.fillStyle = C_WARM
    ctx.font = 'bold 11px monospace'
    ctx.fillText('GREENHOUSE WARMING', RX0, Y_TOP - 20)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('troposphere · IR out · CO₂', RX0, Y_TOP - 8)

    // CO2 sitting low in the troposphere.
    if (co2Ref.current) {
      ctx.fillStyle = 'rgba(167,139,250,0.06)'
      ctx.fillRect(RX0, yTropo, RX1 - RX0, GROUND_Y - yTropo)
    }
    for (let i = 0; i < 10; i++) {
      const x = RX0 + 20 + (i * (RX1 - RX0 - 40)) / 9
      const y = yTropo + 18 + ((i * 37) % (GROUND_Y - yTropo - 30))
      ctx.fillStyle = co2Ref.current ? C_CO2 : 'rgba(167,139,250,0.25)'
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = co2Ref.current ? C_CO2 : 'rgba(245,240,232,0.3)'
    ctx.fillText('CO₂ 0–12 km', RX0 + 6, GROUND_Y - 10)

    // IR photons.
    for (const p of irRef.current) {
      ctx.strokeStyle = C_IR
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + 9 * (p.v > 0 ? 1 : -1)); ctx.stroke()
    }
    ctx.fillStyle = C_IR
    ctx.fillText('IR ↑', RX1 - 34, Y_TOP + 4)

    // Warming glow on the right surface.
    if (warmRef.current > 0.01) {
      ctx.fillStyle = `rgba(245,158,11,${(0.4 * Math.min(1, warmRef.current)).toFixed(3)})`
      ctx.fillRect(RX0, GROUND_Y - 12, RX1 - RX0, 12)
    }

    // Flashes.
    for (const f of flashRef.current) {
      ctx.strokeStyle = f.c.replace(')', `,${f.t.toFixed(3)})`).replace('rgb', 'rgba')
      ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.arc(f.x, f.y, (1 - f.t) * 11 + 2, 0, Math.PI * 2); ctx.stroke()
    }

    // Contrast strip along the bottom.
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('high altitude · UV from Sun · destroys O₃', LX0, H - 10)
    ctx.fillText('low altitude · IR from Earth · traps heat', RX0, H - 10)
  }, [])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running || !visible) return
    const yOzone = kmToY(OZONE_KM)
    const yTropo = kmToY(TROPOPAUSE_KM)

    let frame = 0
    const tick = () => {
      // Spawn UV (left, downward) and IR (right, upward).
      if (Math.random() < 0.35) {
        uvRef.current.push({ x: LX0 + 8 + Math.random() * (LX1 - LX0 - 16), y: Y_TOP, v: 2.4 + Math.random() * 1.2, through: false })
      }
      if (Math.random() < 0.35) {
        irRef.current.push({ x: RX0 + 8 + Math.random() * (RX1 - RX0 - 16), y: GROUND_Y - 2, v: -(2.2 + Math.random() * 1.2), trapped: false })
      }

      // UV: absorbed at the ozone band unless a gap lets it through.
      const uvSurv: UV[] = []
      for (const p of uvRef.current) {
        p.y += p.v
        if (!p.through && p.y >= yOzone - 2 && p.y <= yOzone + 2) {
          const blocked = cfcRef.current ? Math.random() < 0.4 : true
          if (blocked) {
            flashRef.current.push({ x: p.x, y: yOzone, t: 1, c: 'rgb(34,211,238)' })
            continue
          }
          p.through = true
        }
        if (p.y >= GROUND_Y) {
          if (p.through) uvSurfRef.current += 1
          continue
        }
        uvSurv.push(p)
      }
      uvRef.current = uvSurv

      // IR: escapes to space unless CO2 bounces it back down (trapped).
      const irSurv: IR[] = []
      for (const p of irRef.current) {
        p.y += p.v
        if (co2Ref.current && !p.trapped && p.v < 0 && p.y <= yTropo + 2 && p.y >= yTropo - 2) {
          if (Math.random() < 0.55) {
            p.trapped = true
            p.v = -p.v // reflected back toward the surface
            flashRef.current.push({ x: p.x, y: yTropo, t: 1, c: 'rgb(96,165,250)' })
          }
        }
        if (p.trapped && p.y >= GROUND_Y - 2) {
          warmRef.current = Math.min(1.6, warmRef.current + 0.02)
          continue
        }
        if (p.y <= Y_TOP) continue // escaped to space
        irSurv.push(p)
      }
      irRef.current = irSurv

      warmRef.current = Math.max(0, warmRef.current - (co2Ref.current ? 0.004 : 0.02))
      flashRef.current = flashRef.current.map(f => ({ ...f, t: f.t - 0.06 })).filter(f => f.t > 0)

      draw()
      frame += 1
      if (frame % 6 === 0) setReadout({ uv: uvSurfRef.current, warm: warmRef.current })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw, visible])

  const toggleCfc = () => { const n = !cfc; setCfc(n); cfcRef.current = n }
  const toggleCo2 = () => { const n = !co2; setCo2(n); co2Ref.current = n }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    triggerReset()
    setRunning(false)
    setCfc(false); setCo2(false)
    cfcRef.current = false; co2Ref.current = false
    uvRef.current = []; irRef.current = []; flashRef.current = []
    warmRef.current = 0; uvSurfRef.current = 0
    setReadout({ uv: 0, warm: 0 })
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Two different problems, side by side</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Two different problems, side by side. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-teal text-bg-base text-xs font-medium hover:bg-accent-teal/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={toggleCfc}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: cfc ? C_OZONE : 'rgba(255,245,235,0.08)', color: cfc ? '#1A1712' : 'rgba(245,240,232,0.7)' }}
        >
          {cfc ? 'CFCs: on (left)' : 'CFCs: off (left)'}
        </button>
        <button
          onClick={toggleCo2}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: co2 ? C_WARM : 'rgba(255,245,235,0.08)', color: co2 ? '#1A1712' : 'rgba(245,240,232,0.7)' }}
        >
          {co2 ? 'CO₂: on (right)' : 'CO₂: off (right)'}
        </button>
        <WidgetStatus className="ml-auto text-xs text-text-secondary font-mono">
          UV to surface {readout.uv} · warming +{readout.warm.toFixed(2)}
        </WidgetStatus>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        The two toggles are wired to different halves of the sky and never touch each other. Switch CFCs on
        and the ozone band on the left thins, so more gold UV reaches the ground — but the right side is
        unchanged. Switch CO₂ on and infrared rising off the surface gets bounced back down low in the
        troposphere, warming it — while the ozone layer stays exactly as it was. Different altitude, different
        gas, different radiation: two independent problems that share only the word &ldquo;atmosphere.&rdquo;
      </p>
    </div>
  )
}
