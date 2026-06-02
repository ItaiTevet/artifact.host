# Authenticated Web Dashboard (Plan 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user list, edit, re-visibility, and delete their own artifacts from the browser, reusing the existing Supabase Auth foundation and service layer.

**Architecture:** Login uses the existing browser Supabase client (factored into one singleton). The dashboard sends `session.access_token` as a Bearer to new authed API routes; each route verifies the token with a shared `verifySupabaseToken` (extracted from the MCP auth path) and calls the existing service layer with `{ ownerId }`. Ownership is enforced server-side in the service. No new dependencies, no RLS.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, `@supabase/supabase-js` (already a dep), `jose` (already a dep), Vitest 3 + `@testing-library/react` + jsdom.

**Spec:** `docs/superpowers/specs/2026-06-02-web-ui-dashboard-design.md`

**Branch:** Do all work on a feature branch (e.g. `feat/web-ui-dashboard`), not `main`.

**Conventions to follow (already in the repo):**
- Pure logic in `lib/`, thin route handlers, presentational + island components in `components/`.
- Server errors are thrown as `ServiceError(code, message)` and mapped by `errorResponse` (`lib/http/errors.ts`). Codes already include `unauthorized` (401), `forbidden` (403), `not_found` (404), `too_large` (413).
- Component tests use the per-file pragma `// @vitest-environment jsdom` and `@testing-library/react`; mock modules with `vi.mock(...)` and `fetch` with `vi.stubGlobal('fetch', ...)`.
- Run a single test file: `npx vitest run <path>`. Run all: `npm test`. Type-check: `npx tsc --noEmit`. Build: `npx next build`.

---

## File Structure

**Create:**
- `lib/auth/supabase-token.ts` — shared Supabase JWT verification (claims + userId).
- `lib/auth/__tests__/supabase-token.test.ts` — unit tests for the verifier.
- `lib/http/request-auth.ts` — `ownerIdFromRequest` / `requireOwner` for route handlers.
- `lib/http/__tests__/request-auth.test.ts` — unit tests.
- `lib/web/supabase-browser.ts` — singleton browser client + `getAccessToken`/`signIn`/`signOut`/`getAccountEmail`.
- `lib/web/dashboard.ts` — pure helpers (`ArtifactListItem` type, `validateEditInput`, `editErrorMessage`).
- `lib/web/__tests__/dashboard.test.ts` — unit tests for the pure helpers.
- `app/api/artifacts/route.ts` — `GET` list (authed).
- `app/dashboard/page.tsx` — list page shell.
- `app/dashboard/dashboard.module.css` — list + shell styles.
- `app/dashboard/[slug]/page.tsx` — edit page shell.
- `app/dashboard/[slug]/edit.module.css` — editor styles.
- `components/dashboard/SignInGate.tsx` (+ `.module.css`) — Google/GitHub sign-in.
- `components/dashboard/AccountMenu.tsx` (+ `.module.css`) — header auth island.
- `components/dashboard/ArtifactRow.tsx` — one ledger row + delete affordance.
- `components/dashboard/DeleteConfirm.tsx` — confirm dialog.
- `components/dashboard/DashboardClient.tsx` — gate + fetch list + render.
- `components/dashboard/EditClient.tsx` — load content, edit, save, delete.
- Test files colocated for each component (`*.test.tsx`).

**Modify:**
- `lib/mcp/auth.ts` — build `AuthInfo` on top of the shared verifier (no behavior change).
- `lib/artifacts/types.ts` — add `ArtifactSummary`.
- `lib/artifacts/repository.ts` — add `listByOwner`, `deleteOwned`.
- `lib/db/artifact-repository.ts` — implement `listByOwner`, `deleteOwned`.
- `lib/artifacts/__tests__/in-memory-repository.ts` — implement `listByOwner`, `deleteOwned`.
- `lib/artifacts/service.ts` — add `listOwnArtifacts`, `getOwnArtifact`, `deleteArtifact`.
- `app/api/artifacts/[slug]/route.ts` — add Bearer/owner path to `PATCH`; add `GET` (editor) and `DELETE`.
- `components/site/Header.tsx` — replace inert `dashboard`/`sign in` placeholders with `<AccountMenu/>`.
- `lib/db/__tests__/artifact-repository.integration.test.ts` — cover `listByOwner`, `deleteOwned`.
- `docs/superpowers/HANDOFF.md` + memory — record completion.

---

## Task 1: Shared Supabase JWT verifier

**Files:**
- Create: `lib/auth/supabase-token.ts`
- Create: `lib/auth/__tests__/supabase-token.test.ts`
- Modify: `lib/mcp/auth.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/auth/__tests__/supabase-token.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JWTVerifyGetKey } from 'jose';
import { makeSupabaseJwtVerifier, makeVerifySupabaseToken } from '@/lib/auth/supabase-token';

const ISSUER = 'https://test.supabase.co/auth/v1';
let sign: (claims: Record<string, unknown>, opts?: { exp?: string; iss?: string }) => Promise<string>;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), alg: 'RS256', kid: 'test-key' };
  jwks = createLocalJWKSet({ keys: [jwk] });
  sign = (claims, opts = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(opts.iss ?? ISSUER)
      .setSubject((claims.sub as string) ?? 'user-123')
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '1h')
      .sign(privateKey);
});

describe('makeVerifySupabaseToken', () => {
  it('returns the subject (user id) for a valid token', async () => {
    const verify = makeVerifySupabaseToken({ jwks, issuer: ISSUER });
    expect(await verify(await sign({ sub: 'user-abc' }))).toBe('user-abc');
  });
  it('returns undefined for missing, wrong-issuer, expired, and garbage tokens', async () => {
    const verify = makeVerifySupabaseToken({ jwks, issuer: ISSUER });
    expect(await verify(undefined)).toBeUndefined();
    expect(await verify(await sign({ sub: 'u' }, { iss: 'https://evil.example/auth/v1' }))).toBeUndefined();
    expect(await verify(await sign({ sub: 'u' }, { exp: '-1m' }))).toBeUndefined();
    expect(await verify('not-a-jwt')).toBeUndefined();
  });
});

describe('makeSupabaseJwtVerifier', () => {
  it('returns the verified payload (with client_id) for a valid token', async () => {
    const verifyClaims = makeSupabaseJwtVerifier({ jwks, issuer: ISSUER });
    const payload = await verifyClaims(await sign({ sub: 'u', client_id: 'cid-1' }));
    expect(payload?.sub).toBe('u');
    expect(payload?.client_id).toBe('cid-1');
  });
  it('returns undefined for an invalid token', async () => {
    const verifyClaims = makeSupabaseJwtVerifier({ jwks, issuer: ISSUER });
    expect(await verifyClaims('garbage')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/auth/__tests__/supabase-token.test.ts`
Expected: FAIL — cannot find module `@/lib/auth/supabase-token`.

- [ ] **Step 3: Implement the verifier**

Create `lib/auth/supabase-token.ts`:

```typescript
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

export interface VerifyTokenDeps {
  jwks: JWTVerifyGetKey;
  issuer: string;
}

/**
 * Build a verifier that validates a Supabase access-token JWT against the given
 * JWKS + issuer and returns the verified payload, or undefined for
 * missing/invalid/expired/wrong-issuer tokens. Single audited verification path
 * shared by the MCP endpoint and the web dashboard API.
 */
export function makeSupabaseJwtVerifier({ jwks, issuer }: VerifyTokenDeps) {
  return async function verifyClaims(bearerToken?: string): Promise<JWTPayload | undefined> {
    if (!bearerToken) return undefined;
    try {
      const { payload } = await jwtVerify(bearerToken, jwks, { issuer });
      return payload;
    } catch {
      return undefined; // fail closed: never resolve to a trusted identity on error
    }
  };
}

/** Convenience verifier that returns just the user id (`sub`). */
export function makeVerifySupabaseToken(deps: VerifyTokenDeps) {
  const verifyClaims = makeSupabaseJwtVerifier(deps);
  return async function verifySupabaseToken(bearerToken?: string): Promise<string | undefined> {
    const payload = await verifyClaims(bearerToken);
    return typeof payload?.sub === 'string' ? payload.sub : undefined;
  };
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
// Lazy remote JWKS (fetched on first verification, then cached by jose).
const remoteJwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

export const verifySupabaseClaims = makeSupabaseJwtVerifier({ jwks: remoteJwks, issuer: ISSUER });
export const verifySupabaseToken = makeVerifySupabaseToken({ jwks: remoteJwks, issuer: ISSUER });
```

