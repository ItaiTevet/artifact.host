# Comments & Annotations — Phase 2: REST API + CLI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the Phase 1 comment foundation over HTTP (comment CRUD endpoints + an owner toggle to enable comments) and a CLI `comments <slug>` command, validated by the e2e-HTTP harness.

**Architecture:** Thin Next.js route handlers that resolve identity via the existing `viewerFromRequest` + the password cookie, then delegate to the Phase 1 `comment-service` (all authz lives there); errors map through the existing `errorResponse`. The CLI wraps the new endpoint with the existing `apiFetch` pattern.

**Tech Stack:** Next.js 16 route handlers, the Phase 1 `comment-service`/`CommentRepository`, Vitest (logic), the Node-test e2e harness (`e2e/`).

**Spec:** `docs/superpowers/specs/2026-06-26-comments-annotations-design.md` (§5 API, §6 CLI). **Builds on Phase 1** (`docs/superpowers/plans/2026-06-26-comments-phase-1-foundation.md`, merged on branch `claude/batch-b-comments`).

**Conventions:**
- `@/` = repo root. `npm test` (Vitest, logic). `npm run build && npm run e2e` (hermetic self-host HTTP e2e). Type-check `npx tsc --noEmit` (ignore the 2 pre-existing `components/home/DeployPanel.test.tsx` errors).
- Route handlers follow the existing pattern: `try { … } catch (err) { return errorResponse(err); }`. `errorResponse` already maps `comments_disabled`→403, `comment_too_large`→413, `invalid_comment`→400, `forbidden`→403, `not_found`→404, `unauthorized`→401.
- Commit after each task; multiple `-m` flags (no PowerShell here-strings).
- **Docs (README/`/docs`) updates are deferred to Phase 3** (document the whole feature once the UI ships).

**Key Phase 1 surfaces this consumes:**
- `comment-service.ts`: `listComments(artifacts, comments, slug, ctx)`, `createComment(artifacts, comments, slug, {body,anchor}, ctx)`, `editCommentBody(…, id, body, ctx)`, `resolveComment(…, id, resolved, ctx)`, `deleteComment(…, id, ctx)`. `ctx: { viewer: Viewer | null; passwordVerified: boolean }` (the `ReadContext`).
- `getCommentRepository()` + `getArtifactRepository()` from `lib/db/factory`.
- `viewerFromRequest(req)` from `lib/http/request-auth` (session w/ email OR PAT→owner).
- `verifyPasswordCookie(slug, value)` + `cookieName(slug)` from `lib/http/cookies`.
- `Anchor`, `CommentRecord` from `lib/artifacts/comment-types`.

---

## Task 1: Widen the password cookie path so the comment API can read it

The password cookie is set with `path: /a/<slug>`, so the browser never sends it to `/api/...`. Comment endpoints need `passwordVerified` for password-protected artifacts; widen the path to `/`. The cookie name is already per-slug (`pw_<slug>`) and it stays `httpOnly`/`secure`/`sameSite:lax`, so this only changes *where it is sent*, not its security.

**Files:**
- Modify: `app/a/[slug]/password/route.ts`

- [ ] **Step 1: Change the cookie path**

In `app/a/[slug]/password/route.ts`, change the `jar.set(...)` options `path` from `` `/a/${slug}` `` to `'/'`:

```ts
  jar.set(cookieName(slug), signPasswordCookie(slug), {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 1800,
  });
```

- [ ] **Step 2: Verify nothing assumed the narrower path**

Run: `npm test` — all green. If a test asserts the cookie path is `/a/<slug>`, update it to `/` (the cookie is still slug-scoped by name; the viewer page reads it via `cookies()` regardless of path). Report any such test.

- [ ] **Step 3: Commit**

```bash
git add app/a/[slug]/password/route.ts
git commit -m "Password cookie: widen path to / so the comment API receives it" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Owner toggle to enable/disable comments (service + artifact PATCH)

There's no write path for `comments_enabled` yet. Add an owner-only service function (commenting requires an *owned* artifact, so this rejects edit-token-only/anonymous callers), and wire it into the existing artifact `PATCH`.

**Files:**
- Modify: `lib/artifacts/service.ts` (add `setArtifactCommentsEnabled`)
- Modify: `app/api/artifacts/[slug]/route.ts` (handle `comments_enabled` in PATCH)
- Test: `lib/artifacts/__tests__/comments-enabled-service.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/artifacts/__tests__/comments-enabled-service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';
import { setArtifactCommentsEnabled } from '@/lib/artifacts/service';

