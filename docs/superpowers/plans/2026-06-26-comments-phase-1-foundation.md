# Comments & Annotations — Phase 1: Backend Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data + permission foundation for commenting — the sharing View/Comment role, the per-artifact `comments_enabled` flag, a `comments` entity across all three DB drivers, and a framework-free comment service with the full authorization matrix.

**Architecture:** Mirror the existing artifact stack exactly: a `CommentRepository` port with Supabase/SQLite/Postgres implementations + an in-memory fake (factory dispatch as today), and a `comment-service.ts` that holds pure authorization logic. No HTTP, no UI, no CLI in this phase — those are Phase 2/3. Everything here is unit- and integration-testable on its own.

**Tech Stack:** TypeScript, Vitest (node env for logic), better-sqlite3 / pg / @supabase/supabase-js, the existing repository-port pattern.

**Spec:** `docs/superpowers/specs/2026-06-26-comments-annotations-design.md` (§2 data model, §3 authz). This plan implements §2 and §3 only.

**Conventions (read before starting):**
- `@/` maps to the repo root. Tests run with `npm test` (Vitest, glob `**/*.test.{ts,tsx}`). Type-check: `npx tsc --noEmit`. Build: `npm run build`.
- Lib **logic** tests live in `lib/**/__tests__/`. Use native Vitest matchers.
- Every schema change lands in **all three** drivers (SQLite `lib/db/sqlite.ts`, Postgres `lib/db/postgres.ts`, Supabase `supabase/migrations/`) — self-host parity is a hard requirement.
- Commit after each task. Use multiple `-m` flags (never PowerShell here-strings).
- There are 2 pre-existing tsc errors in `components/home/DeployPanel.test.tsx` unrelated to this phase — ignore them; just don't add new ones.

---

## Task 1: Sharing principal gains a View/Comment role

**Files:**
- Modify: `lib/artifacts/types.ts` (extend `SharePrincipal`)
- Modify: `lib/artifacts/sharing.ts` (`role` default + `commentAllowed`)
- Test: `lib/artifacts/__tests__/sharing.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/artifacts/__tests__/sharing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parsePrincipals, serializeAllowlist, deserializeAllowlist, emailAllowed, commentAllowed } from '@/lib/artifacts/sharing';

describe('sharing roles', () => {
  it('parsePrincipals defaults role to view', () => {
    expect(parsePrincipals('alice@x.com\n@acme.com')).toEqual([
      { value: 'alice@x.com', type: 'email', role: 'view' },
      { value: 'acme.com', type: 'domain', role: 'view' },
    ]);
  });

  it('deserializeAllowlist back-fills role=view for legacy entries without a role', () => {
    const legacy = JSON.stringify([{ value: 'bob@x.com', type: 'email' }]);
    expect(deserializeAllowlist(legacy)).toEqual([{ value: 'bob@x.com', type: 'email', role: 'view' }]);
  });

  it('serialize → deserialize round-trips role', () => {
    const list = [{ value: 'alice@x.com', type: 'email' as const, role: 'comment' as const }];
    expect(deserializeAllowlist(serializeAllowlist(list))).toEqual(list);
  });

  it('emailAllowed matches any principal regardless of role (view or comment can view)', () => {
    const list = [{ value: 'alice@x.com', type: 'email' as const, role: 'comment' as const }];
    expect(emailAllowed('alice@x.com', list)).toBe(true);
    expect(emailAllowed('nobody@x.com', list)).toBe(false);
  });

  it('commentAllowed is true only for comment-role principals (by email or domain)', () => {
    const list = [
      { value: 'alice@x.com', type: 'email' as const, role: 'comment' as const },
      { value: 'view-only@x.com', type: 'email' as const, role: 'view' as const },
      { value: 'acme.com', type: 'domain' as const, role: 'comment' as const },
    ];
    expect(commentAllowed('alice@x.com', list)).toBe(true);
    expect(commentAllowed('view-only@x.com', list)).toBe(false);
    expect(commentAllowed('someone@acme.com', list)).toBe(true);
    expect(commentAllowed(null, list)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- sharing`
Expected: FAIL — `commentAllowed` is not exported; role-bearing shapes don't match.

- [ ] **Step 3: Add `role` to the type**

In `lib/artifacts/types.ts`, replace the `SharePrincipal` interface:

```ts
/** A principal on a 'restricted' artifact's allowlist: a specific email or a whole domain. */
export interface SharePrincipal {
  value: string;            // 'alice@intezer.com' or 'intezer.com'
  type: 'email' | 'domain';
  role: 'view' | 'comment'; // 'view' = read-only; 'comment' = may also post comments
}
```

- [ ] **Step 4: Default the role on parse/deserialize and add `commentAllowed`**

In `lib/artifacts/sharing.ts`:

In `parsePrincipals`, change the push to include the default role:

```ts
    out.push({ value, type, role: 'view' });
```

Replace `deserializeAllowlist` so legacy entries (no `role`) become `view`:

```ts
/** Parse a stored allowlist column back into principals (tolerant of null/garbage). */
export function deserializeAllowlist(raw: string | null | undefined): SharePrincipal[] {
  if (!raw) return [];
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(v)) return [];
    return (v as Partial<SharePrincipal>[])
      .filter((p): p is SharePrincipal => typeof p?.value === 'string' && (p.type === 'email' || p.type === 'domain'))
      .map((p) => ({ value: p.value, type: p.type, role: p.role === 'comment' ? 'comment' : 'view' }));
  } catch {
    return [];
  }
}
```

Append `commentAllowed` after `emailAllowed`:

```ts
/** True if a verified email matches an allowlist principal that has the 'comment' role. */
export function commentAllowed(email: string | null | undefined, allowlist: SharePrincipal[]): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  const domain = e.split('@')[1];
  return allowlist.some((p) =>
    p.role === 'comment' && (p.type === 'email' ? p.value === e : !!domain && p.value === domain),
  );
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- sharing`
Expected: PASS (5 cases). Then `npm test` to confirm nothing else broke (existing allowlist tests now produce `role: 'view'` — if an existing test asserts a principal without `role`, update that expectation to include `role: 'view'`).

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit`
```bash
git add lib/artifacts/types.ts lib/artifacts/sharing.ts lib/artifacts/__tests__/sharing.test.ts
git commit -m "Sharing: add view/comment role to principals + commentAllowed" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `comments_enabled` flag on artifacts (all drivers)

