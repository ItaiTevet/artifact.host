import type { CommentRecord } from '@/lib/artifacts/comment-types';

/** Display name for a commenter — derived from the email local-part. The raw email is never
 *  exposed over the API (privacy); PAT-authored comments (no email) show a generic label. */
export function authorName(email: string | null): string {
  if (!email) return 'API user';
  const local = email.split('@')[0].trim();
  return local || 'User';
}

/** Snake_case wire shape for a comment. Emails and internal author ids are never exposed. */
export function commentToJson(c: CommentRecord) {
  return {
    id: c.id,
    body: c.body,
    anchor: c.anchor,
    author_name: authorName(c.authorEmail),
    resolved: c.resolved,
    created_at: c.createdAt.toISOString(),
  };
}
