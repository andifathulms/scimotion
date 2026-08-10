'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 380
const Y0 = 200 // the ecliptic line (Sun–Earth axis)
const SUN_X = 46
const EX = 320 // Earth centre x
const EARTH_R = 26
const MOON_SOLAR_X = 208 // Moon between Sun and Earth
const MOON_LUNAR_X = 500 // Moon beyond Earth
const MOON_R = 9
const MAX_OFF = 72 // pixel offset at maximum orbital tilt
const UMBRA_LEN = 540 // Earth umbra cone length (lunar mode)

const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const INDIGO = '#818CF8'
const RED = '#E06B5A'
const MOON_LIT = '#E9E3D2'

type Mode = 'solar' | 'lunar'

export function EclipseGeometryAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setMode('solar')
        setOff(0) // static aligned solar eclipse
        return
      }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const tRef = useRef(0)

  const [mode, setMode] = useState<Mode>('solar')
  const [running, setRunning] = useState(false)
  const [off, setOff] = useState(44) // vertical offset of Moon from ecliptic (px)

  // ---- Eclipse test ----
  let eclipse = false
  if (mode === 'solar') {
    // shadow axis: Sun -> Moon, extended to Earth's x
    const slope = off / (MOON_SOLAR_X - SUN_X)
    const yAtEarth = slope * (EX - SUN_X)
    eclipse = Math.abs(yAtEarth) < EARTH_R
  } else {
    // Earth's umbra shrinks with distance; is the Moon inside it?
    const rAtMoon = EARTH_R * (1 - (MOON_LUNAR_X - EX) / UMBRA_LEN)
    eclipse = Math.abs(off) < rAtMoon
  }

  const offDeg = ((off / MAX_OFF) * 5).toFixed(1)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'

    // ---- Ecliptic line (Sun–Earth plane, edge-on) ----
    ctx.beginPath()
    ctx.setLineDash([5, 5])
    ctx.moveTo(0, Y0)
    ctx.lineTo(W, Y0)
    ctx.strokeStyle = 'rgba(245,240,232,0.28)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('ecliptic (Sun–Earth plane)', 8, Y0 - 8)

    // ---- Tilted Moon orbit (~5°, exaggerated for clarity) ----
    const tiltRad = (14 * Math.PI) / 180
    ctx.beginPath()
    ctx.setLineDash([2, 4])
    ctx.moveTo(EX - 260, Y0 + Math.tan(tiltRad) * 260)
    ctx.lineTo(EX + 260, Y0 - Math.tan(tiltRad) * 260)
    ctx.strokeStyle = `${INDIGO}66`
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = `${INDIGO}CC`
    ctx.fillText("Moon's orbit tilts ~5°", W - 168, 24)

    // ---- Sun ----
    const sg = ctx.createRadialGradient(SUN_X, Y0, 4, SUN_X, Y0, 40)
    sg.addColorStop(0, '#FFE9A8')
    sg.addColorStop(0.5, GOLD)
    sg.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.beginPath()
    ctx.arc(SUN_X, Y0, 40, 0, Math.PI * 2)
    ctx.fillStyle = sg
    ctx.fill()
    ctx.beginPath()
    ctx.arc(SUN_X, Y0, 20, 0, Math.PI * 2)
    ctx.fillStyle = '#FFD873'
    ctx.fill()
    ctx.fillStyle = '#3a2c05'
    ctx.textAlign = 'center'
    ctx.fillText('Sun', SUN_X, Y0 + 3)

    const moonX = mode === 'solar' ? MOON_SOLAR_X : MOON_LUNAR_X
    const moonY = Y0 - off

    if (mode === 'solar') {
      // Moon's shadow cone converging from the Moon toward Earth.
      // Shadow axis runs Sun -> Moon; find its height at Earth's x.
      const slope = off / (MOON_SOLAR_X - SUN_X)
      const axisYatEarth = Y0 - slope * (EX - SUN_X)
      ctx.beginPath()
      ctx.moveTo(moonX, moonY - MOON_R)
      ctx.lineTo(moonX, moonY + MOON_R)
      ctx.lineTo(EX, axisYatEarth)
      ctx.closePath()
      ctx.fillStyle = eclipse ? 'rgba(129,140,248,0.30)' : 'rgba(180,180,190,0.16)'
      ctx.fill()
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.textAlign = 'left'
      ctx.fillText("Moon's shadow", moonX + 14, moonY + 4)
    } else {
      // Earth's umbra cone pointing away from Sun (to the right)
      ctx.beginPath()
      ctx.moveTo(EX, Y0 - EARTH_R)
      ctx.lineTo(EX, Y0 + EARTH_R)
      ctx.lineTo(EX + UMBRA_LEN, Y0)
      ctx.closePath()
      ctx.fillStyle = 'rgba(180,180,190,0.18)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(245,240,232,0.14)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.textAlign = 'left'
      ctx.fillText("Earth's shadow", EX + 60, Y0 - 10)
    }

    // ---- Earth ----
    ctx.beginPath()
    ctx.arc(EX, Y0, EARTH_R, 0, Math.PI * 2)
    ctx.fillStyle = '#173a54'
    ctx.fill()
    ctx.save()
    ctx.beginPath()
    ctx.arc(EX, Y0, EARTH_R, 0, Math.PI * 2)
    ctx.clip()
    ctx.beginPath()
    ctx.rect(EX - EARTH_R, Y0 - EARTH_R, EARTH_R, EARTH_R * 2)
    ctx.fillStyle = 'rgba(96,165,250,0.4)'
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = mode === 'solar' && eclipse ? INDIGO : `${BLUE}99`
    ctx.lineWidth = mode === 'solar' && eclipse ? 2.5 : 1
    ctx.beginPath()
    ctx.arc(EX, Y0, EARTH_R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#F5F0E8'
    ctx.textAlign = 'center'
    ctx.font = '10px monospace'
    ctx.fillText('Earth', EX, Y0 + EARTH_R + 14)

    // ---- Moon ----
    const inShadow = mode === 'lunar' && eclipse
    ctx.beginPath()
    ctx.arc(moonX, moonY, MOON_R, 0, Math.PI * 2)
    ctx.fillStyle = '#2A2822'
    ctx.fill()
    // lit (left, sunward) half
    ctx.save()
    ctx.beginPath()
    ctx.arc(moonX, moonY, MOON_R, 0, Math.PI * 2)
    ctx.clip()
    ctx.beginPath()
    ctx.rect(moonX - MOON_R, moonY - MOON_R, MOON_R, MOON_R * 2)
    ctx.fillStyle = inShadow ? RED : MOON_LIT
    ctx.fill()
    if (inShadow) {
      ctx.beginPath()
      ctx.arc(moonX, moonY, MOON_R, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(224,107,90,0.55)'
      ctx.fill()
    }
    ctx.restore()
    ctx.beginPath()
    ctx.arc(moonX, moonY, MOON_R, 0, Math.PI * 2)
    ctx.strokeStyle = `${INDIGO}CC`
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.font = '9px monospace'
    ctx.fillText('Moon', moonX, moonY - MOON_R - 6)

    // Moon offset tick from ecliptic
    ctx.beginPath()
    ctx.setLineDash([2, 3])
    ctx.moveTo(moonX, Y0)
    ctx.lineTo(moonX, moonY)
    ctx.strokeStyle = `${INDIGO}55`
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.setLineDash([])

    // ---- Status banner ----
    ctx.textAlign = 'center'
    ctx.font = 'bold 14px monospace'
    if (eclipse) {
      ctx.fillStyle = mode === 'solar' ? INDIGO : RED
      ctx.fillText(mode === 'solar' ? 'SOLAR ECLIPSE — shadow hits Earth' : 'LUNAR ECLIPSE — Moon in Earth’s shadow', W / 2, H - 16)
    } else {
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.fillText('no eclipse — shadow misses (Moon above/below the line)', W / 2, H - 16)
    }
  }, [mode, off, eclipse])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(animRef.current)
      return
    }
    const loop = () => {
      tRef.current += 0.018
      setOff(Math.round(MAX_OFF * Math.cos(tRef.current)))
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    tRef.current = 0
    setOff(44)
  }

  return (
    <div ref={ref} className="animation-block">
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1" style={{ marginBottom: 8 }}>
        <span>
          mode: <span style={{ color: '#F5F0E8' }}>{mode === 'solar' ? 'solar (new Moon)' : 'lunar (full Moon)'}</span>
        </span>
        <span>
          orbital offset: <span style={{ color: INDIGO }}>{offDeg}°</span> <span style={{ color: 'rgba(245,240,232,0.4)' }}>(tilt max ~5°)</span>
        </span>
        <span>
          status: <span style={{ color: eclipse ? (mode === 'solar' ? INDIGO : RED) : 'rgba(245,240,232,0.5)' }}>{eclipse ? 'ECLIPSE' : 'shadow misses'}</span>
        </span>
      </div>
      <canvas
          role="img"
          aria-label="Animated diagram: Eclipse geometry. Values are reported below the diagram."
        ref={canvasRef}
        style={{ width: '100%', maxWidth: W, aspectRatio: `${W} / ${H}`, background: 'var(--color-canvas)', borderRadius: 8 }}
      />
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setMode(m => (m === 'solar' ? 'lunar' : 'solar'))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors text-bg-base"
          style={{ backgroundColor: INDIGO }}
        >
          {mode === 'solar' ? 'Show Lunar' : 'Show Solar'}
        </button>
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted font-mono">
          tilt
          <input
            type="range"
            min={-MAX_OFF}
            max={MAX_OFF}
            value={off}
            onChange={e => {
              setRunning(false)
              setOff(Number(e.target.value))
            }}
            style={{ accentColor: INDIGO }}
          />
        </label>
      </div>
    </div>
  )
}