- [ ] **Step 4: Refactor `lib/mcp/auth.ts` to reuse the shared verifier**

Replace the body of `lib/mcp/auth.ts` with (keeps `makeVerifyMcpToken({ jwks, issuer })` signature so the existing MCP auth test stays green):

```typescript
import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { makeSupabaseJwtVerifier } from '@/lib/auth/supabase-token';

export interface VerifyDeps {
  jwks: JWTVerifyGetKey;
  issuer: string;
}

/**
 * Build a verifyToken function for mcp-handler's withMcpAuth. Validates a Supabase
 * access-token JWT and returns AuthInfo on success, or undefined for
 * missing/invalid/expired/wrong-issuer tokens (the caller treats undefined as
 * anonymous — this endpoint is intentionally dual-mode).
 */
export function makeVerifyMcpToken({ jwks, issuer }: VerifyDeps) {
  const verifyClaims = makeSupabaseJwtVerifier({ jwks, issuer });
  return async function verifyMcpToken(
    _req: Request,
    bearerToken?: string,
  ): Promise<AuthInfo | undefined> {
    const payload = await verifyClaims(bearerToken);
    const userId = typeof payload?.sub === 'string' ? payload.sub : undefined;
    if (!payload || !userId || !bearerToken) return undefined;
    return {
      token: bearerToken,
      clientId: typeof payload.client_id === 'string' ? payload.client_id : 'unknown',
      scopes: [],
      expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
      extra: { userId },
    };
  };
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const remoteJwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

export const verifyMcpToken = makeVerifyMcpToken({ jwks: remoteJwks, issuer: ISSUER });
```

- [ ] **Step 5: Run both auth test files to verify they pass**

Run: `npx vitest run lib/auth/__tests__/supabase-token.test.ts lib/mcp/__tests__/auth.test.ts`
Expected: PASS (all green — the existing MCP test is unchanged and still passes).

- [ ] **Step 6: Commit**

```bash
git add lib/auth/supabase-token.ts lib/auth/__tests__/supabase-token.test.ts lib/mcp/auth.ts
git commit -m "feat(auth): shared Supabase JWT verifier, reused by MCP auth"
```

---

## Task 2: Repository — `listByOwner` + `deleteOwned`

**Files:**
- Modify: `lib/artifacts/types.ts`
- Modify: `lib/artifacts/repository.ts`
- Modify: `lib/artifacts/__tests__/in-memory-repository.ts`
- Modify: `lib/db/artifact-repository.ts`
- Test: `lib/artifacts/__tests__/in-memory-repository.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/artifacts/__tests__/in-memory-repository.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from './in-memory-repository';
import type { NewArtifact } from '@/lib/artifacts/repository';

function newArtifact(over: Partial<NewArtifact> = {}): NewArtifact {
  return {
    slug: 'aaaa', content: '<h1>hi</h1>', title: 'hi', visibility: 'public',
    passwordHash: null, ownerId: 'owner-1', editTokenHash: 'h', deployIpHash: 'ip',
    expiresAt: new Date(Date.now() + 86_400_000), ...over,
  };
}

describe('InMemoryRepository.listByOwner', () => {
  it('returns live artifacts for the owner, newest first, as summaries without content', async () => {
    const repo = new InMemoryRepository();
    await repo.insert(newArtifact({ slug: 'a1', ownerId: 'owner-1', title: 'One' }));
    await repo.insert(newArtifact({ slug: 'a2', ownerId: 'owner-1', title: 'Two' }));
    await repo.insert(newArtifact({ slug: 'b1', ownerId: 'owner-2', title: 'Other' }));
    await repo.insert(newArtifact({ slug: 'x1', ownerId: 'owner-1', title: 'Expired', expiresAt: new Date(Date.now() - 1000) }));

    const list = await repo.listByOwner('owner-1', new Date());
    expect(list.map((s) => s.slug)).toEqual(['a2', 'a1']); // newest first, excludes other owner + expired
    expect(list[0]).not.toHaveProperty('content');
    expect(list[0]).toMatchObject({ slug: 'a2', title: 'Two', visibility: 'public', viewCount: 0 });
  });
});

describe('InMemoryRepository.deleteOwned', () => {
  it('deletes only when the owner matches and reports whether a row was removed', async () => {
    const repo = new InMemoryRepository();
    await repo.insert(newArtifact({ slug: 'a1', ownerId: 'owner-1' }));
    expect(await repo.deleteOwned('a1', 'owner-2')).toBe(false); // wrong owner — untouched
    expect(await repo.findBySlug('a1')).not.toBeNull();
    expect(await repo.deleteOwned('a1', 'owner-1')).toBe(true);
    expect(await repo.findBySlug('a1')).toBeNull();
    expect(await repo.deleteOwned('missing', 'owner-1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/artifacts/__tests__/in-memory-repository.test.ts`
Expected: FAIL — `listByOwner`/`deleteOwned` not on `InMemoryRepository` (and type error on `ArtifactSummary`).

- [ ] **Step 3: Add the `ArtifactSummary` type**

In `lib/artifacts/types.ts`, after the `ArtifactRecord` interface, add:

```typescript
/** Lightweight projection for the dashboard list (no content blob). */
export interface ArtifactSummary {
  slug: string;
  title: string | null;
  visibility: Visibility;
  createdAt: Date;
  expiresAt: Date;
  viewCount: number;
}
```

- [ ] **Step 4: Extend the repository interface**

In `lib/artifacts/repository.ts`, update the import and add two methods to `ArtifactRepository`:

```typescript
import type { ArtifactRecord, ArtifactSummary, Visibility } from '@/lib/artifacts/types';
```

Add inside the `ArtifactRepository` interface (after `incrementViews`):

```typescript
  listByOwner(ownerId: string, now: Date): Promise<ArtifactSummary[]>;
  deleteOwned(slug: string, ownerId: string): Promise<boolean>;
```

- [ ] **Step 5: Implement on `InMemoryRepository`**

In `lib/artifacts/__tests__/in-memory-repository.ts`, update the import line to include `ArtifactSummary`:

```typescript
import type { ArtifactRecord, ArtifactSummary, Visibility } from '@/lib/artifacts/types';
```

Add these methods inside the class (after `incrementViews`):

```typescript
  async listByOwner(ownerId: string, now: Date): Promise<ArtifactSummary[]> {
    return [...this.rows.values()]
      .filter((r) => r.ownerId === ownerId && r.expiresAt > now)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => ({
        slug: r.slug, title: r.title, visibility: r.visibility,
        createdAt: r.createdAt, expiresAt: r.expiresAt, viewCount: r.viewCount,
      }));
  }

  async deleteOwned(slug: string, ownerId: string): Promise<boolean> {
    const row = this.rows.get(slug);
    if (!row || row.ownerId !== ownerId) return false;
    this.rows.delete(slug);
    return true;
  }
```

Note: the in-memory `insert` sets `createdAt: new Date()`, so two inserts in the same millisecond can tie on sort. The test tolerates this only because inserts are sequential `await`s; if it ever flakes, the real ordering is enforced by SQL in Step 6. Keep the test as written.

- [ ] **Step 6: Implement on the Supabase repository**

In `lib/db/artifact-repository.ts`, update the import:

```typescript
import type { ArtifactRecord, ArtifactSummary, Visibility } from '@/lib/artifacts/types';
```

Add these methods inside `SupabaseArtifactRepository` (after `incrementViews`):

