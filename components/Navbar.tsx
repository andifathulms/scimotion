'use client'
import Link from 'next/link'
import { Search, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { ThemeToggle } from './ThemeToggle'

export function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-bg-base/80 backdrop-blur-md">
      <div className="max-w-[1100px] mx-auto px-5 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-[22px] h-[22px] rounded-[5px] bg-accent-gold flex items-center justify-center">
            <div className="w-[7px] h-[7px] rounded-full bg-white" />
          </div>
          <span className="font-semibold text-text-primary text-sm tracking-tight">Scimotion</span>
        </Link>

        {/* Center links — desktop */}
        <div className="hidden sm:flex items-center gap-6">
          <Link href="/" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Explore</Link>
          <Link href="/learn" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Learn</Link>
          <Link href="/topics" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Topics</Link>
          <Link href="/tags" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Tags</Link>
          <Link href="/about" className="text-sm text-text-secondary hover:text-text-primary transition-colors">About</Link>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1">
          <Link href="/search" className="p-2 rounded-lg hover:bg-bg-hover transition-colors">
            <Search size={18} className="text-text-secondary" />
          </Link>
          <ThemeToggle />
          {/* Mobile hamburger */}
          <button
            className="sm:hidden p-2 rounded-lg hover:bg-bg-hover transition-colors"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
          >
            {open ? <X size={18} className="text-text-secondary" /> : <Menu size={18} className="text-text-secondary" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="sm:hidden border-t border-border bg-bg-base px-5 py-4 flex flex-col gap-4">
          <Link href="/" onClick={() => setOpen(false)} className="text-sm text-text-secondary">Explore</Link>
          <Link href="/learn" onClick={() => setOpen(false)} className="text-sm text-text-secondary">Learn</Link>
          <Link href="/topics" onClick={() => setOpen(false)} className="text-sm text-text-secondary">Topics</Link>
          <Link href="/tags" onClick={() => setOpen(false)} className="text-sm text-text-secondary">Tags</Link>
          <Link href="/about" onClick={() => setOpen(false)} className="text-sm text-text-secondary">About</Link>
        </div>
      )}
    </nav>
  )
}
