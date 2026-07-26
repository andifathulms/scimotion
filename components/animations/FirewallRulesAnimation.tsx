'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, ChevronUp, ChevronDown, X, Plus } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

// Palette
const RED = '#F87171'    // accent — the firewall / deny
const GOLD = '#F59E0B'   // pending / evaluating
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'  // allow
const CYAN = '#22D3EE'
const MUTE = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.22)'

const FW_X = 300          // the firewall wall
const SPEED = 0.135       // px per virtual ms
const SPAWN_GAP = 780     // ms between arrivals
const LANES = [46, 92, 138, 184, 230]

type Proto = 'TCP' | 'UDP' | 'ANY'
type Action = 'allow' | 'deny'
type Rule = { id: number; proto: Proto; port: number | null; action: Action }

type Tmpl = { port: number; proto: 'TCP' | 'UDP'; label: string; color: string }
const TEMPLATES: Tmpl[] = [
  { port: 443, proto: 'TCP', label: 'HTTPS', color: GREEN },
  { port: 22, proto: 'TCP', label: 'SSH', color: VIOLET },
  { port: 53, proto: 'UDP', label: 'DNS', color: CYAN },
  { port: 80, proto: 'TCP', label: 'HTTP', color: BLUE },
  { port: 3389, proto: 'TCP', label: 'RDP', color: GOLD },
  { port: 8080, proto: 'TCP', label: 'alt-HTTP', color: RED },
]

type Pkt = {
  id: number
  tmpl: Tmpl
  src: string
  x: number
  y: number
  verdict: Action | null
  matched: string
  fade: number
}

type Sim = {
  clock: number
  spawnCooldown: number
  tmplIdx: number
  laneIdx: number
  pkts: Pkt[]
  nextId: number
  allowed: number
  denied: number
}

function makeSim(): Sim {
  return {
    clock: 0,
    spawnCooldown: 260,
    tmplIdx: 0,
    laneIdx: 0,
    pkts: [],
    nextId: 0,
    allowed: 0,
    denied: 0,
  }
}

function randSrc(): string {
  return `203.0.113.${1 + Math.floor(Math.random() * 250)}`
}

// First matching rule decides; nothing matches → default-deny.
function evaluate(t: Tmpl, rules: Rule[]): { action: Action; matched: string } {
  for (const r of rules) {
    const protoOk = r.proto === 'ANY' || r.proto === t.proto
    const portOk = r.port === null || r.port === t.port
    if (protoOk && portOk) return { action: r.action, matched: String(r.id) }
  }
  return { action: 'deny', matched: 'default' }
}

let RID = 100
function mkRule(proto: Proto, port: number | null, action: Action): Rule {
  return { id: RID++, proto, port, action }
}