async function seed(ownerId: string | null) {
  const repo = new InMemoryRepository();
  await repo.insert({
    slug: 's1', content: '<p>x</p>', title: null, visibility: 'public',
    passwordHash: null, ownerId, editTokenHash: 'eth', deployIpHash: null,
    expiresAt: new Date(Date.now() + 60_000),
  });
  return repo;
}

describe('setArtifactCommentsEnabled', () => {
  it('owner can toggle comments on their artifact', async () => {
    const repo = await seed('owner-1');
    await setArtifactCommentsEnabled(repo, 's1', true, { ownerId: 'owner-1' });
    expect((await repo.findBySlug('s1'))!.commentsEnabled).toBe(true);
    await setArtifactCommentsEnabled(repo, 's1', false, { ownerId: 'owner-1' });
    expect((await repo.findBySlug('s1'))!.commentsEnabled).toBe(false);
  });

  it('rejects a non-owner', async () => {
    const repo = await seed('owner-1');
    await expect(setArtifactCommentsEnabled(repo, 's1', true, { ownerId: 'someone-else' }))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('rejects edit-token-only / anonymous (commenting needs an owned artifact)', async () => {
    const repo = await seed(null);
    await expect(setArtifactCommentsEnabled(repo, 's1', true, { editToken: 'eth' }))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('not_found for a missing slug', async () => {
    const repo = await seed('owner-1');
    await expect(setArtifactCommentsEnabled(repo, 'nope', true, { ownerId: 'owner-1' }))
      .rejects.toMatchObject({ code: 'not_found' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- comments-enabled-service`
Expected: FAIL — `setArtifactCommentsEnabled` not exported.

- [ ] **Step 3: Add the service function**

In `lib/artifacts/service.ts`, add after `setVisibility` (it uses the existing `ServiceError`, `ArtifactRepository`, `AuthContext` already imported in this file):

```ts
/** Owner-only toggle for the per-artifact comments master switch. Commenting requires an
 *  owned artifact (so an agent/owner can manage comments), so edit-token-only callers are denied. */
export async function setArtifactCommentsEnabled(
  repo: ArtifactRepository,
  slug: string,
  enabled: boolean,
  auth: AuthContext,
): Promise<{ ok: true }> {
  const record = await repo.findBySlug(slug);
  if (!record) throw new ServiceError('not_found', 'Artifact not found');
  if (!auth.ownerId || record.ownerId !== auth.ownerId) {
    throw new ServiceError('forbidden', 'Only the owner can change comment settings');
  }
  await repo.setCommentsEnabled(slug, enabled);
  return { ok: true };
}
```

- [ ] **Step 4: Wire it into the artifact PATCH**

In `app/api/artifacts/[slug]/route.ts`:

Add `setArtifactCommentsEnabled` to the import from `@/lib/artifacts/service`:

```ts
import { updateArtifact, setVisibility, getOwnArtifact, deleteArtifact, setArtifactCommentsEnabled } from '@/lib/artifacts/service';
```

Add `comments_enabled?: boolean;` to the `PatchBody` interface.

In `PATCH`, add this branch BEFORE the `visibility` branch (so a body can carry just `{ comments_enabled }`):

```ts
    if (typeof body?.comments_enabled === 'boolean') {
      await setArtifactCommentsEnabled(repo, slug, body.comments_enabled, auth);
      return Response.json({ ok: true });
    }
```

(The existing `auth = { ownerId, editToken }` is already built above; `setArtifactCommentsEnabled` ignores the edit token and requires `ownerId`.)

- [ ] **Step 5: Run tests + type-check + commit**

Run: `npm test -- comments-enabled-service` → PASS (4). `npm test` → green. `npx tsc --noEmit` → clean.

```bash
git add lib/artifacts/service.ts app/api/artifacts/[slug]/route.ts lib/artifacts/__tests__/comments-enabled-service.test.ts
git commit -m "Comments: owner-only enable/disable toggle (service + artifact PATCH)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Anchor coercion + comment JSON helpers

The HTTP boundary receives an untrusted `anchor`; coerce/validate it to a real `Anchor` (reject malformed). Also one shared JSON serializer for a `CommentRecord` (used by both route files).

**Files:**
- Modify: `lib/artifacts/comment-types.ts` (add `coerceAnchor`)
- Create: `lib/http/comment-json.ts` (`commentToJson`)
- Test: `lib/artifacts/__tests__/coerce-anchor.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/artifacts/__tests__/coerce-anchor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { coerceAnchor } from '@/lib/artifacts/comment-types';

describe('coerceAnchor', () => {
  it('accepts a pin', () => {
    expect(coerceAnchor({ kind: 'pin', x: 0.5, y: 0.25 })).toEqual({ kind: 'pin', x: 0.5, y: 0.25 });
  });
  it('accepts a highlight and coerces quote to string', () => {
    expect(coerceAnchor({ kind: 'highlight', x: 0.1, y: 0.2, quote: 'hi' })).toEqual({ kind: 'highlight', x: 0.1, y: 0.2, quote: 'hi' });
    expect(coerceAnchor({ kind: 'highlight', x: 0, y: 0 })).toEqual({ kind: 'highlight', x: 0, y: 0, quote: '' });
  });
  it('drops extra fields (keeps only the known shape)', () => {
    expect(coerceAnchor({ kind: 'pin', x: 0.5, y: 0.5, evil: 'x' })).toEqual({ kind: 'pin', x: 0.5, y: 0.5 });
  });
  it('rejects malformed anchors → null', () => {
    expect(coerceAnchor(null)).toBeNull();
    expect(coerceAnchor('pin')).toBeNull();
    expect(coerceAnchor({ kind: 'circle', x: 0, y: 0 })).toBeNull();
    expect(coerceAnchor({ kind: 'pin', x: 'a', y: 0 })).toBeNull();
    expect(coerceAnchor({ kind: 'pin', x: Infinity, y: 0 })).toBeNull();
    expect(coerceAnchor({ kind: 'pin' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- coerce-anchor`
Expected: FAIL — `coerceAnchor` not exported.

- [ ] **Step 3: Implement `coerceAnchor`**

In `lib/artifacts/comment-types.ts`, append:

```ts
/** Validate/normalize an untrusted anchor (from an HTTP body) into a real Anchor, or null. */
export function coerceAnchor(raw: unknown): Anchor | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.x !== 'number' || typeof v.y !== 'number' || !Number.isFinite(v.x) || !Number.isFinite(v.y)) return null;
  if (v.kind === 'pin') return { kind: 'pin', x: v.x, y: v.y };
  if (v.kind === 'highlight') return { kind: 'highlight', x: v.x, y: v.y, quote: String(v.quote ?? '') };
  return null;
}
```

- [ ] **Step 4: Implement `commentToJson`**

Create `lib/http/comment-json.ts`:

```ts
import type { CommentRecord } from '@/lib/artifacts/comment-types';

/** Snake_case wire shape for a comment (matches the rest of the REST API's casing). */
export function commentToJson(c: CommentRecord) {
  return {
    id: c.id,
    body: c.body,
    anchor: c.anchor,
    author_id: c.authorId,
    author_email: c.authorEmail,
    resolved: c.resolved,
    created_at: c.createdAt.toISOString(),
  };
}
```

- [ ] **Step 5: Run tests + type-check + commit**

Run: `npm test -- coerce-anchor` → PASS (4). `npx tsc --noEmit` → clean.

```bash
git add lib/artifacts/comment-types.ts lib/http/comment-json.ts lib/artifacts/__tests__/coerce-anchor.test.ts
git commit -m "Comments: anchor coercion + comment JSON serializer" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Comments collection route (GET list + POST create)

**Files:**
- Create: `app/api/artifacts/[slug]/comments/route.ts`

- [ ] **Step 1: Implement the route**

Create `app/api/artifacts/[slug]/comments/route.ts`:

```ts
import { cookies } from 'next/headers';
import { getArtifactRepository, getCommentRepository } from '@/lib/db/factory';
import { listComments, createComment } from '@/lib/artifacts/comment-service';
import { viewerFromRequest } from '@/lib/http/request-auth';
import { cookieName, verifyPasswordCookie } from '@/lib/http/cookies';
import { errorResponse } from '@/lib/http/errors';
import { readLimitedJson } from '@/lib/http/body';
import { REQUEST_MAX_BYTES } from '@/lib/artifacts/validate';
import { ServiceError } from '@/lib/artifacts/errors';
import { coerceAnchor } from '@/lib/artifacts/comment-types';
import { commentToJson } from '@/lib/http/comment-json';

export const runtime = 'nodejs';

async function readContext(req: Request, slug: string) {
  const viewer = await viewerFromRequest(req);
  const jar = await cookies();
  const passwordVerified = verifyPasswordCookie(slug, jar.get(cookieName(slug))?.value);
  return { viewer, passwordVerified };
}

// List comments — anyone who can VIEW the artifact (public → even anonymous). The agent-facing
// collaboration surface: full structured anchors included.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const ctx = await readContext(req, slug);
    const artifacts = await getArtifactRepository();
    const comments = await getCommentRepository();
    const list = await listComments(artifacts, comments, slug, ctx);
    return Response.json({ comments: list.map(commentToJson) });
  } catch (err) {
    return errorResponse(err);
  }
}

// Create a comment — signed-in + post permission (enforced in the service).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = await readLimitedJson<{ body?: unknown; anchor?: unknown }>(req, REQUEST_MAX_BYTES);
    if (typeof body?.body !== 'string') throw new ServiceError('invalid_comment', 'A comment body is required');
    const anchor = coerceAnchor(body?.anchor);
    if (!anchor) throw new ServiceError('invalid_comment', 'A valid anchor is required');
    const ctx = await readContext(req, slug);
    const artifacts = await getArtifactRepository();
    const comments = await getCommentRepository();
    const created = await createComment(artifacts, comments, slug, { body: body.body, anchor }, ctx);
    return Response.json({ comment: commentToJson(created) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 2: Type-check + build (route is exercised by the e2e in Task 7)**

Run: `npx tsc --noEmit` → clean. Run: `npm run build` → succeeds and `/api/artifacts/[slug]/comments` appears in the route table.

- [ ] **Step 3: Commit**

```bash
git add app/api/artifacts/[slug]/comments/route.ts
git commit -m "Comments: GET (list) + POST (create) collection route" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Comment item route (PATCH edit/resolve + DELETE)

**Files:**
- Create: `app/api/artifacts/[slug]/comments/[id]/route.ts`

- [ ] **Step 1: Implement the route**

Create `app/api/artifacts/[slug]/comments/[id]/route.ts`:

```ts
import { cookies } from 'next/headers';
import { getArtifactRepository, getCommentRepository } from '@/lib/db/factory';
import { editCommentBody, resolveComment, deleteComment } from '@/lib/artifacts/comment-service';
import { viewerFromRequest } from '@/lib/http/request-auth';
import { cookieName, verifyPasswordCookie } from '@/lib/http/cookies';
import { errorResponse } from '@/lib/http/errors';
import { readLimitedJson } from '@/lib/http/body';
import { REQUEST_MAX_BYTES } from '@/lib/artifacts/validate';
import { commentToJson } from '@/lib/http/comment-json';

export const runtime = 'nodejs';

async function readContext(req: Request, slug: string) {
  const viewer = await viewerFromRequest(req);
  const jar = await cookies();
  const passwordVerified = verifyPasswordCookie(slug, jar.get(cookieName(slug))?.value);
  return { viewer, passwordVerified };
}

// Edit body (author only) or resolve/unresolve (owner or comment-access) — chosen by the body.
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const { slug, id } = await params;
    const body = await readLimitedJson<{ body?: unknown; resolved?: unknown }>(req, REQUEST_MAX_BYTES);
    const ctx = await readContext(req, slug);
    const artifacts = await getArtifactRepository();
    const comments = await getCommentRepository();
    if (typeof body?.resolved === 'boolean') {
      const c = await resolveComment(artifacts, comments, slug, id, body.resolved, ctx);
      return Response.json({ comment: commentToJson(c) });
    }
    if (typeof body?.body === 'string') {
      const c = await editCommentBody(artifacts, comments, slug, id, body.body, ctx);
      return Response.json({ comment: commentToJson(c) });
    }
    return Response.json({ error: 'invalid_comment', message: 'Provide body or resolved' }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}

// Delete (author or owner).
export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const { slug, id } = await params;
    const ctx = await readContext(req, slug);
    const artifacts = await getArtifactRepository();
    const comments = await getCommentRepository();
    await deleteComment(artifacts, comments, slug, id, ctx);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit` → clean. `npm run build` → succeeds; `/api/artifacts/[slug]/comments/[id]` in the route table.

- [ ] **Step 3: Commit**

```bash
git add "app/api/artifacts/[slug]/comments/[id]/route.ts"
git commit -m "Comments: PATCH (edit/resolve) + DELETE item route" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: CLI `comments <slug>` command

Lists comments for an owned artifact (owner token or PAT). Human table by default; `--json` for agents.

**Files:**
- Modify: `cli/src/commands.js` (add `comments`)
- Modify: `cli/src/cli.js` (import + `case 'comments'` + HELP)

- [ ] **Step 1: Add the command function**

In `cli/src/commands.js`, append:

```js
export async function comments(host, token, slug) {
  const res = await apiFetch(host, `/api/artifacts/${encodeURIComponent(slug)}/comments`, { token });
  return res.comments || [];
}
```

- [ ] **Step 2: Wire it into the CLI**

In `cli/src/cli.js`:

Add `comments` to the import from `./commands.js`:

```js
import { deploy, list, update, remove, setVisibility, comments } from './commands.js';
```

Add a `case` (e.g. after `case 'list'`):

```js
    case 'comments': {
      const slug = rest[0];
      if (!slug) throw new Error('usage: artifact comments <slug> [--json]');
      const { host, token } = await ctx(flags);
      const items = await comments(host, requireToken(token), slug);
      if (flags.json) { process.stdout.write(`${JSON.stringify(items, null, 2)}\n`); return; }
      if (!items.length) { process.stdout.write('No comments.\n'); return; }
      for (const c of items) {
        const who = c.author_email || c.author_id;
        const status = c.resolved ? 'resolved' : 'open';
        const where = c.anchor?.kind === 'highlight'
          ? `"${String(c.anchor.quote || '').slice(0, 30)}"`
          : `@${Math.round((c.anchor?.x ?? 0) * 100)}%,${Math.round((c.anchor?.y ?? 0) * 100)}%`;
        process.stdout.write(`[${status}]\t${who}\t${where}\t${String(c.body).replace(/\s+/g, ' ')}\n`);
      }
      return;
    }
```

Add a line to the `HELP` string under the command list:

```
  artifact comments <slug> [--json]                 List comments on an artifact (requires auth)
```

- [ ] **Step 3: Smoke-check the CLI parses (no network)**

Run: `node cli/bin/artifact.js --help`
Expected: HELP prints including the new `comments` line. (Full behavior is covered by the e2e in Task 7.)

- [ ] **Step 4: Commit**

```bash
git add cli/src/commands.js cli/src/cli.js
git commit -m "CLI: add 'comments <slug>' command (--json for agents)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: End-to-end HTTP flows (comments lifecycle + permissions)

Add comment coverage to the existing hermetic e2e (`e2e/flows.test.mjs`). It boots self-host (sqlite + local-password), so it can mint identities for the role matrix. Validates the real routes end-to-end (the routes have no unit tests by design).

**Files:**
- Modify: `e2e/flows.test.mjs`

- [ ] **Step 1: Add the comment flow tests**

In `e2e/flows.test.mjs`, add these tests inside the existing `describe('artifact.host e2e (cloud + self-host)', () => { … })` block (after the last test). They reuse the file's `api`, `slugOf`, `T`, and `ownedSlugs`:

```ts
  test('comments: disabled by default → enable → post → list → edit → resolve → delete', async () => {
    const d = await (await api('/api/deploy', { method: 'POST', token: T.ownerToken, body: { content: '<h1>c</h1>', ttl: '1h' } })).json();
    const slug = slugOf(d.url); ownedSlugs.push(slug);
    const pin = { kind: 'pin', x: 0.5, y: 0.5 };

    // disabled by default
    assert.equal(
      (await api(`/api/artifacts/${slug}/comments`, { method: 'POST', token: T.ownerToken, body: { body: 'hi', anchor: pin } })).status,
      403, 'commenting is off until enabled',
    );
    // owner enables
    assert.equal(
      (await api(`/api/artifacts/${slug}`, { method: 'PATCH', token: T.ownerToken, body: { comments_enabled: true } })).status,
      200, 'owner enables comments',
    );
    // owner posts
    const created = await api(`/api/artifacts/${slug}/comments`, { method: 'POST', token: T.ownerToken, body: { body: 'first', anchor: pin } });
    assert.equal(created.status, 201);
    const c = (await created.json()).comment;
    assert.ok(c.id && c.created_at, 'returns the created comment');
    assert.deepEqual(c.anchor, pin, 'anchor round-trips');

    // anyone who can view can list (public → anonymous OK)
    const listed = await (await api(`/api/artifacts/${slug}/comments`)).json();
    assert.ok(listed.comments.some((x) => x.id === c.id), 'comment is listed');

    // edit (author = owner) + resolve + delete
    assert.equal((await api(`/api/artifacts/${slug}/comments/${c.id}`, { method: 'PATCH', token: T.ownerToken, body: { body: 'edited' } })).status, 200);
    assert.equal((await api(`/api/artifacts/${slug}/comments/${c.id}`, { method: 'PATCH', token: T.ownerToken, body: { resolved: true } })).status, 200);
    assert.equal((await api(`/api/artifacts/${slug}/comments/${c.id}`, { method: 'DELETE', token: T.ownerToken })).status, 200);
    assert.equal((await (await api(`/api/artifacts/${slug}/comments`)).json()).comments.length, 0, 'deleted');

    // anonymous cannot post
    assert.equal(
      (await api(`/api/artifacts/${slug}/comments`, { method: 'POST', body: { body: 'anon', anchor: pin } })).status,
      403, 'anonymous cannot post',
    );
    // malformed anchor → 400
    assert.equal(
      (await api(`/api/artifacts/${slug}/comments`, { method: 'POST', token: T.ownerToken, body: { body: 'x', anchor: { kind: 'circle' } } })).status,
      400, 'malformed anchor rejected',
    );
  });

  test('comments: restricted view-role cannot post, comment-role can', async (t) => {
    if (!T.canCreateIdentities) { t.diagnostic('cloud mode: skipping multi-identity comment-role checks'); return; }
    const d = await (await api('/api/deploy', { method: 'POST', token: T.ownerToken, body: { content: '<h1>r</h1>', ttl: '1h' } })).json();
    const slug = slugOf(d.url); ownedSlugs.push(slug);
    const pin = { kind: 'pin', x: 0.1, y: 0.1 };

    // restricted with per-person roles (array form preserves role), and comments on
    assert.equal((await api(`/api/artifacts/${slug}`, { method: 'PATCH', token: T.ownerToken, body: {
      visibility: 'restricted',
      allowlist: [
        { value: 'commenter@allow.test', type: 'email', role: 'comment' },
        { value: 'viewer@allow.test', type: 'email', role: 'view' },
      ],
    } })).status, 200);
    assert.equal((await api(`/api/artifacts/${slug}`, { method: 'PATCH', token: T.ownerToken, body: { comments_enabled: true } })).status, 200);

    const commenter = await T.signupToken('commenter@allow.test');
    const viewer = await T.signupToken('viewer@allow.test');

    assert.equal(
      (await api(`/api/artifacts/${slug}/comments`, { method: 'POST', token: commenter, body: { body: 'ok', anchor: pin } })).status,
      201, 'comment-role can post',
    );
    assert.equal(
      (await api(`/api/artifacts/${slug}/comments`, { method: 'POST', token: viewer, body: { body: 'no', anchor: pin } })).status,
      403, 'view-role cannot post',
    );
    // both can read
    assert.equal((await api(`/api/artifacts/${slug}/comments`, { token: viewer })).status, 200, 'view-role can read comments');
  });
```

- [ ] **Step 2: Run the full e2e**

Run: `npm run build && npm run e2e`
Expected: all e2e tests pass, including the two new comment tests (self-host mode mints the identities).

- [ ] **Step 3: Commit**

```bash
git add e2e/flows.test.mjs
git commit -m "e2e: comment lifecycle + role-permission flows" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (Phase 2)

- [ ] `npm test` — all green (new: `comments-enabled-service`, `coerce-anchor`).
- [ ] `npx tsc --noEmit` — no new errors (2 pre-existing DeployPanel.test.tsx remain).
- [ ] `npm run build` — succeeds; the two new comment routes appear in the route table.
- [ ] `npm run build && npm run e2e` — all flows pass incl. the comment lifecycle + role matrix.

## Spec coverage (Phase 2 scope)

- §5 `GET/POST …/comments` → Task 4. ✅
- §5 `PATCH/DELETE …/comments/[id]` → Task 5. ✅
- §5 reuse `viewerFromRequest`; comments-disabled → 404/403 (service throws `comments_disabled` → 403) → Tasks 4/5. ✅
- Owner enable/disable toggle (needed by the UI + e2e) → Task 2. ✅
- Anchor validation at the boundary → Task 3. ✅
- Password-artifact comment support (cookie reaches the API) → Task 1. ✅
- §6 CLI `comments <slug>` (+ `--json`) → Task 6. ✅
- e2e lifecycle + permission matrix → Task 7. ✅
- **Deferred to Phase 3:** UI (toggle control, ShareRoleEditor, injected runtime, sidebar), docs (README/`/docs`), the canRead-expiry hardening, cross-driver not-found error normalization. The migration 0006 still needs applying to live Supabase before deploy.
