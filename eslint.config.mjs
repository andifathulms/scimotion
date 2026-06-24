import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // The interactive animation widgets are intentionally imperative: canvas +
  // requestAnimationFrame loops, mutable refs for animation state, and
  // IntersectionObserver scroll-autoplay (plus the next-themes hydration-mount
  // guard in ThemeToggle). The new, aggressive React Compiler rules
  // (set-state-in-effect, refs, immutability) flag these valid patterns, so
  // they are scoped off for the animation layer only — they stay on for the
  // rest of the app, where genuine ref/effect bugs are still caught.
  {
    files: ["components/animations/**/*.tsx", "components/ThemeToggle.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
    },
  },
]);

export default eslintConfig;
