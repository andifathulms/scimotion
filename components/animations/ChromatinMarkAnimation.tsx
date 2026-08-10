'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

// The same short stretch of DNA, wound around a row of histones (nucleosomes).
// The LETTERS never change — only how tightly the fibre is packed does.
const SEQ = 'ATGCTAGGCATTACGCCTAGGATCACGTTAGCCAT'
const N = 6 // nucleosomes

const LIME = '#A3E635' // repressive methyl / histone marks (field accent)
const BLUE = '#60A5FA' // RNA polymerase / transcription machinery
const GOLD = '#F59E0B' // histone core
const DIM = 'rgba(245,240,232,0.4)'
const FAINT = 'rgba(245,240,232,0.13)'
const TEXT = 'rgba(245,240,232,0.82)'

const CY = 120 // vertical centre of the chromatin scene
const SPEED = 0.022 // eased-transition step per frame

// Open layout: nucleosomes strung out in a relaxed "beads on a string".
function openPos(i: number): { x: number; y: number } {
  const x = 70 + i * ((W - 140) / (N - 1))
  const y = CY + (i % 2 === 0 ? -12 : 12)
  return { x, y }
}
// Closed layout: the fibre folds into a tight, compact zig-zag clump.
function closedPos(i: number): { x: number; y: number } {
  const cx = W / 2
  const col = i % 2
  const row = Math.floor(i / 2)
  const x = cx + (col === 0 ? -26 : 26)
  const y = CY - 46 + row * 46
  return { x, y }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function ChromatinMarkAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const cRef = useRef(0) // current compaction 0 (open) .. 1 (closed)
  const [target, setTarget] = useState(0) // 0 = open, 1 = closed
  const [c, setC] = useState(0) // mirror of cRef for the readout
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        cRef.current = 1
        setC(1)
        setTarget(1)
        return
      }
      setTarget(1) // demo the closing on scroll-in
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const bw = Math.round(W * dpr)
    if (canvas.width !== bw) {
      canvas.width = bw
      canvas.height = Math.round(H * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    const cc = cRef.current
    const closed = cc > 0.5

    // ---- Header ------------------------------------------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = closed ? LIME : BLUE
    ctx.fillText(closed ? 'CLOSED chromatin · gene silenced' : 'OPEN chromatin · gene expressed', 14, 18)
    ctx.font = '10px monospace'
    ctx.fillStyle = DIM
    ctx.fillText(
      closed ? 'marks packed the fibre — polymerase cannot reach the DNA' : 'the fibre is loose — polymerase can read the gene',
      14, 32,
    )

    // ---- Nucleosome positions (interpolated) -------------------------------
    const pos = Array.from({ length: N }, (_, i) => {
      const o = openPos(i)
      const k = closedPos(i)
      return { x: lerp(o.x, k.x, cc), y: lerp(o.y, k.y, cc) }
    })

    // ---- DNA fibre threading through the histones --------------------------
    ctx.strokeStyle = closed ? 'rgba(163,230,53,0.5)' : 'rgba(96,165,250,0.6)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(40, lerp(openPos(0).y, closedPos(0).y, cc))
    ctx.lineTo(pos[0].x, pos[0].y)
    for (let i = 0; i < N - 1; i++) {
      const a = pos[i]
      const b = pos[i + 1]
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2 + (1 - cc) * (i % 2 === 0 ? 20 : -20)
      ctx.quadraticCurveTo(mx, my, b.x, b.y)
    }
    ctx.lineTo(W - 40, lerp(openPos(N - 1).y, closedPos(N - 1).y, cc))
    ctx.stroke()

    // ---- Histone cores + wrapped DNA + marks -------------------------------
    for (let i = 0; i < N; i++) {
      const { x, y } = pos[i]
      const r = 14
      // core
      ctx.beginPath()
      ctx.fillStyle = `${GOLD}22`
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 1.5
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      // DNA wrapped 1.65 turns around the core
      ctx.strokeStyle = closed ? 'rgba(163,230,53,0.7)' : 'rgba(96,165,250,0.8)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(x, y, r + 3, -0.3, Math.PI * 2 - 0.3)
      ctx.stroke()
      // repressive methyl / histone marks appear as the fibre closes
      if (cc > 0.15) {
        const a = Math.min(1, (cc - 0.15) / 0.5)
        ctx.globalAlpha = a
        for (let m = 0; m < 3; m++) {
          const ang = -Math.PI / 2 + (m - 1) * 0.85
          const mx = x + Math.cos(ang) * (r + 8)
          const my = y + Math.sin(ang) * (r + 8)
          ctx.beginPath()
          ctx.fillStyle = LIME
          ctx.arc(mx, my, 3.2, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
    }

    // ---- Transcription machinery (RNA polymerase) --------------------------
    const gateY = CY + 78
    if (!closed) {
      // polymerase docks on the open fibre and runs, spooling out mRNA
      const dock = 150
      ctx.beginPath()
      ctx.fillStyle = `${BLUE}26`
      ctx.strokeStyle = BLUE
      ctx.lineWidth = 1.5
      ctx.arc(dock, pos[1].y + 30, 15, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = BLUE
      ctx.font = '9px monospace'
      ctx.fillText('pol', dock, pos[1].y + 30)
      // mRNA squiggle trailing out
      ctx.strokeStyle = LIME
      ctx.lineWidth = 2
      ctx.beginPath()
      const my0 = pos[1].y + 46
      ctx.moveTo(dock, my0)
      for (let s = 0; s <= 40; s++) {
        const sx = dock + s * 2.6
        const sy = my0 + Math.sin(s * 0.6) * 5
        ctx.lineTo(sx, sy)
      }
      ctx.stroke()
      ctx.fillStyle = LIME
      ctx.textAlign = 'left'
      ctx.fillText('mRNA →', dock + 108, my0 - 10)
      ctx.textAlign = 'center'
    } else {
      // polymerase is turned away from the compacted clump
      const bx = W / 2 + 90
      ctx.beginPath()
      ctx.fillStyle = `${BLUE}22`
      ctx.strokeStyle = `${BLUE}88`
      ctx.lineWidth = 1.5
      ctx.arc(bx, CY, 15, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = `${BLUE}cc`
      ctx.font = '9px monospace'
      ctx.fillText('pol', bx, CY)
      // no-entry mark
      ctx.strokeStyle = '#EF6F6F'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(bx - 32, CY, 9, 0, Math.PI * 2)
      ctx.moveTo(bx - 38, CY - 6)
      ctx.lineTo(bx - 26, CY + 6)
      ctx.stroke()
    }

    // ---- The DNA letters — ALWAYS identical --------------------------------
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(20, gateY - 16)
    ctx.lineTo(W - 20, gateY - 16)
    ctx.stroke()
    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('DNA sequence (unchanged by the marks):', 20, gateY + 2)
    ctx.font = '12px monospace'
    ctx.fillStyle = TEXT
    ctx.textAlign = 'center'
    const startX = W / 2 - (SEQ.length - 1) * 15.4 / 2
    for (let i = 0; i < SEQ.length; i++) {
      ctx.fillText(SEQ[i], startX + i * 15.4, gateY + 22)
    }
  }, [])

  // Ease compaction toward the target; keep a loop alive while it moves.
  useEffect(() => {
    let cancelled = false
    const step = () => {
      if (cancelled) return
      const cur = cRef.current
      const diff = target - cur
      if (Math.abs(diff) > 0.002) {
        cRef.current = cur + Math.sign(diff) * Math.min(SPEED, Math.abs(diff))
        setC(cRef.current)
        draw()
        animRef.current = requestAnimationFrame(step)
      } else {
        cRef.current = target
        setC(target)
        draw()
      }
    }
    animRef.current = requestAnimationFrame(step)
    return () => {
      cancelled = true
      cancelAnimationFrame(animRef.current)
    }
  }, [target, draw])

  useEffect(() => {
    draw()
  }, [draw])

  // Play: auto-cycle open ↔ closed a couple of times, then settle.
  useEffect(() => {
    if (!running) return
    let n = 0
    const id = setInterval(() => {
      setTarget(t => (t > 0.5 ? 0 : 1))
      n += 1
      if (n >= 4) {
        setRunning(false)
      }
    }, 2000)
    return () => clearInterval(id)
  }, [running])

  const closedNow = c > 0.5
  const markState = c > 0.15 ? (c > 0.85 ? 'present' : 'being added') : 'none'
  const badge = closedNow ? LIME : BLUE

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · chromatin marks open &amp; close a gene</span>
        <button
          onClick={() => {
            triggerReset()
            setRunning(false)
            setTarget(0)
          }}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>marks: <strong style={{ color: LIME }}>{markState}</strong></span>
        <span>chromatin: <strong style={{ color: badge }}>{closedNow ? 'closed' : 'open'}</strong></span>
        <span>gene: <strong style={{ color: closedNow ? '#EF6F6F' : LIME }}>{closedNow ? 'OFF (silenced)' : 'ON (expressed)'}</strong></span>
        <span className="text-text-muted">DNA sequence: unchanged</span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            setRunning(false)
            setTarget(t => (t > 0.5 ? 0 : 1))
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors text-bg-base"
          style={{ background: LIME }}
        >
          {closedNow ? 'Remove marks (open)' : 'Add marks (close)'}
        </button>
        <button
          onClick={() => setRunning(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs font-medium hover:text-text-primary transition-colors"
        >
          <Play size={12} /> Play cycle
        </button>
        <span className="ml-auto text-xs text-text-muted">The letters never change — only the packing does.</span>
      </div>
    </div>
  )
}
