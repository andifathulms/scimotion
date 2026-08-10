'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 306

const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const GREEN = '#10B981'
const DIM = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.22)'

// Fixed public parameters — small enough that every step is checkable by hand.
const P = 23
const G = 5

// Panel geometry
const PW = 178
const PH = 152
const PY = 34
const AX = 14
const BX = W - 14 - PW
const LANE_L = AX + PW + 8
const LANE_R = BX - 8
const LANE_A = 92 // A travels left → right
const LANE_B = 138 // B travels right → left
const EVE_X = 206
const EVE_Y = 198
const EVE_W = 188
const EVE_H = 80

const DUR = [1200, 1300, 1500, 1700, 1700, 1500, 1500, 1400, 2200]
const N = DUR.length
const CUM: number[] = [0]
for (let i = 0; i < N; i++) CUM.push(CUM[i] + DUR[i])
const TOTAL = CUM[N]

function stepAt(t: number): number {
  for (let i = N - 1; i >= 0; i--) if (t >= CUM[i]) return i
  return 0
}

// Modular exponentiation by repeated squaring.
function modPow(base: number, exp: number, mod: number): number {
  let result = 1
  let b = base % mod
  let e = exp
  while (e > 0) {
    if (e & 1) result = (result * b) % mod
    b = (b * b) % mod
    e >>= 1
  }
  return result
}

const CAPTIONS = [
  'Alice and Bob agree in the clear on a prime p and a base g — Eve is welcome to both.',
  'Each picks a private exponent at random. These numbers never leave the machine that made them.',
  'Each raises g to their own private exponent, mod p. Easy forward, and the result is safe to publish.',
  'Alice sends A across the wire. Eve copies it — that is fine, it is a public value.',
  'Bob sends B back. Eve now holds p, g, A and B: everything that ever crossed the wire.',
  'Alice raises the value she received to her private exponent: s = B^a mod p.',
  'Bob does the mirror image: s = A^b mod p. Same arithmetic from the other side.',
  'Both landed on the same number — because (g^b)^a and (g^a)^b are both g^(ab) mod p.',
  'Eve has everything except a private exponent, and recovering one means solving a discrete logarithm.',
]

