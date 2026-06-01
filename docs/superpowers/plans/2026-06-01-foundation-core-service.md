# Foundation + Core Artifact Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working HTML-artifact host driveable entirely over HTTP — deploy an HTML string and get a short live URL, update it in place, password-protect it, and have it auto-expire — with all business rules in a unit-tested core service layer.

**Architecture:** A Next.js (App Router, TypeScript) app on Vercel backed by Supabase Postgres. All domain rules live in a framework-free **core service layer** (`lib/artifacts/`) that depends on an injected **repository port**, so it is unit-tested with an in-memory fake. HTTP route handlers and (later) the MCP endpoint are thin adapters over that one service. HTML is stored as Postgres `TEXT` — no blob store.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vitest, Supabase (`@supabase/supabase-js`), `nanoid` for slugs, Node `crypto` for hashing, Vercel Cron for expiry.

**This is Plan 1 of 3.** Plan 2 = MCP endpoint + OAuth. Plan 3 = Web UI + `@vercel/og` cards + QR. Both build on the service layer and API from this plan.

**Spec:** `docs/superpowers/specs/2026-06-01-html-artifact-sharing-design.md`

---

## File Structure

**Core service layer (framework-free, fully unit-tested):**
- `lib/artifacts/types.ts` — shared domain types (`Visibility`, `Ttl`, `ArtifactRecord`, inputs/results).
- `lib/artifacts/slug.ts` — `generateSlug()`.
- `lib/artifacts/ttl.ts` — `isTtl()`, `resolveExpiry()`, TTL table.
- `lib/artifacts/validate.ts` — `validateSize()`, `MAX_BYTES`.
- `lib/artifacts/tokens.ts` — edit-token + password hashing (`generateEditToken`, `hashToken`, `verifyToken`, `hashPassword`, `verifyPassword`).
- `lib/artifacts/html-meta.ts` — `extractTitle()`.
- `lib/artifacts/repository.ts` — `ArtifactRepository` port interface + `NewArtifact` type.
- `lib/artifacts/service.ts` — `deployArtifact`, `updateArtifact`, `setVisibility`, `viewArtifact`, caps/rate-limit logic, `ServiceDeps`.
- `lib/artifacts/errors.ts` — typed `ServiceError` with codes.
- `lib/artifacts/constants.ts` — caps and rate-limit values.

**Data access (Supabase adapter):**
- `lib/db/supabase.ts` — server Supabase client factory (service-role).
- `lib/db/artifact-repository.ts` — `SupabaseArtifactRepository implements ArtifactRepository`.
- `supabase/migrations/0001_artifacts.sql` — schema.

**Test doubles & tests:**
- `lib/artifacts/__tests__/in-memory-repository.ts` — `InMemoryRepository implements ArtifactRepository`.
- `lib/artifacts/__tests__/*.test.ts` — unit tests per module.

**HTTP adapters (thin):**
- `lib/http/request-context.ts` — `getIpHash(req)` helper.
- `app/api/deploy/route.ts` — `POST` deploy.
- `app/api/artifacts/[slug]/route.ts` — `PATCH` update content / visibility.
- `app/a/[slug]/page.tsx` — viewer (server component) + `app/a/[slug]/view.ts` render helper.
- `app/a/[slug]/password/route.ts` — `POST` password check → signed cookie.
- `app/api/cron/expire/route.ts` — expiry sweep.
- `vercel.json` — cron schedule.

**Config:**
- `.env.local` (gitignored) + `.env.example` — env var documentation.

---

## Conventions

- Package manager: **npm**. Test runner: **Vitest**. Run a single test file: `npx vitest run <path>`.
- Commit after every task with the message shown in its final step.
- Core service modules import **no** Next.js or Supabase code. Only `lib/db/*` and `app/*` may import Supabase / Next.

---

### Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `next.config.ts`, `.env.example`, `app/layout.tsx`, `app/page.tsx`, `lib/artifacts/__tests__/smoke.test.ts`

- [ ] **Step 1: Create the Next.js app in-place**

Run (in the repo root, which already contains `LICENSE`, `.gitignore`, `docs/`):
```bash
npx create-next-app@latest . --ts --app --no-tailwind --no-src-dir --no-eslint --import-alias "@/*" --use-npm --yes
```
If it refuses because the directory isn't empty, scaffold in a temp dir and copy:
```bash
npx create-next-app@latest .nextapp --ts --app --no-tailwind --no-src-dir --no-eslint --import-alias "@/*" --use-npm --yes
cp -r .nextapp/. . && rm -rf .nextapp
```

- [ ] **Step 2: Add test + runtime dependencies**

```bash
npm i nanoid @supabase/supabase-js
npm i -D vitest
```

- [ ] **Step 3: Add Vitest config and test script**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: { environment: 'node', include: ['**/*.test.ts'] },
  resolve: { alias: { '@': resolve(__dirname, '.') } },
});
```
In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test**

Create `lib/artifacts/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 6: Create `.env.example`**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
# App
APP_BASE_URL=http://localhost:3000
# Cookies / cron
COOKIE_SECRET=change-me-32-bytes-min
CRON_SECRET=change-me-16-chars-min
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest"
```

---

### Task 2: Domain types

**Files:**
- Create: `lib/artifacts/types.ts`

- [ ] **Step 1: Write the types**

Create `lib/artifacts/types.ts`:
```ts
export type Visibility = 'public' | 'password';
export type Ttl = '1h' | '1d' | '7d' | '30d';

export interface ArtifactRecord {
  id: string;
  slug: string;
  content: string;
  title: string | null;
  visibility: Visibility;
  passwordHash: string | null;
  ownerId: string | null;
  editTokenHash: string;
  deployIpHash: string | null;
  createdAt: Date;
  expiresAt: Date;
  viewCount: number;
}