Adds the per-artifact master toggle to the record, all three schemas, and a `setCommentsEnabled` repository method. Deploy-time enabling is wired in Phase 2; this task adds the column, the read path, and the setter.

**Files:**
- Modify: `lib/artifacts/types.ts` (`ArtifactRecord.commentsEnabled`)
- Modify: `lib/artifacts/repository.ts` (port method)
- Modify: `lib/db/sqlite.ts`, `lib/db/postgres.ts` (schema column + idempotent alter)
- Create: `supabase/migrations/0006_comments.sql` (column **and** the comments table — authored once here)
- Modify: `lib/db/sqlite-artifact-repository.ts`, `lib/db/pg-artifact-repository.ts`, `lib/db/artifact-repository.ts` (Row + toRecord + setter)
- Modify: `lib/artifacts/__tests__/in-memory-repository.ts` (fake: default false + setter)
- Test: `lib/artifacts/__tests__/comments-enabled.test.ts` (create — drives the in-memory fake)

- [ ] **Step 1: Write the failing test**

Create `lib/artifacts/__tests__/comments-enabled.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';

function newArtifact(slug: string) {
  return {
    slug, content: '<p>hi</p>', title: null, visibility: 'public' as const,
    passwordHash: null, ownerId: 'owner-1', editTokenHash: 'h',
    deployIpHash: null, expiresAt: new Date(Date.now() + 60_000),
  };
}

describe('comments_enabled', () => {
  it('defaults to false on insert and can be toggled', async () => {
    const repo = new InMemoryRepository();
    const rec = await repo.insert(newArtifact('s1'));
    expect(rec.commentsEnabled).toBe(false);

    await repo.setCommentsEnabled('s1', true);
    expect((await repo.findBySlug('s1'))!.commentsEnabled).toBe(true);

    await repo.setCommentsEnabled('s1', false);
    expect((await repo.findBySlug('s1'))!.commentsEnabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- comments-enabled`
Expected: FAIL — `commentsEnabled` missing; `setCommentsEnabled` not a function.

- [ ] **Step 3: Type + port method**

In `lib/artifacts/types.ts`, add to `ArtifactRecord` (after `shareAllowlist`):

```ts
  commentsEnabled: boolean;          // owner opt-in; gates the annotation layer + comment endpoints
```

In `lib/artifacts/repository.ts`, add to the `ArtifactRepository` interface (after `updateVisibility`):

```ts
  setCommentsEnabled(slug: string, enabled: boolean): Promise<ArtifactRecord>;
```

- [ ] **Step 4: SQLite + Postgres schema columns**

In `lib/db/sqlite.ts`, inside the `artifacts` table in `SQLITE_SCHEMA`, add the column after `view_count`:

```sql
  view_count      integer not null default 0,
  comments_enabled integer not null default 0
```

(remove the trailing comma issue: `view_count` line must now end with a comma — ensure the final column has no trailing comma.) Then in `applySchema`, add an idempotent upgrade next to the `share_allowlist` one:

```ts
  try { db.exec('alter table artifacts add column comments_enabled integer not null default 0'); } catch { /* already present */ }
```

In `lib/db/postgres.ts`, inside the `artifacts` table in `POSTGRES_SCHEMA`, add after `view_count`:

```sql
  view_count      bigint not null default 0,
  comments_enabled boolean not null default false
```

and add an idempotent alter next to the `share_allowlist` one:

```sql
alter table artifacts add column if not exists comments_enabled boolean not null default false;
```

- [ ] **Step 5: Supabase migration (column + comments table, authored once)**

Create `supabase/migrations/0006_comments.sql`:

```sql
-- Per-artifact master switch for commenting (gates the annotation layer + comment endpoints).
alter table artifacts add column if not exists comments_enabled boolean not null default false;

-- Comments / annotations on an artifact. anchor is a JSON blob ({kind:'pin'|'highlight', x,y, quote?}).
create table if not exists comments (
  id            uuid primary key default gen_random_uuid(),
  artifact_slug text not null references artifacts(slug) on delete cascade,
  author_id     text not null,
  author_email  text,
  body          text not null,
  anchor        text not null,
  resolved      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists comments_artifact_slug_idx on comments (artifact_slug);

grant all on table comments to service_role;
```

- [ ] **Step 6: Thread the column through the three artifact repos**

In **each** of `lib/db/sqlite-artifact-repository.ts`, `lib/db/pg-artifact-repository.ts`, `lib/db/artifact-repository.ts`:

(a) Add `comments_enabled` to the `Row` interface — sqlite: `comments_enabled: number;`; pg & supabase: `comments_enabled: boolean;`.

(b) In `toRecord`, add (sqlite uses 0/1 → boolean):
- sqlite: `commentsEnabled: r.comments_enabled === 1 || r.comments_enabled === true,`
- pg & supabase: `commentsEnabled: !!r.comments_enabled,`

(c) Add the `setCommentsEnabled` method. **sqlite** (`SqliteArtifactRepository`):

```ts
  async setCommentsEnabled(slug: string, enabled: boolean): Promise<ArtifactRecord> {
    this.db.prepare('update artifacts set comments_enabled = ? where slug = ?').run(enabled ? 1 : 0, slug);
    return (await this.findBySlug(slug))!;
  }
```

**pg** (`PgArtifactRepository`):

```ts
  async setCommentsEnabled(slug: string, enabled: boolean): Promise<ArtifactRecord> {
    const { rows } = await this.pool.query<Row>(
      'update artifacts set comments_enabled = $2 where slug = $1 returning *', [slug, enabled],
    );
    return toRecord(rows[0]);
  }
```

**supabase** (`SupabaseArtifactRepository`):

```ts
  async setCommentsEnabled(slug: string, enabled: boolean): Promise<ArtifactRecord> {
    const { data, error } = await this.db.from('artifacts')
      .update({ comments_enabled: enabled }).eq('slug', slug).select().single();
    if (error) throw error;
    return toRecord(data as Row);
  }
```

