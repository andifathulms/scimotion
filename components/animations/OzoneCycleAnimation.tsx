'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 620
const H = 340

// Scene geometry (pixels).
const LAYER_TOP = 118
const LAYER_BOT = 168
const GROUND_Y = 300
const NUM_SLOTS = 48

const C_OZONE = '#22D3EE' // cyan — ozone (O3)
const C_UV = '#F59E0B' // gold — ultraviolet photons
const C_CL = '#A78BFA' // violet — chlorine catalyst
const C_O2 = '#10B981' // green — molecular oxygen (harmless)
const C_LEAK = '#F59E0B' // gold — UV reaching the surface

const slotX = (i: number) => 14 + (i * (W - 28)) / (NUM_SLOTS - 1)
const slotCY = LAYER_TOP + (LAYER_BOT - LAYER_TOP) / 2

type Slot = { present: boolean; split: number }
type Photon = { x: number; y: number; v: number; leaking: boolean }
type Cl = { x: number; y: number; tx: number; ty: number; seeking: boolean }
type Flash = { x: number; y: number; t: number }

function freshSlots(): Slot[] {
  return Array.from({ length: NUM_SLOTS }, () => ({ present: true, split: 0 }))
}

export function OzoneCycleAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const slotsRef = useRef<Slot[]>(freshSlots())
  const photonsRef = useRef<Photon[]>([])
  const clRef = useRef<Cl | null>(null)
  const flashesRef = useRef<Flash[]>([])
  const groundGlowRef = useRef(0)
  const countsRef = useRef({ blocked: 0, leaked: 0, destroyed: 0 })
  const chlorineRef = useRef(false)

  const [running, setRunning] = useState(false)
  const [chlorine, setChlorine] = useState(false)
  const [readout, setReadout] = useState({ density: 1, destroyed: 0 })

  const density = () => slotsRef.current.filter(s => s.present).length / NUM_SLOTS

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

    const slots = slotsRef.current
    const dens = slots.filter(s => s.present).length / NUM_SLOTS

    // --- backdrop bands ---
    ctx.fillStyle = 'rgba(129,140,248,0.05)' // space above
    ctx.fillRect(0, 0, W, LAYER_TOP)
    ctx.fillStyle = `rgba(34,211,238,${(0.05 + 0.14 * dens).toFixed(3)})` // ozone layer
    ctx.fillRect(0, LAYER_TOP - 4, W, LAYER_BOT - LAYER_TOP + 8)
    ctx.strokeStyle = 'rgba(34,211,238,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, LAYER_TOP - 4.5); ctx.lineTo(W, LAYER_TOP - 4.5)
    ctx.moveTo(0, LAYER_BOT + 4.5); ctx.lineTo(W, LAYER_BOT + 4.5)
    ctx.stroke()

    // Ground.
    if (groundGlowRef.current > 0) {
      ctx.fillStyle = `rgba(245,158,11,${(0.35 * groundGlowRef.current).toFixed(3)})`
      ctx.fillRect(0, GROUND_Y - 14, W, 14)
    }
    ctx.fillStyle = 'rgba(245,240,232,0.1)'
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)
    ctx.strokeStyle = 'rgba(245,240,232,0.4)'
    ctx.beginPath(); ctx.moveTo(0, GROUND_Y + 0.5); ctx.lineTo(W, GROUND_Y + 0.5); ctx.stroke()

    // Labels.
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('Sun · ultraviolet in', 10, 16)
    ctx.fillStyle = C_OZONE
    ctx.fillText(`stratospheric ozone layer  ·  ${(dens * 100).toFixed(0)}% intact`, 10, LAYER_TOP - 12)
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('surface — where life lives', 10, H - 10)

    // --- ozone molecules ---
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]
      const x = slotX(i)
      if (s.present) {
        // A little O3: three cyan dots. When splitting, the freed O lifts off.
        const lift = s.split * 9
        ctx.fillStyle = C_OZONE
        ctx.globalAlpha = 0.9
        ctx.beginPath(); ctx.arc(x - 3, slotCY + 2, 2.4, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x + 3, slotCY + 2, 2.4, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = s.split > 0.1 ? C_O2 : C_OZONE
        ctx.beginPath(); ctx.arc(x, slotCY - 2 - lift, 2.4, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    // --- UV photons ---
    for (const p of photonsRef.current) {
      ctx.strokeStyle = p.leaking ? C_LEAK : C_UV
      ctx.globalAlpha = p.leaking ? 1 : 0.85
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 8); ctx.stroke()
    }
    ctx.globalAlpha = 1

    // --- absorption / destruction flashes ---
    for (const f of flashesRef.current) {
      ctx.strokeStyle = `rgba(167,139,250,${(f.t).toFixed(3)})`
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(f.x, f.y, (1 - f.t) * 14 + 3, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.globalAlpha = 1

    // --- chlorine catalyst ---
    const cl = clRef.current
    if (cl) {
      ctx.fillStyle = C_CL
      ctx.beginPath(); ctx.arc(cl.x, cl.y, 6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#1A1712'
      ctx.font = 'bold 8px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Cl', cl.x, cl.y + 3)
      ctx.textAlign = 'left'
      ctx.font = '10px monospace'
    }

    // --- side meters ---
    const blocked = dens
    const mx = W - 150, my = 20, mw = 130, mh = 10
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('UV blocked by layer', mx, my - 4)
    ctx.fillStyle = 'rgba(255,245,235,0.08)'
    ctx.fillRect(mx, my, mw, mh)
    ctx.fillStyle = C_OZONE
    ctx.fillRect(mx, my, mw * blocked, mh)

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('UV reaching surface', mx, my + 26)
    ctx.fillStyle = 'rgba(255,245,235,0.08)'
    ctx.fillRect(mx, my + 30, mw, mh)
    ctx.fillStyle = C_LEAK
    ctx.fillRect(mx, my + 30, mw * (1 - blocked), mh)

    // --- readout panel (chlorine tally) ---
    if (countsRef.current.destroyed > 0 || chlorineRef.current) {
      const px = W - 210, py = GROUND_Y - 46, pw = 198, ph = 36
      ctx.fillStyle = 'rgba(15,13,10,0.85)'
      ctx.fillRect(px, py, pw, ph)
      ctx.strokeStyle = `${C_CL}55`
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1)
      ctx.fillStyle = C_CL
      ctx.font = 'bold 9px monospace'
      ctx.fillText('1 chlorine atom has destroyed', px + 8, py + 15)
      ctx.font = 'bold 16px monospace'
      ctx.fillStyle = '#F5F0E8'
      ctx.fillText(`${countsRef.current.destroyed} O₃`, px + 8, py + 31)
      ctx.font = '9px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.fillText('and keeps going', px + 96, py + 31)
      ctx.font = '10px monospace'
    }
  }, [])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running || !visible) return

    const spawnCl = () => {
      clRef.current = { x: slotX(2), y: 30, tx: slotX(2), ty: slotCY, seeking: true }
    }
    if (chlorineRef.current && !clRef.current) spawnCl()

    let frame = 0
    const tick = () => {
      const slots = slotsRef.current

      // Spawn UV photons from the top.
      if (Math.random() < 0.5) {
        photonsRef.current.push({ x: 14 + Math.random() * (W - 28), y: 0, v: 2.6 + Math.random() * 1.4, leaking: false })
      }

      // Chapman production: O + O2 -> O3 slowly refills empty slots.
      if (Math.random() < 0.05) {
        const empties: number[] = []
        for (let i = 0; i < slots.length; i++) if (!slots[i].present) empties.push(i)
        if (empties.length) slots[empties[(Math.random() * empties.length) | 0]].present = true
      }

      // Advance photons; test for absorption at the layer.
      const survivors: Photon[] = []
      for (const p of photonsRef.current) {
        p.y += p.v
        if (!p.leaking && p.y >= LAYER_TOP && p.y <= LAYER_BOT) {
          // Which slot column is it in?
          const i = Math.round(((p.x - 14) / (W - 28)) * (NUM_SLOTS - 1))
          const s = slots[Math.max(0, Math.min(NUM_SLOTS - 1, i))]
          if (s && s.present) {
            // Absorbed: O3 + UV -> O2 + O, then reforms (Chapman). Molecule pulses.
            s.split = 1
            countsRef.current.blocked += 1
            continue // photon consumed
          } else {
            p.leaking = true // slips through a gap in the layer
          }
        }
        if (p.y >= GROUND_Y) {
          if (p.leaking) {
            countsRef.current.leaked += 1
            groundGlowRef.current = Math.min(1, groundGlowRef.current + 0.12)
          }
          continue
        }
        survivors.push(p)
      }
      photonsRef.current = survivors

      // Decay the split pulses (ozone reforms) and ground glow.
      for (const s of slots) if (s.split > 0) s.split = Math.max(0, s.split - 0.06)
      groundGlowRef.current = Math.max(0, groundGlowRef.current - 0.02)

      // Chlorine catalytic cycle: Cl darts to an O3, destroys it, moves on.
      const cl = clRef.current
      if (cl) {
        const dx = cl.tx - cl.x
        const dy = cl.ty - cl.y
        const d = Math.hypot(dx, dy)
        if (d < 4) {
          if (cl.seeking) {
            // Reached an ozone molecule: Cl + O3 -> ClO + O2, ClO + O -> Cl + O2.
            const i = Math.round(((cl.x - 14) / (W - 28)) * (NUM_SLOTS - 1))
            const idx = Math.max(0, Math.min(NUM_SLOTS - 1, i))
            if (slots[idx].present) {
              slots[idx].present = false
              countsRef.current.destroyed += 1
              flashesRef.current.push({ x: slotX(idx), y: slotCY, t: 1 })
            }
          }
          // Pick the next present ozone molecule to attack.
          const present: number[] = []
          for (let i = 0; i < slots.length; i++) if (slots[i].present) present.push(i)
          if (present.length) {
            const nxt = present[(Math.random() * present.length) | 0]
            cl.tx = slotX(nxt); cl.ty = slotCY; cl.seeking = true
          } else {
            cl.tx = 14 + Math.random() * (W - 28); cl.ty = slotCY; cl.seeking = false
          }
        } else {
          const sp = 4.2
          cl.x += (dx / d) * Math.min(sp, d)
          cl.y += (dy / d) * Math.min(sp, d)
        }
      }

      // Advance flashes.
      flashesRef.current = flashesRef.current
        .map(f => ({ ...f, t: f.t - 0.05 }))
        .filter(f => f.t > 0)

      draw()
      frame += 1
      if (frame % 6 === 0) setReadout({ density: density(), destroyed: countsRef.current.destroyed })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw, visible])

  const toggleChlorine = () => {
    const next = !chlorine
    setChlorine(next)
    chlorineRef.current = next
    if (next) {
      clRef.current = { x: slotX(2), y: 30, tx: slotX(2), ty: slotCY, seeking: true }
    } else {
      clRef.current = null
    }
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    triggerReset()
    setRunning(false)
    setChlorine(false)
    chlorineRef.current = false
    slotsRef.current = freshSlots()
    photonsRef.current = []
    clRef.current = null
    flashesRef.current = []
    groundGlowRef.current = 0
    countsRef.current = { blocked: 0, leaked: 0, destroyed: 0 }
    setReadout({ density: 1, destroyed: 0 })
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The ozone–oxygen cycle and its catalytic destruction</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: The ozone–oxygen cycle and its catalytic destruction. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-teal text-bg-base text-xs font-medium hover:bg-accent-teal/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={toggleChlorine}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: chlorine ? C_CL : 'rgba(255,245,235,0.08)',
            color: chlorine ? '#1A1712' : 'rgba(245,240,232,0.7)',
          }}
        >
          {chlorine ? 'CFC chlorine: released' : 'Release CFC chlorine'}
        </button>
        <WidgetStatus className="ml-auto text-xs text-text-secondary font-mono">
          layer {(readout.density * 100).toFixed(0)}% intact · 1 Cl destroyed{' '}
          <strong style={{ color: C_CL }}>{readout.destroyed} O₃</strong>
        </WidgetStatus>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Press play: gold UV photons rain down and the cyan ozone molecules soak them up, each briefly
        splitting to O₂ + O and reforming — the Chapman cycle, absorbing UV so it never reaches the ground.
        Now release one chlorine atom and watch it chew through molecule after molecule without ever being
        used up. As the layer thins, more UV slips through the gaps to the surface. Toggle the chlorine back
        off and the cycle slowly rebuilds the layer.
      </p>
    </div>
  )
}
