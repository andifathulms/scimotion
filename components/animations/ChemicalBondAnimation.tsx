'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 400

// --- molecule panel -------------------------------------------------
const MOL_TOP = 0
const MOL_H = 156
const MOL_MID = MOL_TOP + 84
const CX = W / 2
const SCALE = 130 // pixels per angstrom of internuclear distance

// --- energy panel ---------------------------------------------------
const PLOT_L = 62
const PLOT_R = W - 24
const PLOT_T = 182
const PLOT_B = H - 34
const PLOT_W = PLOT_R - PLOT_L
const PLOT_H = PLOT_B - PLOT_T

// --- Morse potential for H2 -----------------------------------------
const DE = 4.52 // well depth, eV
const RE = 0.74 // equilibrium bond length, angstrom
const ALPHA = 1.94 // angstrom^-1
const R_MIN = 0.3
const R_MAX = 3.0
const V_TOP = 4.5
const V_BOT = -5.2

function morse(r: number): number {
  const t = 1 - Math.exp(-ALPHA * (r - RE))
  return DE * t * t - DE
}

const rToX = (r: number) => PLOT_L + ((r - R_MIN) / (R_MAX - R_MIN)) * PLOT_W
const vToY = (v: number) => PLOT_T + ((V_TOP - v) / (V_TOP - V_BOT)) * PLOT_H

// Offscreen electron-density buffer (drawn small, scaled up).
const DW = 300
const DH = 78
const DECAY = 11 // orbital size in buffer pixels

