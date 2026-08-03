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
        {/* Logo — the app's atom-and-play mark, inlined so it stays crisp at any
            DPR. The adjacent wordmark labels the link, so the icon is decorative. */}
        <Link href="/" className="flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 512 512" aria-hidden="true" className="rounded-[5px]">
            <defs>
              <linearGradient id="scimotion-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f0a838" />
                <stop offset="100%" stopColor="#d97c1a" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="512" height="512" rx="115" fill="url(#scimotion-logo-gradient)" />
            <g transform="translate(30.72,30.72) scale(5.12)">
              <ellipse cx="44" cy="44" rx="38" ry="16" fill="none" stroke="#0e0d0c" strokeWidth="2.5" opacity="0.85" transform="rotate(0 44 44)" />
              <ellipse cx="44" cy="44" rx="38" ry="16" fill="none" stroke="#0e0d0c" strokeWidth="2.5" opacity="0.85" transform="rotate(60 44 44)" />
              <ellipse cx="44" cy="44" rx="38" ry="16" fill="none" stroke="#0e0d0c" strokeWidth="2.5" opacity="0.85" transform="rotate(120 44 44)" />
              <circle cx="44" cy="44" r="19" fill="#0e0d0c" />
              <path d="M39 34 L58 44 L39 54 Z" fill="#f0a838" />
            </g>
          </svg>
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
