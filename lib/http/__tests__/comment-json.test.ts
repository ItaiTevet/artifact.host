import { describe, it, expect } from 'vitest';
import { authorName, commentToJson } from '@/lib/http/comment-json';
import type { CommentRecord } from '@/lib/artifacts/comment-types';

describe('authorName', () => {
  it('uses the email local-part', () => {
    expect(authorName('alice@example.com')).toBe('alice');
  });
  it('falls back for PAT authors (no email)', () => {
    expect(authorName(null)).toBe('API user');
  });
});

describe('commentToJson', () => {
  it('never exposes email or internal author id', () => {
    const rec: CommentRecord = {
      id: 'c1', artifactSlug: 's1', authorId: 'owner-uuid', authorEmail: 'alice@example.com',
      body: 'hi', anchor: { kind: 'pin', path: [0], context: '' }, resolved: false, createdAt: new Date('2026-06-26T00:00:00Z'),
    };
    const json = commentToJson(rec);
    expect(json).toEqual({
      id: 'c1', body: 'hi', anchor: { kind: 'pin', path: [0], context: '' },
      author_name: 'alice', resolved: false, created_at: '2026-06-26T00:00:00.000Z',
    });
    expect(JSON.stringify(json)).not.toContain('alice@example.com');
    expect(JSON.stringify(json)).not.toContain('owner-uuid');
  });
});

describe('commentToJson capability flags', () => {
  const rec: CommentRecord = {
    id: 'c1', artifactSlug: 's1', authorId: 'owner-uuid', authorEmail: 'alice@example.com',
    body: 'hi', anchor: { kind: 'pin', path: [0], context: '' }, resolved: false, createdAt: new Date('2026-06-26T00:00:00Z'),
  };
  it('omits caps when none provided (back-compat)', () => {
    expect(commentToJson(rec)).not.toHaveProperty('can_resolve');
  });
  it('includes caps when provided, still no email/id', () => {
    const json = commentToJson(rec, { canResolve: true, canDelete: false, canEdit: false });
    expect(json).toMatchObject({ can_resolve: true, can_delete: false });
    expect(JSON.stringify(json)).not.toContain('alice@example.com');
    expect(JSON.stringify(json)).not.toContain('owner-uuid');
  });
  it('includes can_edit', () => {
    const json = commentToJson(rec, { canResolve: true, canDelete: true, canEdit: true });
    expect((json as { can_edit?: boolean }).can_edit).toBe(true);
  });
});
