'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { ThemeToggle } from './ThemeToggle'

// Ordered by how much guidance each one gives, most to least: follow a curated
// sequence, browse a field, look up a keyword, read about the site. A first-time
// visitor reads the order as a hierarchy, which is the only thing distinguishing
// three overlapping ways of slicing the same 171 articles.
//
// "Explore" used to lead this list pointing at "/", the same destination as the
// wordmark two inches to its left. A duplicate is worse than nothing here: it
// implies a distinction that does not exist and spends one of five slots saying
// so.
const NAV = [
  { href: '/learn', label: 'Learn' },
  { href: '/topics', label: 'Topics' },
  { href: '/tags', label: 'Tags' },
  { href: '/about', label: 'About' },
] as const

export function Navbar() {
  const [open, setOpen] = useState(false)
  // Next strips basePath from this, and trailingSlash means routes arrive as
  // "/learn/", so the prefix test covers both the index and its children.
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

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

        {/* Center links — desktop. The active item is marked by weight and a
            gold rule as well as by colour, and carries aria-current: the nav
            previously gave no indication of where you were, on any route. */}
        <div className="hidden sm:flex items-center gap-6">
          {NAV.map(({ href, label }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`relative py-4 text-sm transition-colors ${
                  active
                    ? 'font-medium text-text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-pill after:bg-accent-gold'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1">
          <Link
            href="/search"
            aria-label="Search articles"
            aria-current={isActive('/search') ? 'page' : undefined}
            className={`p-2 rounded-lg transition-colors hover:bg-bg-hover ${
              isActive('/search') ? 'text-accent-gold' : 'text-text-secondary'
            }`}
          >
            <Search size={18} />
          </Link>
          <ThemeToggle />
          {/* Mobile hamburger */}
          <button
            className="sm:hidden p-2 rounded-lg text-text-secondary hover:bg-bg-hover transition-colors"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="sm:hidden border-t border-border bg-bg-base px-5 py-4 flex flex-col gap-4">
          {NAV.map(({ href, label }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`text-sm ${active ? 'font-medium text-accent-gold' : 'text-text-secondary'}`}
              >
                {label}
              </Link>
            )
          })}
        </div>
      )}
    </nav>
  )
}