export function ChemicalBondAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bufRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0)
  const draggingRef = useRef(false)
  const rRef = useRef(1.6)

  const [r, setR] = useState(1.6)
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        rRef.current = RE
        setR(RE)
        return
      }
      setRunning(true)
    },
  })

  // Electron density from two overlapping 1s-like orbitals: psi = e^-d1/a + e^-d2/a,
  // rho = psi^2. The interference term is exactly the build-up between the nuclei.
  const drawDensity = useCallback((ctx: CanvasRenderingContext2D, rr: number) => {
    let buf = bufRef.current
    if (!buf) {
      buf = document.createElement('canvas')
      buf.width = DW
      buf.height = DH
      bufRef.current = buf
    }
    const bctx = buf.getContext('2d')
    if (!bctx) return

    const half = (rr * SCALE) / 2 / 2 // buffer is half-scale in x
    const bx1 = DW / 2 - half
    const bx2 = DW / 2 + half
    const by = DH / 2

    const img = bctx.createImageData(DW, DH)
    const data = img.data
    let peak = 0
    const rho = new Float32Array(DW * DH)
    for (let y = 0; y < DH; y++) {
      for (let x = 0; x < DW; x++) {
        const d1 = Math.hypot(x - bx1, (y - by) * 1.15)
        const d2 = Math.hypot(x - bx2, (y - by) * 1.15)
        const psi = Math.exp(-d1 / DECAY) + Math.exp(-d2 / DECAY)
        const p = psi * psi
        rho[y * DW + x] = p
        if (p > peak) peak = p
      }
    }
    for (let i = 0; i < DW * DH; i++) {
      const v = Math.min(1, rho[i] / (peak * 0.55))
      const a = Math.pow(v, 1.25)
      data[i * 4] = 251
      data[i * 4 + 1] = 146
      data[i * 4 + 2] = 60
      data[i * 4 + 3] = Math.round(a * 210)
    }
    bctx.putImageData(img, 0, 0)

    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(buf, 0, MOL_MID - DH, W, DH * 2)
    ctx.restore()
  }, [])

  const draw = useCallback((rr: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const v = morse(rr)
    const half = (rr * SCALE) / 2
    const x1 = CX - half
    const x2 = CX + half

    // ---- molecule panel ----
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, MOL_MID)
    ctx.lineTo(W, MOL_MID)
    ctx.stroke()

    drawDensity(ctx, rr)

    // Nuclei
    for (const nx of [x1, x2]) {
      ctx.beginPath()
      ctx.arc(nx, MOL_MID, 7, 0, Math.PI * 2)
      ctx.fillStyle = '#F59E0B'
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = 'rgba(15,13,10,0.9)'
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(nx, MOL_MID, 13, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(245,158,11,0.35)'
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.font = 'bold 9px monospace'
      ctx.fillStyle = 'rgba(15,13,10,0.95)'
      ctx.textAlign = 'center'
      ctx.fillText('+', nx, MOL_MID + 3)
    }

    // Distance dimension line
    const dy = MOL_MID + 46
    ctx.strokeStyle = 'rgba(255,245,235,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x1, dy)
    ctx.lineTo(x2, dy)
    ctx.stroke()
    for (const nx of [x1, x2]) {
      ctx.beginPath()
      ctx.moveTo(nx, dy - 5)
      ctx.lineTo(nx, dy + 5)
      ctx.stroke()
      ctx.beginPath()
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = 'rgba(255,245,235,0.18)'
      ctx.moveTo(nx, MOL_MID)
      ctx.lineTo(nx, dy)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = 'rgba(255,245,235,0.35)'
    }
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#FB923C'
    ctx.fillText(`r = ${rr.toFixed(2)} Å`, CX, dy + 18)

    // Regime caption
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    let caption: string
    let capColor: string
    if (rr > RE + 0.35) {
      caption = 'too far — clouds barely overlap, weak attraction pulls them in'
      capColor = '#60A5FA'
    } else if (rr < RE - 0.12) {
      caption = 'too close — nucleus–nucleus repulsion dominates, energy shoots up'
      capColor = '#F472B6'
    } else {
      caption = 'equilibrium — shared density between the nuclei balances repulsion'
      capColor = '#10B981'
    }
    ctx.fillStyle = capColor
    ctx.fillText(caption, 14, 20)

    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.font = '10px monospace'
    ctx.fillText('drag the nuclei ↔', 14, MOL_H - 6)

    // ---- energy panel ----
    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PLOT_L, PLOT_T)
    ctx.lineTo(PLOT_L, PLOT_B)
    ctx.stroke()

    // Zero line (separated atoms)
    const y0 = vToY(0)
    ctx.beginPath()
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(255,245,235,0.22)'
    ctx.moveTo(PLOT_L, y0)
    ctx.lineTo(PLOT_R, y0)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.textAlign = 'left'
    ctx.fillText('E = 0  (two free atoms)', PLOT_L + 6, y0 - 5)

    // Curve
    ctx.beginPath()
    let started = false
    for (let i = 0; i <= 260; i++) {
      const rq = R_MIN + (i / 260) * (R_MAX - R_MIN)
      const vq = morse(rq)
      if (vq > V_TOP) { started = false; continue }
      const px = rToX(rq)
      const py = vToY(vq)
      if (!started) { ctx.moveTo(px, py); started = true } else ctx.lineTo(px, py)
    }
    ctx.strokeStyle = '#FB923C'
    ctx.lineWidth = 2.2
    ctx.stroke()

    // Bond length marker
    const xe = rToX(RE)
    const ye = vToY(-DE)
    ctx.beginPath()
    ctx.setLineDash([3, 4])
    ctx.strokeStyle = 'rgba(16,185,129,0.6)'
    ctx.lineWidth = 1.2
    ctx.moveTo(xe, ye)
    ctx.lineTo(xe, PLOT_B)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#10B981'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`bond length ${RE} Å`, xe + 4, PLOT_B + 14)

    // Bond energy (well depth) bracket
    const bx = PLOT_L + 26
    ctx.beginPath()
    ctx.strokeStyle = '#A78BFA'
    ctx.lineWidth = 1.2
    ctx.moveTo(bx, y0)
    ctx.lineTo(bx, ye)
    ctx.stroke()
    for (const yy of [y0, ye]) {
      ctx.beginPath()
      ctx.moveTo(bx - 4, yy)
      ctx.lineTo(bx + 4, yy)
      ctx.stroke()
    }
    ctx.save()
    ctx.translate(bx - 10, (y0 + ye) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#A78BFA'
    ctx.font = '10px monospace'
    ctx.fillText(`bond energy ${DE} eV`, 0, 0)
    ctx.restore()

    // Minimum dot
    ctx.beginPath()
    ctx.arc(xe, ye, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = '#10B981'
    ctx.fill()

    // Live marker
    const mx = rToX(rr)
    const my = vToY(Math.min(V_TOP, v))
    ctx.beginPath()
    ctx.setLineDash([2, 3])
    ctx.strokeStyle = 'rgba(255,245,235,0.28)'
    ctx.lineWidth = 1
    ctx.moveTo(mx, PLOT_T)
    ctx.lineTo(mx, PLOT_B)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(mx, my, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#F59E0B'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(mx, my, 10, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(245,158,11,0.35)'
    ctx.lineWidth = 1.4
    ctx.stroke()

    // Readout
    ctx.textAlign = 'right'
    ctx.font = '11px monospace'
    ctx.fillStyle = '#F59E0B'
    ctx.fillText(`E = ${v.toFixed(2)} eV`, PLOT_R, PLOT_T + 14)
    ctx.fillStyle = 'rgba(255,245,235,0.5)'
    ctx.font = '10px monospace'
    ctx.fillText(
      v < 0 ? `${(-v).toFixed(2)} eV released vs. free atoms` : `${v.toFixed(2)} eV uphill vs. free atoms`,
      PLOT_R,
      PLOT_T + 29
    )
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.fillText('potential energy', PLOT_L - 56, PLOT_T + 10)
    ctx.textAlign = 'right'
    ctx.fillText('internuclear distance r →', PLOT_R, PLOT_B + 22)
  }, [drawDensity])

  // Autoplay: gently breathe the bond around equilibrium until the reader takes over.
  useEffect(() => {
    if (!running) return
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      phaseRef.current += dt * 0.5
      const s = 0.5 - 0.5 * Math.cos(phaseRef.current * Math.PI * 2)
      const rr = 0.58 + s * 1.5
      rRef.current = rr
      setR(rr)
      draw(rr)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  // Static redraw while paused / dragging.
  useEffect(() => {
    if (!running) draw(r)
  }, [running, r, draw])

  const applyPointer = useCallback((clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = ((clientX - rect.left) * W) / rect.width
    const rr = Math.max(R_MIN, Math.min(R_MAX, (Math.abs(x - CX) * 2) / SCALE))
    rRef.current = rr
    setR(rr)
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
    setRunning(false)
    applyPointer(e.clientX)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return
    applyPointer(e.clientX)
  }
  const onPointerUp = () => { draggingRef.current = false }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    draggingRef.current = false
    phaseRef.current = 0
    setRunning(false)
    rRef.current = 1.6
    setR(1.6)
    triggerReset()
  }

  const v = morse(r)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The bond as an energy well</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas
          role="img"
          aria-label="Animated diagram: The bond as an energy well. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg touch-none cursor-ew-resize"
          style={{ background: 'var(--color-canvas)' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
      <div className="animation-controls">
        <button
          onClick={() => setRunning(x => !x)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Distance:</span>
          <input
            type="range"
            min={R_MIN}
            max={R_MAX}
            step={0.01}
            value={r}
            onChange={e => { setRunning(false); rRef.current = +e.target.value; setR(+e.target.value) }}
            className="w-28 accent-accent-gold"
            aria-label="Internuclear distance in angstroms"
          />
          <span className="font-mono w-14">{r.toFixed(2)} Å</span>
        </label>
        <button
          onClick={() => { setRunning(false); rRef.current = RE; setR(RE) }}
          className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:bg-bg-hover transition-colors">
          Snap to bond length
        </button>
        <WidgetStatus className="ml-auto font-mono text-xs" style={{ color: v < 0 ? '#10B981' : '#F472B6' }}>
          E = {v.toFixed(2)} eV
        </WidgetStatus>
      </div>
    </div>
  )
}
