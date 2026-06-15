import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTarget } from './harness.mjs';

let T;
const ownedSlugs = []; // cleaned up at the end (matters when running against cloud/prod)

before(async () => { T = await startTarget(); console.log(`\n  e2e mode: ${T.mode} @ ${T.baseUrl}\n`); });
after(async () => {
  if (!T) return;
  for (const slug of ownedSlugs) {
    try { await api(`/api/artifacts/${slug}`, { method: 'DELETE', token: T.ownerToken }); } catch { /* ignore */ }
  }
  await T.cleanup();
});

function api(path, { method = 'GET', token, editToken, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (editToken) headers['x-edit-token'] = editToken;
  return fetch(`${T.baseUrl}${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
const slugOf = (url) => url.split('/a/')[1];

describe('artifact.host e2e (cloud + self-host)', () => {
  test('anonymous deploy → public view → edit-token update', async () => {
    const r = await api('/api/deploy', { method: 'POST', body: { content: '<h1>hi</h1>', ttl: '1h' } });
    assert.equal(r.status, 201);
    const d = await r.json();
    assert.ok(d.url && d.edit_token, 'returns url + edit token');
    assert.equal((await fetch(d.url)).status, 200, 'artifact page renders');

    const slug = slugOf(d.url);
    assert.equal(
      (await api(`/api/artifacts/${slug}`, { method: 'PATCH', editToken: d.edit_token, body: { content: '<h1>v2</h1>' } })).status,
      200, 'correct edit token updates',
    );
    assert.equal(
      (await api(`/api/artifacts/${slug}`, { method: 'PATCH', editToken: 'ah_wrong', body: { content: '<h1>v3</h1>' } })).status,
      403, 'wrong edit token rejected',
    );
  });

  test('owner deploy → appears in list', async () => {
    const d = await (await api('/api/deploy', { method: 'POST', token: T.ownerToken, body: { content: '<h1>owned</h1>', ttl: '1h' } })).json();
    const slug = slugOf(d.url); ownedSlugs.push(slug);
    const list = await api('/api/artifacts', { token: T.ownerToken });
    assert.equal(list.status, 200);
    assert.ok((await list.json()).artifacts.some((a) => a.slug === slug), 'owned artifact is listed');
  });

  test('owner-scoped endpoints reject anonymous callers', async () => {
    assert.equal((await api('/api/artifacts')).status, 401);
    assert.equal((await api('/api/tokens')).status, 401);
  });

  test('personal API token: create → authenticates → revoke', async () => {
    const c = await api('/api/tokens', { method: 'POST', token: T.ownerToken, body: { name: 'e2e' } });
    assert.equal(c.status, 201);
    const { id, token } = await c.json();
    assert.ok(token.startsWith('ah_'), 'token is prefixed');
    assert.equal((await api('/api/artifacts', { token })).status, 200, 'minted PAT authenticates');
    assert.equal((await api(`/api/tokens/${id}`, { method: 'DELETE', token: T.ownerToken })).status, 200);
    assert.equal((await api('/api/artifacts', { token })).status, 401, 'revoked PAT is rejected');
  });

  test('restricted sharing access matrix', async (t) => {
    const d = await (await api('/api/deploy', { method: 'POST', token: T.ownerToken, body: { content: '<h1>secret</h1>', ttl: '1h' } })).json();
    const slug = slugOf(d.url); ownedSlugs.push(slug);
    assert.equal(
      (await api(`/api/artifacts/${slug}`, { method: 'PATCH', token: T.ownerToken, body: { visibility: 'restricted', allowlist: 'alice@allow.test\n@partner.test' } })).status,
      200, 'owner sets restricted + allowlist',
    );
    const content = (token) => api(`/api/artifacts/${slug}/content`, { token });

    assert.equal((await content(T.ownerToken)).status, 200, 'owner can always view');
    assert.equal((await content()).status, 401, 'anonymous is prompted to sign in');

    if (!T.canCreateIdentities) { t.diagnostic('cloud mode: skipping multi-identity allow/deny checks'); return; }
    assert.equal((await content(await T.signupToken('alice@allow.test'))).status, 200, 'allowlisted email');
    assert.equal((await content(await T.signupToken('bob@partner.test'))).status, 200, 'allowlisted domain');
    assert.equal((await content(await T.signupToken('eve@deny.test'))).status, 403, 'not on the list → denied');
  });

  test('password-protected artifact gates the view', async () => {
    const d = await (await api('/api/deploy', { method: 'POST', body: { content: '<h1>pw</h1>', ttl: '1h', visibility: 'password', password: 'open-sesame' } })).json();
    const page = await fetch(d.url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /password/i, 'shows the password gate instead of content');
  });
});
