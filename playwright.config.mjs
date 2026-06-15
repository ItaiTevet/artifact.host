import { defineConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Browser-level e2e in self-host mode (sqlite + local-password). Boots `next start` against
// an ephemeral DB. IMPORTANT: the app must be built with NEXT_PUBLIC_AUTH_PROVIDER=local-password
// (the auth provider is baked into the client bundle) — see `npm run e2e:browser`.
const PORT = 3399;
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e-browser',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  // PW_CHROMIUM_PATH lets a sandbox without the exact pinned browser reuse a pre-installed
  // chromium. Unset in CI, where `playwright install chromium` provides the matching build.
  use: {
    baseURL: BASE,
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: BASE,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      DB_DRIVER: 'sqlite',
      AUTH_PROVIDER: 'local-password',
      NEXT_PUBLIC_AUTH_PROVIDER: 'local-password',
      AUTH_SECRET: randomBytes(24).toString('hex'),
      COOKIE_SECRET: randomBytes(24).toString('hex'),
      SQLITE_PATH: join(tmpdir(), `ah-browser-${randomBytes(4).toString('hex')}.db`),
      APP_BASE_URL: BASE,
    },
  },
});
