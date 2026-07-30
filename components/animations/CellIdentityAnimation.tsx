'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 320

const LIME = '#A3E635' // repressive methyl marks (OFF)
const DIM = 'rgba(245,240,232,0.4)'
const FAINT = 'rgba(245,240,232,0.13)'
const TEXT = 'rgba(245,240,232,0.85)'
const RED = '#EF6F6F'

// One shared genome: the SAME seven genes in every cell.
const GENES = ['ACTB', 'SCN2A', 'SYN1', 'MYH2', 'ACTN2', 'KRT5', 'FLG'] as const

type CellKey = 'neuron' | 'muscle' | 'skin'

// Each cell type keeps the identical gene list but marks a DIFFERENT subset ON.
// ACTB is a housekeeping gene — on everywhere. The rest are lineage-specific.
const CELLS: Record<CellKey, { label: string; note: string; color: string; on: Set<string> }> = {
  neuron: { label: 'Neuron', note: 'fires electrical signals', color: '#60A5FA', on: new Set(['ACTB', 'SCN2A', 'SYN1']) },
  muscle: { label: 'Muscle', note: 'contracts to move you', color: '#FB923C', on: new Set(['ACTB', 'MYH2', 'ACTN2']) },
  skin: { label: 'Skin', note: 'forms a tough barrier', color: '#10B981', on: new Set(['ACTB', 'KRT5', 'FLG']) },
}
const ORDER: CellKey[] = ['neuron', 'muscle', 'skin']

const ROW_Y0 = 78
const ROW_DY = 26
const SPEED = 0.02