Note: the sqlite/pg `insert` SQL doesn't list `comments_enabled`, so it takes the schema default (false) — correct. The supabase `insert` likewise omits it. No insert change needed.

- [ ] **Step 7: In-memory fake**

In `lib/artifacts/__tests__/in-memory-repository.ts`, set the default in `insert` (add to the row literal, before `...rec`):

```ts
      shareAllowlist: [],
      commentsEnabled: false,
```

and add the method (after `updateVisibility`):

```ts
  async setCommentsEnabled(slug: string, enabled: boolean): Promise<ArtifactRecord> {
    const row = this.rows.get(slug);
    if (!row) throw new Error('not found');
    row.commentsEnabled = enabled;
    return row;
  }
```

- [ ] **Step 8: Run tests + type-check**

Run: `npm test -- comments-enabled` → PASS.
Run: `npm test` → all green (if any test constructs an `ArtifactRecord` literal directly and now misses `commentsEnabled`, add `commentsEnabled: false` to it).
Run: `npx tsc --noEmit` → no new errors.

- [ ] **Step 9: Commit**

```bash
git add lib/artifacts/types.ts lib/artifacts/repository.ts lib/db/sqlite.ts lib/db/postgres.ts supabase/migrations/0006_comments.sql lib/db/sqlite-artifact-repository.ts lib/db/pg-artifact-repository.ts lib/db/artifact-repository.ts lib/artifacts/__tests__/in-memory-repository.ts lib/artifacts/__tests__/comments-enabled.test.ts
git commit -m "Artifacts: add comments_enabled flag across all drivers + migration 0006" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Comment types, repository port, and in-memory fake

**Files:**
- Create: `lib/artifacts/comment-types.ts`
- Create: `lib/artifacts/comment-repository.ts`
- Create: `lib/artifacts/__tests__/in-memory-comment-repository.ts`
- Test: `lib/artifacts/__tests__/comment-repository.contract.test.ts` (create — runs the fake through the port)

- [ ] **Step 1: Write the failing test**

Create `lib/artifacts/__tests__/comment-repository.contract.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCommentRepository } from '@/lib/artifacts/__tests__/in-memory-comment-repository';
import type { Anchor } from '@/lib/artifacts/comment-types';

const pin: Anchor = { kind: 'pin', x: 0.5, y: 0.25 };

