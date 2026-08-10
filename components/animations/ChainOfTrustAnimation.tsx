'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

const RED = '#F87171'
const GOLD = '#F59E0B'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const CYAN = '#22D3EE'

type Cert = { role: 'leaf' | 'intermediate' | 'root'; subject: string; issuer: string }

type Scenario = {
  id: string
  label: string
  // chain[0] is the leaf (server) cert; the last entry is the top / self-signed cert.
  chain: Cert[]
  // Does the top cert match a root in the browser's trust store?
  storeMatch: string | null
}

// The three trusted roots the browser was born trusting.
const TRUST_STORE = ['ISRG Root X1', 'DigiCert Global', 'GlobalSign R6']

const SCENARIOS: Record<string, Scenario> = {
  valid: {
    id: 'valid',
    label: 'Valid chain (CA-signed)',
    chain: [
      { role: 'leaf', subject: 'bank.example', issuer: "Let's Encrypt R3" },
      { role: 'intermediate', subject: "Let's Encrypt R3", issuer: 'ISRG Root X1' },
      { role: 'root', subject: 'ISRG Root X1', issuer: 'ISRG Root X1' },
    ],
    storeMatch: 'ISRG Root X1',
  },
  selfsigned: {
    id: 'selfsigned',
    label: 'Self-signed leaf',
    chain: [{ role: 'leaf', subject: 'bank.example', issuer: 'bank.example (self)' }],
    storeMatch: null,
  },
  untrusted: {
    id: 'untrusted',
    label: 'Signed by an untrusted CA',
    chain: [
      { role: 'leaf', subject: 'bank.example', issuer: 'QuickCerts CA' },
      { role: 'intermediate', subject: 'QuickCerts CA', issuer: 'QuickCerts Root' },
      { role: 'root', subject: 'QuickCerts Root', issuer: 'QuickCerts Root' },
    ],
    storeMatch: null,
  },
}

type Step =
  | { kind: 'domain' }
  | { kind: 'sig'; edge: number } // verify chain[edge] using chain[edge+1]'s key
  | { kind: 'anchor' }
  | { kind: 'result' }

function buildSteps(s: Scenario): Step[] {
  const steps: Step[] = [{ kind: 'domain' }]
  for (let i = 0; i < s.chain.length - 1; i++) steps.push({ kind: 'sig', edge: i })
  steps.push({ kind: 'anchor' })
  steps.push({ kind: 'result' })
  return steps
}

// Card geometry. Index 0 (leaf) sits at the bottom; higher indices stack upward.
const CX = 430
const CARD_W = 200
const CARD_H = 64
const CARD_X = CX - CARD_W / 2
const LEAF_TOP = 262
const ROW = 104
const cardTop = (i: number) => LEAF_TOP - i * ROW

// Trust-store panel on the left.
const STORE = { x: 24, y: 132, w: 168, h: 150 }
const STORE_ROW_Y = [170, 206, 242]

function roleColor(role: Cert['role']): string {
  return role === 'leaf' ? CYAN : role === 'intermediate' ? VIOLET : GOLD
}