```typescript
  async listByOwner(ownerId: string, now: Date): Promise<ArtifactSummary[]> {
    const { data, error } = await this.db.from('artifacts')
      .select('slug, title, visibility, created_at, expires_at, view_count')
      .eq('owner_id', ownerId)
      .gt('expires_at', now.toISOString())
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      slug: r.slug as string,
      title: (r.title as string | null) ?? null,
      visibility: r.visibility as Visibility,
      createdAt: new Date(r.created_at as string),
      expiresAt: new Date(r.expires_at as string),
      viewCount: Number(r.view_count),
    }));
  }

  async deleteOwned(slug: string, ownerId: string): Promise<boolean> {
    const { data, error } = await this.db.from('artifacts')
      .delete().eq('slug', slug).eq('owner_id', ownerId).select('id');
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run lib/artifacts/__tests__/in-memory-repository.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/artifacts/types.ts lib/artifacts/repository.ts lib/artifacts/__tests__/in-memory-repository.ts lib/artifacts/__tests__/in-memory-repository.test.ts lib/db/artifact-repository.ts
git commit -m "feat(db): listByOwner + deleteOwned repository methods"
```

---

## Task 3: Service — list / get / delete for owners

**Files:**
- Modify: `lib/artifacts/service.ts`
- Test: `lib/artifacts/__tests__/service.dashboard.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/artifacts/__tests__/service.dashboard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from './in-memory-repository';
import { listOwnArtifacts, getOwnArtifact, deleteArtifact } from '@/lib/artifacts/service';
import { ServiceError } from '@/lib/artifacts/errors';
import type { NewArtifact } from '@/lib/artifacts/repository';

function seed(over: Partial<NewArtifact> = {}): NewArtifact {
  return {
    slug: 'a1', content: '<h1>hi</h1>', title: 'hi', visibility: 'public',
    passwordHash: null, ownerId: 'owner-1', editTokenHash: 'h', deployIpHash: 'ip',
    expiresAt: new Date(Date.now() + 86_400_000), ...over,
  };
}

describe('listOwnArtifacts', () => {
  it('returns the owner summaries', async () => {
    const repo = new InMemoryRepository();
    await repo.insert(seed({ slug: 'a1', ownerId: 'owner-1' }));
    await repo.insert(seed({ slug: 'b1', ownerId: 'owner-2' }));
    const list = await listOwnArtifacts(repo, 'owner-1');
    expect(list.map((s) => s.slug)).toEqual(['a1']);
  });
});

describe('getOwnArtifact', () => {
  it('returns the full record for the owner', async () => {
    const repo = new InMemoryRepository();
    await repo.insert(seed({ slug: 'a1', ownerId: 'owner-1', content: '<p>x</p>' }));
    const rec = await getOwnArtifact(repo, 'a1', 'owner-1');
    expect(rec.content).toBe('<p>x</p>');
  });
  it('throws not_found for a missing or expired artifact', async () => {
    const repo = new InMemoryRepository();
    await repo.insert(seed({ slug: 'old', ownerId: 'owner-1', expiresAt: new Date(Date.now() - 1000) }));
    await expect(getOwnArtifact(repo, 'nope', 'owner-1')).rejects.toMatchObject({ code: 'not_found' });
    await expect(getOwnArtifact(repo, 'old', 'owner-1')).rejects.toMatchObject({ code: 'not_found' });
  });
  it('throws forbidden when the artifact is owned by someone else (or anonymous)', async () => {
    const repo = new InMemoryRepository();
    await repo.insert(seed({ slug: 'a1', ownerId: 'owner-2' }));
    await repo.insert(seed({ slug: 'anon', ownerId: null }));
    await expect(getOwnArtifact(repo, 'a1', 'owner-1')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(getOwnArtifact(repo, 'anon', 'owner-1')).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('deleteArtifact', () => {
  it('deletes the owner artifact', async () => {
    const repo = new InMemoryRepository();
    await repo.insert(seed({ slug: 'a1', ownerId: 'owner-1' }));
    expect(await deleteArtifact(repo, 'a1', 'owner-1')).toEqual({ ok: true });
    expect(await repo.findBySlug('a1')).toBeNull();
  });
  it('throws not_found when missing and forbidden when not the owner', async () => {
    const repo = new InMemoryRepository();
    await repo.insert(seed({ slug: 'a1', ownerId: 'owner-2' }));
    await expect(deleteArtifact(repo, 'missing', 'owner-1')).rejects.toMatchObject({ code: 'not_found' });
    await expect(deleteArtifact(repo, 'a1', 'owner-1')).rejects.toMatchObject({ code: 'forbidden' });
    expect(repo.findBySlug('a1')).resolves.not.toBeNull();
  });
});

it('ServiceError is the thrown type', () => { expect(new ServiceError('forbidden', 'x').code).toBe('forbidden'); });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/artifacts/__tests__/service.dashboard.test.ts`
Expected: FAIL — `listOwnArtifacts`/`getOwnArtifact`/`deleteArtifact` not exported.

- [ ] **Step 3: Implement the service functions**

Append to `lib/artifacts/service.ts` (the file already imports `ArtifactRecord`, `ServiceError`, `ServiceDeps`/`defaultDeps`; add `ArtifactSummary` to the types import at the top):

Update the first import line to:

```typescript
import type { ArtifactRecord, ArtifactSummary, AuthContext, Ttl, Visibility } from '@/lib/artifacts/types';
```

Append at the end of the file:

```typescript
// ── Dashboard (owner-scoped) ──────────────────────────────────────────────────

export async function listOwnArtifacts(
  repo: ArtifactRepository,
  ownerId: string,
  deps: ServiceDeps = defaultDeps,
): Promise<ArtifactSummary[]> {
  return repo.listByOwner(ownerId, deps.now());
}

/** Full record for the editor; not_found if missing/expired, forbidden if not the owner. */
export async function getOwnArtifact(
  repo: ArtifactRepository,
  slug: string,
  ownerId: string,
  deps: ServiceDeps = defaultDeps,
): Promise<ArtifactRecord> {
  const record = await repo.findBySlug(slug);
  if (!record || record.expiresAt <= deps.now()) {
    throw new ServiceError('not_found', 'Artifact not found');
  }
  if (record.ownerId !== ownerId) {
    throw new ServiceError('forbidden', 'Not authorized to view this artifact');
  }
  return record;
}

export async function deleteArtifact(
  repo: ArtifactRepository,
  slug: string,
  ownerId: string,
): Promise<{ ok: true }> {
  const record = await repo.findBySlug(slug);
  if (!record) throw new ServiceError('not_found', 'Artifact not found');
  if (record.ownerId !== ownerId) {
    throw new ServiceError('forbidden', 'Not authorized to delete this artifact');
  }
  await repo.deleteOwned(slug, ownerId);
  return { ok: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/artifacts/__tests__/service.dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/artifacts/service.ts lib/artifacts/__tests__/service.dashboard.test.ts
git commit -m "feat(service): owner-scoped list/get/delete"
```

---

## Task 4: Request-auth helper for routes

**Files:**
- Create: `lib/http/request-auth.ts`
- Create: `lib/http/__tests__/request-auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/http/__tests__/request-auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { makeOwnerAuth } from '@/lib/http/request-auth';
import { ServiceError } from '@/lib/artifacts/errors';

// Fake verifier: treats "good-token" as user "owner-1", everything else as invalid.
const verify = async (bearer?: string) => (bearer === 'good-token' ? 'owner-1' : undefined);
const { ownerIdFromRequest, requireOwner } = makeOwnerAuth({ verify });

function reqWith(auth?: string): Request {
  return new Request('https://artifact.host/api/artifacts', auth ? { headers: { authorization: auth } } : {});
}

describe('ownerIdFromRequest', () => {
  it('returns the owner id for a valid Bearer token', async () => {
    expect(await ownerIdFromRequest(reqWith('Bearer good-token'))).toBe('owner-1');
  });
  it('is case-insensitive on the Bearer scheme', async () => {
    expect(await ownerIdFromRequest(reqWith('bearer good-token'))).toBe('owner-1');
  });
  it('returns null when the header is missing or the token is invalid', async () => {
    expect(await ownerIdFromRequest(reqWith())).toBeNull();
    expect(await ownerIdFromRequest(reqWith('Bearer nope'))).toBeNull();
    expect(await ownerIdFromRequest(reqWith('good-token'))).toBeNull(); // no scheme
  });
});

describe('requireOwner', () => {
  it('returns the owner id when present', async () => {
    expect(await requireOwner(reqWith('Bearer good-token'))).toBe('owner-1');
  });
  it('throws ServiceError unauthorized when absent', async () => {
    await expect(requireOwner(reqWith())).rejects.toMatchObject({ code: 'unauthorized' });
    expect(ServiceError).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/http/__tests__/request-auth.test.ts`
