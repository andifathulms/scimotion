'use client'
import { useEffect } from 'react'

export function ProseAnimator() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const proseEl = document.querySelector('.prose-article')
    if (!proseEl) return

    const targets = proseEl.querySelectorAll('h2, h3, p, blockquote, pre')

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('prose-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )

    targets.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return null
}