function roleLabel(role: Cert['role'], selfSigned: boolean): string {
  if (role === 'leaf') return selfSigned ? 'LEAF · SELF-SIGNED' : 'LEAF · SERVER CERT'
  if (role === 'intermediate') return 'INTERMEDIATE CA'
  return 'ROOT CA'
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

export function ChainOfTrustAnimation() {
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
  const [scenarioId, setScenarioId] = useState<keyof typeof SCENARIOS>('valid')
  const [idx, setIdx] = useState(-1)
  const [running, setRunning] = useState(false)

  const scenario = SCENARIOS[scenarioId]
  const steps = useMemo(() => buildSteps(scenario), [scenario])
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

    const chain = scenario.chain
    const n = chain.length
    const topIdx = n - 1
    const selfSigned = scenarioId === 'selfsigned'

    const cur = idx >= 0 && idx < steps.length ? steps[idx] : null
    const done = (k: number) => idx >= k
    // Which signature edges have been verified so far.
    const verifiedEdges = new Set<number>()
    for (let k = 0; k <= idx && k < steps.length; k++) {
      const s = steps[k]
      if (s.kind === 'sig') verifiedEdges.add(s.edge)
    }
    const anchorStep = steps.findIndex(s => s.kind === 'anchor')
    const resultStep = steps.findIndex(s => s.kind === 'result')
    const anchorChecked = idx >= anchorStep
    const finished = idx >= resultStep
    const trusted = scenario.storeMatch !== null
    // Overall verdict once the walk reaches the anchor / result.
    const secure = finished && trusted

    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, r)
    }

    const checkMark = (x: number, y: number, color: string) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - 4, y)
      ctx.lineTo(x - 1, y + 4)
      ctx.lineTo(x + 5, y - 4)
      ctx.stroke()
    }
    const crossMark = (x: number, y: number, color: string) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - 4, y - 4)
      ctx.lineTo(x + 4, y + 4)
      ctx.moveTo(x + 4, y - 4)
      ctx.lineTo(x - 4, y + 4)
      ctx.stroke()
    }

    // ---- header ----
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = RED
    ctx.fillText('validating  https://bank.example', 20, 20)

    // verdict badge (top-right)
    if (finished) {
      const label = secure ? '🔒 Secure' : '⚠ Not secure'
      const col = secure ? GREEN : RED
      ctx.textAlign = 'right'
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = col
      ctx.fillText(label, W - 20, 20)
    }

    // ---- trust store panel ----
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = GREEN
    ctx.fillText('Browser trust store', STORE.x, STORE.y - 10)
    roundRect(STORE.x, STORE.y, STORE.w, STORE.h, 8)
    ctx.fillStyle = 'rgba(16,185,129,0.05)'
    ctx.strokeStyle = 'rgba(16,185,129,0.4)'
    ctx.lineWidth = 1
    ctx.fill()
    ctx.stroke()
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('preinstalled roots', STORE.x + 12, STORE.y + 20)
    for (let i = 0; i < TRUST_STORE.length; i++) {
      const ry = STORE_ROW_Y[i]
      const match = anchorChecked && scenario.storeMatch === TRUST_STORE[i]
      roundRect(STORE.x + 12, ry, STORE.w - 24, 26, 6)
      ctx.fillStyle = match ? `${GREEN}2A` : 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = match ? GREEN : 'rgba(255,245,235,0.14)'
      ctx.lineWidth = match ? 1.8 : 1
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = match ? GREEN : 'rgba(245,240,232,0.55)'
      ctx.font = `${match ? 'bold ' : ''}10px monospace`
      ctx.fillText(TRUST_STORE[i], STORE.x + 22, ry + 17)
      if (match) checkMark(STORE.x + STORE.w - 22, ry + 13, GREEN)
    }

    // ---- signature edges (drawn under the cards) ----
    for (let i = 0; i < n - 1; i++) {
      const yLower = cardTop(i)
      const yUpper = cardTop(i + 1) + CARD_H
      const verified = verifiedEdges.has(i)
      const active = cur?.kind === 'sig' && cur.edge === i
      const col = verified ? GREEN : 'rgba(255,245,235,0.22)'
      ctx.strokeStyle = active ? GOLD : col
      ctx.lineWidth = active || verified ? 2 : 1.2
      ctx.setLineDash(verified ? [] : [4, 4])
      ctx.beginPath()
      ctx.moveTo(CX, yUpper)
      ctx.lineTo(CX, yLower)
      ctx.stroke()
      ctx.setLineDash([])

      // signature badge at the midpoint
      const my = (yUpper + yLower) / 2
      ctx.beginPath()
      ctx.arc(CX - 78, my, 11, 0, Math.PI * 2)
      ctx.fillStyle = verified ? `${GREEN}22` : active ? `${GOLD}22` : 'rgba(255,255,255,0.04)'
      ctx.strokeStyle = verified ? GREEN : active ? GOLD : 'rgba(255,245,235,0.3)'
      ctx.lineWidth = 1.3
      ctx.fill()
      ctx.stroke()
      if (verified) checkMark(CX - 78, my, GREEN)
      else {
        ctx.fillStyle = active ? GOLD : 'rgba(245,240,232,0.4)'
        ctx.font = '10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('?', CX - 78, my + 3.5)
        ctx.textAlign = 'left'
      }
      ctx.font = '9px monospace'
      ctx.fillStyle = verified ? GREEN : active ? GOLD : 'rgba(245,240,232,0.35)'
      ctx.textAlign = 'left'
      ctx.fillText('sig verified', CX - 60, my + 3.5)
    }

    // ---- certificate cards ----
    for (let i = 0; i < n; i++) {
      const y = cardTop(i)
      const col = roleColor(chain[i].role)
      const active =
        (cur?.kind === 'sig' && (cur.edge === i || cur.edge + 1 === i)) ||
        (cur?.kind === 'anchor' && i === topIdx) ||
        (cur?.kind === 'domain' && i === 0)
      roundRect(CARD_X, y, CARD_W, CARD_H, 8)
      ctx.fillStyle = active ? `${col}22` : 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = active ? col : `${col}88`
      ctx.lineWidth = active ? 1.8 : 1.2
      ctx.fill()
      ctx.stroke()

      ctx.textAlign = 'left'
      ctx.font = '8px monospace'
      ctx.fillStyle = col
      ctx.fillText(roleLabel(chain[i].role, selfSigned), CARD_X + 12, y + 16)

      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = '#F5F0E8'
      ctx.fillText(chain[i].subject, CARD_X + 12, y + 34)

      ctx.font = '9px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.55)'
      ctx.fillText(`issued by ${chain[i].issuer}`, CARD_X + 12, y + 51)

      // domain-match tick on the leaf
      if (chain[i].role === 'leaf' && done(0)) checkMark(CARD_X + CARD_W - 16, y + 30, GREEN)
    }

    // ---- anchor arrow: top cert → trust store ----
    if (anchorChecked) {
      const topY = cardTop(topIdx) + CARD_H / 2
      if (trusted) {
        const rowIndex = TRUST_STORE.indexOf(scenario.storeMatch as string)
        const ry = STORE_ROW_Y[rowIndex] + 13
        drawArrow(ctx, CARD_X - 6, topY, STORE.x + STORE.w + 6, ry, GREEN, false)
        ctx.fillStyle = GREEN
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('anchored', (CARD_X + STORE.x + STORE.w) / 2, topY - 8)
      } else {
        // reaches for the store but finds no trusted root
        drawArrow(ctx, CARD_X - 6, topY, STORE.x + STORE.w + 6, STORE.y + STORE.h + 4, RED, true)
        crossMark((CARD_X + STORE.x + STORE.w) / 2, topY - 2, RED)
        ctx.fillStyle = RED
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('no trusted root', (CARD_X + STORE.x + STORE.w) / 2, topY - 12)
      }
    }

    // ---- status line ----
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    const sy = H - 14
    const set = (color: string, msg: string) => {
      ctx.fillStyle = color
      ctx.fillText(msg, 20, sy)
    }
    if (cur === null) set('rgba(245,240,232,0.4)', 'Press Play — the browser walks the chain from leaf to a trusted root.')
    else if (cur.kind === 'domain') set(CYAN, 'Leaf cert names bank.example — the domain you asked for. ✓')
    else if (cur.kind === 'sig')
      set(
        GOLD,
        `Verify ${chain[cur.edge].subject}'s signature with ${chain[cur.edge + 1].subject}'s public key. ✓`
      )
    else if (cur.kind === 'anchor')
      set(
        trusted ? GREEN : RED,
        trusted
          ? `Top cert is ${scenario.storeMatch} — a root in the trust store. Anchor found.`
          : 'Top of the chain is not a root the browser trusts. No anchor.'
      )
    else
      set(
        secure ? GREEN : RED,
        secure
          ? 'Every signature checked out and the chain reaches a trusted root — connection secured.'
          : 'The chain does not reach a preinstalled root — the browser shows “Not secure”.'
      )
  }, [idx, steps, scenario, scenarioId])

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
    }, 900)
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

  const chooseScenario = (id: keyof typeof SCENARIOS) => {
    setScenarioId(id)
    setRunning(false)
    setIdx(-1)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Walking the certificate chain to a trusted root
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
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
          <span>Certificate:</span>
          <select
            value={scenarioId}
            onChange={e => chooseScenario(e.target.value as keyof typeof SCENARIOS)}
            className="px-2 py-1 rounded border border-border bg-bg-surface text-xs text-text-secondary"
          >
            {Object.values(SCENARIOS).map(s => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          links in chain: <strong style={{ color: RED }}>{scenario.chain.length}</strong>
        </span>
      </div>
    </div>
  )
}
