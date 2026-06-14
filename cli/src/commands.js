import { readFile } from 'node:fs/promises';
import { apiFetch } from './api.js';

export async function deploy(host, token, file, opts = {}) {
  const content = await readFile(file, 'utf8');
  const body = { content };
  if (opts.ttl) body.ttl = opts.ttl;
  if (opts.password) {
    body.visibility = 'password';
    body.password = opts.password;
  } else if (opts.visibility) {
    body.visibility = opts.visibility;
  }
  // Anonymous deploy works without a token; a token claims ownership.
  return apiFetch(host, '/api/deploy', { method: 'POST', token, body });
}

export async function list(host, token) {
  const res = await apiFetch(host, '/api/artifacts', { token });
  return res.artifacts || [];
}

// update / visibility accept either an owner token (PAT/session) or a per-artifact edit token.
export async function update(host, auth, slug, file) {
  const content = await readFile(file, 'utf8');
  return apiFetch(host, `/api/artifacts/${encodeURIComponent(slug)}`, {
    method: 'PATCH', ...auth, body: { content },
  });
}

export async function remove(host, token, slug) {
  return apiFetch(host, `/api/artifacts/${encodeURIComponent(slug)}`, { method: 'DELETE', token });
}

export async function setVisibility(host, auth, slug, visibility, password) {
  const body = { visibility };
  if (visibility === 'password') body.password = password;
  return apiFetch(host, `/api/artifacts/${encodeURIComponent(slug)}`, { method: 'PATCH', ...auth, body });
}
