import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: { environment: 'node', include: ['**/*.test.ts'], setupFiles: ['./vitest.setup.ts'] },
  resolve: { alias: { '@': resolve(__dirname, '.') } },
});
