'use client'
import { motion, type Variants } from 'framer-motion'
import { HeroCanvas } from './HeroCanvas'

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
}

const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
}

export function Hero() {
  return (
    <div
      className="relative overflow-hidden flex items-center py-16 sm:py-24"
      style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(245,158,11,0.07) 0%, transparent 65%)',
      }}
    >
      <HeroCanvas />
      <motion.div
        className="relative z-10 max-w-[680px]"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        <motion.span
          variants={item}
          className="inline-block text-xs font-mono uppercase tracking-widest mb-4"
          style={{ color: 'rgba(245,158,11,0.6)' }}
        >
          Science · Interactive
        </motion.span>

        <motion.h1
          variants={item}
          className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight mb-4"
          style={{ letterSpacing: '-0.5px' }}
        >
          <span className="text-text-primary">Science you can </span>
          <span
            style={{
              backgroundImage: 'linear-gradient(90deg, #F59E0B, #FB923C)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            see move.
          </span>
        </motion.h1>

        <motion.p
          variants={item}
          className="text-text-secondary text-lg leading-relaxed mb-8 max-w-[520px]"
        >
          Every article explains a concept, then hands you the controls.
        </motion.p>

        <motion.div variants={item} className="flex items-center gap-4">
          <a
            href="#topics"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 hover:opacity-90"
            style={{ background: '#F59E0B', color: '#0F0D0A' }}
          >
            Explore articles
          </a>
          <a
            href="/about"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            About Scimotion →
          </a>
        </motion.div>
      </motion.div>
    </div>
  )
}
