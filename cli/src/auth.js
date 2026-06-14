import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { exec } from 'node:child_process';
import { storeToken } from './config.js';

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start ""'
    : 'xdg-open';
  exec(`${cmd} "${url}"`, () => { /* ignore: user can open manually */ });
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
  });
}

/** Store a token supplied directly (CI/headless). `value === true` means read from stdin. */
export async function loginWithToken(host, value) {
  const token = (value === true ? await readStdin() : String(value)).trim();
  if (!token) throw new Error('no token provided');
  await storeToken(host, token);
  return { mode: 'token' };
}

/**
 * Loopback browser login (RFC 8252 native-app pattern, like `vercel login` / `gh auth login`):
 * spin up a temporary 127.0.0.1 listener, open <host>/cli/auth, and capture the minted PAT
 * the page redirects back with. The token only ever travels to loopback.
 */
export async function loginViaBrowser(host, { timeoutMs = 180_000 } = {}) {
  const state = randomBytes(16).toString('hex');

  const token = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
      const ok = u.searchParams.get('state') === state && u.searchParams.get('token');
      res.writeHead(ok ? 200 : 400, { 'content-type': 'text/html' });
      res.end(`<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:3rem">
        <p>${ok ? 'Logged in to artifact.host — you can close this tab and return to the terminal.'
                : 'Login failed (state mismatch). You can close this tab.'}</p></body>`);
      server.close();
      if (ok) resolve(u.searchParams.get('token'));
      else reject(new Error('state mismatch'));
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const url = `${host}/cli/auth?port=${port}&state=${state}`;
      process.stdout.write(`Opening your browser to sign in…\n  ${url}\n`);
      openBrowser(url);
    });

    setTimeout(() => { server.close(); reject(new Error('login timed out after 3 min')); }, timeoutMs);
  });

  await storeToken(host, token);
  return { mode: 'browser' };
}
