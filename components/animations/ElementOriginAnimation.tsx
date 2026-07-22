'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 388

const CELL = 27
const CH = 20
const GAP = 1.5
const TX = 16
const TY = 30
const FROW1 = TY + 7 * (CH + GAP) + 8 // lanthanide strip
const FROW2 = FROW1 + CH + GAP // actinide strip

type Origin = 'big' | 'cosmic' | 'low' | 'massive' | 'sn' | 'merger'

const COLORS: Record<Origin, string> = {
  big: '#60A5FA',
  cosmic: '#22D3EE',
  low: '#10B981',
  massive: '#818CF8',
  sn: '#F59E0B',
  merger: '#F472B6',
}

const ORIGINS: { key: Origin; label: string; blurb: string }[] = [
  { key: 'big', label: 'Big Bang', blurb: 'forged in the first three minutes of the universe' },
  { key: 'cosmic', label: 'Cosmic rays', blurb: 'chipped from heavier nuclei by high-energy cosmic-ray collisions' },
  { key: 'low', label: 'Low-mass stars', blurb: 'dredged up from dying Sun-like (AGB) stars, incl. the slow s-process' },
  { key: 'massive', label: 'Massive stars', blurb: 'fused in massive-star cores and blown out by core-collapse supernovae' },
  { key: 'sn', label: 'Supernovae', blurb: 'built in the explosive burning of supernovae (the iron-peak elements)' },
  { key: 'merger', label: 'Neutron-star mergers', blurb: 'the rapid r-process, in the debris of colliding neutron stars' },
]

type El = { z: number; sym: string; name: string; col: number; row: number; origin: Origin }