export function DiffieHellmanAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef<() => void>(() => {})
  const elapsedRef = useRef(0)
  const lastRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  const [a, setA] = useState(6)
  const [b, setB] = useState(15)
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(0)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        elapsedRef.current = TOTAL
        setStep(N - 1)
        drawRef.current()
        return
      }
      elapsedRef.current = 0
      setStep(0)
      setPlaying(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const t = elapsedRef.current
    const s = stepAt(t)
    const local = Math.min(1, (t - CUM[s]) / DUR[s])

    const A = modPow(G, a, P)
    const B = modPow(G, b, P)
    const shared = modPow(B, a, P)

    const showPriv = s >= 1
    const showPub = s >= 2
    const bobHasA = s >= 4
    const aliceHasB = s >= 5
    const showAliceS = s >= 5
    const showBobS = s >= 6
    const matched = s >= 7
    const eveHot = s >= 8
    const eveSawA = s > 3 || (s === 3 && local > 0.45)
    const eveSawB = s > 4 || (s === 4 && local > 0.45)

    // ---- public header ----
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = '11px monospace'
    ctx.fillStyle = DIM
    ctx.fillText('public, known to everyone:', AX, 16)
    ctx.fillStyle = VIOLET
    ctx.fillText(`p = ${P}`, AX + 160, 16)
    ctx.fillText(`g = ${G}`, AX + 216, 16)
    ctx.fillStyle = FAINT
    ctx.fillText(`step ${s + 1} / ${N}`, W - 86, 16)

    // ---- panel helper ----
    const panel = (x: number, name: string, color: string) => {
      ctx.fillStyle = 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = matched ? `${GREEN}66` : 'rgba(255,245,235,0.14)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(x, PY, PW, PH, 8)
      ctx.fill()
      ctx.stroke()
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = color
      ctx.fillText(name, x + 12, PY + 18)
    }

    panel(AX, 'Alice', BLUE)
    panel(BX, 'Bob', PINK)

    const line = (x: number, y: number, text: string, color: string, bold = false) => {
      ctx.font = bold ? 'bold 11px monospace' : '11px monospace'
      ctx.fillStyle = color
      ctx.fillText(text, x + 12, y)
    }

    // Alice's column
    if (showPriv) {
      line(AX, PY + 42, `private  a = ${a}`, GOLD, true)
      line(AX, PY + 58, 'never sent', FAINT)
    }
    if (showPub) {
      line(AX, PY + 82, `A = g^a mod p`, DIM)
      line(AX, PY + 98, `  = ${G}^${a} mod ${P} = ${A}`, BLUE, true)
    }
    if (showAliceS) {
      line(AX, PY + 122, `s = B^a mod p`, DIM)
      line(AX, PY + 138, `  = ${B}^${a} mod ${P} = ${shared}`, matched ? GREEN : VIOLET, true)
    } else if (aliceHasB) {
      line(AX, PY + 122, `got B = ${B}`, VIOLET)
    }

    // Bob's column
    if (showPriv) {
      line(BX, PY + 42, `private  b = ${b}`, GOLD, true)
      line(BX, PY + 58, 'never sent', FAINT)
    }
    if (showPub) {
      line(BX, PY + 82, `B = g^b mod p`, DIM)
      line(BX, PY + 98, `  = ${G}^${b} mod ${P} = ${B}`, PINK, true)
    }
    if (showBobS) {
      line(BX, PY + 122, `s = A^b mod p`, DIM)
      line(BX, PY + 138, `  = ${A}^${b} mod ${P} = ${shared}`, matched ? GREEN : VIOLET, true)
    } else if (bobHasA) {
      line(BX, PY + 122, `got A = ${A}`, VIOLET)
    }

    // ---- the wire ----
    const wire = (y: number, active: boolean) => {
      ctx.strokeStyle = active ? `${VIOLET}88` : 'rgba(255,245,235,0.12)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(LANE_L, y)
      ctx.lineTo(LANE_R, y)
      ctx.stroke()
      ctx.setLineDash([])
    }
    wire(LANE_A, s === 3)
    wire(LANE_B, s === 4)

    ctx.font = '9px monospace'
    ctx.fillStyle = FAINT
    ctx.textAlign = 'center'
    ctx.fillText('open wire', (LANE_L + LANE_R) / 2, LANE_A - 18)
    ctx.textAlign = 'left'

    // ---- packet in flight ----
    const packet = (x: number, y: number, label: string, color: string) => {
      ctx.fillStyle = `${color}33`
      ctx.strokeStyle = color
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.roundRect(x - 27, y - 10, 54, 20, 5)
      ctx.fill()
      ctx.stroke()
      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.fillText(label, x, y)
      ctx.textAlign = 'left'
    }

    if (s === 3) {
      const x = LANE_L + 28 + (LANE_R - LANE_L - 56) * local
      packet(x, LANE_A, `A=${A}`, BLUE)
      ctx.strokeStyle = `${PINK}55`
      ctx.lineWidth = 1
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(x, LANE_A + 12)
      ctx.lineTo(EVE_X + EVE_W / 2, EVE_Y)
      ctx.stroke()
      ctx.setLineDash([])
    }
    if (s === 4) {
      const x = LANE_R - 28 - (LANE_R - LANE_L - 56) * local
      packet(x, LANE_B, `B=${B}`, PINK)
      ctx.strokeStyle = `${PINK}55`
      ctx.lineWidth = 1
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(x, LANE_B + 12)
      ctx.lineTo(EVE_X + EVE_W / 2, EVE_Y)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // ---- Eve ----
    ctx.fillStyle = eveHot ? `${PINK}14` : 'rgba(255,255,255,0.03)'
    ctx.strokeStyle = eveHot ? PINK : 'rgba(255,245,235,0.14)'
    ctx.lineWidth = eveHot ? 1.6 : 1
    ctx.beginPath()
    ctx.roundRect(EVE_X, EVE_Y, EVE_W, EVE_H, 8)
    ctx.fill()
    ctx.stroke()

    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = eveHot ? PINK : DIM
    ctx.fillText('Eve · listening', EVE_X + 12, EVE_Y + 17)

    ctx.font = '10px monospace'
    const seen = ['p, g']
    if (eveSawA) seen.push(`A=${A}`)
    if (eveSawB) seen.push(`B=${B}`)
    ctx.fillStyle = VIOLET
    ctx.fillText(`sees: ${seen.join('  ')}`, EVE_X + 12, EVE_Y + 36)
    ctx.fillStyle = eveHot ? GOLD : FAINT
    ctx.fillText(`needs a from ${G}^a ≡ ${A} (mod ${P})`, EVE_X + 12, EVE_Y + 53)
    ctx.fillStyle = eveHot ? PINK : FAINT
    ctx.fillText(`shared secret: ?`, EVE_X + 12, EVE_Y + 69)

    // ---- match banner ----
    if (matched) {
      ctx.fillStyle = `${GREEN}22`
      ctx.strokeStyle = GREEN
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.roundRect(AX, PY + PH + 10, PW, 26, 6)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.roundRect(BX, PY + PH + 10, PW, 26, 6)
      ctx.fill()
      ctx.stroke()
      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = GREEN
      ctx.textAlign = 'center'
      ctx.fillText(`shared key = ${shared}`, AX + PW / 2, PY + PH + 23)
      ctx.fillText(`shared key = ${shared}`, BX + PW / 2, PY + PH + 23)
      ctx.textAlign = 'left'
    }

    // ---- caption ----
    ctx.font = '11px monospace'
    ctx.fillStyle = s >= 8 ? PINK : s >= 7 ? GREEN : DIM
    ctx.fillText(CAPTIONS[s], AX, H - 12)
  }, [a, b])

  useEffect(() => {
    drawRef.current = draw
    draw()
  }, [draw])

  useEffect(() => {
    if (!playing) return
    lastRef.current = performance.now()
    const tick = (now: number) => {
      const dt = now - lastRef.current
      lastRef.current = now
      elapsedRef.current = Math.min(elapsedRef.current + dt, TOTAL)
      const s = stepAt(elapsedRef.current)
      setStep(prev => (prev === s ? prev : s))
      drawRef.current()
      if (elapsedRef.current >= TOTAL) {
        setPlaying(false)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [playing])

  const resetAll = () => {
    triggerReset()
    setPlaying(false)
    elapsedRef.current = 0
    setStep(0)
    drawRef.current()
  }

  const stepOnce = () => {
    setPlaying(false)
    const s = stepAt(elapsedRef.current)
    elapsedRef.current = Math.min(CUM[Math.min(s + 2, N)] - 1, TOTAL)
    setStep(stepAt(elapsedRef.current))
    drawRef.current()
  }

  const restartWith = (fn: () => void) => {
    setPlaying(false)
    elapsedRef.current = 0
    setStep(0)
    fn()
  }

  const shared = modPow(modPow(G, b, P), a, P)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Diffie–Hellman over a tapped wire
        </span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Diffie–Hellman over a tapped wire. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (elapsedRef.current >= TOTAL) {
              elapsedRef.current = 0
              setStep(0)
            }
            setPlaying(p => !p)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {playing ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={stepOnce}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors"
        >
          <ChevronRight size={12} /> Step
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Alice&apos;s a:</span>
          <input
            type="range" min={2} max={P - 2} step={1} value={a}
            onChange={e => { const v = +e.target.value; restartWith(() => setA(v)) }}
            className="w-20 accent-accent-blue"
          />
          <span className="text-text-secondary font-medium">{a}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Bob&apos;s b:</span>
          <input
            type="range" min={2} max={P - 2} step={1} value={b}
            onChange={e => { const v = +e.target.value; restartWith(() => setB(v)) }}
            className="w-20 accent-accent-gold"
          />
          <span className="text-text-secondary font-medium">{b}</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary">
          Step <strong className="text-accent-gold">{step + 1}</strong> / {N}
          <span className="ml-3">shared key {shared}</span>
        </span>
      </div>
    </div>
  )
}
