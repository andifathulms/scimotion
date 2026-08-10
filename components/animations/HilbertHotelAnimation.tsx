'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const VIOLET = '#A78BFA'
const ROOMS = 12 // visible rooms; the hotel continues past the ellipsis
const STEP = 52 // px between room centers
const BOX = 44 // px room box size

type Mode = 'single' | 'infinite'
// A guest token positioned by (x, y) in px. Existing guests keep their origin
// label; new guests are marked isNew and wait in the lobby until placed.
type Guest = { id: string; label: string; x: number; y: number; visible: boolean; isNew: boolean }

const roomX = (room: number) => (room - 1) * STEP
const LOBBY_Y = 60
const ROW_Y = 0

// Deterministic layout: guests are a pure function of (mode, phase). React keeps
// token identity by `id`, so changing x/y here makes CSS transitions animate the move.
function computeGuests(mode: Mode, phase: number): Guest[] {
  const guests: Guest[] = []
  if (mode === 'single') {
    // Existing occupants: room n -> n+1 once shifted (phase >= 1).
    for (let n = 1; n <= ROOMS; n++) {
      const dest = phase >= 1 ? n + 1 : n
      guests.push({
        id: `g${n}`,
        label: String(n),
        x: roomX(dest),
        y: ROW_Y,
        visible: dest <= ROOMS,
        isNew: false,
      })
    }
    // One new guest: waits in lobby, enters room 1 at the final phase.
    const placed = phase >= 2
    guests.push({
      id: 'new1',
      label: '★',
      x: roomX(1),
      y: placed ? ROW_Y : LOBBY_Y,
      visible: true,
      isNew: true,
    })
  } else {
    // Existing occupants: room n -> 2n (phase >= 1), freeing every odd room.
    for (let n = 1; n <= ROOMS; n++) {
      const dest = phase >= 1 ? 2 * n : n
      guests.push({
        id: `g${n}`,
        label: String(n),
        x: roomX(dest),
        y: ROW_Y,
        visible: dest <= ROOMS,
        isNew: false,
      })
    }
    // Infinitely many new guests fill the freed odd rooms 1,3,5,...
    const oddRooms = [1, 3, 5, 7, 9, 11]
    oddRooms.forEach((room, i) => {
      const placed = phase >= 2
      guests.push({
        id: `new${i}`,
        label: '★',
        x: roomX(room),
        y: placed ? ROW_Y : LOBBY_Y,
        visible: true,
        isNew: true,
      })
    })
  }
  return guests
}

const MAX_PHASE = 2

