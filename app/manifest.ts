import type { MetadataRoute } from 'next'
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/site'

// Icons live in public/icons and are served under the deploy's basePath, which
// Next does NOT prefix onto manifest icon `src` strings for us — so mirror the
// same basePath resolution as next.config.mjs. start_url is the basePath root so
// an installed PWA opens the project page, not the domain root.
// Emit a static manifest.webmanifest at build time — required under output:
// 'export', same as the robots and sitemap routes.
export const dynamic = 'force-static'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/scimotion'

// theme/background match the layout's <meta name="theme-color"> (#0F0D0A), the
// same --color-bg-base the site paints on.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: `${basePath}/`,
    display: 'standalone',
    background_color: '#0F0D0A',
    theme_color: '#0F0D0A',
    icons: [
      { src: `${basePath}/icons/scimotion-icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${basePath}/icons/scimotion-icon-512.png`, sizes: '512x512', type: 'image/png' },
    ],
  }
}