export function FirewallRulesAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const simRef = useRef<Sim>(makeSim())
  const [running, setRunning] = useState(false)
  const [rules, setRules] = useState<Rule[]>([
    mkRule('TCP', 443, 'allow'),
    mkRule('TCP', 22, 'allow'),
  ])
  const rulesRef = useRef(rules)
  rulesRef.current = rules
  const [flash, setFlash] = useState<string | null>(null)
  const [, setTick] = useState(0)

  // draft rule form
  const [dProto, setDProto] = useState<Proto>('TCP')
  const [dPort, setDPort] = useState('80')
  const [dAction, setDAction] = useState<Action>('allow')

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sim = simRef.current
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'

    // region labels
    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText('incoming packets', 14, 20)
    ctx.textAlign = 'right'
    ctx.fillText('protected network', W - 14, 20)

    // firewall wall
    ctx.fillStyle = 'rgba(248,113,113,0.10)'
    ctx.fillRect(FW_X - 7, 30, 14, H - 62)
    ctx.strokeStyle = RED
    ctx.lineWidth = 1.4
    ctx.strokeRect(FW_X - 7, 30, 14, H - 62)
    // brick hatch
    ctx.strokeStyle = 'rgba(248,113,113,0.35)'
    ctx.lineWidth = 0.8
    for (let y = 40; y < H - 40; y += 14) {
      ctx.beginPath(); ctx.moveTo(FW_X - 7, y); ctx.lineTo(FW_X + 7, y); ctx.stroke()
    }
    ctx.save()
    ctx.translate(FW_X, H - 24)
    ctx.fillStyle = RED
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('FIREWALL', 0, 0)
    ctx.restore()

    // packets
    for (const p of sim.pkts) {
      const pending = p.verdict === null
      const col = pending ? GOLD : p.verdict === 'allow' ? GREEN : RED
      ctx.globalAlpha = Math.max(0, 1 - p.fade)
      const bw = 66, bh = 26
      const x = p.x - bw / 2
      const y = p.y - bh / 2
      ctx.fillStyle = 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = col
      ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 6); ctx.fill(); ctx.stroke()
      ctx.fillStyle = col
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`${p.tmpl.proto} :${p.tmpl.port}`, p.x, p.y - 1)
      ctx.fillStyle = MUTE
      ctx.font = '8px monospace'
      ctx.fillText(p.tmpl.label, p.x, p.y + 9)
      // verdict badge
      if (p.verdict === 'deny' && p.fade > 0) {
        ctx.strokeStyle = RED
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(p.x - 7, p.y - 15); ctx.lineTo(p.x + 7, p.y - 29)
        ctx.moveTo(p.x + 7, p.y - 15); ctx.lineTo(p.x - 7, p.y - 29)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    // counters
    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    ctx.fillStyle = GREEN
    ctx.fillText(`allowed: ${sim.allowed}`, 14, H - 12)
    ctx.fillStyle = RED
    ctx.fillText(`dropped: ${sim.denied}`, 120, H - 12)

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }, [])

  const step = useCallback((dt: number) => {
    const sim = simRef.current
    const rules = rulesRef.current
    sim.clock += dt

    // spawn
    sim.spawnCooldown -= dt
    if (sim.spawnCooldown <= 0) {
      sim.spawnCooldown = SPAWN_GAP
      const tmpl = TEMPLATES[sim.tmplIdx % TEMPLATES.length]
      sim.tmplIdx++
      const y = LANES[sim.laneIdx % LANES.length]
      sim.laneIdx++
      sim.pkts.push({
        id: sim.nextId++,
        tmpl,
        src: randSrc(),
        x: -40,
        y,
        verdict: null,
        matched: '',
        fade: 0,
      })
    }

    let flashed: string | null = null
    const keep: Pkt[] = []
    for (const p of sim.pkts) {
      if (p.verdict === 'deny') {
        // stopped at the wall, fading out
        p.fade += dt / 620
        if (p.fade < 1) keep.push(p)
        continue
      }
      p.x += SPEED * dt
      if (p.verdict === null && p.x >= FW_X) {
        const { action, matched } = evaluate(p.tmpl, rules)
        p.verdict = action
        p.matched = matched
        flashed = matched
        if (action === 'allow') {
          sim.allowed++
        } else {
          sim.denied++
          p.x = FW_X // pin at the wall
        }
      }
      if (p.x > W + 40) continue
      keep.push(p)
    }
    sim.pkts = keep
    if (flashed) setFlash(flashed)
  }, [])

  useEffect(() => {
    if (!running) {
      draw()
      return
    }
    const loop = () => {
      step(16)
      draw()
      setTick(t => t + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  const seedStatic = useCallback(() => {
    const sim = simRef.current
    const rules = rulesRef.current
    const allow = TEMPLATES[0] // HTTPS
    const deny = TEMPLATES[4]  // RDP
    const va = evaluate(allow, rules)
    const vd = evaluate(deny, rules)
    sim.pkts = [
      { id: 1, tmpl: allow, src: randSrc(), x: 452, y: LANES[1], verdict: va.action, matched: va.matched, fade: 0 },
      { id: 2, tmpl: deny, src: randSrc(), x: FW_X, y: LANES[3], verdict: vd.action, matched: vd.matched, fade: 0.35 },
    ]
    draw()
  }, [draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) seedStatic()
      else setRunning(true)
    },
  })

  useEffect(() => { draw() }, [draw, rules, flash])

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    simRef.current = makeSim()
    setRunning(false)
    setFlash(null)
    triggerReset()
    draw()
  }, [draw, triggerReset])

  // rule editing
  const move = (i: number, dir: -1 | 1) => {
    setRules(prev => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = prev.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  const remove = (id: number) => setRules(prev => prev.filter(r => r.id !== id))
  const addRule = () => {
    const port = dPort.trim() === '' || dPort.trim().toLowerCase() === 'any' ? null : parseInt(dPort, 10)
    if (port !== null && (Number.isNaN(port) || port < 0 || port > 65535)) return
    setRules(prev => [...prev, mkRule(dProto, port, dAction)])
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Rules matched top-to-bottom</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>

      {/* rule list — evaluated in order, first match wins */}
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono">
        <div className="text-text-muted mb-1">rule list · first match wins</div>
        <div className="flex flex-col gap-1">
          {rules.map((r, i) => {
            const isFlash = flash === String(r.id)
            const col = r.action === 'allow' ? GREEN : RED
            return (
              <div key={r.id} className="flex items-center gap-2 px-1 rounded"
                style={{ background: isFlash ? `${col}22` : 'transparent' }}>
                <span style={{ color: MUTE, width: 16, display: 'inline-block' }}>{i + 1}.</span>
                <span style={{ color: col, fontWeight: 700, width: 44, display: 'inline-block' }}>{r.action}</span>
                <span style={{ color: 'rgba(245,240,232,0.75)' }}>{r.proto}</span>
                <span style={{ color: 'rgba(245,240,232,0.75)' }}>port {r.port === null ? 'any' : r.port}</span>
                <span className="ml-auto flex items-center gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0}
                    className="p-0.5 rounded hover:bg-bg-hover disabled:opacity-25" aria-label="move up">
                    <ChevronUp size={13} />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === rules.length - 1}
                    className="p-0.5 rounded hover:bg-bg-hover disabled:opacity-25" aria-label="move down">
                    <ChevronDown size={13} />
                  </button>
                  <button onClick={() => remove(r.id)}
                    className="p-0.5 rounded hover:bg-bg-hover" aria-label="delete rule">
                    <X size={13} />
                  </button>
                </span>
              </div>
            )
          })}
          {/* implicit default-deny */}
          <div className="flex items-center gap-2 px-1 rounded"
            style={{ background: flash === 'default' ? `${RED}22` : 'transparent' }}>
            <span style={{ color: MUTE, width: 16, display: 'inline-block' }}>{rules.length + 1}.</span>
            <span style={{ color: RED, fontWeight: 700, width: 44, display: 'inline-block' }}>deny</span>
            <span style={{ color: MUTE }}>ANY</span>
            <span style={{ color: MUTE }}>port any</span>
            <span className="ml-auto" style={{ color: FAINT }}>default-deny (implicit)</span>
          </div>
        </div>
      </div>

      {/* add-rule form */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs">
        <select value={dAction} onChange={e => setDAction(e.target.value as Action)}
          className="bg-bg-base border border-border rounded px-1.5 py-1 text-text-secondary">
          <option value="allow">allow</option>
          <option value="deny">deny</option>
        </select>
        <select value={dProto} onChange={e => setDProto(e.target.value as Proto)}
          className="bg-bg-base border border-border rounded px-1.5 py-1 text-text-secondary">
          <option value="TCP">TCP</option>
          <option value="UDP">UDP</option>
          <option value="ANY">ANY</option>
        </select>
        <span className="text-text-muted">port</span>
        <input value={dPort} onChange={e => setDPort(e.target.value)} placeholder="443 or any"
          className="w-24 bg-bg-base border border-border rounded px-1.5 py-1 text-text-secondary font-mono" />
        <button onClick={addRule}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-text-secondary hover:bg-bg-hover transition-colors">
          <Plus size={12} /> Add rule
        </button>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: RED, color: '#0F0D0A' }}>
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run traffic</>}
        </button>
      </div>
    </div>
  )
}
