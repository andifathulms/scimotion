// KaTeX's stylesheet is imported here rather than in globals.css so it is only
// requested by routes that actually contain maths.
//
// It was 23.8 KB of the 79.9 KB global stylesheet — 17.9 KB of `.katex` rules
// plus 5.9 KB of @font-face — and it was shipping to the homepage, /tags,
// /search and /topics, none of which render a single equation. Article pages
// are the only ones that do.
//
// The font FILES were never the problem: a browser only fetches a face it needs
// to paint, so the homepage was downloading none of them. This is purely the
// stylesheet bytes.
//
// KaTeX's JavaScript is correctly absent from the client bundle either way —
// rehype-katex typesets at build time — so nothing here affects how maths
// renders, only which routes pay to describe it.
import 'katex/dist/katex.min.css'

export default function ArticleLayout({ children }: { children: React.ReactNode }) {
  return children
}
