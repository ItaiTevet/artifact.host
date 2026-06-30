import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';
import type { NewArtifact } from '@/lib/artifacts/repository';

const base = (over = {}) => ({
  slug: 's1', content: '<html></html>', title: null,
  visibility: 'public' as const, passwordHash: null,
  ownerId: null, editTokenHash: 'h', deployIp: 'ip',
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

function newArtifact(over: Partial<NewArtifact> = {}): NewArtifact {
  return {
    slug: 'aaaa', content: '<h1>hi</h1>', title: 'hi', visibility: 'public',
    passwordHash: null, ownerId: 'owner-1', editTokenHash: 'h', deployIp: 'ip',
    expiresAt: new Date(Date.now() + 86_400_000), ...over,
  };
}

describe('InMemoryRepository.listByOwner', () => {
  it('returns live artifacts for the owner, newest first, as summaries without content', async () => {
    const repo = new InMemoryRepository();
    const tick = () => new Promise((r) => setTimeout(r, 2)); // ensure distinct createdAt timestamps
    await repo.insert(newArtifact({ slug: 'a1', ownerId: 'owner-1', title: 'One' }));
    await tick();
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
