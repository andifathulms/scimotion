import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import { SITE_URL, SITE_DESCRIPTION } from '@/lib/site'
import '../styles/globals.css'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Scimotion — Science you can play with',
  // One description for the tab, the feed and the manifest, rather than three
  // near-copies that drift.
  description: SITE_DESCRIPTION,
  alternates: {
    types: { 'application/rss+xml': `${SITE_URL}/feed.xml` },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0F0D0A" />
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {/* Article pages put the table-of-contents rail before the article in
              the DOM, so reaching the prose costs about nineteen tabs: five nav
              links plus up to fourteen section links, on every one of 171
              articles. Landmarks and headings already satisfy 2.4.1 for screen
              reader users; neither is available to a sighted keyboard-only
              user, who has no way to jump. This is the only bypass mechanism on
              the page, so it duplicates nothing. */}
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent-gold focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-on-accent"
          >
            Skip to content
          </a>
          <Navbar />
          <main id="main" tabIndex={-1}>{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  )
}
