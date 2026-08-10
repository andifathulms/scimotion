'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 620
const H = 344

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const GREEN = '#10B981'

const DIM = 'rgba(245,240,232,0.42)'
const FAINT_LINE = 'rgba(255,245,235,0.12)'

// DFA that accepts binary strings with an EVEN number of 1s.
// State 0 = "even so far" (the start AND the only accept state).
// State 1 = "odd so far".  A '1' flips the parity; a '0' leaves it alone.
const STATES = [
  { id: 0, x: 210, y: 168, label: 'q0', tag: 'even 1s' },
  { id: 1, x: 430, y: 168, label: 'q1', tag: 'odd 1s' },
]
const ACCEPT = 0
const START = 0

function next(state: number, sym: string): number {
  return sym === '1' ? 1 - state : state
}

// Full run: list of states visited, path[0] = START, path[k] after reading k symbols.
function runDFA(input: string): number[] {
  const path = [START]
  let s = START
  for (const sym of input) {
    s = next(s, sym)
    path.push(s)
  }
  return path
}

const PRESETS = ['1011', '110', '101010', '0011']
const AUTOPLAY_MS = 820

export function FiniteAutomatonAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [input, setInput] = useState('1011')
  const [step, setStep] = useState(0) // symbols consumed so far, 0..input.length
  const [playing, setPlaying] = useState(false)

  const path = useMemo(() => runDFA(input), [input])
  const done = step >= input.length
  const accepted = done && path[input.length] === ACCEPT

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setStep(input.length); return }
      setStep(0)
      setPlaying(true)
    },
  })

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      setStep(prev => {
        if (prev >= input.length) { setPlaying(false); return prev }
        return prev + 1
      })
    }, AUTOPLAY_MS)
    return () => window.clearInterval(id)
  }, [playing, input.length])

  const active = path[step]

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // ---- heading ----
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = BLUE
    ctx.fillText('DFA · accepts binary strings with an even number of 1s', 16, 24)
    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('δ: read one symbol, follow one arrow. No memory beyond the current state.', 16, 40)

    // ---- input tape ----
    const tapeY = 60
    const cellW = 30
    const tapeX = 16
    for (let i = 0; i < input.length; i++) {
      const cx = tapeX + i * (cellW + 4)
      const read = i < step
      const current = i === step && !done
      ctx.fillStyle = current ? `${GOLD}33` : read ? 'rgba(255,245,235,0.05)' : 'rgba(255,245,235,0.02)'
      ctx.fillRect(cx, tapeY, cellW, 26)
      ctx.strokeStyle = current ? GOLD : read ? FAINT_LINE : FAINT_LINE
      ctx.lineWidth = current ? 1.5 : 1
      ctx.strokeRect(cx + 0.5, tapeY + 0.5, cellW - 1, 25)
      ctx.font = 'bold 13px monospace'
      ctx.fillStyle = current ? GOLD : read ? 'rgba(245,240,232,0.75)' : DIM
      ctx.textAlign = 'center'
      ctx.fillText(input[i] ?? '', cx + cellW / 2, tapeY + 18)
    }
    if (input.length === 0) {
      ctx.font = '11px monospace'
      ctx.fillStyle = DIM
      ctx.textAlign = 'left'
      ctx.fillText('ε  (empty string)', tapeX, tapeY + 18)
    }
    ctx.textAlign = 'left'

    // read-head pointer
    if (!done && input.length > 0) {
      const cx = tapeX + step * (cellW + 4) + cellW / 2
      ctx.fillStyle = GOLD
      ctx.beginPath()
      ctx.moveTo(cx, tapeY + 30)
      ctx.lineTo(cx - 5, tapeY + 38)
      ctx.lineTo(cx + 5, tapeY + 38)
      ctx.closePath()
      ctx.fill()
    }

    // ---- start arrow ----
    const q0 = STATES[0]
    ctx.strokeStyle = DIM
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(q0.x - 78, q0.y)
    ctx.lineTo(q0.x - 40, q0.y)
    ctx.stroke()
    ctx.fillStyle = DIM
    ctx.beginPath()
    ctx.moveTo(q0.x - 40, q0.y)
    ctx.lineTo(q0.x - 48, q0.y - 5)
    ctx.lineTo(q0.x - 48, q0.y + 5)
    ctx.closePath()
    ctx.fill()
    ctx.font = '9px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('start', q0.x - 78, q0.y - 8)

    // ---- transition on '1': q0 <-> q1, curved arcs ----
    const a = STATES[0]
    const b = STATES[1]
    const drawArc = (from: typeof a, to: typeof b, lift: number, sym: string, lit: boolean) => {
      const mx = (from.x + to.x) / 2
      const my = (from.y + to.y) / 2 + lift
      const ex = to.x + (from.x < to.x ? -38 : 38)
      const sx = from.x + (from.x < to.x ? 38 : -38)
      ctx.strokeStyle = lit ? GOLD : `${BLUE}88`
      ctx.lineWidth = lit ? 2.5 : 1.5
      ctx.beginPath()
      ctx.moveTo(sx, from.y)
      ctx.quadraticCurveTo(mx, my, ex, to.y)
      ctx.stroke()
      // arrowhead at (ex, to.y)
      const dir = from.x < to.x ? 1 : -1
      ctx.fillStyle = lit ? GOLD : `${BLUE}88`
      ctx.beginPath()
      ctx.moveTo(ex, to.y)
      ctx.lineTo(ex - dir * 8, to.y + (lift < 0 ? 2 : -2) - 4)
      ctx.lineTo(ex - dir * 8, to.y + (lift < 0 ? 2 : -2) + 4)
      ctx.closePath()
      ctx.fill()
      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = lit ? GOLD : BLUE
      ctx.textAlign = 'center'
      ctx.fillText(sym, mx, my + (lift < 0 ? -6 : 14))
      ctx.textAlign = 'left'
    }

    // Which transition is being taken at the current step?
    const takenFrom = step > 0 ? path[step - 1] : -1
    const takenSym = step > 0 ? input[step - 1] : ''
    const litTopOne = takenFrom === 0 && takenSym === '1' // q0 -1-> q1
    const litBotOne = takenFrom === 1 && takenSym === '1' // q1 -1-> q0
    const litSelf0 = takenFrom === 0 && takenSym === '0'
    const litSelf1 = takenFrom === 1 && takenSym === '0'

    drawArc(a, b, -46, '1', litTopOne)
    drawArc(b, a, 46, '1', litBotOne)

    // ---- self-loops on '0' ----
    const selfLoop = (st: typeof a, lit: boolean) => {
      const topY = st.y - 34
      ctx.strokeStyle = lit ? GOLD : `${VIOLET}99`
      ctx.lineWidth = lit ? 2.5 : 1.5
      ctx.beginPath()
      ctx.arc(st.x, topY - 14, 16, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = lit ? GOLD : `${VIOLET}99`
      ctx.beginPath()
      ctx.moveTo(st.x + 10, topY - 4)
      ctx.lineTo(st.x + 3, topY - 8)
      ctx.lineTo(st.x + 14, topY - 10)
      ctx.closePath()
      ctx.fill()
      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = lit ? GOLD : VIOLET
      ctx.textAlign = 'center'
      ctx.fillText('0', st.x, topY - 34)
      ctx.textAlign = 'left'
    }
    selfLoop(a, litSelf0)
    selfLoop(b, litSelf1)

    // ---- states ----
    STATES.forEach(st => {
      const isActive = st.id === active
      const isAccept = st.id === ACCEPT
      const col = isActive ? (done ? (accepted ? GREEN : PINK) : GOLD) : BLUE
      // glow on active
      if (isActive) {
        const g = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, 48)
        g.addColorStop(0, `${col}44`)
        g.addColorStop(1, `${col}00`)
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(st.x, st.y, 48, 0, Math.PI * 2); ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(st.x, st.y, 32, 0, Math.PI * 2)
      ctx.fillStyle = isActive ? `${col}22` : 'rgba(26,23,18,0.9)'
      ctx.fill()
      ctx.strokeStyle = col
      ctx.lineWidth = isActive ? 3 : 2
      ctx.stroke()
      if (isAccept) {
        ctx.beginPath()
        ctx.arc(st.x, st.y, 26, 0, Math.PI * 2)
        ctx.strokeStyle = col
        ctx.lineWidth = isActive ? 2 : 1.5
        ctx.stroke()
      }
      ctx.font = 'bold 15px monospace'
      ctx.fillStyle = col
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(st.label, st.x, st.y)
      ctx.font = '8px monospace'
      ctx.fillStyle = DIM
      ctx.fillText(st.tag, st.x, st.y + 46)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    })

    // ---- verdict panel ----
    const py = 254
    ctx.strokeStyle = FAINT_LINE
    ctx.lineWidth = 1
    ctx.strokeRect(16, py, W - 32, 72)

    ctx.font = '10px monospace'
    ctx.fillStyle = DIM
    const readSoFar = input.slice(0, step) || 'ε'
    ctx.fillText(`read so far: ${readSoFar}`, 28, py + 22)
    const ones = (input.slice(0, step).match(/1/g) || []).length
    ctx.fillText(`1s counted: ${ones}  →  parity ${ones % 2 === 0 ? 'even' : 'odd'}  →  in ${STATES[active].label}`, 28, py + 40)

    if (done) {
      ctx.font = 'bold 13px monospace'
      ctx.fillStyle = accepted ? GREEN : PINK
      const totalOnes = (input.match(/1/g) || []).length
      const verdict = accepted
        ? `ACCEPT — ended in q0 (${totalOnes} ones, even)`
        : `REJECT — ended in q1 (${totalOnes} ones, odd)`
      ctx.fillText(verdict, 28, py + 60)
    } else {
      ctx.font = '10px monospace'
      ctx.fillStyle = GOLD
      ctx.fillText('running… follow the lit arrow to the next state', 28, py + 60)
    }
  }, [input, step, active, done, accepted, path])

  useEffect(() => { draw() }, [draw])

  const setInputSafe = (v: string) => {
    const clean = v.replace(/[^01]/g, '').slice(0, 14)
    setPlaying(false)
    setInput(clean)
    setStep(0)
  }

  const reset = () => {
    triggerReset()
    setPlaying(false)
    setStep(0)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Run a DFA</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="font-mono">input:</span>
          <input
            value={input}
            onChange={e => setInputSafe(e.target.value)}
            placeholder="01 string"
            spellCheck={false}
            className="w-28 rounded border border-white/10 bg-bg-hover px-2 py-1 font-mono text-text-secondary focus:border-accent-gold/60"
          />
          {PRESETS.map(p => (
            <button
              key={p}
              onClick={() => setInputSafe(p)}
              className={`rounded border px-2 py-1 font-mono transition-colors ${input === p ? 'border-accent-gold text-accent-gold' : 'border-white/10 text-text-muted hover:text-text-secondary'}`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-text-muted ml-auto">
          <button
            onClick={() => { setPlaying(false); setStep(s => Math.max(0, s - 1)) }}
            disabled={step === 0}
            className="rounded border border-white/10 px-2 py-1 hover:text-text-secondary disabled:opacity-40 transition-colors"
          >
            ← prev
          </button>
          <button
            onClick={() => { setPlaying(false); setStep(s => Math.min(input.length, s + 1)) }}
            disabled={step >= input.length}
            className="rounded border border-white/10 px-2 py-1 hover:text-text-secondary disabled:opacity-40 transition-colors"
          >
            step →
          </button>
          <button
            onClick={() => { if (step >= input.length) setStep(0); setPlaying(p => !p) }}
            className="rounded border border-white/10 px-2 py-1 hover:text-text-secondary transition-colors"
          >
            {playing ? 'pause' : 'play'}
          </button>
          <span className="text-text-secondary font-medium">
            {step}/{input.length}
          </span>
        </div>
      </div>
    </div>
  )
}