/** Caller auth presented on update/visibility changes. */
export interface AuthContext {
  ownerId?: string | null;
  editToken?: string | null;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add lib/artifacts/types.ts
git commit -m "feat: add artifact domain types"
```

---

### Task 3: Slug generation

**Files:**
- Create: `lib/artifacts/slug.ts`
- Test: `lib/artifacts/__tests__/slug.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/artifacts/__tests__/slug.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { generateSlug, SLUG_ALPHABET } from '@/lib/artifacts/slug';

describe('generateSlug', () => {
  it('returns a 7-char slug from the safe alphabet', () => {
    const slug = generateSlug();
    expect(slug).toHaveLength(7);
    for (const ch of slug) expect(SLUG_ALPHABET).toContain(ch);
  });

  it('excludes ambiguous characters 0 1 o l i', () => {
    for (const ch of '01oli') expect(SLUG_ALPHABET).not.toContain(ch);
  });

  it('is highly unlikely to collide across 1000 generations', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateSlug());
    expect(seen.size).toBe(1000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/artifacts/__tests__/slug.test.ts`
Expected: FAIL — cannot find module `@/lib/artifacts/slug`.

- [ ] **Step 3: Implement**

Create `lib/artifacts/slug.ts`:
```ts
import { customAlphabet } from 'nanoid';

// Lowercase letters + digits, excluding ambiguous 0 1 o l i.
export const SLUG_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const nano = customAlphabet(SLUG_ALPHABET, 7);

export function generateSlug(): string {
  return nano();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/artifacts/__tests__/slug.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/artifacts/slug.ts lib/artifacts/__tests__/slug.test.ts
git commit -m "feat: add slug generation"
```

---

### Task 4: TTL resolution

**Files:**
- Create: `lib/artifacts/ttl.ts`
- Test: `lib/artifacts/__tests__/ttl.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/artifacts/__tests__/ttl.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isTtl, resolveExpiry } from '@/lib/artifacts/ttl';

describe('isTtl', () => {
  it('accepts the four allowed values', () => {
    for (const v of ['1h', '1d', '7d', '30d']) expect(isTtl(v)).toBe(true);
  });
  it('rejects anything else', () => {
    for (const v of ['', '2h', 'permanent', '60d']) expect(isTtl(v)).toBe(false);
  });
});

describe('resolveExpiry', () => {
  const base = new Date('2026-01-01T00:00:00.000Z');
  it('adds the right number of seconds', () => {
    expect(resolveExpiry('1h', base).toISOString()).toBe('2026-01-01T01:00:00.000Z');
    expect(resolveExpiry('1d', base).toISOString()).toBe('2026-01-02T00:00:00.000Z');
    expect(resolveExpiry('7d', base).toISOString()).toBe('2026-01-08T00:00:00.000Z');
    expect(resolveExpiry('30d', base).toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/artifacts/__tests__/ttl.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/artifacts/ttl.ts`:
```ts
import type { Ttl } from '@/lib/artifacts/types';

const TTL_SECONDS: Record<Ttl, number> = {
  '1h': 3600,
  '1d': 86_400,
  '7d': 604_800,
  '30d': 2_592_000,
};

export function isTtl(value: string): value is Ttl {
  return Object.prototype.hasOwnProperty.call(TTL_SECONDS, value);
}

export function resolveExpiry(ttl: Ttl, from: Date = new Date()): Date {
  return new Date(from.getTime() + TTL_SECONDS[ttl] * 1000);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/artifacts/__tests__/ttl.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/artifacts/ttl.ts lib/artifacts/__tests__/ttl.test.ts
git commit -m "feat: add TTL resolution"
```

---

### Task 5: Size validation

**Files:**
- Create: `lib/artifacts/validate.ts`
- Test: `lib/artifacts/__tests__/validate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/artifacts/__tests__/validate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validateSize, MAX_BYTES } from '@/lib/artifacts/validate';

describe('validateSize', () => {
  it('accepts content within the 5MB cap', () => {
    expect(validateSize('<html></html>').ok).toBe(true);
  });
  it('rejects content over 5MB', () => {
    const big = 'a'.repeat(MAX_BYTES + 1);
    const r = validateSize(big);
    expect(r.ok).toBe(false);
  });
  it('counts UTF-8 bytes, not characters', () => {
    // each emoji is 4 bytes; fill just over the cap with multibyte chars
    const justOver = '😀'.repeat(Math.ceil((MAX_BYTES + 1) / 4));
    expect(validateSize(justOver).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/artifacts/__tests__/validate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/artifacts/validate.ts`:
```ts
export const MAX_BYTES = 5 * 1024 * 1024;

export type SizeResult = { ok: true } | { ok: false; error: string };

export function validateSize(content: string): SizeResult {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_BYTES) {
    return { ok: false, error: `Content exceeds 5MB limit (${bytes} bytes)` };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/artifacts/__tests__/validate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/artifacts/validate.ts lib/artifacts/__tests__/validate.test.ts
git commit -m "feat: add 5MB size validation"
```

---

### Task 6: Token and password hashing

**Files:**
- Create: `lib/artifacts/tokens.ts`
- Test: `lib/artifacts/__tests__/tokens.test.ts`

Design: edit tokens are high-entropy random secrets → store a fast **SHA-256** hash. Passwords are low-entropy human input → store a slow salted **scrypt** hash. Both verified with `timingSafeEqual`.

- [ ] **Step 1: Write the failing test**

Create `lib/artifacts/__tests__/tokens.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  generateEditToken, hashToken, verifyToken,
  hashPassword, verifyPassword,
} from '@/lib/artifacts/tokens';

describe('edit tokens', () => {
  it('generates distinct high-entropy tokens', () => {
    const a = generateEditToken();
    const b = generateEditToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
  it('verifies a token against its hash', () => {
    const t = generateEditToken();
    const h = hashToken(t);
    expect(verifyToken(t, h)).toBe(true);
    expect(verifyToken('wrong-token', h)).toBe(false);
  });
});

describe('passwords', () => {
  it('verifies the correct password and rejects wrong ones', async () => {
    const h = await hashPassword('hunter2');
    expect(await verifyPassword('hunter2', h)).toBe(true);
    expect(await verifyPassword('nope', h)).toBe(false);
  });
  it('produces a different hash each time (salted)', async () => {
    expect(await hashPassword('x')).not.toBe(await hashPassword('x'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/artifacts/__tests__/tokens.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/artifacts/tokens.ts`:
```ts
import {
  randomBytes, createHash, scrypt, timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  pw: string | Buffer, salt: Buffer, keylen: number,
) => Promise<Buffer>;

export function generateEditToken(): string {
  return randomBytes(24).toString('base64url'); // 32 chars
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyToken(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const derived = await scryptAsync(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/artifacts/__tests__/tokens.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/artifacts/tokens.ts lib/artifacts/__tests__/tokens.test.ts
git commit -m "feat: add token and password hashing"
```

---

### Task 7: Title extraction

**Files:**
- Create: `lib/artifacts/html-meta.ts`
- Test: `lib/artifacts/__tests__/html-meta.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/artifacts/__tests__/html-meta.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { extractTitle } from '@/lib/artifacts/html-meta';

describe('extractTitle', () => {
  it('pulls the <title> text', () => {
    expect(extractTitle('<html><head><title>My Page</title></head></html>')).toBe('My Page');
  });
  it('is case-insensitive and trims whitespace', () => {
    expect(extractTitle('<TITLE>  Spaced  </TITLE>')).toBe('Spaced');
  });
  it('returns null when there is no title', () => {
    expect(extractTitle('<html><body>hi</body></html>')).toBeNull();
  });
  it('caps very long titles at 200 chars', () => {
    const long = 'a'.repeat(500);
    expect(extractTitle(`<title>${long}</title>`)).toHaveLength(200);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/artifacts/__tests__/html-meta.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/artifacts/html-meta.ts`:
```ts
export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const text = match[1].trim();
  return text ? text.slice(0, 200) : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/artifacts/__tests__/html-meta.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/artifacts/html-meta.ts lib/artifacts/__tests__/html-meta.test.ts
git commit -m "feat: add <title> extraction"
```

---

### Task 8: Errors and constants

**Files:**
- Create: `lib/artifacts/errors.ts`, `lib/artifacts/constants.ts`

- [ ] **Step 1: Create the error type**

Create `lib/artifacts/errors.ts`:
```ts
export type ServiceErrorCode =
  | 'too_large'
  | 'invalid_ttl'
  | 'invalid_visibility'
  | 'password_required'
  | 'not_found'
  | 'forbidden'
  | 'unauthorized'
  | 'rate_limited'
  | 'live_cap_reached';

export class ServiceError extends Error {
  constructor(public code: ServiceErrorCode, message: string) {
    super(message);
    this.name = 'ServiceError';
  }
}
```

- [ ] **Step 2: Create constants**

Create `lib/artifacts/constants.ts`:
```ts
/** Concurrent live (non-expired) artifacts allowed. */
export const ANON_LIVE_CAP = 5;
export const ACCOUNT_LIVE_CAP = 50;

/** Deploy rate limit per IP. */
export const RATE_LIMIT_MAX = 60;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/artifacts/errors.ts lib/artifacts/constants.ts
git commit -m "feat: add service errors and capacity constants"
```

---

### Task 9: Repository port + in-memory fake

**Files:**
- Create: `lib/artifacts/repository.ts`
- Create: `lib/artifacts/__tests__/in-memory-repository.ts`
- Test: `lib/artifacts/__tests__/in-memory-repository.test.ts`

- [ ] **Step 1: Define the port**

Create `lib/artifacts/repository.ts`:
```ts
import type { ArtifactRecord, Visibility } from '@/lib/artifacts/types';

export interface NewArtifact {
  slug: string;
  content: string;
  title: string | null;
  visibility: Visibility;
  passwordHash: string | null;
  ownerId: string | null;
  editTokenHash: string;
  deployIpHash: string | null;
  expiresAt: Date;
}

export interface ArtifactRepository {
  insert(rec: NewArtifact): Promise<ArtifactRecord>;
  findBySlug(slug: string): Promise<ArtifactRecord | null>;
  slugExists(slug: string): Promise<boolean>;
  updateContent(slug: string, content: string, title: string | null): Promise<ArtifactRecord>;
  updateVisibility(slug: string, visibility: Visibility, passwordHash: string | null): Promise<ArtifactRecord>;
  incrementViews(slug: string): Promise<void>;
  countLiveByOwner(ownerId: string, now: Date): Promise<number>;
  countLiveByIp(ipHash: string, now: Date): Promise<number>;
  countRecentDeploysByIp(ipHash: string, since: Date): Promise<number>;
  deleteExpired(now: Date): Promise<number>;
}
```

- [ ] **Step 2: Write the failing test for the fake**

Create `lib/artifacts/__tests__/in-memory-repository.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';

const base = (over = {}) => ({
  slug: 's1', content: '<html></html>', title: null,
  visibility: 'public' as const, passwordHash: null,
  ownerId: null, editTokenHash: 'h', deployIpHash: 'ip',
  expiresAt: new Date('2030-01-01T00:00:00Z'), ...over,
});

describe('InMemoryRepository', () => {
  it('inserts and finds by slug', async () => {
    const repo = new InMemoryRepository();
    await repo.insert(base());
    const found = await repo.findBySlug('s1');
    expect(found?.slug).toBe('s1');
    expect(found?.viewCount).toBe(0);
  });

  it('reports slug existence', async () => {
    const repo = new InMemoryRepository();
    await repo.insert(base());
    expect(await repo.slugExists('s1')).toBe(true);
    expect(await repo.slugExists('nope')).toBe(false);
  });

  it('counts live artifacts by owner, excluding expired', async () => {
    const repo = new InMemoryRepository();
    const now = new Date('2026-06-01T00:00:00Z');
    await repo.insert(base({ slug: 'a', ownerId: 'u1', expiresAt: new Date('2026-07-01Z') }));
    await repo.insert(base({ slug: 'b', ownerId: 'u1', expiresAt: new Date('2026-01-01Z') })); // expired
    expect(await repo.countLiveByOwner('u1', now)).toBe(1);
  });

  it('deletes expired rows and returns the count', async () => {
    const repo = new InMemoryRepository();
    const now = new Date('2026-06-01T00:00:00Z');
    await repo.insert(base({ slug: 'a', expiresAt: new Date('2026-01-01Z') }));
    await repo.insert(base({ slug: 'b', expiresAt: new Date('2026-12-01Z') }));
    expect(await repo.deleteExpired(now)).toBe(1);
    expect(await repo.findBySlug('a')).toBeNull();
    expect(await repo.findBySlug('b')).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run lib/artifacts/__tests__/in-memory-repository.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the fake**

Create `lib/artifacts/__tests__/in-memory-repository.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { ArtifactRecord, Visibility } from '@/lib/artifacts/types';
import type { ArtifactRepository, NewArtifact } from '@/lib/artifacts/repository';

export class InMemoryRepository implements ArtifactRepository {
  private rows = new Map<string, ArtifactRecord>();
  /** Deploy timestamps per ipHash, for rate-limit tests. */
  deployLog: { ipHash: string; at: Date }[] = [];

  async insert(rec: NewArtifact): Promise<ArtifactRecord> {
    const row: ArtifactRecord = {
      id: randomUUID(),
      createdAt: new Date(),
      viewCount: 0,
      ...rec,
    };
    this.rows.set(rec.slug, row);
    if (rec.deployIpHash) this.deployLog.push({ ipHash: rec.deployIpHash, at: row.createdAt });
    return row;
  }

  async findBySlug(slug: string): Promise<ArtifactRecord | null> {
    return this.rows.get(slug) ?? null;
  }

  async slugExists(slug: string): Promise<boolean> {
    return this.rows.has(slug);
  }

  async updateContent(slug: string, content: string, title: string | null): Promise<ArtifactRecord> {
    const row = this.rows.get(slug);
    if (!row) throw new Error('not found');
    row.content = content;
    row.title = title;
    return row;
  }

  async updateVisibility(slug: string, visibility: Visibility, passwordHash: string | null): Promise<ArtifactRecord> {
    const row = this.rows.get(slug);
    if (!row) throw new Error('not found');
    row.visibility = visibility;
    row.passwordHash = passwordHash;
    return row;
  }

  async incrementViews(slug: string): Promise<void> {
    const row = this.rows.get(slug);
    if (row) row.viewCount += 1;
  }

  async countLiveByOwner(ownerId: string, now: Date): Promise<number> {
    return [...this.rows.values()].filter(r => r.ownerId === ownerId && r.expiresAt > now).length;
  }

  async countLiveByIp(ipHash: string, now: Date): Promise<number> {
    return [...this.rows.values()].filter(r => r.deployIpHash === ipHash && r.ownerId === null && r.expiresAt > now).length;
  }

  async countRecentDeploysByIp(ipHash: string, since: Date): Promise<number> {
    return this.deployLog.filter(d => d.ipHash === ipHash && d.at >= since).length;
  }

  async deleteExpired(now: Date): Promise<number> {
    let n = 0;
    for (const [slug, row] of this.rows) {
      if (row.expiresAt <= now) { this.rows.delete(slug); n++; }
    }
    return n;
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run lib/artifacts/__tests__/in-memory-repository.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/artifacts/repository.ts lib/artifacts/__tests__/in-memory-repository.ts lib/artifacts/__tests__/in-memory-repository.test.ts
git commit -m "feat: add repository port and in-memory fake"
```

---

### Task 10: Service — deployArtifact

**Files:**
- Create: `lib/artifacts/service.ts`
- Test: `lib/artifacts/__tests__/service.deploy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/artifacts/__tests__/service.deploy.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { deployArtifact } from '@/lib/artifacts/service';
import { ServiceError } from '@/lib/artifacts/errors';
import { MAX_BYTES } from '@/lib/artifacts/validate';
import { ANON_LIVE_CAP } from '@/lib/artifacts/constants';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';

const deps = {
  now: () => new Date('2026-06-01T00:00:00.000Z'),
  newSlug: () => 'fixedslug',
  newEditToken: () => 'fixed-edit-token-aaaaaaaaaaaaaaaa',
  baseUrl: 'https://artifact.host',
};

describe('deployArtifact', () => {
  it('creates a public artifact and returns slug/url/token/expiry', async () => {
    const repo = new InMemoryRepository();
    const res = await deployArtifact(repo, { content: '<title>Hi</title>', ipHash: 'ip1' }, deps);
    expect(res.slug).toBe('fixedslug');
    expect(res.url).toBe('https://artifact.host/a/fixedslug');
    expect(res.editToken).toBe('fixed-edit-token-aaaaaaaaaaaaaaaa');
    expect(res.expiresAt.toISOString()).toBe('2026-06-08T00:00:00.000Z'); // default 7d
    const row = await repo.findBySlug('fixedslug');
    expect(row?.title).toBe('Hi');
    expect(row?.editTokenHash).not.toBe(res.editToken); // stored hashed
  });

  it('defaults ttl to 7d and visibility to public', async () => {
    const repo = new InMemoryRepository();
    const res = await deployArtifact(repo, { content: 'x', ipHash: 'ip1' }, deps);
    const row = await repo.findBySlug(res.slug);
    expect(row?.visibility).toBe('public');
  });

  it('hashes the password when visibility is password', async () => {
    const repo = new InMemoryRepository();
    const res = await deployArtifact(repo, {
      content: 'x', visibility: 'password', password: 'secret', ipHash: 'ip1',
    }, deps);
    const row = await repo.findBySlug(res.slug);
    expect(row?.visibility).toBe('password');
    expect(row?.passwordHash).toBeTruthy();
    expect(row?.passwordHash).not.toBe('secret');
  });

  it('rejects password visibility with no password', async () => {
    const repo = new InMemoryRepository();
    await expect(deployArtifact(repo, {
      content: 'x', visibility: 'password', ipHash: 'ip1',
    }, deps)).rejects.toMatchObject({ code: 'password_required' });
  });

  it('rejects an invalid ttl', async () => {
    const repo = new InMemoryRepository();
    await expect(deployArtifact(repo, {
      content: 'x', ttl: '99d' as never, ipHash: 'ip1',
    }, deps)).rejects.toMatchObject({ code: 'invalid_ttl' });
  });

  it('rejects content over 5MB', async () => {
    const repo = new InMemoryRepository();
    await expect(deployArtifact(repo, {
      content: 'a'.repeat(MAX_BYTES + 1), ipHash: 'ip1',
    }, deps)).rejects.toMatchObject({ code: 'too_large' });
  });

  it('enforces the anonymous live cap', async () => {
    const repo = new InMemoryRepository();
    let slug = 0;
    const seqDeps = { ...deps, newSlug: () => `slug${slug++}` };
    for (let i = 0; i < ANON_LIVE_CAP; i++) {
      await deployArtifact(repo, { content: 'x', ipHash: 'ipX' }, seqDeps);
    }
    await expect(deployArtifact(repo, { content: 'x', ipHash: 'ipX' }, seqDeps))
      .rejects.toMatchObject({ code: 'live_cap_reached' });
  });

  it('retries slug generation on collision', async () => {
    const repo = new InMemoryRepository();
    const slugs = ['dup', 'dup', 'unique'];
    let i = 0;
    const collidingDeps = { ...deps, newSlug: () => slugs[i++] };
    await deployArtifact(repo, { content: 'x', ipHash: 'ip1' }, collidingDeps); // takes 'dup'
    const res = await deployArtifact(repo, { content: 'x', ipHash: 'ip2' }, collidingDeps); // 'dup' taken -> 'unique'
    expect(res.slug).toBe('unique');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/artifacts/__tests__/service.deploy.test.ts`
Expected: FAIL — `deployArtifact` not found.

- [ ] **Step 3: Implement the service (deploy + shared deps)**

Create `lib/artifacts/service.ts`:
```ts
import type { AuthContext, Ttl, Visibility } from '@/lib/artifacts/types';
import type { ArtifactRepository } from '@/lib/artifacts/repository';
import { ServiceError } from '@/lib/artifacts/errors';
import { validateSize } from '@/lib/artifacts/validate';
import { isTtl, resolveExpiry } from '@/lib/artifacts/ttl';
import { extractTitle } from '@/lib/artifacts/html-meta';
import { generateSlug } from '@/lib/artifacts/slug';
import {
  generateEditToken, hashToken, verifyToken,
  hashPassword, verifyPassword,
} from '@/lib/artifacts/tokens';
import {
  ANON_LIVE_CAP, ACCOUNT_LIVE_CAP, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS,
} from '@/lib/artifacts/constants';

export interface ServiceDeps {
  now(): Date;
  newSlug(): string;
  newEditToken(): string;
  baseUrl: string;
}

export const defaultDeps: ServiceDeps = {
  now: () => new Date(),
  newSlug: generateSlug,
  newEditToken: generateEditToken,
  baseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
};

function urlFor(deps: ServiceDeps, slug: string): string {
  return `${deps.baseUrl.replace(/\/$/, '')}/a/${slug}`;
}

async function uniqueSlug(repo: ArtifactRepository, deps: ServiceDeps): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const slug = deps.newSlug();
    if (!(await repo.slugExists(slug))) return slug;
  }
  throw new ServiceError('rate_limited', 'Could not allocate a unique slug');
}

export interface DeployInput {
  content: string;
  visibility?: Visibility;
  password?: string | null;
  ttl?: Ttl;
  ownerId?: string | null;
  ipHash: string;
}

export interface DeployResult {
  slug: string;
  url: string;
  editToken: string;
  expiresAt: Date;
}

export async function deployArtifact(
  repo: ArtifactRepository,
  input: DeployInput,
  deps: ServiceDeps = defaultDeps,
): Promise<DeployResult> {
  const size = validateSize(input.content);
  if (!size.ok) throw new ServiceError('too_large', size.error);

  const ttl = input.ttl ?? '7d';
  if (!isTtl(ttl)) throw new ServiceError('invalid_ttl', `Invalid ttl: ${ttl}`);

  const visibility = input.visibility ?? 'public';
  if (visibility !== 'public' && visibility !== 'password') {
    throw new ServiceError('invalid_visibility', `Invalid visibility: ${visibility}`);
  }
  if (visibility === 'password' && !input.password) {
    throw new ServiceError('password_required', 'A password is required for password visibility');
  }

  const now = deps.now();

  // Rate limit (per IP).
  const since = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
  if (await repo.countRecentDeploysByIp(input.ipHash, since) >= RATE_LIMIT_MAX) {
    throw new ServiceError('rate_limited', 'Too many deploys; try again later');
  }

  // Live-artifact cap.
  const ownerId = input.ownerId ?? null;
  const live = ownerId
    ? await repo.countLiveByOwner(ownerId, now)
    : await repo.countLiveByIp(input.ipHash, now);
  const cap = ownerId ? ACCOUNT_LIVE_CAP : ANON_LIVE_CAP;
  if (live >= cap) {
    throw new ServiceError('live_cap_reached', `Live artifact cap reached (${cap})`);
  }

  const slug = await uniqueSlug(repo, deps);
  const editToken = deps.newEditToken();
  const passwordHash = visibility === 'password'
    ? await hashPassword(input.password as string)
    : null;

  await repo.insert({
    slug,
    content: input.content,
    title: extractTitle(input.content),
    visibility,
    passwordHash,
    ownerId,
    editTokenHash: hashToken(editToken),
    deployIpHash: input.ipHash,
    expiresAt: resolveExpiry(ttl, now),
  });

  return { slug, url: urlFor(deps, slug), editToken, expiresAt: resolveExpiry(ttl, now) };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/artifacts/__tests__/service.deploy.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/artifacts/service.ts lib/artifacts/__tests__/service.deploy.test.ts
git commit -m "feat: add deployArtifact service with caps and rate limiting"
```

---

### Task 11: Service — authorize + updateArtifact

**Files:**
- Modify: `lib/artifacts/service.ts`
- Test: `lib/artifacts/__tests__/service.update.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/artifacts/__tests__/service.update.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { deployArtifact, updateArtifact } from '@/lib/artifacts/service';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';

const deps = {
  now: () => new Date('2026-06-01T00:00:00.000Z'),
  newSlug: () => 'slugA',
  newEditToken: () => 'edit-token-xxxxxxxxxxxxxxxxxxxxxx',
  baseUrl: 'https://artifact.host',
};

async function seed(repo: InMemoryRepository, over = {}) {
  return deployArtifact(repo, { content: '<title>v1</title>', ipHash: 'ip1', ...over }, deps);
}

describe('updateArtifact', () => {
  it('updates content with a valid edit token, keeping the URL', async () => {
    const repo = new InMemoryRepository();
    const { editToken } = await seed(repo);
    const res = await updateArtifact(repo, 'slugA', '<title>v2</title>', { editToken }, deps);
    expect(res.url).toBe('https://artifact.host/a/slugA');
    expect((await repo.findBySlug('slugA'))?.title).toBe('v2');
  });

  it('does NOT reset expires_at on update', async () => {
    const repo = new InMemoryRepository();
    const { editToken, expiresAt } = await seed(repo);
    const laterDeps = { ...deps, now: () => new Date('2026-06-05T00:00:00.000Z') };
    const res = await updateArtifact(repo, 'slugA', 'new', { editToken }, laterDeps);
    expect(res.expiresAt.toISOString()).toBe(expiresAt.toISOString());
  });

  it('allows the owner to update via ownerId', async () => {
    const repo = new InMemoryRepository();
    await seed(repo, { ownerId: 'u1' });
    const res = await updateArtifact(repo, 'slugA', 'owned', { ownerId: 'u1' }, deps);
    expect((await repo.findBySlug('slugA'))?.content).toBe('owned');
    expect(res.slug).toBe('slugA');
  });

  it('rejects a wrong edit token', async () => {
    const repo = new InMemoryRepository();
    await seed(repo);
    await expect(updateArtifact(repo, 'slugA', 'x', { editToken: 'wrong' }, deps))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('rejects a non-owner ownerId', async () => {
    const repo = new InMemoryRepository();
    await seed(repo, { ownerId: 'u1' });
    await expect(updateArtifact(repo, 'slugA', 'x', { ownerId: 'u2' }, deps))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('404s for a missing slug', async () => {
    const repo = new InMemoryRepository();
    await expect(updateArtifact(repo, 'ghost', 'x', { editToken: 't' }, deps))
      .rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects oversized update content', async () => {
    const repo = new InMemoryRepository();
    const { editToken } = await seed(repo);
    await expect(updateArtifact(repo, 'slugA', 'a'.repeat(5 * 1024 * 1024 + 1), { editToken }, deps))
      .rejects.toMatchObject({ code: 'too_large' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/artifacts/__tests__/service.update.test.ts`
Expected: FAIL — `updateArtifact` not found.

- [ ] **Step 3: Implement (append to `lib/artifacts/service.ts`)**

Add to the bottom of `lib/artifacts/service.ts`:
```ts
import type { ArtifactRecord } from '@/lib/artifacts/types';

/** Throws ServiceError('not_found' | 'forbidden') unless the auth context is allowed. */
function authorize(record: ArtifactRecord, auth: AuthContext): void {
  const byOwner = !!auth.ownerId && record.ownerId === auth.ownerId;
  const byToken = !!auth.editToken && verifyToken(auth.editToken, record.editTokenHash);
  if (!byOwner && !byToken) {
    throw new ServiceError('forbidden', 'Not authorized to modify this artifact');
  }
}

export interface UpdateResult {
  slug: string;
  url: string;
  expiresAt: Date; // unchanged from original deploy
}

export async function updateArtifact(
  repo: ArtifactRepository,
  slug: string,
  content: string,
  auth: AuthContext,
  deps: ServiceDeps = defaultDeps,
): Promise<UpdateResult> {
  const record = await repo.findBySlug(slug);
  if (!record) throw new ServiceError('not_found', 'Artifact not found');
  authorize(record, auth);

  const size = validateSize(content);
  if (!size.ok) throw new ServiceError('too_large', size.error);

  await repo.updateContent(slug, content, extractTitle(content));
  return { slug, url: urlFor(deps, slug), expiresAt: record.expiresAt };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/artifacts/__tests__/service.update.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/artifacts/service.ts lib/artifacts/__tests__/service.update.test.ts
git commit -m "feat: add updateArtifact with owner/edit-token auth, TTL preserved"
```

---

### Task 12: Service — setVisibility

**Files:**
- Modify: `lib/artifacts/service.ts`
- Test: `lib/artifacts/__tests__/service.visibility.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/artifacts/__tests__/service.visibility.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { deployArtifact, setVisibility } from '@/lib/artifacts/service';
import { verifyPassword } from '@/lib/artifacts/tokens';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';

const deps = {
  now: () => new Date('2026-06-01T00:00:00.000Z'),
  newSlug: () => 'slugV',
  newEditToken: () => 'edit-token-yyyyyyyyyyyyyyyyyyyyyy',
  baseUrl: 'https://artifact.host',
};

describe('setVisibility', () => {
  it('sets a password (stored hashed) with a valid edit token', async () => {
    const repo = new InMemoryRepository();
    const { editToken } = await deployArtifact(repo, { content: 'x', ipHash: 'ip1' }, deps);
    await setVisibility(repo, 'slugV', 'password', 'pw', { editToken });
    const row = await repo.findBySlug('slugV');
    expect(row?.visibility).toBe('password');
    expect(await verifyPassword('pw', row!.passwordHash!)).toBe(true);
  });

  it('clears the password hash when switching back to public', async () => {
    const repo = new InMemoryRepository();
    const { editToken } = await deployArtifact(repo, {
      content: 'x', visibility: 'password', password: 'pw', ipHash: 'ip1',
    }, deps);
    await setVisibility(repo, 'slugV', 'public', null, { editToken });
    const row = await repo.findBySlug('slugV');
    expect(row?.visibility).toBe('public');
    expect(row?.passwordHash).toBeNull();
  });

  it('requires a password when switching to password visibility', async () => {
    const repo = new InMemoryRepository();
    const { editToken } = await deployArtifact(repo, { content: 'x', ipHash: 'ip1' }, deps);
    await expect(setVisibility(repo, 'slugV', 'password', null, { editToken }))
      .rejects.toMatchObject({ code: 'password_required' });
  });

  it('rejects an unauthorized caller', async () => {
    const repo = new InMemoryRepository();
    await deployArtifact(repo, { content: 'x', ipHash: 'ip1' }, deps);
    await expect(setVisibility(repo, 'slugV', 'public', null, { editToken: 'wrong' }))
      .rejects.toMatchObject({ code: 'forbidden' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/artifacts/__tests__/service.visibility.test.ts`
Expected: FAIL — `setVisibility` not found.

- [ ] **Step 3: Implement (append to `lib/artifacts/service.ts`)**

```ts
export async function setVisibility(
  repo: ArtifactRepository,
  slug: string,
  visibility: Visibility,
  password: string | null,
  auth: AuthContext,
): Promise<{ ok: true }> {
  const record = await repo.findBySlug(slug);
  if (!record) throw new ServiceError('not_found', 'Artifact not found');
  authorize(record, auth);

  if (visibility !== 'public' && visibility !== 'password') {
    throw new ServiceError('invalid_visibility', `Invalid visibility: ${visibility}`);
  }
  if (visibility === 'password' && !password) {
    throw new ServiceError('password_required', 'A password is required for password visibility');
  }

  const passwordHash = visibility === 'password' ? await hashPassword(password as string) : null;
  await repo.updateVisibility(slug, visibility, passwordHash);
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/artifacts/__tests__/service.visibility.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/artifacts/service.ts lib/artifacts/__tests__/service.visibility.test.ts
git commit -m "feat: add setVisibility service"
```

---

### Task 13: Service — viewArtifact

**Files:**
- Modify: `lib/artifacts/service.ts`
- Test: `lib/artifacts/__tests__/service.view.test.ts`

Behavior: returns the HTML only when authorized. Public → always. Password → only when `passwordVerified` is true. Expired → `not_found`. Increments the view count when content is actually served.

- [ ] **Step 1: Write the failing test**

Create `lib/artifacts/__tests__/service.view.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { deployArtifact, viewArtifact } from '@/lib/artifacts/service';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';

const deps = {
  now: () => new Date('2026-06-01T00:00:00.000Z'),
  newSlug: () => 'slugW',
  newEditToken: () => 'edit-token-zzzzzzzzzzzzzzzzzzzzzz',
  baseUrl: 'https://artifact.host',
};

describe('viewArtifact', () => {
  it('serves public content and increments views', async () => {
    const repo = new InMemoryRepository();
    await deployArtifact(repo, { content: '<h1>hello</h1>', ipHash: 'ip1' }, deps);
    const res = await viewArtifact(repo, 'slugW', { passwordVerified: false }, deps);
    expect(res.status).toBe('ok');
    if (res.status === 'ok') expect(res.content).toBe('<h1>hello</h1>');
    expect((await repo.findBySlug('slugW'))?.viewCount).toBe(1);
  });

  it('gates password content until verified, without leaking HTML', async () => {
    const repo = new InMemoryRepository();
    await deployArtifact(repo, {
      content: '<secret/>', visibility: 'password', password: 'pw', ipHash: 'ip1',
    }, deps);
    const gated = await viewArtifact(repo, 'slugW', { passwordVerified: false }, deps);
    expect(gated.status).toBe('password_required');
    expect(JSON.stringify(gated)).not.toContain('secret');
    expect((await repo.findBySlug('slugW'))?.viewCount).toBe(0); // no view counted while gated

    const ok = await viewArtifact(repo, 'slugW', { passwordVerified: true }, deps);
    expect(ok.status).toBe('ok');
    if (ok.status === 'ok') expect(ok.content).toBe('<secret/>');
  });

  it('treats an expired artifact as not found', async () => {
    const repo = new InMemoryRepository();
    await deployArtifact(repo, { content: 'x', ttl: '1h', ipHash: 'ip1' }, deps);
    const later = { ...deps, now: () => new Date('2026-06-02T00:00:00.000Z') };
    const res = await viewArtifact(repo, 'slugW', { passwordVerified: false }, later);
    expect(res.status).toBe('not_found');
  });

  it('returns not_found for an unknown slug', async () => {
    const repo = new InMemoryRepository();
    const res = await viewArtifact(repo, 'ghost', { passwordVerified: false }, deps);
    expect(res.status).toBe('not_found');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/artifacts/__tests__/service.view.test.ts`
Expected: FAIL — `viewArtifact` not found.

- [ ] **Step 3: Implement (append to `lib/artifacts/service.ts`)**

```ts
export type ViewResult =
  | { status: 'ok'; content: string; title: string | null; viewCount: number }
  | { status: 'password_required'; title: string | null }
  | { status: 'not_found' };

export async function viewArtifact(
  repo: ArtifactRepository,
  slug: string,
  ctx: { passwordVerified: boolean },
  deps: ServiceDeps = defaultDeps,
): Promise<ViewResult> {
  const record = await repo.findBySlug(slug);
  if (!record) return { status: 'not_found' };
  if (record.expiresAt <= deps.now()) return { status: 'not_found' };

  if (record.visibility === 'password' && !ctx.passwordVerified) {
    return { status: 'password_required', title: record.title };
  }

  await repo.incrementViews(slug);
  return {
    status: 'ok',
    content: record.content,
    title: record.title,
    viewCount: record.viewCount + 1,
  };
}

/** Verify a password attempt against the stored hash for a slug. */
export async function checkPassword(
  repo: ArtifactRepository,
  slug: string,
  password: string,
  deps: ServiceDeps = defaultDeps,
): Promise<boolean> {
  const record = await repo.findBySlug(slug);
  if (!record || record.expiresAt <= deps.now()) return false;
  if (record.visibility !== 'password' || !record.passwordHash) return false;
  return verifyPassword(password, record.passwordHash);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/artifacts/__tests__/service.view.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS (all suites green).

- [ ] **Step 6: Commit**

```bash
git add lib/artifacts/service.ts lib/artifacts/__tests__/service.view.test.ts
git commit -m "feat: add viewArtifact and checkPassword (server-side gating)"
```

---

### Task 14: Supabase schema migration

**Files:**
- Create: `supabase/migrations/0001_artifacts.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0001_artifacts.sql`:
```sql
create extension if not exists "pgcrypto";

create table if not exists artifacts (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  content         text not null,
  title           text,
  visibility      text not null default 'public'
                  check (visibility in ('public','password')),
  password_hash   text,
  owner_id        uuid references auth.users(id) on delete set null,
  edit_token_hash text not null,
  deploy_ip_hash  text,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  view_count      bigint not null default 0
);

create index if not exists artifacts_expires_at_idx on artifacts (expires_at);
create index if not exists artifacts_owner_id_idx   on artifacts (owner_id);
create index if not exists artifacts_ip_live_idx     on artifacts (deploy_ip_hash, expires_at);
```

- [ ] **Step 2: Apply it to your Supabase project**

Either via the Supabase SQL editor (paste the file) or, if the Supabase CLI is installed and linked:
```bash
supabase db push
```
Expected: table `artifacts` exists.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_artifacts.sql
git commit -m "feat: add artifacts table migration"
```

---

### Task 15: Supabase client + repository adapter

**Files:**
- Create: `lib/db/supabase.ts`
- Create: `lib/db/artifact-repository.ts`

Note: this adapter implements the same `ArtifactRepository` port already validated by the in-memory fake and the service tests. It is exercised end-to-end by the route smoke test in Task 19 (run against a real Supabase project), so no separate unit test here.

- [ ] **Step 1: Create the client factory**

Create `lib/db/supabase.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** Server-side client using the service-role key. Never import this in client components. */
export function getServiceClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
```

- [ ] **Step 2: Implement the repository**

Create `lib/db/artifact-repository.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArtifactRecord, Visibility } from '@/lib/artifacts/types';
import type { ArtifactRepository, NewArtifact } from '@/lib/artifacts/repository';

interface Row {
  id: string; slug: string; content: string; title: string | null;
  visibility: Visibility; password_hash: string | null;
  owner_id: string | null; edit_token_hash: string; deploy_ip_hash: string | null;
  created_at: string; expires_at: string; view_count: number;
}

function toRecord(r: Row): ArtifactRecord {
  return {
    id: r.id, slug: r.slug, content: r.content, title: r.title,
    visibility: r.visibility, passwordHash: r.password_hash,
    ownerId: r.owner_id, editTokenHash: r.edit_token_hash, deployIpHash: r.deploy_ip_hash,
    createdAt: new Date(r.created_at), expiresAt: new Date(r.expires_at), viewCount: Number(r.view_count),
  };
}

export class SupabaseArtifactRepository implements ArtifactRepository {
  constructor(private db: SupabaseClient) {}

  async insert(rec: NewArtifact): Promise<ArtifactRecord> {
    const { data, error } = await this.db.from('artifacts').insert({
      slug: rec.slug, content: rec.content, title: rec.title,
      visibility: rec.visibility, password_hash: rec.passwordHash,
      owner_id: rec.ownerId, edit_token_hash: rec.editTokenHash,
      deploy_ip_hash: rec.deployIpHash, expires_at: rec.expiresAt.toISOString(),
    }).select().single();
    if (error) throw error;
    return toRecord(data as Row);
  }

  async findBySlug(slug: string): Promise<ArtifactRecord | null> {
    const { data, error } = await this.db.from('artifacts').select().eq('slug', slug).maybeSingle();
    if (error) throw error;
    return data ? toRecord(data as Row) : null;
  }

  async slugExists(slug: string): Promise<boolean> {
    const { count, error } = await this.db.from('artifacts')
      .select('slug', { count: 'exact', head: true }).eq('slug', slug);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async updateContent(slug: string, content: string, title: string | null): Promise<ArtifactRecord> {
    const { data, error } = await this.db.from('artifacts')
      .update({ content, title }).eq('slug', slug).select().single();
    if (error) throw error;
    return toRecord(data as Row);
  }

  async updateVisibility(slug: string, visibility: Visibility, passwordHash: string | null): Promise<ArtifactRecord> {
    const { data, error } = await this.db.from('artifacts')
      .update({ visibility, password_hash: passwordHash }).eq('slug', slug).select().single();
    if (error) throw error;
    return toRecord(data as Row);
  }

  async incrementViews(slug: string): Promise<void> {
    // atomic increment via RPC; see migration note below
    const { error } = await this.db.rpc('increment_view_count', { p_slug: slug });
    if (error) throw error;
  }

  async countLiveByOwner(ownerId: string, now: Date): Promise<number> {
    const { count, error } = await this.db.from('artifacts')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId).gt('expires_at', now.toISOString());
    if (error) throw error;
    return count ?? 0;
  }

  async countLiveByIp(ipHash: string, now: Date): Promise<number> {
    const { count, error } = await this.db.from('artifacts')
      .select('id', { count: 'exact', head: true })
      .eq('deploy_ip_hash', ipHash).is('owner_id', null).gt('expires_at', now.toISOString());
    if (error) throw error;
    return count ?? 0;
  }

  async countRecentDeploysByIp(ipHash: string, since: Date): Promise<number> {
    const { count, error } = await this.db.from('artifacts')
      .select('id', { count: 'exact', head: true })
      .eq('deploy_ip_hash', ipHash).gt('created_at', since.toISOString());
    if (error) throw error;
    return count ?? 0;
  }

  async deleteExpired(now: Date): Promise<number> {
    const { data, error } = await this.db.from('artifacts')
      .delete().lt('expires_at', now.toISOString()).select('id');
    if (error) throw error;
    return data?.length ?? 0;
  }
}
```

- [ ] **Step 3: Add the atomic view-counter RPC migration**

Create `supabase/migrations/0002_increment_view_count.sql`:
```sql
create or replace function increment_view_count(p_slug text)
returns void language sql as $$
  update artifacts set view_count = view_count + 1 where slug = p_slug;
$$;
```
Apply it (SQL editor or `supabase db push`).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/ supabase/migrations/0002_increment_view_count.sql
git commit -m "feat: add Supabase repository adapter and view-count RPC"
```

---

### Task 16: Request context helper (IP hashing)

**Files:**
- Create: `lib/http/request-context.ts`
- Test: `lib/http/__tests__/request-context.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/http/__tests__/request-context.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getIpHash } from '@/lib/http/request-context';

function reqWith(headers: Record<string, string>): Request {
  return new Request('https://x/api/deploy', { headers });
}

describe('getIpHash', () => {
  it('hashes the first x-forwarded-for IP (not reversible to the raw IP)', () => {
    const h = getIpHash(reqWith({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('203.0.113.7');
  });
  it('is stable for the same IP and differs across IPs', () => {
    const a = getIpHash(reqWith({ 'x-forwarded-for': '203.0.113.7' }));
    const b = getIpHash(reqWith({ 'x-forwarded-for': '203.0.113.7' }));
    const c = getIpHash(reqWith({ 'x-forwarded-for': '198.51.100.2' }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it('falls back to a constant bucket when no IP header is present', () => {
    expect(getIpHash(reqWith({}))).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/http/__tests__/request-context.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/http/request-context.ts`:
```ts
import { createHash } from 'node:crypto';

export function getIpHash(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') ?? '';
  const ip = xff.split(',')[0]?.trim() || 'unknown';
  return createHash('sha256').update(ip).digest('hex');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/http/__tests__/request-context.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/http/request-context.ts lib/http/__tests__/request-context.test.ts
git commit -m "feat: add IP-hash request helper"
```

---

### Task 17: Deploy API route

**Files:**
- Create: `lib/http/errors.ts`
- Create: `app/api/deploy/route.ts`

- [ ] **Step 1: Map service errors to HTTP status**

Create `lib/http/errors.ts`:
```ts
import { ServiceError, type ServiceErrorCode } from '@/lib/artifacts/errors';

const STATUS: Record<ServiceErrorCode, number> = {
  too_large: 413,
  invalid_ttl: 400,
  invalid_visibility: 400,
  password_required: 400,
  not_found: 404,
  forbidden: 403,
  unauthorized: 401,
  rate_limited: 429,
  live_cap_reached: 429,
};

export function errorResponse(err: unknown): Response {
  if (err instanceof ServiceError) {
    return Response.json({ error: err.code, message: err.message }, { status: STATUS[err.code] });
  }
  console.error(err);
  return Response.json({ error: 'internal', message: 'Unexpected error' }, { status: 500 });
}
```

- [ ] **Step 2: Implement the route**

Create `app/api/deploy/route.ts`:
```ts
import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';
import { deployArtifact } from '@/lib/artifacts/service';
import { getIpHash } from '@/lib/http/request-context';
import { errorResponse } from '@/lib/http/errors';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (typeof body?.content !== 'string') {
      return Response.json({ error: 'invalid_visibility', message: 'content (string) is required' }, { status: 400 });
    }
    const repo = new SupabaseArtifactRepository(getServiceClient());
    const result = await deployArtifact(repo, {
      content: body.content,
      visibility: body.visibility,
      password: body.password ?? null,
      ttl: body.ttl,
      ownerId: null, // auth wiring arrives in Plan 2/3
      ipHash: getIpHash(req),
    });
    return Response.json({
      slug: result.slug,
      url: result.url,
      edit_token: result.editToken,
      expires_at: result.expiresAt.toISOString(),
    }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 3: Manual smoke test**

Start the dev server with env vars set (`.env.local`): `npm run dev`
In another terminal:
```bash
curl -s -X POST http://localhost:3000/api/deploy \
  -H 'content-type: application/json' \
  -d '{"content":"<title>Hello</title><h1>Hi</h1>","ttl":"1d"}'
```
Expected: JSON with `slug`, `url`, `edit_token`, `expires_at`.

- [ ] **Step 4: Commit**

```bash
git add lib/http/errors.ts app/api/deploy/route.ts
git commit -m "feat: add POST /api/deploy route"
```

---

### Task 18: Update / visibility API route

**Files:**
- Create: `app/api/artifacts/[slug]/route.ts`

- [ ] **Step 1: Implement the route**

Create `app/api/artifacts/[slug]/route.ts`:
```ts
import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';
import { updateArtifact, setVisibility } from '@/lib/artifacts/service';
import { errorResponse } from '@/lib/http/errors';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const editToken = req.headers.get('x-edit-token') ?? body?.edit_token ?? null;
    const auth = { ownerId: null, editToken };
    const repo = new SupabaseArtifactRepository(getServiceClient());

    // Visibility change request.
    if (typeof body?.visibility === 'string') {
      await setVisibility(repo, slug, body.visibility, body.password ?? null, auth);
      return Response.json({ ok: true });
    }

    // Content update request.
    if (typeof body?.content === 'string') {
      const res = await updateArtifact(repo, slug, body.content, auth);
      return Response.json({ slug: res.slug, url: res.url, expires_at: res.expiresAt.toISOString() });
    }

    return Response.json({ error: 'invalid_visibility', message: 'Provide content or visibility' }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 2: Manual smoke test**

Using a `slug` + `edit_token` from Task 17:
```bash
curl -s -X PATCH http://localhost:3000/api/artifacts/<slug> \
  -H 'content-type: application/json' -H 'x-edit-token: <edit_token>' \
  -d '{"content":"<title>v2</title><h1>Updated</h1>"}'
```
Expected: `{ "slug": "...", "url": "...", "expires_at": "..." }` (expiry unchanged).
Then try a wrong token and expect HTTP 403.

- [ ] **Step 3: Commit**

```bash
git add app/api/artifacts/
git commit -m "feat: add PATCH /api/artifacts/[slug] (update + visibility)"
```

---

### Task 19: Artifact viewer + password gate

**Files:**
- Create: `lib/http/cookies.ts`
- Create: `app/a/[slug]/page.tsx`
- Create: `app/a/[slug]/password/route.ts`
- Create: `app/a/[slug]/PasswordForm.tsx`

- [ ] **Step 1: Signed slug-scoped cookie helper**

Create `lib/http/cookies.ts`:
```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_MS = 30 * 60 * 1000; // 30 minutes

function secret(): string {
  return process.env.COOKIE_SECRET ?? 'dev-only-insecure-secret';
}

export function cookieName(slug: string): string {
  return `pw_${slug}`;
}

/** value = expiryMs.signature */
export function signPasswordCookie(slug: string): string {
  const exp = Date.now() + TTL_MS;
  const sig = createHmac('sha256', secret()).update(`${slug}.${exp}`).digest('hex');
  return `${exp}.${sig}`;
}

export function verifyPasswordCookie(slug: string, value: string | undefined): boolean {
  if (!value) return false;
  const [expStr, sig] = value.split('.');
  if (!expStr || !sig) return false;
  if (Number(expStr) < Date.now()) return false;
  const expected = createHmac('sha256', secret()).update(`${slug}.${expStr}`).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
```

- [ ] **Step 2: Password verification route (sets cookie)**

Create `app/a/[slug]/password/route.ts`:
```ts
import { cookies } from 'next/headers';
import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';
import { checkPassword } from '@/lib/artifacts/service';
import { cookieName, signPasswordCookie } from '@/lib/http/cookies';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await req.formData();
  const password = String(form.get('password') ?? '');

  const repo = new SupabaseArtifactRepository(getServiceClient());
  const ok = await checkPassword(repo, slug, password);

  if (!ok) {
    return Response.redirect(new URL(`/a/${slug}?error=1`, req.url), 303);
  }
  const jar = await cookies();
  jar.set(cookieName(slug), signPasswordCookie(slug), {
    httpOnly: true, sameSite: 'lax', secure: true, path: `/a/${slug}`, maxAge: 1800,
  });
  return Response.redirect(new URL(`/a/${slug}`, req.url), 303);
}
```

- [ ] **Step 3: Password form (client component)**

Create `app/a/[slug]/PasswordForm.tsx`:
```tsx
export function PasswordForm({ slug, error }: { slug: string; error: boolean }) {
  return (
    <form method="POST" action={`/a/${slug}/password`}
      style={{ maxWidth: 360, margin: '20vh auto', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 18 }}>This artifact is password-protected</h1>
      <input type="password" name="password" placeholder="Password" autoFocus
        style={{ width: '100%', padding: 10, margin: '12px 0' }} />
      {error && <p style={{ color: '#b00' }}>Incorrect password.</p>}
      <button type="submit" style={{ padding: '8px 16px' }}>View artifact</button>
    </form>
  );
}
```

- [ ] **Step 4: Viewer page**

Create `app/a/[slug]/page.tsx`:
```tsx
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';
import { viewArtifact } from '@/lib/artifacts/service';
import { cookieName, verifyPasswordCookie } from '@/lib/http/cookies';
import { PasswordForm } from './PasswordForm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Page({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  const jar = await cookies();
  const passwordVerified = verifyPasswordCookie(slug, jar.get(cookieName(slug))?.value);

  const repo = new SupabaseArtifactRepository(getServiceClient());
  const res = await viewArtifact(repo, slug, { passwordVerified });

  if (res.status === 'not_found') notFound();
  if (res.status === 'password_required') {
    return <PasswordForm slug={slug} error={error === '1'} />;
  }
  // Render the raw artifact HTML as a full-document srcdoc iframe (sandboxed, isolates artifact CSS/JS).
  return (
    <iframe
      srcDoc={res.content}
      sandbox="allow-scripts allow-popups allow-forms"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none' }}
    />
  );
}
```

- [ ] **Step 5: Add the `X-Robots-Tag: noindex` header for viewer paths**

Create `middleware.ts` at the repo root:
```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('X-Robots-Tag', 'noindex');
  return res;
}

export const config = { matcher: '/a/:path*' };
```

- [ ] **Step 6: Manual smoke test**

- Public: open `http://localhost:3000/a/<slug>` from Task 17 → artifact renders. Confirm response header `X-Robots-Tag: noindex` (`curl -I`).
- Password: deploy a password artifact (`{"content":"<h1>secret</h1>","visibility":"password","password":"pw","ttl":"1h"}`), open its URL → password form. Wrong password → "Incorrect password." Correct → renders, and reload stays unlocked (cookie).

- [ ] **Step 7: Commit**

```bash
git add app/a/ lib/http/cookies.ts middleware.ts
git commit -m "feat: add artifact viewer with server-side password gate and noindex"
```

---

### Task 20: Expiry cron

**Files:**
- Create: `app/api/cron/expire/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: Implement the cron route**

Create `app/api/cron/expire/route.ts`:
```ts
import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const repo = new SupabaseArtifactRepository(getServiceClient());
  const deleted = await repo.deleteExpired(new Date());
  return Response.json({ deleted });
}
```

- [ ] **Step 2: Schedule it**

Create `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/expire", "schedule": "0 * * * *" }
  ]
}
```
(Runs hourly. Set `CRON_SECRET` in Vercel project env vars; Vercel sends it as the `Authorization` header automatically.)

- [ ] **Step 3: Manual smoke test**

```bash
curl -s http://localhost:3000/api/cron/expire -H "authorization: Bearer $CRON_SECRET"
```
Expected: `{ "deleted": <number> }`. Without the header → HTTP 401.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/ vercel.json
git commit -m "feat: add hourly expiry cron"
```

---

### Task 21: Full verification pass

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: PASS — all unit suites green (slug, ttl, validate, tokens, html-meta, in-memory repo, service deploy/update/visibility/view, request-context).

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS — no type errors, production build succeeds.

- [ ] **Step 3: End-to-end manual script (against dev server + real Supabase)**

With `npm run dev` running and `.env.local` populated:
1. Deploy → capture `slug` + `edit_token`.
2. `GET /a/<slug>` → renders.
3. PATCH content with token → `GET /a/<slug>` shows new content; `expires_at` unchanged.
4. PATCH `{ "visibility": "password", "password": "pw" }` → `GET /a/<slug>` shows the gate; correct password renders.
5. Confirm `X-Robots-Tag: noindex` via `curl -I`.
6. Manually set a row's `expires_at` to the past in Supabase, hit the cron route → row deleted, `GET /a/<slug>` → 404.

- [ ] **Step 4: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "test: end-to-end verification of core artifact service"
```

---

## Self-Review (completed during authoring)

**Spec coverage:**
- Deploy via API with HTML string → Task 10 + 17. ✓
- Short slugs → Task 3. ✓
- Update-in-place (owner key OR edit token), same URL → Task 11 + 18. ✓
- TTL anchored at deploy, never reset → Task 11 test asserts unchanged `expires_at`. ✓
- TTL values 1h/1d/7d/30d, 30d max, no permanent → Task 4. ✓
- Public (noindex) → Task 19 middleware. ✓
- Password (server-enforced, hash only, signed slug-scoped cookie, no URL fragment) → Tasks 6, 13, 19. ✓
- Extensible visibility enum → `Visibility` type + DB check constraint. ✓
- 5MB cap → Task 5, enforced in deploy + update. ✓
- Live-artifact cap (anon 5 / account 50) → Task 10. ✓
- Rate limiting (IP-based) → Tasks 10 + 16. ✓
- No server-side execution of artifacts → rendered via sandboxed iframe; static serving. ✓
- Auto-expiry sweep → Task 20. ✓
- Claimable-anonymous data model (owner_id nullable + edit_token_hash) → Task 14 schema. ✓
- View analytics counter → Task 13 + RPC in Task 15. ✓

**Deferred to later plans (intentionally):** account auth / `ownerId` wiring (Plan 2/3), MCP endpoint + OAuth (Plan 2), QR + OG cards + homepage/dashboard UI (Plan 3). `owner_id` is plumbed through the schema and service now so those plans only add adapters.

**Placeholder scan:** none — every code step contains complete code.
**Type consistency:** `ArtifactRepository` method names match across port, in-memory fake, and Supabase adapter; `ServiceDeps`/`AuthContext` consistent across service functions.
```