Expected: FAIL — cannot find module `@/lib/http/request-auth`.

- [ ] **Step 3: Implement the helper**

Create `lib/http/request-auth.ts`:

```typescript
import { ServiceError } from '@/lib/artifacts/errors';
import { verifySupabaseToken } from '@/lib/auth/supabase-token';

export interface OwnerAuthDeps {
  verify: (bearerToken?: string) => Promise<string | undefined>;
}

function bearerFrom(req: Request): string | undefined {
  const header = req.headers.get('authorization') ?? '';
  return /^bearer /i.test(header) ? header.slice(7).trim() : undefined;
}

export function makeOwnerAuth({ verify }: OwnerAuthDeps) {
  /** Owner id from a valid Bearer session token, or null (not signed in / invalid). */
  async function ownerIdFromRequest(req: Request): Promise<string | null> {
    return (await verify(bearerFrom(req))) ?? null;
  }
  /** Owner id, or throws ServiceError('unauthorized') when not signed in. */
  async function requireOwner(req: Request): Promise<string> {
    const id = await ownerIdFromRequest(req);
    if (!id) throw new ServiceError('unauthorized', 'Sign in required');
    return id;
  }
  return { ownerIdFromRequest, requireOwner };
}

export const { ownerIdFromRequest, requireOwner } = makeOwnerAuth({ verify: verifySupabaseToken });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/http/__tests__/request-auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/http/request-auth.ts lib/http/__tests__/request-auth.test.ts
git commit -m "feat(http): Bearer owner auth helper for route handlers"
```

---

## Task 5: Authed artifact API routes

