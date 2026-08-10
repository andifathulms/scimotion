'use client'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { useState, useEffect } from 'react'

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-lg hover:bg-bg-hover transition-colors"
      // "Toggle theme" never changed, and the sun/moon icon is aria-hidden, so
      // the current theme was unobtainable without sight. Naming the
      // destination states it and says what pressing will do, in one string.
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? (
        <Sun size={18} className="text-text-secondary" />
      ) : (
        <Moon size={18} className="text-text-secondary" />
      )}
    </button>
  )
}
