import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';
import { InMemoryCommentRepository } from '@/lib/artifacts/__tests__/in-memory-comment-repository';
import { createComment, listComments, editCommentBody, resolveComment, deleteComment, commentCaps, listCommentsForViewer } from '@/lib/artifacts/comment-service';
import type { Anchor } from '@/lib/artifacts/comment-types';

const pin: Anchor = { kind: 'pin', path: [0], context: '' };
const OWNER = { ownerId: 'owner-1', email: 'owner@x.com' };
const ctx = (viewer: { ownerId: string; email?: string | null } | null, passwordVerified = false) => ({ viewer, passwordVerified });

async function seed(opts: { visibility?: 'public' | 'password' | 'restricted'; commentsEnabled?: boolean; passwordHash?: string | null; allowlist?: { value: string; type: 'email' | 'domain'; role: 'view' | 'comment' }[] } = {}) {
  const artifacts = new InMemoryRepository();
  const comments = new InMemoryCommentRepository();
  await artifacts.insert({
    slug: 's1', content: '<p>hi</p>', title: null, visibility: opts.visibility ?? 'public',
    passwordHash: opts.passwordHash ?? null, ownerId: 'owner-1', editTokenHash: 'h', deployIpHash: null,
    expiresAt: new Date(Date.now() + 60_000),
  });
  if (opts.commentsEnabled) await artifacts.setCommentsEnabled('s1', true);
  if (opts.allowlist) await artifacts.updateVisibility('s1', 'restricted', null, opts.allowlist);
  return { artifacts, comments };
}

describe('comment-service authorization', () => {
  it('rejects all comment ops when comments are disabled', async () => {
    const { artifacts, comments } = await seed({ commentsEnabled: false });
    await expect(createComment(artifacts, comments, 's1', { body: 'x', anchor: pin }, ctx(OWNER)))
      .rejects.toMatchObject({ code: 'comments_disabled' });
  });

  it('public + enabled: any signed-in viewer can comment; anonymous cannot', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    const c = await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx({ ownerId: 'rando', email: 'r@x.com' }));
    expect(c.authorId).toBe('rando');
    await expect(createComment(artifacts, comments, 's1', { body: 'no', anchor: pin }, ctx(null)))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('password + enabled: signed-in viewer needs passwordVerified to post; owner does not', async () => {
    const { artifacts, comments } = await seed({ visibility: 'password', commentsEnabled: true, passwordHash: 'h' });
    const viewer = { ownerId: 'rando', email: 'r@x.com' };
    await expect(createComment(artifacts, comments, 's1', { body: 'x', anchor: pin }, ctx(viewer, false)))
      .rejects.toMatchObject({ code: 'forbidden' });
    const ok = await createComment(artifacts, comments, 's1', { body: 'ok', anchor: pin }, ctx(viewer, true));
    expect(ok.authorId).toBe('rando');
    // owner short-circuits the read gate (no password needed)
    await createComment(artifacts, comments, 's1', { body: 'owner', anchor: pin }, ctx(OWNER, false));
  });

  it('restricted + enabled: comment-role may post, view-role may not', async () => {
    const { artifacts, comments } = await seed({
      visibility: 'restricted', commentsEnabled: true,
      allowlist: [
        { value: 'c@x.com', type: 'email', role: 'comment' },
        { value: 'v@x.com', type: 'email', role: 'view' },
      ],
    });
    await createComment(artifacts, comments, 's1', { body: 'ok', anchor: pin }, ctx({ ownerId: 'c', email: 'c@x.com' }));
    await expect(createComment(artifacts, comments, 's1', { body: 'no', anchor: pin }, ctx({ ownerId: 'v', email: 'v@x.com' })))
      .rejects.toMatchObject({ code: 'forbidden' });
    await createComment(artifacts, comments, 's1', { body: 'owner', anchor: pin }, ctx(OWNER));
  });

  it('rejects an over-cap body', async () => {
    const { artifacts, comments } = await seed({ commentsEnabled: true });
    const big = 'a'.repeat(8 * 1024 + 1);
    await expect(createComment(artifacts, comments, 's1', { body: big, anchor: pin }, ctx(OWNER)))
      .rejects.toMatchObject({ code: 'comment_too_large' });
  });

  it('listComments: anyone who can view (public → even anonymous)', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx(OWNER));
    const list = await listComments(artifacts, comments, 's1', ctx(null));
    expect(list).toHaveLength(1);
  });

  it('edit body: author only; delete: author or owner; resolve: owner or comment-access', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    const author = { ownerId: 'rando', email: 'r@x.com' };
    const c = await createComment(artifacts, comments, 's1', { body: 'mine', anchor: pin }, ctx(author));
    await expect(editCommentBody(artifacts, comments, 's1', c.id, 'hax', ctx(OWNER))).rejects.toMatchObject({ code: 'forbidden' });
    await editCommentBody(artifacts, comments, 's1', c.id, 'edited', ctx(author));
    const r = await resolveComment(artifacts, comments, 's1', c.id, true, ctx(OWNER));
    expect(r.resolved).toBe(true);
    expect(await deleteComment(artifacts, comments, 's1', c.id, ctx(OWNER))).toEqual({ ok: true });
  });
});