describe('CommentRepository (in-memory contract)', () => {
  let repo: InMemoryCommentRepository;
  beforeEach(() => { repo = new InMemoryCommentRepository(); });

  it('insert + listBySlug returns oldest-first with all fields', async () => {
    const a = await repo.insert({ artifactSlug: 's1', authorId: 'u1', authorEmail: 'a@x.com', body: 'first', anchor: pin });
    const b = await repo.insert({ artifactSlug: 's1', authorId: 'u2', authorEmail: null, body: 'second', anchor: pin });
    await repo.insert({ artifactSlug: 'other', authorId: 'u1', authorEmail: null, body: 'elsewhere', anchor: pin });
    const list = await repo.listBySlug('s1');
    expect(list.map((c) => c.id)).toEqual([a.id, b.id]);
    expect(list[0]).toMatchObject({ artifactSlug: 's1', authorId: 'u1', authorEmail: 'a@x.com', body: 'first', resolved: false, anchor: pin });
    expect(list[1].authorEmail).toBeNull();
  });

  it('updateBody, setResolved, findById', async () => {
    const c = await repo.insert({ artifactSlug: 's1', authorId: 'u1', authorEmail: null, body: 'x', anchor: pin });
    await repo.updateBody(c.id, 'edited');
    await repo.setResolved(c.id, true);
    const got = await repo.findById(c.id);
    expect(got).toMatchObject({ body: 'edited', resolved: true });
  });

  it('deleteById and deleteBySlug', async () => {
    const c = await repo.insert({ artifactSlug: 's1', authorId: 'u1', authorEmail: null, body: 'x', anchor: pin });
    expect(await repo.deleteById(c.id)).toBe(true);
    expect(await repo.findById(c.id)).toBeNull();
    await repo.insert({ artifactSlug: 's2', authorId: 'u1', authorEmail: null, body: 'a', anchor: pin });
    await repo.insert({ artifactSlug: 's2', authorId: 'u1', authorEmail: null, body: 'b', anchor: pin });
    expect(await repo.deleteBySlug('s2')).toBe(2);
    expect(await repo.listBySlug('s2')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- comment-repository.contract`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Anchor + record types**

Create `lib/artifacts/comment-types.ts`:

```ts
/** Where a comment attaches. x,y are normalized 0..1 of the document's scroll size. */
export type Anchor =
  | { kind: 'pin'; x: number; y: number }
  | { kind: 'highlight'; x: number; y: number; quote: string };

export interface CommentRecord {
  id: string;
  artifactSlug: string;
  authorId: string;
  authorEmail: string | null;   // null when authored via a PAT (no email available)
  body: string;
  anchor: Anchor;
  resolved: boolean;
  createdAt: Date;
}

export interface NewComment {
  artifactSlug: string;
  authorId: string;
  authorEmail: string | null;
  body: string;
  anchor: Anchor;
}

/** Serialize an anchor for a text column. */
export function serializeAnchor(a: Anchor): string {
  return JSON.stringify(a);
}

/** Parse a stored anchor; tolerant — falls back to a top-left pin if the blob is malformed. */
export function parseAnchor(raw: string | null | undefined): Anchor {
  if (raw) {
    try {
      const v = JSON.parse(raw);
      if (v && (v.kind === 'pin' || v.kind === 'highlight') && typeof v.x === 'number' && typeof v.y === 'number') {
        return v.kind === 'highlight'
          ? { kind: 'highlight', x: v.x, y: v.y, quote: String(v.quote ?? '') }
          : { kind: 'pin', x: v.x, y: v.y };
      }
    } catch { /* fall through */ }
  }
  return { kind: 'pin', x: 0, y: 0 };
}
```

- [ ] **Step 4: The port**

Create `lib/artifacts/comment-repository.ts`:

```ts
import type { CommentRecord, NewComment } from '@/lib/artifacts/comment-types';

export interface CommentRepository {
  insert(rec: NewComment): Promise<CommentRecord>;
  listBySlug(slug: string): Promise<CommentRecord[]>;     // oldest-first
  findById(id: string): Promise<CommentRecord | null>;
  updateBody(id: string, body: string): Promise<CommentRecord>;
  setResolved(id: string, resolved: boolean): Promise<CommentRecord>;
  deleteById(id: string): Promise<boolean>;
  deleteBySlug(slug: string): Promise<number>;
}
```

- [ ] **Step 5: The in-memory fake**

Create `lib/artifacts/__tests__/in-memory-comment-repository.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { CommentRecord, NewComment } from '@/lib/artifacts/comment-types';
import type { CommentRepository } from '@/lib/artifacts/comment-repository';

export class InMemoryCommentRepository implements CommentRepository {
  private rows: CommentRecord[] = [];
  private seq = 0;

  async insert(rec: NewComment): Promise<CommentRecord> {
    // monotonic createdAt so oldest-first ordering is deterministic in tests
    const row: CommentRecord = {
      id: randomUUID(), ...rec, resolved: false, createdAt: new Date(Date.now() + this.seq++),
    };
    this.rows.push(row);
    return row;
  }

  async listBySlug(slug: string): Promise<CommentRecord[]> {
    return this.rows.filter((c) => c.artifactSlug === slug)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findById(id: string): Promise<CommentRecord | null> {
    return this.rows.find((c) => c.id === id) ?? null;
  }

  async updateBody(id: string, body: string): Promise<CommentRecord> {
    const row = this.rows.find((c) => c.id === id);
    if (!row) throw new Error('not found');
    row.body = body;
    return row;
  }

  async setResolved(id: string, resolved: boolean): Promise<CommentRecord> {
    const row = this.rows.find((c) => c.id === id);
    if (!row) throw new Error('not found');
    row.resolved = resolved;
    return row;
  }

  async deleteById(id: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((c) => c.id !== id);
    return this.rows.length < before;
  }

  async deleteBySlug(slug: string): Promise<number> {
    const before = this.rows.length;
    this.rows = this.rows.filter((c) => c.artifactSlug !== slug);
    return before - this.rows.length;
  }
}
```

- [ ] **Step 6: Run tests + commit**

Run: `npm test -- comment-repository.contract` → PASS (3 cases). `npx tsc --noEmit` → clean.

```bash
git add lib/artifacts/comment-types.ts lib/artifacts/comment-repository.ts lib/artifacts/__tests__/in-memory-comment-repository.ts lib/artifacts/__tests__/comment-repository.contract.test.ts
git commit -m "Comments: types, repository port, in-memory fake" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: SQLite comment repository + table

**Files:**
- Modify: `lib/db/sqlite.ts` (comments table + FK pragma)
- Create: `lib/db/sqlite-comment-repository.ts`

- [ ] **Step 1: Add the comments table + enable FK enforcement**

In `lib/db/sqlite.ts`, append to `SQLITE_SCHEMA` (after the `auth_attempts` block, before the closing backtick):

```sql
create table if not exists comments (
  id            text primary key,
  artifact_slug text not null references artifacts(slug) on delete cascade,
  author_id     text not null,
  author_email  text,
  body          text not null,
  anchor        text not null,
  resolved      integer not null default 0,
  created_at    text not null
);
create index if not exists comments_artifact_slug_idx on comments (artifact_slug);
```

In `getSqliteDb`, enable FK enforcement so the cascade fires (better-sqlite3 defaults to off). Add right after `db.pragma('journal_mode = WAL');`:

```ts
  db.pragma('foreign_keys = ON');
```

- [ ] **Step 2: Implement the repository**

Create `lib/db/sqlite-comment-repository.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { CommentRecord, NewComment } from '@/lib/artifacts/comment-types';
import type { CommentRepository } from '@/lib/artifacts/comment-repository';
import { serializeAnchor, parseAnchor } from '@/lib/artifacts/comment-types';

interface Row {
  id: string; artifact_slug: string; author_id: string; author_email: string | null;
  body: string; anchor: string; resolved: number; created_at: string;
}

function toRecord(r: Row): CommentRecord {
  return {
    id: r.id, artifactSlug: r.artifact_slug, authorId: r.author_id, authorEmail: r.author_email,
    body: r.body, anchor: parseAnchor(r.anchor), resolved: r.resolved === 1, createdAt: new Date(r.created_at),
  };
}

export class SqliteCommentRepository implements CommentRepository {
  constructor(private db: Database.Database) {}

  async insert(rec: NewComment): Promise<CommentRecord> {
    const row: Row = {
      id: randomUUID(), artifact_slug: rec.artifactSlug, author_id: rec.authorId,
      author_email: rec.authorEmail, body: rec.body, anchor: serializeAnchor(rec.anchor),
      resolved: 0, created_at: new Date().toISOString(),
    };
    this.db.prepare(
      `insert into comments (id, artifact_slug, author_id, author_email, body, anchor, resolved, created_at)
       values (@id, @artifact_slug, @author_id, @author_email, @body, @anchor, @resolved, @created_at)`,
    ).run(row);
    return toRecord(row);
  }

  async listBySlug(slug: string): Promise<CommentRecord[]> {
    const rows = this.db.prepare('select * from comments where artifact_slug = ? order by created_at asc').all(slug) as Row[];
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<CommentRecord | null> {
    const r = this.db.prepare('select * from comments where id = ?').get(id) as Row | undefined;
    return r ? toRecord(r) : null;
  }

  async updateBody(id: string, body: string): Promise<CommentRecord> {
    this.db.prepare('update comments set body = ? where id = ?').run(body, id);
    return (await this.findById(id))!;
  }

  async setResolved(id: string, resolved: boolean): Promise<CommentRecord> {
    this.db.prepare('update comments set resolved = ? where id = ?').run(resolved ? 1 : 0, id);
    return (await this.findById(id))!;
  }

  async deleteById(id: string): Promise<boolean> {
    return this.db.prepare('delete from comments where id = ?').run(id).changes > 0;
  }

  async deleteBySlug(slug: string): Promise<number> {
    return this.db.prepare('delete from comments where artifact_slug = ?').run(slug).changes;
  }
}
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit` → clean. (Behavior is exercised by Task 8 + the integration test in Task 9; this task is wiring.)

```bash
git add lib/db/sqlite.ts lib/db/sqlite-comment-repository.ts
git commit -m "Comments: SQLite repository + table (FK cascade)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Postgres comment repository + table

**Files:**
- Modify: `lib/db/postgres.ts` (comments table)
- Create: `lib/db/pg-comment-repository.ts`

- [ ] **Step 1: Add the comments table**

In `lib/db/postgres.ts`, append to `POSTGRES_SCHEMA` (after the `auth_attempts` block, before the closing backtick):

```sql
create table if not exists comments (
  id            uuid primary key default gen_random_uuid(),
  artifact_slug text not null references artifacts(slug) on delete cascade,
  author_id     text not null,
  author_email  text,
  body          text not null,
  anchor        text not null,
  resolved      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists comments_artifact_slug_idx on comments (artifact_slug);
```

- [ ] **Step 2: Implement the repository**

Create `lib/db/pg-comment-repository.ts`:

```ts
import type { Pool } from 'pg';
import type { CommentRecord, NewComment } from '@/lib/artifacts/comment-types';
import type { CommentRepository } from '@/lib/artifacts/comment-repository';
import { serializeAnchor, parseAnchor } from '@/lib/artifacts/comment-types';

interface Row {
  id: string; artifact_slug: string; author_id: string; author_email: string | null;
  body: string; anchor: string; resolved: boolean; created_at: Date;
}

function toRecord(r: Row): CommentRecord {
  return {
    id: r.id, artifactSlug: r.artifact_slug, authorId: r.author_id, authorEmail: r.author_email,
    body: r.body, anchor: parseAnchor(r.anchor), resolved: !!r.resolved, createdAt: new Date(r.created_at),
  };
}

export class PgCommentRepository implements CommentRepository {
  constructor(private pool: Pool) {}

  async insert(rec: NewComment): Promise<CommentRecord> {
    const { rows } = await this.pool.query<Row>(
      `insert into comments (artifact_slug, author_id, author_email, body, anchor)
       values ($1,$2,$3,$4,$5) returning *`,
      [rec.artifactSlug, rec.authorId, rec.authorEmail, rec.body, serializeAnchor(rec.anchor)],
    );
    return toRecord(rows[0]);
  }

  async listBySlug(slug: string): Promise<CommentRecord[]> {
    const { rows } = await this.pool.query<Row>(
      'select * from comments where artifact_slug = $1 order by created_at asc', [slug],
    );
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<CommentRecord | null> {
    const { rows } = await this.pool.query<Row>('select * from comments where id = $1', [id]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async updateBody(id: string, body: string): Promise<CommentRecord> {
    const { rows } = await this.pool.query<Row>(
      'update comments set body = $2 where id = $1 returning *', [id, body],
    );
    return toRecord(rows[0]);
  }

  async setResolved(id: string, resolved: boolean): Promise<CommentRecord> {
    const { rows } = await this.pool.query<Row>(
      'update comments set resolved = $2 where id = $1 returning *', [id, resolved],
    );
    return toRecord(rows[0]);
  }

  async deleteById(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('delete from comments where id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }

  async deleteBySlug(slug: string): Promise<number> {
    const { rowCount } = await this.pool.query('delete from comments where artifact_slug = $1', [slug]);
    return rowCount ?? 0;
  }
}
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add lib/db/postgres.ts lib/db/pg-comment-repository.ts
git commit -m "Comments: Postgres repository + table (FK cascade)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Supabase comment repository

The table + grant already exist (migration `0006_comments.sql`, Task 2). This task adds the driver class.

**Files:**
- Create: `lib/db/supabase-comment-repository.ts`

- [ ] **Step 1: Implement the repository**

Create `lib/db/supabase-comment-repository.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommentRecord, NewComment } from '@/lib/artifacts/comment-types';
import type { CommentRepository } from '@/lib/artifacts/comment-repository';
import { serializeAnchor, parseAnchor } from '@/lib/artifacts/comment-types';

interface Row {
  id: string; artifact_slug: string; author_id: string; author_email: string | null;
  body: string; anchor: string; resolved: boolean; created_at: string;
}

function toRecord(r: Row): CommentRecord {
  return {
    id: r.id, artifactSlug: r.artifact_slug, authorId: r.author_id, authorEmail: r.author_email,
    body: r.body, anchor: parseAnchor(r.anchor), resolved: !!r.resolved, createdAt: new Date(r.created_at),
  };
}

export class SupabaseCommentRepository implements CommentRepository {
  constructor(private db: SupabaseClient) {}

  async insert(rec: NewComment): Promise<CommentRecord> {
    const { data, error } = await this.db.from('comments').insert({
      artifact_slug: rec.artifactSlug, author_id: rec.authorId, author_email: rec.authorEmail,
      body: rec.body, anchor: serializeAnchor(rec.anchor),
    }).select().single();
    if (error) throw error;
    return toRecord(data as Row);
  }

  async listBySlug(slug: string): Promise<CommentRecord[]> {
    const { data, error } = await this.db.from('comments')
      .select().eq('artifact_slug', slug).order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => toRecord(r as Row));
  }

  async findById(id: string): Promise<CommentRecord | null> {
    const { data, error } = await this.db.from('comments').select().eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? toRecord(data as Row) : null;
  }

  async updateBody(id: string, body: string): Promise<CommentRecord> {
    const { data, error } = await this.db.from('comments').update({ body }).eq('id', id).select().single();
    if (error) throw error;
    return toRecord(data as Row);
  }

  async setResolved(id: string, resolved: boolean): Promise<CommentRecord> {
    const { data, error } = await this.db.from('comments').update({ resolved }).eq('id', id).select().single();
    if (error) throw error;
    return toRecord(data as Row);
  }

  async deleteById(id: string): Promise<boolean> {
    const { data, error } = await this.db.from('comments').delete().eq('id', id).select('id');
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  async deleteBySlug(slug: string): Promise<number> {
    const { data, error } = await this.db.from('comments').delete().eq('artifact_slug', slug).select('id');
    if (error) throw error;
    return data?.length ?? 0;
  }
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add lib/db/supabase-comment-repository.ts
git commit -m "Comments: Supabase repository" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Factory dispatch for the comment repository

**Files:**
- Modify: `lib/db/factory.ts`

- [ ] **Step 1: Add `getCommentRepository`**

In `lib/db/factory.ts`, add an import type at the top:

```ts
import type { CommentRepository } from '@/lib/artifacts/comment-repository';
```

Add a cache var next to the others:

```ts
let commentRepo: CommentRepository | null = null;
```

Add the function (after `getTokenRepository`, mirroring its lazy-load pattern):

```ts
export async function getCommentRepository(): Promise<CommentRepository> {
  if (commentRepo) return commentRepo;
  if (driver() === 'sqlite') {
    const { getSqliteDb } = await import('./sqlite');
    const { SqliteCommentRepository } = await import('./sqlite-comment-repository');
    commentRepo = new SqliteCommentRepository(getSqliteDb());
  } else if (driver() === 'postgres') {
    const { ensurePgSchema } = await import('./postgres');
    const { PgCommentRepository } = await import('./pg-comment-repository');
    commentRepo = new PgCommentRepository(await ensurePgSchema());
  } else {
    const { SupabaseCommentRepository } = await import('./supabase-comment-repository');
    commentRepo = new SupabaseCommentRepository(getServiceClient());
  }
  return commentRepo;
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` → clean. `npm test` → still green.

```bash
git add lib/db/factory.ts
git commit -m "Comments: factory dispatch for CommentRepository" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Comment service + authorization matrix

The framework-free orchestration + authz used by the Phase 2 API. Mirrors `lib/artifacts/service.ts`.

**Files:**
- Modify: `lib/artifacts/constants.ts` (add `COMMENT_MAX_BYTES`)
- Modify: `lib/artifacts/errors.ts` (add new error codes — verify the existing shape first)
- Create: `lib/artifacts/comment-service.ts`
- Test: `lib/artifacts/__tests__/comment-service.test.ts` (create)

- [ ] **Step 1: Add the byte cap constant**

In `lib/artifacts/constants.ts`, add:

```ts
/** Max comment body size (bytes). */
export const COMMENT_MAX_BYTES = 8 * 1024;
```

- [ ] **Step 2: Confirm the error type, then add codes**

Read `lib/artifacts/errors.ts`. It defines `ServiceError` with a string `code` union. Add `'comments_disabled'` and `'comment_too_large'` to that union (and `'forbidden'`, `'not_found'` already exist — reuse them). If the codes are a free-form string, no change is needed; just use the new strings.

- [ ] **Step 3: Write the failing test**

Create `lib/artifacts/__tests__/comment-service.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';
import { InMemoryCommentRepository } from '@/lib/artifacts/__tests__/in-memory-comment-repository';
import { createComment, listComments, editCommentBody, resolveComment, deleteComment } from '@/lib/artifacts/comment-service';
import type { Anchor } from '@/lib/artifacts/comment-types';
import { ServiceError } from '@/lib/artifacts/errors';

const pin: Anchor = { kind: 'pin', x: 0.5, y: 0.5 };
const OWNER = { ownerId: 'owner-1', email: 'owner@x.com' };

async function seed(opts: { visibility?: 'public' | 'password' | 'restricted'; commentsEnabled?: boolean; allowlist?: { value: string; type: 'email' | 'domain'; role: 'view' | 'comment' }[] } = {}) {
  const artifacts = new InMemoryRepository();
  const comments = new InMemoryCommentRepository();
  await artifacts.insert({
    slug: 's1', content: '<p>hi</p>', title: null, visibility: opts.visibility ?? 'public',
    passwordHash: null, ownerId: 'owner-1', editTokenHash: 'h', deployIpHash: null,
    expiresAt: new Date(Date.now() + 60_000),
  });
  if (opts.commentsEnabled) await artifacts.setCommentsEnabled('s1', true);
  if (opts.allowlist) await artifacts.updateVisibility('s1', 'restricted', null, opts.allowlist);
  return { artifacts, comments };
}

describe('comment-service authorization', () => {
  it('rejects all comment ops when comments are disabled', async () => {
    const { artifacts, comments } = await seed({ commentsEnabled: false });
    await expect(createComment(artifacts, comments, 's1', { body: 'x', anchor: pin }, OWNER))
      .rejects.toMatchObject({ code: 'comments_disabled' });
  });

  it('public + enabled: any signed-in viewer can comment; anonymous cannot', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    const c = await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, { ownerId: 'rando', email: 'r@x.com' });
    expect(c.authorId).toBe('rando');
    await expect(createComment(artifacts, comments, 's1', { body: 'no', anchor: pin }, null))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('restricted + enabled: comment-role may post, view-role may not', async () => {
    const { artifacts, comments } = await seed({
      visibility: 'restricted', commentsEnabled: true,
      allowlist: [
        { value: 'c@x.com', type: 'email', role: 'comment' },
        { value: 'v@x.com', type: 'email', role: 'view' },
      ],
    });
    await createComment(artifacts, comments, 's1', { body: 'ok', anchor: pin }, { ownerId: 'c', email: 'c@x.com' });
    await expect(createComment(artifacts, comments, 's1', { body: 'no', anchor: pin }, { ownerId: 'v', email: 'v@x.com' }))
      .rejects.toMatchObject({ code: 'forbidden' });
    // owner can always comment
    await createComment(artifacts, comments, 's1', { body: 'owner', anchor: pin }, OWNER);
  });

  it('rejects an over-cap body', async () => {
    const { artifacts, comments } = await seed({ commentsEnabled: true });
    const big = 'a'.repeat(8 * 1024 + 1);
    await expect(createComment(artifacts, comments, 's1', { body: big, anchor: pin }, OWNER))
      .rejects.toMatchObject({ code: 'comment_too_large' });
  });

  it('listComments: anyone who can view (public → even anonymous)', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, OWNER);
    const list = await listComments(artifacts, comments, 's1', { viewer: null, passwordVerified: false });
    expect(list).toHaveLength(1);
  });

  it('edit body: author only; delete: author or owner; resolve: owner or comment-access', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    const c = await createComment(artifacts, comments, 's1', { body: 'mine', anchor: pin }, { ownerId: 'rando', email: 'r@x.com' });
    // non-author edit → forbidden
    await expect(editCommentBody(artifacts, comments, 's1', c.id, 'hax', OWNER)).rejects.toMatchObject({ code: 'forbidden' });
    // author edit → ok
    await editCommentBody(artifacts, comments, 's1', c.id, 'edited', { ownerId: 'rando', email: 'r@x.com' });
    // owner can resolve
    const r = await resolveComment(artifacts, comments, 's1', c.id, true, OWNER);
    expect(r.resolved).toBe(true);
    // owner can delete anyone's
    expect(await deleteComment(artifacts, comments, 's1', c.id, OWNER)).toEqual({ ok: true });
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- comment-service`
Expected: FAIL — `comment-service` module not found.

- [ ] **Step 5: Implement the service**

Create `lib/artifacts/comment-service.ts`:

```ts
import type { ArtifactRecord } from '@/lib/artifacts/types';
import type { ArtifactRepository } from '@/lib/artifacts/repository';
import type { CommentRepository } from '@/lib/artifacts/comment-repository';
import type { Anchor, CommentRecord } from '@/lib/artifacts/comment-types';
import { ServiceError } from '@/lib/artifacts/errors';
import { emailAllowed, commentAllowed } from '@/lib/artifacts/sharing';
import { COMMENT_MAX_BYTES } from '@/lib/artifacts/constants';

/** Identity of the caller; null = anonymous. Email present only for session identities. */
export interface Viewer { ownerId: string; email?: string | null }

export interface ReadContext { viewer: Viewer | null; passwordVerified: boolean }

function loadEnabled(record: ArtifactRecord | null): ArtifactRecord {
  if (!record) throw new ServiceError('not_found', 'Artifact not found');
  if (!record.commentsEnabled) throw new ServiceError('comments_disabled', 'Comments are not enabled for this artifact');
  return record;
}

function isOwner(record: ArtifactRecord, viewer: Viewer | null): boolean {
  return !!viewer && !!record.ownerId && viewer.ownerId === record.ownerId;
}

/** Mirror of viewArtifact's gate: can this caller see the artifact at all? */
export function canRead(record: ArtifactRecord, ctx: ReadContext): boolean {
  if (isOwner(record, ctx.viewer)) return true;
  if (record.visibility === 'public') return true;
  if (record.visibility === 'password') return ctx.passwordVerified;
  return emailAllowed(ctx.viewer?.email, record.shareAllowlist); // restricted
}

/** Who may post: signed-in; public/password → any signed-in viewer; restricted → comment role or owner. */
export function canComment(record: ArtifactRecord, viewer: Viewer | null): boolean {
  if (!viewer) return false;
  if (isOwner(record, viewer)) return true;
  if (record.visibility === 'restricted') return commentAllowed(viewer.email, record.shareAllowlist);
  return true; // public / password, signed in
}

export async function listComments(
  artifacts: ArtifactRepository, comments: CommentRepository, slug: string, ctx: ReadContext,
): Promise<CommentRecord[]> {
  const record = loadEnabled(await artifacts.findBySlug(slug));
  if (!canRead(record, ctx)) throw new ServiceError('forbidden', 'Not authorized to view this artifact');
  return comments.listBySlug(slug);
}

export async function createComment(
  artifacts: ArtifactRepository, comments: CommentRepository, slug: string,
  input: { body: string; anchor: Anchor }, viewer: Viewer | null,
): Promise<CommentRecord> {
  const record = loadEnabled(await artifacts.findBySlug(slug));
  if (!canComment(record, viewer)) throw new ServiceError('forbidden', 'Not authorized to comment');
  const body = input.body.trim();
  if (!body) throw new ServiceError('invalid_comment', 'Comment body is empty');
  if (Buffer.byteLength(body, 'utf8') > COMMENT_MAX_BYTES) {
    throw new ServiceError('comment_too_large', 'Comment is too large');
  }
  return comments.insert({
    artifactSlug: slug, authorId: viewer!.ownerId, authorEmail: viewer!.email ?? null, body, anchor: input.anchor,
  });
}

async function loadOwned(
  artifacts: ArtifactRepository, comments: CommentRepository, slug: string, id: string,
): Promise<{ record: ArtifactRecord; comment: CommentRecord }> {
  const record = loadEnabled(await artifacts.findBySlug(slug));
  const comment = await comments.findById(id);
  if (!comment || comment.artifactSlug !== slug) throw new ServiceError('not_found', 'Comment not found');
  return { record, comment };
}

export async function editCommentBody(
  artifacts: ArtifactRepository, comments: CommentRepository, slug: string, id: string, body: string, viewer: Viewer | null,
): Promise<CommentRecord> {
  const { comment } = await loadOwned(artifacts, comments, slug, id);
  if (!viewer || viewer.ownerId !== comment.authorId) throw new ServiceError('forbidden', 'Only the author can edit');
  const next = body.trim();
  if (!next) throw new ServiceError('invalid_comment', 'Comment body is empty');
  if (Buffer.byteLength(next, 'utf8') > COMMENT_MAX_BYTES) throw new ServiceError('comment_too_large', 'Comment is too large');
  return comments.updateBody(id, next);
}

export async function resolveComment(
  artifacts: ArtifactRepository, comments: CommentRepository, slug: string, id: string, resolved: boolean, viewer: Viewer | null,
): Promise<CommentRecord> {
  const { record } = await loadOwned(artifacts, comments, slug, id);
  if (!(isOwner(record, viewer) || canComment(record, viewer))) {
    throw new ServiceError('forbidden', 'Not authorized to resolve');
  }
  return comments.setResolved(id, resolved);
}

export async function deleteComment(
  artifacts: ArtifactRepository, comments: CommentRepository, slug: string, id: string, viewer: Viewer | null,
): Promise<{ ok: true }> {
  const { record, comment } = await loadOwned(artifacts, comments, slug, id);
  const isAuthor = !!viewer && viewer.ownerId === comment.authorId;
  if (!isAuthor && !isOwner(record, viewer)) throw new ServiceError('forbidden', 'Not authorized to delete');
  await comments.deleteById(id);
  return { ok: true };
}
```

> Note: if `ServiceError` codes are a closed union, also add `'invalid_comment'` alongside `'comments_disabled'`/`'comment_too_large'` in `lib/artifacts/errors.ts`.

- [ ] **Step 6: Run tests + type-check**

Run: `npm test -- comment-service` → PASS (6 cases). `npx tsc --noEmit` → clean.

- [ ] **Step 7: Commit**

```bash
git add lib/artifacts/constants.ts lib/artifacts/errors.ts lib/artifacts/comment-service.ts lib/artifacts/__tests__/comment-service.test.ts
git commit -m "Comments: service layer with the full authorization matrix" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Real-DB integration contract for the comment repository

Mirrors `lib/db/__tests__/artifact-repository.integration.test.ts` (skips without Supabase creds).

**Files:**
- Create: `lib/db/__tests__/comment-repository.integration.test.ts`
- First read `lib/db/__tests__/artifact-repository.integration.test.ts` to copy its env-gating + run-prefix + cleanup exactly.

- [ ] **Step 1: Write the integration test (skips without creds)**

Create `lib/db/__tests__/comment-repository.integration.test.ts`, following the existing integration file's structure (same `hasEnv` check on `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, same `createClient`, a unique run slug, `afterAll` cleanup). It must:
- create a parent artifact row (so the FK is satisfied) with a run-unique slug,
- exercise `insert` → `listBySlug` (oldest-first) → `updateBody` → `setResolved` → `findById` → `deleteById` → `deleteBySlug`,
- assert anchor round-trips (pin and highlight),
- in `afterAll`, delete the test comments and the parent artifact (deleting the artifact also cascades comments — assert `listBySlug` is empty after artifact delete as the cascade check).

Use this skeleton (fill the env-gating to match the sibling file exactly):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SupabaseCommentRepository } from '@/lib/db/supabase-comment-repository';
import type { Anchor } from '@/lib/artifacts/comment-types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = !!url && !!key;
const RUN = `cmt-int-${Date.now()}`;
const SLUG = `${RUN}-slug`;
const pin: Anchor = { kind: 'pin', x: 0.5, y: 0.5 };
const hl: Anchor = { kind: 'highlight', x: 0.1, y: 0.2, quote: 'hello' };

describe.skipIf(!hasEnv)('SupabaseCommentRepository (integration)', () => {
  let db: SupabaseClient;
  let repo: SupabaseCommentRepository;

  beforeAll(async () => {
    db = createClient(url!, key!);
    repo = new SupabaseCommentRepository(db);
    await db.from('artifacts').insert({
      slug: SLUG, content: '<p>x</p>', visibility: 'public',
      edit_token_hash: 'h', comments_enabled: true,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
  });

  afterAll(async () => {
    await db.from('artifacts').delete().eq('slug', SLUG); // cascade removes comments
  });

  it('round-trips comments and cascades on artifact delete', async () => {
    const a = await repo.insert({ artifactSlug: SLUG, authorId: 'u1', authorEmail: 'a@x.com', body: 'first', anchor: pin });
    const b = await repo.insert({ artifactSlug: SLUG, authorId: 'u2', authorEmail: null, body: 'second', anchor: hl });
    const list = await repo.listBySlug(SLUG);
    expect(list.map((c) => c.id)).toEqual([a.id, b.id]);
    expect(list[1].anchor).toEqual(hl);

    await repo.updateBody(a.id, 'edited');
    await repo.setResolved(a.id, true);
    const got = await repo.findById(a.id);
    expect(got).toMatchObject({ body: 'edited', resolved: true });

    expect(await repo.deleteById(b.id)).toBe(true);
    expect((await repo.listBySlug(SLUG)).map((c) => c.id)).toEqual([a.id]);
  });
});
```

- [ ] **Step 2: Run (skips locally without creds) + type-check**

Run: `npm test -- comment-repository.integration`
Expected: SKIPPED locally (no creds) — or PASS if `.env.local` has Supabase creds. `npx tsc --noEmit` → clean.

- [ ] **Step 3: Commit**

```bash
git add lib/db/__tests__/comment-repository.integration.test.ts
git commit -m "Comments: Supabase integration contract (skips without creds)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (Phase 1)

- [ ] `npm test` — all green (new: sharing, comments-enabled, comment-repository.contract, comment-service; integration skipped).
- [ ] `npx tsc --noEmit` — no new errors (the 2 pre-existing DeployPanel.test.tsx errors remain, untouched).
- [ ] `npm run build` — succeeds.
- [ ] **SQLite cascade smoke (optional, fast):** in a node REPL or a scratch test with `SQLITE_PATH=:memory:`, insert an artifact + a comment, `deleteOwned` the artifact, confirm the comment is gone (FK pragma works). Covered indirectly; note if skipped.

## Spec coverage (Phase 1 scope)

- §2.1 comments entity + repo port + fake + 3 drivers → Tasks 3–7. ✅
- §2.2 `comments_enabled` (all drivers + migration, owned-only gate enforced in service) → Task 2 + Task 8. ✅
- §2.3 anchor model (pin/highlight, serialize/parse, degrade-to-pin fallback in parse) → Task 3. ✅
- §2.4 `SharePrincipal.role` + `commentAllowed` + back-compat → Task 1. ✅
- §3 authorization matrix (read/post/edit/resolve/delete) → Task 8. ✅
- Expiry/cleanup (FK cascade + `deleteBySlug`) → Tasks 4–6 (FK) + Task 3/fake. ✅
- **Deferred to Phase 2/3 (NOT in this plan):** REST API (§5), CLI (§6), UI + injected runtime (§4, §7), docs (§9), e2e HTTP/browser tests. The service in Task 8 is the seam Phase 2 calls.
