import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// Dual-mode E2E target:
//   - cloud:     set E2E_BASE_URL + ARTIFACT_HOST_TOKEN (a Personal API Token). Hits a real
//                instance; owner flows use the PAT; multi-identity checks are skipped.
//   - self-host: default. Boots `next start` with sqlite + local-password against an ephemeral
//                DB, signs up an owner, and can mint extra identities for the sharing matrix.

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function waitForReady(baseUrl, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if ((await fetch(`${baseUrl}/`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server at ${baseUrl} did not become ready in ${timeoutMs}ms`);
}

async function signup(baseUrl, email) {
  const r = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'e2e-password-123' }),
  });
  if (!r.ok) throw new Error(`signup(${email}) failed: ${r.status} ${await r.text()}`);
  return (await r.json()).token;
}

export async function startTarget() {
  const cloudUrl = process.env.E2E_BASE_URL;
  if (cloudUrl) {
    const ownerToken = process.env.ARTIFACT_HOST_TOKEN;
    if (!ownerToken) throw new Error('cloud mode requires ARTIFACT_HOST_TOKEN (a Personal API Token)');
    return {
      mode: 'cloud',
      baseUrl: cloudUrl.replace(/\/$/, ''),
      ownerToken,
      canCreateIdentities: false,
      signupToken: async () => { throw new Error('cannot create identities in cloud mode'); },
      cleanup: async () => {},
    };
  }

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dir = mkdtempSync(join(tmpdir(), 'ah-e2e-'));
  const proc = spawn('npx', ['next', 'start', '-p', String(port)], {
    stdio: 'ignore',
    env: {
      ...process.env,
      DB_DRIVER: 'sqlite',
      AUTH_PROVIDER: 'local-password',
      NEXT_PUBLIC_AUTH_PROVIDER: 'local-password',
      AUTH_SECRET: randomBytes(24).toString('hex'),
      COOKIE_SECRET: randomBytes(24).toString('hex'),
      SQLITE_PATH: join(dir, 'e2e.db'),
      APP_BASE_URL: baseUrl,
      PORT: String(port),
      DISABLE_SIGNUP: '',
    },
  });

  await waitForReady(baseUrl);
  const ownerToken = await signup(baseUrl, `owner-${randomBytes(4).toString('hex')}@e2e.test`);

  return {
    mode: 'self-host',
    baseUrl,
    ownerToken,
    canCreateIdentities: true,
    signupToken: (email) => signup(baseUrl, email),
    cleanup: async () => {
      proc.kill('SIGTERM');
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    },
  };
}
