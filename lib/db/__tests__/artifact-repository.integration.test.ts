import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';
import type { NewArtifact } from '@/lib/artifacts/repository';

/**
 * Real integration test for the Supabase adapter + SQL schema + RPC.
 *
 * Runs ONLY when NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set
 * (loaded from .env.local). Point these at a DEV/TEST Supabase project — the
 * deleteExpired test removes ALL globally-expired rows, and rows created here
 * are namespaced by a per-run slug prefix and cleaned up afterward.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = !!(URL && KEY);

const RUN = randomUUID().slice(0, 8); // namespaces all rows from this run
const PAST = new Date(Date.now() - 60_000);
const FUTURE = new Date(Date.now() + 24 * 3600_000);

function newArtifact(suffix: string, over: Partial<NewArtifact> = {}): NewArtifact {
  return {
    slug: `${RUN}-${suffix}`,
    content: '<title>integration</title><h1>hi</h1>',
    title: 'integration',
    visibility: 'public',
    passwordHash: null,
    ownerId: null,
    editTokenHash: 'a'.repeat(64),
    deployIp: `ip-${RUN}`,
    expiresAt: FUTURE,
    ...over,
  };
}

describe.skipIf(!hasEnv)('SupabaseArtifactRepository (integration)', () => {
  let db: SupabaseClient;
  let repo: SupabaseArtifactRepository;
  const createdUserIds: string[] = [];

  beforeAll(() => {
    db = createClient(URL!, KEY!, { auth: { persistSession: false } });
    repo = new SupabaseArtifactRepository(db);
  });

  afterAll(async () => {
    // Remove every row this run created.
    await db.from('artifacts').delete().like('slug', `${RUN}-%`);
    for (const id of createdUserIds) {
      await db.auth.admin.deleteUser(id);
    }
  });

  it('inserts and round-trips all fields (snake/camel mapping, dates)', async () => {
    const rec = await repo.insert(newArtifact('rt', { title: 'Round Trip' }));
    expect(rec.slug).toBe(`${RUN}-rt`);
    expect(rec.title).toBe('Round Trip');
    expect(rec.visibility).toBe('public');
    expect(rec.ownerId).toBeNull();
    expect(rec.viewCount).toBe(0);
    expect(rec.expiresAt).toBeInstanceOf(Date);
    expect(rec.createdAt).toBeInstanceOf(Date);

    const found = await repo.findBySlug(`${RUN}-rt`);
    expect(found?.content).toBe('<title>integration</title><h1>hi</h1>');
    expect(found?.deployIp).toBe(`ip-${RUN}`);
  });

  it('reports slug existence', async () => {
    await repo.insert(newArtifact('exists'));
    expect(await repo.slugExists(`${RUN}-exists`)).toBe(true);
    expect(await repo.slugExists(`${RUN}-nope`)).toBe(false);
  });

  it('returns null for an unknown slug', async () => {
    expect(await repo.findBySlug(`${RUN}-ghost`)).toBeNull();
  });

  it('updates content and title', async () => {
    await repo.insert(newArtifact('upd'));
    const updated = await repo.updateContent(`${RUN}-upd`, '<title>v2</title>', 'v2');
    expect(updated.content).toBe('<title>v2</title>');
    expect(updated.title).toBe('v2');
  });

  it('sets and clears the password hash / visibility', async () => {
    await repo.insert(newArtifact('vis'));
    const pw = await repo.updateVisibility(`${RUN}-vis`, 'password', 'deadbeef:cafe', []);
    expect(pw.visibility).toBe('password');
    expect(pw.passwordHash).toBe('deadbeef:cafe');
    const pub = await repo.updateVisibility(`${RUN}-vis`, 'public', null, []);
    expect(pub.visibility).toBe('public');
    expect(pub.passwordHash).toBeNull();
  });

  it('increments the view count via the RPC', async () => {
    await repo.insert(newArtifact('views'));
    await repo.incrementViews(`${RUN}-views`);
    await repo.incrementViews(`${RUN}-views`);
    expect((await repo.findBySlug(`${RUN}-views`))?.viewCount).toBe(2);
  });

  it('counts anonymous live artifacts by IP, excluding expired', async () => {
    const ip = `ip-count-${RUN}`;
    await repo.insert(newArtifact('live1', { deployIp: ip, expiresAt: FUTURE }));
    await repo.insert(newArtifact('live2', { deployIp: ip, expiresAt: FUTURE }));
    await repo.insert(newArtifact('dead', { deployIp: ip, expiresAt: PAST }));
    expect(await repo.countLiveByIp(ip, new Date())).toBe(2);
  });

  it('counts recent deploys by IP within a time window', async () => {
    const ip = `ip-recent-${RUN}`;
    await repo.insert(newArtifact('r1', { deployIp: ip }));
    await repo.insert(newArtifact('r2', { deployIp: ip }));
    const sinceNow = new Date(Date.now() - 60_000);
    expect(await repo.countRecentDeploysByIp(ip, sinceNow)).toBe(2);
    const sinceFuture = new Date(Date.now() + 60_000);
    expect(await repo.countRecentDeploysByIp(ip, sinceFuture)).toBe(0);
  });

  it('accepts a real owner_id (FK to auth.users) and counts live by owner', async () => {
    const email = `it-${RUN}@example.com`;
    const { data, error } = await db.auth.admin.createUser({
      email, password: randomUUID(), email_confirm: true,
    });
    expect(error).toBeNull();
    const createdUserId = data.user!.id;
    createdUserIds.push(createdUserId);

    await repo.insert(newArtifact('owned', { ownerId: createdUserId, expiresAt: FUTURE }));
    expect(await repo.countLiveByOwner(createdUserId, new Date())).toBe(1);
  });

  it('lists an owner’s live artifacts as summaries (newest first, no content), excluding expired and other owners', async () => {
    const mk = async (suffix: string) => {
      const { data, error } = await db.auth.admin.createUser({
        email: `it-${suffix}-${RUN}@example.com`, password: randomUUID(), email_confirm: true,
      });
      expect(error).toBeNull();
      const id = data.user!.id;
      createdUserIds.push(id);
      return id;
    };
    const ownerId = await mk('list');
    const otherId = await mk('list-other');

    await repo.insert(newArtifact('list-a', { ownerId, title: 'A', expiresAt: FUTURE }));
    await new Promise((r) => setTimeout(r, 10)); // guarantee list-b has a strictly later created_at (deterministic ordering)
    await repo.insert(newArtifact('list-b', { ownerId, title: 'B', expiresAt: FUTURE }));
    await repo.insert(newArtifact('list-exp', { ownerId, title: 'Expired', expiresAt: PAST }));
    await repo.insert(newArtifact('list-other', { ownerId: otherId, title: 'Other', expiresAt: FUTURE }));

    const list = await repo.listByOwner(ownerId, new Date());
    expect(list.map((s) => s.slug)).toEqual([`${RUN}-list-b`, `${RUN}-list-a`]); // newest first; excludes expired + other owner
    expect(list[0]).not.toHaveProperty('content');
    expect(list[0].title).toBe('B');
    expect(list[0].viewCount).toBe(0);
  });

  it('deletes an artifact only for its owner', async () => {
    const { data, error } = await db.auth.admin.createUser({
      email: `it-del-${RUN}@example.com`, password: randomUUID(), email_confirm: true,
    });
    expect(error).toBeNull();
    const ownerId = data.user!.id;
    createdUserIds.push(ownerId);

    await repo.insert(newArtifact('del', { ownerId, expiresAt: FUTURE }));
    expect(await repo.deleteOwned(`${RUN}-del`, randomUUID())).toBe(false); // wrong owner — untouched
    expect(await repo.findBySlug(`${RUN}-del`)).not.toBeNull();
    expect(await repo.deleteOwned(`${RUN}-del`, ownerId)).toBe(true);
    expect(await repo.findBySlug(`${RUN}-del`)).toBeNull();
  });

  it('deletes expired rows (global sweep) and returns a count', async () => {
    await repo.insert(newArtifact('exp', { deployIp: `ip-exp-${RUN}`, expiresAt: PAST }));
    const deleted = await repo.deleteExpired(new Date());
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await repo.findBySlug(`${RUN}-exp`)).toBeNull();
  });
});
