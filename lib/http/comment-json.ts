import type { CommentRecord } from '@/lib/artifacts/comment-types';

/** Snake_case wire shape for a comment (matches the rest of the REST API's casing). */
export function commentToJson(c: CommentRecord) {
  return {
    id: c.id,
    body: c.body,
    anchor: c.anchor,
    author_id: c.authorId,
    author_email: c.authorEmail,
    resolved: c.resolved,
    created_at: c.createdAt.toISOString(),
  };
}
