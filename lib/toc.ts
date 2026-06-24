export type Heading = { depth: number; text: string; slug: string }

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\$([^$]*)\$/g, '$1') // unwrap inline math
    .replace(/[`*_~]/g, '') // strip markdown tokens
    .replace(/[^a-z0-9\s-]/g, '') // drop other punctuation
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

// Parse h2/h3 headings from raw MDX, skipping fenced code blocks.
export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = []
  let inFence = false
  for (const line of content.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!m) continue
    const raw = m[2]
    const text = raw
      .replace(/\$([^$]*)\$/g, '$1')
      .replace(/[`*_~]/g, '')
      .trim()
    headings.push({ depth: m[1].length, text, slug: slugify(raw) })
  }
  return headings
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Minimal rehype plugin: assign slug ids to headings, matching extractHeadings.
export function rehypeSlugSimple() {
  const toText = (node: any): string => {
    if (node.type === 'text') return node.value
    if (node.children) return node.children.map(toText).join('')
    return ''
  }
  const visit = (node: any) => {
    if (node.type === 'element' && /^h[1-6]$/.test(node.tagName)) {
      node.properties = node.properties || {}
      if (!node.properties.id) node.properties.id = slugify(toText(node))
    }
    if (node.children) node.children.forEach(visit)
  }
  return (tree: any) => visit(tree)
}
