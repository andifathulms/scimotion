/* eslint-disable @typescript-eslint/no-explicit-any */

// remark-math only produces a block `math` node for the fenced form:
//
//   $$
//   E = mc^2
//   $$
//
// The single-line form `$$E = mc^2$$` parses as a paragraph containing one
// `inlineMath` node, so rehype-katex renders it in *inline* mode: cramped
// subscript and limit layout, flush left, no vertical separation from the
// surrounding text. The articles are authored with the single-line form in 135
// files (626 equations), and only the 44 files using the fenced form were
// getting real display math.
//
// This promotes a paragraph whose sole child is inline math to a block `math`
// node, which is what the `$$` delimiter was asking for. A paragraph with any
// other content is left alone, so `$$x$$` used mid-sentence stays inline.
//
// Must run after remarkMath.
//
// The `data` below is not decoration — it is the whole mechanism. remark-math
// does not register a mdast-to-hast handler for `math`; it attaches the target
// hast on the node itself, and rehype-katex keys displayMode off the resulting
// `math-display` class. A `math` node without it converts to nothing and the
// equation renders as literal TeX source. This mirrors, exactly, what
// mdast-util-math emits for the fenced form, so promoted equations produce the
// same markup as the articles already authored that way.
//
// The inline node's own `data` cannot simply be reused: it names `code` /
// `math-inline`, which is precisely what we are trying to get away from.
function blockMath(value: string, position: unknown) {
  return {
    type: 'math',
    value,
    position,
    data: {
      hName: 'pre',
      hChildren: [
        {
          type: 'element',
          tagName: 'code',
          properties: { className: ['language-math', 'math-display'] },
          children: [{ type: 'text', value }],
        },
      ],
    },
  }
}

export function remarkDisplayMath() {
  const visit = (node: any) => {
    if (!Array.isArray(node.children)) return

    node.children = node.children.map((child: any) => {
      if (
        child.type === 'paragraph' &&
        child.children?.length === 1 &&
        child.children[0].type === 'inlineMath'
      ) {
        return blockMath(child.children[0].value, child.position)
      }
      visit(child)
      return child
    })
  }

  return (tree: any) => visit(tree)
}