Thin handlers over the tested service + helpers, mapping errors with the existing `errorResponse`. Verified by `tsc` + `next build` (route handlers follow the repo's untested-thin-route convention; their logic is covered by Tasks 1–4 and the contract tests in Task 8).

**Files:**
- Create: `app/api/artifacts/route.ts`
- Modify: `app/api/artifacts/[slug]/route.ts`

- [ ] **Step 1: Implement `GET /api/artifacts` (list)**

Create `app/api/artifacts/route.ts`:

```typescript
import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';
import { listOwnArtifacts } from '@/lib/artifacts/service';
import { requireOwner } from '@/lib/http/request-auth';
import { errorResponse } from '@/lib/http/errors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const ownerId = await requireOwner(req);
    const repo = new SupabaseArtifactRepository(getServiceClient());
    const items = await listOwnArtifacts(repo, ownerId);
    return Response.json({
      artifacts: items.map((a) => ({
        slug: a.slug,
        title: a.title,
        visibility: a.visibility,
        created_at: a.createdAt.toISOString(),
        expires_at: a.expiresAt.toISOString(),
        view_count: a.viewCount,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 2: Add `GET` (editor) and `DELETE`, and the Bearer path to `PATCH`**

Replace `app/api/artifacts/[slug]/route.ts` entirely with:

```typescript
import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';
import { updateArtifact, setVisibility, getOwnArtifact, deleteArtifact } from '@/lib/artifacts/service';
import { ownerIdFromRequest, requireOwner } from '@/lib/http/request-auth';
import { errorResponse } from '@/lib/http/errors';

export const runtime = 'nodejs';

// Fetch one artifact's content for the dashboard editor (owner only).
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const ownerId = await requireOwner(req);
    const repo = new SupabaseArtifactRepository(getServiceClient());
    const rec = await getOwnArtifact(repo, slug, ownerId);
    return Response.json({
      slug: rec.slug,
      title: rec.title,
      content: rec.content,
      visibility: rec.visibility,
      expires_at: rec.expiresAt.toISOString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = await req.json();
    // Authorize by signed-in owner (Bearer) when present, else fall back to edit token.
    const ownerId = await ownerIdFromRequest(req);
    const editToken = req.headers.get('x-edit-token') ?? body?.edit_token ?? null;
    const auth = { ownerId, editToken };
    const repo = new SupabaseArtifactRepository(getServiceClient());

    if (typeof body?.visibility === 'string') {
      await setVisibility(repo, slug, body.visibility, body.password ?? null, auth);
      return Response.json({ ok: true });
    }
    if (typeof body?.content === 'string') {
      const res = await updateArtifact(repo, slug, body.content, auth);
      return Response.json({ slug: res.slug, url: res.url, expires_at: res.expiresAt.toISOString() });
    }
    return Response.json({ error: 'invalid_visibility', message: 'Provide content or visibility' }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const ownerId = await requireOwner(req);
    const repo = new SupabaseArtifactRepository(getServiceClient());
    await deleteArtifact(repo, slug, ownerId);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 3: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx next build`
Expected: build succeeds; the build output lists `/api/artifacts` and `/api/artifacts/[slug]` routes.

- [ ] **Step 4: Commit**

```bash
git add app/api/artifacts/route.ts app/api/artifacts/[slug]/route.ts
git commit -m "feat(api): authed list/get/delete routes + Bearer path on PATCH"
```

---

## Task 6: Browser client + pure dashboard helpers

**Files:**
- Create: `lib/web/supabase-browser.ts`
- Create: `lib/web/dashboard.ts`
- Create: `lib/web/__tests__/dashboard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/web/__tests__/dashboard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateEditInput, editErrorMessage, MAX_CONTENT_BYTES } from '@/lib/web/dashboard';

describe('validateEditInput', () => {
  it('rejects empty content', () => {
    expect(validateEditInput({ content: '   ', visibility: 'public', password: '' }))
      .toEqual({ ok: false, error: 'The artifact can’t be empty.' });
  });
  it('rejects password visibility with no password', () => {
    expect(validateEditInput({ content: '<h1>x</h1>', visibility: 'password', password: '' }))
      .toEqual({ ok: false, error: 'Enter a password, or switch to public.' });
  });
  it('rejects content over the size cap', () => {
    const big = 'a'.repeat(MAX_CONTENT_BYTES + 1);
    expect(validateEditInput({ content: big, visibility: 'public', password: '' }))
      .toEqual({ ok: false, error: 'That’s over the 5 MB limit.' });
  });
  it('accepts valid content', () => {
    expect(validateEditInput({ content: '<h1>x</h1>', visibility: 'public', password: '' })).toEqual({ ok: true });
    expect(validateEditInput({ content: '<h1>x</h1>', visibility: 'password', password: 'pw' })).toEqual({ ok: true });
  });
});

describe('editErrorMessage', () => {
  it('maps known codes and falls back', () => {
    expect(editErrorMessage('too_large')).toMatch(/5 MB/);
    expect(editErrorMessage('forbidden')).toMatch(/isn’t yours/i);
    expect(editErrorMessage('not_found')).toMatch(/gone|expired/i);
    expect(editErrorMessage('unauthorized')).toMatch(/sign in/i);
    expect(editErrorMessage(undefined)).toMatch(/something went wrong/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/web/__tests__/dashboard.test.ts`
Expected: FAIL — cannot find module `@/lib/web/dashboard`.

- [ ] **Step 3: Implement the pure helpers**

Create `lib/web/dashboard.ts`:

```typescript
import type { Visibility } from '@/lib/web/deploy';

export const MAX_CONTENT_BYTES = 5 * 1024 * 1024; // 5 MB, mirrors the server cap

/** One row of the dashboard list, as returned by GET /api/artifacts. */
export interface ArtifactListItem {
  slug: string;
  title: string | null;
  visibility: Visibility;
  created_at: string;
  expires_at: string;
  view_count: number;
}

export type EditValidation = { ok: true } | { ok: false; error: string };

export function validateEditInput(s: { content: string; visibility: Visibility; password: string }): EditValidation {
  if (!s.content.trim()) return { ok: false, error: 'The artifact can’t be empty.' };
  if (s.visibility === 'password' && !s.password) return { ok: false, error: 'Enter a password, or switch to public.' };
  if (new TextEncoder().encode(s.content).length > MAX_CONTENT_BYTES) {
    return { ok: false, error: 'That’s over the 5 MB limit.' };
  }
  return { ok: true };
}

const MESSAGES: Record<string, string> = {
  too_large: 'That’s over the 5 MB limit.',
  forbidden: 'This artifact isn’t yours.',
  not_found: 'This artifact is gone or has expired.',
  unauthorized: 'Please sign in again.',
  password_required: 'Enter a password, or switch to public.',
  invalid_visibility: 'Pick a valid visibility.',
};

export function editErrorMessage(code: string | undefined): string {
  return (code && MESSAGES[code]) || 'Something went wrong — try again.';
}
```

- [ ] **Step 4: Implement the browser client singleton**

Create `lib/web/supabase-browser.ts`:

```typescript
'use client';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Singleton browser Supabase client (anon/publishable key — never the service key). */
export const supabaseBrowser = createClient(supabaseUrl, supabaseKey);

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabaseBrowser.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getAccountEmail(): Promise<string | null> {
  const { data } = await supabaseBrowser.auth.getSession();
  return data.session?.user?.email ?? null;
}

export function signIn(provider: 'google' | 'github') {
  return supabaseBrowser.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.href } });
}

export function signOut() {
  return supabaseBrowser.auth.signOut();
}
```

- [ ] **Step 5: Run the test + type-check**

Run: `npx vitest run lib/web/__tests__/dashboard.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/web/supabase-browser.ts lib/web/dashboard.ts lib/web/__tests__/dashboard.test.ts
git commit -m "feat(web): browser auth client + pure dashboard helpers"
```

---

## Task 7: SignInGate + AccountMenu (header wiring)

**Files:**
- Create: `components/dashboard/SignInGate.tsx`, `components/dashboard/SignInGate.module.css`
- Create: `components/dashboard/SignInGate.test.tsx`
- Create: `components/dashboard/AccountMenu.tsx`, `components/dashboard/AccountMenu.module.css`
- Create: `components/dashboard/AccountMenu.test.tsx`
- Modify: `components/site/Header.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/dashboard/SignInGate.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const signIn = vi.fn();
vi.mock('@/lib/web/supabase-browser', () => ({ signIn }));

import { SignInGate } from './SignInGate';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('SignInGate', () => {
  it('renders both providers and calls signIn on click', () => {
    render(<SignInGate />);
    fireEvent.click(screen.getByRole('button', { name: /Google/i }));
    expect(signIn).toHaveBeenCalledWith('google');
    fireEvent.click(screen.getByRole('button', { name: /GitHub/i }));
    expect(signIn).toHaveBeenCalledWith('github');
  });
});
```

Create `components/dashboard/AccountMenu.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const getAccountEmail = vi.fn();
const signOut = vi.fn(async () => {});
vi.mock('@/lib/web/supabase-browser', () => ({ getAccountEmail, signOut }));

import { AccountMenu } from './AccountMenu';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('AccountMenu', () => {
  it('shows a sign-in link when signed out', async () => {
    getAccountEmail.mockResolvedValue(null);
    render(<AccountMenu />);
    await waitFor(() => expect(screen.getByRole('link', { name: /sign in/i })).toBeTruthy());
  });

  it('shows the email, a dashboard link, and a working sign-out when signed in', async () => {
    getAccountEmail.mockResolvedValue('itaitevet@gmail.com');
    render(<AccountMenu />);
    await waitFor(() => expect(screen.getByText('itaitevet@gmail.com')).toBeTruthy());
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(signOut).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/dashboard/SignInGate.test.tsx components/dashboard/AccountMenu.test.tsx`
Expected: FAIL — components do not exist.

- [ ] **Step 3: Implement `SignInGate`**

Create `components/dashboard/SignInGate.tsx`:

```tsx
'use client';

import { signIn } from '@/lib/web/supabase-browser';
import styles from './SignInGate.module.css';

export function SignInGate({
  title = 'Sign in to your dashboard',
  subtitle = 'Manage the artifacts you’ve deployed while signed in.',
}: { title?: string; subtitle?: string }) {
  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.subtitle}>{subtitle}</p>
      <button className={styles.btn} onClick={() => void signIn('google')}>Sign in with Google</button>
      <button className={styles.btn} onClick={() => void signIn('github')}>Sign in with GitHub</button>
    </div>
  );
}
```

Create `components/dashboard/SignInGate.module.css`:

```css
.wrap { max-width: 420px; margin: 14vh auto; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0 20px; }
.title { font-family: var(--font-serif); font-size: 26px; color: var(--ink); margin: 0 0 10px; }
.subtitle { font-size: 14px; color: var(--ink-3); margin: 0 0 22px; line-height: 1.5; }
.btn { width: 100%; max-width: 300px; padding: 11px 16px; margin: 6px 0; font-size: 14px; font-family: var(--font-serif);
  border: 1px solid var(--rule); border-radius: 6px; background: #fff; color: var(--ink); cursor: pointer; }
.btn:hover { border-color: var(--ink-2); background: var(--bg-2); }
```

- [ ] **Step 4: Implement `AccountMenu`**

Create `components/dashboard/AccountMenu.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccountEmail, signOut } from '@/lib/web/supabase-browser';
import styles from './AccountMenu.module.css';

export function AccountMenu() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    getAccountEmail().then((e) => { if (active) { setEmail(e); setReady(true); } });
    return () => { active = false; };
  }, []);

  async function doSignOut() {
    await signOut();
    setEmail(null);
    window.location.href = '/';
  }

  if (!ready) return <span className={styles.placeholder} aria-hidden="true" />;

  if (!email) {
    return <Link href="/dashboard" className={styles.link}>sign in</Link>;
  }

  return (
    <span className={styles.account}>
      <Link href="/dashboard" className={styles.link}>dashboard</Link>
      <span className={styles.email}>{email}</span>
      <button className={styles.signout} onClick={() => void doSignOut()}>sign out</button>
    </span>
  );
}
```

Create `components/dashboard/AccountMenu.module.css`:

```css
.account { display: inline-flex; align-items: center; gap: 14px; }
.link { color: var(--ink-2); }
.link:hover { color: var(--ink); }
.email { font-size: 12px; color: var(--ink-3); font-family: var(--font-mono); }
.signout { font-size: 13px; color: var(--ink-2); background: none; border: none; cursor: pointer; padding: 0; font-family: inherit; }
.signout:hover { color: var(--amber); }
.placeholder { display: inline-block; width: 64px; }
```

- [ ] **Step 5: Wire `AccountMenu` into the header**

In `components/site/Header.tsx`, replace the two inert `<span>` placeholders with the island. The result:

```tsx
import Link from 'next/link';
import { AccountMenu } from '@/components/dashboard/AccountMenu';
import styles from './Header.module.css';

export function Header() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>
        artifact<span>.host</span>
      </Link>
      <nav className={styles.nav}>
        <Link href="/docs">docs</Link>
        <AccountMenu />
      </nav>
    </header>
  );
}
```

- [ ] **Step 6: Run the tests + type-check**

Run: `npx vitest run components/dashboard/SignInGate.test.tsx components/dashboard/AccountMenu.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/SignInGate.tsx components/dashboard/SignInGate.module.css components/dashboard/SignInGate.test.tsx components/dashboard/AccountMenu.tsx components/dashboard/AccountMenu.module.css components/dashboard/AccountMenu.test.tsx components/site/Header.tsx
git commit -m "feat(web): sign-in gate + header account menu"
```

---

## Task 8: ArtifactRow + DeleteConfirm

**Files:**
- Create: `components/dashboard/DeleteConfirm.tsx`, `components/dashboard/DeleteConfirm.module.css`
- Create: `components/dashboard/ArtifactRow.tsx`, `components/dashboard/ArtifactRow.module.css`
- Create: `components/dashboard/ArtifactRow.test.tsx`

Note: per the spec the row's overflow menu offered a "change visibility" shortcut; visibility editing already lives on the edit page, so the row keeps **Open · Edit · Delete** and visibility changes happen via Edit. This avoids an inline password-entry flow.

- [ ] **Step 1: Write the failing test**

Create `components/dashboard/ArtifactRow.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ArtifactRow } from './ArtifactRow';
import type { ArtifactListItem } from '@/lib/web/dashboard';

const item: ArtifactListItem = {
  slug: 'a3f9', title: 'Q3 Revenue Dashboard', visibility: 'public',
  created_at: '2026-06-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', view_count: 142,
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ArtifactRow', () => {
  it('renders title, slug, visibility, views, and an Open link to the viewer', () => {
    render(<ArtifactRow item={item} onDelete={vi.fn()} />);
    expect(screen.getByText('Q3 Revenue Dashboard')).toBeTruthy();
    expect(screen.getByText(/a3f9/)).toBeTruthy();
    expect(screen.getByText(/public/i)).toBeTruthy();
    expect(screen.getByText(/142/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /open/i }).getAttribute('href')).toBe('/a/a3f9');
    expect(screen.getByRole('link', { name: /edit/i }).getAttribute('href')).toBe('/dashboard/a3f9');
  });

  it('asks for confirmation and calls onDelete only after confirming', () => {
    const onDelete = vi.fn();
    render(<ArtifactRow item={item} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).not.toHaveBeenCalled();           // confirm dialog shown first
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledWith('a3f9');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/dashboard/ArtifactRow.test.tsx`
Expected: FAIL — components do not exist.

- [ ] **Step 3: Implement `DeleteConfirm`**

Create `components/dashboard/DeleteConfirm.tsx`:

```tsx
'use client';

import styles from './DeleteConfirm.module.css';

export function DeleteConfirm({
  name, busy = false, onConfirm, onCancel,
}: { name: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className={styles.scrim} role="dialog" aria-modal="true">
      <div className={styles.box}>
        <p className={styles.msg}>Delete <strong>{name}</strong>? This removes it immediately and can’t be undone.</p>
        <div className={styles.actions}>
          <button className={styles.cancel} onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={styles.confirm} onClick={onConfirm} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  );
}
```

Create `components/dashboard/DeleteConfirm.module.css`:

```css
.scrim { position: fixed; inset: 0; background: rgba(14,12,9,.28); display: flex; align-items: center; justify-content: center; z-index: 50; }
.box { background: var(--bg); border: 1px solid var(--rule); border-radius: 8px; padding: 22px; max-width: 380px; width: calc(100% - 40px); }
.msg { font-size: 14px; color: var(--ink); line-height: 1.5; margin: 0 0 18px; }
.actions { display: flex; justify-content: flex-end; gap: 10px; }
.cancel { padding: 8px 16px; border: 1px solid var(--rule); border-radius: 5px; background: #fff; color: var(--ink-2); cursor: pointer; font: inherit; }
.confirm { padding: 8px 16px; border: none; border-radius: 5px; background: #a3331f; color: #fff; cursor: pointer; font: inherit; }
.confirm:disabled, .cancel:disabled { opacity: .6; cursor: default; }
```

- [ ] **Step 4: Implement `ArtifactRow`**

Create `components/dashboard/ArtifactRow.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ArtifactListItem } from '@/lib/web/dashboard';
import { humanizeExpiry } from '@/lib/web/format';
import { DeleteConfirm } from './DeleteConfirm';
import styles from './ArtifactRow.module.css';

export function ArtifactRow({ item, onDelete }: { item: ArtifactListItem; onDelete: (slug: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const name = item.title || `/${item.slug}`;

  return (
    <div className={styles.row}>
      <div className={styles.main}>
        <div className={styles.title}>
          {item.title || 'Untitled'} <span className={styles.slug}>/{item.slug}</span>
        </div>
        <div className={styles.meta}>
          <span className={`${styles.badge} ${item.visibility === 'public' ? styles.pub : styles.pw}`}>{item.visibility}</span>
          <span>{humanizeExpiry(item.expires_at)}</span>
          <span>{item.view_count} {item.view_count === 1 ? 'view' : 'views'}</span>
        </div>
      </div>
      <div className={styles.actions}>
        <Link className={styles.act} href={`/a/${item.slug}`} target="_blank" rel="noreferrer">Open</Link>
        <Link className={`${styles.act} ${styles.amber}`} href={`/dashboard/${item.slug}`}>Edit</Link>
        <button className={styles.act} onClick={() => setConfirming(true)}>Delete</button>
      </div>
      {confirming && (
        <DeleteConfirm
          name={name}
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); onDelete(item.slug); }}
        />
      )}
    </div>
  );
}
```

Create `components/dashboard/ArtifactRow.module.css`:

```css
.row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 4px; border-bottom: 1px solid var(--rule); }
.main { min-width: 0; }
.title { font-family: var(--font-serif); font-size: 16px; color: var(--ink); font-weight: 600; }
.slug { font-family: var(--font-mono); font-size: 12px; color: var(--amber); font-weight: 400; }
.meta { display: flex; gap: 14px; align-items: center; margin-top: 5px; font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); }
.badge { text-transform: uppercase; letter-spacing: .04em; font-size: 10.5px; padding: 2px 7px; border-radius: 3px; }
.pub { background: #eef3ec; color: #4f7a52; }
.pw { background: #f3ece0; color: #9a6a1e; }
.actions { display: flex; gap: 8px; flex-shrink: 0; }
.act { font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); border: 1px solid var(--rule); border-radius: 4px; padding: 5px 11px; background: #fff; cursor: pointer; text-decoration: none; }
.act:hover { border-color: var(--ink-2); }
.amber { color: var(--amber); border-color: #e3c69e; }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run components/dashboard/ArtifactRow.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/DeleteConfirm.tsx components/dashboard/DeleteConfirm.module.css components/dashboard/ArtifactRow.tsx components/dashboard/ArtifactRow.module.css components/dashboard/ArtifactRow.test.tsx
git commit -m "feat(web): artifact row + delete confirmation"
```

---

## Task 9: DashboardClient + list page

**Files:**
- Create: `components/dashboard/DashboardClient.tsx`
- Create: `components/dashboard/DashboardClient.test.tsx`
- Create: `app/dashboard/page.tsx`
- Create: `app/dashboard/dashboard.module.css`

- [ ] **Step 1: Write the failing test**

Create `components/dashboard/DashboardClient.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const getAccessToken = vi.fn();
vi.mock('@/lib/web/supabase-browser', () => ({ getAccessToken, signIn: vi.fn() }));

import { DashboardClient } from './DashboardClient';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('DashboardClient', () => {
  it('shows the sign-in gate when there is no session', async () => {
    getAccessToken.mockResolvedValue(null);
    render(<DashboardClient />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Google/i })).toBeTruthy());
  });

  it('renders the list of artifacts for a signed-in user', async () => {
    getAccessToken.mockResolvedValue('good-token');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ artifacts: [
      { slug: 'a3f9', title: 'Q3 Revenue', visibility: 'public', created_at: '2026-06-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', view_count: 142 },
    ] })));
    render(<DashboardClient />);
    await waitFor(() => expect(screen.getByText('Q3 Revenue')).toBeTruthy());
  });

  it('shows an empty state when the user has no artifacts', async () => {
    getAccessToken.mockResolvedValue('good-token');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ artifacts: [] })));
    render(<DashboardClient />);
    await waitFor(() => expect(screen.getByText(/nothing here yet/i)).toBeTruthy());
  });

  it('removes a row after a successful delete', async () => {
    getAccessToken.mockResolvedValue('good-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ artifacts: [
        { slug: 'a3f9', title: 'Q3 Revenue', visibility: 'public', created_at: '2026-06-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', view_count: 1 },
      ] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    render(<DashboardClient />);
    await waitFor(() => expect(screen.getByText('Q3 Revenue')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(screen.queryByText('Q3 Revenue')).toBeNull());

    const [, init] = fetchMock.mock.calls[1];
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer good-token');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/dashboard/DashboardClient.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement `DashboardClient`**

Create `components/dashboard/DashboardClient.tsx`:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { getAccessToken } from '@/lib/web/supabase-browser';
import type { ArtifactListItem } from '@/lib/web/dashboard';
import { editErrorMessage } from '@/lib/web/dashboard';
import { SignInGate } from './SignInGate';
import { ArtifactRow } from './ArtifactRow';
import styles from '@/app/dashboard/dashboard.module.css';

type State =
  | { phase: 'loading' }
  | { phase: 'signedOut' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; items: ArtifactListItem[] };

export function DashboardClient() {
  const [state, setState] = useState<State>({ phase: 'loading' });

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) { setState({ phase: 'signedOut' }); return; }
    try {
      const res = await fetch('/api/artifacts', { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) { setState({ phase: 'signedOut' }); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setState({ phase: 'error', message: editErrorMessage(data?.error) }); return; }
      setState({ phase: 'ready', items: data.artifacts as ArtifactListItem[] });
    } catch {
      setState({ phase: 'error', message: editErrorMessage(undefined) });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function remove(slug: string) {
    const token = await getAccessToken();
    if (!token) { setState({ phase: 'signedOut' }); return; }
    setState((s) => (s.phase === 'ready' ? { phase: 'ready', items: s.items.filter((i) => i.slug !== slug) } : s));
    await fetch(`/api/artifacts/${slug}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  }

  if (state.phase === 'loading') return <p className={styles.status}>Loading…</p>;
  if (state.phase === 'signedOut') return <SignInGate />;
  if (state.phase === 'error') return <p className={styles.status}>{state.message}</p>;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.h1}>Your artifacts</h1>
      {state.items.length === 0 ? (
        <p className={styles.empty}>Nothing here yet. Deploy one from the <a href="/">home page</a> or your AI assistant, while signed in.</p>
      ) : (
        <div className={styles.list}>
          {state.items.map((item) => <ArtifactRow key={item.slug} item={item} onDelete={remove} />)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement the list page + styles**

Create `app/dashboard/dashboard.module.css`:

```css
.wrap { max-width: 720px; margin: 0 auto; padding: 32px 20px 80px; }
.h1 { font-family: var(--font-serif); font-size: 26px; color: var(--ink); margin: 0 0 20px; }
.list { display: flex; flex-direction: column; }
.empty { font-size: 15px; color: var(--ink-3); line-height: 1.6; }
.empty a { color: var(--amber); }
.status { max-width: 720px; margin: 0 auto; padding: 48px 20px; text-align: center; color: var(--ink-3); }
```

Create `app/dashboard/page.tsx`:

```tsx
import { Header } from '@/components/site/Header';
import { DashboardClient } from '@/components/dashboard/DashboardClient';

export const metadata = { title: 'Dashboard — artifact.host' };

export default function DashboardPage() {
  return (
    <>
      <Header />
      <main><DashboardClient /></main>
    </>
  );
}
```

- [ ] **Step 5: Run the test + type-check**

Run: `npx vitest run components/dashboard/DashboardClient.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/DashboardClient.tsx components/dashboard/DashboardClient.test.tsx app/dashboard/page.tsx app/dashboard/dashboard.module.css
git commit -m "feat(web): dashboard list page (gate, list, empty, delete)"
```

---

## Task 10: EditClient + edit page

**Files:**
- Create: `components/dashboard/EditClient.tsx`
- Create: `components/dashboard/EditClient.test.tsx`
- Create: `app/dashboard/[slug]/page.tsx`
- Create: `app/dashboard/[slug]/edit.module.css`

- [ ] **Step 1: Write the failing test**

Create `components/dashboard/EditClient.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const getAccessToken = vi.fn();
vi.mock('@/lib/web/supabase-browser', () => ({ getAccessToken, signIn: vi.fn() }));

import { EditClient } from './EditClient';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('EditClient', () => {
  it('loads the artifact content into the editor', async () => {
    getAccessToken.mockResolvedValue('good-token');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      { slug: 'a3f9', title: 'Q3', content: '<h1>old</h1>', visibility: 'public', expires_at: '2099-01-01T00:00:00Z' })));
    render(<EditClient slug="a3f9" />);
    await waitFor(() => expect((screen.getByLabelText(/html/i) as HTMLTextAreaElement).value).toBe('<h1>old</h1>'));
  });

  it('saves edited content with a PATCH carrying the Bearer token', async () => {
    getAccessToken.mockResolvedValue('good-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ slug: 'a3f9', title: 'Q3', content: '<h1>old</h1>', visibility: 'public', expires_at: '2099-01-01T00:00:00Z' }))
      .mockResolvedValueOnce(jsonResponse({ slug: 'a3f9', url: 'https://artifact.host/a/a3f9', expires_at: '2099-01-01T00:00:00Z' }));
    vi.stubGlobal('fetch', fetchMock);

    render(<EditClient slug="a3f9" />);
    await waitFor(() => expect(screen.getByLabelText(/html/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/html/i), { target: { value: '<h1>new</h1>' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByText(/saved/i)).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/artifacts/a3f9');
    expect(init.method).toBe('PATCH');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer good-token');
    expect(JSON.parse(init.body as string)).toEqual({ content: '<h1>new</h1>' });
  });

  it('shows a not-found message when the artifact is missing', async () => {
    getAccessToken.mockResolvedValue('good-token');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'not_found', message: 'x' }, 404)));
    render(<EditClient slug="gone" />);
    await waitFor(() => expect(screen.getByText(/gone or has expired/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/dashboard/EditClient.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement `EditClient`**

Create `components/dashboard/EditClient.tsx`:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getAccessToken } from '@/lib/web/supabase-browser';
import { validateEditInput, editErrorMessage } from '@/lib/web/dashboard';
import type { Visibility } from '@/lib/web/deploy';
import { SignInGate } from './SignInGate';
import styles from '@/app/dashboard/[slug]/edit.module.css';

type Phase = 'loading' | 'signedOut' | 'notFound' | 'ready';

export function EditClient({ slug }: { slug: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) { setPhase('signedOut'); return; }
    const res = await fetch(`/api/artifacts/${slug}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) { setPhase('signedOut'); return; }
    if (!res.ok) { setPhase('notFound'); return; }
    const data = await res.json();
    setContent(data.content as string);
    setVisibility(data.visibility as Visibility);
    setPhase('ready');
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setError(null); setSaved(false);
    const check = validateEditInput({ content, visibility, password });
    if (!check.ok) { setError(check.error); return; }
    const token = await getAccessToken();
    if (!token) { setPhase('signedOut'); return; }
    setBusy(true);
    try {
      // Save content, then visibility (only when password-protected or changed).
      const res = await fetch(`/api/artifacts/${slug}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(editErrorMessage(data?.error)); return; }
      if (visibility === 'password') {
        await fetch(`/api/artifacts/${slug}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ visibility, password }),
        });
      }
      setSaved(true);
    } catch {
      setError(editErrorMessage(undefined));
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'loading') return <p className={styles.status}>Loading…</p>;
  if (phase === 'signedOut') return <SignInGate />;
  if (phase === 'notFound') {
    return <p className={styles.status}>This artifact is gone or has expired. <Link href="/dashboard">Back to dashboard</Link></p>;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <h1 className={styles.h1}>Edit <span className={styles.slug}>/{slug}</span></h1>
        <Link href="/dashboard" className={styles.back}>‹ back to dashboard</Link>
      </div>

      <label className={styles.label} htmlFor="html">HTML</label>
      <textarea id="html" aria-label="HTML" className={styles.textarea}
        value={content} onChange={(e) => { setContent(e.target.value); setSaved(false); }} />

      <div className={styles.controls}>
        <span className={styles.label}>Visibility</span>
        <div className={styles.seg}>
          <button className={visibility === 'public' ? styles.on : ''} onClick={() => setVisibility('public')}>public</button>
          <button className={visibility === 'password' ? styles.on : ''} onClick={() => setVisibility('password')}>password</button>
        </div>
        {visibility === 'password' && (
          <input className={styles.password} type="password" placeholder="Password for viewers"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {saved && <p className={styles.saved}>Saved.</p>}

      <div className={styles.actions}>
        <Link href="/dashboard" className={styles.cancel}>Cancel</Link>
        <button className={styles.save} onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement the edit page + styles**

Create `app/dashboard/[slug]/edit.module.css`:

```css
.wrap { max-width: 760px; margin: 0 auto; padding: 28px 20px 80px; }
.top { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 18px; }
.h1 { font-family: var(--font-serif); font-size: 22px; color: var(--ink); margin: 0; }
.slug { font-family: var(--font-mono); font-size: 14px; color: var(--amber); }
.back { font-size: 13px; color: var(--ink-2); }
.back:hover { color: var(--ink); }
.label { display: block; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); margin: 0 0 7px; }
.textarea { width: 100%; min-height: 320px; resize: vertical; background: #111009; color: #cfc9c0; border: 1px solid var(--rule);
  border-radius: 6px; padding: 14px 16px; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.7; }
.controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
.seg { display: flex; border: 1px solid var(--rule); border-radius: 5px; overflow: hidden; }
.seg button { font-size: 12.5px; padding: 6px 14px; color: var(--ink-2); background: #fff; border: none; cursor: pointer; font: inherit; }
.seg button.on { background: var(--amber); color: #fff; }
.password { padding: 7px 12px; border: 1px solid var(--rule); border-radius: 5px; font: inherit; font-size: 13px; }
.error { color: #a3331f; font-size: 13px; margin: 4px 0; }
.saved { color: #4f7a52; font-size: 13px; margin: 4px 0; }
.actions { display: flex; align-items: center; gap: 12px; margin-top: 18px; }
.cancel { font-size: 13px; color: var(--ink-2); padding: 9px 16px; }
.save { background: var(--amber); color: #fff; border: none; border-radius: 6px; padding: 9px 20px; font: inherit; font-size: 14px; cursor: pointer; }
.save:disabled { opacity: .65; cursor: default; }
.status { max-width: 760px; margin: 0 auto; padding: 48px 20px; text-align: center; color: var(--ink-3); }
.status a { color: var(--amber); }
```

Create `app/dashboard/[slug]/page.tsx`:

```tsx
import { Header } from '@/components/site/Header';
import { EditClient } from '@/components/dashboard/EditClient';

export const metadata = { title: 'Edit — artifact.host' };

export default async function EditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <Header />
      <main><EditClient slug={slug} /></main>
    </>
  );
}
```

- [ ] **Step 5: Run the test + type-check + build**

Run: `npx vitest run components/dashboard/EditClient.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx next build`
Expected: build succeeds; `/dashboard` and `/dashboard/[slug]` appear in the route list.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/EditClient.tsx components/dashboard/EditClient.test.tsx app/dashboard/[slug]/page.tsx app/dashboard/[slug]/edit.module.css
git commit -m "feat(web): artifact edit page (load, save, visibility, not-found)"
```

---

## Task 11: Integration contract tests (Supabase repo)

Extend the existing Supabase adapter contract tests to cover the two new methods. These run against the real Supabase project (same as the existing integration test) and are skipped when the env vars are absent — match the existing file's guard/skip pattern exactly.

**Files:**
- Modify: `lib/db/__tests__/artifact-repository.integration.test.ts`

- [ ] **Step 1: Read the existing integration test**

Run: `npx vitest run lib/db/__tests__/artifact-repository.integration.test.ts`
Expected: PASS or SKIPPED (depending on whether Supabase env vars are present). Note the file's existing setup: how it constructs the repo, inserts fixtures, and its skip guard.

- [ ] **Step 2: Add contract tests for `listByOwner` and `deleteOwned`**

Following the existing file's structure (same repo construction, same skip guard, same cleanup), add a block that:
- Inserts two artifacts for `ownerId = 'contract-owner-A'` (one live, one already expired) and one for `'contract-owner-B'`, all with a unique slug prefix for cleanup.
- Asserts `listByOwner('contract-owner-A', new Date())` returns only the live A artifact as a summary (no `content` field), newest first.
- Asserts `deleteOwned(slugA, 'contract-owner-B')` returns `false` and leaves the row; `deleteOwned(slugA, 'contract-owner-A')` returns `true` and `findBySlug` then returns `null`.
- Cleans up any remaining inserted rows in an `afterAll`/`finally`, exactly like the existing tests do.

Use the exact insert shape the existing tests use (the `NewArtifact` fields: `slug, content, title, visibility, passwordHash, ownerId, editTokenHash, deployIpHash, expiresAt`).

- [ ] **Step 3: Run the integration test**

Run: `npx vitest run lib/db/__tests__/artifact-repository.integration.test.ts`
Expected: PASS when Supabase env vars are present (or SKIPPED consistently with the existing tests when not). If it runs, the new assertions pass.

- [ ] **Step 4: Commit**

```bash
git add lib/db/__tests__/artifact-repository.integration.test.ts
git commit -m "test(db): contract tests for listByOwner + deleteOwned"
```

---

## Task 12: Full verification, audit, and docs

**Files:**
- Modify: `docs/superpowers/HANDOFF.md`
- (Memory updated separately by the controller.)

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all tests pass (the 3a suite + all Plan 3b tests). Note the total count.

- [ ] **Step 3: Production build**

Run: `npx next build`
Expected: build succeeds. Confirm these routes are listed: `/dashboard`, `/dashboard/[slug]`, `/api/artifacts`, `/api/artifacts/[slug]`.

- [ ] **Step 4: Manual smoke (local, best-effort)**

Run: `npx next start` (after the build) or `npx next dev`, open `http://localhost:3000/dashboard`.
Expected (without OAuth providers enabled — Plan 2b Part B not yet done): the page renders the **sign-in gate** with Google/GitHub buttons (clicking them only completes once providers are live). The header shows a `sign in` link. This confirms the gate path renders; full click-through sign-in is verified later as part of the go-live batch.

- [ ] **Step 5: Update the handoff doc**

In `docs/superpowers/HANDOFF.md`, add a section recording Plan 3b complete: the routes added (`/dashboard`, `/dashboard/[slug]`), the authed API (`GET /api/artifacts`, `GET/PATCH/DELETE /api/artifacts/[slug]`), the shared `verifySupabaseToken`, and the remaining dependency: real sign-in needs Plan 2b Part B (enable Supabase OAuth server + Google/GitHub OAuth apps). Note the deliberate row-actions simplification (visibility edited on the edit page, not via an inline row shortcut).

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/HANDOFF.md
git commit -m "docs: record Plan 3b dashboard complete"
```

---

## Self-Review (controller — completed during planning)

**Spec coverage:**
- Sign-in (Google/GitHub) → Task 6 (`signIn`) + Task 7 (`SignInGate`).
- `/dashboard` list, rows (title/slug/visibility/created/expiry/views), Open/Edit/Delete, empty state → Tasks 8, 9.
- `/dashboard/<slug>` editor (HTML textarea, visibility, save, not-found) → Task 10.
- Header account state → Task 7 (`AccountMenu`).
- Auth model (browser session + Bearer → shared verify → service `{ownerId}`) → Tasks 1, 4, 5, 6.
- API surface (`GET /api/artifacts`, `GET`/`DELETE` single, `PATCH` Bearer path) → Task 5.
- Data layer (`ArtifactSummary`, `listByOwner`, `deleteOwned`, service list/get/delete) → Tasks 2, 3.
- Shared `verifySupabaseToken` + MCP refactor → Task 1.
- Testing (unit, component, contract) → Tasks 1–11; final gate → Task 12.
- Non-goals (no claiming, no TTL change, no team/sharing/WYSIWYG) → none implemented; preserved.

**Deliberate deviation:** the row's "change visibility shortcut" is folded into Edit (visibility lives on the edit page), avoiding an inline password flow. Documented in Tasks 8 and 12.

**Type consistency:** `ArtifactSummary` (camelCase, internal) defined in Task 2 and used identically in Tasks 2/3; the API serializes it to snake_case `ArtifactListItem` (Task 6) consumed by Tasks 8/9. `makeOwnerAuth`/`ownerIdFromRequest`/`requireOwner` defined in Task 4 and used in Task 5. `getAccessToken`/`signIn`/`signOut`/`getAccountEmail` defined in Task 6 and consumed (and mocked) in Tasks 7/9/10. `validateEditInput`/`editErrorMessage`/`MAX_CONTENT_BYTES` defined in Task 6, used in Tasks 9/10. No dangling references.

**Placeholder scan:** no TBD/TODO; every code step contains full code; Task 11 describes the contract additions concretely against the existing file's pattern (the one file whose exact current contents the implementer must read first, by design).