export function HilbertHotelAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: (reduced) => {
      if (reduced) {
        setPhase(MAX_PHASE) // one static final frame
      } else {
        startPlay()
      }
    },
  })

  const [mode, setMode] = useState<Mode>('single')
  const [phase, setPhase] = useState(0)
  const [playing, setPlaying] = useState(false)

  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef(0)
  const phaseRef = useRef(0)
  phaseRef.current = phase

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  // rAF-driven timeline: advance one phase roughly every 1100ms.
  const startPlay = useCallback(() => {
    if (phaseRef.current >= MAX_PHASE) setPhase(0)
    setPlaying(true)
    lastTickRef.current = 0
    const loop = (t: number) => {
      if (lastTickRef.current === 0) lastTickRef.current = t
      if (t - lastTickRef.current >= 1100) {
        lastTickRef.current = t
        setPhase((p) => {
          const next = Math.min(p + 1, MAX_PHASE)
          if (next >= MAX_PHASE) {
            setPlaying(false)
            return MAX_PHASE
          }
          return next
        })
      }
      if (phaseRef.current < MAX_PHASE) {
        rafRef.current = requestAnimationFrame(loop)
      }
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [])

  useEffect(() => stopRaf, [stopRaf])

  const step = () => {
    stopRaf()
    setPlaying(false)
    setPhase((p) => (p >= MAX_PHASE ? MAX_PHASE : p + 1))
  }

  const resetAll = () => {
    stopRaf()
    setPlaying(false)
    setPhase(0)
    triggerReset()
  }

  const switchMode = (m: Mode) => {
    stopRaf()
    setPlaying(false)
    setPhase(0)
    setMode(m)
  }

  const guests = computeGuests(mode, phase)

  const mapText =
    mode === 'single'
      ? 'map: room n → n+1  (bijection ℕ → {2,3,4,…})'
      : 'map: room n → 2n  (odd rooms freed for ∞ new guests)'

  const phaseText = (() => {
    if (mode === 'single') {
      if (phase === 0) return 'Hotel full. 1 new guest waiting in the lobby.'
      if (phase === 1) return 'Everyone shifts n → n+1. Room 1 is now free.'
      return 'New guest takes room 1 — full hotel fit one more.'
    }
    if (phase === 0) return 'Hotel full. Infinitely many new guests waiting.'
    if (phase === 1) return 'Everyone moves n → 2n. All odd rooms freed.'
    return 'Odd rooms 1,3,5,… fill — room for infinitely many more.'
  })()

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Hilbert&apos;s Hotel
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas" style={{ minHeight: 200 }}>
        <div style={{ overflowX: 'auto', overflowY: 'hidden', width: '100%' }}>
          <div
            style={{
              position: 'relative',
              width: ROOMS * STEP + 40,
              height: 120,
              margin: '0 auto',
            }}
          >
            {/* Static room boxes */}
            {Array.from({ length: ROOMS }, (_, i) => {
              const room = i + 1
              return (
                <div key={`room${room}`}>
                  <div
                    className="rounded-lg border border-border bg-bg-hover"
                    style={{
                      position: 'absolute',
                      left: roomX(room),
                      top: ROW_Y,
                      width: BOX,
                      height: BOX,
                    }}
                  />
                  <div
                    className="text-[9px] text-text-muted font-mono text-center"
                    style={{ position: 'absolute', left: roomX(room), top: BOX + 2, width: BOX }}
                  >
                    {room}
                  </div>
                </div>
              )
            })}

            {/* Ellipsis: the hotel keeps going */}
            <div
              className="text-text-muted font-mono"
              style={{ position: 'absolute', left: roomX(ROOMS) + BOX + 6, top: ROW_Y + 12 }}
            >
              …
            </div>

            {/* Lobby label */}
            <div
              className="text-[9px] text-text-muted"
              style={{ position: 'absolute', left: 0, top: LOBBY_Y - 14 }}
            >
              lobby
            </div>

            {/* Guest tokens overlaid — CSS transitions animate the moves */}
            {guests.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-center rounded-lg text-xs font-mono font-bold"
                style={{
                  position: 'absolute',
                  left: g.x,
                  top: g.y,
                  width: BOX,
                  height: BOX,
                  transition: 'left 600ms ease, top 600ms ease, opacity 400ms ease',
                  opacity: g.visible ? 1 : 0,
                  background: g.isNew ? 'rgba(167,139,250,0.18)' : 'rgba(96,165,250,0.16)',
                  border: `1px solid ${g.isNew ? VIOLET : 'rgba(96,165,250,0.55)'}`,
                  color: g.isNew ? VIOLET : '#60A5FA',
                }}
              >
                {g.label}
              </div>
            ))}
          </div>
        </div>

        {/* Readout */}
        <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
          <span style={{ color: VIOLET }}>{mapText}</span>
          <span className="text-text-muted">{phaseText}</span>
        </div>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => (playing ? (stopRaf(), setPlaying(false)) : startPlay())}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {playing ? 'Playing…' : 'Play'}
        </button>
        <button
          onClick={step}
          disabled={phase >= MAX_PHASE}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors disabled:opacity-40"
        >
          Step
        </button>

        <div className="flex items-center gap-1 ml-1">
          <button
            onClick={() => switchMode('single')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              mode === 'single'
                ? 'border-transparent text-bg-base'
                : 'border-border text-text-secondary hover:border-border-hover'
            }`}
            style={mode === 'single' ? { background: VIOLET } : undefined}
          >
            1 new guest
          </button>
          <button
            onClick={() => switchMode('infinite')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              mode === 'infinite'
                ? 'border-transparent text-bg-base'
                : 'border-border text-text-secondary hover:border-border-hover'
            }`}
            style={mode === 'infinite' ? { background: VIOLET } : undefined}
          >
            ∞ new guests
          </button>
        </div>

        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          Phase <strong className="text-accent-gold">{phase}</strong> / {MAX_PHASE}
        </WidgetStatus>
      </div>
    </div>
  )
}