describe('commentCaps', () => {
  it('owner: can resolve and delete any comment', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    const c = await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx({ ownerId: 'rando', email: 'r@x.com' }));
    const rec = await artifacts.findBySlug('s1');
    expect(commentCaps(rec!, c, ctx(OWNER))).toEqual({ canResolve: true, canDelete: true });
  });

  it('author (non-owner, public): can resolve and delete own comment', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    const author = { ownerId: 'rando', email: 'r@x.com' };
    const c = await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx(author));
    const rec = await artifacts.findBySlug('s1');
    expect(commentCaps(rec!, c, ctx(author))).toEqual({ canResolve: true, canDelete: true });
  });

  it("other commenter (public): can resolve but not delete someone else's comment", async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    const c = await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx({ ownerId: 'a', email: 'a@x.com' }));
    const rec = await artifacts.findBySlug('s1');
    expect(commentCaps(rec!, c, ctx({ ownerId: 'b', email: 'b@x.com' }))).toEqual({ canResolve: true, canDelete: false });
  });

  it('anonymous: cannot resolve or delete', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    const c = await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx(OWNER));
    const rec = await artifacts.findBySlug('s1');
    expect(commentCaps(rec!, c, ctx(null))).toEqual({ canResolve: false, canDelete: false });
  });

  it('restricted view-only role: cannot resolve or delete', async () => {
    const { artifacts, comments } = await seed({
      visibility: 'restricted', commentsEnabled: true,
      allowlist: [{ value: 'v@x.com', type: 'email', role: 'view' }],
    });
    const c = await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx(OWNER));
    const rec = await artifacts.findBySlug('s1');
    expect(commentCaps(rec!, c, ctx({ ownerId: 'v', email: 'v@x.com' }))).toEqual({ canResolve: false, canDelete: false });
  });

  it('password artifact, signed-in but not verified: cannot resolve', async () => {
    const { artifacts, comments } = await seed({ visibility: 'password', commentsEnabled: true, passwordHash: 'h' });
    const c = await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx(OWNER, false));
    const rec = await artifacts.findBySlug('s1');
    expect(commentCaps(rec!, c, ctx({ ownerId: 'rando', email: 'r@x.com' }, false)))
      .toEqual({ canResolve: false, canDelete: false });
  });
});

describe('listCommentsForViewer', () => {
  it('returns each comment with its caps for the viewer', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx({ ownerId: 'rando', email: 'r@x.com' }));
    const rows = await listCommentsForViewer(artifacts, comments, 's1', ctx(OWNER));
    expect(rows).toHaveLength(1);
    expect(rows[0].caps).toEqual({ canResolve: true, canDelete: true });
    expect(rows[0].comment.body).toBe('hi');
  });

  it('rejects when the viewer cannot read the artifact', async () => {
    const { artifacts, comments } = await seed({
      visibility: 'restricted', commentsEnabled: true,
      allowlist: [{ value: 'v@x.com', type: 'email', role: 'view' }],
    });
    await expect(listCommentsForViewer(artifacts, comments, 's1', ctx(null)))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('non-owner third party gets correct caps (can resolve, cannot delete others)', async () => {
    const { artifacts, comments } = await seed({ visibility: 'public', commentsEnabled: true });
    await createComment(artifacts, comments, 's1', { body: 'hi', anchor: pin }, ctx({ ownerId: 'a', email: 'a@x.com' }));
    const rows = await listCommentsForViewer(artifacts, comments, 's1', ctx({ ownerId: 'b', email: 'b@x.com' }));
    expect(rows[0].caps).toEqual({ canResolve: true, canDelete: false });
  });
});
