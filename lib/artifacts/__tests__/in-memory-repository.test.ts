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
