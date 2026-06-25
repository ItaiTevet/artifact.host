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
