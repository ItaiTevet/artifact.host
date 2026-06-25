import type { ArtifactRecord } from '@/lib/artifacts/types';
import type { ArtifactRepository } from '@/lib/artifacts/repository';
import type { CommentRepository } from '@/lib/artifacts/comment-repository';
import type { Anchor, CommentRecord } from '@/lib/artifacts/comment-types';
import { ServiceError } from '@/lib/artifacts/errors';
import { emailAllowed, commentAllowed } from '@/lib/artifacts/sharing';
import { COMMENT_MAX_BYTES } from '@/lib/artifacts/constants';

/** Identity of the caller; null = anonymous. Email present only for session identities. */
export interface Viewer { ownerId: string; email?: string | null }

export interface ReadContext { viewer: Viewer | null; passwordVerified: boolean }

function loadEnabled(record: ArtifactRecord | null): ArtifactRecord {
  if (!record) throw new ServiceError('not_found', 'Artifact not found');
  if (!record.commentsEnabled) throw new ServiceError('comments_disabled', 'Comments are not enabled for this artifact');
  return record;
}

function isOwner(record: ArtifactRecord, viewer: Viewer | null): boolean {
  return !!viewer && !!record.ownerId && viewer.ownerId === record.ownerId;
}

/** Mirror of viewArtifact's gate: can this caller see the artifact at all? */
export function canRead(record: ArtifactRecord, ctx: ReadContext): boolean {
  if (isOwner(record, ctx.viewer)) return true;
  if (record.visibility === 'public') return true;
  if (record.visibility === 'password') return ctx.passwordVerified;
  return emailAllowed(ctx.viewer?.email, record.shareAllowlist); // restricted
}

/** Who may post: signed-in; public/password → any signed-in viewer; restricted → comment role or owner. */
export function canComment(record: ArtifactRecord, viewer: Viewer | null): boolean {
  if (!viewer) return false;
  if (isOwner(record, viewer)) return true;
  if (record.visibility === 'restricted') return commentAllowed(viewer.email, record.shareAllowlist);
  return true; // public / password, signed in
}

export async function listComments(
  artifacts: ArtifactRepository, comments: CommentRepository, slug: string, ctx: ReadContext,
): Promise<CommentRecord[]> {
  const record = loadEnabled(await artifacts.findBySlug(slug));
  if (!canRead(record, ctx)) throw new ServiceError('forbidden', 'Not authorized to view this artifact');
  return comments.listBySlug(slug);
}

export async function createComment(
  artifacts: ArtifactRepository, comments: CommentRepository, slug: string,
  input: { body: string; anchor: Anchor }, viewer: Viewer | null,
): Promise<CommentRecord> {
  const record = loadEnabled(await artifacts.findBySlug(slug));
  if (!canComment(record, viewer)) throw new ServiceError('forbidden', 'Not authorized to comment');
  const body = input.body.trim();
  if (!body) throw new ServiceError('invalid_comment', 'Comment body is empty');
  if (Buffer.byteLength(body, 'utf8') > COMMENT_MAX_BYTES) {
    throw new ServiceError('comment_too_large', 'Comment is too large');
  }
  return comments.insert({
    artifactSlug: slug, authorId: viewer!.ownerId, authorEmail: viewer!.email ?? null, body, anchor: input.anchor,
  });
}

async function loadOwned(
  artifacts: ArtifactRepository, comments: CommentRepository, slug: string, id: string,
): Promise<{ record: ArtifactRecord; comment: CommentRecord }> {
  const record = loadEnabled(await artifacts.findBySlug(slug));
  const comment = await comments.findById(id);
  if (!comment || comment.artifactSlug !== slug) throw new ServiceError('not_found', 'Comment not found');
  return { record, comment };
}

export async function editCommentBody(
  artifacts: ArtifactRepository, comments: CommentRepository, slug: string, id: string, body: string, viewer: Viewer | null,
): Promise<CommentRecord> {
  const { comment } = await loadOwned(artifacts, comments, slug, id);
  if (!viewer || viewer.ownerId !== comment.authorId) throw new ServiceError('forbidden', 'Only the author can edit');
  const next = body.trim();
  if (!next) throw new ServiceError('invalid_comment', 'Comment body is empty');
  if (Buffer.byteLength(next, 'utf8') > COMMENT_MAX_BYTES) throw new ServiceError('comment_too_large', 'Comment is too large');
  return comments.updateBody(id, next);
}

export async function resolveComment(
  artifacts: ArtifactRepository, comments: CommentRepository, slug: string, id: string, resolved: boolean, viewer: Viewer | null,
): Promise<CommentRecord> {
  const { record } = await loadOwned(artifacts, comments, slug, id);
  if (!(isOwner(record, viewer) || canComment(record, viewer))) {
    throw new ServiceError('forbidden', 'Not authorized to resolve');
  }
  return comments.setResolved(id, resolved);
}

export async function deleteComment(
  artifacts: ArtifactRepository, comments: CommentRepository, slug: string, id: string, viewer: Viewer | null,
): Promise<{ ok: true }> {
  const { record, comment } = await loadOwned(artifacts, comments, slug, id);
  const isAuthor = !!viewer && viewer.ownerId === comment.authorId;
  if (!isAuthor && !isOwner(record, viewer)) throw new ServiceError('forbidden', 'Not authorized to delete');
  await comments.deleteById(id);
  return { ok: true };
}
