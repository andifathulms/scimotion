'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const RED = '#F87171'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const GREEN = '#10B981'

const CLIENT = { x: 46, y: 150, w: 116, h: 66 }
const ATTACKER = { x: 242, y: 150, w: 116, h: 66 }
const SERVER = { x: 438, y: 150, w: 116, h: 66 }
const CERT = { x: 236, y: 58, w: 128, h: 54 }

type Step = { kind: string }

function buildSteps(checking: boolean): Step[] {
  const base: Step[] = [{ kind: 'hello' }, { kind: 'present' }, { kind: 'validate' }]
  if (checking) return [...base, { kind: 'reject' }, { kind: 'result' }]
  return [...base, { kind: 'accept' }, { kind: 'leak' }, { kind: 'result' }]
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  dashed: boolean
) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2
  ctx.setLineDash(dashed ? [5, 4] : [])
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.setLineDash([])
  const ang = Math.atan2(y2 - y1, x2 - x1)
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - 9 * Math.cos(ang - 0.4), y2 - 9 * Math.sin(ang - 0.4))
  ctx.lineTo(x2 - 9 * Math.cos(ang + 0.4), y2 - 9 * Math.sin(ang + 0.4))
  ctx.closePath()
  ctx.fill()
}

function drawLock(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, open: boolean) {
  ctx.strokeStyle = color
  ctx.fillStyle = `${color}33`
  ctx.lineWidth = 1.6
  // body
  ctx.beginPath()
  ctx.roundRect(x - 7, y, 14, 11, 2)
  ctx.fill()
  ctx.stroke()
  // shackle
  ctx.beginPath()
  if (open) ctx.arc(x + 2, y - 2, 5, Math.PI, Math.PI * 2.2)
  else ctx.arc(x, y - 2, 5, Math.PI, Math.PI * 2)
  ctx.stroke()
}

