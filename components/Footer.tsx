import { MakerSignature } from './MakerSignature'

// The site's global footer. There is no legal/data attribution yet, so its only
// occupant is the maker's mark. If one is ever added, it belongs on the same
// bottom bar as the left-hand item — keep the maker's mark opposite it rather
// than adding a second divider.
export function Footer() {
  return (
    <footer className="border-t border-border mt-24">
      <div className="max-w-[1100px] mx-auto px-5 py-8">
        <MakerSignature />
      </div>
    </footer>
  )
}
