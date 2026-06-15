import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRepository } from './in-memory-repository';
import { deployArtifact, setVisibility, viewArtifact } from '@/lib/artifacts/service';
import { parsePrincipals } from '@/lib/artifacts/sharing';
import type { ServiceDeps } from '@/lib/artifacts/service';

const deps: ServiceDeps = {
  now: () => new Date('2026-06-15T00:00:00Z'),
  newSlug: () => 'shareme',
  newEditToken: () => 'edit-tok',
  baseUrl: 'https://artifact.host',
};

async function setup() {
  const repo = new InMemoryRepository();
  await deployArtifact(repo, { content: '<h1>secret</h1>', ownerId: 'owner-1', ipHash: 'ip' }, deps);
  await setVisibility(
    repo, 'shareme', 'restricted', null, { ownerId: 'owner-1' },
    parsePrincipals('alice@intezer.com, @partner.com'),
  );
  return repo;
}

describe('restricted sharing', () => {
  let repo: InMemoryRepository;
  beforeEach(async () => { repo = await setup(); });

  it('serves the owner regardless of the allowlist', async () => {
    const res = await viewArtifact(repo, 'shareme', { passwordVerified: false, viewer: { ownerId: 'owner-1' } }, deps);
    expect(res.status).toBe('ok');
  });

  it('serves an allowlisted email and an allowlisted domain', async () => {
    const byEmail = await viewArtifact(repo, 'shareme', { passwordVerified: false, viewer: { ownerId: 'x', email: 'alice@intezer.com' } }, deps);
    expect(byEmail.status).toBe('ok');
    const byDomain = await viewArtifact(repo, 'shareme', { passwordVerified: false, viewer: { ownerId: 'y', email: 'bob@partner.com' } }, deps);
    expect(byDomain.status).toBe('ok');
  });

  it('denies a signed-in viewer not on the list, and prompts login when anonymous', async () => {
    const denied = await viewArtifact(repo, 'shareme', { passwordVerified: false, viewer: { ownerId: 'z', email: 'eve@evil.com' } }, deps);
    expect(denied).toMatchObject({ status: 'restricted', reason: 'denied' });
    const anon = await viewArtifact(repo, 'shareme', { passwordVerified: false, viewer: null }, deps);
    expect(anon).toMatchObject({ status: 'restricted', reason: 'login' });
  });

  it('does not increment views when access is denied', async () => {
    await viewArtifact(repo, 'shareme', { passwordVerified: false, viewer: null }, deps);
    const rec = await repo.findBySlug('shareme');
    expect(rec?.viewCount).toBe(0);
  });

  it('clears the allowlist when switching back to public', async () => {
    await setVisibility(repo, 'shareme', 'public', null, { ownerId: 'owner-1' });
    const rec = await repo.findBySlug('shareme');
    expect(rec?.visibility).toBe('public');
    expect(rec?.shareAllowlist).toEqual([]);
    const res = await viewArtifact(repo, 'shareme', { passwordVerified: false, viewer: null }, deps);
    expect(res.status).toBe('ok');
  });
});