export function MITMAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setIdx(totalRef.current - 1)
        return
      }
      setIdx(-1)
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [checking, setChecking] = useState(false)
  const [idx, setIdx] = useState(-1)
  const [running, setRunning] = useState(false)

  const steps = useMemo(() => buildSteps(checking), [checking])
  const totalRef = useRef(steps.length)
  useEffect(() => {
    totalRef.current = steps.length
  }, [steps.length])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const cur = idx >= 0 && idx < steps.length ? steps[idx].kind : null
    const reached = (k: string) => steps.slice(0, idx + 1).some(s => s.kind === k)
    const finished = cur === 'result'
    const compromised = finished && !checking

    const box = (b: typeof CLIENT, color: string, active: boolean) => {
      ctx.beginPath()
      ctx.roundRect(b.x, b.y, b.w, b.h, 8)
      ctx.fillStyle = active ? `${color}22` : 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = active ? color : `${color}88`
      ctx.lineWidth = active ? 1.8 : 1.2
      ctx.fill()
      ctx.stroke()
    }

    const midY = CLIENT.y + CLIENT.h / 2
    const cRight = CLIENT.x + CLIENT.w
    const aLeft = ATTACKER.x
    const aRight = ATTACKER.x + ATTACKER.w
    const sLeft = SERVER.x

    // ---- header ----
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = RED
    ctx.fillText('you → bank.example  (attacker on the wire)', 20, 20)

    ctx.textAlign = 'right'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = checking ? GREEN : GOLD
    ctx.fillText(checking ? 'certificate validation: ON' : 'certificate validation: OFF', W - 20, 20)

    // ---- static links (background) ----
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(cRight, midY)
    ctx.lineTo(aLeft, midY)
    ctx.moveTo(aRight, midY)
    ctx.lineTo(sLeft, midY)
    ctx.stroke()
    ctx.setLineDash([])

    // ---- nodes ----
    const clientActive = cur === 'hello' || cur === 'validate' || cur === 'accept' || cur === 'reject'
    box(CLIENT, BLUE, clientActive)
    box(ATTACKER, RED, cur === 'present' || cur === 'leak')
    box(SERVER, GREEN, cur === 'leak')

    ctx.textAlign = 'center'
    ctx.fillStyle = BLUE
    ctx.font = 'bold 12px monospace'
    ctx.fillText('you', CLIENT.x + CLIENT.w / 2, midY - 4)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('browser', CLIENT.x + CLIENT.w / 2, midY + 12)

    ctx.fillStyle = RED
    ctx.font = 'bold 12px monospace'
    ctx.fillText('attacker', ATTACKER.x + ATTACKER.w / 2, midY - 4)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('in the middle', ATTACKER.x + ATTACKER.w / 2, midY + 12)

    ctx.fillStyle = GREEN
    ctx.font = 'bold 12px monospace'
    ctx.fillText('bank.example', SERVER.x + SERVER.w / 2, midY - 4)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('real server', SERVER.x + SERVER.w / 2, midY + 12)

    // ---- attacker's certificate (shown from 'present' onward) ----
    if (reached('present')) {
      const rejected = checking && reached('reject')
      const accepted = !checking && reached('accept')
      const col = rejected ? RED : accepted ? GOLD : 'rgba(245,240,232,0.6)'
      ctx.beginPath()
      ctx.roundRect(CERT.x, CERT.y, CERT.w, CERT.h, 7)
      ctx.fillStyle = rejected ? `${RED}18` : `${GOLD}14`
      ctx.strokeStyle = col
      ctx.lineWidth = 1.4
      ctx.fill()
      ctx.stroke()
      ctx.textAlign = 'left'
      ctx.font = '8px monospace'
      ctx.fillStyle = col
      ctx.fillText("ATTACKER'S CERT", CERT.x + 10, CERT.y + 15)
      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = '#F5F0E8'
      ctx.fillText('bank.example', CERT.x + 10, CERT.y + 31)
      ctx.font = '8px monospace'
      ctx.fillStyle = rejected ? RED : 'rgba(245,240,232,0.55)'
      ctx.fillText(rejected ? 'not signed by a trusted CA' : 'self-signed by attacker', CERT.x + 10, CERT.y + 46)
      // connector down to the attacker
      ctx.strokeStyle = `${col}88`
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(CERT.x + CERT.w / 2, CERT.y + CERT.h)
      ctx.lineTo(ATTACKER.x + ATTACKER.w / 2, ATTACKER.y)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // ---- current-step arrows / markers ----
    ctx.textAlign = 'center'
    if (cur === 'hello') {
      drawArrow(ctx, cRight + 4, midY, aLeft - 4, midY, BLUE, false)
      ctx.fillStyle = BLUE
      ctx.font = '9px monospace'
      ctx.fillText('ClientHello', (cRight + aLeft) / 2, midY - 8)
    } else if (cur === 'present') {
      drawArrow(ctx, aLeft - 4, midY, cRight + 4, midY, GOLD, false)
      ctx.fillStyle = GOLD
      ctx.font = '9px monospace'
      ctx.fillText('here is my cert', (cRight + aLeft) / 2, midY - 8)
    } else if (cur === 'accept') {
      drawLock(ctx, (cRight + aLeft) / 2, midY - 6, GOLD, false)
      ctx.fillStyle = GOLD
      ctx.font = '9px monospace'
      ctx.fillText('encrypted to attacker', (cRight + aLeft) / 2, midY + 22)
    } else if (cur === 'leak') {
      // attacker reads plaintext, then re-encrypts to the real server
      drawLock(ctx, (cRight + aLeft) / 2, midY - 6, RED, true)
      drawArrow(ctx, aRight + 4, midY, sLeft - 4, midY, RED, false)
      ctx.fillStyle = RED
      ctx.font = '9px monospace'
      ctx.fillText('reads everything', ATTACKER.x + ATTACKER.w / 2, ATTACKER.y + ATTACKER.h + 18)
    }

    // ---- status line ----
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    const sy = H - 14
    const set = (color: string, msg: string) => {
      ctx.fillStyle = color
      ctx.fillText(msg, 20, sy)
    }
    if (cur === null)
      set('rgba(245,240,232,0.4)', 'Toggle certificate validation, then press Play to run the interception.')
    else if (cur === 'hello') set(BLUE, 'You open a connection to bank.example — but the attacker sits on the wire.')
    else if (cur === 'present') set(GOLD, 'The attacker answers, presenting its OWN certificate for bank.example.')
    else if (cur === 'validate')
      set(
        checking ? GREEN : GOLD,
        checking
          ? 'Browser checks: is this cert signed by a trusted CA for bank.example?'
          : 'Validation is off — the browser takes the certificate at face value.'
      )
    else if (cur === 'reject') set(GREEN, 'No trusted CA signed it. Browser rejects the cert and refuses to connect.')
    else if (cur === 'accept') set(RED, 'The bogus cert is accepted. You encrypt your password to the attacker.')
    else if (cur === 'leak') set(RED, 'The attacker decrypts, reads your secrets, and relays on to the real bank.')
    else
      set(
        compromised ? RED : GREEN,
        compromised
          ? 'Attack succeeds — with no certificate check, an impostor is indistinguishable from the bank.'
          : 'Attack fails — the certificate the attacker cannot forge is exactly what stops it.'
      )

    // verdict badge
    if (finished) {
      ctx.textAlign = 'right'
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = compromised ? RED : GREEN
      ctx.fillText(compromised ? '⚠ impersonated' : '🔒 protected', W - 20, H - 14)
    }
  }, [idx, steps, checking])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setIdx(i => {
        if (i >= steps.length - 1) {
          setRunning(false)
          return i
        }
        return i + 1
      })
    }, 1100)
    return () => clearInterval(id)
  }, [running, steps.length])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setIdx(-1)
  }

  const stepOnce = () => {
    setRunning(false)
    setIdx(i => Math.min(i + 1, steps.length - 1))
  }

  const toggleChecking = (v: boolean) => {
    setChecking(v)
    setRunning(false)
    setIdx(-1)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · The man-in-the-middle, with and without certificate checks
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (idx >= steps.length - 1) setIdx(-1)
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Play
            </>
          )}
        </button>
        <button
          onClick={stepOnce}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors"
        >
          <ChevronRight size={12} /> Step
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Certificate validation:</span>
          <button
            onClick={() => toggleChecking(true)}
            className={`px-2 py-1 rounded border text-xs transition-colors ${
              checking ? 'border-accent-gold text-text-primary' : 'border-border text-text-muted hover:border-border-hover'
            }`}
          >
            On
          </button>
          <button
            onClick={() => toggleChecking(false)}
            className={`px-2 py-1 rounded border text-xs transition-colors ${
              !checking ? 'border-accent-gold text-text-primary' : 'border-border text-text-muted hover:border-border-hover'
            }`}
          >
            Off
          </button>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          outcome:{' '}
          <strong style={{ color: checking ? GREEN : RED }}>{checking ? 'protected' : 'exposed'}</strong>
        </span>
      </div>
    </div>
  )
}
