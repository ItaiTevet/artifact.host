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
  return deployArtifact(repo, { content: '<title>v1</title>', deployIp: 'ip1', ...over }, deps);
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
