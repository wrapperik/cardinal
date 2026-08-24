import path from "node:path";

import { configDefaults, defineConfig } from "vitest/config";

/**
 * Vitest has no bundler step of its own, so unlike Metro/tsc it never reads
 * tsconfig.json's `paths` — every `@/...` value import silently 404s unless
 * something tells Vite's resolver the same two aliases by hand. Kept in
 * lockstep with tsconfig.json's `paths` block on purpose: the two are meant
 * to describe the same mapping to two different tools, not drift into their
 * own conventions.
 *
 * The `@/assets/` alias has to be listed before the bare `@/` one — Vite
 * tries `resolve.alias` entries in order and stops at the first match, so a
 * broader `@/` pattern listed first would swallow every `@/assets/...`
 * import and resolve it under src/ instead of assets/.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: "@/assets", replacement: path.resolve(import.meta.dirname, "assets") },
      { find: "@", replacement: path.resolve(import.meta.dirname, "src") },
    ],
  },
  test: {
    // Hidden tool directories can contain isolated worktrees with their own
    // copies of every test file. Keep those copies out of this suite.
    exclude: [...configDefaults.exclude, "**/.*/worktrees/**"],
  },
});
