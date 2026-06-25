import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '@/lib/db/sqlite';
import { SqliteArtifactRepository } from '@/lib/db/sqlite-artifact-repository';
import { SqliteTokenRepository } from '@/lib/db/sqlite-token-repository';
import { SqliteUserRepository } from '@/lib/db/sqlite-user-repository';
import { hashPersonalToken } from '@/lib/auth/personal-token';
import type { NewArtifact } from '@/lib/artifacts/repository';

function freshDb() {
  const db = new Database(':memory:');
  applySchema(db);
  return db;
}

const base = (over: Partial<NewArtifact> = {}): NewArtifact => ({
  slug: 'abc123', content: '<h1>hi</h1>', title: 'Hi', visibility: 'public',
  passwordHash: null, ownerId: null, editTokenHash: 'eth', deployIpHash: 'ip1',
  expiresAt: new Date(Date.now() + 7 * 864e5), ...over,
});

describe('SqliteArtifactRepository', () => {
  let repo: SqliteArtifactRepository;
  beforeEach(() => { repo = new SqliteArtifactRepository(freshDb()); });

  it('inserts and reads back by slug with parsed dates', async () => {
    const rec = await repo.insert(base());
    expect(rec.id).toBeTruthy();
    expect(rec.createdAt).toBeInstanceOf(Date);
    const found = await repo.findBySlug('abc123');
    expect(found?.content).toBe('<h1>hi</h1>');
    expect(found?.expiresAt).toBeInstanceOf(Date);
    expect(await repo.slugExists('abc123')).toBe(true);
    expect(await repo.findBySlug('missing')).toBeNull();
  });

  it('updates content and visibility', async () => {
    await repo.insert(base());
    await repo.updateContent('abc123', '<p>new</p>', 'New');
    await repo.updateVisibility('abc123', 'password', 'ph', []);
    const r = await repo.findBySlug('abc123');
    expect(r?.content).toBe('<p>new</p>');
    expect(r?.title).toBe('New');
    expect(r?.visibility).toBe('password');
    expect(r?.passwordHash).toBe('ph');
  });

  it('increments views', async () => {
    await repo.insert(base());
    await repo.incrementViews('abc123');
    await repo.incrementViews('abc123');
    expect((await repo.findBySlug('abc123'))?.viewCount).toBe(2);
  });

  it('lists/counts by owner and deletes owned', async () => {
    const now = new Date();
    await repo.insert(base({ slug: 'a', ownerId: 'u1' }));
    await repo.insert(base({ slug: 'b', ownerId: 'u1' }));
    await repo.insert(base({ slug: 'c', ownerId: 'u2' }));
    expect((await repo.listByOwner('u1', now)).map((x) => x.slug).sort()).toEqual(['a', 'b']);
    expect(await repo.countLiveByOwner('u1', now)).toBe(2);
    expect(await repo.deleteOwned('a', 'u1')).toBe(true);
    expect(await repo.deleteOwned('c', 'u1')).toBe(false); // not owner
    expect(await repo.countLiveByOwner('u1', now)).toBe(1);
  });

  it('counts anonymous live + recent deploys by ip, and purges expired', async () => {
    const now = new Date();
    await repo.insert(base({ slug: 'live', deployIpHash: 'ip9' }));
    await repo.insert(base({ slug: 'gone', deployIpHash: 'ip9', expiresAt: new Date(now.getTime() - 1000) }));
    expect(await repo.countLiveByIp('ip9', now)).toBe(1);
    expect(await repo.countRecentDeploysByIp('ip9', new Date(now.getTime() - 60_000))).toBe(2);
    expect(await repo.deleteExpired(now)).toBe(1);
    expect(await repo.findBySlug('gone')).toBeNull();
    expect(await repo.findBySlug('live')).not.toBeNull();
  });
});

describe('SqliteTokenRepository', () => {
  it('creates, resolves (touching last_used), lists, and revokes', async () => {
    const repo = new SqliteTokenRepository(freshDb());
    const hash = hashPersonalToken('ah_secret');
    const rec = await repo.create({ ownerId: 'u1', name: 'CLI', tokenHash: hash, expiresAt: null });
    const now = new Date();
    expect(await repo.resolveOwner(hash, now)).toBe('u1');
    expect(await repo.resolveOwner('nope', now)).toBeNull();
    const list = await repo.listByOwner('u1');
    expect(list).toHaveLength(1);
    expect(list[0].lastUsedAt).toBeInstanceOf(Date); // stamped by resolveOwner
    expect(await repo.revoke(rec.id, 'u1')).toBe(true);
    expect(await repo.resolveOwner(hash, now)).toBeNull();
  });

  it('rejects expired tokens', async () => {
    const repo = new SqliteTokenRepository(freshDb());
    const hash = hashPersonalToken('ah_old');
    await repo.create({ ownerId: 'u2', name: 'old', tokenHash: hash, expiresAt: new Date('2020-01-01') });
    expect(await repo.resolveOwner(hash, new Date('2026-01-01'))).toBeNull();
  });
});

describe('SqliteUserRepository', () => {
  it('creates, finds by email, and counts', async () => {
    const repo = new SqliteUserRepository(freshDb());
    expect(await repo.count()).toBe(0);
    const u = await repo.create('a@b.com', 'hash1');
    expect(u.id).toBeTruthy();
    expect(u.email).toBe('a@b.com');
    expect((await repo.findByEmail('a@b.com'))?.passwordHash).toBe('hash1');
    expect(await repo.findByEmail('missing@b.com')).toBeNull();
    expect(await repo.count()).toBe(1);
  });

  it('records and counts recent auth attempts per ip within a window', async () => {
    const repo = new SqliteUserRepository(freshDb());
    const now = new Date();
    const since = new Date(now.getTime() - 10 * 60 * 1000);
    await repo.recordAuthAttempt('ipA', now);
    await repo.recordAuthAttempt('ipA', now);
    await repo.recordAuthAttempt('ipB', now);
    expect(await repo.countRecentAuthAttempts('ipA', since)).toBe(2);
    expect(await repo.countRecentAuthAttempts('ipB', since)).toBe(1);
    expect(await repo.countRecentAuthAttempts('ipC', since)).toBe(0);
  });

  it('self-prunes attempts older than the window and excludes them from counts', async () => {
    const repo = new SqliteUserRepository(freshDb());
    const old = new Date('2020-01-01T00:00:00Z');
    await repo.recordAuthAttempt('ipA', old);            // far in the past
    const now = new Date();
    await repo.recordAuthAttempt('ipA', now);            // recording prunes the stale row
    const since = new Date(now.getTime() - 10 * 60 * 1000);
    expect(await repo.countRecentAuthAttempts('ipA', since)).toBe(1);
  });
});
