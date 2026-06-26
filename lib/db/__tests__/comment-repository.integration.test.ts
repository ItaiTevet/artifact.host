import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SupabaseCommentRepository } from '@/lib/db/supabase-comment-repository';
import type { Anchor } from '@/lib/artifacts/comment-types';

/**
 * Real integration test for the Supabase comment repository adapter.
 *
 * Runs ONLY when NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set
 * (loaded from .env.local). Point these at a DEV/TEST Supabase project with the
 * comments migration applied. The test namespaces rows by a per-run slug and
 * cleans up via cascade delete of the parent artifact afterward.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = !!(URL && KEY);

const RUN = `cmt-int-${Date.now()}`;
const SLUG = `${RUN}-slug`;
const pin: Anchor = { kind: 'pin', path: [0], context: '' };
const hl: Anchor = { kind: 'highlight', quote: 'hello' };

describe.skipIf(!hasEnv)('SupabaseCommentRepository (integration)', () => {
  let db: SupabaseClient;
  let repo: SupabaseCommentRepository;

  beforeAll(async () => {
    db = createClient(URL!, KEY!, { auth: { persistSession: false } });
    repo = new SupabaseCommentRepository(db);
    await db.from('artifacts').insert({
      slug: SLUG, content: '<p>x</p>', visibility: 'public',
      edit_token_hash: 'h', comments_enabled: true,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
  });

  afterAll(async () => {
    await db.from('artifacts').delete().eq('slug', SLUG); // cascade removes comments
  });

  it('round-trips comments and cascades on artifact delete', async () => {
    const a = await repo.insert({ artifactSlug: SLUG, authorId: 'u1', authorEmail: 'a@x.com', body: 'first', anchor: pin });
    const b = await repo.insert({ artifactSlug: SLUG, authorId: 'u2', authorEmail: null, body: 'second', anchor: hl });
    const list = await repo.listBySlug(SLUG);
    expect(list.map((c) => c.id)).toEqual([a.id, b.id]);
    expect(list[1].anchor).toEqual(hl);
    expect(list[0].anchor).toEqual(pin);

    await repo.updateBody(a.id, 'edited');
    await repo.setResolved(a.id, true);
    const got = await repo.findById(a.id);
    expect(got).toMatchObject({ body: 'edited', resolved: true });

    expect(await repo.deleteById(b.id)).toBe(true);
    expect((await repo.listBySlug(SLUG)).map((c) => c.id)).toEqual([a.id]);
  });
});
