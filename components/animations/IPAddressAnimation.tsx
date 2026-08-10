'use client'
import { useRef, useEffect, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 200

const ACCENT = '#F87171' // red — the network portion
const GOLD = '#F59E0B'   // the host portion
const BLUE = '#60A5FA'
const CYAN = '#22D3EE'

// A concrete, real-looking IPv4 address to dissect.
const IP: [number, number, number, number] = [192, 168, 10, 37]

function bitsOf(octets: number[]): number[] {
  const bits: number[] = []
  for (const o of octets) for (let i = 7; i >= 0; i--) bits.push((o >> i) & 1)
  return bits
}

function maskOctets(prefix: number): number[] {
  const out = [0, 0, 0, 0]
  for (let i = 0; i < 32; i++) {
    if (i < prefix) out[Math.floor(i / 8)] |= 1 << (7 - (i % 8))
  }
  return out
}

function networkOctets(ip: number[], prefix: number): number[] {
  const m = maskOctets(prefix)
  return ip.map((o, i) => o & m[i])
}

// Layout of the 32 bit cells, grouped into four octets.
const MARGIN = 22
const CELL_GAP = 2
const GROUP_GAP = 16
const CELL_W = 14
const CELL_H = 30
const GROUP_W = 8 * CELL_W + 7 * CELL_GAP
const STRIP_Y = 58

function cellX(bit: number): number {
  const group = Math.floor(bit / 8)
  const within = bit % 8
  return MARGIN + group * (GROUP_W + GROUP_GAP) + within * (CELL_W + CELL_GAP)
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  prefix: { default: 24, min: 8, max: 30, step: 1 },
}

export function IPAddressAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('i-p-address', SPEC)
  const { prefix } = params
  const bits = bitsOf(IP)

  const draw = useCallback((n: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // Header: the address and its prefix
    ctx.font = 'bold 15px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = 'rgba(245,240,232,0.9)'
    ctx.fillText(`${IP.join('.')}/${n}`, MARGIN, 32)
    ctx.font = '10px monospace'
    ctx.fillStyle = ACCENT
    ctx.textAlign = 'left'
    ctx.fillText('network', MARGIN, 50)
    ctx.textAlign = 'right'
    ctx.fillStyle = GOLD
    ctx.fillText('host', W - MARGIN, 50)

    // Bit cells
    for (let b = 0; b < 32; b++) {
      const x = cellX(b)
      const isNet = b < n
      ctx.fillStyle = isNet ? 'rgba(248,113,113,0.20)' : 'rgba(245,158,11,0.16)'
      ctx.strokeStyle = isNet ? ACCENT : GOLD
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.rect(x, STRIP_Y, CELL_W, CELL_H)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = isNet ? ACCENT : GOLD
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(bits[b]), x + CELL_W / 2, STRIP_Y + CELL_H / 2 + 1)
    }

    // Prefix divider
    const divX = n === 0 ? MARGIN - 3 : cellX(n - 1) + CELL_W + (n % 8 === 0 && n < 32 ? GROUP_GAP / 2 - CELL_GAP : CELL_GAP / 2)
    ctx.strokeStyle = CYAN
    ctx.lineWidth = 2
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(divX, STRIP_Y - 8)
    ctx.lineTo(divX, STRIP_Y + CELL_H + 8)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = CYAN
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`/${n}`, divX, STRIP_Y + CELL_H + 20)

    // Octet decimal labels under each group
    ctx.font = '11px monospace'
    ctx.textBaseline = 'alphabetic'
    for (let g = 0; g < 4; g++) {
      const gx = MARGIN + g * (GROUP_W + GROUP_GAP) + GROUP_W / 2
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.textAlign = 'center'
      ctx.fillText(String(IP[g]), gx, STRIP_Y + CELL_H + 38)
    }

    // Network address line
    const net = networkOctets(IP, n)
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.fillText('routes on:', MARGIN, H - 14)
    ctx.fillStyle = ACCENT
    ctx.font = 'bold 12px monospace'
    ctx.fillText(`${net.join('.')}/${n}`, MARGIN + 62, H - 14)
  }, [bits])

  useEffect(() => { draw(prefix) }, [prefix, draw])

  // On scroll-in, sweep the prefix from wide to /24 so the hierarchy "narrows".
  const sweepRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { set('prefix', 24); return }
      let p = 8
      set('prefix', 8)
      clearInterval(sweepRef.current)
      sweepRef.current = setInterval(() => {
        p += 1
        set('prefix', p)
        if (p >= 24) clearInterval(sweepRef.current)
      }, 70)
    },
  })
  useEffect(() => () => clearInterval(sweepRef.current), [])

  const reset = () => {
    clearInterval(sweepRef.current)
    set('prefix', 24)
    triggerReset()
  }

  const hostAddrs = Math.pow(2, 32 - prefix)
  const usable = prefix <= 30 ? hostAddrs - 2 : 0
  const networks = Math.pow(2, prefix)
  const fmt = (v: number) => v.toLocaleString('en-US')

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · IP addresses & subnets</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border">
          <div className="text-text-muted">networks (/{prefix})</div>
          <div className="font-mono font-medium" style={{ color: ACCENT }}>{fmt(networks)}</div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border">
          <div className="text-text-muted">addresses / network</div>
          <div className="font-mono font-medium" style={{ color: GOLD }}>{fmt(hostAddrs)}</div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border">
          <div className="text-text-muted">usable hosts</div>
          <div className="font-mono font-medium" style={{ color: BLUE }}>{fmt(usable)}</div>
        </div>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span className="font-mono">prefix /{prefix}</span>
          <input
            type="range" min={SPEC.prefix.min} max={SPEC.prefix.max} step={SPEC.prefix.step} value={prefix}
            onChange={e => { clearInterval(sweepRef.current); set('prefix', +e.target.value) }}
            className="w-48"
            style={{ accentColor: CYAN }}
          />
        </label>
        <span className="ml-auto text-xs text-text-muted font-mono">
          {fmt(networks)} × {fmt(hostAddrs)} = {fmt(Math.pow(2, 32))} total
        </span>
      </div>
    </div>
  )
}
