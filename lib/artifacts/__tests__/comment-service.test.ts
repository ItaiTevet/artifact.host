import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';
import { InMemoryCommentRepository } from '@/lib/artifacts/__tests__/in-memory-comment-repository';
import { createComment, listComments, editCommentBody, resolveComment, deleteComment } from '@/lib/artifacts/comment-service';
import type { Anchor } from '@/lib/artifacts/comment-types';

const pin: Anchor = { kind: 'pin', x: 0.5, y: 0.5 };
const OWNER = { ownerId: 'owner-1', email: 'owner@x.com' };

async function seed(opts: { visibility?: 'public' | 'password' | 'restricted'; commentsEnabled?: boolean; allowlist?: { value: string; type: 'email' | 'domain'; role: 'view' | 'comment' }[] } = {}) {
  const artifacts = new InMemoryRepository();
  const comments = new InMemoryCommentRepository();
  await artifacts.insert({
    slug: 's1', content: '<p>hi</p>', title: null, visibility: opts.visibility ?? 'public',
    passwordHash: null, ownerId: 'owner-1', editTokenHash: 'h', deployIpHash: null,
    expiresAt: new Date(Date.now() + 60_000),
  });
  if (opts.commentsEnabled) await artifacts.setCommentsEnabled('s1', true);
  if (opts.allowlist) await artifacts.updateVisibility('s1', 'restricted', null, opts.allowlist);
  return { artifacts, comments };
}

describe('comment-service authorization', () => {
  it('rejects all comment ops when comments are disabled', async () => {
    const { artifacts, comments } = await seed({ commentsEnabled: false });
    await expect(createComment(artifacts, comments, 's1', { body: 'x', anchor: pin }, OWNER))
      .rejects.toMatchObject({ code: 'comments_disabled' });
  });

  it('public + enabled: any signed-in viewer can comment; anonymous cannot', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    const c = await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, { ownerId: 'rando', email: 'r@x.com' });
    expect(c.authorId).toBe('rando');
    await expect(createComment(artifacts, comments, 's1', { body: 'no', anchor: pin }, null))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('restricted + enabled: comment-role may post, view-role may not', async () => {
    const { artifacts, comments } = await seed({
      visibility: 'restricted', commentsEnabled: true,
      allowlist: [
        { value: 'c@x.com', type: 'email', role: 'comment' },
        { value: 'v@x.com', type: 'email', role: 'view' },
      ],
    });
    await createComment(artifacts, comments, 's1', { body: 'ok', anchor: pin }, { ownerId: 'c', email: 'c@x.com' });
    await expect(createComment(artifacts, comments, 's1', { body: 'no', anchor: pin }, { ownerId: 'v', email: 'v@x.com' }))
      .rejects.toMatchObject({ code: 'forbidden' });
    await createComment(artifacts, comments, 's1', { body: 'owner', anchor: pin }, OWNER);
  });

  it('rejects an over-cap body', async () => {
    const { artifacts, comments } = await seed({ commentsEnabled: true });
    const big = 'a'.repeat(8 * 1024 + 1);
    await expect(createComment(artifacts, comments, 's1', { body: big, anchor: pin }, OWNER))
      .rejects.toMatchObject({ code: 'comment_too_large' });
  });

  it('listComments: anyone who can view (public → even anonymous)', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, OWNER);
    const list = await listComments(artifacts, comments, 's1', { viewer: null, passwordVerified: false });
    expect(list).toHaveLength(1);
  });

  it('edit body: author only; delete: author or owner; resolve: owner or comment-access', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    const c = await createComment(artifacts, comments, 's1', { body: 'mine', anchor: pin }, { ownerId: 'rando', email: 'r@x.com' });
    await expect(editCommentBody(artifacts, comments, 's1', c.id, 'hax', OWNER)).rejects.toMatchObject({ code: 'forbidden' });
    await editCommentBody(artifacts, comments, 's1', c.id, 'edited', { ownerId: 'rando', email: 'r@x.com' });
    const r = await resolveComment(artifacts, comments, 's1', c.id, true, OWNER);
    expect(r.resolved).toBe(true);
    expect(await deleteComment(artifacts, comments, 's1', c.id, OWNER)).toEqual({ ok: true });
  });
});