// Main table (period = row 1..7). Lanthanides (57–71) and actinides (89–92) are
// drawn in two strips below. Origin = the broadly accepted dominant source
// (after J. Johnson's "periodic table of the elements' origins").
const ELEMENTS: El[] = [
  { z: 1, sym: 'H', name: 'Hydrogen', col: 1, row: 1, origin: 'big' },
  { z: 2, sym: 'He', name: 'Helium', col: 18, row: 1, origin: 'big' },
  { z: 3, sym: 'Li', name: 'Lithium', col: 1, row: 2, origin: 'big' },
  { z: 4, sym: 'Be', name: 'Beryllium', col: 2, row: 2, origin: 'cosmic' },
  { z: 5, sym: 'B', name: 'Boron', col: 13, row: 2, origin: 'cosmic' },
  { z: 6, sym: 'C', name: 'Carbon', col: 14, row: 2, origin: 'low' },
  { z: 7, sym: 'N', name: 'Nitrogen', col: 15, row: 2, origin: 'low' },
  { z: 8, sym: 'O', name: 'Oxygen', col: 16, row: 2, origin: 'massive' },
  { z: 9, sym: 'F', name: 'Fluorine', col: 17, row: 2, origin: 'massive' },
  { z: 10, sym: 'Ne', name: 'Neon', col: 18, row: 2, origin: 'massive' },
  { z: 11, sym: 'Na', name: 'Sodium', col: 1, row: 3, origin: 'massive' },
  { z: 12, sym: 'Mg', name: 'Magnesium', col: 2, row: 3, origin: 'massive' },
  { z: 13, sym: 'Al', name: 'Aluminium', col: 13, row: 3, origin: 'massive' },
  { z: 14, sym: 'Si', name: 'Silicon', col: 14, row: 3, origin: 'massive' },
  { z: 15, sym: 'P', name: 'Phosphorus', col: 15, row: 3, origin: 'massive' },
  { z: 16, sym: 'S', name: 'Sulfur', col: 16, row: 3, origin: 'massive' },
  { z: 17, sym: 'Cl', name: 'Chlorine', col: 17, row: 3, origin: 'massive' },
  { z: 18, sym: 'Ar', name: 'Argon', col: 18, row: 3, origin: 'massive' },
  { z: 19, sym: 'K', name: 'Potassium', col: 1, row: 4, origin: 'massive' },
  { z: 20, sym: 'Ca', name: 'Calcium', col: 2, row: 4, origin: 'massive' },
  { z: 21, sym: 'Sc', name: 'Scandium', col: 3, row: 4, origin: 'sn' },
  { z: 22, sym: 'Ti', name: 'Titanium', col: 4, row: 4, origin: 'sn' },
  { z: 23, sym: 'V', name: 'Vanadium', col: 5, row: 4, origin: 'sn' },
  { z: 24, sym: 'Cr', name: 'Chromium', col: 6, row: 4, origin: 'sn' },
  { z: 25, sym: 'Mn', name: 'Manganese', col: 7, row: 4, origin: 'sn' },
  { z: 26, sym: 'Fe', name: 'Iron', col: 8, row: 4, origin: 'sn' },
  { z: 27, sym: 'Co', name: 'Cobalt', col: 9, row: 4, origin: 'sn' },
  { z: 28, sym: 'Ni', name: 'Nickel', col: 10, row: 4, origin: 'sn' },
  { z: 29, sym: 'Cu', name: 'Copper', col: 11, row: 4, origin: 'sn' },
  { z: 30, sym: 'Zn', name: 'Zinc', col: 12, row: 4, origin: 'sn' },
  { z: 31, sym: 'Ga', name: 'Gallium', col: 13, row: 4, origin: 'sn' },
  { z: 32, sym: 'Ge', name: 'Germanium', col: 14, row: 4, origin: 'low' },
  { z: 33, sym: 'As', name: 'Arsenic', col: 15, row: 4, origin: 'low' },
  { z: 34, sym: 'Se', name: 'Selenium', col: 16, row: 4, origin: 'merger' },
  { z: 35, sym: 'Br', name: 'Bromine', col: 17, row: 4, origin: 'merger' },
  { z: 36, sym: 'Kr', name: 'Krypton', col: 18, row: 4, origin: 'low' },
  { z: 37, sym: 'Rb', name: 'Rubidium', col: 1, row: 5, origin: 'low' },
  { z: 38, sym: 'Sr', name: 'Strontium', col: 2, row: 5, origin: 'low' },
  { z: 39, sym: 'Y', name: 'Yttrium', col: 3, row: 5, origin: 'low' },
  { z: 40, sym: 'Zr', name: 'Zirconium', col: 4, row: 5, origin: 'low' },
  { z: 41, sym: 'Nb', name: 'Niobium', col: 5, row: 5, origin: 'low' },
  { z: 42, sym: 'Mo', name: 'Molybdenum', col: 6, row: 5, origin: 'low' },
  { z: 43, sym: 'Tc', name: 'Technetium', col: 7, row: 5, origin: 'low' },
  { z: 44, sym: 'Ru', name: 'Ruthenium', col: 8, row: 5, origin: 'merger' },
  { z: 45, sym: 'Rh', name: 'Rhodium', col: 9, row: 5, origin: 'merger' },
  { z: 46, sym: 'Pd', name: 'Palladium', col: 10, row: 5, origin: 'merger' },
  { z: 47, sym: 'Ag', name: 'Silver', col: 11, row: 5, origin: 'merger' },
  { z: 48, sym: 'Cd', name: 'Cadmium', col: 12, row: 5, origin: 'low' },
  { z: 49, sym: 'In', name: 'Indium', col: 13, row: 5, origin: 'low' },
  { z: 50, sym: 'Sn', name: 'Tin', col: 14, row: 5, origin: 'low' },
  { z: 51, sym: 'Sb', name: 'Antimony', col: 15, row: 5, origin: 'merger' },
  { z: 52, sym: 'Te', name: 'Tellurium', col: 16, row: 5, origin: 'merger' },
  { z: 53, sym: 'I', name: 'Iodine', col: 17, row: 5, origin: 'merger' },
  { z: 54, sym: 'Xe', name: 'Xenon', col: 18, row: 5, origin: 'low' },
  { z: 55, sym: 'Cs', name: 'Caesium', col: 1, row: 6, origin: 'low' },
  { z: 56, sym: 'Ba', name: 'Barium', col: 2, row: 6, origin: 'low' },
  { z: 72, sym: 'Hf', name: 'Hafnium', col: 4, row: 6, origin: 'low' },
  { z: 73, sym: 'Ta', name: 'Tantalum', col: 5, row: 6, origin: 'low' },
  { z: 74, sym: 'W', name: 'Tungsten', col: 6, row: 6, origin: 'low' },
  { z: 75, sym: 'Re', name: 'Rhenium', col: 7, row: 6, origin: 'merger' },
  { z: 76, sym: 'Os', name: 'Osmium', col: 8, row: 6, origin: 'merger' },
  { z: 77, sym: 'Ir', name: 'Iridium', col: 9, row: 6, origin: 'merger' },
  { z: 78, sym: 'Pt', name: 'Platinum', col: 10, row: 6, origin: 'merger' },
  { z: 79, sym: 'Au', name: 'Gold', col: 11, row: 6, origin: 'merger' },
  { z: 80, sym: 'Hg', name: 'Mercury', col: 12, row: 6, origin: 'low' },
  { z: 81, sym: 'Tl', name: 'Thallium', col: 13, row: 6, origin: 'low' },
  { z: 82, sym: 'Pb', name: 'Lead', col: 14, row: 6, origin: 'low' },
  { z: 83, sym: 'Bi', name: 'Bismuth', col: 15, row: 6, origin: 'merger' },
  { z: 87, sym: 'Fr', name: 'Francium', col: 1, row: 7, origin: 'merger' },
  { z: 88, sym: 'Ra', name: 'Radium', col: 2, row: 7, origin: 'merger' },
  // lanthanide strip
  { z: 57, sym: 'La', name: 'Lanthanum', col: 3, row: 9, origin: 'low' },
  { z: 58, sym: 'Ce', name: 'Cerium', col: 4, row: 9, origin: 'low' },
  { z: 59, sym: 'Pr', name: 'Praseodymium', col: 5, row: 9, origin: 'merger' },
  { z: 60, sym: 'Nd', name: 'Neodymium', col: 6, row: 9, origin: 'low' },
  { z: 61, sym: 'Pm', name: 'Promethium', col: 7, row: 9, origin: 'merger' },
  { z: 62, sym: 'Sm', name: 'Samarium', col: 8, row: 9, origin: 'merger' },
  { z: 63, sym: 'Eu', name: 'Europium', col: 9, row: 9, origin: 'merger' },
  { z: 64, sym: 'Gd', name: 'Gadolinium', col: 10, row: 9, origin: 'merger' },
  { z: 65, sym: 'Tb', name: 'Terbium', col: 11, row: 9, origin: 'merger' },
  { z: 66, sym: 'Dy', name: 'Dysprosium', col: 12, row: 9, origin: 'merger' },
  { z: 67, sym: 'Ho', name: 'Holmium', col: 13, row: 9, origin: 'merger' },
  { z: 68, sym: 'Er', name: 'Erbium', col: 14, row: 9, origin: 'merger' },
  { z: 69, sym: 'Tm', name: 'Thulium', col: 15, row: 9, origin: 'merger' },
  { z: 70, sym: 'Yb', name: 'Ytterbium', col: 16, row: 9, origin: 'low' },
  { z: 71, sym: 'Lu', name: 'Lutetium', col: 17, row: 9, origin: 'low' },
  // actinide strip
  { z: 89, sym: 'Ac', name: 'Actinium', col: 3, row: 10, origin: 'merger' },
  { z: 90, sym: 'Th', name: 'Thorium', col: 4, row: 10, origin: 'merger' },
  { z: 91, sym: 'Pa', name: 'Protactinium', col: 5, row: 10, origin: 'merger' },
  { z: 92, sym: 'U', name: 'Uranium', col: 6, row: 10, origin: 'merger' },
]

