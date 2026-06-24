import { ImageResponse } from 'next/og'
import { getAllArticles, getArticleBySlug } from '@/lib/articles'

export const alt = 'Scimotion article'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const topicColors: Record<string, string> = {
  Mathematics: '#A78BFA',
  Physics: '#10B981',
  'Computer Science': '#60A5FA',
  Medicine: '#F472B6',
}

export async function generateStaticParams() {
  const articles = await getAllArticles()
  return articles.map(a => ({ slug: a.slug }))
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { meta } = await getArticleBySlug(slug)
  const accent = topicColors[meta.topic] ?? '#F59E0B'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background: '#0F0D0A',
          color: '#F5F0E8',
          fontFamily: 'sans-serif',
        }}
      >
        {/* top row: brand + topic */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#F59E0B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ width: '13px', height: '13px', borderRadius: '50%', background: '#fff' }} />
            </div>
            <span style={{ fontSize: '30px', fontWeight: 600 }}>Scimotion</span>
          </div>
          <span
            style={{
              fontSize: '24px',
              fontWeight: 600,
              color: accent,
              border: `2px solid ${accent}`,
              borderRadius: '999px',
              padding: '8px 24px',
            }}
          >
            {meta.topic}
          </span>
        </div>

        {/* title + subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: '6px', width: '88px', background: accent, borderRadius: '3px', marginBottom: '32px' }} />
          <div style={{ fontSize: '68px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-1px' }}>
            {meta.title}
          </div>
          <div style={{ fontSize: '32px', color: 'rgba(245,240,232,0.6)', marginTop: '24px', lineHeight: 1.3 }}>
            {meta.subtitle}
          </div>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', fontSize: '24px', color: 'rgba(245,240,232,0.35)' }}>
          {meta.readTime} min read · Interactive animation
        </div>
      </div>
    ),
    { ...size }
  )
}
