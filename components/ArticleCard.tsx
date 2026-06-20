'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { TopicBadge } from './TopicBadge'
import type { ArticleMeta } from '@/lib/articles'

type Topic = 'Mathematics' | 'Physics' | 'Computer Science' | 'Medicine'

function MathThumbnail({ height }: { height: number }) {
  return (
    <svg viewBox="0 0 300 120" width="100%" height={height} xmlns="http://www.w3.org/2000/svg">
      <rect width="300" height="120" fill="#1A1712" />
      {[2,3,4,5,6,7,8,9,10,11,12,13].map((n, i) => {
        const isPrime = [2,3,5,7,11,13].includes(n)
        const x = (i % 6) * 46 + 15
        const y = Math.floor(i / 6) * 46 + 15
        return (
          <g key={n}>
            <rect x={x} y={y} width="36" height="36" rx="4"
              fill={isPrime ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.03)'}
              stroke={isPrime ? '#A78BFA' : 'rgba(255,245,235,0.08)'}
              strokeWidth="0.5"
            />
            <text x={x+18} y={y+23} textAnchor="middle" fontSize="12"
              fill={isPrime ? '#A78BFA' : 'rgba(245,240,232,0.35)'}
              fontFamily="monospace"
            >{n}</text>
          </g>
        )
      })}
    </svg>
  )
}

function PhysicsThumbnail({ height }: { height: number }) {
  const points = Array.from({ length: 100 }, (_, i) => {
    const x = (i / 99) * 300
    const y = 60 + Math.sin((i / 99) * Math.PI * 4) * 40
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox="0 0 300 120" width="100%" height={height} xmlns="http://www.w3.org/2000/svg">
      <rect width="300" height="120" fill="#1A1712" />
      <polyline points={points} fill="none" stroke="#10B981" strokeWidth="2" />
    </svg>
  )
}

function CSThumbnail({ height }: { height: number }) {
  const bars = [45, 80, 30, 95, 55, 70, 25, 60, 85, 40]
  return (
    <svg viewBox="0 0 300 120" width="100%" height={height} xmlns="http://www.w3.org/2000/svg">
      <rect width="300" height="120" fill="#1A1712" />
      {bars.map((h, i) => (
        <rect key={i}
          x={i * 28 + 12} y={110 - h} width="20" height={h} rx="2"
          fill={i < 3 ? '#60A5FA' : 'rgba(96,165,250,0.3)'}
        />
      ))}
    </svg>
  )
}

function MedicineThumbnail({ height }: { height: number }) {
  const ecg = [
    [0,60],[40,60],[50,50],[55,85],[60,15],[65,75],[70,60],[130,60],
    [140,50],[145,80],[150,20],[155,70],[160,60],[220,60],
    [230,50],[235,75],[240,20],[245,65],[250,60],[300,60]
  ].map(([x,y]) => `${x},${y}`).join(' ')
  return (
    <svg viewBox="0 0 300 120" width="100%" height={height} xmlns="http://www.w3.org/2000/svg">
      <rect width="300" height="120" fill="#1A1712" />
      <polyline points={ecg} fill="none" stroke="#F472B6" strokeWidth="2" />
    </svg>
  )
}

const thumbnails: Record<Topic, (h: number) => React.ReactNode> = {
  Mathematics: (h) => <MathThumbnail height={h} />,
  Physics: (h) => <PhysicsThumbnail height={h} />,
  'Computer Science': (h) => <CSThumbnail height={h} />,
  Medicine: (h) => <MedicineThumbnail height={h} />,
}

export function ArticleCard({ article, featured = false }: { article: ArticleMeta; featured?: boolean }) {
  const thumbHeight = featured ? 200 : 120
  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
    <Link href={`/articles/${article.slug}`} className="block group">
      <div className="bg-bg-surface border border-border rounded-2xl overflow-hidden hover:border-border-hover hover:bg-bg-hover transition-colors duration-200">
        <div className="overflow-hidden" style={{ height: thumbHeight }}>
          {thumbnails[article.topic as Topic]?.(thumbHeight)}
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TopicBadge topic={article.topic as Topic} />
            <span className="text-xs font-medium uppercase tracking-wider text-accent-gold border border-accent-gold/25 bg-accent-gold/10 px-2 py-0.5 rounded-full">
              Interactive
            </span>
          </div>
          <h3 className={`font-semibold text-text-primary leading-snug mb-1.5 group-hover:text-accent-gold transition-colors ${featured ? 'text-xl' : 'text-sm'}`}>
            {article.title}
          </h3>
          <p className="text-xs text-text-secondary line-clamp-2 mb-3">{article.description}</p>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>{article.readTime} min read</span>
            <span>·</span>
            <span>{new Date(article.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
      </div>
    </Link>
    </motion.div>
  )
}
