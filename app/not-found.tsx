import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="max-w-[680px] mx-auto px-5 py-24 text-center">
      <p className="text-sm uppercase tracking-wider text-accent-gold mb-4">404</p>
      <h1 className="text-3xl font-bold text-text-primary mb-3" style={{ letterSpacing: '-0.5px' }}>
        This page drifted off-screen
      </h1>
      <p className="text-text-secondary text-base leading-relaxed mb-10">
        The page you&apos;re looking for doesn&apos;t exist — or never did. Head back and explore the
        articles instead.
      </p>
      <Link
        href="/"
        className="inline-block py-3 px-6 rounded-full bg-accent-blue text-white font-medium hover:bg-accent-blue/90 transition-colors"
      >
        Back to explore →
      </Link>
    </div>
  )
}
