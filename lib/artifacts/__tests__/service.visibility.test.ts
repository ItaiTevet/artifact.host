import { describe, it, expect } from 'vitest';
import { deployArtifact, setVisibility } from '@/lib/artifacts/service';
import { verifyPassword } from '@/lib/artifacts/tokens';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';

const deps = {
  now: () => new Date('2026-06-01T00:00:00.000Z'),
  newSlug: () => 'slugV',
  newEditToken: () => 'edit-token-yyyyyyyyyyyyyyyyyyyyyy',
  baseUrl: 'https://artifact.host',
};

describe('setVisibility', () => {
  it('sets a password (stored hashed) with a valid edit token', async () => {
    const repo = new InMemoryRepository();
    const { editToken } = await deployArtifact(repo, { content: 'x', ipHash: 'ip1' }, deps);
    await setVisibility(repo, 'slugV', 'password', 'pw', { editToken });
    const row = await repo.findBySlug('slugV');
    expect(row?.visibility).toBe('password');
    expect(await verifyPassword('pw', row!.passwordHash!)).toBe(true);
  });

  it('clears the password hash when switching back to public', async () => {
    const repo = new InMemoryRepository();
    const { editToken } = await deployArtifact(repo, {
      content: 'x', visibility: 'password', password: 'pw', ipHash: 'ip1',
    }, deps);
    await setVisibility(repo, 'slugV', 'public', null, { editToken });
    const row = await repo.findBySlug('slugV');
    expect(row?.visibility).toBe('public');
    expect(row?.passwordHash).toBeNull();
  });

  it('requires a password when switching to password visibility', async () => {
    const repo = new InMemoryRepository();
    const { editToken } = await deployArtifact(repo, { content: 'x', ipHash: 'ip1' }, deps);
    await expect(setVisibility(repo, 'slugV', 'password', null, { editToken }))
      .rejects.toMatchObject({ code: 'password_required' });
  });

  it('rejects an unauthorized caller', async () => {
    const repo = new InMemoryRepository();
    await deployArtifact(repo, { content: 'x', ipHash: 'ip1' }, deps);
    await expect(setVisibility(repo, 'slugV', 'public', null, { editToken: 'wrong' }))
      .rejects.toMatchObject({ code: 'forbidden' });
  });
});
