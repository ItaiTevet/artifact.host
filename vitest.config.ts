import { defineConfig, configDefaults } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    // Don't pick up tests from sibling git worktrees under .claude/worktrees — their `@` alias
    // resolves to THIS project's source, so they'd run other branches' stale tests against our code.
    exclude: [...configDefaults.exclude, '**/.claude/**'],
    setupFiles: ['./vitest.setup.ts'],
    // jsdom (used by component tests via the per-file `@vitest-environment jsdom`
    // pragma) pulls in ESM-only transitive deps (@csstools/css-calc). Node 22.11
    // can't `require()` those from Vite's CJS build, so enable require(ESM) in the
    // worker. Remove once Node ≥ 22.12 (require(esm) on by default) is the floor.
    pool: 'forks',
    poolOptions: { forks: { execArgv: ['--experimental-require-module'] } },
  },
  resolve: { alias: { '@': resolve(__dirname, '.') } },
});
