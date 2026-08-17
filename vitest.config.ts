import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./lib/__tests__/setup.ts'],
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    exclude: [
      '**/node_modules/**',
      '**/.claude/**',
      '**/.worktrees/**',
      // `*.db.test.ts` needs a live PostgreSQL. Run inside the main suite they
      // open network connections alongside ~270 other files and intermittently
      // time out, which makes `pnpm test` fail for reasons that have nothing to
      // do with the code. Kept out by default so the suite is deterministic and
      // works offline; `pnpm test:db` runs them deliberately.
      ...(process.env.RUN_DB_TESTS ? [] : ['**/*.db.test.ts']),
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
