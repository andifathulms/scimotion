'use client'
import { useEffect, useRef } from 'react'

type Particle = { x: number; y: number; vx: number; vy: number }

export function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let particles: Particle[] = []

    // The accent was written into the canvas as a literal rgba(245,158,11,...),
    // so the constellation stayed pitched for the near-black base and washed out
    // on the cream one — the only part of the hero that did not follow the theme.
    // Canvas takes no CSS variables, so read the token once and build the two
    // strokes from it. next-themes swaps the class on <html>, which remounts
    // nothing here; the field is decorative and re-reads on the next resize.
    // strokeStyle is reassigned once per connected pair per frame, so the colour
    // is resolved to channels up front rather than re-parsed as a function
    // string on every line.
    const accent = getComputedStyle(canvas).getPropertyValue('--color-accent-gold').trim()
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(accent)
    const [r, g, b] = m ? m.slice(1).map(h => parseInt(h, 16)) : [245, 158, 11]
    const tint = (alpha: number) => `rgba(${r},${g},${b},${alpha})`
    const dotColor = tint(0.45)

    const init = () => {
      const W = canvas.offsetWidth
      const H = canvas.offsetHeight
      canvas.width = W
      canvas.height = H
      particles = Array.from({ length: 80 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
      }))
    }

    const draw = () => {
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > W) p.vx *= -1
        if (p.y < 0 || p.y > H) p.vy *= -1
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            const alpha = (1 - dist / 120) * 0.35
            ctx.beginPath()
            ctx.strokeStyle = tint(alpha)
            ctx.lineWidth = 0.8
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }

      for (const p of particles) {
        ctx.beginPath()
        ctx.fillStyle = dotColor
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }

    init()
    draw()

    const onResize = () => { init() }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none' }}
    />
  )
}
