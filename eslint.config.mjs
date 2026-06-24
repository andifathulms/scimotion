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
  // The interactive animation widgets intentionally drive React state from
  // external systems — IntersectionObserver scroll-autoplay, canvas/raf init,
  // and the next-themes hydration-mount guard — which is exactly what effects
  // are for. The (new, aggressive) set-state-in-effect rule flags these valid
  // patterns, so it is scoped off for the animation layer only. It stays on for
  // the rest of the app.
  {
    files: ["components/animations/**/*.tsx", "components/ThemeToggle.tsx"],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
]);

export default eslintConfig;
