import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';
import { deployHtml, updateHtml, setArtifactVisibility } from '@/lib/mcp/handlers';

const IP = 'ip-test';

describe('mcp handlers', () => {
  it('deployHtml returns url/slug/edit_token/expires_at', async () => {
    const repo = new InMemoryRepository();
    const out = await deployHtml(repo, { html: '<title>T</title><h1>hi</h1>' }, IP);
    expect(out.url).toContain('/a/' + out.slug);
    expect(out.edit_token.length).toBeGreaterThan(10);
    expect(new Date(out.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('deployHtml passes ttl and visibility through to the service', async () => {
    const repo = new InMemoryRepository();
    const out = await deployHtml(repo, { html: '<h1>a</h1>', ttl: '1h', visibility: 'public' }, IP);
    const row = (await repo.findBySlug(out.slug))!;
    expect(row.visibility).toBe('public');
    expect(new Date(out.expires_at).getTime() - Date.now()).toBeLessThan(2 * 3600_000);
  });

  it('updateHtml succeeds with the matching edit_token and replaces content', async () => {
    const repo = new InMemoryRepository();
    const dep = await deployHtml(repo, { html: '<h1>a</h1>' }, IP);
    const out = await updateHtml(repo, { slug: dep.slug, html: '<h1>b</h1>', edit_token: dep.edit_token });
    expect(out.url).toContain(dep.slug);
    expect((await repo.findBySlug(dep.slug))!.content).toBe('<h1>b</h1>');
  });

  it('updateHtml throws forbidden on a wrong edit_token', async () => {
    const repo = new InMemoryRepository();
    const dep = await deployHtml(repo, { html: '<h1>a</h1>' }, IP);
    await expect(
      updateHtml(repo, { slug: dep.slug, html: '<h1>b</h1>', edit_token: 'nope' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('setArtifactVisibility sets a password hash', async () => {
    const repo = new InMemoryRepository();
    const dep = await deployHtml(repo, { html: '<h1>a</h1>' }, IP);
    const out = await setArtifactVisibility(repo, {
      slug: dep.slug, visibility: 'password', password: 'pw', edit_token: dep.edit_token,
    });
    expect(out.visibility).toBe('password');
    expect((await repo.findBySlug(dep.slug))!.passwordHash).toBeTruthy();
  });
});