export function CellIdentityAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const divRef = useRef(0) // division progress 0 (one cell) .. 1 (two daughters)
  const cellRef = useRef<CellKey>('neuron')
  const [cell, setCell] = useState<CellKey>('neuron')
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        divRef.current = 1
        draw()
        return
      }
      divRef.current = 0
      startDivision()
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
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    const info = CELLS[cellRef.current]
    const dv = divRef.current

    // ---- Header ------------------------------------------------------------
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = info.color
    ctx.fillText(`${info.label.toUpperCase()} · ${info.note}`, 14, 18)
    ctx.font = '10px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('same genome in every cell — only the marks differ', 14, 34)

    // ---- Shared-genome gene panel -----------------------------------------
    ctx.font = '10px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('GENOME (identical) · 7 genes', 30, 58)

    for (let i = 0; i < GENES.length; i++) {
      const g = GENES[i]
      const y = ROW_Y0 + i * ROW_DY
      const on = info.on.has(g)

      // mark indicator: open padlock (ON) vs methyl dots (OFF)
      if (on) {
        ctx.strokeStyle = info.color
        ctx.lineWidth = 1.5
        ctx.strokeRect(38, y - 8, 16, 16)
        ctx.fillStyle = `${info.color}22`
        ctx.fillRect(38, y - 8, 16, 16)
        ctx.beginPath()
        ctx.fillStyle = info.color
        ctx.arc(46, y, 3, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.strokeStyle = FAINT
        ctx.lineWidth = 1.5
        ctx.strokeRect(38, y - 8, 16, 16)
        for (let m = 0; m < 3; m++) {
          ctx.beginPath()
          ctx.fillStyle = LIME
          ctx.arc(42.5 + m * 4.5, y, 1.8, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // gene name
      ctx.font = '12px monospace'
      ctx.fillStyle = on ? TEXT : DIM
      ctx.textAlign = 'left'
      ctx.fillText(g, 66, y)

      // ON / OFF badge
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'right'
      ctx.fillStyle = on ? info.color : RED
      ctx.fillText(on ? 'ON' : 'OFF', 270, y)
    }

    // divider
    ctx.strokeStyle = FAINT
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(300, 50)
    ctx.lineTo(300, H - 20)
    ctx.stroke()

    // ---- Cell + inheritance through division -------------------------------
    const panelX = 300
    const panelW = W - panelX
    const cx = panelX + panelW / 2
    ctx.textAlign = 'center'

    const drawCell = (x: number, y: number, r: number, label: boolean) => {
      ctx.beginPath()
      ctx.fillStyle = `${info.color}18`
      ctx.strokeStyle = info.color
      ctx.lineWidth = 2
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      // nucleus with the expressed-gene signature as coloured dots
      ctx.beginPath()
      ctx.fillStyle = `${info.color}30`
      ctx.strokeStyle = `${info.color}88`
      ctx.lineWidth = 1
      ctx.arc(x, y, r * 0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      const onGenes = GENES.filter(g => info.on.has(g))
      for (let k = 0; k < onGenes.length; k++) {
        const ang = -Math.PI / 2 + (k * 2 * Math.PI) / onGenes.length
        ctx.beginPath()
        ctx.fillStyle = info.color
        ctx.arc(x + Math.cos(ang) * r * 0.26, y + Math.sin(ang) * r * 0.26, 2.6, 0, Math.PI * 2)
        ctx.fill()
      }
      if (label) {
        ctx.fillStyle = TEXT
        ctx.font = 'bold 11px monospace'
        ctx.fillText(info.label, x, y + r + 14)
      }
    }

    if (dv < 0.04) {
      drawCell(cx, 150, 40, true)
      ctx.fillStyle = DIM
      ctx.font = '9px monospace'
      ctx.fillText('one cell, this epigenetic pattern', cx, 220)
    } else {
      // parent fading, two daughters separating with the SAME pattern
      const spread = dv * 46
      const py = 130
      drawCell(cx - spread, py, 34, false)
      drawCell(cx + spread, py, 34, false)
      // arrow from an implied parent
      ctx.strokeStyle = DIM
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(cx, 60)
      ctx.lineTo(cx - spread, py - 34)
      ctx.moveTo(cx, 60)
      ctx.lineTo(cx + spread, py - 34)
      ctx.stroke()
      ctx.setLineDash([])
      if (dv > 0.85) {
        ctx.fillStyle = LIME
        ctx.font = 'bold 10px monospace'
        ctx.fillText('marks copied →', cx, 190)
        ctx.fillStyle = TEXT
        ctx.font = '10px monospace'
        ctx.fillText('both daughters stay a', cx, 210)
        ctx.fillText(`${info.label.toLowerCase()} — cellular memory`, cx, 226)
      } else {
        ctx.fillStyle = DIM
        ctx.font = '9px monospace'
        ctx.fillText('dividing…', cx, 190)
      }
    }

    ctx.fillStyle = DIM
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('identical DNA → different marks → different identity', cx, H - 30)
  }, [])

  const startDivision = useCallback(() => {
    divRef.current = 0
    cancelAnimationFrame(animRef.current)
    const step = () => {
      if (divRef.current < 1) {
        divRef.current = Math.min(1, divRef.current + SPEED)
        draw()
        animRef.current = requestAnimationFrame(step)
      } else {
        draw()
      }
    }
    animRef.current = requestAnimationFrame(step)
  }, [draw])

  useEffect(() => {
    cellRef.current = cell
    draw()
  }, [cell, draw])

  useEffect(() => {
    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [draw])

  // Play: step through each cell type, dividing at each stop.
  useEffect(() => {
    if (!running) return
    let idx = ORDER.indexOf(cellRef.current)
    startDivision()
    const id = setInterval(() => {
      idx = (idx + 1) % ORDER.length
      setCell(ORDER[idx])
      startDivision()
      if (idx === ORDER.length - 1) setRunning(false)
    }, 2200)
    return () => clearInterval(id)
  }, [running, startDivision])

  const info = CELLS[cell]
  const onList = GENES.filter(g => info.on.has(g)).join(', ')

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · one genome, many cell identities</span>
        <button
          onClick={() => {
            triggerReset()
            setRunning(false)
            setCell('neuron')
            divRef.current = 0
            draw()
          }}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>cell: <strong style={{ color: info.color }}>{info.label}</strong></span>
        <span>genome: <strong className="text-text-muted">identical (7 genes)</strong></span>
        <span>expressed: <strong style={{ color: info.color }}>{onList}</strong></span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        {ORDER.map(k => (
          <button
            key={k}
            onClick={() => {
              setRunning(false)
              setCell(k)
              startDivision()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={
              cell === k
                ? { background: CELLS[k].color, color: '#0F0D0A' }
                : { background: 'transparent', color: CELLS[k].color, border: `1px solid ${CELLS[k].color}55` }
            }
          >
            {CELLS[k].label}
          </button>
        ))}
        <button
          onClick={() => setRunning(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-secondary text-xs font-medium hover:text-text-primary transition-colors"
        >
          <Play size={12} /> Play
        </button>
        <span className="ml-auto text-xs text-text-muted">Same letters, different marks.</span>
      </div>
    </div>
  )
}
