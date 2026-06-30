import { describe, it, expect } from 'vitest';
import { deployArtifact } from '@/lib/artifacts/service';
import { MAX_BYTES } from '@/lib/artifacts/validate';
import { ANON_LIVE_CAP } from '@/lib/artifacts/constants';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';

const deps = {
  now: () => new Date('2026-06-01T00:00:00.000Z'),
  newSlug: () => 'fixedslug',
  newEditToken: () => 'fixed-edit-token-aaaaaaaaaaaaaaaa',
  baseUrl: 'https://artifact.host',
};

describe('deployArtifact', () => {
  it('creates a public artifact and returns slug/url/token/expiry', async () => {
    const repo = new InMemoryRepository();
    const res = await deployArtifact(repo, { content: '<title>Hi</title>', ipHash: 'ip1' }, deps);
    expect(res.slug).toBe('fixedslug');
    expect(res.url).toBe('https://artifact.host/a/fixedslug');
    expect(res.editToken).toBe('fixed-edit-token-aaaaaaaaaaaaaaaa');
    expect(res.expiresAt.toISOString()).toBe('2026-06-08T00:00:00.000Z'); // default 7d
    const row = await repo.findBySlug('fixedslug');
    expect(row?.title).toBe('Hi');
    expect(row?.editTokenHash).not.toBe(res.editToken); // stored hashed
  });

  it('defaults ttl to 7d and visibility to public', async () => {
    const repo = new InMemoryRepository();
    const res = await deployArtifact(repo, { content: 'x', ipHash: 'ip1' }, deps);
    const row = await repo.findBySlug(res.slug);
    expect(row?.visibility).toBe('public');
  });

  it('hashes the password when visibility is password', async () => {
    const repo = new InMemoryRepository();
    const res = await deployArtifact(repo, {
      content: 'x', visibility: 'password', password: 'secret', ipHash: 'ip1',
    }, deps);
    const row = await repo.findBySlug(res.slug);
    expect(row?.visibility).toBe('password');
    expect(row?.passwordHash).toBeTruthy();
    expect(row?.passwordHash).not.toBe('secret');
  });

  it('rejects password visibility with no password', async () => {
    const repo = new InMemoryRepository();
    await expect(deployArtifact(repo, {
      content: 'x', visibility: 'password', ipHash: 'ip1',
    }, deps)).rejects.toMatchObject({ code: 'password_required' });
  });

  it('rejects an invalid ttl', async () => {
    const repo = new InMemoryRepository();
    await expect(deployArtifact(repo, {
      content: 'x', ttl: '99d' as never, ipHash: 'ip1',
    }, deps)).rejects.toMatchObject({ code: 'invalid_ttl' });
  });

  it('rejects content over 5MB', async () => {
    const repo = new InMemoryRepository();
    await expect(deployArtifact(repo, {
      content: 'a'.repeat(MAX_BYTES + 1), ipHash: 'ip1',
    }, deps)).rejects.toMatchObject({ code: 'too_large' });
  });

  it('enforces the anonymous live cap', async () => {
    const repo = new InMemoryRepository();
    let slug = 0;
    const seqDeps = { ...deps, newSlug: () => `slug${slug++}` };
    for (let i = 0; i < ANON_LIVE_CAP; i++) {
      await deployArtifact(repo, { content: 'x', ipHash: 'ipX' }, seqDeps);
    }
    await expect(deployArtifact(repo, { content: 'x', ipHash: 'ipX' }, seqDeps))
      .rejects.toMatchObject({ code: 'live_cap_reached' });
  });

  it('retries slug generation on collision', async () => {
    const repo = new InMemoryRepository();
    const slugs = ['dup', 'dup', 'unique'];
    let i = 0;
    const collidingDeps = { ...deps, newSlug: () => slugs[i++] };
    await deployArtifact(repo, { content: 'x', ipHash: 'ip1' }, collidingDeps); // takes 'dup'
    const res = await deployArtifact(repo, { content: 'x', ipHash: 'ip2' }, collidingDeps); // 'dup' taken -> 'unique'
    expect(res.slug).toBe('unique');
  });
});
