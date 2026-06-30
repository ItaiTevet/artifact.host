import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from './in-memory-repository';
import { listOwnArtifacts, getOwnArtifact, deleteArtifact } from '@/lib/artifacts/service';
import { ServiceError } from '@/lib/artifacts/errors';
import type { NewArtifact } from '@/lib/artifacts/repository';

function seed(over: Partial<NewArtifact> = {}): NewArtifact {
  return {
    slug: 'a1', content: '<h1>hi</h1>', title: 'hi', visibility: 'public',
    passwordHash: null, ownerId: 'owner-1', editTokenHash: 'h', deployIp: 'ip',
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
    await expect(repo.findBySlug('a1')).resolves.not.toBeNull();
  });
});

it('ServiceError is the thrown type', () => { expect(new ServiceError('forbidden', 'x').code).toBe('forbidden'); });
