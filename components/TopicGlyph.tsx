import type { Topic } from '@/lib/topics'

// A small mark per field, so the field is never told by colour alone — badges,
// filter chips and the field gallery all carry it. 16-unit grid, drawn in
// currentColor so it takes whatever colour the surrounding text has.
const PATHS: Record<Topic, React.ReactNode> = {
  Mathematics: <path d="M3 4h10M3 8h4M9 8l4 4M13 8l-4 4M3 12h4" />,
  Physics: <path d="M1 8c1.5-4 3-4 4.5 0s3 4 4.5 0 3-4 4.5 0" />,
  Chemistry: <path d="M6 2h4M7 2v4L3 13a1 1 0 0 0 1 1.5h8A1 1 0 0 0 13 13L9 6V2" strokeLinejoin="round" />,
  Biology: <path d="M4 1c0 5 8 9 8 14M12 1c0 5-8 9-8 14M5 4h6M5 12h6" />,
  'Earth & Climate': (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M2.5 6.5c3 1 8 1 11 0M2.5 9.5c3-1 8-1 11 0" />
    </>
  ),
  'Astronomy & Cosmology': (
    <>
      <circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none" />
      <ellipse cx="8" cy="8" rx="7" ry="3" transform="rotate(-20 8 8)" />
    </>
  ),
  'Computer Science': <path d="M5 4L1.5 8 5 12M11 4l3.5 4-3.5 4M9.5 2.5l-3 11" strokeLinejoin="round" />,
  'Networks & the Internet': (
    <>
      <circle cx="3" cy="8" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="13" cy="3.5" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="13" cy="12.5" r="1.8" fill="currentColor" stroke="none" />
      <path d="M4.6 7.2l6.8-3M4.6 8.8l6.8 3" />
    </>
  ),
  Medicine: <path d="M1 8.5h3l1.5-4 3 8 1.8-5.5 1.2 1.5H15" strokeLinejoin="round" />,
}

export function TopicGlyph({ topic, size = 13, className }: { topic: Topic; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden="true"
      className={`shrink-0 ${className ?? ''}`}
    >
      {PATHS[topic]}
    </svg>
  )
}