const MAX_Z = 92

function cellX(col: number) { return TX + (col - 1) * (CELL + GAP) }
function cellY(row: number) {
  if (row === 9) return FROW1
  if (row === 10) return FROW2
  return TY + (row - 1) * (CH + GAP)
}

export function ElementOriginAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const revealRef = useRef(1)
  const [reveal, setReveal] = useState(1)
  const [selZ, setSelZ] = useState(79) // gold
  const [hoverZ, setHoverZ] = useState<number | null>(null)

  const shownZ = hoverZ ?? selZ
  const sel = useMemo(() => ELEMENTS.find(e => e.z === shownZ) ?? ELEMENTS[0], [shownZ])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    const rev = revealRef.current
    const selInfo = ORIGINS.find(o => o.key === sel.origin)

    // title
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = COLORS.massive
    ctx.fillText('The periodic table is a map of cosmic history', TX, 18)

    // cells
    for (const e of ELEMENTS) {
      if (e.z > Math.ceil(rev * MAX_Z)) continue
      const x = cellX(e.col)
      const y = cellY(e.row)
      const c = COLORS[e.origin]
      ctx.fillStyle = c + 'CC'
      ctx.fillRect(x, y, CELL, CH)
      if (e.z === selZ || e.z === hoverZ) {
        ctx.strokeStyle = 'rgba(255,245,235,0.95)'
        ctx.lineWidth = 1.8
        ctx.strokeRect(x + 1, y + 1, CELL - 2, CH - 2)
      }
      ctx.textAlign = 'center'
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = 'rgba(15,13,10,0.9)'
      ctx.fillText(e.sym, x + CELL / 2, y + 13)
    }

    // connector marks for the f-block
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('57–71', cellX(3) + CELL / 2, cellY(6) + 13)
    ctx.fillText('89–92', cellX(3) + CELL / 2, cellY(7) + 13)

    // legend
    const ly = FROW2 + CH + 16
    ctx.font = '9px monospace'
    ORIGINS.forEach((o, i) => {
      const col = i % 3
      const rrow = Math.floor(i / 3)
      const lx = TX + col * 190
      const yy = ly + rrow * 16
      ctx.fillStyle = COLORS[o.key]
      ctx.fillRect(lx, yy - 8, 10, 10)
      ctx.fillStyle = o.key === sel.origin ? 'rgba(255,245,235,0.95)' : 'rgba(245,240,232,0.6)'
      ctx.textAlign = 'left'
      ctx.fillText(o.label, lx + 15, yy)
    })

    // readout
    const ry = ly + 44
    ctx.textAlign = 'left'
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = COLORS[sel.origin]
    ctx.fillText(`${sel.sym} · ${sel.name}  (Z = ${sel.z})`, TX, ry)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.75)'
    ctx.fillText(`${selInfo?.label}: ${selInfo?.blurb}`, TX, ry + 17)
  }, [sel, selZ, hoverZ])

  const hitTest = (e: React.MouseEvent<HTMLCanvasElement>): number | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) * W) / rect.width
    const y = ((e.clientY - rect.top) * H) / rect.height
    for (const el of ELEMENTS) {
      const ex = cellX(el.col)
      const ey = cellY(el.row)
      if (x >= ex && x <= ex + CELL && y >= ey && y <= ey + CH) return el.z
    }
    return null
  }

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { revealRef.current = 1; setReveal(1); return }
      revealRef.current = 0
      setReveal(0)
      const start = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 1400)
        revealRef.current = t
        setReveal(t)
        draw()
        if (t < 1) rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    },
  })

  useEffect(() => { draw() }, [draw, reveal])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setSelZ(79)
    setHoverZ(null)
    revealRef.current = 1
    setReveal(1)
    triggerReset()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Where each element was made</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onMouseMove={e => setHoverZ(hitTest(e))}
          onMouseLeave={() => setHoverZ(null)}
          onClick={e => { const z = hitTest(e); if (z !== null) setSelZ(z) }}
          className="w-full rounded-lg cursor-pointer"
          style={{ background: '#0F0D0A' }}
        />
      </div>
      <div className="animation-controls">
        <span className="font-mono text-xs text-text-muted">
          Hover or tap any element — the colour is where it was forged.
        </span>
        <span className="ml-auto font-mono text-xs text-text-muted">
          {sel.sym}: {ORIGINS.find(o => o.key === sel.origin)?.label}
        </span>
      </div>
    </div>
  )
}
