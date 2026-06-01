import { describe, it, expect } from 'vitest';
import { deployArtifact, viewArtifact } from '@/lib/artifacts/service';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';

const deps = {
  now: () => new Date('2026-06-01T00:00:00.000Z'),
  newSlug: () => 'slugW',
  newEditToken: () => 'edit-token-zzzzzzzzzzzzzzzzzzzzzz',
  baseUrl: 'https://artifact.host',
};

describe('viewArtifact', () => {
  it('serves public content and increments views', async () => {
    const repo = new InMemoryRepository();
    await deployArtifact(repo, { content: '<h1>hello</h1>', ipHash: 'ip1' }, deps);
    const res = await viewArtifact(repo, 'slugW', { passwordVerified: false }, deps);
    expect(res.status).toBe('ok');
    if (res.status === 'ok') expect(res.content).toBe('<h1>hello</h1>');
    expect((await repo.findBySlug('slugW'))?.viewCount).toBe(1);
  });

  it('gates password content until verified, without leaking HTML', async () => {
    const repo = new InMemoryRepository();
    await deployArtifact(repo, {
      content: '<secret/>', visibility: 'password', password: 'pw', ipHash: 'ip1',
    }, deps);
    const gated = await viewArtifact(repo, 'slugW', { passwordVerified: false }, deps);
    expect(gated.status).toBe('password_required');
    expect(JSON.stringify(gated)).not.toContain('secret');
    expect((await repo.findBySlug('slugW'))?.viewCount).toBe(0); // no view counted while gated

    const ok = await viewArtifact(repo, 'slugW', { passwordVerified: true }, deps);
    expect(ok.status).toBe('ok');
    if (ok.status === 'ok') expect(ok.content).toBe('<secret/>');
  });

  it('treats an expired artifact as not found', async () => {
    const repo = new InMemoryRepository();
    await deployArtifact(repo, { content: 'x', ttl: '1h', ipHash: 'ip1' }, deps);
    const later = { ...deps, now: () => new Date('2026-06-02T00:00:00.000Z') };
    const res = await viewArtifact(repo, 'slugW', { passwordVerified: false }, later);
    expect(res.status).toBe('not_found');
  });

  it('returns not_found for an unknown slug', async () => {
    const repo = new InMemoryRepository();
    const res = await viewArtifact(repo, 'ghost', { passwordVerified: false }, deps);
    expect(res.status).toBe('not_found');
  });
});
