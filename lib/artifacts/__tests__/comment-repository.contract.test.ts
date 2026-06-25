import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCommentRepository } from '@/lib/artifacts/__tests__/in-memory-comment-repository';
import type { Anchor } from '@/lib/artifacts/comment-types';

const pin: Anchor = { kind: 'pin', x: 0.5, y: 0.25 };

describe('CommentRepository (in-memory contract)', () => {
  let repo: InMemoryCommentRepository;
  beforeEach(() => { repo = new InMemoryCommentRepository(); });

  it('insert + listBySlug returns oldest-first with all fields', async () => {
    const a = await repo.insert({ artifactSlug: 's1', authorId: 'u1', authorEmail: 'a@x.com', body: 'first', anchor: pin });
    const b = await repo.insert({ artifactSlug: 's1', authorId: 'u2', authorEmail: null, body: 'second', anchor: pin });
    await repo.insert({ artifactSlug: 'other', authorId: 'u1', authorEmail: null, body: 'elsewhere', anchor: pin });
    const list = await repo.listBySlug('s1');
    expect(list.map((c) => c.id)).toEqual([a.id, b.id]);
    expect(list[0]).toMatchObject({ artifactSlug: 's1', authorId: 'u1', authorEmail: 'a@x.com', body: 'first', resolved: false, anchor: pin });
    expect(list[1].authorEmail).toBeNull();
  });

  it('updateBody, setResolved, findById', async () => {
    const c = await repo.insert({ artifactSlug: 's1', authorId: 'u1', authorEmail: null, body: 'x', anchor: pin });
    await repo.updateBody(c.id, 'edited');
    await repo.setResolved(c.id, true);
    const got = await repo.findById(c.id);
    expect(got).toMatchObject({ body: 'edited', resolved: true });
  });

  it('deleteById and deleteBySlug', async () => {
    const c = await repo.insert({ artifactSlug: 's1', authorId: 'u1', authorEmail: null, body: 'x', anchor: pin });
    expect(await repo.deleteById(c.id)).toBe(true);
    expect(await repo.findById(c.id)).toBeNull();
    await repo.insert({ artifactSlug: 's2', authorId: 'u1', authorEmail: null, body: 'a', anchor: pin });
    await repo.insert({ artifactSlug: 's2', authorId: 'u1', authorEmail: null, body: 'b', anchor: pin });
    expect(await repo.deleteBySlug('s2')).toBe(2);
    expect(await repo.listBySlug('s2')).toEqual([]);
  });
});
