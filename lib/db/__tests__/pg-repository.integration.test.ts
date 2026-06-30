import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { POSTGRES_SCHEMA } from '@/lib/db/postgres';
import { PgArtifactRepository } from '@/lib/db/pg-artifact-repository';
import { PgTokenRepository } from '@/lib/db/pg-token-repository';
import { PgUserRepository } from '@/lib/db/pg-user-repository';
import { hashPersonalToken } from '@/lib/auth/personal-token';
import type { NewArtifact } from '@/lib/artifacts/repository';

// Runs only when DATABASE_URL points at a throwaway Postgres (CI / local docker). Skipped otherwise.
const url = process.env.DATABASE_URL;

const base = (over: Partial<NewArtifact> = {}): NewArtifact => ({
  slug: 'abc123', content: '<h1>hi</h1>', title: 'Hi', visibility: 'public',
  passwordHash: null, ownerId: null, editTokenHash: 'eth', deployIpHash: 'ip1',
  expiresAt: new Date(Date.now() + 7 * 864e5), ...over,
});

describe.skipIf(!url)('Pg repositories (integration)', () => {
  let pool: Pool;
  beforeAll(async () => { pool = new Pool({ connectionString: url }); await pool.query(POSTGRES_SCHEMA); });
  afterAll(async () => { await pool.end(); });
  beforeEach(async () => { await pool.query('truncate artifacts, api_tokens, users'); });

  it('artifacts: insert/find/update/views/owner/expiry', async () => {
    const repo = new PgArtifactRepository(pool);
    const rec = await repo.insert(base({ ownerId: 'u1' }));
    expect(rec.createdAt).toBeInstanceOf(Date);
    expect((await repo.findBySlug('abc123'))?.content).toBe('<h1>hi</h1>');
    await repo.updateContent('abc123', '<p>x</p>', 'X');
    await repo.incrementViews('abc123');
    const got = await repo.findBySlug('abc123');
    expect(got?.content).toBe('<p>x</p>');
    expect(got?.viewCount).toBe(1);
    const now = new Date();
    expect(await repo.countLiveByOwner('u1', now)).toBe(1);
    expect((await repo.listByOwner('u1', now)).map((a) => a.slug)).toEqual(['abc123']);
    await repo.insert(base({ slug: 'gone', expiresAt: new Date(now.getTime() - 1000) }));
    expect(await repo.deleteExpired(now)).toBe(1);
  });

  it('tokens: create/resolve/expiry/revoke', async () => {
    const repo = new PgTokenRepository(pool);
    const hash = hashPersonalToken('ah_secret');
    const t = await repo.create({ ownerId: 'u1', name: 'CLI', tokenHash: hash, expiresAt: null });
    const now = new Date();
    expect(await repo.resolveOwner(hash, now)).toBe('u1');
    expect(await repo.resolveOwner('nope', now)).toBeNull();
    expect(await repo.revoke(t.id, 'u1')).toBe(true);
    expect(await repo.resolveOwner(hash, now)).toBeNull();
  });

  it('users: create/find/count', async () => {
    const repo = new PgUserRepository(pool);
    expect(await repo.count()).toBe(0);
    const u = await repo.create('a@b.com', 'h');
    expect(u.id).toBeTruthy();
    expect((await repo.findByEmail('a@b.com'))?.passwordHash).toBe('h');
    expect(await repo.count()).toBe(1);
  });
});
