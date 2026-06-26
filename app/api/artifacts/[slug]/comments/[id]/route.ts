import { cookies } from 'next/headers';
import { getArtifactRepository, getCommentRepository } from '@/lib/db/factory';
import { editCommentBody, resolveComment, deleteComment } from '@/lib/artifacts/comment-service';
import { viewerFromRequest } from '@/lib/http/request-auth';
import { cookieName, verifyPasswordCookie } from '@/lib/http/cookies';
import { errorResponse } from '@/lib/http/errors';
import { readLimitedJson } from '@/lib/http/body';
import { REQUEST_MAX_BYTES } from '@/lib/artifacts/validate';
import { commentToJson } from '@/lib/http/comment-json';

export const runtime = 'nodejs';

async function readContext(req: Request, slug: string) {
  const viewer = await viewerFromRequest(req);
  const jar = await cookies();
  const passwordVerified = verifyPasswordCookie(slug, jar.get(cookieName(slug))?.value);
  return { viewer, passwordVerified };
}

// Edit body (author only) or resolve/unresolve (owner or comment-access) — chosen by the body.
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const { slug, id } = await params;
    const body = await readLimitedJson<{ body?: unknown; resolved?: unknown }>(req, REQUEST_MAX_BYTES);
    const ctx = await readContext(req, slug);
    const artifacts = await getArtifactRepository();
    const comments = await getCommentRepository();
    if (typeof body?.resolved === 'boolean') {
      const c = await resolveComment(artifacts, comments, slug, id, body.resolved, ctx);
      return Response.json({ comment: commentToJson(c) });
    }
    if (typeof body?.body === 'string') {
      const c = await editCommentBody(artifacts, comments, slug, id, body.body, ctx);
      return Response.json({ comment: commentToJson(c) });
    }
    return Response.json({ error: 'invalid_comment', message: 'Provide body or resolved' }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}

// Delete (author or owner).
export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const { slug, id } = await params;
    const ctx = await readContext(req, slug);
    const artifacts = await getArtifactRepository();
    const comments = await getCommentRepository();
    await deleteComment(artifacts, comments, slug, id, ctx);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
