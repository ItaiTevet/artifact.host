import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';
import { setArtifactCommentsEnabled } from '@/lib/artifacts/service';

async function seed(ownerId: string | null) {
  const repo = new InMemoryRepository();
  await repo.insert({
    slug: 's1', content: '<p>x</p>', title: null, visibility: 'public',
    passwordHash: null, ownerId, editTokenHash: 'eth', deployIp: null,
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
